from django.conf import settings
from django.db import models
import uuid


class Submission(models.Model):
    """One press of Submit: a learner's code, checked on the server.

    Learner data, written by the app. The web process only creates the row
    (status QUEUED); the Celery worker on the "results" queue moves it to
    RUNNING and then to a final state. The grader that runs the sandbox has
    no database access at all.

    `results` is what the learner may see, so it must never contain hidden
    test source, solution code or server details. `internal_error` is for
    the admin only and is never sent to the browser.
    """

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        PASSED = "passed", "Passed"  # every check passed
        FAILED = "failed", "Failed"  # the learner's code did not pass (incl. time-outs)
        ERROR = "error", "Error"  # something broke on our side, not the learner's fault

    ACTIVE_STATUSES = (Status.QUEUED, Status.RUNNING)

    # Random rather than sequential, so submission URLs cannot be guessed or
    # counted. Ownership is still checked on every read.
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="submissions"
    )
    exercise = models.ForeignKey(
        "learning.Exercise", on_delete=models.CASCADE, related_name="submissions"
    )
    code = models.TextField(help_text="Exactly the code that was submitted.")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)
    results = models.JSONField(
        default=dict,
        blank=True,
        help_text="Learner-safe outcome: checks, messages, capped output.",
    )
    internal_error = models.TextField(
        blank=True, help_text="Server-side details of an error. Never shown to learners."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            # "My latest submissions for this exercise".
            models.Index(fields=["user", "exercise", "-created_at"], name="submission_user_ex_recent"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=["queued", "running", "passed", "failed", "error"]),
                name="submission_status_valid",
            ),
            # At most one submission per learner waiting or being checked at
            # a time. Enforced by the database, so two quick clicks cannot
            # both get through.
            models.UniqueConstraint(
                fields=["user"],
                condition=models.Q(status__in=["queued", "running"]),
                name="one_active_submission_per_user",
            ),
        ]

    def __str__(self):
        return f"{self.user} · {self.exercise} · {self.status}"

    @property
    def is_finished(self):
        return self.status not in self.ACTIVE_STATUSES
