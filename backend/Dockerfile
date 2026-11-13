# Image for the Django side of the backend. For now it runs only the Celery
# worker on the "results" queue (see docker-compose.yml); the dev web server
# still runs on the host. Learner code never runs in this image.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Run as an unprivileged user, not root.
RUN useradd --system --uid 10010 --no-create-home app
USER app

CMD ["celery", "-A", "config", "worker", "--queues", "results", "--concurrency", "2", "--loglevel", "INFO"]
