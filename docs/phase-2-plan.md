# Phase 2 — Rating System: Implementation Plan

> Source design: `memory/phase2-rating-system.md` (full context — read it first).
> This file = the build plan for Linear. Milestones map to Linear **Projects/Milestones**,
> issues map to Linear **Issues**, steps are the **sub-tasks / checklist** inside each issue.

## Decisions locked (2026-07-01, updated 2026-07-02)

- **Source of truth for structure:** `edu-reference/Проєкт рейтинг 2026.xlsx` — Sheet 1 = final 2026 structure, Sheet 2 = 2025→2026 diff. **Finished, not a draft.** Build the catalogue/scoring/forms from THIS, not the old `sections/розділ *.md` forms.
- **Active template = 2026.**
- **Scope:** full pipeline — submission → verification → scoring → rating tables → PDF/graphs → publication verification.
- **Approval auth:** an editor may approve/enter an activity only when their division `==` `ActivityType.verifyingDivisionId`. No new permission table.
- **Divisions/actors = 6:** `ННВ, ННЦЗЯО, ВМЗ, ВА` + two new — `відділ кадрів` (HR) and `навчальний відділ`. All are ordinary `Division` rows with editors. The 2026 "Дані внесені" column is the authoritative who-enters mapping.
- **Year cycle:** admin explicitly opens/closes a year. Template clones across years; changing it each year is optional, not required.
- **Direct entry:** division-managed values are `APPROVED` immediately on save (no queue).

### 2026 scoring specifics (feed M1/M2)

- **Category А publications** split by quartile: Q1=600, Q2=500, Q3-4/none=400 → quartile select.
- **Moodle (section 5) = GATE (all-or-nothing).** Full points only if ALL six materials present, else 0. Розроблення=150, Оновлення=50. The old %/coefficient + elective ×1.25 model is REMOVED.
- **Науковий ступінь** has "за спеціальністю кафедри" tiers in the score (replaces old `degreeMatchesDepartment` boolean).
- **Removed in 2026 (do NOT build):** article "не менше 5 ст" (pages/authors formula), "відгуки на автореферат", "рецензування МАН".

## Decisions still open (resolve during the milestone noted)

- **Appeals to a closed year** — can an NPP submit into a `CLOSED` year? _(decide in M7)_
- **Recompute strategy** — recompute `RatingEntry` synchronously on each approve/remove, or lazily on read? _(decide in M6; default: synchronous, small scale ~300 staff)_
- **Publication verification** — what "verified" means exactly (manual editor flag vs external DOI/WoS check). _(decide in M9)_

## Conventions (follow existing Phase 1 patterns)

- `actions.ts` per route folder, `'use server'`. Pattern: **auth → role/division check → Zod parse → `db.$transaction` (mutate + `auditLog.create` via `diffChanges`) → `revalidatePath`**.
- Queries read-only in `lib/queries/`, noun-first names.
- Zod schemas in `validations/`, one file per entity; shared client + server.
- New model field → add Ukrainian label to `FIELD_LABELS` in `lib/labels.ts`.
- All permission checks server-side. UI hiding is cosmetic only.
- All UI text Ukrainian; no Ukrainian strings in logic files.
- Tests colocated `.test.ts`. **Scoring engine must be unit-tested.**
- After any schema change: `pnpm db:migrate --name <x>` then `pnpm db:generate`.

---

# Milestone M0 — Data model & seed

**Goal:** schema, migration, and a seeded 2025 template with all activity types. Nothing visible yet.
**Ship criterion:** `pnpm db:reset` builds a full template; Prisma Studio shows ~54 `ActivityType` rows.

### Issue M0.1 — Prisma schema: rating models

