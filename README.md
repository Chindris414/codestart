# CodeStart

[![CI](https://github.com/Chindris414/codestart/actions/workflows/ci.yml/badge.svg)](https://github.com/Chindris414/codestart/actions/workflows/ci.yml)

CodeStart is a learn-to-code web platform for complete beginners. It pairs short lessons with hands-on coding in the browser, so a learner can write and run their first line of Python within minutes, with nothing to install.

It's a personal hobby project, built and maintained by me. It's at an early stage: the foundation (accounts, API, frontend, tests, CI) works, learners can browse lessons and write and run Python in the browser, and they can submit their code to be checked on the server in an isolated sandbox. See [ROADMAP.md](ROADMAP.md).

## Who it's for

Adults and older teens with no programming experience, who often learn alone in short sessions on a laptop: curious starters, career switchers and students.

## Built with

| Part | Technology |
| --- | --- |
| Backend | Python, Django, Django REST Framework |
| Frontend | Next.js (React, TypeScript), Tailwind CSS |
| In-browser coding | Monaco editor, Pyodide (Python on WebAssembly) in a Web Worker |
| Database | PostgreSQL 17 |
| Grading queue | Redis 7 + Celery |
| Grading sandbox | A throwaway Docker container per submission (gVisor on the server) |
| Local services | Docker Compose |
| CI | GitHub Actions |

## What works today

- Email sign-up, log-in and log-out (Django session auth, CSRF protection, password validation, custom email-based user model)
- `/api/health/` endpoint and a home page that shows API and database status
- Next.js proxy for `/api/*`, so the browser only talks to one origin
- Track, module and lesson pages; sample lessons open without an account, the rest after logging in
- Lessons imported from Markdown files in `content/` (`python manage.py import_content content/python-fundamentals`)
- A Monaco code editor per exercise with starter code and Reset
- **Run** executes Python in the learner's browser (Pyodide in a Web Worker): output, tracebacks, `input()`, and Stop for endless loops. Code is never sent to the server. See [docs/python-in-the-browser.md](docs/python-in-the-browser.md)
- **Submit** checks the code on the server against the exercise's visible tests, in a throwaway container with no network and CPU, memory, process and time limits. The learner sees the status while it waits and a plain-language result. See [docs/grading-sandbox.md](docs/grading-sandbox.md)
- Backend tests, frontend unit tests, and CI that runs them, lint and the production build on every push

## Project layout

```
backend/     Django project (config/ settings and Celery, accounts/ users and auth API, core/ health endpoint,
             learning/ content and progress, grading/ submissions)
frontend/    Next.js app (src/app pages, src/lib API helpers and the Python runner, src/components)
content/     Lessons as Markdown files
grader/      The grader: takes jobs from the queue and runs each in a sandbox (no Django, no database access)
sandbox/     The sandbox image and the harness that runs the tests inside it
docs/        codestart-spec.md (the full product specification) and how-it-works notes
.github/     CI workflow
docker-compose.yml   PostgreSQL, Redis, the worker, the grader and its Docker socket proxy
step_by_step.md      Build notes for each step
```

## Running it locally

Requirements: Git, Docker Desktop (or Docker Engine with Compose), Python 3.13, Node.js 24.

**1. Configuration**

Copy `.env.example` to `.env` in the project root and fill in the values. Use any local passwords for `POSTGRES_PASSWORD` and `REDIS_PASSWORD` (Compose will not start without the Redis one), and generate a Django secret key with the command below.

```bash
cp .env.example .env            # Windows PowerShell: Copy-Item .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(50))"   # paste as DJANGO_SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(32))"   # paste as REDIS_PASSWORD
```

**2. Database, Redis and grading**

```bash
docker compose build sandbox    # the sandbox image (built only; the grader starts one container per submission)
docker compose up -d            # db, redis, worker, grader, docker-proxy
docker compose ps               # db and redis should be (healthy), the others Up
```

After changing code in `backend/grading/` run `docker compose up -d --build worker`; in `grader/`, `docker compose up -d --build grader`; in `sandbox/`, `docker compose build sandbox`.

**3. Backend** (http://127.0.0.1:8000)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows PowerShell: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser   # optional, for /admin/
python manage.py runserver
```

**4. Frontend** (http://localhost:3000), in a second terminal

```bash
cd frontend
npm install
npm run dev
```

`npm run dev` (and `npm run build`) first copies Monaco and Pyodide into `frontend/public/` and bundles the Python worker; if you change files in `frontend/src/lib/python/` while the dev server runs, run `npm run assets` and reload.

Open http://localhost:3000. The home page should show "API: ok · Database: ok". The frontend expects the backend at `http://127.0.0.1:8000`; to change that, set `BACKEND_URL` in `frontend/.env.local`.

**Two checkouts side by side**

Two checkouts (for example two git worktrees) can share one Docker if each has its own stack. In each checkout's own `.env` (never in a committed file), set a different `COMPOSE_PROJECT_NAME`, `POSTGRES_DB`, `POSTGRES_PORT`, `REDIS_PORT`, `SANDBOX_IMAGE` and `SANDBOX_LABEL`, then run step 2 and `migrate` in that checkout. Compose then names its containers and database volume after the project, and each grader only ever cleans up sandboxes with its own label. Run each Django on its own port too (`python manage.py runserver 127.0.0.1:8001`, and `BACKEND_URL` to match).

## Running the tests

```bash
cd backend && python manage.py test     # needs the db container running
cd frontend && npm test && npm run lint && npm run build
```

Django creates a temporary test database and deletes it afterwards, so local data isn't touched. The same checks run in GitHub Actions on every push and pull request.

## Data

The project contains no real personal data. All users and sample data are made up.

## Documentation

- [docs/codestart-spec.md](docs/codestart-spec.md): product specification (learners, courses, editor, grading, data model, security)
- [docs/python-in-the-browser.md](docs/python-in-the-browser.md): how Run works, and its limitations
- [docs/grading-sandbox.md](docs/grading-sandbox.md): how Submit works, the sandbox's limits and why, and gVisor on the server
- [ROADMAP.md](ROADMAP.md): planned work
- [step_by_step.md](step_by_step.md): build notes

## License

[MIT](LICENSE)
