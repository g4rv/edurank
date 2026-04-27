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
- [x] UI components — `button`, `input`, `select`, `checkbox`, `toggle`, `container`, `modal`, `form-field`, `toast`; global `Header` with active-state nav; toast system via Context + portal in `src/providers/`
- [x] Testing — Vitest + Husky pre-push hook (runs format check, lint, tsc, tests)
- [x] Professor detail/edit page — `src/app/professors/[id]/`, field-level access control by role/division
- [x] Professor list page — `src/app/professors/`, search + filter by name/rank/position/degree/department/faculty
- [x] Admin hub — removed; replaced by standalone top-level pages
- [x] Navigation restructure — `/faculties`, `/departments`, `/divisions` standalone pages; role-aware header nav
- [x] Modal component — `src/components/ui/modal.tsx`, native `<dialog>`, animated open/close
- [x] Professor management controls — add + delete professor on `/professors` page via modals
- [x] FormField component — unified label/input/error layout, replaces ad-hoc Row/Field duplicates
- [x] Professor schema cleanup — Cyrillic-only name validation, `z.email()`, Prisma enum refs, `departmentId` in base schema
- [x] Professor department field — wired end-to-end; editable by admin in the detail form; `professorSchema` is now the single source (redundant `professors/schema.ts` removed)
- [x] Add professor form — extracted from `add-professor-button.tsx` into `add-professor-form.tsx`; button file is now trigger + modal shell only

---

## Code quality — eliminate duplication

Patterns copy-pasted across files. Fix in this order — each item is self-contained.

### 1. Centralise schemas — `src/lib/schemas/`

Schemas are shared data contracts, not route logic. Current location (`[id]/schema.ts`) is misleading.

- [ ] Create `src/lib/schemas/professor.ts` — move content from `src/app/professors/[id]/schema.ts`
- [ ] Delete `src/app/professors/[id]/schema.ts`
- [ ] Update all imports (`professor-form.tsx`, `add-professor-button.tsx`, actions, etc.)

### 2. Centralise auth role constants — `src/lib/roles.ts`

`['ADMIN', 'EDITOR']` is hardcoded as a string literal in 4 action files. One rename breaks everything.

- [ ] Create `src/lib/roles.ts`:
  ```ts
  export const ADMIN_ROLES = ['ADMIN'] as const;
  export const EDITOR_ROLES = ['ADMIN', 'EDITOR'] as const;
  ```
- [ ] Use in auth guards and anywhere else roles are compared

### 3. Auth guard helpers — `src/lib/auth-guards.ts`

`requireAdminOrEditor()` and `requireAdmin()` are copy-pasted into every action file.

- [ ] Create `src/lib/auth-guards.ts` using `ADMIN_ROLES` / `EDITOR_ROLES` from `roles.ts`
- [ ] Replace local definitions in `professors/actions.ts`, `departments/actions.ts`, `faculties/actions.ts`, `divisions/actions.ts`
- [ ] Add `src/lib/auth-guards.test.ts`

### 4. Label mappings — remove duplicate in `professor-form.tsx`

`professor-form.tsx` defines `ACADEMIC_RANK_LABELS`, `ACADEMIC_POSITION_LABELS`, `SCIENTIFIC_DEGREE_LABELS` inline.
`src/lib/professor-labels.ts` already has the same data. Two places to update means drift over time.

- [ ] Delete the three inline label objects from `professor-form.tsx`
- [ ] Import `RANK_LABELS`, `POSITION_LABELS`, `DEGREE_LABELS` from `@/lib/professor-labels`
- [ ] Update all references in `professor-form.tsx`

### 5. Section UI component — `src/components/ui/section.tsx`

The white card-with-header pattern will appear on every entity detail page.
Currently a local `Section` function in `professor-form.tsx` — can't be reused.
The compact modal group style (`FormSection`) is simple enough to inline where needed.

- [ ] Create `src/components/ui/section.tsx` — white bordered card with titled header
- [ ] Export from `src/components/ui/index.ts`
- [ ] Replace the local `Section` function in `professor-form.tsx` with the shared component
- [ ] Use on other entity detail pages as they are built

