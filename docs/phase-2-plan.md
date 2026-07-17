# Phase 2 — Rating System: Implementation Plan

> Source design: `memory/phase2-rating-system.md` (full context — read it first).
> This file = the build plan for Linear. Milestones map to Linear **Projects/Milestones**,
> issues map to Linear **Issues**, steps are the **sub-tasks / checklist** inside each issue.

> **Interleaved refactor — `docs/profile-account-merge.md`** (decided 2026-07-09): merge `User` into
> `Staff` (one profile per person; email-invite activation; role dropdown on the personnel page;
> `/admin/users` deleted). Slotted **between M5.1/M5.2 and the M5 entity-first flows** — every later
> milestone adds more `User` foreign keys, so it is cheapest now. Precondition before starting: browser
> test of `/moderation` and `/division-data` on current code.

## Decisions locked (2026-07-01, updated 2026-07-02)

- **Source of truth for structure:** `edu-reference/Проєкт рейтинг 2026.xlsx` — Sheet 1 = final 2026 structure, Sheet 2 = 2025→2026 diff. **Finished, not a draft.** Build the catalogue/scoring/forms from THIS, not the old `sections/розділ *.md` forms.
- **Active template = 2026.**
- **Scope:** full pipeline — submission → verification → scoring → rating tables → PDF/graphs → publication verification.
- **Input model (updated 2026-07-02, supersedes the old queue design):** «Дані внесені» division rows = that division enters values directly in its own panel (counts immediately; `verifyingDivisionId` = that division). Blank rows = NPP self-report from profile, **auto-approved on submit** (`verifyingDivisionId = null`) — there is NO pre-approval queue. Post-moderation instead: **ННВ editors + ADMIN** can discard an NPP self-report with a reason; the entering division (+ADMIN) manages its own rows. No new permission table.
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
- **Publication verification** — what "verified" means exactly (manual editor flag vs external DOI/WoS check). _(decide in M9)_

Resolved earlier: recompute strategy = synchronous in-transaction (see M6.1).
Resolved 2026-07-09:

- **«Разова» спецрада** — same points as a permanent one for now; the ВА flow stores the flag as informational evidence so the rule can change without losing data. (Source of the flag: `Дані Аспірантура.xlsx`, sheet «Спеціалізовані вчені ради».)
- **Citation profile links** — NO extra URL evidence field. h-index values will be auto-filled later by a separate scraper project; until then citation items are plain numbers entered by ННВ like any ННВ-managed type.

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

**Goal:** schema, migration, and a seeded 2026 template with all activity types. Nothing visible yet.
**Ship criterion:** `pnpm db:reset` builds a full template; Prisma Studio shows 67 `ActivityType` rows. **(DONE 2026-07-02)**

### Issue M0.0 — Extract the 2026 catalogue from Excel (BLOCKER — do first)

> The only extracted analysis in the repo (`edu-reference/rating-ref-analysis.md`) describes the OLD 2025 file.
> `Проєкт рейтинг 2026.xlsx` has never been parsed into a readable form — M0.3 cannot start without this.

- [x] Parse `edu-reference/Проєкт рейтинг 2026.xlsx` (script, e.g. `xlsx` package or Python) — Sheet 1 (final structure) and Sheet 2 (2025→2026 diff).
- [x] Write `docs/rating-2026-catalogue.md`: one table per section — code, label, "Критерії" note, coefficient/points, "Дані внесені" (who enters), evidence fields needed. Human-reviewable, checked in.
- [x] Include the short→full division name map (sheet uses `ННВ`, `ННЦЗЯО`, `ВМЗ`, `ВА`, `відділ кадрів`, `навчальний відділ`; DB uses full names like `Навчально-науковий відділ`).
- [x] **User reviews the catalogue before M0.3 is built from it.**

### Issue M0.1 — Prisma schema: rating models

