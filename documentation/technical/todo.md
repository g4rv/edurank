# EduRank — Build Checklist

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
