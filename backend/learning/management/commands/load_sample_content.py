"""Loads a small made-up track so the admin has something to look at.

This is throwaway demo content, not real course material. Run it with:

    python manage.py load_sample_content

It is safe to run twice: everything is matched on its slug and updated in
place. Pass --delete to remove the sample track again.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from learning.models import Exercise, Lesson, Module, Track

TRACK_SLUG = "sample-python"


class Command(BaseCommand):
    help = "Create (or refresh) a small sample track for looking at in the admin."

    def add_arguments(self, parser):
        parser.add_argument(
            "--delete",
            action="store_true",
            help="Delete the sample track instead of creating it.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options["delete"]:
            deleted, _ = Track.objects.filter(slug=TRACK_SLUG).delete()
            if deleted:
                self.stdout.write(self.style.SUCCESS("Sample track deleted."))
            else:
                self.stdout.write("No sample track found, nothing to delete.")
            return

        track, created = Track.objects.update_or_create(
            slug=TRACK_SLUG,
            defaults={
                "title": "Sample Python Track",
                "description": (
                    "Made-up content for trying out the admin. "
                    "Delete it before real lessons are imported."
                ),
                "is_published": False,
            },
        )

        module, _ = Module.objects.update_or_create(
            track=track,
            slug="getting-started",
            defaults={
                "title": "Getting started",
                "description": "Printing text and storing your first values.",
                "order": 1,
            },
        )

        Lesson.objects.update_or_create(
            module=module,
            slug="your-first-line",
            defaults={
                "title": "Your first line of code",
                "lesson_type": Lesson.Type.CONCEPT,
                "order": 1,
                "estimated_minutes": 3,
                "body": (
                    "# Your first line of code\n\n"
                    "`print()` shows text on the screen. The text goes inside the "
                    "brackets, wrapped in quotes:\n\n"
                    "```python\nprint(\"Hello!\")\n```\n\n"
                    "Try changing the words between the quotes and running it again.\n"
                ),
            },
        )

        exercise_lesson, _ = Lesson.objects.update_or_create(
            module=module,
            slug="say-hello",
            defaults={
                "title": "Practice: say hello",
                "lesson_type": Lesson.Type.EXERCISE,
                "order": 2,
                "estimated_minutes": 5,
                "body": (
                    "# Practice: say hello\n\n"
                    "Now it is your turn. Use `print()` to greet the world.\n"
                ),
            },
        )

        Exercise.objects.update_or_create(
            lesson=exercise_lesson,
            slug="print-hello-world",
            defaults={
                "title": "Print Hello, world!",
                "order": 1,
                "instructions": (
                    "Print the exact text `Hello, world!` — capital H, "
                    "comma, exclamation mark."
                ),
                "starter_code": "# Write your print() below\n",
                "solution_code": 'print("Hello, world!")\n',
                "visible_tests": (
                    "def test_greets_the_world(run):\n"
                    '    assert run().output.strip() == "Hello, world!"\n'
                ),
                "hidden_tests": (
                    "def test_uses_print(source):\n"
                    '    assert "print" in source\n'
                ),
            },
        )

        verb = "Created" if created else "Refreshed"
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb} sample track '{track.title}' "
                f"(1 module, 2 lessons, 1 exercise)."
            )
        )
