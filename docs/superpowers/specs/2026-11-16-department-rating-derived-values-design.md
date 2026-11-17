# Рейтинг кафедри — values from the staff's personal entries

Date: 2026-11-16. Status: **built** on `feat/department-rating-derived` (plan:
`docs/superpowers/plans/2026-11-16-department-rating-derived.md`); not yet tried
in the browser. Follows
`2026-10-20-department-rating-design.md`, whose non-goal «deriving any value from
staff activities» this spec lifts for some lines.

## Why

The заступник завідувача retypes numbers the app already holds: a Scopus Q1
article is in the НПП's own rating AND in the кафедра's report. The report is
due before the rating closes (1 Feb). Fewer retyped lines means fewer mistakes
and less work for the person who fills it.

## Decisions taken (owner, 2026-11-16)

- **A line is linked only as far as the personal entry fully decides it.**
  Full → an exact suggestion. Partial → a hint. None → typed, as today.
- **No big redesign now.** One work table for articles etc. is a v2 idea
  (rating, science plan and Характеристика hold three unlinked copies). This
  feature must not block it: see «One function» below.
- First version = lines that need **no change to the personal forms**.

## Coverage of the 2026 lines

| Line                                                   | Source (`ActivityType.code`)                                         | Coverage              | Why                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| 5                                                      | `initiative_topic`                                                   | FULL                  | a topic; many people hold it → dedupe by title                                                  |
| 6.1                                                    | `monograph_ua`                                                       | PARTIAL               | personal splits by language, the report by place of publication                                 |
| 6.2                                                    | `monograph_eu`                                                       | PARTIAL               | same                                                                                            |
| 7.1                                                    | `publication_cat_a`, option `q1`/`q2`                                | FULL                  | Q1–Q2 implies Scopus/WoS                                                                        |
| 7.2                                                    | `publication_cat_a`, option `q3_4`                                   | FULL                  | Q3-Q4 implies Scopus/WoS. Was `q3_4_or_none` (PARTIAL, over-counted) until the 2026-11-17 split |
| 9                                                      | `edition_publication`, `textbook`/`study_guide`                      | FULL                  | вчена рада approves these editions                                                              |
| 12.1                                                   | `intl_conf_organization` + `cultural_sport_events` (`international`) | PARTIAL, under-counts | the line also covers олімпіади, мистецькі та спортивні заходи; one event has many organisers    |
| 12.2                                                   | `ukr_conf_organization` + `cultural_sport_events` (`national`)       | PARTIAL, under-counts | same                                                                                            |
| 13.1                                                   | `copyright_registration`                                             | FULL                  |                                                                                                 |
| 13.2                                                   | `patent_granted`                                                     | FULL                  |                                                                                                 |
| 1.x, 2.x                                               | `intl_grant_won`, `*_grant_application`                              | PARTIAL, **later**    | titles only; no Horizon / Erasmus / МОН field. Needs a new field → phase 2                      |
| 3, 4, 6.3, 7.3, 8, 8.1, 9.1, 10, 11, 11.1, 12.3, 14–17 | —                                                                    | NONE                  | no personal source                                                                              |

Counting rules for FULL and PARTIAL lines:

- **People:** `isNpp`, `ON_ROSTER`, `RATED` (not an external part-timer) and the
  кафедра is the person's **own primary** `departmentId`. NOT `onDepartment()`:
  the sheet says «ЛИШЕ по ШТАТНИМ працівникам», and a сумісник is not штатний
  here. (Owner to confirm: see Open 2.)
- **Entries:** the rating year of the report, `APPROVED`, indicator `isActive`
  (the same `COUNTED` rule the rating uses). A discarded entry does not count.
- **Dedupe, one WORK counted once** across the кафедра's people, in three tiers
  (owner, 2026-11-16 — «pay great attention to this step»):
  1. **Sure duplicate** — the same strong key: ISBN, DOI, the Scopus/WoS link,
     or the patent / свідоцтво number, normalised. Merged automatically.
  2. **Same text** — no shared key, but the same words once case, quotes and
     punctuation are ignored. Merged.
  3. **Probable duplicate** — `sameWorkByText` (`lib/science/similar-title.ts`)
     says the texts are one work. **Merged, but marked «перевірте»** with every
     spelling listed (owner, 2026-11-16, after the browser test — this replaced
     «flagged, never merged»: every НПП enters the кафедра's own topic, and line
     5 offered 13 for 3 topics). Text never merges entries whose ISBN / DOI /
     number differ.
  4. Everything else — a separate work.

  Which lines have a strong key on the form: 7.1 (link mandatory), 6.1 (ISBN
  mandatory), 13.1 / 13.2 (number mandatory). 6.2 only sometimes (ISBN
  optional). **9, 5 and 12 are text only** — their dedupe is tier 2 alone.

