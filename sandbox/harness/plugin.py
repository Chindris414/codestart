"""pytest plugin loaded by the harness, providing the fixtures exercise tests use.

    def test_greets_the_world(run):
        assert run().output.strip() == "Hello, world!"

    def test_uses_print(source):
        assert "print" in source

`source` is the learner's code as text. `run(stdin="", check=True)` runs the
learner's program once, as a separate limited process (see program.py), and
returns a RunResult with `.output`, `.errors` and `.exit_code`. If the
program loops too long, uses too much memory, prints too much, wants more
input or crashes, the check fails with a plain-language message instead of
a confusing assertion. With check=False, a crash or missing input is
returned to the test instead (see `.exit_code` and `.errors`).

Checks from files marked hidden never report their test name, assertion
text, program output or the program's own error message: those could
reveal the hidden test's code or data.
"""

import shutil
import time
from dataclasses import dataclass, field

import pytest

from program import Stopped, run_python

HIDDEN_FAILED = "This hidden check did not pass yet."


@dataclass
class State:
    code: str
    run_dir: str
    tests_dir: str
    visible_files: set
    run_seconds: int
    deadline: float  # time.monotonic() value after which no new run starts
    output_chars: int
    checks: list = field(default_factory=list)
    problem: dict | None = None
    output: str | None = None
    collection_errors: list = field(default_factory=list)
    hidden_count: int = 0


STATE: State | None = None  # set by entrypoint.py before pytest starts


class ProgramStopped(Exception):
    def __init__(self, stopped):
        super().__init__(stopped.kind)
        self.stopped = stopped


def describe(stopped, visible=True):
    """The learner-facing problem record for a run that did not end cleanly."""
    seconds = STATE.run_seconds if STATE else 5
    kind = stopped.kind
    if kind == "timeout":
        message = (
            f"Your program was still running after {seconds} seconds, so it was stopped. "
            "This usually means a loop that never ends."
        )
    elif kind == "memory":
        message = (
            "Your program used more memory than allowed, so it was stopped. "
            "Is a list or a string growing without end?"
        )
    elif kind == "output_limit":
        message = (
            "Your program printed far too much, so it was stopped. "
            "Is there a print() inside a loop that never ends?"
        )
    elif kind == "needs_input":
        message = (
            "Your program asked for input with input(), but this check "
            "didn't give it anything more to read."
        )
    else:
        where = f" on line {stopped.line}" if stopped.line else ""
        message = f"Your program stopped with {stopped.error_type or 'an error'}{where}"
        message += f": {stopped.detail}" if stopped.detail and visible else "."

    problem = {"kind": kind, "message": message}
    if stopped.error_type:
        problem["error_type"] = stopped.error_type
    if stopped.detail and visible:
        # Python's own message, e.g. "name 'x' is not defined", so the
        # browser can show the same plain-language explanation as for Run.
        problem["detail"] = stopped.detail
    if stopped.line:
        problem["line"] = stopped.line
    return problem


def _is_visible(node):
    return node.path.name in STATE.visible_files


@pytest.fixture
def source():
    return STATE.code


@pytest.fixture
def run(request):
    visible = _is_visible(request.node)

    def run_program(stdin="", check=True):
        remaining = STATE.deadline - time.monotonic()
        if remaining < 1:
            stopped = Stopped("timeout")
        else:
            seconds = min(STATE.run_seconds, remaining)
            result, stopped = run_python(["main.py"], STATE.run_dir, stdin, seconds)
            if visible and STATE.output is None:
                STATE.output = result.output
            # check=False lets a test look at a program that crashed or ran
            # out of input; limits being hit always stop the check.
            if stopped is None or (stopped.kind in ("exception", "needs_input") and not check):
                return result
        if STATE.problem is None:
            STATE.problem = describe(stopped, visible)
        raise ProgramStopped(stopped)

    return run_program


def _failure_message(call, report, visible):
    exc = call.excinfo.value if call.excinfo else None
    if isinstance(exc, ProgramStopped):
        return describe(exc.stopped, visible)["message"]
    if not visible:
        return HIDDEN_FAILED
    crash = getattr(report.longrepr, "reprcrash", None)
    message = crash.message if crash else str(report.longrepr)
    # pytest's hints about its own command-line options mean nothing here.
    lines = [l for l in message.splitlines() if "use '-vv' to show" not in l]
    return "\n".join(lines).strip().removeprefix("AssertionError: ")


@pytest.hookimpl(wrapper=True)
def pytest_runtest_makereport(item, call):
    report = yield
    # One entry per test: its outcome when it ran, or its setup failure.
    if report.when == "call" or (report.when == "setup" and report.failed):
        visible = _is_visible(item)
        if visible:
            name = item.name
        else:
            STATE.hidden_count += 1
            name = f"Hidden check {STATE.hidden_count}"
        STATE.checks.append(
            {
                "name": name,
                "passed": report.passed,
                "message": "" if report.passed else _failure_message(call, report, visible),
            }
        )
    return report


def pytest_collectreport(report):
    if report.failed:
        STATE.collection_errors.append(str(report.longrepr)[:2000])


def pytest_collection_finish(session):
    # The tests are loaded now. Remove them from disk before any learner
    # code runs, so the program cannot read them back.
    shutil.rmtree(STATE.tests_dir, ignore_errors=True)
