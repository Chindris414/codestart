from django.contrib import admin

from .models import Exercise, Lesson, Module, Track


class ModuleInline(admin.TabularInline):
    model = Module
    fields = ("order", "title", "slug")
    prepopulated_fields = {"slug": ("title",)}
    extra = 0
    show_change_link = True  # jump to the module to edit its lessons


class LessonInline(admin.TabularInline):
    model = Lesson
    fields = ("order", "title", "slug", "lesson_type", "estimated_minutes")
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
    list_display = ("title", "module", "order", "lesson_type", "estimated_minutes", "updated_at")
    list_filter = ("lesson_type", "module__track")
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
