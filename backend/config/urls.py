from django.contrib import admin
from django.urls import include, path

from core.views import health
from learning.urls import me_urlpatterns

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health),
    path("api/auth/", include("accounts.urls")),
    path("api/tracks/", include("learning.urls")),
    path("api/me/", include(me_urlpatterns)),
]