- [x] Add enums: `InputSource { NPP_SUBMISSION, DIVISION_MANAGED }`, `ActivityStatus { PENDING, APPROVED, REMOVED }`, `SubmittedByRole { NPP, DIVISION }`, `RatingYearStatus { OPEN, CLOSED }`.
- [x] `RatingTemplate` (id, year `@unique`, name, isActive, **status `RatingYearStatus` @default(OPEN), closedAt, closedByUserId** — year open/closed lives HERE, not on `RatingEntry`: a staff with no entry yet must still hit the closed-year check).
- [x] `RatingSection` (id, templateId, number 1–5, title; `@@unique([templateId, number])`).
- [x] `ActivityType` (id, templateId, sectionId, order, code, label, coefficient `Float`, coefficientNote, inputSource, verifyingDivisionId nullable→Division, isActive; `@@unique([templateId, code])`, index on `verifyingDivisionId`).
- [x] `Activity` (id, staffId, activityTypeId, year, evidence `Json`, computedValue `Float`, score `Float`, status, submittedByRole, approvedByUserId/approvedAt, removedByUserId/removedAt/removeReason, timestamps; indexes on `[staffId, year]`, `[activityTypeId, status]`).
  - **No `@@unique([staffId, activityTypeId, year])`** — repeatable NPP types legitimately have multiple rows. Direct-entry upsert (M5) uses find-then-update in a transaction instead.
  - **`year` is denormalized** (for indexes/queries) — actions must DERIVE it from `activityType.template.year`, never accept it from the client.
- [x] `RatingEntry` (id, staffId, year, section1Score…section5Score, totalScore, snapshot `Json`; `@@unique([staffId, year])`). No status column — year status is on the template.
- [x] Relations back-references on `Staff`, `Division`, `User`.

### Issue M0.2 — Migration + client

- [x] `pnpm db:migrate --name phase2_rating_models`
- [x] `pnpm db:generate`, `pnpm type-check` green.

### Issue M0.3 — Activity-type catalogue (constants)

- [x] `lib/rating/activity-types.ts` — declare every activity type **from `docs/rating-2026-catalogue.md` (produced in M0.0)**: `code`, `section`, `order`, `label`, `coefficient`, `inputSource`, `verifyingDivision` (short key, resolved via the division name map), `coefficientNote` (the "Критерії"/"D" column).
- [x] Map each row's `verifyingDivision` from the **"Дані внесені" column** (відділ кадрів / навчальний / ННЦЗЯО / ВМЗ / ННВ / ВА; blank = NPP self-submission).
- [x] Include the 2026-only shapes: quartile tiers on cat. А, gate model on moodle, degree "за спеціальністю кафедри" tiers, стажування в Україні, зустріч з експертною групою.
- [x] Do NOT include the removed items (article 5-ст, відгуки автореферат, рецензування МАН).

### Issue M0.4 — Seed template

- [x] Extend `prisma/seed.ts`: seed the **6 divisions** (add `відділ кадрів`, `навчальний відділ`) if missing. Existing 4 are seeded under FULL names (`Навчально-науковий відділ`, …) — use the same convention and resolve catalogue short keys through the name map.
- [x] Create **2026** `RatingTemplate` (isActive) + 5 sections + all activity types from the catalogue, linked to divisions by name.
- [x] Idempotent (upsert by `[templateId, code]`).
- [x] `pnpm db:reset` runs clean.

### Issue M0.5 — Labels

- [x] Add rating field labels to `FIELD_LABELS` in `lib/labels.ts` (for audit-log diffs on Activity: status, score, removeReason, etc.).
- [x] Add section-title + status label maps in `lib/rating/labels.ts`.

---

# Milestone M1 — Scoring engine

**Goal:** pure, tested functions that turn evidence → score. No DB, no UI.
**Ship criterion:** `pnpm test` covers every scoring branch. **(DONE 2026-07-02 — 25 tests)**

