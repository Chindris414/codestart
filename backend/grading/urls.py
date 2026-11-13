from django.urls import path

from . import views

# Mounted next to learning.urls under /api/tracks/ (see config.urls).
exercise_urlpatterns = [
    path(
        "<slug:track_slug>/modules/<slug:module_slug>/lessons/<slug:lesson_slug>"
        "/exercises/<slug:exercise_slug>/submissions/",
        views.exercise_submissions,
    ),
]

# The learner's own data, mounted under /api/me/ (see config.urls).
me_urlpatterns = [
    path("submissions/<uuid:submission_id>/", views.my_submission),
]
