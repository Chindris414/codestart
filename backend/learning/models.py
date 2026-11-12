from django.conf import settings
from django.db import models


class Track(models.Model):
    """A full learning path, e.g. "Python Fundamentals"."""

    slug = models.SlugField(unique=True)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_published = models.BooleanField(
        default=False, help_text="Unpublished tracks are hidden from learners."
    )
    enforce_module_order = models.BooleanField(
        default=True, help_text="When on, learners unlock modules in order."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title"]

    def __str__(self):
        return self.title


class Module(models.Model):
    """One topic inside a track, e.g. "Loops", with its lessons and a quiz."""

    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name="modules")
    slug = models.SlugField()
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(
        help_text="Position inside the track, starting at 1. Ties are broken by id."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # `order` is a sort key only: it is deliberately not unique, so modules
        # can be renumbered in the admin without tripping over each other.
        ordering = ["track", "order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["track", "slug"], name="unique_module_slug_per_track"),
        ]

    def __str__(self):
        return f"{self.track.title} · {self.order}. {self.title}"


class Lesson(models.Model):
    """A short lesson: explanation first, then something the learner does."""

    class Type(models.TextChoices):
        CONCEPT = "concept", "Concept"
        EXERCISE = "exercise", "Exercise"
        QUIZ = "quiz", "Quiz"
        PROJECT = "project", "Project"

    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="lessons")
    slug = models.SlugField()
    title = models.CharField(max_length=200)
    lesson_type = models.CharField(max_length=20, choices=Type.choices, default=Type.CONCEPT)
    body = models.TextField(blank=True, help_text="Lesson text in Markdown.")
    order = models.PositiveIntegerField(
        help_text="Position inside the module, starting at 1. Ties are broken by id."
    )
    estimated_minutes = models.PositiveIntegerField(
        default=5, help_text="Rough reading and practice time shown to learners."
    )
    is_sample = models.BooleanField(
        default=False,
        help_text="Sample lessons are readable without an account (track must still be published).",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # `order` is a sort key only, not unique: see the note on Module.
        ordering = ["module", "order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["module", "slug"], name="unique_lesson_slug_per_module"),
        ]

    def __str__(self):
        return f"{self.module.title} · {self.order}. {self.title}"


class Exercise(models.Model):
    """A coding task inside a lesson, with starter code, solution and tests."""

    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name="exercises")
    slug = models.SlugField()
    title = models.CharField(max_length=200)
    instructions = models.TextField(blank=True, help_text="Task description in Markdown.")
    starter_code = models.TextField(blank=True, help_text="Code the learner starts from.")
    solution_code = models.TextField(blank=True, help_text="Reference solution. Never shown to learners.")
    visible_tests = models.TextField(
        blank=True, help_text="Pytest tests the learner can read."
    )
    hidden_tests = models.TextField(
        blank=True, help_text="Pytest tests run on submit but never shown."
    )
    order = models.PositiveIntegerField(
        default=1, help_text="Position inside the lesson, starting at 1."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["lesson", "order"]
        constraints = [
            models.UniqueConstraint(fields=["lesson", "slug"], name="unique_exercise_slug_per_lesson"),
            models.UniqueConstraint(fields=["lesson", "order"], name="unique_exercise_order_per_lesson"),
        ]

    def __str__(self):
        return f"{self.lesson.title} · {self.title}"


class ExerciseDraft(models.Model):
    """A learner's autosaved code for one exercise.

    Learner data, not content: content tables above are loaded from the Git
    repo, while this table is written by the app as learners type. One row per
    learner and exercise; "no row" means the learner starts from the starter
    code. updated_at doubles as the "newest wins" timestamp when drafts made
    in the browser before signing up are imported at login.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="exercise_drafts"
    )
    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE, related_name="drafts")
    code = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "exercise"], name="unique_draft_per_user_exercise"),
        ]

    def __str__(self):
        return f"{self.user} · {self.exercise}"


class LessonProgress(models.Model):
    """How far a learner has got with one lesson.

    "Not started" is the absence of a row, so the three states of the spec are
    this model's two values plus nothing. Until server grading exists
    (Phase 3), COMPLETED is set by the learner pressing "Mark lesson
    complete"; exercise lessons will later complete on a passing submit
    instead.
    """

    class State(models.TextChoices):
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="lesson_progress"
    )
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name="progress")
    state = models.CharField(max_length=20, choices=State.choices, default=State.IN_PROGRESS)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    # Last time the learner opened, edited or completed this lesson: the
    # "Continue where you left off" button follows the newest one.
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "lesson"], name="unique_progress_per_user_lesson"),
        ]
        verbose_name_plural = "lesson progress"

    def __str__(self):
        return f"{self.user} · {self.lesson} · {self.state}"


class ActivityDay(models.Model):
    """One row per calendar day a learner did something, for the streak.

    Storing the days themselves (rather than a counter) means the streak can
    always be recomputed, and a missed day can never corrupt it. Days are
    calendar days in the project's TIME_ZONE (Europe/Bucharest).
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="activity_days"
    )
    date = models.DateField()

    class Meta:
        ordering = ["-date"]
        constraints = [
            models.UniqueConstraint(fields=["user", "date"], name="unique_activity_day_per_user"),
        ]

    def __str__(self):
        return f"{self.user} · {self.date}"
