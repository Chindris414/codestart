"""Autosaved code drafts, one per learner and exercise.

Every view requires a logged-in user and only ever reads or writes
request.user's own rows; there is no way to name another user. Exercises are
looked up through their published track, so drafts cannot be attached to (or
probe for) unpublished content.

A visitor's drafts live in the browser's localStorage instead; right after
login or signup the frontend posts them to the import endpoint, where the
newest version of each draft wins.
"""

import json

from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from .models import Exercise, ExerciseDraft, Lesson
from .progress import touch_lesson

# Generous for beginner exercises, small enough that drafts cannot be abused
# as free blob storage.
MAX_CODE_CHARS = 100_000
MAX_IMPORT_ITEMS = 50


def _login_required(request):
    if request.user.is_authenticated:
        return None
    return JsonResponse({"error": "You must be logged in."}, status=401)


def _json_body(request):
    try:
        return json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None


def _code_error(code):
    if not isinstance(code, str):
        return "code must be a string."
    if len(code) > MAX_CODE_CHARS:
        return f"code is too long (over {MAX_CODE_CHARS} characters)."
    return None


def _find_exercise(track_slug, module_slug, lesson_slug, exercise_slug):
    return Exercise.objects.filter(
        slug=exercise_slug,
        lesson__slug=lesson_slug,
        lesson__module__slug=module_slug,
        lesson__module__track__slug=track_slug,
        lesson__module__track__is_published=True,
    ).first()


def _draft_data(draft):
    return {"code": draft.code, "saved_at": draft.updated_at.isoformat()}


@require_http_methods(["PUT", "DELETE"])
def exercise_draft(request, track_slug, module_slug, lesson_slug, exercise_slug):
    """Save (PUT) or discard (DELETE) the learner's draft for one exercise."""
    denied = _login_required(request)
    if denied:
        return denied

    exercise = _find_exercise(track_slug, module_slug, lesson_slug, exercise_slug)
    if exercise is None:
        return JsonResponse({"error": "Not found."}, status=404)

    if request.method == "DELETE":
        # Reset to starter code: deleting an already absent draft is fine.
        ExerciseDraft.objects.filter(user=request.user, exercise=exercise).delete()
        return JsonResponse({"detail": "Draft deleted."})

    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON."}, status=400)
    error = _code_error(data.get("code"))
    if error:
        return JsonResponse({"error": error}, status=400)

    draft, _ = ExerciseDraft.objects.update_or_create(
        user=request.user, exercise=exercise, defaults={"code": data["code"]}
    )
    # Working on an exercise counts as progress on its lesson, and as a day
    # of activity for the streak.
    touch_lesson(request.user, exercise.lesson)
    return JsonResponse({"saved_at": draft.updated_at.isoformat()})


@require_GET
def my_drafts(request):
    """The learner's drafts for one lesson: ?lesson=<track>/<module>/<lesson>."""
    denied = _login_required(request)
    if denied:
        return denied

    parts = [p for p in request.GET.get("lesson", "").split("/") if p]
    if len(parts) != 3:
        return JsonResponse(
            {"error": "lesson must look like <track>/<module>/<lesson>."}, status=400
        )
    lesson = get_object_or_404(
        Lesson,
        slug=parts[2],
        module__slug=parts[1],
        module__track__slug=parts[0],
        module__track__is_published=True,
    )

    drafts = ExerciseDraft.objects.filter(
        user=request.user, exercise__lesson=lesson
    ).select_related("exercise")
    return JsonResponse({"drafts": {d.exercise.slug: _draft_data(d) for d in drafts}})


@require_POST
def import_drafts(request):
    """Adopt drafts a visitor made in the browser before logging in.

    Body: {"drafts": [{"lesson": "t/m/l", "exercise": slug, "code": str,
    "saved_at": ISO timestamp}, ...]}. Per exercise the newest version wins:
    a browser draft replaces the server's only when its timestamp is clearly
    newer; without a usable timestamp it only fills an empty slot. Items that
    do not resolve to a real exercise are skipped, never an error, so one
    stale localStorage entry cannot break a login.
    """
    denied = _login_required(request)
    if denied:
        return denied

    data = _json_body(request)
    if data is None or not isinstance(data.get("drafts"), list):
        return JsonResponse({"error": "drafts must be a list."}, status=400)

    imported = 0
    skipped = 0
    for item in data["drafts"][:MAX_IMPORT_ITEMS]:
        if not isinstance(item, dict):
            skipped += 1
            continue
        lesson_parts = [p for p in str(item.get("lesson", "")).split("/") if p]
        code = item.get("code")
        if len(lesson_parts) != 3 or _code_error(code):
            skipped += 1
            continue
        exercise = _find_exercise(*lesson_parts, str(item.get("exercise", "")))
        if exercise is None:
            skipped += 1
            continue

        saved_at = None
        if isinstance(item.get("saved_at"), str):
            saved_at = parse_datetime(item["saved_at"])
            if saved_at is not None and timezone.is_naive(saved_at):
                saved_at = None  # cannot compare fairly: treat as unknown age

        existing = ExerciseDraft.objects.filter(user=request.user, exercise=exercise).first()
        if existing is None:
            ExerciseDraft.objects.create(user=request.user, exercise=exercise, code=code)
            imported += 1
        elif saved_at is not None and saved_at > existing.updated_at:
            existing.code = code
            existing.save(update_fields=["code", "updated_at"])
            imported += 1
        else:
            skipped += 1

    return JsonResponse({"imported": imported, "skipped": skipped})
