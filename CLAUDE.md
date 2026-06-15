@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

EduRank — a self-hosted university staff management platform replacing Google Sheets + a Google Apps Script pipeline (6-minute execution limit). Built by a junior front-end dev for internal use at a university science department.

## University structure

```
University
└── Faculty (факультет)          — organizational grouping only, no system role
    └── Department (кафедра)     — organizational grouping only, no system role
        └── Staff (НПП) live here

Division (відділ)                — separate cross-cutting structure, university-wide
    Examples: ННВ (навчально-науковий відділ), ННЦЗЯО (Навчально-науковий центр забезпечення якості освіти)
```

- Staff has **one primary department** and can be part-time (сумісництво) in others via a `StaffDepartment` join table.
- Staff is split into two types via `isNpp: boolean`:
  - `true` — НПП (науково-педагогічний працівник): academic staff, must belong to a department, have profiles with ratings/achievements
  - `false` — non-НПП: administrative staff (e.g. division employees), department is optional
- Both types live in the same `Staff` table; the UI shows a unified list with a filter tab (НПП / Адміністративний / Всі).
- Divisions operate university-wide — not scoped to faculty or department.

## Roles

- `ADMIN` — hardcoded full read/write, including confidential fields (e.g. ставка / work rate). No permission rows needed.
- `EDITOR` — division employee. View access to nearly all pages. What they can actually **do** is entirely determined by their division's configured permissions (see below). Not all editors have the same capabilities.
- `USER` — is a staff member (НПП). Can only view and edit their own profile, and submit achievements via forms.

## Permission model (two layers, both per division, both configured by ADMIN)

**Layer 1 — Field permissions (`DivisionFieldPermission` table)**
Which fields on a `Staff` record each division's editors can edit. Example: ННВ can edit `academicRank` and `employmentRate`; ННЦЗЯО can edit `courseCount`.

**Layer 2 — Entity permissions (`DivisionEntityPermission` table)**
Which CRUD operations on top-level entities each division can perform. Example: ННВ can create/delete Staff, Departments, Faculties. Another division may have none of these.

Rules:

- Divisions themselves can **only** be created/deleted by `ADMIN` — never by editors (divisions control permissions; editors touching them would be privilege escalation).
- Confidential fields (e.g. ставка): only `ADMIN` can read them. `EDITOR` never sees them. `USER` sees only their own.
- All permission enforcement is **server-side** — never only in UI components.

## Stack

**Current:**

- Next.js 16.2.4 (App Router, React 19, Turbopack for dev)
- TypeScript (strict mode)
- Tailwind CSS v4 — configured via CSS `@theme` directive, no `tailwind.config.js`
- ESLint with `eslint-config-next`

**Auth:** Email + password. No OAuth. NextAuth.js with Prisma adapter and credentials provider.

**Scale:** ~300 staff, tens of editors, a couple of admins.

**Design direction:** Clean & modern — whitespace, card-based profiles, polished SaaS feel. shadcn/ui base. All UI text in Ukrainian.

**Also installed:**

- Prisma 7 — ORM + migrations (`prisma/schema.prisma` is source of truth)
- PostgreSQL 16 — via Docker
- NextAuth.js v5 beta — auth (not yet wired up)
- Zod — schema validation
- React Hook Form + @hookform/resolvers — form state
- bcryptjs — password hashing
- Docker Compose — postgres + adminer + backup service

**Planned (not yet installed):**

- Nothing blocking — all deps are in place

## Commands

```bash
pnpm dev              # dev server (Turbopack)
pnpm build            # production build
pnpm start            # production server
pnpm lint             # ESLint
pnpm type-check       # tsc --noEmit
pnpm test             # Vitest (--passWithNoTests until tests exist)

pnpm db:migrate       # prisma migrate dev (pass --name <x> to skip prompt)
pnpm db:seed          # prisma db seed
pnpm db:reset         # prisma migrate reset --force (wipe + reapply, dev only)
pnpm db:generate      # prisma generate (run after any schema change)
pnpm db:studio        # Prisma Studio at localhost:5555
docker compose up -d  # start all services
```

## Prisma 7 notes

Prisma 7 differs significantly from earlier versions:

- **No `url` in `schema.prisma`** — database URL lives in `prisma.config.ts`, read via `dotenv/config` from `.env`.
- **Client entry point is `client.ts`**, not `index.ts`. Always import as `@/lib/generated/prisma/client`.
- **Generated client is gitignored** — run `pnpm db:generate` after `pnpm install` or after any schema change.
- **Seed config** lives in `prisma.config.ts` under `migrations.seed`, not in `package.json`.
- **Driver adapter required** — uses `@prisma/adapter-pg` (pure Node.js, no native binary engines needed).
- **`db:migrate --name <x>`** — pass `--name` flag to skip the interactive name prompt.

