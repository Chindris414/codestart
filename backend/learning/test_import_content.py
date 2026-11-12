"""Tests for the import_content management command."""

import tempfile
from io import StringIO
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from .models import Exercise, Lesson, Module, Track

REPO_CONTENT = Path(__file__).resolve().parents[2] / "content" / "python-fundamentals"


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def build_tree(root):
    """A two-module track with one exercise lesson, in the documented layout."""
    track = root / "python-basics"
    write(track / "track.md", "---\ntitle: Python Basics\ndescription: Start here.\npublished: true\n---\n")
    write(track / "01-intro" / "module.md", "---\ntitle: Intro\n---\nFirst steps.\n")
    write(
        track / "01-intro" / "01-hello.md",
        "---\ntitle: Hello\ntype: concept\nminutes: 3\n---\n# Hello\n\nSay hi.\n",
    )
    write(
        track / "01-intro" / "02-practice.md",
        "---\ntitle: Practice\ntype: exercise\n---\nYour turn.\n",
    )
    ex = track / "01-intro" / "02-practice" / "print-hi"
    write(ex / "exercise.md", "---\ntitle: Print hi\n---\nPrint `hi`.\n")
    write(ex / "starter.py", "# start\n")
    write(ex / "solution.py", "print('hi')\n")
    write(ex / "test_visible.py", "def test_visible(): ...\n")
    write(ex / "test_hidden.py", "def test_hidden(): ...\n")
    write(track / "02-loops" / "module.md", "---\ntitle: Loops\n---\n")
    write(track / "02-loops" / "01-for.md", "---\ntitle: For loops\n---\nLoop.\n")
    return track


def run_import(path, *flags):
    out = StringIO()
    call_command("import_content", str(path), *flags, stdout=out, verbosity=2)
    return out.getvalue()


def counts():
    return (Track.objects.count(), Module.objects.count(), Lesson.objects.count(), Exercise.objects.count())


