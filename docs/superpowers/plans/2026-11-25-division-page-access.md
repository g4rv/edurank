# Division page access — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An EDITOR opens Штат, Кафедри, Факультети, Рейтинг НПП and Графіки only when their division has that page switched on (or a right of the division forces it on).

**Architecture:** Five booleans on `Division`. One pure rule (`lib/divisions/page-access.ts`) turns a division's switches and rights into a `PageAccess` and the reasons a switch is forced; one cached loader (`lib/divisions/page-access-state.ts`) answers it for the signed-in user. Every page, tab, export and link that used `role !== 'USER'` / `role === 'EDITOR'` as «may look» asks the loader instead.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-division-page-access-design.md`

## Global Constraints

- ADMIN always has every page. A USER has none of the five (their own record and headship rules are unchanged).
- Heads, deans and science deputies keep everything their position gives (`scopeOf`, `deanOf`, `scienceDeputyOf` paths in `lib/queries/scope.ts`) — the new check is only ever ADDED as another way in, never put in front of those.
- «Дані відділу» is not a switch: `canEnterDivisionData` in `app/(dashboard)/layout.tsx` stays as it is.
- Forced values are computed, never stored.
- All UI text Ukrainian; every new `Division` column gets a `FIELD_LABELS` entry.
- Server enforces; the nav and tabs only follow.

## Review Focus

