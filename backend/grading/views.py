"""Submit code for grading, and read back your own submissions.

Same rules as the draft endpoints: every view requires a logged-in user and
only ever reads request.user's own rows. Someone else's submission is a
plain 404, so its existence is not revealed either. Exercises are looked up
through their published track.

What goes back to the browser is the submission's status and its
learner-safe `results`. Never the exercise's tests or solution, and never
`internal_error`. This round sends only the visible tests to the grader.
"""

import logging
from datetime import timedelta

from celery import current_app
from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods

from learning.draft_views import _code_error, _find_exercise, _json_body, _login_required
from learning.progress import touch_lesson

from .models import Submission
from .results import OUR_FAULT_SUMMARY

logger = logging.getLogger(__name__)

# A submission still waiting after this long has been lost somewhere (the
# grader died, the queue was flushed): tell the learner instead of making
# them wait forever, and free them to submit again.
STALE_AFTER = timedelta(minutes=2)

# The whole sandbox run, all checks together. Each run of the program gets
# the exercise's own time_limit_s.
TOTAL_SECONDS = 15
OUTPUT_CHARS = 10_000
RECENT_LIMIT = 10


def _expire_stale(user):
    """Mark this learner's long-lost submissions as errors."""
    Submission.objects.filter(
        user=user,
        status__in=Submission.ACTIVE_STATUSES,
        created_at__lt=timezone.now() - STALE_AFTER,
    ).update(
        status=Submission.Status.ERROR,
        results={"summary": OUR_FAULT_SUMMARY},
        internal_error=f"no result within {STALE_AFTER}",
        finished_at=timezone.now(),
    )


def _submission_data(submission, include_code=False):
    exercise = submission.exercise
    data = {
        "id": str(submission.id),
        "exercise": exercise.slug,
        "lesson": "/".join(
            [exercise.lesson.module.track.slug, exercise.lesson.module.slug, exercise.lesson.slug]
        ),
        "status": submission.status,
        "is_finished": submission.is_finished,
        "created_at": submission.created_at.isoformat(),
        "started_at": submission.started_at.isoformat() if submission.started_at else None,
        "finished_at": submission.finished_at.isoformat() if submission.finished_at else None,
        "results": submission.results,
    }
    if include_code:
        data["code"] = submission.code
    return data


def _grading_job(exercise, code):
    return {
        "code": code,
        "files": [{"name": "test_visible.py", "source": exercise.visible_tests, "visible": True}],
        "limits": {
            "run_seconds": exercise.time_limit_s,
            "total_seconds": TOTAL_SECONDS,
            "output_chars": OUTPUT_CHARS,
        },
    }


def _enqueue(submission_id, job):
    """Hand the job to the grader; if the queue is unreachable, say so at once."""
    try:
        current_app.send_task(
            "grader.run_submission",
            args=[str(submission_id), job],
            queue=settings.GRADING_QUEUE,
            retry=True,
            retry_policy={"max_retries": 2, "interval_start": 0, "interval_step": 0.5},
        )
    except Exception:
        logger.exception("Could not queue submission %s", submission_id)
        Submission.objects.filter(id=submission_id, status=Submission.Status.QUEUED).update(
            status=Submission.Status.ERROR,
            results={"summary": OUR_FAULT_SUMMARY},
            internal_error="could not reach the grading queue",
            finished_at=timezone.now(),
        )


def _queryset():
    return Submission.objects.select_related(
        "exercise__lesson__module__track"
    )


@require_http_methods(["GET", "POST"])
def exercise_submissions(request, track_slug, module_slug, lesson_slug, exercise_slug):
    """Submit code (POST) or list your recent submissions (GET) for one exercise."""
    denied = _login_required(request)
    if denied:
        return denied

    exercise = _find_exercise(track_slug, module_slug, lesson_slug, exercise_slug)
    if exercise is None:
        return JsonResponse({"error": "Not found."}, status=404)

    _expire_stale(request.user)

    if request.method == "GET":
        recent = _queryset().filter(user=request.user, exercise=exercise)[:RECENT_LIMIT]
        return JsonResponse({"submissions": [_submission_data(s) for s in recent]})

    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON."}, status=400)
    error = _code_error(data.get("code"))
    if error:
        return JsonResponse({"error": error}, status=400)
    if not exercise.visible_tests.strip():
        return JsonResponse({"error": "This exercise has no checks yet."}, status=400)

    try:
        with transaction.atomic():
            submission = Submission.objects.create(
                user=request.user, exercise=exercise, code=data["code"]
            )
    except IntegrityError:
        # The database allows one waiting submission per learner.
        active = Submission.objects.filter(
            user=request.user, status__in=Submission.ACTIVE_STATUSES
        ).first()
        return JsonResponse(
            {
                "error": "Your last submission is still being checked. Please wait for its result.",
                "active_submission": str(active.id) if active else None,
            },
            status=409,
        )

    job = _grading_job(exercise, data["code"])
    # Only once the row is really saved, so the grader's answer always finds it.
    transaction.on_commit(lambda: _enqueue(submission.id, job))
    touch_lesson(request.user, exercise.lesson)

    return JsonResponse(
        {
            "id": str(submission.id),
            "status": submission.status,
            "created_at": submission.created_at.isoformat(),
        },
        status=202,
    )


@require_GET
def my_submission(request, submission_id):
    """Status and results of one of your own submissions."""
    denied = _login_required(request)
    if denied:
        return denied
    _expire_stale(request.user)
    submission = get_object_or_404(_queryset(), id=submission_id, user=request.user)
    return JsonResponse({"submission": _submission_data(submission, include_code=True)})
