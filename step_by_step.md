## Step 0 – Prerequisites (Windows)

### 0a. Check installed tools

```powershell
git --version          # had: 2.49.0.windows.1
python --version       # had: 3.13 (need 3.11+)
node --version         # had: v24.11.0 (need 20+)
docker --version
docker compose version
```

Result: everything present except Docker.

### 0b. Install Docker Desktop

Docker Desktop on Windows runs on WSL 2.

1. Install or update WSL 2 (PowerShell **as Administrator**):

```powershell
   wsl --install      # first time; restart PC if asked
   wsl --update       # if WSL is already installed
```

2. Install Docker Desktop (normal PowerShell):

```powershell
   winget install -e --id Docker.DockerDesktop
```

   Installed version: 4.95.0. Keep "Use WSL 2 instead of Hyper-V" ticked.

3. Start **Docker Desktop** from the Start menu, accept the terms, skip sign-in,
   and wait for "Engine running".

Notes:
- A black "WSL Debug Console" window may appear. It's Docker's internal Linux VM
  boot log, harmless, and can be closed.
- "Resource Saver mode" in Docker Desktop means the engine is idle. It wakes up
  automatically when a command runs.

### 0c. Verify Docker

```powershell
docker --version
docker compose version
docker run --rm hello-world     # must print "Hello from Docker!"
```

Result: "Hello from Docker!" ✔

### Troubleshooting: `docker` is not recognized

**Cause:** VS Code (or a terminal) was already open before Docker was installed,
so it still has the old PATH.

**Fix A (recommended):** close ALL VS Code windows, reopen, and run the commands again.

**Fix B (current terminal only):** reload PATH:

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
docker --version
```

**Check that the Docker CLI exists:**

```powershell
Test-Path "C:\Program Files\Docker\Docker\resources\bin\docker.exe"   # should print True
```


## Step 1 – Project skeleton: repo, Postgres and Redis

**Goal:** a Git repository with a clear folder layout, and the two services the
backend needs (PostgreSQL database + Redis queue) running locally in Docker.

All commands run from `C:\Users\chind\Desktop\AI_Tool\CodeStart`.

### 1a. Initialise the repo and folders

```powershell
git init
mkdir backend, frontend, docs
Move-Item codestart-spec.md docs\
```

**Why:**
- `git init` turns the folder into a Git repository, so every change is tracked and can be undone.
- One repo with separate folders (a "monorepo") keeps backend, frontend and docs together:
  - `backend/` – Django API (Python)
  - `frontend/` – Next.js web app (React)
  - `docs/` – specification and documentation
- Empty folders are not tracked by Git until they contain files.

### 1b. Create the configuration files (project root)

| File | Purpose | Committed to Git? |
| --- | --- | --- |
| `.gitignore` | Tells Git which files to never track (secrets, caches, `node_modules`) | Yes |
| `.env` | Real local secrets (DB password) | **No** – ignored |
| `.env.example` | Template showing which variables exist, without values | Yes |
| `docker-compose.yml` | Defines the Postgres and Redis containers | Yes |

**`.gitignore`**

```gitignore
# Secrets
.env

# Python
__pycache__/
*.pyc
.venv/
venv/

# Node
node_modules/
.next/

