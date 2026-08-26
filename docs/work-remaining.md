# Work remaining

State as of **2026-08-17**. This is the single list of what is left to build. It
replaces reading four documents at once: `audit-2026-07-29.md` is now a
historical snapshot (accurate for its date, wrong about current code in several
places), `ui-fixes-plan.md` is done except for one item,
`profile-account-merge.md` is finished.

---

## 2026-08-17 — read this first

Three things changed that make parts of the text below wrong. They are corrected
in place, but the headlines are worth having up front.

**1. Ставки are spread in TWO phases, and the second is not built.** Phase 1 is
what exists: `Кст` per кафедра, the formula, the head's grid. Phase 2 happens a
couple of months later — the проректор **raises the same `Кст`** (10 → 15), the
phase-1 numbers stay frozen, and the завідувач hands out the increase by hand to
the people who recruited students. Somebody who recruited fifty students but has
no room **gets nothing automatically**; it is discussed. So the recruitment
figure is **evidence, not money**, and the app was paying it out by itself.
Fixed in `20303a6`: the «Разом» column and «Разом до виплати» tile are gone, and
`lib/stake/total.ts` is unused pending confirmation.

**Still open, and it designs the whole phase:** when the pool is raised, may
anybody's phase-1 ставка be reduced? Recommendation if not — freeze at the moment
`Кст` is raised, with a dialog naming the old and new pool.

**2. The formula overspend is SOLVED and the section below saying otherwise is
wrong.** `5f6d9b7` (2026-08-12) rewrote it against the university's own working
sheet: two passes, both bracketed terms are shares summing to 1, so the кафедра
lands on its pool by construction. Verified against their output for Кафедра
історії — seven people, `Кст` 6.00, all seven ставки and the «не розподілено» of
0.10 reproduced exactly. What is left over is ladder dust of a few hundredths,
never a deficit.

**3. A декан inspects and does not decide.** `canDecide` on recruited-student
claims used `scopeOf` and let a декан rule on кафедри they do not head, while
being read-only on the grid that spends it. Now `headOf` (`a09afe1`).

**Counts:** **827 tests** (not the 651 below), type-check clean, one deliberate
lint warning.

**Verified 2026-08-26:** the student register is complete — 1038 rows, 32
specialities, from two sources. 722 come from the ЄДЕБО export
(`list_of_students.xlsx`, all four накази mapped: 1,3 = бюджет; 2,4 = контракт)
and 316 from накази №520 (денна) and №521 (заочна) of 19.08.2026, transcribed
into `students_specialties.xlsx` — those were signed after the export was taken
and appear in no export at all. Eighteen people hold two enrolments each; the
register's unique key is ПІБ + спеціальність + форма + фінансування, not ПІБ.

**Every one of them is a бакалавр, and that is correct for now** (owner,
2026-08-26): the магістр наказ has not been signed yet. The app supports
магістри, so when it is, transcribe it the same way and re-run
`pnpm students:build`.

**Eighteen ПІБ appear twice, and none is a duplicate row.** Each is one person
on two programmes, checked against the education-document number in both
sources — seventeen match exactly; «Яржемська Марія Романівна» carries a
свідоцтво on one programme and a диплом фахового молодшого бакалавра on the
other, so she is either one person admitted on two documents or two namesakes,
and nothing distinguishes them. It does not matter to the claim either way: no
ПІБ repeats within one спеціальність + форма + фінансування, which is the key
`findAcceptedStudent` resolves and the key the duplicate check groups on.

`open-questions.md` and the questions artifact are **closed** — every question
was answered on 2026-08-06/07. The answers live in
[`stake-distribution.md`](./stake-distribution.md) and
[`kharakterystyka.md`](./kharakterystyka.md), not here.

Keep this file current. When something ships, move it out of here — not into
here with a strikethrough.

---

## Where the app is now

Phase 1 (structure, staff, permissions, auth) and Phase 2 (the whole rating
system) are complete and stable, and **both big features — B1 Характеристика and
B2 Розподіл ставок — are built**: **827 tests**, type-check clean, one
deliberate lint warning (`watch()` in `activity-type-dialog`). The audit of
2026-07-29 is fully closed. Ставки phase 2 is the one substantial thing not
built — see the note at the top of this file.

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
- **The two big features** — Характеристика and Розподіл ставок. Both built.
  What is left of them is listed under B1 and B2 and is small.