> Decision locked in M1: **one Activity row = one item.** Repeatable achievements (each award,
> each curated group, each conference…) are submitted one at a time; caps like «не більше 5»
> are enforced in the submit action by counting existing rows. Evidence option keys are defined
> in `SELECT_OPTION_POINTS` (`lib/rating/scoring.ts`) — M2 schemas/forms must reuse them.

### Issue M1.1 — Formula functions

- [x] `lib/rating/scoring.ts`: implement the **2026** formulas:
  - author sheets `pages / 24` (editions, monograph)
  - **moodle GATE:** 150 (Розроблення) or 50 (Оновлення) only if ALL six materials present, else 0. No percentages, no elective multiplier.
  - **cat. А publication:** score by quartile — Q1=600, Q2=500, Q3-4/none=400.
  - conf abroad 50/20; intl olympiad 100/80/60; ukr olympiad 80/60/40
  - intl conf org 100/80/50; ukr conf org 50/40/20; initiative topic 15/10
  - degree tiers (doctor 50/40, PhD 30/20 — "за спеціальністю кафедри" or not)
  - default `value = 1`
  - **Do NOT implement** the removed `pages / authors` article formula.
- [x] `computeScore(code, evidence) → { computedValue, score }` where `score = computedValue × coefficient`.

### Issue M1.2 — Unit tests

- [x] `lib/rating/scoring.test.ts` — one case per formula + edge cases (moodle: all-present vs one-missing → 0; each quartile; each select branch).

---

# Milestone M2 — Typed evidence schemas & forms registry

**Goal:** per-activity-type Zod schema + form rendering, keyed by `code`. The heavy milestone.
**Ship criterion:** a registry resolves every code → `{ def, fields, schema }` + summary; renders in a debug page. **(DONE 2026-07-02; built leaner than planned — field specs + ONE generic renderer instead of 67 per-code components; playground reviewed by user 2026-07-06)**

### Issue M2.1 — Evidence Zod schemas

- [x] `validations/activity-evidence.ts`: schemas generated from `EVIDENCE_FIELDS` specs (`lib/rating/evidence-fields.ts`), one per `code`.
- [x] `evidenceSchemaFor(code)` lookup; exhaustive over the catalogue.

### Issue M2.2 — Evidence form components

- [x] One generic `components/rating/evidence-fields.tsx` renderer driven by the field specs (instead of a component per code — same result, far less code).
- [x] Repeatable items = one Activity per entry (no add/remove row groups): the NPP submits the form once per award / group / conference. Caps («не більше 5») enforced server-side in M3.
- [x] 2026 specifics: cat. А quartile select (Q1/Q2/Q3-4); moodle mode select (Розроблення/Оновлення) + 6 material checkboxes (gate).

### Issue M2.3 — Registry + human summary

- [x] `lib/rating/registry.ts`: `activityTypeMeta(code)` → `{ def, fields, schema }` + `summarizeEvidence(code, evidence)` for list/audit display.
- [x] Admin-gated playground `app/(dashboard)/admin/rating-debug/page.tsx` with section + item selects, Ukrainian labels.

---

# Milestone M3 — NPP submission flow (USER)

**Goal:** an NPP submits activities from their profile; they are **auto-approved** and count immediately.
**Ship criterion:** USER adds an activity, sees it APPROVED with its score; cannot submit for anyone else.

> **DONE (commit `d244160`).** Built as a dedicated `/achievements` route («Мій рейтинг»), not a profile-page
> extension: cleaner separation, profile stays personal-data-only. NPP can also hard-DELETE their own
> APPROVED self-report (mistake fix); no edit — delete + re-add covers it.

### Issue M3.1 — Query: own activities

- [x] `lib/queries/list-activities.ts` — by staff + year, grouped by section, with status.

### Issue M3.2 — Submit action

