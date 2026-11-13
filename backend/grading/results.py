"""Checking what the grader reports before it reaches the database.

The grader builds its report from the output of a sandbox that ran learner
code, so the report is untrusted input: this module accepts only the shape
below, caps every string, and drops anything else. What it returns as
`results` is what the learner will see.

Shape the grader sends:

    {
        "status": "passed" | "failed" | "error",
        "summary": str,                   # one line for the learner
        "checks": [                       # one per test, in order
            {"name": str, "passed": bool, "message": str},
        ],
        "output": str,                    # the program's output, already capped
        "problem": {                      # optional: why the program stopped
            "kind": "timeout" | "memory" | "output_limit" | "needs_input" | "exception",
            "message": str,
            "error_type": str,            # optional, e.g. "NameError"
            "detail": str,                # optional, Python's own message (visible checks only)
            "line": int,                  # optional, line in the learner's code
        },
        "internal_error": str,            # optional, admin only, never shown
    }
"""

from .models import Submission

MAX_CHECKS = 50
MAX_NAME_CHARS = 200
MAX_MESSAGE_CHARS = 2_000
MAX_SUMMARY_CHARS = 500
MAX_OUTPUT_CHARS = 10_000
MAX_INTERNAL_CHARS = 5_000

PROBLEM_KINDS = {"timeout", "memory", "output_limit", "needs_input", "exception"}

FINAL_STATUSES = {Submission.Status.PASSED, Submission.Status.FAILED, Submission.Status.ERROR}

OUR_FAULT_SUMMARY = (
    "Something went wrong on our side while checking your code. It's not your "
    "fault, and your code is saved. Please try again in a minute."
)


class InvalidResult(ValueError):
    pass


def _no_nul(text):
    """PostgreSQL cannot store the NUL character, in text or JSON: show it."""
    return text.replace("\x00", "\u2400")


def _cap(value, limit):
    if not isinstance(value, str):
        raise InvalidResult(f"expected a string, got {type(value).__name__}")
    value = _no_nul(value)
    if len(value) <= limit:
        return value
    return value[:limit] + "\n… (cut: too long)"


def _check(raw):
    if not isinstance(raw, dict) or not isinstance(raw.get("passed"), bool):
        raise InvalidResult("each check needs a boolean 'passed'")
    return {
        "name": _cap(raw.get("name", ""), MAX_NAME_CHARS),
        "passed": raw["passed"],
        "message": _cap(raw.get("message", ""), MAX_MESSAGE_CHARS),
    }


def _problem(raw):
    if not isinstance(raw, dict) or raw.get("kind") not in PROBLEM_KINDS:
        raise InvalidResult("problem needs a known 'kind'")
    problem = {"kind": raw["kind"], "message": _cap(raw.get("message", ""), MAX_MESSAGE_CHARS)}
    if "error_type" in raw:
        problem["error_type"] = _cap(raw["error_type"], MAX_NAME_CHARS)
    if "detail" in raw:
        problem["detail"] = _cap(raw["detail"], MAX_MESSAGE_CHARS)
    line = raw.get("line")
    if isinstance(line, int) and not isinstance(line, bool) and 0 < line < 1_000_000:
        problem["line"] = line
    return problem


def _our_fault(internal_error):
    return Submission.Status.ERROR, {"summary": OUR_FAULT_SUMMARY}, _no_nul(internal_error)[:MAX_INTERNAL_CHARS]


def clean_result(raw):
    """Turn a grader report into (status, learner-safe results, internal_error).

    Anything malformed or self-contradictory becomes an ERROR, which tells
    the learner it was our fault rather than theirs.
    """
    if not isinstance(raw, dict):
        return _our_fault("grader report is not an object")

    internal = raw.get("internal_error", "")
    internal = _no_nul(internal)[:MAX_INTERNAL_CHARS] if isinstance(internal, str) else ""

    status = raw.get("status")
    if status not in FINAL_STATUSES:
        return _our_fault(f"grader report has an unknown status: {status!r}\n{internal}")
    if status == Submission.Status.ERROR:
        # The grader's own words could contain server details, so the
        # learner always gets the same friendly message.
        return _our_fault(internal or "grader reported an error without details")

    try:
        checks = raw.get("checks", [])
        if not isinstance(checks, list) or len(checks) > MAX_CHECKS:
            raise InvalidResult(f"checks must be a list of at most {MAX_CHECKS}")
        results = {
            "summary": _cap(raw.get("summary", ""), MAX_SUMMARY_CHARS),
            "checks": [_check(c) for c in checks],
            "output": _cap(raw.get("output", ""), MAX_OUTPUT_CHARS),
        }
        if raw.get("problem") is not None:
            results["problem"] = _problem(raw["problem"])
    except InvalidResult as exc:
        return _our_fault(f"malformed grader report: {exc}\n{internal}")

    if status == Submission.Status.PASSED and (
        not results["checks"] or not all(c["passed"] for c in results["checks"])
    ):
        return _our_fault(f"grader said passed, but not every check passed\n{internal}")

    return status, results, internal