- [ ] Add enums: `InputSource { NPP_SUBMISSION, DIVISION_MANAGED }`, `ActivityStatus { PENDING, APPROVED, REMOVED }`, `SubmittedByRole { NPP, DIVISION }`, `RatingEntryStatus { OPEN, CLOSED }`.
- [ ] `RatingTemplate` (id, year `@unique`, name, isActive, timestamps).
- [ ] `RatingSection` (id, templateId, number 1–5, title; `@@unique([templateId, number])`).
- [ ] `ActivityType` (id, templateId, sectionId, order, code, label, coefficient `Float`, coefficientNote, inputSource, verifyingDivisionId nullable→Division, isActive; `@@unique([templateId, code])`, index on `verifyingDivisionId`).
- [ ] `Activity` (id, staffId, activityTypeId, year, evidence `Json`, computedValue `Float`, score `Float`, status, submittedByRole, approvedByUserId/approvedAt, removedByUserId/removedAt/removeReason, timestamps; indexes on `[staffId, year]`, `[activityTypeId, status]`).
- [ ] `RatingEntry` (id, staffId, year, section1Score…section5Score, totalScore, status, snapshot `Json`, closedAt, closedByUserId; `@@unique([staffId, year])`).
- [ ] Relations back-references on `Staff`, `Division`, `User`.

### Issue M0.2 — Migration + client

- [ ] `pnpm db:migrate --name phase2_rating_models`
- [ ] `pnpm db:generate`, `pnpm type-check` green.

### Issue M0.3 — Activity-type catalogue (constants)

- [ ] `lib/rating/activity-types.ts` — declare every activity type **from `Проєкт рейтинг 2026.xlsx` Sheet 1**: `code`, `section`, `order`, `label`, `coefficient`, `inputSource`, `verifyingDivision` (by name/key), `coefficientNote` (the "Критерії"/"D" column).
- [ ] Map each row's `verifyingDivision` from the **"Дані внесені" column** (відділ кадрів / навчальний / ННЦЗЯО / ВМЗ / ННВ / ВА; blank = NPP self-submission).
- [ ] Include the 2026-only shapes: quartile tiers on cat. А, gate model on moodle, degree "за спеціальністю кафедри" tiers, стажування в Україні, зустріч з експертною групою.
- [ ] Do NOT include the removed items (article 5-ст, відгуки автореферат, рецензування МАН).

### Issue M0.4 — Seed template

- [ ] Extend `prisma/seed.ts`: seed the **6 divisions** (add `відділ кадрів`, `навчальний відділ`) if missing.
- [ ] Create **2026** `RatingTemplate` (isActive) + 5 sections + all activity types from the catalogue, linked to divisions by name.
- [ ] Idempotent (upsert by `[templateId, code]`).
- [ ] `pnpm db:reset` runs clean.

### Issue M0.5 — Labels

- [ ] Add rating field labels to `FIELD_LABELS` in `lib/labels.ts` (for audit-log diffs on Activity: status, score, removeReason, etc.).
- [ ] Add section-title + status label maps in `lib/rating/labels.ts`.

---

# Milestone M1 — Scoring engine

**Goal:** pure, tested functions that turn evidence → score. No DB, no UI.
**Ship criterion:** `pnpm test` covers every scoring branch.

### Issue M1.1 — Formula functions

- [ ] `lib/rating/scoring.ts`: implement the **2026** formulas:
  - author sheets `pages / 24` (editions, monograph)
  - **moodle GATE:** 150 (Розроблення) or 50 (Оновлення) only if ALL six materials present, else 0. No percentages, no elective multiplier.
  - **cat. А publication:** score by quartile — Q1=600, Q2=500, Q3-4/none=400.
  - conf abroad 50/20; intl olympiad 100/80/60; ukr olympiad 80/60/40
  - intl conf org 100/80/50; ukr conf org 50/40/20; initiative topic 15/10
  - degree tiers (doctor 50/40, PhD 30/20 — "за спеціальністю кафедри" or not)
  - default `value = 1`
  - **Do NOT implement** the removed `pages / authors` article formula.
- [ ] `computeScore(code, evidence) → { computedValue, score }` where `score = computedValue × coefficient`.

### Issue M1.2 — Unit tests

- [ ] `lib/rating/scoring.test.ts` — one case per formula + edge cases (moodle: all-present vs one-missing → 0; each quartile; each select branch).

---

# Milestone M2 — Typed evidence schemas & forms registry

**Goal:** per-activity-type Zod schema + form component, keyed by `code`. The heavy milestone.
**Ship criterion:** a registry maps every code → `{ schema, FormComponent, summary }`; renders in a debug page.

### Issue M2.1 — Evidence Zod schemas

- [ ] `validations/activity-evidence.ts`: a discriminated set of schemas, one per `code` (text/select/number/url/checkbox/date fields per doc).
- [ ] `evidenceSchemaFor(code)` lookup; exhaustive over the catalogue.

### Issue M2.2 — Evidence form components