# OS / editor
.DS_Store
Thumbs.db
.vscode/
```

**`.env`** (change the password)

```env
POSTGRES_DB=codestart
POSTGRES_USER=codestart
POSTGRES_PASSWORD=change-me-local-only
```

**`.env.example`**

```env
POSTGRES_DB=codestart
POSTGRES_USER=codestart
POSTGRES_PASSWORD=
```

**`docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "127.0.0.1:5432:5432"   # only reachable from your PC, not your LAN
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
```

**What the compose file does:**
- **`db`** – PostgreSQL 17, the main database (users, lessons, progress, submissions).
  - `environment` reads values from `.env`, so no password is hard-coded in the file.
  - `volumes: pgdata` stores data in a named Docker volume, so it survives container restarts and rebuilds.
  - `healthcheck` uses `pg_isready` to report when the DB actually accepts connections.
- **`redis`** – Redis 7 (small Alpine image), used later as the queue for grading jobs (Celery).
- **`ports: 127.0.0.1:...`** – binds only to localhost. Without the IP, Docker would expose the
  port on all network interfaces, making the DB reachable from the LAN (security best practice).
- **`restart: unless-stopped`** – containers come back automatically when Docker Desktop starts.
- `$$` in the healthcheck escapes `$` so the variable is read *inside* the container.

Note: a folder was first created as `backeend` (typo) and fixed with:
```powershell
Rename-Item backeend backend
```

### 1c. Start the containers and verify

```powershell
docker compose up -d      # -d = detached, runs in the background
docker compose ps         # both services should show (healthy)
```

Result:
```
codestart-db-1      postgres:17      Up (healthy)   127.0.0.1:5432->5432/tcp
codestart-redis-1   redis:7-alpine   Up (healthy)   127.0.0.1:6379->6379/tcp
```

Connection tests:
```powershell
docker compose exec db psql -U codestart -d codestart -c "select version();"   # PostgreSQL 17...
docker compose exec redis redis-cli ping                                         # PONG
```

**Why:** `(healthy)` proves the healthchecks passed; the two `exec` commands prove we can
actually log in to Postgres and talk to Redis.

**Useful commands for later:**
```powershell
docker compose stop        # stop containers, keep data
docker compose start       # start them again
docker compose logs db     # see database logs
docker compose down        # remove containers (data stays in the volume)
docker compose down -v     # remove containers AND delete the database data (careful!)
```

### 1d. First commit

```powershell
git status                 # check .env is NOT listed
git add .
git commit -m "Project skeleton: docker compose with Postgres and Redis"
```

Result: 5 files committed (`.env.example`, `.gitignore`, `docker-compose.yml`,
`docs/codestart-spec.md`, `step_by_step.md`). `.env` correctly excluded.

**Why check `git status` first:** to make sure no secrets are about to be committed.
Once a secret is in Git history it is hard to remove completely.

Note: the warning `LF will be replaced by CRLF` is harmless (Windows vs Linux line endings).
It's fixed with a `.gitattributes` file in Step 2.

### 1e. Push to GitHub

**Goal:** a remote backup of the repo on GitHub (private), so the code is safe and
can later be used by CI/CD (GitHub Actions) and for deployment.

**1. Create an empty repo on GitHub**
- https://github.com/new
- Name: `codestart`, Visibility: **Private**
- Do NOT add README / .gitignore / license (they already exist locally;
  adding them on GitHub would create a conflicting first commit)

**2. Connect and push**

```powershell
git branch -M main
git remote add origin https://github.com/Chindris414/codestart.git
git push -u origin main
```

- `git branch -M main` – renames the local branch from `master` to `main` (GitHub's default).
- `git remote add origin <url>` – registers the GitHub repo as the remote called `origin`.
- `git push -u origin main` – uploads the commits; `-u` sets upstream so later just `git push` works.
- First push opens a browser to sign in to GitHub (Git Credential Manager, bundled with Git for Windows).

**3. Verify**

GitHub shows: `docs/`, `.env.example`, `.gitignore`, `docker-compose.yml`, `step_by_step.md`.
`.env` is NOT there ✔ (secrets stay local).

**Daily workflow from now on:**
```powershell
git status                      # what changed
git add .                       # stage changes
git commit -m "Describe change" # save a snapshot locally
git push                        # upload to GitHub
```

## Step 2 – Django backend connected to Postgres

**Goal:** a Django project in `backend/`, reading its settings from `.env`,
storing data in the Postgres container, with the admin panel working.

### 2a. Line endings (.gitattributes)

File `.gitattributes` in the project root:

```gitattributes
* text=auto eol=lf
*.ps1 text eol=crlf
*.bat text eol=crlf
*.png binary
*.jpg binary
```

```powershell
git add --renormalize .
```

**Why:** stores text files with Linux line endings (LF), the same as Docker and the
future Linux server. This removes the "LF will be replaced by CRLF" warning.
Windows-only scripts keep CRLF; images are marked binary so Git never alters them.

### 2b. Python virtual environment and packages

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # prompt now starts with (.venv)
python -m pip install --upgrade pip
pip install django djangorestframework "psycopg[binary]" django-environ
pip freeze > requirements.txt
```

