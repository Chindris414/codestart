# CodeStart

[![CI](https://github.com/Chindris414/codestart/actions/workflows/ci.yml/badge.svg)](https://github.com/Chindris414/codestart/actions/workflows/ci.yml)

CodeStart is a learn-to-code web platform for complete beginners. It pairs short lessons with hands-on coding in the browser, so a learner can write and run their first line of Python within minutes, with nothing to install.

It's a personal hobby project, built and maintained by me. It's at an early stage: the foundation (accounts, API, frontend, tests, CI) works, and the learning features are next. See [ROADMAP.md](ROADMAP.md).

## Who it's for

Adults and older teens with no programming experience, who often learn alone in short sessions on a laptop: curious starters, career switchers and students.

## Built with

| Part | Technology |
| --- | --- |
| Backend | Python, Django, Django REST Framework |
| Frontend | Next.js (React, TypeScript), Tailwind CSS |
| Database | PostgreSQL 17 |
| Queue (for grading jobs, planned) | Redis 7 (+ Celery, planned) |
| Local services | Docker Compose |
| CI | GitHub Actions |

## What works today

- Email sign-up, log-in and log-out (Django session auth, CSRF protection, password validation, custom email-based user model)
- `/api/health/` endpoint and a home page that shows API and database status
- Next.js proxy for `/api/*`, so the browser only talks to one origin
- Backend tests (health, auth, CSRF) and CI that runs the tests, lint and production build on every push

## Project layout

```
backend/     Django project (config/ settings, accounts/ users and auth API, core/ health endpoint)
frontend/    Next.js app (src/app pages, src/lib API helpers, src/components)
docs/        codestart-spec.md, the full product specification
.github/     CI workflow
docker-compose.yml   PostgreSQL and Redis for local development
step_by_step.md      Build notes for each step
```

## Running it locally

Requirements: Git, Docker Desktop (or Docker Engine with Compose), Python 3.13, Node.js 24.

**1. Configuration**

Copy `.env.example` to `.env` in the project root and fill in the values. Use any local password, and generate a Django secret key with the command below.

```bash
cp .env.example .env            # Windows PowerShell: Copy-Item .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(50))"   # paste as DJANGO_SECRET_KEY
```

**2. Database and Redis**

```bash
docker compose up -d
docker compose ps               # db and redis should be (healthy)
```

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

Open http://localhost:3000. The home page should show "API: ok · Database: ok". The frontend expects the backend at `http://127.0.0.1:8000`; to change that, set `BACKEND_URL` in `frontend/.env.local`.

## Running the tests

```bash
cd backend && python manage.py test     # needs the db container running
cd frontend && npm run lint && npm run build
```

Django creates a temporary test database and deletes it afterwards, so local data isn't touched. The same checks run in GitHub Actions on every push and pull request.

## Data

The project contains no real personal data. All users and sample data are made up.

## Documentation

- [docs/codestart-spec.md](docs/codestart-spec.md): product specification (learners, courses, editor, grading, data model, security)
- [ROADMAP.md](ROADMAP.md): planned work
- [step_by_step.md](step_by_step.md): build notes

## License

[MIT](LICENSE)
