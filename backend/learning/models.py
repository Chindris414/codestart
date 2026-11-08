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
    order = models.PositiveIntegerField(help_text="Position inside the track, starting at 1.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["track", "order"]
        constraints = [
            models.UniqueConstraint(fields=["track", "slug"], name="unique_module_slug_per_track"),
            models.UniqueConstraint(fields=["track", "order"], name="unique_module_order_per_track"),
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
    order = models.PositiveIntegerField(help_text="Position inside the module, starting at 1.")
    estimated_minutes = models.PositiveIntegerField(
        default=5, help_text="Rough reading and practice time shown to learners."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["module", "order"]
        constraints = [
            models.UniqueConstraint(fields=["module", "slug"], name="unique_lesson_slug_per_module"),
            models.UniqueConstraint(fields=["module", "order"], name="unique_lesson_order_per_module"),
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
