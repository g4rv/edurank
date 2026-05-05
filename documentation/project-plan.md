# EduRank — Project Plan

**Deadline:** 2026-06-22
**Start:** 2026-05-05

---

## Sprint 1 — Foundation `2026-05-05` ✅

- [x] Project vision & architecture alignment
- [x] Conventional commits schema
- [x] ESLint, Prettier, Husky + lint-staged
- [x] Pre-commit: lint + type-check; pre-push: tests
- [x] Vitest with jsdom + @vitejs/plugin-react
- [x] All dependencies installed (auth, forms, validation, ORM)
- [x] Prisma 7 schema — User, Staff, Faculty, Department, Division, StaffDepartment, DivisionFieldPermission, DivisionEntityPermission, AuditLog
- [x] Docker Compose — postgres, adminer, daily backup with BACKUP_PATH
- [x] `.env` setup (DATABASE_URL, AUTH_SECRET)
- [x] First migration applied (`20260505101916_init`)
- [x] Seed data — 2 divisions, 1 faculty, 1 department, 3 users, ННВ permissions
- [x] Documentation — session1.md, updated README + CLAUDE.md

---

## Sprint 2 — Auth + Shell `2026-05-06–12`

### NextAuth

- [ ] `lib/auth.ts` — credentials provider, bcrypt verify, return role + staffId in session
- [ ] Extend NextAuth session types (`types/next-auth.d.ts`) — add `role`, `staffId`
- [ ] `middleware.ts` — redirect unauthenticated → `/login`, redirect authenticated `/` → `/dashboard`

### Route groups & layouts

- [ ] `app/(auth)/layout.tsx` — minimal centered layout for login
- [ ] `app/(auth)/login/page.tsx` — login form (email + password)
- [ ] `app/(auth)/login/actions.ts` — server action calling NextAuth `signIn`
- [ ] `app/(dashboard)/layout.tsx` — shell with sidebar + header
- [ ] `app/(dashboard)/dashboard/page.tsx` — placeholder dashboard home

### Sidebar & navigation

- [ ] `components/layout/sidebar.tsx` — role-aware nav items
- [ ] `components/layout/header.tsx` — user info + sign out button
- [ ] Navigation items visible per role:

| Item          | ADMIN | EDITOR | USER |
| ------------- | ----- | ------ | ---- |
| Дашборд       | ✓     | ✓      | —    |
| Співробітники | ✓     | ✓      | —    |
| Факультети    | ✓     | ✓      | —    |
| Кафедри       | ✓     | ✓      | —    |
| Відділи       | ✓     | ✓      | —    |
| Користувачі   | ✓     | —      | —    |
| Права доступу | ✓     | —      | —    |
| Журнал дій    | ✓     | —      | —    |
| Мій профіль   | —     | —      | ✓    |

### Validation

- [ ] `validations/auth.ts` — Zod schema for login form

---

## Sprint 3 — Staff `2026-05-13–19`

### List page (`app/(dashboard)/staff/page.tsx`)

- [ ] Server component — fetch all staff with department + division
- [ ] Tab filter: Всі / НПП / Адміністративний
- [ ] Search by name
- [ ] Pagination (server-side)
- [ ] "Додати співробітника" button — visible only if user has entity permission `STAFF:CREATE`
- [ ] Row links to profile

### Profile / detail page (`app/(dashboard)/staff/[id]/page.tsx`)

- [ ] Display all non-confidential fields
- [ ] `employmentRate` shown only to ADMIN (or USER viewing own profile)
- [ ] Part-time departments list
- [ ] Edit button — shown only if user can edit at least one field
- [ ] Academic profile section (WoS, Scopus, Google Scholar, ORCID)

### Edit (`app/(dashboard)/staff/[id]/actions.ts`)

- [ ] `updateStaff` server action — checks DivisionFieldPermission per field, ADMIN bypasses
- [ ] Only renders editable fields based on session role + division permissions
- [ ] `validations/staff.ts` — Zod schema

### Create / Delete

- [ ] `createStaff` server action — requires entity permission `STAFF:CREATE` or ADMIN
- [ ] `deleteStaff` server action — requires entity permission `STAFF:DELETE` or ADMIN
- [ ] Confirm dialog before delete

### USER profile (`app/(dashboard)/profile/page.tsx`)

- [ ] Shows own staff record
- [ ] Can edit own non-confidential, non-restricted fields
- [ ] `app/(dashboard)/profile/actions.ts`

---

## Sprint 4 — Organization `2026-05-20–26`