- **Adoption** — import, instructions, invites, reminders. Less visible, and
  the reason a working system still fails.

The third group is still the risk. A perfect rating engine nobody fills in is
worth nothing.

### Known and deliberately deferred

**A сумісник added to an already-spread кафедра looks saved and is not**
(found 2026-08-24, deferred the same day). Кадри ticks an additional кафедра;
that кафедра's grid immediately shows the new person with the формула's
proposal, and «Розподілено» and «Залишок» include it. Nothing is stored for
them until the завідувач saves — and the toolbar does not say so, because
`savedValues` is seeded from the same `seed()` as `values`, so a brand-new row
is never «dirty».

Real example: Горденко Світлана holds 0,70 on Кафедра здоров'я (saved) and
shows 0,25 on Кафедра соціальної педагогіки (not saved). Her profile correctly
reports 0,70; the second grid asserts 4,35 розподілено, of which 0,25 exists
nowhere.

Why it is new: before сумісництво a кафедра's roster changed only when somebody
was hired or archived. Now кадри can change it, which silently makes a saved
distribution incomplete.

**And the head can be left with no way to save it at all** (owner, 2026-08-24).
Горденко's формула proposal was 0,25 and her Макс was 0,25, so ▲ was disabled at
the ceiling and ▼ was disabled by «тільки збільшити» — both steppers dead, and
her «Ставка» field is the only thing on her row that triggers the autosave. The
only way through was to nudge a DIFFERENT person's ставка down and back up,
which saves the whole кафедра as a side effect. That is not a workflow anybody
should have to discover, and it is the strongest argument for the save button:
committing a distribution needs an action of its own, not a side effect of
editing somebody.

**The owner's chosen fix (2026-08-24): replace autosave with a «Зберегти
розподіл» button, disabled when there is nothing to save.** Two things that fix
must get right:

1. «Nothing to save» cannot mean «values match savedValues» alone — a new row
   matches by construction, so the button would be disabled on exactly the case
   it exists for. It has to be «values differ **OR** some row has no stored
   allocation». `StakeRow` needs `hasAllocation` (`!!allocation` in
   `getStakeDistribution`) to express that.
2. A manual save can lose typed work, which is why the button was deferred on
   2026-08-17 in the first place. `beforeunload` covers the tab closing and a
   refresh, an in-app guard covers clicking away — the browser Back button
   cannot be guarded reliably, and that gap is the reason to think before
   removing autosave.

**The Мін/Макс stepper writes one audit row per click** (owner, 2026-08-24 —
«keep as is, will fix it later»). In `components/stake/distribution-grid.tsx`
the `LimitCell` stepper calls `onCommit` on every ▲▼ press, so raising a ceiling
from 0,25 to 0,50 leaves five entries in the журнал аудиту instead of one. The
text input beside it is fine — it commits on blur — and the ставка stepper is
fine too, it only moves local state.

Not wrong, just noisy: every row records a real save, and the numbers are right.
The fix is to debounce the commit ~800ms after the last click, so a burst becomes
one save reading the true 0,25 → 0,50. Rejected alternatives: committing on blur
(a two-button group makes «left the cell» fiddly, and a closed tab loses the
edit) and merging rows server-side (an audit log must not rewrite itself).

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
- **`Content-Disposition` is latin-1 and every name here is Cyrillic.** The
  filename goes through `filename*` (RFC 5987) with an ASCII fallback, in
  `lib/export/file-names.ts`. Without it the browser mangles or drops the name.
- **Never dedupe records by their display text** — see lesson 6 below.

### 2026-08-10 — Розподіл ставок, the settings layer

| What                                                                                       |
| ------------------------------------------------------------------------------------------ |
| `lib/stake/units.ts` — integer hundredths, the 0.05 ladder (ties **down**), bonus rounding |
| `lib/stake/norms.ts` — додаток 5's 38 specialities, one base each; `studentValue()`        |
| migration `20260810160000` — the five settings tables                                      |
| `/admin/stakes` — `Кст` per кафедра, with the `≥ 0.1 × N` floor refused at save            |
| `/admin/stakes/norms` — the норматив table, one editable number per speciality             |

