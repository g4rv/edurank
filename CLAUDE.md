@AGENTS.md

# EduRank — Project Context & Rules

## What this project is

A web platform to store and manage as much data about university staff as possible,
and generate various documents/surveys from that data (e.g. ratings, reports).

**Replaces:** Google Drive spreadsheets + PDFs managed manually, plus a custom Google Apps Script
that auto-generates documents. The script hits a hard 6-minute execution limit — a real bottleneck
given the number of staff and documents.

**Core ideas (details TBD):**

- Professors fill in data about themselves (publications, achievements, CV info, etc.)
- Departments have additional data about professors that professors cannot see or edit
- Different departments may manage different types of data about the same professor
- The platform generates documents/ratings from the combined data
- Email notifications to professors may be needed (currently used in Google Scripts) — do not build until confirmed

**Do not lock down the data model until the full requirements are understood.**
Self-hosted on a local university machine. Budget is zero.

## Stack decisions (don't change without discussion)

- **Next.js 16** — full-stack, API routes live inside the app, no separate backend
- **PostgreSQL 16** — relational data (professors → departments → faculties)
- **Prisma 7** — ORM. Schema in `prisma/schema.prisma`, client in `src/lib/prisma.ts`
- **Auth.js (next-auth v5 beta)** — Credentials provider, JWT sessions
- **bcryptjs** — password hashing (pure JS, no native deps)
- **@prisma/adapter-pg** — Prisma 7 requires explicit DB adapter
- **File storage** — not yet implemented. Candidates: RustFS (Apache 2.0, not production-ready yet), Garage (AGPL-3.0, production-ready but complex). MinIO is dead — do not use it.
- **Tailwind 4** — styling
- **Docker Compose** — local infrastructure (Postgres + Adminer)

No Supabase. Chose bare stack intentionally for simplicity and learning.

## Current state

- [x] Docker Compose set up (Postgres, Adminer, automated daily backups via `prodrigestivill/postgres-backup-local`)
- [x] Prisma schema defined — Faculty, Department, Professor, User, Division, Role/AcademicRank/AcademicPosition/ScientificDegree enums
- [x] Migrations applied — tables exist in DB
- [x] Prisma client singleton at `src/lib/prisma.ts` (with PrismaPg adapter)
- [x] Auth.js configured — `src/auth.ts`, Credentials provider, JWT sessions
- [x] Auth API route — `src/app/api/auth/[...nextauth]/route.ts`
- [x] Login page — `src/app/(auth)/login/page.tsx`
- [x] Seed script — `prisma/seed.ts`, run with `npm run seed`
- [x] Protect routes — `src/proxy.ts`, redirects unauthenticated users to `/login`
- [x] API routes — CRUD for professors, departments, faculties (`src/app/api/`)
- [x] Admin panel — `src/app/admin/` with faculty/department/professor sections, Server Actions, toast feedback
- [x] UI components — `button`, `input`, `toast` in `src/components/ui/`; global `Header`; toast system via Context + portal in `src/providers/`
- [x] Testing — Vitest + Husky pre-push hook (runs format check, lint, tsc, tests)
- [x] Professor detail/edit page — `src/app/professors/[id]/`, field-level access control by role/division
- [x] Professor list page — `src/app/professors/`, search + filter by name/rank/position/degree/department/faculty
- [ ] Professor create form — via admin panel or dedicated page (not started)
- [ ] File uploads — deferred, storage provider not chosen yet
- [ ] Report generation — deferred, requires full data model first

## Developer context

The lead developer is a junior front-end dev learning as they build.

**You are acting as a mentor, not just a coding assistant.** This means:

- Explain the "why" behind every decision, not just the "what"
- Use analogies to connect new concepts to things the dev already knows
- Don't assume prior knowledge of backend, infra, or auth concepts
- When introducing something new, give a short plain-English explanation before writing any code
- After implementing something, briefly note what was learned and why it matters
- All new concepts learned during a session must be added to `documentation/personal/learning-notes.md`

---

## Conventions

### Language

All user-facing text must be in Ukrainian — labels, placeholders, headings, error messages, buttons, everything visible in the UI. Code identifiers (variables, functions, types) stay in English.

### Code style

- TypeScript everywhere — no `.js` files
- Async/await over `.then()` chains
- Server Components by default — only use `"use client"` when truly needed (forms, interactivity)
- Import Prisma client from `@/lib/prisma`, never instantiate directly

### File structure

```
src/
  app/
    (auth)/          auth pages (login, etc.) — grouped route, no URL segment
    api/             API route handlers
    professors/      professor pages
  lib/
    prisma.ts        DB client singleton
  generated/
    prisma/          auto-generated, never edit manually
prisma/
  schema.prisma      edit this to change DB structure
  migrations/        auto-generated, always commit these
```

### Database changes

ALWAYS go through Prisma migrations — never edit the DB directly:

```bash
# 1. Edit prisma/schema.prisma
# 2. Run:
npx prisma migrate dev --name describe_the_change
# 3. Commit the generated file in prisma/migrations/
```

---

## Testing

- **Framework:** Vitest — config in `vitest.config.ts`, tests co-located next to source files as `*.test.ts`
- **Run tests:** `npm test` (single run) or `npm run test:watch` (watch mode)
- **Pre-push hook:** Husky blocks `git push` if tests fail — never push broken code
- Every new utility function or business logic function must have a corresponding test file
- Test file lives next to the source file: `cn.ts` → `cn.test.ts`

## Commit conventions

Full schema: `documentation/technical/commit-schema.md` — always read it before committing.

Format: `type: short description`

Types:

- `feat:` — new feature or page
- `fix:` — bug fix
- `schema:` — database schema change (always mention which models changed)
- `chore:` — config, deps, tooling
- `docs:` — documentation only

Examples:

```
feat: add professor list page with search
fix: correct foreign key on Department model
schema: add email and phone fields to Professor
chore: install Auth.js and bcrypt
docs: update setup guide with Auth.js steps
```

Rules:

- Keep the first line under 72 characters
- No period at the end
- If the change needs explanation, add a blank line then a body
- Always commit `prisma/migrations/` alongside `prisma/schema.prisma` changes
- No "Generated with Claude Code", "Co-Authored-By: Claude", or any AI attribution lines — ever

---

## Local dev startup

```bash
docker compose up -d   # start Postgres, Adminer
npm run dev            # start Next.js at localhost:3000
```

Adminer: http://localhost:8080
