"""Imports a track from Markdown files on disk into the learning models.

Content lives in a folder per track, laid out like this:

    content/python-fundamentals/
      track.md                     front matter: title, description, published
      01-getting-started/
        module.md                  front matter: title, description
        01-your-first-line.md      a lesson; front matter: title, type,
                                   minutes, sample (readable while logged out)
        02-say-hello.md
        02-say-hello/              exercises for the lesson with the same name
          print-hello-world/
            exercise.md            optional: title + instructions
            starter.py
            solution.py
            test_visible.py
            test_hidden.py

The numeric prefix on module and lesson names gives the order and is dropped
from the slug, so renumbering keeps the same database row. Every row is
matched on its parent plus slug and updated in place: running the import
twice is a no-op the second time. Nothing is ever deleted; rows that exist in
the database but not on disk are listed as a warning instead.

Usage:

    python manage.py import_content content/python-fundamentals
    python manage.py import_content content/python-fundamentals --dry-run
"""

import re
from pathlib import Path

import yaml
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_slug
from django.db import transaction

from learning.models import Exercise, Lesson, Module, Track

ORDER_PREFIX = re.compile(r"^(\d+)-(.+)$")

# Exercise orders are unique per lesson, so when exercises are reordered the
# existing rows are moved out of the way first. Any offset larger than a
# realistic number of exercises per lesson works.
ORDER_PARKING_OFFSET = 10_000

EXERCISE_FILES = {
    "starter_code": "starter.py",
    "solution_code": "solution.py",
    "visible_tests": "test_visible.py",
    "hidden_tests": "test_hidden.py",
}


class ContentError(CommandError):
    """A problem in the content files, reported with the offending path."""

    def __init__(self, path, message):
        super().__init__(f"{path}: {message}")


def read_markdown(path):
    """Return (front matter dict, body) for a Markdown file with YAML front matter."""
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ContentError(path, "file must start with a '---' front matter line")
    end = text.find("\n---\n", 4)
    if end == -1:
        # Allow a file that is front matter only, closed by '---' at the end.
        if text.rstrip("\n").endswith("\n---"):
            end = len(text.rstrip("\n")) - 3
            body = ""
        else:
            raise ContentError(path, "front matter is not closed by a '---' line")
    else:
        body = text[end + len("\n---\n") :]
    try:
        meta = yaml.safe_load(text[4:end]) or {}
    except yaml.YAMLError as exc:
        raise ContentError(path, f"invalid YAML in front matter: {exc}") from exc
    if not isinstance(meta, dict):
        raise ContentError(path, "front matter must be a mapping of key: value")
    return meta, body.strip("\n") + ("\n" if body.strip("\n") else "")


def require_title(meta, path):
    title = meta.get("title")
    if not title or not isinstance(title, str):
        raise ContentError(path, "front matter needs a 'title'")
    return title.strip()


def description_from(meta, body):
    description = meta.get("description")
    if description is not None:
        return str(description).strip()
    return body.strip()


def split_order_and_slug(name, path):
    match = ORDER_PREFIX.match(name)
    if not match:
        raise ContentError(path, "name must start with a number and a dash, e.g. '01-intro'")
    order, slug = int(match.group(1)), match.group(2)
    check_slug(slug, path)
    return order, slug


def check_slug(slug, path):
    try:
        validate_slug(slug)
    except ValidationError:
        raise ContentError(path, f"'{slug}' is not a valid slug (letters, numbers, - and _)")
    return slug


def read_optional(path):
    return path.read_text(encoding="utf-8") if path.is_file() else ""


