# Work remaining

State as of **2026-08-10**. This is the single list of what is left to build. It
replaces reading four documents at once: `audit-2026-07-29.md` is now a
historical snapshot (accurate for its date, wrong about current code in several
places), `ui-fixes-plan.md` is done except for one item,
`profile-account-merge.md` is finished.

`open-questions.md` and the questions artifact are **closed** — every question
was answered on 2026-08-06/07. The answers live in
[`stake-distribution.md`](./stake-distribution.md) and
[`kharakterystyka.md`](./kharakterystyka.md), not here.

Keep this file current. When something ships, move it out of here — not into
here with a strikethrough.

---

## Where the app is now

Phase 1 (structure, staff, permissions, auth) and Phase 2 (the whole rating
system) are complete and stable, and **B1 Характеристика derives, renders,
exports to Excel and yields `Кнпп`**: **530 tests**, type-check clean, one
deliberate lint warning (`watch()` in `activity-type-dialog`). The audit of
2026-07-29 is fully closed.

**Two real bugs were found and fixed**, both by looking at the university's own
files rather than at the code:

- **Item 5.1 scored 0** for a course with five of six Moodle materials instead
  of 120 — the catalogue described it as all-or-nothing (2026-08-07).
- **A division could hold only one record per person per indicator**, so a
  second editorial board or a second НДР silently replaced the first
  (2026-08-10).

Nothing else in the app is known-broken.

---

## The shape of what is left

**Nothing is blocked on a decision any more.** That changed on 2026-08-07. What
remains splits three ways:

- **Rating UI rework** — new, requested by the owner after using the app. Small
  pieces, high visibility, all unblocked.
- **The two big features** — Характеристика and Розподіл ставок. Both fully
  specced. B1 is built bar two pieces (see below); B2 is not started, and its
  one dependency — `Кнпп` — is now done.
- **Adoption** — import, instructions, invites, reminders. Less visible, and
  the reason a working system still fails.

The third group is still the risk. A perfect rating engine nobody fills in is
worth nothing.

---

## Session log — what shipped and why

Recorded so a new session does not re-derive any of it.

### 2026-08-07 — item 5.1

| Commit    | What                                                                                       |
| --------- | ------------------------------------------------------------------------------------------ |
| `e9f518a` | Item 5.1: `GATE` → `CHECK_SUM`. Each material carries its own share of the mode's maximum. |
| `aede590` | `pnpm db:gate-to-check-sum` for stored rows; `computeValue` throws on an unknown kind.     |
| `d10eff4` | «Tick at least one» rule; two label renames; client forms now apply rule-level checks.     |
| `6726d0f` | A grouped checkbox set summarises as one part listing its ticked labels.                   |
| `684591c` | Rating table shows every indicator; `mentionLink` added to 3.16–3.18.                      |
| `4fbb032` | /division-data header sticks while scrolling.                                              |
| `f8bd154` | /division-data: sort, data filter, counter, paging.                                        |

### 2026-08-10 — contrast, the grid, multiple records

| Commit    | What                                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| `7022124` | Control boundaries reach WCAG 1.4.11; `--border` and `--input` split.                   |
| `20bc9ee` | `/admin/design` — five candidate token sets side by side.                               |
| `75840b1` | Shared pager instead of a hand-rolled one; full headings; scroll resets on page change. |
| `972ef00` | `CopyButton`, used on the staff list's email column.                                    |
| `6466ae1` | Several records per cell in /division-data; the 20260729 unique index dropped.          |

### 2026-08-10 — Характеристика (п.38)

Built after the owner reordered the plan: `Кнпп` comes from this document, so it
goes before Розподіл ставок rather than beside it.

| What                                                                                  |
| ------------------------------------------------------------------------------------- |
| `lib/kharakterystyka/positions.ts` — the 20 positions, law text verbatim              |
| `lib/kharakterystyka/build.ts` — the derivation, 32 tests                             |
| `ActivityType.licencePositions` (JSON) + `Staff.degreeDefenceDate`                    |
| `/staff/[id]/kharakterystyka`, `/achievements/kharakterystyka`, `/my-department`      |
| `lib/queries/scope.ts` — `scopeOf()` and `canViewAcademicRecord()`, 13 tests          |
| `/api/export/kharakterystyka` — one .xlsx or an archive; ratings gained `staffId` too |
| `lib/queries/get-department-knpp.ts` — `Кнпп` and headcount per кафедра, 12 tests     |

