# The grader: takes jobs from the "grading" queue and runs each one in a
# throwaway sandbox container, through the Docker socket proxy. No Django,
# no database credentials. Learner code never runs in this image either.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY *.py .

RUN useradd --system --uid 10020 --no-create-home grader
USER grader

CMD ["celery", "-A", "app", "worker", "--queues", "grading", "--concurrency", "2", "--loglevel", "INFO"]
