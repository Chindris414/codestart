"""Shared progress helpers: recording activity and counting the streak.

Kept apart from the views so autosave (draft_views) can record a day of
activity without importing view code.
"""

from datetime import timedelta

from django.utils import timezone

from .models import ActivityDay, LessonProgress


def today():
    """Today as a calendar date in the project's time zone (Europe/Bucharest).

    One zone for everyone keeps "day" the same for the streak, the dashboard
    and the admin; per-learner zones can come later.
    """
    return timezone.localdate()


def record_activity(user):
    """Mark today as a day this learner was active (idempotent)."""
    ActivityDay.objects.get_or_create(user=user, date=today())


def current_streak(user):
    """Consecutive active days ending today or yesterday.

    Ending yesterday still counts, so the streak does not look broken first
    thing in the morning; it only ends after a whole day with no activity.
    """
    days = set(user.activity_days.values_list("date", flat=True))
    if not days:
        return 0

    now = today()
    start = now if now in days else now - timedelta(days=1)
    if start not in days:
        return 0

    streak = 0
    day = start
    while day in days:
        streak += 1
        day -= timedelta(days=1)
    return streak


def touch_lesson(user, lesson, *, complete=None):
    """Open, complete or un-complete a lesson, and count today as active.

    complete=None only ensures a row exists (opening a lesson): a lesson
    already completed stays completed.
    """
    progress, created = LessonProgress.objects.get_or_create(user=user, lesson=lesson)

    if complete is True and progress.state != LessonProgress.State.COMPLETED:
        progress.state = LessonProgress.State.COMPLETED
        progress.completed_at = timezone.now()
        progress.save(update_fields=["state", "completed_at", "updated_at"])
    elif complete is False and progress.state == LessonProgress.State.COMPLETED:
        progress.state = LessonProgress.State.IN_PROGRESS
        progress.completed_at = None
        progress.save(update_fields=["state", "completed_at", "updated_at"])
    elif not created:
        # Re-opening or editing: keep the state, but move it up the
        # "continue where you left off" order.
        progress.save(update_fields=["updated_at"])

    record_activity(user)
    return progress
