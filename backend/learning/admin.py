from django.contrib import admin

from .models import ActivityDay, Exercise, ExerciseDraft, Lesson, LessonProgress, Module, Track


class ModuleInline(admin.TabularInline):
    model = Module
    fields = ("order", "title", "slug")
    prepopulated_fields = {"slug": ("title",)}
    extra = 0
    show_change_link = True  # jump to the module to edit its lessons


class LessonInline(admin.TabularInline):
    model = Lesson
    fields = ("order", "title", "slug", "lesson_type", "estimated_minutes", "is_sample")
    prepopulated_fields = {"slug": ("title",)}
    extra = 0
    show_change_link = True


class ExerciseInline(admin.StackedInline):
    model = Exercise
    fields = (
        "order",
        "title",
        "slug",
        "instructions",
        "starter_code",
        "solution_code",
        "visible_tests",
        "hidden_tests",
    )
    prepopulated_fields = {"slug": ("title",)}
    extra = 0


@admin.register(Track)
class TrackAdmin(admin.ModelAdmin):
    list_display = ("title", "slug", "is_published", "enforce_module_order", "updated_at")
    list_filter = ("is_published",)
    search_fields = ("title", "slug", "description")
    prepopulated_fields = {"slug": ("title",)}
    inlines = [ModuleInline]


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ("title", "track", "order", "updated_at")
    list_filter = ("track",)
    list_select_related = ("track",)
    search_fields = ("title", "slug")
    ordering = ("track", "order")
    prepopulated_fields = {"slug": ("title",)}
    inlines = [LessonInline]


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ("title", "module", "order", "lesson_type", "estimated_minutes", "is_sample", "updated_at")
    list_filter = ("lesson_type", "is_sample", "module__track")
    list_select_related = ("module", "module__track")
    search_fields = ("title", "slug", "body")
    ordering = ("module", "order")
    prepopulated_fields = {"slug": ("title",)}
    inlines = [ExerciseInline]


@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = ("title", "lesson", "order", "updated_at")
    list_filter = ("lesson__module__track",)
    list_select_related = ("lesson", "lesson__module")
    search_fields = ("title", "slug", "instructions")
    ordering = ("lesson", "order")
    prepopulated_fields = {"slug": ("title",)}


@admin.register(ExerciseDraft)
class ExerciseDraftAdmin(admin.ModelAdmin):
    """Learner data: visible for support and debugging, but not editable."""

    list_display = ("user", "exercise", "updated_at")
    list_select_related = ("user", "exercise", "exercise__lesson")
    search_fields = ("user__email", "exercise__title")
    readonly_fields = ("user", "exercise", "code", "created_at", "updated_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(LessonProgress)
class LessonProgressAdmin(admin.ModelAdmin):
    """Learner data: readable for support, written by the app only."""

    list_display = ("user", "lesson", "state", "completed_at", "updated_at")
    list_filter = ("state", "lesson__module__track")
    list_select_related = ("user", "lesson", "lesson__module")
    search_fields = ("user__email", "lesson__title")
    readonly_fields = ("user", "lesson", "state", "started_at", "completed_at", "updated_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(ActivityDay)
class ActivityDayAdmin(admin.ModelAdmin):
    list_display = ("user", "date")
    list_filter = ("date",)
    list_select_related = ("user",)
    search_fields = ("user__email",)
    readonly_fields = ("user", "date")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