1. An editor who is also a завідувач, with no switches: «Моя кафедра» and their people's Характеристика still open (test in Task 3 on `canViewAcademicRecord`).
2. A division with «Рейтинг НПП» but not «Штат»: names in `/rating` lead to the person's Рейтинг tab, not to a Профіль that refuses (Task 4 link target).
3. The person's own record: an editor always opens their OWN profile, rating and Характеристика with every switch off (Task 3 test).
4. Typing the address of a closed page, or of a closed export, gives the same answer as a USER gets today (redirect to the start page / 403), never a crash (Task 3 tests on the routes' guard helper).
5. Removing the right that forced a switch frees the switch and, if it was not ticked, closes the page on the next request (Task 1 test).

---

### Task 1: Columns and the pure rule

**Files:**

- Create: `prisma/migrations/20261125120000_division_page_access/migration.sql`
- Modify: `prisma/schema.prisma` (`model Division`)
- Create: `lib/divisions/page-access.ts`, `lib/divisions/page-access.test.ts`
- Create: `lib/divisions/page-access-state.ts`
- Modify: `lib/labels.ts` (`FIELD_LABELS`)

**Interfaces:**

- Produces:
  - Columns `canViewStaff`, `canViewDepartments`, `canViewFaculties`, `canViewRating`, `canViewCharts` — `Boolean @default(false)`.
  - `type PageKey = 'staff' | 'departments' | 'faculties' | 'rating' | 'charts'`
  - `type PageAccess = Record<PageKey, boolean>`; `ALL_PAGES: PageAccess` (all true), `NO_PAGES` (all false).
  - `interface DivisionRights { switches: PageAccess; staffEntity: boolean; departmentEntity: boolean; facultyEntity: boolean; fieldGrants: boolean; accountSwitches: boolean; canViewQualifications: boolean; canOverseeScience: boolean; canModerateRating: boolean }`
  - `forcedPages(rights: Omit<DivisionRights, 'switches'>): Partial<Record<PageKey, ForceReason[]>>` where `type ForceReason = 'staffEntity' | 'fieldGrants' | 'accountSwitches' | 'qualifications' | 'science' | 'moderation' | 'departmentEntity' | 'facultyEntity'`.
  - `divisionPageAccess(rights: DivisionRights): PageAccess` — switch OR forced.
  - `pageAccessFor(user: { role: Role; staffId?: string | null }): Promise<PageAccess>` in `page-access-state.ts`, React-`cache`d; ADMIN → `ALL_PAGES`, USER or editor without a division → `NO_PAGES`.

- [ ] **Step 1: Tests** in `page-access.test.ts`:
  - nothing on → `NO_PAGES`;
  - each switch alone opens only its page;
  - `staffEntity`, `fieldGrants`, `accountSwitches`, `canViewQualifications`, `canOverseeScience` each force `staff` with that reason;
  - `canModerateRating` forces `rating` with `'moderation'`;
  - `departmentEntity` → `departments`, `facultyEntity` → `faculties`;
  - forced reasons list every right that forces a page (two rights → two reasons).
- [ ] **Step 2:** Run `pnpm vitest run lib/divisions/page-access.test.ts` — FAIL (module missing).
- [ ] **Step 3:** Schema + migration (five `ALTER TABLE "Division" ADD COLUMN … BOOLEAN NOT NULL DEFAULT false`), the pure module, the loader (one `db.staff.findUnique` with the division's switches, `_count` of field permissions, entity permissions by entity), labels («Сторінка «Штат»», …). `pnpm db:generate`.
- [ ] **Step 4:** Tests pass; `pnpm type-check` clean.
- [ ] **Step 5:** Commit `feat(permissions): add per-division page switches and their rule`.

### Task 2: The switches on the division settings page

**Files:**

- Modify: `validations/division.ts` (settings schema: the five booleans)
- Modify: `app/(dashboard)/divisions/actions.ts` (`updateDivisionSettings` writes and audits them), `app/(dashboard)/divisions/actions.test.ts`
- Modify: `app/(dashboard)/divisions/[id]/page.tsx`, `components/division/division-settings-form.tsx`
- Modify: `components/division/division-form.tsx` only if the create form shares the schema's defaults

**Interfaces:**

- Consumes: `forcedPages`, `PageKey`, `ForceReason` (Task 1).
- Produces: a «Сторінки» group of five switches; a forced one is drawn ticked and disabled with «Увімкнено, бо відділ може: …» naming the reasons (Ukrainian labels for each `ForceReason` live in the component).

- [ ] **Step 1: Test** in `actions.test.ts`: `updateDivisionSettings` saves the five values and the audit diff names them.
- [ ] **Step 2:** FAIL. **Step 3:** implement. The forced state is computed from the form's CURRENT values of the other rights (so ticking «STAFF UPDATE» locks «Штат» at once). The stored value of a forced switch is whatever the admin last ticked — never rewritten.
- [ ] **Step 4:** Tests pass. **Step 5:** Commit `feat(division): edit page access on the division settings page`.

### Task 3: Guards — pages, record, exports, start page, nav

**Files:**

- Modify: `lib/queries/scope.ts` — `canViewAcademicRecord`: ADMIN → true; EDITOR → true only when `pageAccessFor(viewer).rating`; then own record / scope as now. Add `canViewStaffProfile(viewer, targetId)`: ADMIN, own record, or EDITOR with `.staff`.
- Modify pages (each: `redirect(startPageFor(...))` when its key is closed):
  `app/(dashboard)/staff/(list)/page.tsx` (staff), `departments/(list)/page.tsx` + `[id]/page.tsx` (departments), `faculties/(list)/page.tsx` + `[id]/page.tsx` (faculties), `rating/page.tsx` (rating), `dashboard/page.tsx` (charts).
  Edit pages keep their own entity-permission checks (those rights force the page anyway).
- Modify record: `components/staff/profile/record-header.tsx` (let in when profile OR academic record is viewable; crumb root follows `.staff`), `app/(dashboard)/staff/[id]/(record)/(profile)/page.tsx` (`canViewStaffProfile`), `rating/page.tsx` + `kharakterystyka/page.tsx` (already `canViewAcademicRecord`), `components/staff/profile/record-tab-row.tsx` / `staff-tab-list.ts` (new `showProfileTab`, `showRecordRating` flags; Характеристика tab follows `showRecordRating`).
- Modify exports: `app/api/export/ratings/route.ts` and `kharakterystyka/route.ts` (the whole-list zip: `.rating`), `rating-chart/route.ts` and `department-ranking/route.ts` (`.charts`).
- Create: `lib/divisions/start-page.ts` — `startPageFor(user, access, extras: { canEnterData: boolean; canModerate: boolean; canOverseeScience: boolean; isHeadOrDean: boolean }): string`, order: `/staff`, `/rating`, `/division-data`, `/moderation`, `/science-plans`, `/departments`, `/faculties`, `/dashboard`, then `/my-department` / `/my-faculty`, else `/profile`. Used by `app/page.tsx`, `app/(auth)/login/page.tsx` and the page guards.
- Modify nav: `app/(dashboard)/layout.tsx` passes `pageAccess`; `components/sidebar.tsx` draws each of the five from it (replacing `canSeeRating`).
- Tests: `lib/queries/scope.test.ts` (or the existing test file for it) — editor without `.rating` refused on someone else's record; editor head of the target's кафедра still allowed; editor on own record allowed. `lib/divisions/start-page.test.ts` — the order above, `/profile` fallback.

- [ ] Steps: tests → FAIL → implement → `pnpm test` + `pnpm type-check` → commit `feat(permissions): close editor pages their division has not switched on`.

### Task 4: Links that would lead nowhere

**Files (each: a name is a `Link` only when the viewer can open it; otherwise plain text):**

- `components/rating/rating-rollup-table.tsx` → person link goes to `/staff/[id]/rating` when only `.rating`, `/staff/[id]` when `.staff`, none when neither.
- `app/(dashboard)/departments/[id]/page.tsx`, `app/(dashboard)/faculties/[id]/page.tsx`, `components/department/department-table.tsx`, `components/faculty/faculty-table.tsx`, `app/(dashboard)/moderation/disciplines/page.tsx`, `components/department-rating/derived-hint.tsx`, the `linkDepartments` props in the two profile pages, `components/staff/profile/profile-crumbs.ts`.
- Heads' own screens (`my-department`, `my-faculty`, the stake grid) are NOT changed.

- [ ] Steps: implement from `pageAccessFor` passed down as props; `pnpm test` + `pnpm type-check`; commit `fix(permissions): show a name as text where its page is closed`.

### Task 5: Pre-deploy report and docs

**Files:**

- Create: `prisma/division-page-access-report.ts`; `package.json` script `db:division-page-access-report`. Read-only: per division, its editors, and per page «залишиться» / «закриється» (today every editor has the five; after = `divisionPageAccess`).
- Modify: `CLAUDE.md` (permission model: the five switches and the force rule; the command).

- [ ] Steps: run it against the local prod copy, check the output matches the spec's starting-state paragraph; commit `docs(claude): division page access`.

### Task 6: Browser check and the before/after page

- [ ] Before any code (on `main`): screenshots as an aspirantura editor (sidebar, `/rating`), an ННЦЗЯО editor (a person's record tabs), and ADMIN's division settings page.
- [ ] After: the same screens, plus the locked switch, plus a typed closed address.
- [ ] Self-contained HTML with embedded screenshots in the scratchpad; temporary accounts removed.