Two facts measured while doing it, both correcting a doc:

- **The норматив table is not stuck in the PDF.** `НормативЧисельності` in
  `Рейтинг_Профорієнтація.xlsx` has **38 specialities**, not the 34 the ставка
  spec claims, and all 38 confirm the single-base rule. B2's seed is ready.
- **`summarizeEvidence` capped output at five parts.** Right for a table cell,
  wrong for a document read against the law, so it now takes a `maxParts` and
  the Характеристика passes `Infinity`.

Two more worth not rediscovering:

- **`Content-Disposition` is latin-1 and every name here is Cyrillic.** The
  filename goes through `filename*` (RFC 5987) with an ASCII fallback, in
  `lib/export/file-names.ts`. Without it the browser mangles or drops the name.
- **Never dedupe records by their display text** — see lesson 6 below.

### Lessons worth keeping

1. **Changing a scoring kind is a data migration.** `scoring` and
   `evidenceFields` are JSON columns — editing `lib/rating/` changes nothing
   already written. `pnpm db:seed` fixes the active template; a **cloned** one
   is never reseeded. Now in CLAUDE.md.
2. **The client forms were validating with the fields only**, never the scoring
   rule, so a rule-level failure showed nothing at all on screen. Fixed for all
   three forms; `entity-entry-dialog` is the deliberate exception.
3. **`docs/` beats `edu-reference/`.** The latter is the old Google-Sheets
   system. A 2025 file there described a model 2026 had deliberately replaced.
4. **Check for an existing component before writing one.** A hand-rolled pager
   went in beside `components/ui/pagination`, which was better in every respect.
5. **A constraint usually has a reason.** The one-row-per-cell index looked like
   an accident of the grid's shape; it was a deliberate fix for a double-count
   race. Read the migration before reversing one.
6. **Never dedupe records by their display text.** The Характеристика's first
   version collapsed entries whose summaries matched, which would have cost
   somebody a publication against a threshold that counts to five. Dedupe on
   identity; text is a coincidence.
7. **A permission without a route is not access.** A завідувач is an ordinary
   `USER`, so granting them the Характеристика meant nothing until
   `/my-department` existed — `/staff` redirects them away, and the tabs on the
   page pointed at two more pages that would.

---

## A. Rating UI rework — from the owner, 2026-08-07

All unblocked. Roughly in the order the owner raised them.

### A1. Rating table fully visible — **DONE 2026-08-07**

«Мій рейтинг» now lists every indicator of the year, with `0` and a hint of
whose job it is («Подаєте самостійно» / «Вносить відділ» / «З профілю») for the
ones with nothing under them. Open years only — a closed year renders from its
frozen snapshot, and «you could still do this» is not something to say about it.

### A2. Link field on 3.16, 3.17, 3.18 — **DONE 2026-08-07**

`mentionLink` added to all five codes behind those three item numbers. Label is
«Посилання на сторінку, де вказано НПП», except `journal_website_support`, which
is about maintaining the site rather than being named on it and asks for
«Посилання на сайт збірника».

**Open, and it needs you:** 3.16 and 3.17 are `DIVISION_MANAGED`, so the field
is filled by the division editor, not the НПП. You said the link «must be filled
by npp himself». Moving those indicators to НПП self-entry is a real change of
who owns the data — it belongs in the A7 pass, not in a field addition.

### A3. Section 3 submission form

Confirmed shape: **одна робота — одна форма**, but shorter than today's. Not a
bulk paste.

### A4. Section 3 report like `Звіти ННВ`

`edu-reference/csv/Звіти ННВ - Публікації_2025.csv`: one row per work, the
citation pasted as free text into the column of its indicator (3.7 укр, 3.7 ЄС,
3.8 A, 3.9 Б, одноосібно, 3.10), with a running count in the header.

### A5. /division-data — mostly done, one piece left

**What `Дані ННВ.xlsx` actually is** (measured 2026-08-10, three sheets):