- [x] `app/(dashboard)/achievements/actions.ts` → `createActivity`: auth USER, own `staffId` only, activity type must be `NPP_SUBMISSION`, in the active template, and template `status=OPEN`; **derive `year` from the template, never from client input**; parse evidence via registry, `computeScore`, insert **`APPROVED`** `submittedByRole=NPP` (auto-approve, score frozen at submit), audit, recompute rating.
- [x] `lib/rating/recompute.ts` is **pulled forward from M6.1** — the submit action is its first caller (in-transaction, synchronous).
- [x] Enforce «не більше 5» caps (conf_abroad, conf_ukraine) by counting existing non-REMOVED rows (`maxPerYear` in the catalogue).
- [x] Resubmit after a discard = new create (old row stays `REMOVED` with reason).

### Issue M3.3 — Profile UI

- [x] `/achievements` = «Мій рейтинг» read-only rating table (5 sections, subtotals, grand total; `RatingTable` built generic for M6 reuse); `/achievements/[section]` = that section's items + status badges.
- [x] "Додати досягнення" flow: pick activity type → render evidence form from registry (`components/rating/evidence-fields.tsx`) → submit. Sidebar: «Мій рейтинг» + «Додати активність» (Розділ 1–5).

### Issue M3.4 — Tests

- [x] Action test (`achievements/actions.test.ts`): rejects submitting for another staff, rejects DIVISION_MANAGED codes.

---

# Milestone M4 — Discard flow & oversight (ННВ + ADMIN)

**Goal:** post-moderation — ННВ editors and ADMIN can discard a wrong NPP self-report with a reason.
**Ship criterion:** ННВ editor discards an entry → score leaves the rating, NPP sees the reason and can resubmit; other divisions' editors cannot discard.

> **DONE (commit `8874a37`).** Note: the discard reason is write-once — no edit-reason action exists
> (workaround: NPP resubmits, moderator discards again). Add `updateRemoveReason` later if it hurts.

### Issue M4.1 — Query: recent self-reports

- [x] `lib/queries/list-npp-activities.ts` — recent `APPROVED` NPP self-reports (`inputSource=NPP_SUBMISSION`), by year, for the oversight panel.

### Issue M4.2 — Discard action

- [x] `removeActivity(id, reason)` in `app/(dashboard)/moderation/actions.ts`: auth = ADMIN, or EDITOR whose division is ННВ (`canModerateRating` in `lib/rating/moderation.ts`). Reject if template `status=CLOSED`. Reason required, ≤500 chars.
- [x] Set `status=REMOVED`, removedBy/removedAt/removeReason, audit via `diffChanges`, recompute rating.

### Issue M4.3 — Oversight UI

- [x] `/moderation` page («Модерація рейтингу», sidebar link for ННВ editors + ADMIN): list of NPP self-reports with evidence summary, discard-with-reason button, year selector.

### Issue M4.4 — Tests

- [x] Action test (`moderation/actions.test.ts`): editor of a non-ННВ division is rejected; reason is required; closed year rejected.

---

# Milestone M5 — Division direct-entry (EDITOR)

**Goal:** divisions enter division-managed values per NPP per year; immediately `APPROVED`.
**Ship criterion:** ННВ enters pedagogical experience for a staff, it shows APPROVED and counts in rating.

> **Decision (user, 2026-07-06):** each division gets its OWN page — the in-app replacement of its
> `Дані *.xlsx` working file (ВМЗ → проєкти; ННЦЗЯО → ОП/ради/обовʼязки; ВА → спецради; ННВ → НДР та
> фіксовані показники; + кадри й навчальний відділ). Access: only editors of that division (via
> `getEditorDivisionId`) + ADMIN. Not one generic shared panel.

> **DONE.** M5.1 + the staff-first grid (commits `233e85d`, `4d7ce86`); entity-first flows 2026-07-14. Built as ONE
> route `/division-data` («Дані відділу») serving all divisions — an editor lands on their own division
> (via `canActForDivision`), ADMIN gets a division picker — instead of six separate routes. The picker
> lists divisions that own indicators in the active template, so an empty division (ВА today) still
> appears.

### Issue M5.1 — Entry action

