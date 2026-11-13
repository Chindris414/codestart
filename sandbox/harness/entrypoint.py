"""Sandbox entry point: read one job on stdin, check it, print one signed result.

Job (JSON on stdin, read once, then stdin is closed):

    {
        "token": "<random hex, new for every job>",
        "code": "<the learner's program>",
        "files": [{"name": "test_visible.py", "source": "...", "visible": true}],
        "limits": {"run_seconds": 5, "total_seconds": 15, "output_chars": 10000}
    }

Result (the only thing ever written to the container's real stdout):

    CODESTART-RESULT <hmac-sha256 of the JSON, keyed with the token> <JSON>

The harness must run as the container's PID 1 (start the container
without --init). It is marked non-dumpable, so the learner's program, a
child process with the same user id, cannot read its memory, environment or
open files through /proc. That means it can neither learn the token to
forge a signed result nor write to the container's stdout. As PID 1 the
harness also cannot be killed from inside the container. Should anything
else ever reach stdout, the grader ignores lines that are not correctly
signed.

The JSON follows the shape documented in backend/grading/results.py.
"""

import ctypes
import hashlib
import hmac
import json
import os
import re
import signal
import sys
import time
import traceback

HARNESS_DIR = "/opt/harness"
WORK_DIR = "/tmp/work"
MAX_JOB_BYTES = 2 * 1024 * 1024
MAX_CODE_CHARS = 100_000
MAX_TEST_CHARS = 200_000
MAX_FILES = 20
TEST_NAME = re.compile(r"^test_[a-z0-9_]{1,60}\.py$")
TOKEN = re.compile(r"^[0-9a-f]{32,128}$")

# Compiles the learner's code in a child process (same limits as a run)
# without executing it, so a syntax error is reported before any test runs.
COMPILE_ONLY = "import sys; compile(open(sys.argv[1], encoding='utf-8').read(), sys.argv[1], 'exec')"

PR_SET_DUMPABLE = 4


class BadJob(ValueError):
    pass


def _make_non_dumpable():
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), "prctl(PR_SET_DUMPABLE) failed")


def _int_limit(limits, name, default, low, high):
    value = limits.get(name, default)
    if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
        raise BadJob(f"limits.{name} must be an integer from {low} to {high}")
    return value


def _parse_job(raw):
    if len(raw) > MAX_JOB_BYTES:
        raise BadJob("job is too large")
    job = json.loads(raw)
    if not isinstance(job, dict):
        raise BadJob("job must be an object")
    code = job.get("code")
    if not isinstance(code, str) or len(code) > MAX_CODE_CHARS:
        raise BadJob("code must be a string of at most 100k characters")
    files = job.get("files")
    if not isinstance(files, list) or not 1 <= len(files) <= MAX_FILES:
        raise BadJob(f"files must be a list of 1 to {MAX_FILES} test files")
    seen = set()
    for f in files:
        if not isinstance(f, dict):
            raise BadJob("each file must be an object")
        name, source, visible = f.get("name"), f.get("source"), f.get("visible")
        if not isinstance(name, str) or not TEST_NAME.match(name) or name in seen:
            raise BadJob("file names must be unique and look like test_something.py")
        if not isinstance(source, str) or len(source) > MAX_TEST_CHARS:
            raise BadJob("file source must be a string of at most 200k characters")
        if not isinstance(visible, bool):
            raise BadJob("file visible must be true or false")
        seen.add(name)
    limits = job.get("limits", {})
    if not isinstance(limits, dict):
        raise BadJob("limits must be an object")
    return {
        "code": code,
        "files": files,
        "run_seconds": _int_limit(limits, "run_seconds", 5, 1, 10),
        "total_seconds": _int_limit(limits, "total_seconds", 15, 5, 30),
        "output_chars": _int_limit(limits, "output_chars", 10_000, 100, 20_000),
    }


def _error(internal):
    return {"status": "error", "internal_error": internal[:5000]}


def _cap_output(text, limit):
    if text is None or len(text) <= limit:
        return text or ""
    return text[:limit] + "\n… (output cut: too long)"


