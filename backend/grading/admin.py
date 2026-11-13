from django.contrib import admin

from .models import Submission


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    """Learner data: readable for support and debugging, written by the app only."""

    list_display = ("user", "exercise", "status", "created_at", "finished_at")
    list_filter = ("status", "exercise__lesson__module__track")
    list_select_related = ("user", "exercise", "exercise__lesson")
    search_fields = ("user__email", "exercise__title")
    readonly_fields = (
        "id",
        "user",
        "exercise",
        "status",
        "code",
        "results",
        "internal_error",
        "created_at",
        "started_at",
        "finished_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