- [x] `upsertDivisionActivity` in `app/(dashboard)/division-data/actions.ts`: auth via `verifyingDivisionId` (`canActForDivision` in `lib/permissions.ts`), type must be `DIVISION_MANAGED`, template `OPEN`, staff must be НПП, `computeScore`, insert/update as `APPROVED` `submittedByRole=DIVISION`, audit.
- [x] Upsert = `findFirst` (same staff + type + year, `status != REMOVED`) then update-or-create **inside the transaction** — there is no DB unique constraint (repeatable NPP types forbid one).
- [x] `clearDivisionActivity`: hard-delete a mistaken division entry + audit + recompute (division rows need no discard trail — the division is their source of truth).

### Issue M5.2 — Division pages

- [x] **Staff-first grid** (`/division-data`): NPP × type for the active year, popover cell forms driven by the evidence registry, client search, read-only when year closed. Covers кадри, навчальний відділ, and the fixed/«Обовязки»-style indicators of ННВ/ННЦЗЯО out of the box.
- [x] **Entity-first flows** (from `edu-reference/Дані *.xlsx`, checked 2026-07-06): ВМЗ → проєкти
      (staff picked per role), ННЦЗЯО → ОП / ради, ВА → спецради (+ «Разова» flag stored as
      informational evidence — same points for now, see resolved decisions), ННВ → НДР-теми.
      "Enter object once → pick staff per role → fan out one Activity per staff" on top of the
      same upsert action. **(DONE 2026-07-14: «Групове внесення» dialog on `/division-data` —
      shared fields once + per-staff role rows → `batchUpsertDivisionActivity`, one transaction;
      whitelist in `lib/rating/entity-entry.ts`.)**

### Issue M5.3 — Tests

- [x] `division-data/actions.test.ts`: rejects NPP_SUBMISSION codes; rejects wrong-division editor; rejects closed year and non-НПП staff; upsert updates the live row instead of duplicating.

---

# Milestone M6 — Rating computation & tables

**Goal:** approved activities roll up into per-staff/year rating; viewable tables.
**Ship criterion:** rating table shows 5 section totals + grand total matching sum of approved scores.

### Issue M6.1 — Recompute function

- [x] `lib/rating/recompute.ts`: sum APPROVED `score` by section → write `RatingEntry` (section1..5, total). Implemented in M3; called by all M3/M4/M5 mutations (submit, NPP delete, discard, direct-entry, clear).
- [x] Decided: **synchronous, in the same transaction** as the mutation (scale ~300 staff makes this trivially cheap).

### Issue M6.2 — Rating queries

- [x] `lib/queries/get-rating.ts` (per staff/year) and `list-ratings.ts` (department/division rollup, sortable).

### Issue M6.3 — Rating table UI

- [x] Per-staff rating table (on profile + staff detail): sections, items, scores. (Staff detail =
      full `RatingTable`; profile = compact section-totals card linking to «Мій рейтинг».)
- [x] Rollup table page `/rating` («Рейтинг НПП», ADMIN+EDITOR): ranked by total for the active
      year, faculty/department filter + name search, zero-score НПП included.

### Issue M6.4 — Tests

- [x] Recompute test: submit adds, discard subtracts, matches expected totals.

---

# Milestone M7 — Year lifecycle & template admin (ADMIN)

**Goal:** admin opens/closes years and edits templates.
**Ship criterion:** admin clones 2025→2026, edits a coefficient, closes 2025 → snapshot frozen & read-only.

### Issue M7.1 — Template CRUD actions

- [x] `app/(dashboard)/admin/rating/actions.ts`: `createTemplate`, `cloneTemplate(fromYear)`, `activateTemplate`, `updateActivityType` (label/coefficient/note/verifyingDivision/isActive — covers deactivate), `addActivityType` (registry codes only). ADMIN only, audited.

### Issue M7.2 — Close year

