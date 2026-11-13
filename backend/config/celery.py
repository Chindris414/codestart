"""Celery app for the Django side of grading.

This app only ever runs the small bookkeeping tasks in grading.tasks, which
mark a submission as running and save its result. They consume the
"results" queue. Learner code is never run here: the separate grader
service (no Django, no database access) takes jobs from the "grading" queue
and runs them in a throwaway sandbox container.
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("codestart")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