### 6. `useActionToast` hook — `src/hooks/use-action-toast.ts`

`division-section.tsx`, `department-section.tsx`, `faculty-section.tsx` all repeat the same
`useEffect` + `useToast` pattern (~9 lines each).

- [ ] Create `src/hooks/use-action-toast.ts`
- [ ] Replace the repeated blocks in all three components

### 7. Naming — no single-letter identifiers

Single-letter names (`n`, `e`, `d`, `p`, etc.) used as function or parameter names make code unreadable.
Convention: every identifier must be descriptive enough to understand without context.

- [ ] Rename `n()` in `professors/actions.ts` → extract into `src/lib/form-coerce.ts` as `nullableString(v)` / `nullableNumber(v)`
- [ ] Audit the rest of the codebase for other single-letter names and rename them

---

## Roadmap

### Phase 1 — Entity detail pages

Every section that has a list page needs a matching detail page. Professors already have this.
Departments, faculties, and divisions need the same treatment — richer info, edit controls, related data.

- [ ] `/departments/[id]` — department detail: name, faculty, list of professors in this department, edit controls for admin/editor
- [ ] `/faculties/[id]` — faculty detail: name, list of departments, list of professors, edit controls
- [ ] `/divisions/[id]` — division detail: name, which fields this division manages, list of editors assigned to it, edit controls

---

### Phase 2 — Professor self-service (USER role)

Currently only admins and editors interact with the system. Professors need their own login and the ability to edit their own subset of fields.

- [ ] Link `User` records to `Professor` records (one-to-one relation in Prisma schema + migration)
- [ ] When a USER logs in, resolve their linked professor record and determine `editableFields` from their own profile (not division-based)
- [ ] Professor sees only their own profile page — no access to the full professors list
- [ ] Invite flow — admin creates a professor account and sends credentials (email TBD, manual for now)

---

### Phase 3 — Publications and works

Professors self-report their activity. Divisions validate it before it counts toward the rating.

- [ ] Data model — `Publication` record: professor, title, description, type (event / publication / other), year, status (pending / approved / rejected), rejection reason
- [ ] Prisma migration
- [ ] Professor UI — submit new publication, view status of submitted ones, edit/delete pending ones
- [ ] Division editor UI — review queue per division, approve or reject with reason
- [ ] Approved publications feed into rating calculation (Phase 4)

---

### Phase 4 — Rating templates (UI-configurable, no code needed)

The rating table structure changes year to year. Admins define the rules from UI; old years stay frozen.

- [ ] Data model:
  - `RatingTemplate` — name, academic year, status (draft / active / archived)
  - `RatingCriterion` — template, name, description, max points, scoring rule (which field or publication type, formula)
- [ ] Prisma migration
- [ ] Admin UI — create/edit/clone templates, add/remove/reorder criteria, set point values
- [ ] Activate a template for the current year; activating archives the previous one

---

### Phase 5 — Rating calculation and snapshots

Compute scores from approved data + active template. Freeze results at year-end.

- [ ] Scoring engine — for a given professor + template, calculate score per criterion and total
- [ ] `RatingSnapshot` model — professor, template, scores per criterion, total, created at; immutable once created
- [ ] Prisma migration
- [ ] Admin triggers year-end snapshot for all professors (or per department)
- [ ] Ranked table view — professors sorted by total score, filterable by department/faculty/year

---

### Phase 6 — Visualization

Charts generated from snapshot data, comparable across years.

- [ ] Per-professor score breakdown chart (bar chart by criterion)
- [ ] Department average score over years (line chart)
- [ ] Faculty-wide ranked distribution

---

### Phase 7 — Document generation (deferred)

- [ ] PDF export of rating table — React component → Puppeteer → PDF
- [ ] Document parser — upload a professor's CV or publication list (PDF/DOCX), auto-extract structured fields using `pdf-parse` / `mammoth` + Claude API
- [ ] Liquid/template-based custom document generation (if needed beyond PDF export)

---

## Deferred

- [ ] File uploads — storage provider not chosen yet (candidates: RustFS, Garage); needed before document parser in Phase 7
- [ ] Email notifications — invite flow and publication status updates; do not build until confirmed