The floor message carries its own arithmetic — «мінімум 1,80 (18 осіб × 0,10)» —
because a bare minimum does not tell somebody whether to raise the pool or check
the roster. A saved `Кст` can also fall under the floor without anybody touching
it, when a person joins the кафедра, so the page flags that rather than waiting
for the next save to fail.

### 2026-08-10 — the distribution grid and student claims

| Commit    | What                                                                                   |
| --------- | -------------------------------------------------------------------------------------- |
| `3dfd745` | The додаток 2 grid: formula column, editable share, live «нерозподілено», hard ceiling |
| `396a8e6` | `Кнпп` per кафедра                                                                     |
| `6a6ca7a` | ADMIN edits the per-person caps on the grid                                            |
| `731e2f9` | Save on unfocus; «нерозподілено» green unless overspent; licence count coloured        |
| `2e79b2b` | `STAKE_TERMS` — tooltips saying what «Кст» and «Кнпп» mean, and what they do NOT       |
| `42333be` | «виділені ставки» instead of «пул»                                                     |
| `9ecfdac` | Reset now actually saves — it only changed the screen before                           |
| `e9f616a` | Мін and Макс as their own columns                                                      |
| `7d4a386` | Обґрунтування made optional again                                                      |
| `96d943b` | `StudentClaim`: claims, the head's review, and the real bonus                          |
| `a6a569e` | One navigation for an НПП — the sidebar, not sidebar + tabs                            |
| `e3a702b` | The rating table names WHICH відділ fills a row                                        |

Four things worth not rediscovering:

- **The formula overspends most кафедри.** `Σ term1 = 0.5 × N / Кнпп × Кст`, so
  it balances only when `Кнпп` is half the headcount. Not a defect; still
  undecided what the screen should do about it (see B2).
- **A dev server serves stale bundles after a schema change.** Three separate
  confusions today traced to it, one throwing `ReferenceError` from an old
  chunk. Hard-reload before believing a symptom.
- **`pnpm test` intermittently exits non-zero on Windows** with
  «Timeout terminating forks worker» and no failing test. `--pool=threads`
  passes. Not a real failure.
- **A change that only touches the screen is invisible as a bug.** «Повернути
  до формули» moved the numbers and saved nothing; it looked identical to a
  save until the page was reloaded.

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
- ~~**Wanted: a test page**~~ **DONE — and the direction is now CHOSEN.**
  `/admin/design` renders the same screen («Розподіл ставок») on one shared
  sample under every candidate. It began as five palette swaps, which the owner
  rejected twice — correctly, since token variation can only ever produce token
  variation, and three print-era directions (Відомість / Кафедра / Пульт) were
  rejected too and are deleted. See **A6a**.

### A6a. «Аврора» — the chosen design, applied LAST — decided 2026-08-11

The owner picked **Аврора** (`components/admin/concepts-glass.tsx`) and set the
order explicitly: **finish the functional work and all required features first,
then move the app onto this design.** It is a target, not the next task. Do not
start converting screens because a design page exists.

What Аврора is, so it can be rebuilt from this file alone:

- **Glass over a Stripe wash.** Five radial colour blooms (blue `#4472C4`,
  violet `#7C5CD6`, teal `#2BB3A3`) at 24–34px blur — two of them low down,
  because a panel with no light behind it reads as grey plastic, not glass.
- **Fractal-noise grain at 3.5 %** over the whole wash. Not decoration: screens
  quantise a slow colour ramp into visible bands and the grain hides the steps.
- **Frosted planes.** White at 72 %, `blur(24px) saturate(1.6)`, a specular
  hairline along the top edge, and a shadow that is tight and wide at once.
- **The accent stays #4472C4** — the blue already in the university's circulated
  Word reports — so screen, print and PDF stay one system.
- **Type: Manrope**, Cyrillic-first.
- Composition: fund **ring** left (blue arc = distributed, pale amber = the
  overspend past the fund), three sparkline figures right, roster below with
  gradient avatars and inline rating bars.

Consequences to plan for when the time comes:

- `--radius`, `--border`, `--input` and the surface tokens in `app/globals.css`
  all change; the fonts move from the preview page into `app/layout.tsx`.
- **CLAUDE.md's «polished SaaS feel» line and the strict monochrome rule get
  rewritten** — Аврора uses a blue→violet gradient on avatars and bars, which
  the current rule forbids outside charts and status pills.
- `backdrop-filter` needs checking on the weakest laptop in the department
  before this ships. There is no fallback in the concept yet.