If activation is blocked ("running scripts is disabled"), run once:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Why:**
- A virtual environment (`.venv`) keeps this project's packages separate from other
  Python projects on the PC. It is in `.gitignore`, never committed.
- `django` – web framework (admin, auth, ORM); installed version 6.1.2
- `djangorestframework` – builds the JSON API for the frontend (3.18.3)
- `psycopg[binary]` – PostgreSQL driver
- `django-environ` – reads settings from `.env`
- `requirements.txt` – exact versions; rebuild anywhere with `pip install -r requirements.txt`

**Every new terminal:** `cd backend` then `.\.venv\Scripts\Activate.ps1` before Django commands.

### 2c. Create the Django project

```powershell
django-admin startproject config .
python manage.py --version            # 6.1.2
```

**Why:** the `.` creates the project directly in `backend/` (no nested folder);
`config/` holds the settings, URLs and server entry points.

```
backend/
  manage.py          # command-line tool for the project
  requirements.txt
  config/
    settings.py      # all configuration
    urls.py          # URL routes
    asgi.py, wsgi.py # server entry points
```

### 2d. Settings from .env

Generate a secret key:
```powershell
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

Added to `.env` (and the same keys, without the secret value, to `.env.example`):
```env
DJANGO_SECRET_KEY=<generated key>
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
```

Changes in `backend/config/settings.py`:

```python
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

# Read settings from the .env file in the project root (CodeStart/.env)
env = environ.Env(DJANGO_DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR.parent / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env("DJANGO_DEBUG")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    # ...the default django.contrib apps...
    "rest_framework",
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB"),
        "USER": env("POSTGRES_USER"),
        "PASSWORD": env("POSTGRES_PASSWORD"),
        "HOST": env("POSTGRES_HOST", default="127.0.0.1"),
        "PORT": env("POSTGRES_PORT", default="5432"),
    }
}
```

**Why:**
- `BASE_DIR` = `backend/`, so `BASE_DIR.parent / ".env"` = `CodeStart/.env`, the same
  file Docker Compose uses. One config file for everything, no secrets in code.
- `SECRET_KEY` signs sessions/cookies; the default `django-insecure-...` key is replaced.
- `DEBUG` defaults to False if missing (safe default for production).
- `DATABASES` switches from the default SQLite file to the Postgres container.

### 2e. Create tables, admin user, run the server

Containers must be running (`docker compose ps`). From `backend` with `(.venv)` active:

```powershell
python manage.py check              # "System check identified no issues"
python manage.py migrate            # creates Django's tables in Postgres
python manage.py createsuperuser    # admin account (password is not shown while typing)
python manage.py runserver          # keep this terminal open
```

Open http://127.0.0.1:8000/admin/ and log in. Result: Django administration page ✔

**Lesson learned:** "ERR_CONNECTION_REFUSED" on 127.0.0.1:8000 means the server is not
running. Start `runserver` and keep that terminal open; use a second terminal (+) for
other commands. Stop the server with Ctrl+C.

### 2f. Verify and commit

From the project root, in a second terminal:
```powershell
docker compose exec db psql -U codestart -d codestart -c "\dt"   # lists auth_user, django_session...
git status                     # .env and backend/.venv must NOT be listed
git add .
git commit -m "Backend: Django project connected to Postgres via .env"
git push
```

