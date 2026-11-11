from django.urls import path

from . import views

urlpatterns = [
    path("", views.track_list),
    path("<slug:track_slug>/", views.track_detail),
    path("<slug:track_slug>/modules/<slug:module_slug>/", views.module_detail),
    path(
        "<slug:track_slug>/modules/<slug:module_slug>/lessons/<slug:lesson_slug>/",
        views.lesson_detail,
    ),
]
