# Internal Examination System

Web-based examination platform for internal training, job certification, and quality assessment (IQC/OQC, safety, quality system, etc.).

## Architecture

| Layer | Stack |
|-------|--------|
| Backend | NestJS + TypeScript + Prisma |
| Frontend | Vue 3 + TypeScript + Element Plus |
| Database | PostgreSQL 16 |
| Cache | Redis 7 (reserved for countdown, QR tokens, auto-save throttling) |

## Project Structure

```
.
├── backend/                 # NestJS API (admin + candidate + QR entry)
├── frontend/                # Vue 3 admin & candidate portals
├── docs/templates/          # Excel/CSV question import template
└── docker-compose.yml       # PostgreSQL + Redis
```

## Quick Start (no Docker required)

Local development uses **SQLite** so you can run immediately without PostgreSQL or Docker.

```bash
# From project root — one-time setup
npm run setup

# Start both API + frontend
cd backend && npm run start:dev    # terminal 1 → http://localhost:3000
cd frontend && npm run dev         # terminal 2 → http://localhost:5173
```

Or install root `concurrently` and use `npm run dev` from the project root after setup.

### URLs

| Link | Purpose |
|------|---------|
| http://localhost:5173 | Web app (login page) |
| http://localhost:5173/login | Admin / candidate login |
| http://localhost:3000/api/docs | Swagger API docs |
| http://localhost:3000/api/admin/login | Admin login API |

### Optional: PostgreSQL + Redis (production-like)

If you have Docker installed:

```bash
docker compose up -d
# Switch backend/prisma/schema.prisma provider back to postgresql
# Set DATABASE_URL in backend/.env to the postgres URL
cd backend && npx prisma migrate deploy && npm run prisma:seed
```

## Demo Accounts

| Portal | Employee No | Password |
|--------|-------------|----------|
| Admin | `admin` | `Admin@123` |
| Candidate | `E10001` | `Candidate@123` |

## MVP Foundation Included

- **Data model** aligned with spec (users, roles, categories, questions, papers, exams, sessions, attempts, answers, scores, audit logs)
- **Role-based permissions** (Super Admin, Admin, Exam Admin, Grader, Candidate)
- **Admin APIs**: categories, questions (+ Excel import), papers, exams, sessions/QR, grading, results export, audit logs
- **Candidate APIs**: exam list, start, auto-save answers, submit, result (no standard answers exposed)
- **QR entry** token resolution with login requirement
- **Audit logging** on login and extensible service for admin actions
- **Excel/CSV import template** at `docs/templates/question-import-template.csv`

## Key Design Decisions (from spec)

1. **No mandatory Word parsing** — manual entry + Excel import for MVP; attachments retained for audit
2. **Answer leakage prevention** — candidate APIs strip `standard_answer` and explanations
3. **Paper versioning** — snapshots stored on `paper_questions` and `answer_records`
4. **Traceability** — audit log module, result correction hooks reserved

## API Overview

### Admin
- `POST /api/admin/login`
- `GET/POST /api/admin/categories`
- `GET/POST /api/admin/questions`, `POST /api/admin/questions/import`
- `GET/POST /api/admin/papers`, `POST /api/admin/papers/:id/publish-version`
- `GET/POST /api/admin/exams`, `POST /api/admin/exams/:id/publish`
- `POST /api/admin/sessions/:sessionId/qr-code`
- `GET /api/admin/reviews/pending`, `POST /api/admin/reviews/:answerId`
- `GET /api/admin/exams/:id/scores|stats|export`
- `GET /api/admin/audit-logs`

### Candidate
- `POST /api/auth/login`
- `GET /api/student/exams`
- `POST /api/student/exams/:examId/start`
- `POST /api/student/attempts/:attemptId/answers|submit`
- `GET /api/student/attempts/:attemptId/result`

### QR
- `GET /api/exam-entry?token=xxx`
- `POST /api/exam-entry/verify`

## Next Steps (P0 completion)

- [ ] User/department CRUD UI
- [ ] Full paper composition UI
- [ ] Exam participant assignment
- [ ] Result publication workflow
- [ ] Redis integration for exam timer and auto-save throttling
- [ ] File upload for paper attachments (Word/PDF)

## Question Import Template

Columns: `question_type`, `stem`, `options`, `standard_answer`, `score`, `explanation`, `scoring_rubric`

Supported types: `single_choice`, `multiple_choice`, `true_false`, `fill_blank`, `short_answer` (or Chinese labels)

Options use `|` separator. Multiple-choice answers use comma-separated keys (e.g. `A,B,C`).
