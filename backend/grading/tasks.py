"""Bookkeeping tasks the grader calls back on the "results" queue.

They run in this project's Celery worker, which has database access but
never runs learner code. Both tasks only move a submission forward
(queued -> running -> finished) and never touch one that is already
finished, so a repeated or late message is harmless.
"""

import logging
import uuid

from celery import shared_task
from django.db import DatabaseError
from django.db.models import Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from .models import Submission
from .results import OUR_FAULT_SUMMARY, clean_result

logger = logging.getLogger(__name__)


def _parse_id(submission_id):
    try:
        return uuid.UUID(str(submission_id))
    except ValueError:
        logger.warning("Ignoring grading message with a bad submission id: %r", submission_id)
        return None


@shared_task(name="grading.mark_running")
def mark_running(submission_id):
    """The grader has picked the submission up and is starting the sandbox."""
    sid = _parse_id(submission_id)
    if sid is None:
        return
    Submission.objects.filter(id=sid, status=Submission.Status.QUEUED).update(
        status=Submission.Status.RUNNING, started_at=timezone.now()
    )


@shared_task(name="grading.save_result")
def save_result(submission_id, result):
    """Store the grader's report for a submission that is still waiting."""
    sid = _parse_id(submission_id)
    if sid is None:
        return
    status, results, internal_error = clean_result(result)
    now = timezone.now()
    waiting = Submission.objects.filter(id=sid, status__in=Submission.ACTIVE_STATUSES)
    try:
        updated = waiting.update(
            status=status,
            results=results,
            internal_error=internal_error,
            started_at=Coalesce("started_at", Value(now)),
            finished_at=now,
        )
    except DatabaseError as exc:
        # Whatever the report contained, never leave the learner waiting.
        logger.exception("Could not store the result of submission %s", sid)
        updated = waiting.update(
            status=Submission.Status.ERROR,
            results={"summary": OUR_FAULT_SUMMARY},
            internal_error=f"could not store the grader report: {type(exc).__name__}",
            started_at=Coalesce("started_at", Value(now)),
            finished_at=now,
        )
    if not updated:
        logger.info("Result for submission %s ignored: unknown or already finished.", sid)
