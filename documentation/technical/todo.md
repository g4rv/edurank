# EduRank — Build Checklist

## Done

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
- [x] UI components — `button`, `input`, `select`, `checkbox`, `toggle`, `container`, `toast`; global `Header` with active-state nav; toast system via Context + portal in `src/providers/`
- [x] Testing — Vitest + Husky pre-push hook (runs format check, lint, tsc, tests)
- [x] Professor detail/edit page — `src/app/professors/[id]/`, field-level access control by role/division
- [x] Professor list page — `src/app/professors/`, search + filter by name/rank/position/degree/department/faculty
- [x] Admin hub — removed; replaced by standalone top-level pages

---

## Next up

### Navigation restructure ✓

- [x] `/faculties` — standalone page, ADMIN + EDITOR
- [x] `/departments` — standalone page, ADMIN + EDITOR
- [x] `/divisions` — standalone page, ADMIN only, «Відділи»
- [x] Header nav — role-aware: ADMIN sees all 4 links, EDITOR sees 3, USER sees none
- [x] `/admin/*` deleted

---

### Modal component ✓

- [x] `src/components/ui/modal.tsx` — uses native `<dialog>` (focus trap, Escape, backdrop built-in), animated open/close, exported from index

---

### Professor management controls (on `/professors` page)

Requires modal component above to be done first.

- [ ] Add «+» button (top-right of page header) — opens «Додати викладача» modal
  - Modal form contains ALL current professor fields (same as detail/edit page)
  - On submit: calls existing `createProfessor` server action, closes modal, shows toast
  - Visible to ADMIN + EDITOR only
- [ ] Add trash icon button on each professor row — opens «Видалити викладача?» confirmation modal
  - Shows professor name in confirmation text
  - On confirm: calls `deleteProfessor` server action, shows toast
  - Visible to ADMIN + EDITOR only
- [ ] Move `createProfessor` / `deleteProfessor` server actions to revalidate `/professors` (currently revalidates `/admin`)

---

## Deferred

- [ ] File uploads — storage provider not chosen yet (candidates: RustFS, Garage)
- [ ] Report generation — requires full data model first
- [ ] Email notifications — do not build until confirmed
