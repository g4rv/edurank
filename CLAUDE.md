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

See `documentation/technical/todo.md` for the full build checklist.

## Developer context

The lead developer is a junior front-end dev learning as they build.

**You are acting as a mentor, not just a coding assistant.** This means:

- Explain the "why" behind every decision, not just the "what"
- Use analogies to connect new concepts to things the dev already knows
- Don't assume prior knowledge of backend, infra, or auth concepts
- When introducing something new, give a short plain-English explanation before writing any code
- After implementing something, briefly note what was learned and why it matters

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

### Component naming conventions (project standard)

We settled on these rules for file and folder structure:

**File names:** `kebab-case`

```
src/components/ui/button.tsx        ✓
src/components/ui/Button.tsx        ✗
```

**Simple components:** single file

```
src/components/ui/button.tsx
src/components/ui/input.tsx
```

**Complex components:** subfolder with `index.ts` barrel export

```
src/components/data-table/
  index.ts              ← exports { DataTable }
  data-table.tsx        ← main component
  data-table-row.tsx    ← internal subcomponent
  data-table-cell.tsx   ← internal subcomponent
```

The `index.ts` lets you import with a clean path:

```typescript
import { DataTable } from '@/components/data-table';
// instead of:
import { DataTable } from '@/components/data-table/data-table';
```

**Why kebab-case:** Matches Next.js page routing conventions (`/admin/page.tsx`), avoids case-sensitivity issues across operating systems, and is more readable than PascalCase for multi-word file names.

### Tailwind v4 — always use v4 class names

This project is on **Tailwind CSS v4**. Several class names changed from v3 — never use the old ones:

**Removed aliases (use v4 name only):**

| v3 — do not use                         | v4 — correct                                    |
| --------------------------------------- | ----------------------------------------------- |
| `flex-shrink` / `flex-shrink-0`         | `shrink` / `shrink-0`                           |
| `flex-grow` / `flex-grow-0`             | `grow` / `grow-0`                               |
| `overflow-ellipsis`                     | `text-ellipsis`                                 |
| `decoration-slice` / `decoration-clone` | `box-decoration-slice` / `box-decoration-clone` |
| `outline-hidden`                        | `outline-hidden`                                |
| `bg-gradient-*`                         | `bg-linear-*`                                   |

**Scale shifts (values moved down one step):**

| v3                                   | v4                                      |
| ------------------------------------ | --------------------------------------- |
| `shadow` / `shadow-sm`               | `shadow-sm` / `shadow-xs`               |
| `blur` / `blur-sm`                   | `blur-sm` / `blur-xs`                   |
| `backdrop-blur` / `backdrop-blur-sm` | `backdrop-blur-sm` / `backdrop-blur-xs` |
| `rounded` / `rounded-sm`             | `rounded-sm` / `rounded-xs`             |
| `ring` (was 3px default)             | `ring-3`                                |

**Important modifier change:** `!important` marker moves to the end: `text-red-500!` not `!text-red-500`.

**Config is CSS-first** — no `tailwind.config.js`. Theme customisation lives in a `.css` file using `@theme`.

Source: https://tailwindcss.com/docs/upgrade-guide

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

Commit schema: `documentation/technical/commit-schema.md` — always read it before committing.

## Setup and local dev

See `README.md` for prerequisites, first-time setup, daily workflow, and all useful URLs.
