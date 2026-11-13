# Load the Celery app whenever Django starts, so tasks bind to it.
from .celery import app as celery_app

__all__ = ("celery_app",)
