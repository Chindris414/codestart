from django.urls import path

from . import draft_views, progress_views, views

urlpatterns = [
    path("", views.track_list),
    path("<slug:track_slug>/", views.track_detail),
    path("<slug:track_slug>/modules/<slug:module_slug>/", views.module_detail),
    path(
        "<slug:track_slug>/modules/<slug:module_slug>/lessons/<slug:lesson_slug>/",
        views.lesson_detail,
    ),
    path(
        "<slug:track_slug>/modules/<slug:module_slug>/lessons/<slug:lesson_slug>"
        "/exercises/<slug:exercise_slug>/draft/",
        draft_views.exercise_draft,
    ),
    path(
        "<slug:track_slug>/modules/<slug:module_slug>/lessons/<slug:lesson_slug>/progress/",
        progress_views.lesson_progress,
    ),
]

# The learner's own data, mounted at /api/me/ (see config.urls).
me_urlpatterns = [
    path("drafts/", draft_views.my_drafts),
    path("drafts/import/", draft_views.import_drafts),
    path("dashboard/", progress_views.dashboard),
]
