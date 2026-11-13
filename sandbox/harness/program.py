"""Running the learner's program, inside the sandbox container.

The learner's code is never imported or executed by the harness itself: it
always runs as a separate `python main.py` child process, in its own process
group, with its own time, CPU and memory limits, and with its output read
through capped pipes. Everything here only reads what the child prints.
"""

import os
import re
import resource
import selectors
import signal
import subprocess
import sys
import time
from dataclasses import dataclass

# Hard cap per output stream. Past this the program is stopped: nothing a
# beginner exercise prints comes close, and it keeps a print loop from
# eating the container's memory.
MAX_STREAM_BYTES = 64 * 1024

# Address-space limit for the learner's program. Lower than the container's
# 256 MB, so a runaway list ends in a clean MemoryError in the program
# instead of the kernel killing whichever process it picks.
MEMORY_LIMIT_BYTES = 192 * 1024 * 1024

CHILD_ENV = {
    "PATH": "/usr/local/bin:/usr/bin:/bin",
    "LANG": "C.UTF-8",
    "PYTHONIOENCODING": "utf-8",
    "PYTHONDONTWRITEBYTECODE": "1",
    "HOME": "/tmp",
    # One malloc arena: otherwise glibc reserves 64 MB of address space per
    # thread, and a few threads hit MEMORY_LIMIT_BYTES without using memory.
    "MALLOC_ARENA_MAX": "1",
}

_TRACEBACK_LINE = re.compile(r'File "[^"]*main\.py", line (\d+)')
_EXCEPTION_LINE = re.compile(r"^([A-Za-z_][\w.]*)(?::\s?(.*))?$")


@dataclass
class RunResult:
    """What one run of the learner's program produced."""

    output: str  # everything printed to standard output
    errors: str  # everything printed to standard error (tracebacks)
    exit_code: int


@dataclass
class Stopped:
    """Why a run did not finish normally, in learner-facing terms."""

    kind: str  # timeout | memory | output_limit | needs_input | exception
    error_type: str = ""
    line: int | None = None
    detail: str = ""  # the exception's own message, e.g. "name 'x' is not defined"


def _limit_child(cpu_seconds):
    def apply():
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1))
        resource.setrlimit(resource.RLIMIT_AS, (MEMORY_LIMIT_BYTES, MEMORY_LIMIT_BYTES))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

    return apply


def kill_all_others():
    """Kill every process the harness may signal, except the harness itself.

    The harness is the only process in the container that should outlive a
    run, so this takes down the learner's program and anything it started,
    even processes that left its process group. The harness runs as PID 1,
    which the kernel never lets processes inside the container kill.
    """
    try:
        os.kill(-1, signal.SIGKILL)
    except ProcessLookupError:
        pass


def reap_orphans():
    """Collect exited processes that were handed to the harness as PID 1."""
    while True:
        try:
            pid, _ = os.waitpid(-1, os.WNOHANG)
        except ChildProcessError:
            return
        if pid == 0:
            return


def _communicate(proc, stdin_bytes, seconds):
    """Feed stdin and read both outputs until exit, a time-out or the cap."""
    streams = {proc.stdout: bytearray(), proc.stderr: bytearray()}
    sel = selectors.DefaultSelector()
    for pipe in streams:
        sel.register(pipe, selectors.EVENT_READ)
    if stdin_bytes:
        sel.register(proc.stdin, selectors.EVENT_WRITE)
    else:
        proc.stdin.close()

    deadline = time.monotonic() + seconds
    others_killed = False
    while sel.get_map():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return streams, "timeout"
        if not others_killed and proc.poll() is not None:
            # The program has ended. Anything it left running in the
            # background could keep the pipes open: stop it, so the pipes
            # close and the rest of the output can be read at once.
            kill_all_others()
            others_killed = True
        for key, _ in sel.select(min(remaining, 0.1)):
            pipe = key.fileobj
            if pipe is proc.stdin:
                try:
                    # Up to PIPE_BUF bytes never blocks once select says writable.
                    written = os.write(pipe.fileno(), stdin_bytes[:4096])
                    stdin_bytes = stdin_bytes[written:]
                except BrokenPipeError:
                    stdin_bytes = b""
                if not stdin_bytes:
                    sel.unregister(pipe)
                    pipe.close()
                continue
            chunk = os.read(pipe.fileno(), 65536)
            if not chunk:
                sel.unregister(pipe)
                continue
            streams[pipe] += chunk
            if len(streams[pipe]) > MAX_STREAM_BYTES:
                return streams, "output_limit"
    return streams, None


def _parse_traceback(errors):
    """(exception name, line in main.py, message) from a Python traceback."""
    line_numbers = _TRACEBACK_LINE.findall(errors)
    lines = errors.strip().splitlines()
    if not lines or ("Traceback (most recent call last)" not in errors and not line_numbers):
        return "", None, ""  # the program printed to stderr itself; no traceback
    line = int(line_numbers[-1]) if line_numbers else None
    # A traceback always ends with "ExceptionName: message".
    match = _EXCEPTION_LINE.match(lines[-1].strip())
    if not match:
        return "", line, ""
    return match.group(1).rsplit(".", 1)[-1], line, match.group(2) or ""


def _why_stopped(result, our_reason):
    """Explain a run that did not end cleanly, or return None if it did."""
    if our_reason:
        return Stopped(our_reason)
    code = result.exit_code
    if code == 0:
        return None
    if code == -signal.SIGXCPU:
        return Stopped("timeout")  # used up its CPU time
    if code == -signal.SIGKILL:
        return Stopped("memory")  # killed by the kernel, almost always out of memory
    error_type, line, detail = _parse_traceback(result.errors)
    if error_type == "MemoryError":
        return Stopped("memory", error_type, line)
    if error_type == "EOFError":
        return Stopped("needs_input", error_type, line)
    if error_type:
        return Stopped("exception", error_type, line, detail)
    return Stopped("exception", "SystemExit", None, f"the program ended with exit code {code}")


def run_python(args, cwd, stdin="", seconds=5):
    """Run `python -I -B <args>` as a limited child; return (RunResult, Stopped | None)."""
    proc = subprocess.Popen(
        [sys.executable, "-I", "-B", *args],
        cwd=cwd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=CHILD_ENV,
        process_group=0,
        preexec_fn=_limit_child(max(1, int(seconds)) + 1),
    )
    try:
        streams, our_reason = _communicate(proc, stdin.encode("utf-8"), seconds)
    finally:
        # Also takes down anything the program started itself.
        kill_all_others()
        proc.wait()
        reap_orphans()
        for pipe in (proc.stdin, proc.stdout, proc.stderr):
            if not pipe.closed:
                pipe.close()

    result = RunResult(
        output=streams[proc.stdout].decode("utf-8", errors="replace"),
        errors=streams[proc.stderr].decode("utf-8", errors="replace"),
        exit_code=proc.returncode,
    )
    return result, _why_stopped(result, our_reason)
