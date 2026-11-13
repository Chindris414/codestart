# Grading sandbox: how Submit works

Submit checks a learner's code on the server against the exercise's tests. The code is untrusted, so it only ever runs in a throwaway container with no network and tight limits, never in the web app or in a worker process. This page describes the moving parts, every limit and why it is there, what the learner sees, and how to run it on a server with gVisor.

Run (in the browser) is separate and unchanged: see [python-in-the-browser.md](python-in-the-browser.md).

## The journey of one submission

1. The learner presses **Submit**. The browser sends the code to `POST /api/tracks/<track>/modules/<module>/lessons/<lesson>/exercises/<exercise>/submissions/`.
2. Django saves a `Submission` row (status `queued`) and puts a job on the **`grading`** queue in Redis: the code, the exercise's visible tests and the limits. A learner can have only one submission waiting at a time (the database enforces it; a second Submit gets 409).
3. The **grader** takes the job, reports "running" on the **`results`** queue, and starts one fresh sandbox container. The job goes in on the container's stdin; one signed result line comes back on its stdout. The container is then removed.
4. The **worker** (Django's Celery worker) takes the "running" and result messages from the `results` queue, checks the result, and saves it on the `Submission`.
5. The browser polls `GET /api/me/submissions/<id>/` (every second at first, then every 2 and 3 seconds) and shows the result.

Every view only ever reads the logged-in learner's own submissions; anyone else's is a plain 404. Tests, solutions and server-side error details are never sent to the browser.

## The parts and who can reach what

| Service | Runs | Can reach | Cannot reach |
| --- | --- | --- | --- |
| Django (`runserver` on the host for now) | The API | Postgres, Redis | Docker |
| `worker` | `grading.mark_running`, `grading.save_result` from the `results` queue | Postgres, Redis (network `data`) | Docker |
| `grader` | `grader.run_submission` from the `grading` queue | Redis (network `queue`), `docker-proxy` (network `dockerapi`) | Postgres, the internet (both its networks are internal) |
| `docker-proxy` | Forwards a short allowlist of Docker API calls | The host's Docker socket | Everything else (network `dockerapi` only) |
| sandbox containers | The learner's code | Nothing (`network none`) | Everything |

The grader is a small Celery app without Django. It holds no database credentials and no Django secret key, only the Redis password, so even a compromised grader cannot read or change learner data. The queues are its only link to the rest of the system, as the spec asks for.

### How the grader reaches Docker

The grader never gets the Docker socket. It talks to `docker-proxy` ([wollomatic/socket-proxy](https://github.com/wollomatic/socket-proxy)), which only accepts connections from the grader and only forwards:

- `GET` list containers, read the sandbox image
- `POST` create, start, attach, wait, kill a container
- `DELETE` remove a container

Everything else (exec, image pulls and builds, volumes, networks, …) gets 403. One honest limit: the proxy checks which call is made, not what is inside a "create" request, so a fully compromised grader could still ask for a dangerous container. The walls that matter are that learner code never runs in the grader, that the grader treats everything a sandbox prints as untrusted, and gVisor on the server (below).

## How a sandbox is isolated, and why

Set in `grader/sandbox_runner.py`; the same settings for every submission.

| Area | Setting | Why |
| --- | --- | --- |
| Network | `network none` (only loopback) | No downloading, attacking others or sending data out |
| Filesystem | Read-only root; only `/tmp` is writable: a 16 MB in-memory disk, `noexec,nosuid,nodev`; no volumes or host folders | Cannot change the image, fill the host's disk, or run dropped programs |
| User | uid 10001, all capabilities dropped, `no-new-privileges`, no setuid programs in the image, Docker's default seccomp and AppArmor profiles | No root inside the container, and no way to get it |
| CPU | 1 CPU | One submission cannot starve the server |
| Memory | 256 MB for the container, no swap; 192 MB of address space for the learner's program itself | A runaway list ends in a clear MemoryError instead of swapping the host |
| Processes | At most 64 (threads count too); 64 open files; 1 MB per file; no core dumps | Stops fork bombs and file floods |
| Time | 5 s per run of the program (`Exercise.time_limit_s`, 1–10); 15 s for all checks together; the grader kills the container at 20 s; Celery's hard limit is 60 s | Several layers, so no single failure leaves code running |
| Output | 64 KB per stream inside the sandbox, 64 KB read by the grader, 10 000 characters stored; Docker's log files are off | A chatty program cannot fill memory, the disk or the database |
| Cleanup | Each container carries the label `SANDBOX_LABEL` and is removed right after its job; a sweep at grader start-up and before every job removes labelled containers older than 60 s | If the grader dies mid-job, the container stops by itself after about 16 s and the next sweep removes it |

### Inside the container

The harness (`sandbox/harness/`) runs as the container's PID 1 and is marked non-dumpable. It writes the learner's code to `main.py` and the tests to their own folder, checks the code for syntax errors without running it, then runs pytest in its own process with two fixtures the tests use:

- `source`: the learner's code as text
- `run(stdin="", check=True)`: runs `python main.py` once as a separate, limited child process, and returns `.output`, `.errors` and `.exit_code`

The learner's code is never imported or executed by the harness itself. Further protections:

- **Test files are deleted** right after pytest has loaded them, before any learner code runs, so the program cannot read them back. pytest's import mode keeps writable folders off the harness's import path.
- **Results are signed.** The grader hands the harness a random one-time token on stdin. The result line is signed with it (HMAC-SHA256), and the grader accepts only a correctly signed line. As PID 1 and non-dumpable, the harness's memory, environment and open files are closed to the learner's program, so it can neither read the token nor write to the container's stdout. It also cannot kill PID 1.
- **Leftovers are killed.** After every run the harness kills every other process in the container, including ones that left their process group.
- **Hidden checks** (for the next roadmap item; Submit sends only visible tests for now) report only "Hidden check N", never the test's name, assertion text, output or the program's own error message.

The worker checks every report again before saving (`backend/grading/results.py`): only the documented shape, every string capped, NUL characters replaced (PostgreSQL cannot store them), and a "passed" that does not add up becomes an error. If saving fails for any reason, the submission is marked as an error instead of being left waiting.

## What the learner sees

| Situation | Message |
| --- | --- |
| Waiting | "Queued, waiting for a free checker…", then "Checking your code…" |
| All checks pass | "The check passed." / "All 3 checks passed." |
| Some fail | "1 of 3 checks passed.", with ✓/✗ per check and the reason |
| Endless loop | "Your program was still running after 5 seconds, so it was stopped. This usually means a loop that never ends." |
| Too much memory | "Your program used more memory than allowed, so it was stopped. Is a list or a string growing without end?" |
| Too much output | "Your program printed far too much, so it was stopped. Is there a print() inside a loop that never ends?" |
| `input()` with nothing to read | "Your program asked for input with input(), but this check didn't give it anything more to read." |
| Python error | "Your program stopped with NameError on line 2: …" plus the same plain-language explanation as after Run |
| Syntax error | "Python could not read your code (SyntaxError on line 1), so it could not be checked yet." |
| Our fault (sandbox failed, queue down, no result within 2 minutes) | "Something went wrong on our side while checking your code. It's not your fault, and your code is saved. Please try again in a minute." |

The real reason for an error is kept in `Submission.internal_error`, visible in the Django admin only.

## Running it locally

See the README. In short: set `REDIS_PASSWORD` in `.env`, then

```bash
docker compose build sandbox        # the sandbox image (built only, never started by "up")
docker compose up -d                # db, redis, worker, grader, docker-proxy
```

After changing code, rebuild what changed: `docker compose up -d --build worker` for `backend/grading/`, `--build grader` for `grader/`, and `docker compose build sandbox` for `sandbox/` (the next job uses the new image).

Locally, sandboxes run with Docker's normal runtime (runc) and all the settings above. Docker Desktop cannot easily load gVisor, so the extra kernel isolation is for the server.

### Checking it yourself

Send one made-up job straight to the sandbox through the grader, without the web app:

```bash
docker compose exec -T grader python -c "
import json, sandbox_runner
job = {'code': 'while True:\n    pass',
       'files': [{'name': 'test_visible.py', 'source': 'def test_runs(run):\n    run()\n', 'visible': True}],
       'limits': {}}
print(json.dumps(sandbox_runner.run_in_sandbox(job), indent=2))"
```

Replace the code with any harmless program that tries a limit (a print loop, a huge list, opening a socket, writing to `/`, starting many processes, reading `/proc/1/environ`) and check that the result and the leftover count (`docker ps -a --filter label=<your SANDBOX_LABEL>`) are what you expect.

## On the server: gVisor

On the VPS, run sandboxes under [gVisor](https://gvisor.dev), which gives each container its own user-space kernel, so a Linux kernel bug is much harder to use for an escape. Install it on the Docker host (Debian/Ubuntu, from the gVisor docs):

```bash
sudo apt-get update && sudo apt-get install -y apt-transport-https ca-certificates curl gnupg
curl -fsSL https://gvisor.dev/archive.key | sudo gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" \
  | sudo tee /etc/apt/sources.list.d/gvisor.list > /dev/null
sudo apt-get update && sudo apt-get install -y runsc
sudo runsc install                  # adds the runsc runtime to /etc/docker/daemon.json
sudo systemctl restart docker
docker run --rm --runtime=runsc hello-world
```

Then set `SANDBOX_RUNTIME=runsc` in the server's `.env` and recreate the grader (`docker compose up -d grader`). Every sandbox container is then created with `runtime=runsc`; the other services keep the normal runtime.

Not yet tested under gVisor (it is not available on the development machine). Before the Phase 3 gate, repeat the checks above on the server, in particular: the harness still runs as PID 1 and its `/proc` entries stay closed, the memory, process and time limits still trigger the same messages, and `docker ps -a` shows no leftovers. The spec also asks for the grader on a separate host from the web app and database; with the queues as the only link, that is a configuration change (Redis reachable from that host), not a code change.

## Known limits

- **Visible tests only, for now.** Hidden tests, friendlier "expected X, got Y" messages and completing the lesson on a pass are the next roadmap item. Failure messages for visible checks are still pytest's own assertion text.
- **Threads.** A program can start roughly 20 threads (8 were checked to work, 40 do not); beyond that it gets "can't start new thread", because each thread's 8 MB stack counts against the 192 MB limit.
- **Sharing one Docker.** Two checkouts on one machine must use different `COMPOSE_PROJECT_NAME`, ports, `SANDBOX_IMAGE` and `SANDBOX_LABEL` (see the README), or their graders will clean up each other's sandboxes.
- **Rate limiting** of submissions is a separate roadmap item; until then the one-waiting-submission rule is the only brake.

## Where the code is

| Path | What |
| --- | --- |
| `backend/grading/models.py` | `Submission` |
| `backend/grading/views.py`, `urls.py` | Submit, list, detail; stuck submissions become errors after 2 minutes |
| `backend/grading/tasks.py`, `results.py` | Saving results; checking every report |
| `backend/config/celery.py`, `settings.py` | Celery app, queues, Redis |
| `grader/app.py`, `sandbox_runner.py` | The grader and the container settings |
| `sandbox/Dockerfile`, `sandbox/harness/` | The sandbox image and the harness |
| `frontend/src/lib/submissions.ts`, `components/editor/SubmitPanel.tsx`, `useSubmission.ts` | Submit in the browser |
| `docker-compose.yml` | Services, networks, the proxy's allowlist |
