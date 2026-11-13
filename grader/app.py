"""The grader: a small Celery app with no Django and no database access.

It consumes grading jobs from the "grading" queue, runs each one in a fresh
sandbox container (sandbox_runner.py), and reports back by sending the
bookkeeping tasks on the "results" queue, which the Django-side worker
consumes. The queues are its only link to the rest of the system: it holds
no database credentials and no Django secret key, so even a compromised
grader cannot read or change learner data.
"""

import logging
import os
import traceback
from urllib.parse import quote

from celery import Celery
from celery.signals import worker_ready

import sandbox_runner

logger = logging.getLogger(__name__)

GRADING_QUEUE = "grading"
RESULTS_QUEUE = "results"

_password = os.environ.get("REDIS_PASSWORD", "")
_auth = f":{quote(_password, safe='')}@" if _password else ""
app = Celery(
    "grader",
    broker=(
        f"redis://{_auth}{os.environ.get('REDIS_HOST', '127.0.0.1')}"
        f":{os.environ.get('REDIS_PORT', '6379')}/0"
    ),
)
app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_ignore_result=True,
    task_default_queue=GRADING_QUEUE,
    worker_prefetch_multiplier=1,
    # Early acknowledgement on purpose: a poisonous job that crashes the
    # worker must not come back and crash it again. The web side notices
    # submissions that never got a result and marks them as errors.
    task_acks_late=False,
    task_soft_time_limit=45,
    task_time_limit=60,
    broker_connection_retry_on_startup=True,
)


def _report(task_name, args):
    app.send_task(task_name, args=args, queue=RESULTS_QUEUE)


@app.task(name="grader.run_submission")
def run_submission(submission_id, job):
    """Run one submission's job in a sandbox and send the outcome back."""
    sandbox_runner.sweep_leftovers()
    _report("grading.mark_running", [submission_id])
    try:
        result = sandbox_runner.run_in_sandbox(job)
    except sandbox_runner.SandboxFailure as exc:
        result = {"status": "error", "internal_error": f"sandbox failure: {exc}"}
    except Exception:
        result = {"status": "error", "internal_error": "grader crashed:\n" + traceback.format_exc()[-4000:]}
    _report("grading.save_result", [submission_id, result])


@worker_ready.connect
def _on_ready(**kwargs):
    sandbox_runner.check_image()
    logger.info("Sandbox image %s present.", sandbox_runner.IMAGE)
    sandbox_runner.sweep_leftovers()