def _grade(job, started):
    # Imported here, after the environment is cleaned up, never at the top.
    sys.path.insert(0, HARNESS_DIR)
    import pytest

    import plugin
    from program import run_python

    run_dir = os.path.join(WORK_DIR, "run")
    tests_dir = os.path.join(WORK_DIR, "tests")
    os.makedirs(run_dir, mode=0o700)
    os.makedirs(tests_dir, mode=0o700)
    with open(os.path.join(run_dir, "main.py"), "w", encoding="utf-8") as f:
        f.write(job["code"])
    for test in job["files"]:
        with open(os.path.join(tests_dir, test["name"]), "w", encoding="utf-8") as f:
            f.write(test["source"])

    plugin.STATE = state = plugin.State(
        code=job["code"],
        run_dir=run_dir,
        tests_dir=tests_dir,
        visible_files={t["name"] for t in job["files"] if t["visible"]},
        run_seconds=job["run_seconds"],
        deadline=started + job["total_seconds"] - 1,
        output_chars=job["output_chars"],
    )

    # A syntax error would fail every check the same way: report it once.
    _, stopped = run_python(["-c", COMPILE_ONLY, "main.py"], run_dir, "", job["run_seconds"])
    if stopped is not None:
        problem = plugin.describe(stopped)
        what = stopped.error_type or "a problem"
        where = f" on line {stopped.line}" if stopped.line else ""
        return {
            "status": "failed",
            "summary": f"Python could not read your code ({what}{where}), so it could not be checked yet.",
            "checks": [],
            "output": "",
            "problem": problem,
        }

    exit_code = pytest.main(
        [
            tests_dir,
            "-q",
            "-s",
            "--noconftest",
            "--import-mode=importlib",  # never put a writable folder on sys.path
            "--rootdir", tests_dir,
            "-p", "no:cacheprovider",
            "-p", "no:stepwise",
            "-o", "addopts=",
            "-o", "python_files=test_*.py",
            "--tb=short",
        ],
        plugins=[plugin],
    )

    if state.collection_errors:
        return _error("a test file failed to load:\n" + "\n".join(state.collection_errors))
    if exit_code not in (pytest.ExitCode.OK, pytest.ExitCode.TESTS_FAILED) or not state.checks:
        return _error(f"pytest ended with {exit_code!r} after {len(state.checks)} checks")

    passed = sum(1 for c in state.checks if c["passed"])
    total = len(state.checks)
    result = {
        "status": "passed" if passed == total else "failed",
        "summary": (
            ("The check passed." if total == 1 else f"All {total} checks passed.")
            if passed == total
            else f"{passed} of {total} check{'' if total == 1 else 's'} passed."
        ),
        "checks": state.checks,
        "output": _cap_output(state.output, job["output_chars"]),
    }
    if state.problem:
        result["problem"] = state.problem
    return result


def _stop_everything_else():
    """Kill every process this user can signal, except the harness itself."""
    try:
        os.kill(-1, signal.SIGKILL)
    except ProcessLookupError:
        pass


def main():
    started = time.monotonic()
    _make_non_dumpable()
    if os.getpid() != 1:
        sys.exit(3)  # started with --init or similar: refuse, see the docstring

    # Keep a private copy of stdout for the result; everything else that
    # would print (pytest's own report, warnings) goes nowhere.
    result_out = os.fdopen(os.dup(1), "w", encoding="ascii")
    devnull = os.open(os.devnull, os.O_WRONLY)
    os.dup2(devnull, 1)
    os.dup2(devnull, 2)
    raw = sys.stdin.buffer.read(MAX_JOB_BYTES + 1)
    sys.stdin.close()

    try:
        token = json.loads(raw).get("token")
    except (ValueError, AttributeError):
        token = None
    if not isinstance(token, str) or not TOKEN.match(token):
        sys.exit(2)  # nothing can be signed; the grader treats silence as an error

    def emit(result):
        payload = json.dumps(result, ensure_ascii=True, separators=(",", ":"))
        signature = hmac.new(token.encode(), payload.encode(), hashlib.sha256).hexdigest()
        result_out.write(f"CODESTART-RESULT {signature} {payload}\n")
        result_out.flush()

    def out_of_time(signum, frame):
        _stop_everything_else()
        emit(_error("harness ran past its total time limit"))
        os._exit(0)

    # Clean environment for pytest: no plugins or options from outside.
    for name in [n for n in os.environ if n.startswith("PYTEST")]:
        del os.environ[name]
    os.environ["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] = "1"
    sys.dont_write_bytecode = True

    try:
        job = _parse_job(raw)
        signal.signal(signal.SIGALRM, out_of_time)
        signal.alarm(job["total_seconds"] + 1)
        result = _grade(job, started)
    except BadJob as exc:
        result = _error(f"bad job: {exc}")
    except Exception:
        result = _error("harness crashed:\n" + traceback.format_exc())
    signal.alarm(0)

    _stop_everything_else()
    emit(result)


if __name__ == "__main__":
    main()