class ImportContentTests(TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.track_dir = build_tree(self.root)

    def tearDown(self):
        self._tmp.cleanup()

    def test_imports_the_whole_tree(self):
        run_import(self.track_dir)

        track = Track.objects.get(slug="python-basics")
        self.assertEqual(track.title, "Python Basics")
        self.assertEqual(track.description, "Start here.")
        self.assertTrue(track.is_published)

        intro, loops = track.modules.all()
        self.assertEqual((intro.slug, intro.order, intro.description), ("intro", 1, "First steps."))
        self.assertEqual((loops.slug, loops.order), ("loops", 2))

        hello, practice = intro.lessons.all()
        self.assertEqual(hello.lesson_type, Lesson.Type.CONCEPT)
        self.assertEqual(hello.estimated_minutes, 3)
        self.assertEqual(hello.body, "# Hello\n\nSay hi.\n")
        self.assertEqual(practice.lesson_type, Lesson.Type.EXERCISE)
        self.assertEqual(practice.estimated_minutes, 5)

        exercise = practice.exercises.get()
        self.assertEqual(exercise.slug, "print-hi")
        self.assertEqual(exercise.title, "Print hi")
        self.assertEqual(exercise.instructions, "Print `hi`.")
        self.assertEqual(exercise.starter_code, "# start\n")
        self.assertEqual(exercise.solution_code, "print('hi')\n")
        self.assertEqual(exercise.visible_tests, "def test_visible(): ...\n")
        self.assertEqual(exercise.hidden_tests, "def test_hidden(): ...\n")
        self.assertEqual(exercise.order, 1)

    def test_second_run_changes_nothing(self):
        run_import(self.track_dir)
        before = counts()
        stamps = {
            (type(o).__name__, o.pk): o.updated_at
            for model in (Track, Module, Lesson, Exercise)
            for o in model.objects.all()
        }

        out = run_import(self.track_dir)

        self.assertEqual(counts(), before)
        after = {
            (type(o).__name__, o.pk): o.updated_at
            for model in (Track, Module, Lesson, Exercise)
            for o in model.objects.all()
        }
        self.assertEqual(after, stamps)
        self.assertIn("0 created, 0 updated, 7 unchanged", out)

    def test_edits_update_rows_in_place(self):
        run_import(self.track_dir)
        lesson_pk = Lesson.objects.get(slug="hello").pk

        write(self.track_dir / "01-intro" / "01-hello.md", "---\ntitle: Hello again\nminutes: 9\n---\nNew body.\n")
        out = run_import(self.track_dir)

        lesson = Lesson.objects.get(pk=lesson_pk)
        self.assertEqual((lesson.title, lesson.estimated_minutes, lesson.body), ("Hello again", 9, "New body.\n"))
        self.assertIn("1 updated", out)
        self.assertEqual(Lesson.objects.filter(module__slug="intro").count(), 2)

    def test_renumbering_keeps_the_same_row(self):
        run_import(self.track_dir)
        lesson_pk = Lesson.objects.get(slug="hello").pk

        (self.track_dir / "01-intro" / "01-hello.md").rename(self.track_dir / "01-intro" / "05-hello.md")
        run_import(self.track_dir)

        lesson = Lesson.objects.get(pk=lesson_pk)
        self.assertEqual((lesson.slug, lesson.order), ("hello", 5))
        self.assertEqual(Lesson.objects.filter(slug="hello").count(), 1)

    def test_exercises_can_swap_order(self):
        ex_dir = self.track_dir / "01-intro" / "02-practice"
        write(ex_dir / "a-first" / "starter.py", "a\n")
        write(ex_dir / "b-second" / "starter.py", "b\n")
        run_import(self.track_dir)
        self.assertEqual(
            list(Exercise.objects.filter(lesson__slug="practice").values_list("slug", "order")),
            [("a-first", 1), ("b-second", 2), ("print-hi", 3)],
        )

        (ex_dir / "a-first").rename(ex_dir / "z-first")
        run_import(self.track_dir)

        # The row for the old folder name is kept (nothing is deleted) but
        # parked at the end so it cannot block the orders the live rows need.
        self.assertEqual(
            list(Exercise.objects.filter(lesson__slug="practice").values_list("slug", "order")),
            [("b-second", 1), ("print-hi", 2), ("z-first", 3), ("a-first", 10_001)],
        )
        self.assertEqual(Exercise.objects.count(), 4)

    def test_dry_run_writes_nothing_but_reports(self):
        out = run_import(self.track_dir, "--dry-run")

        self.assertEqual(counts(), (0, 0, 0, 0))
        self.assertIn("Dry run", out)
        self.assertIn("7 created", out)

    def test_rows_missing_on_disk_are_kept_and_reported(self):
        run_import(self.track_dir)
        (self.track_dir / "02-loops" / "01-for.md").unlink()

        out = run_import(self.track_dir)

        self.assertTrue(Lesson.objects.filter(slug="for").exists())
        self.assertIn("not on disk", out)
        self.assertIn("for", out)

    def test_bad_file_leaves_database_untouched(self):
        run_import(self.track_dir)
        write(self.track_dir / "02-loops" / "02-while.md", "---\ntype: concept\n---\nNo title here.\n")
        write(self.track_dir / "02-loops" / "01-for.md", "---\ntitle: Changed\n---\n")

        with self.assertRaisesMessage(CommandError, "needs a 'title'"):
            run_import(self.track_dir)

        self.assertEqual(Lesson.objects.get(slug="for").title, "For loops")
        self.assertFalse(Lesson.objects.filter(slug="while").exists())

    def test_validation_errors_name_the_file(self):
        cases = {
            "01-intro/03-bad.md": ("---\ntitle: X\ntype: video\n---\n", "unknown type"),
            "01-intro/nodash.md": ("---\ntitle: X\n---\n", "must start with a number"),
            "01-intro/04-yaml.md": ("---\ntitle: [oops\n---\n", "invalid YAML"),
            "01-intro/05-plain.md": ("Just text\n", "must start with a '---'"),
        }
        for rel, (text, message) in cases.items():
            with self.subTest(rel):
                path = self.track_dir / rel
                write(path, text)
                with self.assertRaisesMessage(CommandError, message) as ctx:
                    run_import(self.track_dir)
                self.assertIn(rel.split("/")[-1], str(ctx.exception))
                path.unlink()

    def test_sample_front_matter_sets_and_clears_is_sample(self):
        write(
            self.track_dir / "01-intro" / "01-hello.md",
            "---\ntitle: Hello\nsample: true\n---\nSay hi.\n",
        )
        run_import(self.track_dir)
        self.assertTrue(Lesson.objects.get(slug="hello").is_sample)
        # The other lessons default to not-a-sample.
        self.assertFalse(Lesson.objects.get(slug="practice").is_sample)

        # Removing the line puts the lesson back behind the login wall.
        write(self.track_dir / "01-intro" / "01-hello.md", "---\ntitle: Hello\n---\nSay hi.\n")
        run_import(self.track_dir)
        self.assertFalse(Lesson.objects.get(slug="hello").is_sample)

    def test_sample_must_be_a_boolean(self):
        write(
            self.track_dir / "01-intro" / "01-hello.md",
            "---\ntitle: Hello\nsample: yes please\n---\n",
        )
        with self.assertRaisesMessage(CommandError, "'sample' must be true or false") as ctx:
            run_import(self.track_dir)
        self.assertIn("01-hello.md", str(ctx.exception))

    def test_stray_folder_without_lesson_is_an_error(self):
        write(self.track_dir / "01-intro" / "03-typo" / "ex" / "starter.py", "x\n")
        with self.assertRaisesMessage(CommandError, "no matching lesson file"):
            run_import(self.track_dir)

    def test_missing_track_md_is_an_error(self):
        with self.assertRaisesMessage(CommandError, "no track.md"):
            run_import(self.root)

    def test_does_not_touch_other_tracks(self):
        other = Track.objects.create(slug="other", title="Other")
        Module.objects.create(track=other, slug="m", title="M", order=1)
        run_import(self.track_dir)
        self.assertEqual(Track.objects.get(slug="other").modules.count(), 1)


class RepoContentTests(TestCase):
    """The real content folder in the repo must import cleanly and idempotently."""

    def test_python_fundamentals_imports_twice_without_changes(self):
        self.assertTrue(REPO_CONTENT.is_dir(), f"missing {REPO_CONTENT}")
        run_import(REPO_CONTENT)
        track = Track.objects.get(slug="python-fundamentals")
        self.assertTrue(track.is_published)
        self.assertEqual(track.modules.count(), 2)
        self.assertEqual(Lesson.objects.filter(module__track=track).count(), 13)
        self.assertEqual(Exercise.objects.filter(lesson__module__track=track).count(), 24)
        # The first lesson is the free sample of the "First visit" journey.
        self.assertTrue(Lesson.objects.get(slug="your-first-line").is_sample)
        self.assertFalse(Lesson.objects.get(slug="say-hello").is_sample)

        out = run_import(REPO_CONTENT)
        self.assertIn("0 created, 0 updated, 40 unchanged", out)
