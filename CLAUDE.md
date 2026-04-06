@AGENTS.md

# EduRank — Project Context & Rules

## What this project is
A web platform for a university to manage professor/staff data.
Replaces manual Google Drive spreadsheets and PDFs tracked by hand.
Self-hosted on a local university machine. Budget is zero.

## Stack decisions (don't change without discussion)
- **Next.js 16** — full-stack, API routes live inside the app, no separate backend
- **PostgreSQL 16** — relational data (professors → departments → faculties)
- **Prisma 7** — ORM. Schema in `prisma/schema.prisma`, client in `src/lib/prisma.ts`
- **Auth.js** — authentication and sessions (not yet implemented)
- **File storage** — not yet implemented. Candidates: RustFS (Apache 2.0, not production-ready yet), Garage (AGPL-3.0, production-ready but complex). MinIO is dead — do not use it.
- **Tailwind 4** — styling
- **Docker Compose** — local infrastructure (Postgres + Adminer + MinIO)

No Supabase. Chose bare stack intentionally for simplicity and learning.

## Current state
- [x] Docker Compose set up (Postgres, Adminer, MinIO)
- [x] Prisma schema defined — Faculty, Department, Professor, User, Session, Role enum
- [x] First migration applied — tables exist in DB
- [x] Prisma client singleton at `src/lib/prisma.ts`
- [ ] Auth.js — login, sessions, role-based access
- [ ] API routes — CRUD for professors/departments/faculties
- [ ] UI — professor list, add/edit forms
- [ ] File uploads — MinIO integration for photos and PDFs
- [ ] Report generation — PDF export with react-pdf

## Developer context
The lead developer is a junior front-end dev learning as they build.
Explain the "why" behind decisions, not just the "what".
Use analogies. Don't assume prior knowledge of backend/infra concepts.

---

## Conventions

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
docker compose up -d   # start Postgres, Adminer, MinIO
npm run dev            # start Next.js at localhost:3000
```

Adminer: http://localhost:8080
MinIO console: http://localhost:9001
