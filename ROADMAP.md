# CodeStart roadmap

The plan follows the four phases in [docs/codestart-spec.md](docs/codestart-spec.md). Each phase ends with a gate I check by hand before moving on. The hours are rough estimates for the coding work, including tests.

## Phase 1 · Foundation

- [x] Repo, Docker Compose with PostgreSQL and Redis
- [x] Django backend connected to Postgres through `.env`
- [x] Next.js frontend with backend health check
- [x] Email sign-up, log-in, log-out (session auth, CSRF)
- [x] Backend tests and GitHub Actions CI
- [ ] Google and GitHub login (~5 h)
- [ ] Staging deploy: Docker Compose + Caddy on a small VPS (~5 h)

**Gate:** a learner can sign up and log in on the staging site.

## Phase 2 · Learning core

- [ ] Content models: Track, Module, Lesson, Exercise, plus Django admin (~4 h)
- [ ] Import command that loads lessons from Markdown files with front matter (~6 h)
- [ ] Track, module and lesson pages in Next.js (~8 h)
- [ ] Monaco editor with Run in the browser (Pyodide in a Web Worker, `input()` support) (~10 h)
- [ ] Autosave of code per exercise (~2 h)
- [ ] Progress tracking: lesson states, dashboard percentages, "Continue", daily streak (~6 h)
- [ ] Plain-language explanations of common Python errors (~4 h)
- [ ] First two modules of the Python Fundamentals track (content)

**Gate:** a beginner finishes module 1 end to end without help.

## Phase 3 · Grading and tutor

- [ ] Submission model and Celery workers on Redis (~5 h)
- [ ] Grading sandbox: throwaway container per submission, no network, CPU/memory/time limits (~12 h)
- [ ] Submit with visible and hidden pytest tests and friendly results (~6 h)
- [ ] Rate limiting on log-in and submissions (~3 h)
- [ ] Tutor: error explanations and graduated hints (design in the spec; not started)

**Gate:** the sandbox passes my own escape and abuse testing.

## Phase 4 · Assessments

- [ ] Module quizzes with a question pool, pass mark and retakes (~8 h)
- [ ] Badges: module completion, streaks, milestones (~4 h)
- [ ] Certificates: PDF and public `/verify/<id>` page (~6 h)
- [ ] Account data export and deletion (~4 h)
- [ ] Complete Python Fundamentals track (content)

## Open questions

Product name, interface language (English, Romanian or both), Python or web basics as the first track, and tutor provider. See the end of the spec.