- **Never stored.** A derived number is computed on every read, like `Кнпп`.
  What gets stored is what the head accepts or types, in `values`, as today.
  So a closed year needs no extra snapshot: it shows the stored values.

## Behaviour on the screen

- **One tinted box under the line, named and grouped** (owner, 2026-11-17 —
  «Прийняти» / «Переглянути» alone read as vague). «Переглянути роботи (N)»
  opens the list of works behind it.
- **FULL line:** «Автозаповнення з рейтингу НПП: N» and «Використати N», which
  writes N into the box (saved like any count). The head may type another
  number; then the box reads «У рейтингу НПП — N, у звіті — M» with «Замінити
  на N». When they match: «✓ Збігається з рейтингом НПП: N». Nothing is refused.
- **PARTIAL line:** «Підказка з рейтингу НПП: знайдено N, можливо, більше —
  перевірте й впишіть самі». No insert button. A hint only.
- **Nothing found:** one quiet line, «У рейтингу НПП нічого не знайдено», no box.
- **NONE line:** unchanged.
- The list is a table of WORKS, not entries: title, the people of the кафедра
  who entered it, why it was grouped («однаковий ISBN», «однакова назва»,
  «схожа назва»), and on a tier-3 work the spellings that were joined. Header:
  «Робіт: N · авторів: A з Y НПП». «Внесли власні досягнення: X з Y» is said
  once, above the report, not per line (it is not about the line). A row opens
  the original entries and their proofs.
  Read-only. **No merge / split buttons** in this version — the head types the
  right number; the table only helps decide.
- A декан and a closed year see the same numbers read-only, as the rest of the
  report.

## One function (v2-ready)

All of this goes through ONE function:

```
derivedWorks(departmentId, year) → Map<itemNumber, { coverage, works[] }>
```

Today it reads `Activity` rows. The day the single works table exists it reads
that, and the screen does not change. The mapping from a report line to a source
is **data**, a `sources` JSON column on `DepartmentIndicator`
(`[{ code, when?: { field, in } , coverage }]`), the same idea as
`ActivityType.licencePositions`. It is NOT keyed on `code` in the report's logic;
`code` is the stable semantic key of the source indicator, which the rating
already treats as stable across years.

## The vice-head reads their кафедра's people (owner, 2026-11-16)

Separate branch, stacked UNDER this feature. Reverses part of 2026-10-21's
«the заступник з наукової роботи gets this screen and nothing else».

- `scienceDeputyOf` joins the «may I look» rule for a staff record: profile
  (**no ставка** — `showStake` stays ADMIN + self), «Рейтинг», «Характеристика».
  **Not** «Підвищення кваліфікації» or its files. Never `headOf`: they decide
  nothing outside Рейтинг кафедри.
- «Моя кафедра» opens for them, read-only, and **without**: the Ставка column,
  the «Розподіл ставок» button and «Залучені здобувачі». The rating and
  Характеристика Excel stay (they show what the tabs show). The two
  `/api/export/*` routes accept them for their own кафедра only.
- Sidebar: «Моя кафедра» for them too.
- Each author in the works list links to `/staff/[id]`.
- CLAUDE.md's line about the заступник is updated with it.

## Anti-goals

- Do not write a derived number into `values` by itself. Only «Використати» / «Замінити» or typing.
- Do not add a кафедра to `Activity`. The кафедра comes from the person.
- Do not change a personal form in this version.
- Do not flag a head's number as wrong when it differs from the suggestion.

## Phase 2 (not in this version)

Personal form fields that make PARTIAL lines FULL: a **programme** select on the
grants (Horizon / Erasmus / МОН), a **Scopus/WoS** tick on monographs (6.3), an
**open access** tick on articles (7.3). Saved entries have none of them, so
people would have to edit old entries first.

## Tests

The mapping per line (right option → right line), people filter (external part-
timer, сумісник, archived, another кафедра), counted statuses (discarded,
inactive indicator), dedupe by each key and the no-key case, FULL vs PARTIAL
output, closed year reads stored values only, no derived value is ever written
without «Використати».

## Answered (owner, 2026-11-16)

1. Works with no strong key → joined by the same or a similar text, the similar
   ones marked for the head to check (revised the same day — see «Dedupe»).
2. **Сумісники do not count.** Later maybe: someone who is a сумісник on THIS
   кафедра only and on no other.
3. Merge / split buttons → later.
4. «внесли дані: X з Y НПП» — kept, one line, above the report (moved out of the
   list the same day: in a line's list it read as «X people entered THIS line»).
