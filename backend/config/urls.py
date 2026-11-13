from django.contrib import admin
from django.urls import include, path

from core.views import health
from grading import urls as grading_urls
from learning.urls import me_urlpatterns

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health),
    path("api/auth/", include("accounts.urls")),
    path("api/tracks/", include("learning.urls")),
    path("api/tracks/", include(grading_urls.exercise_urlpatterns)),
    path("api/me/", include(me_urlpatterns)),
    path("api/me/", include(grading_urls.me_urlpatterns)),
]