## Folder structure

```
app/
  (auth)/                         ← unauthenticated routes
    login/
    layout.tsx
  (dashboard)/                    ← all authenticated routes, shared dashboard shell
    admin/                        ← ADMIN-only pages
      permissions/
        field/                    ← configure DivisionFieldPermission per division
          actions.ts
          page.tsx
        entity/                   ← configure DivisionEntityPermission per division
          actions.ts
          page.tsx
      users/                      ← manage user accounts
        actions.ts
        page.tsx
      audit-log/
        page.tsx
    staff/                        ← ADMIN + EDITOR (НПП + non-НПП unified list)
      [id]/
        actions.ts
        page.tsx
      actions.ts
      page.tsx
    faculties/
      actions.ts
      page.tsx
    departments/
      actions.ts
      page.tsx
    divisions/
      [id]/                       ← division detail page (stats for editors of that division)
        page.tsx
      actions.ts
      page.tsx
    profile/                      ← USER only: own profile + achievement submission
      actions.ts
      page.tsx
    layout.tsx                    ← shared dashboard shell (sidebar + header)
  globals.css
  layout.tsx                      ← root layout
  page.tsx                        ← redirects to /dashboard

components/
  ui/                         ← shadcn base components (Button, Input, etc.)
  [feature]/                  ← feature-specific components (e.g. components/professor/)

lib/
  db.ts                       ← Prisma client singleton
  auth.ts                     ← NextAuth config
  utils.ts                    ← cn() and other shared utilities (shadcn convention)
  queries/                    ← read-only DB functions, one file per entity

validations/                  ← Zod schemas, one file per entity

types/
  index.ts

hooks/                        ← custom React hooks

prisma/
  schema.prisma
  seed.ts
```

## Phase 2 — Achievement & Rating system (not yet designed)

Do not implement until source documents are provided. What we know so far:

- Professors submit achievements (publications, conference participation, patents, grants, teaching innovations, etc.)
- Each achievement type has a predefined scoring coefficient
- Submissions go into a pending queue; the responsible division's editors validate them (approve / decline with reason)
- Approved submissions add to the professor's rating for the current academic year
- Which division validates which achievement types is configurable
- Output: rating tables, graphs, PDF reports, publication verification
- Documents and forms from the current system will be provided for analysis before any schema work begins

## Naming conventions

- Files and folders: `kebab-case` everywhere
- React component exports: `PascalCase`
- `actions.ts` colocated inside each feature route folder, `'use server'` at top of file
- Queries (`lib/queries/`): noun-first (`get-professor.ts`, `list-divisions.ts`)
- Zod schemas (`validations/`): entity name (`professor.ts`, `division.ts`)
- Hooks (`hooks/`): `use` prefix, camelCase (`useProfessorForm.ts`)
- Tests: colocated next to the file they test, `.test.ts(x)` suffix

## Audit log

Mutations use `diffChanges` from `lib/audit.ts` to capture before/after state in `AuditLog.changes` (JSON). The audit log page renders these diffs using `FIELD_LABELS` from `lib/labels.ts`.

**When adding a new field to any model**, also add its Ukrainian label to `FIELD_LABELS` in `lib/labels.ts`. When adding a new entity with mutations, wire up `diffChanges` in its `actions.ts` following the pattern in existing action files.

## Key conventions

- Import alias `@/*` maps to project root (e.g. `@/lib/db`, `@/components/ui`)
- App Router only — no Pages Router
- Server Actions for all mutations — no separate REST API layer
- Zod schemas are the single source of truth for validation — shared between client form and server action
- Role checks in server actions and queries, never only in components
- All UI text in Ukrainian — no hardcoded Ukrainian strings in logic files, only in components
- Add tests whenever practical — colocated, not in a separate test directory
- `lib/utils.ts` — `cn()` and shared utilities (shadcn convention, do not move)

## Tailwind v4 + shadcn conventions

- No `tailwind.config.js` — configure via `@theme` directive in `app/globals.css`
- Use Tailwind utility classes; avoid arbitrary values (`[value]`) when a standard utility exists
- Follow shadcn/ui patterns for all base UI components
- PostCSS plugin: `@tailwindcss/postcss`

## Next.js 16 notes

This is Next.js 16 with React 19 — APIs and conventions differ from older versions. Before writing any routing, data-fetching, or caching code, check `node_modules/next/dist/docs/` for current behavior. Do not rely on pre-2025 Next.js knowledge.

## Tailwind v4 notes

Tailwind v4 has no `tailwind.config.js`. Configuration (custom colors, fonts, spacing) is done in `app/globals.css` using the `@theme` directive. The PostCSS plugin is `@tailwindcss/postcss`.