| Sheet  | Shape                                                                                                                                                                                                             |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Дані` | 317 people, **no duplicates**. Profile data — ПІБ, кафедра, ставка, стаж, звання, ступінь, email, ORCID, plus WoS/Scopus/Scholar counts (that is indicator 3.24). Maps to the Staff profile, **not** to the grid. |
| `2025` | 209 rows / 93 people — the indicator grid, `Назва`/`Роль` per column                                                                                                                                              |
| `2024` | 242 rows / 105 people — same shape                                                                                                                                                                                |

**It is one row per record, not per person**, which is why somebody occupies
four rows. Done since: multiple records per cell, the record list behind a cell,
sort/filter/paging, sticky header, full headings.

**Still open — a column picker.** 202 rows × 8–12 columns is unreadable when an
editor is working on one indicator. Letting them show only 3.4 and 3.17 would
help more than anything else left on this list.

### A5b. Duplicates in that file — decided 2026-08-10

The same sheets carry a lot of noise as well as real multiples:

| Sheet  | People with >1 row | …genuinely different | Rows that exactly repeat another |
| ------ | ------------------ | -------------------- | -------------------------------- |
| `2025` | 53                 | **37**               | 65                               |
| `2024` | 68                 | **33**               | 95                               |

**The importer strips exact repeats automatically** and reports how many and for
whom — they read as data-entry slips, not as two achievements. Genuine multiples
(different journal, different НДР) import as separate records.

The app now enforces the same rule at write time: a save is refused when its
evidence repeats a row already stored.

### A6. Visual pass — **after** the items above

The owner's words: not intuitive, and not all data visible as intended.

- ~~**The /division-data table header scrolls away.**~~ **DONE 2026-08-07.** The
  grid now scrolls inside its own box (`max-h-[calc(100vh-16rem)]`) with a
  sticky header row and a sticky НПП column. The height cap is what makes
  sticky work at all — `position: sticky` resolves against a scrollport, and a
  page-level scroll gave it none.
- ~~**/division-data is unusable at 200 people.**~~ **DONE 2026-08-07.** Search
  now sits beside sort (ПІБ / кафедра / спершу заповнені / спершу порожні), a
  data filter (усі / із даними / без даних), a «N із M» counter, and paging via
  the shared `components/ui/pagination`. Column headings show in full and
  top-aligned — a toggle was tried and removed, since a label you have to ask
  for is one people will not read. Changing page or filter scrolls back to the
  top; the grid scrolls in its own box, so it used to open mid-list.
- ~~**Low contrast across most pages.**~~ **DONE 2026-08-10.** It was
  measurable, not taste: the input boundary sat at **1.26:1** where WCAG 1.4.11
  wants 3.0, and placeholders at 2.49 where AA wants 4.5. `--border` and
  `--input` had held the same value, so a control's edge was drawn no harder
  than a table rule. They are now separate jobs — `--input` is the lightest grey
  reaching 3.0 (measured 3.03 light, 3.57 dark), `--border` rises only enough to
  be seen. Values solved by binary search against real paint.
- ~~**Wanted: a test page**~~ **DONE 2026-08-10 — awaiting the owner's pick.**
  `/admin/design` renders the same sample under five candidates (Поточний,
  Теплий, Прохолодний, Чіткіший, М'якший) side by side, in both themes, each
  carrying its measured contrast so a failing candidate is visible as failing.
  All five stay inside the monochrome direction; none introduces a brand hue.
  **Nothing is applied until the owner chooses.**

### A7a. Who fills the division-managed indicators — **deferred 2026-08-10**

31 indicators are `DIVISION_MANAGED`, and ~19 are things the НПП plainly knows
about themselves (гарант ОП, НДР, редколегії, спецради, міжнародні проєкти,
виставки, експертиза МОН…). The owner considered moving them to self-entry with
the division moderating — the model the old `Звіти ННВ` used — and **decided
against it for now**: the business logic behind that split is not understood
well enough to change it, and the university had reasons not visible from here.
A field marked for a division stays filled by that division.

Worth knowing when this is picked up: **both halves of the old model already
exist.** `/division-data` is `Дані ННВ`; `/moderation` already lists every НПП
self-submission across all sections and lets ННВ discard with a reason the
person sees. Nothing structural would need building — only `inputSource`, one
row at a time, in `/admin/rating/[year]`.

A related point the owner raised and answered: item 3.17 has both «технічний
секретар» (a seat on the editorial board, 140/120) and «Внесення даних та
супровід сайту наукового збірника» (a separate job, flat 100). They are
different things and can be held by the same person at once.

### A7. Field-by-field pass — deferred, its own session

The rule: **everything an НПП can be expected to know about themselves, they
enter themselves, with evidence.** Rating-related only. The owner offered to go
through indicator by indicator for the unclear ones. Deferred by agreement —
do the clear work first, then bring a list of the genuinely ambiguous ones.

---

## B. The two big features

Both fully specced. Neither started.

### B1. Характеристика / п.38 — **derivation + page DONE 2026-08-10**

Spec: [`kharakterystyka.md`](./kharakterystyka.md). It is п.38 of the Ліцензійні
умови and the source of `Кнпп`. 14 of 20 positions fill themselves from rating
data; 3 are military and never apply; 2 are manual (п.15 школярі — such НПП
exist; п.20 practical experience — nobody qualifies today); 1 needs a defence
date on the profile.

**Built:**

| What                                                        | Where                                     |
| ----------------------------------------------------------- | ----------------------------------------- |
| The 20 positions, law text verbatim + threshold rules       | `lib/kharakterystyka/positions.ts`        |
| Derivation engine, 32 tests                                 | `lib/kharakterystyka/build.ts`            |
| Indicator → position mapping, seeded                        | `LICENCE_POSITION_LINKS` in `db-specs.ts` |
| `ActivityType.licencePositions` + `Staff.degreeDefenceDate` | migration `20260810140000`                |
| Admin/editor view                                           | `/staff/[id]/kharakterystyka` (tab)       |
| The НПП's own view                                          | `/achievements/kharakterystyka` (tab)     |
| Head's / dean's view                                        | `/my-department`, `lib/queries/scope.ts`  |
| Excel export, single + archive                              | `/api/export/kharakterystyka`             |
| **`Кнпп` per кафедра**                                      | `lib/queries/get-department-knpp.ts`      |

**`Кнпп` is done and B2 can consume it.** `getDepartmentsKnpp()` returns, per
кафедра, the count meeting ≥4 of 20 **and** the roster headcount — measured at
147 ms for all 16 кафедри / 204 people. It shows on `/departments/[id]` and
`/my-department`.

The one thing to carry into B2 without re-deriving it: **those are two different
numbers and must not be conflated.** `knpp` is a **divisor inside the formula**;
`headcount` is a **validation bound on the input** (`Кст ≥ 0.1 × headcount`).
Somebody below 4/20 is not excluded from the distribution — everyone gets a Vc
and nobody falls below the 0.1 floor.

Three decisions embedded in that code, easy to undo by accident:

1. **The mapping is a DB column, not a code list.** `licencePositions` on
   `ActivityType`, JSON, seeded from `LICENCE_POSITION_LINKS`. An indicator the
   вчена рада votes in must be pointable at a position without a deploy — the
   same lesson `requiresVerification` and `entityFirstEntry` already taught.
   `LICENCE_POSITION_LINKS` is **seed input only**; at runtime the row decides.
2. **Applications map to nothing on purpose** — `patent_application` and
   `intl_grant_application` are absent from the map and must stay absent.
3. **Headship is `Department.headId` / `Faculty.deanId`, never a `Role`.**
   `scopeOf(staffId) → departmentIds[]` is the one place that resolves it, and
   the ставка grid will reuse it unchanged.

**Still to do on B1:**

- **The п.38 mapping is not editable in the UI yet.** The column exists and the
  seed fills it; `/admin/rating/[year]` has no control for it, so a new
  indicator today needs a seed edit. `licencePositionProblems()` is written and
  waiting for the form.
- **Manual entry for п.15 and п.20** — both render as empty rows with a reason.
  Nothing stores a typed value yet, so a person who does prepare школярі cannot
  record it.

Decided 2026-08-07 and easy to get wrong later:

- **Applications never count.** A submitted patent application or an unwon grant
  proposal scores in the **rating** but closes no п.38 position.
- **One defence date**, for the highest degree. Enough for п.5, since the
  highest degree is also the latest.
- **Generated text is never editable.** Fix the generator, not the document.
- **We never add, remove or re-price a rating indicator.** The catalogue belongs
  to the вчена рада and moves only by their vote.

### B2. Розподіл ставок — [`stake-distribution.md`](./stake-distribution.md)

The formula, corrected against the положення in two places (денна divisor is
`Nд` with no factor of 2; the floor is 0.1, not 0.5).

The structural fact that shapes the whole UI: **`Кст` bounds the first term
only.** The pool is spread by rating, the head adjusts by hand and may never
exceed it (hard block), and recruitment bonuses are paid **on top**, outside the
pool. So the grid needs **two columns** — editable pool share with a live
«нерозподілено», and a read-only computed bonus.

Also decided: `Кст ≥ 0.1 × every НПП on the кафедра` as an input validation;
rounding is two rules (pool share to 0.05 with ties **down**; bonus to 3
decimals); no hand-override of a student's value; no dispute arbitration, no
claim cancellation, no past-year storage, no mid-year-leaving handling.

**No approval step (decided 2026-08-10, retracts Q1).** ADMIN sets the pool, the
head spreads it, and what the head saves is final. No комісія, no submit, no
approve, no `SUBMITTED`/`APPROVED` status, no approver id. The controls are the
central `Кст`, the hard ceiling at save, ADMIN-only caps, and the audit log.

**Two things B2 can now build on:** the норматив table is not locked in the PDF —
it is a live sheet, `НормативЧисельності` in `Рейтинг_Профорієнтація.xlsx`, with
**38 specialities** (the spec says 34), all confirming the single-base rule
(магістр = base × 0.5, заочна = base × 4). And `scopeOf()` already resolves which
кафедри a head or dean may act for.

---

## C. Ready to build now (unchanged from 2026-08-04)

### C1. Staff import — still the thing to do first

From `edu-reference/csv/УГСП_Дані - НПП.csv`. The `Staff` model already carries
every column. Needs a **dry-run report first** — rows to create / update / skip
with a reason each — then commit, one audit-log entry per row.

Why first: no unknowns, and it makes everything else testable against real
people instead of 200 invented ones. Watch for name variants, missing or shared
emails, department names that do not match, duplicates. The code is easy; the
data is where the time goes.

### C2. Instructions in Ukrainian

There are none beyond the profile-field tooltips. Four audiences: ~200 НПП,
division editors, ННВ moderators, admins. Plan: a `/help` page split by role
plus contextual text on the 3–4 screens where people will certainly get stuck.
**The wording must be reviewed by the owner.**

### C3. Bulk invite

300 people, one button per person today. Select a department or filter, send to
everyone without a password, spread over the SMTP cap, per-person resend for
bounces. The invite mechanics exist — this is the batch layer.

### C4. Reminders / notifications

**There is no notification code in the app at all.** Nothing tells an НПП that
submissions are open, that the year closes soon, or that something of theirs was
discarded. Biggest adoption risk. Minimum: an email on discard, and a «year
closes on X» an admin can trigger.

### C5. E2E tests

Unit coverage is strong; cross-page flows are untested. The Playwright plugin is
now wired up and was used to verify 5.1 — worth keeping: login → submit →
moderate → close year → reopen, plus the permission matrix.

### C6. Documentation upkeep

- `audit-2026-07-29.md` still describes pre-fix code — mark it historical or
  update the statuses.
- `ui-fixes-plan.md` **#4** was decided and never built (inline pencil/delete in
  division, faculty, department rows). The row-link work went a different way
  since, so **re-confirm before building**.

---

## D. Waiting on other people

Not blocked on a decision — blocked on a file or a third party.

| What                             | From whom          | When            |
| -------------------------------- | ------------------ | --------------- |
| Historical rating Excel files    | owner's local disk | **~2026-08-12** |
| Rate-manage page design          | owner              | «later»         |
| Наказ про зарахування as a table | приймальна комісія | owner is asking |

**The import will do less than hoped.** The owner checked: the old files are
«most of data is results only» — a score per person per year. Publications may
have per-item rows; nothing else will. A yearly total cannot satisfy a п.38
threshold, so **the first Характеристика is largely manual** and that is now the
expected outcome, not a failure. Worth checking when the files arrive whether
any other category kept per-item rows.

---

## E. Before deployment

Decided: Hetzner VPS + Coolify.

- Production Dockerfile (standalone Next build)
- Real SMTP, `AUTH_SECRET` and `APP_URL` set
- **Login throttling** (audit S4) — acceptable on a university network, not on a
  public VPS
- Backup path on the NAS, **and a restore drill**. A backup nobody has restored
  is a hope, not a backup.
- Pilot with 2–3 real users before the department-wide rollout
- Nobody currently owns support. Decide who answers when an НПП cannot log in.

---

## F. Settled — do not re-open

**Every question from the tracker is answered.** The 22 answers are recorded in
`stake-distribution.md` and `kharakterystyka.md`. A few that would otherwise be
re-asked:

- **W6 — editors downloading every НПП's workbook: intended.** Any division
  member may inspect the total rating; they simply cannot edit fields outside
  their permissions.
- **«Повідомити» without deleting: not building it.** Discard-with-reason
  already reaches the НПП.
- **Підвищення кваліфікації is an ordinary indicator** (1.11, 1.12) — no
  separate recognition step, no new entity.
- **Звіт «Публікації» columns stay as they are** until someone names what is
  missing.
- **1С export: Excel, our own column set**, adjusted if 1С rejects it. No sample
  file is being chased.
- **Менеджмент norm is 12**, per додаток 5. Соціальна робота 11.5 and Публічне
  управління 12.5 likewise — додаток 5 wins over постанова 1134.

**Earlier owner decisions:**

- Editors keep the ability to edit emails. Residual risk accepted: an editor can
  take over a **USER** account via an email change plus the public reset.
- Editors may only edit records where `role = USER`, plus their own.
- A person is **never deleted** — only archived. See CLAUDE.md.

**Measured, not guessed — three things that are NOT problems:**

- `closeYear` on the default 5 s transaction timeout: **274 ms** for 204 staff
  and 4498 activities.
- `batchUpsertDivisionActivity` worst case (100 rows): **590 ms**.
- `prisma migrate dev` does **not** drop the partial unique index it cannot
  express.

**Reversed on purpose — do not restore:**

- **`Activity_one_live_division_row`** (migration 20260729) is dropped as of 20260810. It enforced one division row per (staff, indicator, year) to close a
  race where two editors saving one cell both insert and the score doubles in an
  official number. It also made a real case impossible: one person holds two
  editorial boards or two НДР, and 37 people in the ННВ 2025 sheet do. The owner
  weighed it — one editor per division in practice, so the race is close to
  hypothetical while multiples are everyday. **The protection was not discarded,
  it moved**: `upsertDivisionActivity` and `batchUpsertDivisionActivity` refuse a
  save whose evidence repeats a stored row, which covers the double-click and
  the resubmitted form. Re-adding the index would break the ННВ import.

**Known and accepted:**

- One lint warning in `activity-type-dialog.tsx` — `watch()` is a subscription.
- `ActivityStatus.PENDING` is never written. No approval queue should be added.
- `/staff` slices for paging after fetching all rows. Fine at ~300 people.
- Demo data holds two junk indicators, «asd» (2.10) and «іва» (6.21).
- The **2027 clone keeps the old 5.1 labels**. A year owns its structure, so
  `db:seed` only touched 2026. Fix it in `/admin/rating/2027` if it matters.

---

## Suggested order

1. **Column picker on /division-data** — the last piece of A5, and the biggest
   remaining win for anyone actually using that screen.
2. **The owner picks a look** at `/admin/design`; applying it is a token edit.
3. **C1 staff import** — unblocks judgement on everything else and makes the
   next demo real. Note `Дані ННВ`'s `Дані` sheet is a second source for the
   same profile fields, so reconcile the two rather than importing both blindly.
4. **A3–A4** — the section 3 form and the Публікації report.
5. ~~**B1 Характеристика**~~ — **derivation and pages done 2026-08-10**; the
   remainder (admin editor for the mapping, manual п.15/п.20, export, `Кнпп`
   per кафедра) is listed under B1 above.
6. **B2 Розподіл ставок** — the biggest, and fully specced. `Кнпп` is already
   done (`getDepartmentsKnpp`), so start at the schema: specialities and their
   norms (seed the 38 rows from `Рейтинг_Профорієнтація.xlsx`), the year
   settings, and `Кст` per кафедра with its `≥ 0.1 × headcount` validation.
7. **A6 remaining visual work**, then **C2–C4** — the adoption set.
8. **E deployment**, with the pilot before the rollout.

The critical path is unchanged: **staff import → Характеристика (it carries
`Кнпп`) → Розподіл ставок.** Nothing on it waits on anybody. The import files
arriving ~12.08 affect only how much of the Характеристика fills itself — and
now that the derivation exists, the import's value is measurable: every
per-item row it brings in is a позиція nobody has to type.