- The other concepts (Кристал, Панель, Скло, Ніч, Бенто) stay on the page only
  as reference and can be deleted with it.

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

### B2. Розподіл ставок — **BUILT 2026-08-10**, two pieces left

Spec: [`stake-distribution.md`](./stake-distribution.md). The feature works end
to end: settings → `Кст` → formula → the head's grid → student claims → bonus.

| What                                                                | Where                                  |
| ------------------------------------------------------------------- | -------------------------------------- |
| Integer hundredths, the 0.05 ladder (ties **down**), bonus rounding | `lib/stake/units.ts`                   |
| Додаток 5 — 38 specialities, one base each, seeded                  | `lib/stake/norms.ts`                   |
| The formula, clamping, uncomputable cases                           | `lib/stake/formula.ts`                 |
| Duplicate detection and the bonus                                   | `lib/stake/claims.ts`                  |
| `Кст` per кафедра, норматив table, year coefficient                 | `/admin/stakes`, `/admin/stakes/norms` |
| The distribution grid — додаток 2, autosaving                       | `/departments/[id]/stakes`             |
| Per-person caps, ADMIN-editable on the grid                         | same page, Мін / Макс columns          |
| «Мої залучені здобувачі»                                            | `/achievements/students`               |
| The head's claim review                                             | `/my-department/students`              |

**Still to build:**

- ~~**The 1С Excel export.**~~ **NOT REQUESTED — skipped 2026-08-11.** Nobody
  has asked for it; it came from an assumption that payroll would need a file.
  Do not build it speculatively.

  If it is ever asked for, the thing to get **first** is one existing import
  file from the accounting department — any month's payroll upload. That single
  sample settles the columns, the encoding, the decimal format, and whether they
  key on a табельний номер, which `Staff` does not currently store. Without it
  any export is a guess. Also worth confirming they are on **1С** at all: it is
  Russian software, Ukraine sanctioned it, and most institutions moved to
  **BAS** after 2022 while still saying «1С» out of habit — the two want
  different files.

- **Bulk entry for the per-person caps.** ADMIN sets them one кафедра at a time
  on the distribution grid. Fine for a кафедра, tedious for a university.

**~~One decision still open~~ — SOLVED 2026-08-12, `5f6d9b7`.** The paragraph
that stood here described the формула handing out more than the allocation on
most кафедри (4.90 against a pool of 4.00 on Кафедра вищої математики) and asked
the owner to choose between pre-scaling and going back to the вчена рада.

Neither was needed. The положення's printed formula is a **weighting rule, not an
allocation** — nothing in it makes the values add up to `Кст`. The university's
own working sheet has a second pass the PDF does not print, and that is what the
app follows now: both bracketed terms are shares that each sum to 1 across the
кафедра, so their average does too, and multiplying by `Кст` lands on the pool by
construction. Reproduced against their output for Кафедра історії exactly — seven
people, `Кст` 6.00, «не розподілено» 0.10.

What remains is ladder dust of a few hundredths from snapping each person to
0.05, never a deficit, and an overspend is shown rather than refused because the
кафедри's own sheet permits it. (It also asked for it in a протокол; there is
no протокол — owner, 2026-08-25.)

Decisions made while building, easy to undo by accident:

- **No approval step** (retracts Q1) — the head's saved split is final.
- **Обґрунтування is optional.** Додаток 2 has the column and the положення
  describes justifying a deviation, but nothing establishes that the app must
  refuse a save without one. It was briefly enforced and removed 2026-08-10.
- **Adding a student claim is silent.** No warning, no block, whoever else has
  claimed them. The duplicate is the head's evidence, not the two claimants'.
- **A recruiter may recruit onto any programme**, so `Speciality` has no
  `departmentId` and the picker offers the whole list.
- **Caps are ADMIN-only**, shown read-only to the head.

---

#### Reference — the spec's own summary

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

**The норматив table was never locked in the PDF** — it is a live sheet,
`НормативЧисельності` in `Рейтинг_Профорієнтація.xlsx`, with **38 specialities**
(this spec says 34), all 38 confirming the single-base rule (магістр = base ×
0.5, заочна = base × 4). Now seeded. And `scopeOf()` already resolves which
кафедри a head or dean may act for.

---

## C. Ready to build now (unchanged from 2026-08-04)