- [x] `closeYear(year)`: build `RatingEntry.snapshot` JSON (labels + coefficients + scores as-of-close) for every staff, then set **`RatingTemplate.status=CLOSED`, `closedAt/By`** (single authoritative flag — all action guards read it).
- [x] **Purge discarded rows on close** _(decision, user, 2026-07-07)_: before setting `CLOSED`, hard-delete all `REMOVED` activities of that year. While the year is open they stay visible (NPP sees the reason, moderators see history); after close they are junk. Audit log keeps the discard trail, so nothing is unexplainable afterward. Chosen over a time-based auto-delete (no cron infra; a fixed delay could hide the reason before the NPP saw it).
- [x] **Appeals policy (decided 2026-07-15):** closed year stays hard-blocked everywhere; appeals go through ADMIN `reopenYear` → fix → close again (snapshot rebuilt). Audited both ways.

### Issue M7.3 — Template admin UI

- [x] `/admin/rating` years list (activate / clone to year+1 / close / reopen, confirm modals) + `/admin/rating/[year]` per-section editor with edit dialog and add-from-catalogue. Sidebar: «Рейтингові роки».

### Issue M7.4 — Closed-year read-only

- [x] All submit/approve/entry actions reject when year `CLOSED` (guards existed; covered by tests).
- [x] Closed-year views render from `snapshot` («Мій рейтинг» + staff rating tab via `snapshotToGroups`).

---

# Milestone M8 — Reports & graphs

**Goal:** PDF rating reports + visual graphs.
**Ship criterion:** download a per-staff PDF; see rating-over-time and section-breakdown charts.

> **DEFERRED (user, 2026-07-15).** Replaced by the Excel zip export (commits `2fb7d57`, `dbf5c05`):
> `/api/export/ratings` + `lib/rating/export-workbook.ts` generate one official-form `.xlsx` per staff,
> zipped, matching the reference layout. PDF and charts stay in the backlog if ever needed.

### Issue M8.1 — PDF generation

- [ ] Choose approach (server-side React-PDF / html-to-pdf). Add dep. **No PDF or chart lib is installed yet — verify Next 16 + React 19 compatibility before committing to one** (`@react-pdf/renderer` and `recharts` are the default candidates).
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

- [x] Decided (user, 2026-07-15): manual «Перевірено» flag by ННВ/ADMIN now; a future DOI-checker worker (Crossref/OpenAlex, separate container on the same VPS) may pre-fill it — the flag stays the human final say.
- [x] `Activity.verifiedAt/verifiedByUserId` + «Перевірити» toggle on /moderation for publication_cat_a/b (APPROVED, open year); audited; static badge after close.

### Issue M9.2 — Permission & security audit

- [x] Re-verified every action (2026-07-15 sweep): all 30 actions auth + role/division checks; closed-year guards on all rating mutations.
- [x] Confirmed: USER own-only; EDITOR division-scoped; passwordHash in zero components; employmentRate admin/own-gated everywhere.

### Issue M9.3 — UX polish

- [x] Loading skeletons added for /rating, /staff/[id]/rating, /admin/rating(+/[year]); empty states and toasts were built per-page.
- [x] Nav/sidebar entries for new pages, role-gated (done incrementally).

### Issue M9.4 — Smoke test pass

- [ ] Full flow: submit → approve → direct-entry → rating → close year → PDF, as USER / EDITOR / ADMIN.

---

## Backlog — post-Phase-2 improvements (user requests)

- [ ] **Bulk moderation** _(user, 2026-07-15)_: on `/moderation`, checkboxes to select multiple
      self-reports and verify / discard them all at once (one shared discard reason; one
      transaction; per-row audit entries as today).
- [ ] **DOI-checker worker** _(user, 2026-07-15)_: separate small container on the same VPS
      (own Dockerfile in docker-compose, shared postgres network). Periodically checks unverified
      publication submissions via free Crossref/OpenAlex APIs (DOI exists + title match) and
      pre-fills `Activity.verifiedAt` suggestions; ННВ's manual flag stays the final say.
