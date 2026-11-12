"""Read-only learner-facing API for browsing tracks, modules and lessons.

Every view filters on Track.is_published, so unpublished tracks 404 for
everyone, including logged-in users. A lesson body and its exercises are
returned only when the visitor may read the lesson: logged in, or the lesson
is a sample. Exercise solutions and hidden tests are never part of any
response.

Lesson summaries carry the visitor's own progress state ("not_started",
"in_progress" or "completed"); for a visitor every lesson is "not_started".
These views stay free of side effects: starting a lesson is recorded by the
separate POST in progress_views.
"""

from django.db.models import Count
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET

from .models import LessonProgress, Module, Track

NOT_STARTED = "not_started"


def _progress_states(request):
    """This visitor's lesson states, as {lesson_id: state}."""
    if not request.user.is_authenticated:
        return {}
    return dict(
        LessonProgress.objects.filter(user=request.user).values_list("lesson_id", "state")
    )


def _published_track(slug):
    return get_object_or_404(Track, slug=slug, is_published=True)


def _track_data(track):
    return {"slug": track.slug, "title": track.title, "description": track.description}


def _module_data(module):
    return {
        "slug": module.slug,
        "title": module.title,
        "description": module.description,
        "order": module.order,
    }


def _lesson_summary(lesson, request, states=None):
    if states is None:
        states = _progress_states(request)
    return {
        "slug": lesson.slug,
        "title": lesson.title,
        "lesson_type": lesson.lesson_type,
        "estimated_minutes": lesson.estimated_minutes,
        "is_sample": lesson.is_sample,
        "locked": not _can_read(lesson, request),
        "state": states.get(lesson.id, NOT_STARTED),
    }


def _can_read(lesson, request):
    return lesson.is_sample or request.user.is_authenticated


@require_GET
def track_list(request):
    tracks = Track.objects.filter(is_published=True).annotate(
        module_count=Count("modules", distinct=True),
        lesson_count=Count("modules__lessons", distinct=True),
    )
    return JsonResponse(
        {
            "tracks": [
                {
                    **_track_data(track),
                    "module_count": track.module_count,
                    "lesson_count": track.lesson_count,
                }
                for track in tracks
            ]
        }
    )


@require_GET
def track_detail(request, track_slug):
    track = _published_track(track_slug)
    modules = track.modules.prefetch_related("lessons")
    states = _progress_states(request)
    return JsonResponse(
        {
            "track": _track_data(track),
            "modules": [
                {
                    **_module_data(module),
                    "lessons": [
                        _lesson_summary(l, request, states) for l in module.lessons.all()
                    ],
                }
                for module in modules
            ],
        }
    )


@require_GET
def module_detail(request, track_slug, module_slug):
    track = _published_track(track_slug)
    module = get_object_or_404(Module, track=track, slug=module_slug)
    states = _progress_states(request)
    return JsonResponse(
        {
            "track": _track_data(track),
            "module": _module_data(module),
            "lessons": [_lesson_summary(l, request, states) for l in module.lessons.all()],
        }
    )


def _lesson_link(lesson):
    return {"module": lesson.module.slug, "lesson": lesson.slug, "title": lesson.title}


@require_GET
def lesson_detail(request, track_slug, module_slug, lesson_slug):
    track = _published_track(track_slug)
    module = get_object_or_404(Module, track=track, slug=module_slug)

    # One ordered list of all the track's lessons gives the lesson itself
    # plus its previous/next neighbours, crossing module boundaries.
    track_lessons = [
        lesson
        for mod in track.modules.prefetch_related("lessons")
        for lesson in mod.lessons.all()
    ]
    lesson = next(
        (l for l in track_lessons if l.module_id == module.id and l.slug == lesson_slug),
        None,
    )
    if lesson is None:
        return JsonResponse({"error": "Not found."}, status=404)
    index = track_lessons.index(lesson)

    data = _lesson_summary(lesson, request)
    if _can_read(lesson, request):
        data["body"] = lesson.body
        data["exercises"] = [
            {
                "slug": exercise.slug,
                "title": exercise.title,
                "instructions": exercise.instructions,
                "starter_code": exercise.starter_code,
                "visible_tests": exercise.visible_tests,
            }
            for exercise in lesson.exercises.all()
        ]

    return JsonResponse(
        {
            "track": _track_data(track),
            "module": _module_data(module),
            "lesson": data,
            "previous": _lesson_link(track_lessons[index - 1]) if index > 0 else None,
            "next": _lesson_link(track_lessons[index + 1]) if index + 1 < len(track_lessons) else None,
        }
    )
