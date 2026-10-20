from django.db import connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """Simple health check: confirms the API is up and the database answers."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        db_status = "ok"
    except Exception:
        db_status = "error"

    return Response({
        "status": "ok" if db_status == "ok" else "degraded",
        "database": db_status,
    })