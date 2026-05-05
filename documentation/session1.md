# Session 1 — Project foundation

**Date:** 2026-05-05
**Outcome:** Full project vision aligned, tooling set up, schema designed and migrated, database seeded.

---

## Architecture decisions

### Auth

- Email + password only. No OAuth.
- NextAuth.js v5 (beta) with Prisma adapter and credentials provider.

### Permission model (two layers, both per division, both configured by ADMIN)

- **Field permissions** (`DivisionFieldPermission`) — which `Staff` fields each division's editors can edit.
- **Entity permissions** (`DivisionEntityPermission`) — which CRUD operations on Staff/Department/Faculty each division can perform.
- ADMIN: hardcoded full access, no permission rows needed.
- EDITOR role is just the gate — actual capabilities depend entirely on division permissions.
- Divisions can only be CRUD'd by ADMIN (divisions control permissions; editors touching them = privilege escalation).
- Confidential fields (e.g. `employmentRate`): ADMIN sees all, USER sees own, EDITOR never sees.
- All enforcement is server-side. Never only in UI.

### Staff model

- One `Staff` table for everyone: НПП (academic, `isNpp: true`) and non-НПП (administrative, `isNpp: false`).
- НПП must belong to a department, have academic profiles, ratings, achievements.
- Non-НПП: department is optional, no rating/achievement tracking.
- UI: unified staff list with tab filter (НПП / Адміністративний / Всі).
- Primary department is a direct FK on `Staff`. Part-time (сумісництво) departments go in `StaffDepartment` join table.

### Design direction

- Clean & modern — whitespace, card-based profiles, polished SaaS feel.
- shadcn/ui base. All UI text in Ukrainian.

### Scale

- ~300 staff, tens of editors, a couple of admins. Pagination and search needed on list views.

---

## What was built

### Tooling

- ESLint (flat config), Prettier with tailwindcss plugin, Husky + lint-staged.
- Pre-commit: lint + format + type-check.
- Pre-push: vitest (`--passWithNoTests` until real tests exist).
- Vitest with jsdom, @vitejs/plugin-react for future component tests.
- Conventional commits schema in `.claude/skills/commit/SKILL.md`.

### Dependencies installed

- `prisma`, `@prisma/client`, `@prisma/adapter-pg` — ORM with pg driver adapter (no native binary needed).
- `next-auth@beta` — auth.
- `bcryptjs` — password hashing.
- `zod` — validation.
- `react-hook-form`, `@hookform/resolvers` — form state.
- `dotenv`, `tsx` — for running seed/config outside Next.js.
- `jsdom`, `@vitejs/plugin-react` — test environment.

### Prisma schema (`prisma/schema.prisma`)

Models: `User`, `Staff`, `Faculty`, `Department`, `Division`, `StaffDepartment`, `DivisionFieldPermission`, `DivisionEntityPermission`, `AuditLog`.

Key design notes:

- `User.staffId` — nullable; admin/editor accounts may not be НПП.
- `Staff.employmentRate` — confidential field, ADMIN-only read.
- `DivisionFieldPermission.fieldName` — plain string, matches `Staff` field names exactly.
- `DivisionEntityPermission` — `@@unique([divisionId, entity, action])`.
- `AuditLog.userId` — nullable string; log entry survives user deletion.

### Docker Compose (`docker-compose.yml`)

- `postgres:16-alpine` on port 5432.
- `adminer` on port 8080.
- `prodrigestivill/postgres-backup-local` — daily backups, keeps 7 days / 4 weeks / 6 months.
- `BACKUP_PATH` env var: defaults to `./backups/`, set to NAS mount path in production for offsite copy.

### Database

- Migration `20260505101916_init` applied.
- Seed: ННВ + ННЦЗЯО divisions, one faculty, one department, one НПП professor, one ННВ editor, three user accounts (admin/editor/user), ННВ field + entity permissions.

### Package scripts

```bash
pnpm db:migrate    # prisma migrate dev (prompts for migration name)
pnpm db:seed       # prisma db seed
pnpm db:reset      # prisma migrate reset --force (wipe + reapply all migrations)
pnpm db:generate   # prisma generate (regenerate client after schema change)
pnpm db:studio     # prisma studio (GUI at localhost:5555)
```

Seed command is configured in `prisma.config.ts` under `migrations.seed` (Prisma 7 moved it from `package.json`).

### Key gotchas discovered

- Prisma 7 generated client entry point is `client.ts`, not `index.ts`. Import as `@/lib/generated/prisma/client`.
- `prisma db seed` in Prisma 7 reads `migrations.seed` from `prisma.config.ts`, not `prisma.seed` from `package.json`.
- `db:migrate` without `--name` prompts interactively — pass `--name <description>` to skip the prompt.
- Postgres volume initialized with old credentials (from a previous project) will reject new credentials. Fix: `docker compose down -v && docker compose up -d`.

---

## Folder structure (current state)

```
app/
  layout.tsx        — EduRank metadata, lang="uk"
  page.tsx          — redirects to /dashboard
  globals.css       — Tailwind v4 theme, shadcn/ui tokens

components/ui/
  button.tsx        — shadcn Button component

lib/
  utils.ts          — cn() utility
  db.ts             — PrismaClient singleton (pg adapter)
  generated/prisma/ — generated client (gitignored, run db:generate)

prisma/
  schema.prisma
  seed.ts
  migrations/
    20260505101916_init/

docker-compose.yml
prisma.config.ts    — Prisma 7 config (DATABASE_URL, seed command)
.env.example        — template (copy to .env)
.env                — gitignored, filled locally
```

---

## Next session: starting point

1. **NextAuth setup** — `lib/auth.ts`, credentials provider, session with role + staffId.
2. **Route groups** — create `app/(auth)/` and `app/(dashboard)/` with layouts.
3. **Login page** — `app/(auth)/login/page.tsx`.
4. **Dashboard shell** — sidebar + header layout, role-aware navigation.
5. **Staff list page** — first real feature page.
