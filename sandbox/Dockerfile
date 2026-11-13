# Grading sandbox: one throwaway container per submission, started by the
# grader with no network, a read-only root filesystem, a small /tmp and tight
# CPU, memory and process limits. The job arrives on stdin; one signed result
# line leaves on stdout. See harness/entrypoint.py.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

COPY requirements.txt /opt/harness/requirements.txt
RUN pip install -r /opt/harness/requirements.txt \
    # No setuid/setgid programs: nothing inside can raise its privileges.
    && find / -xdev -type f -perm /6000 -exec chmod a-s {} + \
    && useradd --uid 10001 --user-group --no-create-home --shell /usr/sbin/nologin sandbox

COPY --chmod=0444 harness/*.py /opt/harness/

USER 10001:10001
WORKDIR /tmp
# -I: isolated mode, so no environment variables, user site-packages or
# current folder can change which code the harness imports.
ENTRYPOINT ["python", "-I", "/opt/harness/entrypoint.py"]