- [ ] **Profile-derived indicators** _(user, 2026-07-17 — agreed next feature, do FIRST)_: new
      `InputSource.PROFILE_DERIVED`; rating items 1.1 стаж / 1.2 звання / 1.3 ступінь / 1.6 посада
      (new `Staff.adminPosition` field) / 1.9 базова освіта / 3.24 цитування ×3 read their value
      from the Staff profile instead of manual entry. `lib/rating/profile-derived.ts` maps code →
      staff field; `syncProfileDerived(staffId)` upserts exactly ONE APPROVED activity per type
      (kills point farming) on staff create/edit and on year open/reopen/activate; empty field =
      activity removed. NPP cannot submit these codes; hidden from /division-data grid. Editing
      rights come free via existing DivisionFieldPermission. ~2–3 days.
- [ ] **Rating tooltips on profile fields** _(user, 2026-07-17)_: small "i" icon + tooltip on every
      staff-profile field present in the profile-derived mapping («Впливає на рейтинг — п. X, до
      N балів»). List comes from `profile-derived.ts`, no hardcoding. ~0.5 day, do together with
      profile-derived indicators.
- [ ] **Multi-year (carry-over) achievements** _(user, 2026-07-17 — VERY OPTIONAL, boss must
      confirm the policy first: which types carry over and for how long)_: optional
      `carryYears`/«діє до» on activity types; `openYear`/`cloneTemplate` copies still-valid
      APPROVED activities into the new year (row per year — per-year coefficients and snapshots
      stay self-contained) and recomputes. Technically low cost; blocked on policy only.
- [ ] **Template editor v2 — admin-defined indicators** _(user, 2026-07-17 — core long-term goal:
      admin edits rating forms with NO code changes)_: move field specs + scoring params from code
      constants into DB — `ActivityType.evidenceFields Json` (form definition consumed by the
      existing generic renderer + Zod generator) and `ActivityType.scoring Json` (parametrized
      kinds: fixed / select-points / number×coef / pages÷24 / maxPerYear; moodle gate stays
      built-in). Admin UI: field-builder dialog in `/admin/rating/[year]` (field type, label,
      select options with points). Excel export already reads the DB template; only item numbers
      and select sub-rows must switch to the same JSON specs (~0.5 day inside this). ~1 week.
      now)\_: spreadsheet-style page — rows = НПП, columns = the Staff fields the editor's division
      has DivisionFieldPermission for (кадри: посада, кафедра, стаж…), inline/popover editing like
      /division-data. Generic for any division. With profile-derived sync in place, edits update
      ratings instantly. ~2–3 days, after profile-derived indicators.

## Suggested order & rough sizing (solo)

| Milestone                 | What you can demo         | Status / rough size                             |
| ------------------------- | ------------------------- | ----------------------------------------------- |
| M0                        | Seeded template in Studio | ✅ done 2026-07-02                              |
| M1                        | Tested scoring            | ✅ done 2026-07-02                              |
| M2                        | All evidence forms render | ✅ done 2026-07-02, reviewed 2026-07-06         |
| M3                        | NPP submits               | ✅ done 2026-07-03                              |
| M4                        | Discard & oversight       | ✅ done 2026-07-04                              |
| M5                        | Division pages            | ✅ done 2026-07-14 (grid + entity-first)        |
| M6                        | Rating tables             | ✅ done 2026-07-14                              |
| **↑ core loop shippable** |                           | **✅ shipped**                                  |
| M7                        | Year admin                | ✅ done 2026-07-15                              |
| M8                        | PDF + graphs              | ⏸ deferred — Excel zip export shipped instead   |
| M9                        | Verification + QA         | ✅ done 2026-07-16 (M9.4 smoke test still open) |

**Deadline: 2 months from 2026-07-06 (user, hard).** Core loop (M3–M6) first; M8 and M9.1 are the
sacrifice candidates if time runs short.