class Command(BaseCommand):
    help = "Import a track from a folder of Markdown files. Safe to run repeatedly."

    def add_arguments(self, parser):
        parser.add_argument(
            "track_dirs",
            nargs="+",
            metavar="TRACK_DIR",
            help="Folder containing track.md and one sub-folder per module.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing to the database.",
        )

    def handle(self, *args, **options):
        self.dry_run = options["dry_run"]
        self.counts = {"created": 0, "updated": 0, "unchanged": 0}
        self.verbosity = options["verbosity"]

        for track_dir in options["track_dirs"]:
            self.import_track(Path(track_dir))

        summary = ", ".join(f"{n} {k}" for k, n in self.counts.items())
        if self.dry_run:
            self.stdout.write(self.style.WARNING(f"Dry run, nothing written. Would be: {summary}."))
        else:
            self.stdout.write(self.style.SUCCESS(f"Done: {summary}."))

    def import_track(self, track_dir):
        # Everything is read and validated before the transaction opens, so a
        # broken file never leaves a half-imported track behind.
        plan = self.read_track(track_dir)
        with transaction.atomic():
            self.write_track(plan)
            if self.dry_run:
                transaction.set_rollback(True)

    # -- reading ---------------------------------------------------------

    def read_track(self, track_dir):
        if not track_dir.is_dir():
            raise CommandError(f"{track_dir}: not a directory")
        track_file = track_dir / "track.md"
        if not track_file.is_file():
            raise CommandError(f"{track_dir}: no track.md found")

        meta, body = read_markdown(track_file)
        slug = check_slug(meta.get("slug") or track_dir.resolve().name, track_file)
        track = {
            "slug": slug,
            "fields": {
                "title": require_title(meta, track_file),
                "description": description_from(meta, body),
                "is_published": bool(meta.get("published", False)),
                "enforce_module_order": bool(meta.get("enforce_module_order", True)),
            },
            "modules": [],
        }

        module_dirs = sorted(p for p in track_dir.iterdir() if p.is_dir() and not p.name.startswith("."))
        seen = {}
        for module_dir in module_dirs:
            module = self.read_module(module_dir)
            if module["slug"] in seen:
                raise ContentError(module_dir, f"duplicate module slug, also used by {seen[module['slug']]}")
            seen[module["slug"]] = module_dir
            track["modules"].append(module)
        return track

    def read_module(self, module_dir):
        module_file = module_dir / "module.md"
        if not module_file.is_file():
            raise ContentError(module_dir, "no module.md found")
        order, slug = split_order_and_slug(module_dir.name, module_dir)
        meta, body = read_markdown(module_file)
        module = {
            "slug": slug,
            "fields": {
                "title": require_title(meta, module_file),
                "description": description_from(meta, body),
                "order": order,
            },
            "lessons": [],
        }

        lesson_files = sorted(
            p for p in module_dir.glob("*.md") if p.name != "module.md" and not p.name.startswith(".")
        )
        seen = {}
        for lesson_file in lesson_files:
            lesson = self.read_lesson(lesson_file)
            if lesson["slug"] in seen:
                raise ContentError(lesson_file, f"duplicate lesson slug, also used by {seen[lesson['slug']]}")
            seen[lesson["slug"]] = lesson_file
            module["lessons"].append(lesson)

        # Folders that match no lesson file are almost always a typo.
        lesson_stems = {p.stem for p in lesson_files}
        for stray in module_dir.iterdir():
            if stray.is_dir() and not stray.name.startswith(".") and stray.name not in lesson_stems:
                raise ContentError(stray, "folder has no matching lesson file (expected a .md with the same name)")
        return module

    def read_lesson(self, lesson_file):
        order, slug = split_order_and_slug(lesson_file.stem, lesson_file)
        meta, body = read_markdown(lesson_file)

        lesson_type = str(meta.get("type", Lesson.Type.CONCEPT)).strip().lower()
        if lesson_type not in Lesson.Type.values:
            raise ContentError(lesson_file, f"unknown type '{lesson_type}'; use one of {', '.join(Lesson.Type.values)}")
        minutes = meta.get("minutes", 5)
        if not isinstance(minutes, int) or isinstance(minutes, bool) or minutes < 0:
            raise ContentError(lesson_file, "'minutes' must be a whole number")
        sample = meta.get("sample", False)
        if not isinstance(sample, bool):
            raise ContentError(lesson_file, "'sample' must be true or false")

        lesson = {
            "slug": slug,
            "fields": {
                "title": require_title(meta, lesson_file),
                "lesson_type": lesson_type,
                "body": body,
                "order": order,
                "estimated_minutes": minutes,
                "is_sample": sample,
            },
            "exercises": [],
        }

        exercises_dir = lesson_file.with_suffix("")
        if exercises_dir.is_dir():
            exercise_dirs = sorted(p for p in exercises_dir.iterdir() if p.is_dir() and not p.name.startswith("."))
            seen = {}
            for position, exercise_dir in enumerate(exercise_dirs, start=1):
                exercise = self.read_exercise(exercise_dir, position)
                if exercise["slug"] in seen:
                    raise ContentError(exercise_dir, f"duplicate exercise slug, also used by {seen[exercise['slug']]}")
                seen[exercise["slug"]] = exercise_dir
                lesson["exercises"].append(exercise)
        return lesson

    def read_exercise(self, exercise_dir, position):
        # An exercise folder may carry a numeric prefix for ordering, but it
        # does not have to: the sorted folder order is what counts.
        match = ORDER_PREFIX.match(exercise_dir.name)
        slug = check_slug(match.group(2) if match else exercise_dir.name, exercise_dir)

        meta, body = {}, ""
        exercise_file = exercise_dir / "exercise.md"
        if exercise_file.is_file():
            meta, body = read_markdown(exercise_file)
        title = meta.get("title") or slug.replace("-", " ").replace("_", " ").capitalize()

        fields = {
            "title": str(title).strip(),
            "instructions": body.strip(),
            "order": position,
        }
        for field, filename in EXERCISE_FILES.items():
            fields[field] = read_optional(exercise_dir / filename)
        return {"slug": slug, "fields": fields}

    # -- writing ---------------------------------------------------------

    def write_track(self, plan):
        track = self.upsert(Track, {"slug": plan["slug"]}, plan["fields"])

        for module_plan in plan["modules"]:
            module = self.upsert(Module, {"track": track, "slug": module_plan["slug"]}, module_plan["fields"])

            for lesson_plan in module_plan["lessons"]:
                lesson = self.upsert(Lesson, {"module": module, "slug": lesson_plan["slug"]}, lesson_plan["fields"])
                self.write_exercises(lesson, lesson_plan["exercises"])

                self.warn_missing(
                    lesson.exercises.exclude(slug__in=[e["slug"] for e in lesson_plan["exercises"]]),
                    f"exercise(s) of lesson '{lesson.slug}'",
                )
            self.warn_missing(
                module.lessons.exclude(slug__in=[l["slug"] for l in module_plan["lessons"]]),
                f"lesson(s) of module '{module.slug}'",
            )
        self.warn_missing(
            track.modules.exclude(slug__in=[m["slug"] for m in plan["modules"]]),
            f"module(s) of track '{track.slug}'",
        )

    def write_exercises(self, lesson, exercise_plans):
        # (lesson, order) is unique, so park the orders of rows that no longer
        # match the disk before assigning the new ones. This includes rows for
        # exercises that were removed or renamed on disk: they are kept, but
        # moved to the end so they cannot block an order a current exercise needs.
        wanted = {e["slug"]: e["fields"]["order"] for e in exercise_plans}
        to_move = [
            ex
            for ex in lesson.exercises.all()
            if ex.order != wanted.get(ex.slug) and ex.order < ORDER_PARKING_OFFSET
        ]
        for ex in to_move:
            Exercise.objects.filter(pk=ex.pk).update(order=ex.order + ORDER_PARKING_OFFSET)

        for exercise_plan in exercise_plans:
            self.upsert(Exercise, {"lesson": lesson, "slug": exercise_plan["slug"]}, exercise_plan["fields"])

    def upsert(self, model, lookup, fields):
        """Create or update one row, saving only when something differs."""
        obj = model.objects.filter(**lookup).first()
        label = f"{model.__name__.lower()} {lookup['slug']}"

        if obj is None:
            obj = model(**lookup, **fields)
            obj.save()
            self.record("created", label)
            return obj

        changed = [name for name, value in fields.items() if getattr(obj, name) != value]
        if changed:
            for name in changed:
                setattr(obj, name, fields[name])
            obj.save()
            self.record("updated", f"{label} ({', '.join(changed)})")
        else:
            self.record("unchanged", label)
        return obj

    def record(self, status, label):
        self.counts[status] += 1
        if self.verbosity >= 2 or (self.verbosity >= 1 and status != "unchanged"):
            self.stdout.write(f"  {status:<9} {label}")

    def warn_missing(self, queryset, what):
        missing = list(queryset.values_list("slug", flat=True))
        if missing:
            self.stdout.write(
                self.style.WARNING(
                    f"Warning: {len(missing)} {what} exist in the database but not on disk "
                    f"and were left untouched: {', '.join(missing)}"
                )
            )
