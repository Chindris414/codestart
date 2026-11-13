"""Starting one throwaway sandbox container per submission.

This is the only code that talks to Docker, always through the socket proxy
(DOCKER_HOST), and only ever with the fixed container configuration below:
no network, read-only root, a small /tmp, non-root user, no capabilities,
and CPU, memory, process and output limits. The job goes in on stdin; the
one result line comes back on stdout, signed with the job's one-time token
(see sandbox/harness/entrypoint.py), so nothing a sandbox prints can be
mistaken for a result.

Everything read back from a sandbox is untrusted: reads are capped, and only
a correctly signed JSON result of a sane size is accepted.
"""

import hashlib
import hmac
import json
import logging
import os
import secrets
import socket
import struct
import time

import docker
from docker.types import LogConfig, Ulimit

logger = logging.getLogger(__name__)

IMAGE = os.environ.get("SANDBOX_IMAGE", "codestart-sandbox:1")
# "runsc" (gVisor) on the server; empty locally, where Docker Desktop
# cannot easily load extra runtimes.
RUNTIME = os.environ.get("SANDBOX_RUNTIME", "")
API_VERSION = "1.43"  # fixed, so the client never needs the /version endpoint

# Label key on every sandbox container. The leftover sweep only ever
# removes containers with exactly this key, so two checkouts sharing one
# Docker (each with its own SANDBOX_LABEL) never clean up each other's.
LABEL = os.environ.get("SANDBOX_LABEL", "codestart.sandbox")
MAX_STDOUT_BYTES = 64 * 1024
MAX_RESULT_BYTES = 48 * 1024
GRACE_SECONDS = 5  # on top of the job's own total_seconds
SWEEP_AFTER_SECONDS = 60

RESULT_PREFIX = "CODESTART-RESULT "

_client = None


def get_client():
    global _client
    if _client is None:
        _client = docker.APIClient(
            base_url=os.environ.get("DOCKER_HOST", "unix:///var/run/docker.sock"),
            version=API_VERSION,
            timeout=30,
        )
    return _client


class SandboxFailure(Exception):
    """The sandbox did not produce a believable result; our fault, not the learner's."""


def check_image():
    """Called at startup: fail loudly if the sandbox image is missing."""
    get_client().inspect_image(IMAGE)


def _create_container(client):
    host_config = client.create_host_config(
        network_mode="none",
        read_only=True,
        tmpfs={"/tmp": "rw,nosuid,nodev,noexec,size=16m,mode=1777"},
        cap_drop=["ALL"],
        security_opt=["no-new-privileges"],
        mem_limit="256m",
        memswap_limit="256m",  # equal to mem_limit: no swap
        nano_cpus=1_000_000_000,  # 1 CPU
        pids_limit=64,
        ulimits=[
            Ulimit(name="nofile", soft=64, hard=64),
            Ulimit(name="fsize", soft=1_048_576, hard=1_048_576),
            Ulimit(name="core", soft=0, hard=0),
        ],
        # No log files: stdout is read straight from the attach stream, so a
        # chatty container cannot fill the host's disk.
        log_config=LogConfig(type="none"),
        # No init process: the harness must be PID 1 (it checks).
        init=False,
    )
    kwargs = {"runtime": RUNTIME} if RUNTIME else {}
    return client.create_container(
        image=IMAGE,
        user="10001:10001",
        hostname="sandbox",
        stdin_open=True,
        labels={LABEL: "1"},
        host_config=host_config,
        **kwargs,
    )


def _read_stdout(sock, deadline):
    """Read the multiplexed attach stream, capped, until EOF or the deadline."""
    buffer = b""
    stdout = b""
    while len(stdout) <= MAX_STDOUT_BYTES:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise SandboxFailure("sandbox still running at the hard deadline")
        sock.settimeout(remaining)
        try:
            chunk = sock.recv(65536)
        except socket.timeout:
            raise SandboxFailure("sandbox still running at the hard deadline")
        if not chunk:
            return stdout
        buffer += chunk
        # Docker frames: 8-byte header (stream id, 3 zero bytes, length).
        while len(buffer) >= 8:
            stream_id, length = buffer[0], struct.unpack(">I", buffer[4:8])[0]
            if len(buffer) < 8 + length:
                break
            if stream_id == 1:
                stdout += buffer[8 : 8 + length]
            buffer = buffer[8 + length :]
    raise SandboxFailure("sandbox printed more than the output cap")


def _signed_result(stdout_bytes, token):
    """The one correctly signed result in the sandbox's output, or None."""
    for line in stdout_bytes.decode("utf-8", errors="replace").splitlines():
        if not line.startswith(RESULT_PREFIX):
            continue
        parts = line.split(" ", 2)
        if len(parts) != 3 or len(parts[2]) > MAX_RESULT_BYTES:
            continue
        signature, payload = parts[1], parts[2]
        expected = hmac.new(token.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if hmac.compare_digest(expected, signature):
            try:
                result = json.loads(payload)
            except ValueError:
                return None
            return result if isinstance(result, dict) else None
    return None


def run_in_sandbox(job):
    """Run one job ({code, files, limits}) in a fresh sandbox container.

    Returns the result dict reported by the harness. Raises SandboxFailure
    for anything that is our fault rather than the learner's.
    """
    token = secrets.token_hex(32)
    limits = job.get("limits") or {}
    total_seconds = min(int(limits.get("total_seconds", 15)), 60)
    payload = json.dumps({**job, "token": token}).encode()

    client = get_client()
    container = _create_container(client)
    attach = None
    try:
        # Attach before starting, so no output can be missed.
        attach = client.attach_socket(
            container, params={"stdin": 1, "stdout": 1, "stream": 1}
        )
        raw = attach._sock
        client.start(container)
        raw.sendall(payload)
        raw.shutdown(socket.SHUT_WR)  # end of stdin: the harness reads it all

        deadline = time.monotonic() + total_seconds + GRACE_SECONDS
        stdout = _read_stdout(raw, deadline)

        result = _signed_result(stdout, token)
        if result is None:
            head = stdout[:300].decode("utf-8", errors="replace")
            raise SandboxFailure(f"no correctly signed result; output began: {head!r}")
        return result
    finally:
        if attach is not None:
            try:
                # The HTTP response wrapped around the socket first, then the
                # socket itself, or their buffers complain at shutdown.
                getattr(attach, "_response", attach).close()
                attach.close()
            except Exception:
                pass
        try:
            client.remove_container(container, force=True)
        except docker.errors.APIError as exc:
            logger.warning("Could not remove sandbox container: %s", exc)


def sweep_leftovers():
    """Remove sandbox containers older than a minute.

    Normally remove_container above gets them all; this catches containers
    orphaned by a grader crash. Safe to run any time: it only ever touches
    containers carrying our label.
    """
    client = get_client()
    cutoff = time.time() - SWEEP_AFTER_SECONDS
    try:
        leftovers = client.containers(all=True, filters={"label": LABEL})
    except docker.errors.APIError as exc:
        logger.warning("Could not list sandbox containers: %s", exc)
        return
    for found in leftovers:
        if found.get("Created", 0) < cutoff:
            logger.warning("Removing leftover sandbox container %s", found["Id"][:12])
            try:
                client.remove_container(found["Id"], force=True)
            except docker.errors.APIError as exc:
                logger.warning("Could not remove %s: %s", found["Id"][:12], exc)