### C1. Staff import — still the thing to do first

The parser exists and works: `prisma/staff-import.ts` reads `УГСП_Дані.xlsx` for
ПІБ, кафедра, стаж, звання, ступінь and email, splits «за спеціальністю кафедри»
into its own flag, and refuses to write anything at all when an address is
missing or shared — it hands back the names to fix in the sheet instead.

**Two things are still missing, and one of them was dangerous.**

- **The destructive mode is no longer the only way in.** `--prod` called
  `wipePeople()` first, so importing the real НПП onto production would have
  deleted the administrator account, the structure and the audit log. Since
  `7442c9a` a destructive mode refuses a database that already has accounts and
  prints what it was about to destroy; `--structure` seeds the 8 факультети and
  31 кафедри without deleting anything.
- **There is still no re-runnable import and no dry-run report.** The import
  creates and never updates, so a second run fails on the unique email. What is
  wanted: rows to create / update / skip with a reason each, then commit, one
  audit-log entry per row.

**Waiting on the owner (2026-08-17): names and emails come from a different,
newer file** — the complete and up-to-date НПП list — with everything else read
from `УГСП_Дані.xlsx`. So the import must merge two sources, and it cannot be
finished until that file arrives.

Watch for name variants, department names that do not match the довідник (the
form now warns while typing — see `6e751ae`), and duplicates.

### C2. Instructions in Ukrainian

There are none beyond the profile-field tooltips. Four audiences: ~200 НПП,
division editors, ННВ moderators, admins. Plan: a `/help` page split by role
plus contextual text on the 3–4 screens where people will certainly get stuck.
**The wording must be reviewed by the owner.**

### C3. Bulk invite — **DONE**

`/admin/invites`, ADMIN only. Everybody without a password, filtered by кафедра
and by НПП/адміністративні, sent a batch at a time with the client driving the
loop so progress is visible and stopping halfway costs nothing. `INVITE_DELAY_MS`
paces it under the provider's per-second limit; a refused address is reported per
person and does not end the run.

The кафедра filter was a wall of 32 text chips until `1e0d236` — it is a select
now, and the count of people sits beside it.

### C4. Reminders / notifications

**There is no notification code in the app at all.** Mail does exactly two
things — invitations and password resets. Nothing tells an НПП that submissions
are open, that the year closes soon, that a rating entry of theirs was discarded,
or that a здобувач they claimed was rejected. Biggest adoption risk, and it grew
with the claims feature: somebody files and hears nothing back either way.

Minimum: an email when a claim is rejected, one when a rating entry is discarded,
and a «year closes on X» an admin can trigger.

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

Rewritten 2026-08-17, after a working pass over the whole app and the owner's
answers. The deadline is **25 August**.

1. **Ставки phase 2** — the раised pool, frozen phase-1 numbers, manual
   distribution of the increase. The one substantial feature still missing, and
   the owner wants it by the deadline. **Blocked on one answer:** may a phase-1
   ставка be reduced when the pool is raised?
2. **C1 staff import** — re-runnable, with a dry-run report. **Blocked on the
   newer file** carrying names and emails; everything else comes from
   `УГСП_Дані.xlsx`. The destructive-seed trap that sat in front of this is
   closed (`7442c9a`).
3. **C4 notifications** — at minimum a mail when a claim is rejected and when a
   rating entry is discarded. Cheapest thing on this list with the largest effect
   on whether people trust the system: today they act and hear nothing.
4. **A pilot on two or three real people**, before the rollout. The 25th is the
   date people start using it, not the date it compiles.
5. **Column picker on /division-data** — the last piece of A5.
6. **A3–A4** — the section 3 form and the Публікації report.
7. **The leftovers of B1 and B2** — the п.38 mapping editor, manual п.15/п.20,
   bulk caps. All small, none blocking. The 1С/додаток 2 export is **not
   wanted** — confirmed 2026-08-17.
8. **«Аврора»** at `/admin/design` — chosen, and explicitly last.

**Done since the last revision of this list:** bulk invite (C3), the seed guard
and `--structure` mode, the year pinned on every ставка write, the декан's read
-only claims, the bonus stopped being paid automatically, and four UI fixes
found by driving the app rather than reading it.

The critical path is finished. **The risk is no longer the engine — it is that
nobody fills it in**, which makes the import and the notifications the things
that matter most now.