- [ ] `components/rating/evidence/` — one small RHF form component per code (reuse existing `form-field`, `select`, `combobox`, `calendar`, `switch`).
- [ ] Group repeatable ones (awards, куратор groups, проф. об'єднання) with add/remove rows.
- [ ] 2026 specifics: cat. А publication needs a **quartile select (Q1/Q2/Q3-4)**; moodle needs a **mode select (Розроблення/Оновлення) + 6 material checkboxes** with a "gate" hint (all required for points).

### Issue M2.3 — Registry + human summary

- [ ] `lib/rating/registry.ts`: `code → { schema, Form, renderSummary(evidence) }` for list/queue display.
- [ ] Dev-only test page `app/(dashboard)/admin/rating-debug/page.tsx` to render each form (delete before ship, or keep admin-gated).

---

# Milestone M3 — NPP submission flow (USER)

**Goal:** an NPP submits activities from their profile; they land `PENDING`.
**Ship criterion:** USER adds an activity, sees it PENDING; cannot submit for anyone else.

### Issue M3.1 — Query: own activities

- [ ] `lib/queries/list-activities.ts` — by staff + year, grouped by section, with status.

### Issue M3.2 — Submit action

- [ ] `app/(dashboard)/profile/actions.ts` → `createActivity`: auth USER, own `staffId` only, activity type must be `NPP_SUBMISSION` and in the active template, parse evidence via registry, `computeScore`, insert `PENDING` `submittedByRole=NPP`, audit.
- [ ] `resubmitActivity` after a REMOVE (or just allow new create).

### Issue M3.3 — Profile UI

- [ ] Extend `app/(dashboard)/profile/page.tsx`: "Мої досягнення" section — year selector, list by section, status badges (Очікує / Підтверджено / Відхилено + reason).
- [ ] "Додати досягнення" flow: pick activity type → render evidence form from registry → submit.

### Issue M3.4 — Tests

- [ ] Action test: rejects submitting for another staff, rejects DIVISION_MANAGED codes.

---

# Milestone M4 — Division verification queue (EDITOR)

**Goal:** editors approve/remove pending NPP submissions for their division's activity types.
**Ship criterion:** editor of ННВ sees only ННВ-verified pending items; approve freezes score; remove needs reason.

### Issue M4.1 — Query: approval queue

- [ ] `lib/queries/list-pending-activities.ts` — `PENDING` where `activityType.verifyingDivisionId == editor division`.

### Issue M4.2 — Approve / remove actions

- [ ] `app/(dashboard)/divisions/[id]/actions.ts` (or a `rating` route): `approveActivity`, `removeActivity(reason)`.
- [ ] Auth: editor division must equal the activity type's `verifyingDivisionId` (server-side). ADMIN allowed.
- [ ] Set status/approvedBy/removedBy, audit via `diffChanges`.

### Issue M4.3 — Queue UI

- [ ] Panel on division dashboard: pending list, evidence summary (`renderSummary`), approve / remove-with-reason buttons.

### Issue M4.4 — Tests

- [ ] Action test: editor of wrong division is rejected.

---

# Milestone M5 — Division direct-entry (EDITOR)

**Goal:** divisions enter division-managed values per NPP per year; immediately `APPROVED`.
**Ship criterion:** ННВ enters pedagogical experience for a staff, it shows APPROVED and counts in rating.

### Issue M5.1 — Entry action

- [ ] `upsertDivisionActivity`: auth via `verifyingDivisionId`, type must be `DIVISION_MANAGED`, `computeScore`, insert/update as `APPROVED` `submittedByRole=DIVISION`, audit.

### Issue M5.2 — Entry grid UI

- [ ] Division dashboard panel: NPP × managed-activity-type grid for selected year; inline entry using evidence forms.

### Issue M5.3 — Tests

- [ ] Rejects NPP_SUBMISSION codes; rejects wrong division.

---

# Milestone M6 — Rating computation & tables

**Goal:** approved activities roll up into per-staff/year rating; viewable tables.
**Ship criterion:** rating table shows 5 section totals + grand total matching sum of approved scores.

### Issue M6.1 — Recompute function

- [ ] `lib/rating/recompute.ts`: sum APPROVED `score` by section → write `RatingEntry` (section1..5, total). Called after approve / remove / direct-entry.
- [ ] Decide sync vs lazy (default sync).

### Issue M6.2 — Rating queries

- [ ] `lib/queries/get-rating.ts` (per staff/year) and `list-ratings.ts` (department/division rollup, sortable).

### Issue M6.3 — Rating table UI

- [ ] Per-staff rating table (on profile + staff detail): sections, items, scores.
- [ ] Rollup table page: staff ranked by total for a year, filter by department/division.

### Issue M6.4 — Tests

- [ ] Recompute test: approve adds, remove subtracts, matches expected totals.

---

# Milestone M7 — Year lifecycle & template admin (ADMIN)

**Goal:** admin opens/closes years and edits templates.
**Ship criterion:** admin clones 2025→2026, edits a coefficient, closes 2025 → snapshot frozen & read-only.

### Issue M7.1 — Template CRUD actions

- [ ] `app/(dashboard)/admin/rating/actions.ts`: `createTemplate`, `cloneTemplate(fromYear)`, `updateActivityType` (label/coefficient/verifyingDivision/isActive), `addActivityType`, `deactivateActivityType`. ADMIN only, audited.

### Issue M7.2 — Close year

- [ ] `closeYear(year)`: build `RatingEntry.snapshot` JSON (labels + coefficients + scores as-of-close) for every staff, set `status=CLOSED`, `closedAt/By`.
- [ ] **Decide appeals policy** — block or allow submissions into closed year (enforce in M3/M4 actions).

### Issue M7.3 — Template admin UI

- [ ] `app/(dashboard)/admin/rating/page.tsx`: list templates/years, clone button, per-section activity-type editor, close-year action with confirm modal.

### Issue M7.4 — Closed-year read-only

- [ ] All submit/approve/entry actions reject when year `CLOSED`.
- [ ] Closed-year views render from `snapshot`, not live recompute.

---

# Milestone M8 — Reports & graphs

**Goal:** PDF rating reports + visual graphs.
**Ship criterion:** download a per-staff PDF; see rating-over-time and section-breakdown charts.

### Issue M8.1 — PDF generation

- [ ] Choose approach (server-side React-PDF / html-to-pdf). Add dep.
- [ ] Per-staff rating report matching the Excel table layout; per-year.
- [ ] (Optional) department/division summary PDF.

### Issue M8.2 — Graphs

- [ ] Add charting lib. Rating-over-years line; section-breakdown bar/pie; department comparison.
- [ ] Embed on profile + rollup pages.

---

# Milestone M9 — Publication verification & QA

**Goal:** publication verification + end-to-end hardening.
**Ship criterion:** editor can mark publications verified; full permission audit passes.

### Issue M9.1 — Publication verification

- [ ] Decide meaning (manual verified flag vs DOI/WoS/Scopus lookup).
- [ ] Add flag/field + editor UI on category А/Б publication activities; audit.

### Issue M9.2 — Permission & security audit

- [ ] Re-verify every action: role + division/`verifyingDivisionId` + closed-year checks.
- [ ] Confirm USER can't touch others; EDITOR can't cross divisions; confidential fields unaffected.

### Issue M9.3 — UX polish

- [ ] Loading skeletons, empty states, error toasts for all new pages (match Phase 1).
- [ ] Nav/sidebar entries for new pages, role-gated.

### Issue M9.4 — Smoke test pass

- [ ] Full flow: submit → approve → direct-entry → rating → close year → PDF, as USER / EDITOR / ADMIN.

---

## Suggested order & rough sizing (solo)

| Milestone                 | What you can demo         | Rough size         |
| ------------------------- | ------------------------- | ------------------ |
| M0                        | Seeded template in Studio | 2–3 days           |
| M1                        | Tested scoring            | 1–2 days           |
| M2                        | All evidence forms render | 5–8 days (largest) |
| M3                        | NPP submits               | 3–4 days           |
| M4                        | Editor approves           | 2–3 days           |
| M5                        | Division entry            | 2 days             |
| M6                        | Rating tables             | 3–4 days           |
| **↑ core loop shippable** |                           | **~4 weeks**       |
| M7                        | Year admin                | 3–4 days           |
| M8                        | PDF + graphs              | 4–6 days           |
| M9                        | Verification + QA         | 3–5 days           |

**Full scope: ~8–10 weeks solo.** Core loop (M0–M6) is the 1-month target.
