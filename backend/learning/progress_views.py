"""Lesson progress and the learner's dashboard.

Both views require a logged-in user and only ever read or write
request.user's own progress; there is no way to name another user. Lessons
are reached through their published track, so progress cannot be recorded
against unpublished content.
"""

import json

from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET, require_POST

from .models import Lesson, LessonProgress, Track
from .progress import current_streak, touch_lesson

ACTIONS = {"open": None, "complete": True, "uncomplete": False}


def _login_required(request):
    if request.user.is_authenticated:
        return None
    return JsonResponse({"error": "You must be logged in."}, status=401)


@require_POST
def lesson_progress(request, track_slug, module_slug, lesson_slug):
    """Record that the learner opened or (un)completed one lesson.

    Body: {"action": "open" | "complete" | "uncomplete"}. "open" is sent by
    the lesson page itself, which is why this is a POST and the GET views stay
    free of side effects.
    """
    denied = _login_required(request)
    if denied:
        return denied

    try:
        data = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON."}, status=400)
    action = data.get("action")
    if action not in ACTIONS:
        return JsonResponse(
            {"error": "action must be open, complete or uncomplete."}, status=400
        )

    lesson = get_object_or_404(
        Lesson,
        slug=lesson_slug,
        module__slug=module_slug,
        module__track__slug=track_slug,
        module__track__is_published=True,
    )
    progress = touch_lesson(request.user, lesson, complete=ACTIONS[action])
    return JsonResponse({"state": progress.state, "streak": current_streak(request.user)})


def _percent(done, total):
    return round(100 * done / total) if total else 0


def _continue_link(user, tracks_data, states):
    """Where "Continue where you left off" goes.

    The most recently touched lesson if it is still in progress, otherwise
    the next lesson after it in track order; the very first lesson when
    nothing has been started yet.
    """
    ordered = [lesson for track in tracks_data for lesson in track["_lessons"]]
    if not ordered:
        return None

    latest = (
        LessonProgress.objects.filter(user=user, lesson__in=[l["id"] for l in ordered])
        .order_by("-updated_at")
        .first()
    )
    if latest is None:
        return ordered[0]["link"]

    index = next((i for i, l in enumerate(ordered) if l["id"] == latest.lesson_id), None)
    if index is None:
        return ordered[0]["link"]
    if latest.state != LessonProgress.State.COMPLETED:
        return ordered[index]["link"]
    # Finished that one: offer the next unfinished lesson, if there is one.
    for lesson in ordered[index + 1 :]:
        if states.get(lesson["id"]) != LessonProgress.State.COMPLETED:
            return lesson["link"]
    return None


@require_GET
def dashboard(request):
    """Everything the dashboard shows: percentages, Continue and the streak."""
    denied = _login_required(request)
    if denied:
        return denied

    states = dict(
        LessonProgress.objects.filter(user=request.user).values_list("lesson_id", "state")
    )

    tracks_data = []
    for track in Track.objects.filter(is_published=True).prefetch_related("modules__lessons"):
        modules = []
        track_lessons = []
        for module in track.modules.all():
            lessons = list(module.lessons.all())
            done = sum(
                1 for l in lessons if states.get(l.id) == LessonProgress.State.COMPLETED
            )
            modules.append(
                {
                    "slug": module.slug,
                    "title": module.title,
                    "order": module.order,
                    "lesson_count": len(lessons),
                    "completed_count": done,
                    "percent": _percent(done, len(lessons)),
                }
            )
            track_lessons += [
                {
                    "id": l.id,
                    "link": {
                        "track": track.slug,
                        "module": module.slug,
                        "lesson": l.slug,
                        "title": l.title,
                    },
                }
                for l in lessons
            ]

        total = sum(m["lesson_count"] for m in modules)
        completed = sum(m["completed_count"] for m in modules)
        tracks_data.append(
            {
                "slug": track.slug,
                "title": track.title,
                "lesson_count": total,
                "completed_count": completed,
                "percent": _percent(completed, total),
                "modules": modules,
                "_lessons": track_lessons,
            }
        )

    continue_to = _continue_link(request.user, tracks_data, states)
    for track in tracks_data:
        del track["_lessons"]  # internal lookup, not part of the response

    return JsonResponse(
        {
            "tracks": tracks_data,
            "continue_to": continue_to,
            "streak": current_streak(request.user),
        }
    )