### Faculties (`app/(dashboard)/faculties/`)

- [ ] List page — name, department count, dean
- [ ] Create faculty — ADMIN or division with `FACULTY:CREATE`
- [ ] Edit faculty name / dean
- [ ] Delete faculty — ADMIN or division with `FACULTY:DELETE`
- [ ] `validations/faculty.ts`

### Departments (`app/(dashboard)/departments/`)

- [ ] List page — name, faculty, head, staff count
- [ ] Create department — ADMIN or division with `DEPARTMENT:CREATE`
- [ ] Edit department name / head / faculty
- [ ] Delete department — ADMIN or division with `DEPARTMENT:DELETE`
- [ ] `validations/department.ts`

### Divisions (`app/(dashboard)/divisions/`)

- [ ] List page — name, staff count, permissions summary
- [ ] Create / edit / delete — ADMIN only
- [ ] Division detail page (`[id]/page.tsx`) — stats for that division's editors (staff count, recent audit entries)
- [ ] `validations/division.ts`

---

## Sprint 5 — Admin pages `2026-05-27–Jun 2`

### User management (`app/(dashboard)/admin/users/`)

- [ ] List all users — email, role, linked staff name
- [ ] Create user — email, password, role, optional staff link
- [ ] Edit user — change role, re-link staff, reset password
- [ ] Delete user
- [ ] `validations/user.ts`

### Field permissions (`app/(dashboard)/admin/permissions/field/`)

- [ ] Per-division UI — select division → see + toggle which Staff fields they can edit
- [ ] List of all Staff fields with friendly Ukrainian labels
- [ ] Save as DivisionFieldPermission rows
- [ ] Server actions with ADMIN guard

### Entity permissions (`app/(dashboard)/admin/permissions/entity/`)

- [ ] Per-division UI — select division → checkboxes for Staff/Department/Faculty × Create/Update/Delete
- [ ] Save as DivisionEntityPermission rows
- [ ] Server actions with ADMIN guard

---

## Sprint 6 — Audit log + enforcement + polish `2026-Jun 3–9`

### Audit log

- [ ] Write to AuditLog in every mutating server action (create/update/delete)
- [ ] `app/(dashboard)/admin/audit-log/page.tsx` — paginated log with filters (entity, user, date range)
- [ ] `lib/queries/list-audit-log.ts`

### Permission enforcement (server-side)

- [ ] Shared helper `lib/permissions.ts`:
  - `canEditField(session, divisionId, fieldName): boolean`
  - `hasEntityPermission(session, divisionId, entity, action): boolean`
- [ ] All staff update actions use `canEditField` per field — reject unauthorized fields silently
- [ ] All create/delete actions use `hasEntityPermission` — throw if unauthorized

### UI polish

- [ ] Loading skeletons for list pages
- [ ] Empty states (no staff, no results)
- [ ] Form error messages in Ukrainian
- [ ] Toast notifications (success / error) for mutations
- [ ] Responsive sidebar (mobile drawer)
- [ ] 404 and unauthorized error pages

---

## Buffer week — Testing + deployment `2026-Jun 10–22`

### Tests

- [ ] Unit tests for `lib/permissions.ts`
- [ ] Unit tests for Zod schemas (`validations/`)
- [ ] Integration test for login flow

### Deployment

- [ ] Production `docker-compose.prod.yml` — remove Adminer port exposure, add app container
- [ ] `Dockerfile` for the Next.js app
- [ ] Configure `BACKUP_PATH` to university NAS mount
- [ ] Deploy to university server
- [ ] Verify migration runs cleanly on production DB
- [ ] Seed production admin user

---

## Phase 2 — Achievements & Ratings (post-MVP, no start date)

> **Do not start until source documents are provided.**

- [ ] Analyze existing forms and scoring tables from current system
- [ ] Design achievement schema (categories, coefficients, submissions, validation)
- [ ] Add Prisma models + migration
- [ ] Professor achievement submission form
- [ ] Editor validation queue (approve / decline with reason)
- [ ] Rating calculation per academic year
- [ ] Rating table display
- [ ] PDF report generation
- [ ] Graph/chart visualizations
- [ ] Publication verification workflow

---

## Cross-cutting (apply throughout all sprints)

- [ ] All UI text in Ukrainian — no hardcoded strings in logic files
- [ ] Role/permission checks in every server action — never only in components
- [ ] Zod schemas shared between client form and server action
- [ ] `lib/queries/` for all read-only DB calls, one file per entity
- [ ] Tests colocated next to source files (`.test.ts`)
