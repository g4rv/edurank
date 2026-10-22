# Рейтинг кафедри — design

Date: 2026-10-20. Source: `edu-reference/department_raiting_template.xlsx`
(«Звіт за 2025 календарний рік», sheet «Аркуш1»).

## Intent

The university has a second rating besides the personal one: a **кафедра's own
report**. Today it is a Google Sheet a кафедра fills by hand. The app's
existing «Рейтинг кафедри» is only a sum of the staff's personal ratings
(`/api/export/department-ratings`, the PDF chart) — nothing stores the кафедра's
own report. This feature brings that sheet into the app.

**The завідувач fills it, for now** (owner, 2026-10-20). Later some lines may
be derived from the staff's activities (monographs, Scopus articles exist in
both ratings) — not in this version.

## Goals

- A завідувач fills their кафедра's report and saves it; the score is computed.
- A декан reads the reports of their факультет's кафедри.
- ADMIN sees all 31 кафедри ranked, opens and edits any report.
- An Excel export of a report in the template's layout.

## Non-goals (this version)

- Deriving any value from staff activities or the personal rating.
- An admin editor for the indicators (catalogue comes from a seed / one-off script).
- Sheet «Аркуш3» of the template — the факультет average and the
  student-research table. It is a broken draft (`#REF!` everywhere). Later.
- An approval step. Like ставки, the head's save is final; ADMIN corrects.

## Anti-goals

- Do NOT bend the personal rating's `ActivityType` / `Activity` to carry a
  кафедра. Those rows are per person throughout (recompute, Характеристика,
  moderation, gate). Separate tables.
- Do NOT key behaviour on an indicator's code — same rule as the personal rating.
- Floats in stored scores: round to 2 decimals at save (the coefficients
  include 0,5), same as `round2` in `lib/rating/scoring.ts`.

## The template, decoded

Column A of the sheet holds item numbers that Google Sheets turned into dates
(«2026-01-01» = 1.1, «2026-02-01» = 1.2, «2026-01-02» = 2.1 — day = item,
month = sub-item). The real numbering:

### Part 1 — scored (count × coefficient, summed into «Всього»)

| №    | Label (shortened)                                                             | Coefficient                                                       |
| ---- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1    | Участь у виконанні міжнародних (всеукраїнських) … проєктів, виграно грант     | heading                                                           |
| 1.1  | Горизонт, всього одиниць                                                      | 50                                                                |
| 1.2  | Еразмус                                                                       | 30                                                                |
| 1.3  | МОН                                                                           | 20                                                                |
| 2    | Підготовка та подання на конкурс … грантових програм                          | heading                                                           |
| 2.1  | Горизонт                                                                      | 15                                                                |
| 2.2  | Еразмус                                                                       | 10                                                                |
| 2.3  | МОН                                                                           | 5                                                                 |
| 3    | Залучення додаткових коштів … платних послуг — **a choice**                   | 0-10 тис. = 10, 10-20 тис. = 20, більше 20 тис. = 30, nothing = 0 |
| 4    | Підготовка НДР для участі в конкурсі фундаментальних та прикладних досліджень | 10                                                                |
| 5    | Ініціативна тематика кафедри (за умови реєстрації в УкрІНТЕІ)                 | 3                                                                 |
| 6    | Опубліковано монографій …, з них                                              | heading                                                           |
| 6.1  | в Українських виданнях                                                        | 10                                                                |
| 6.2  | за кордоном, мовами країн ОЕСР та\або ЄС                                      | 20                                                                |
| 6.3  | тих, що індексуються у Scopus та\або WoS                                      | 30                                                                |
| 7    | Опубліковано статей …, з них                                                  | heading                                                           |
| 7.1  | Scopus/WoS, Q1-Q2                                                             | 5                                                                 |
| 7.2  | Scopus/WoS, Q3-Q4                                                             | 4                                                                 |
| 7.3  | з них у відкритому доступі                                                    | 1                                                                 |
| 8    | словників, каталогів, довідників та енциклопедій                              | 1                                                                 |
| 8.1  | з них у відкритому доступі                                                    | 1                                                                 |
| 9    | підручників, навчальних посібників                                            | 3                                                                 |
| 9.1  | з них у відкритому доступі                                                    | 1                                                                 |
| 10   | Розміщено … в Інституційному репозитарії університету                         | 0,5                                                               |
| 11   | публікацій у матеріалах конференцій, Scopus та\або WoS                        | 2                                                                 |
| 11.1 | з них у відкритому доступі                                                    | 1                                                                 |
| 12   | Організація та проведення … конференцій, конкурсів, заходів                   | heading                                                           |
| 12.1 | міжнародного рівня                                                            | 7                                                                 |
| 12.2 | всеукраїнського рівня                                                         | 5                                                                 |
| 12.3 | інтернет-конференція                                                          | 1                                                                 |
| 13.1 | Реєстрація об'єктів інтелектуальної власності                                 | 2                                                                 |
| 13.2 | Реєстрація патентів                                                           | 10                                                                |

Exact label texts: take them verbatim from the sheet (they are in `B9:B40`).
Item 13 has no heading row in the sheet; keep it that way.

**«Всього» includes 12.2** (owner, 2026-10-21). The sheet's formula in `C6`
leaves out `E37` (всеукраїнські конференції); that is a mistake in the sheet.

**Counts are typed, whole numbers 1–999** (owner, 2026-10-21). A 1–10 select,
as some of the sheet's cells have, was considered and dropped. 0 is not a
value: an empty line means «none». The box takes digits only and drops leading
zeros; the server refuses a COUNT below 1 (`valuesProblem`) and anything above
999 (the schema). A CHOICE stores its option's index, so its first option is 0
and the schema's floor stays 0.

The sheet's header note is shown on the form: «У показники кафедри вносяться
дані ЛИШЕ по ШТАТНИМ працівникам». Information, not enforced.

### Part 2 — text, no points

- **14 — Ініціативна тематика наукових досліджень та розробок за {year} рік.**
  A table of **up to 3 rows**; each row has three boxes:
  «Назва НДДКР, номер держреєстрації, ПІБ наукового керівника, науковий
  ступінь, терміни виконання, наукові секції за фаховими напрямами»;
  «Найвагоміші результати … у {year} році (до 10 речень)»;
  «Очікувані результати в {year} році (до 10 речень)».
- **15 — Звіт про результати держбюджетного/госпдоговірного дослідження.**
  **Up to 2 studies**, each six boxes: Назва дослідження; Замовник (номер, дата
  договору, строки виконання); Керівник проєкту (науковий ступінь та вчене
  звання); Виконавці проєкту (…); Обсяг фінансування; Основні результати
  діяльності за дослідженням (…).
- **16 — Опис найбільш ефективної розробки.** Eight boxes: Назва розробки,
  автори; Основні характеристики, суть розробки; Патенто-, конкурентоспроможні
  результати; Порівняння із світовими аналогами; Економічна привабливість …;
  Галузі, міністерства, … де планується реалізувати результати; Стан
  готовності розробок та результати впровадження; Адреса, Телефон, E-mail.
- **17 — Опис впливу результатів діяльності кафедри.** Six fields:
  17.1 «Основний вид впливу (необхідне лишити)» — **one select of the 12**
  (the list in `C69`: на забезпечення безпеки та оборони країни; на розвиток
  економіки; …; на розвиток державної політики), stored as `impact.kind`, a
  string or null. A list of ticks was tried on 2026-10-21 and reverted by the
  owner the same day. 17.2 Перелік основних наукових результатів …;
  17.3 Опис основних наукових результатів … (**до 3000 знаків**); 17.4 Роль
  наукової установи … (**до 2000 знаків**); 17.5 Опис впливу (**до 6000
  знаків**); 17.6 Перелік підтверджень впливу (опис підтвердження кожного
  впливу **до 1000 знаків** — enforce 1000 on the box; full hint text from
  `B74`).

Character limits are enforced (form + server). «До 10 речень» is a hint only.
Every box is optional.

**Filled through popups, not open boxes** (owner, 2026-10-21: «the forms take
way too much space»). Each entry of 14/15, and the single block of 16/17, is a
card naming it by its first filled box with «Заповнено N з M»; «Додати …» /
«Заповнити» / the pencil open a popup that edits a draft and hands it back
with «Готово». Nothing is stored until the page's one «Зберегти» — the
profile's diploma pattern. A popup closed with nothing typed adds nothing.
Read-only (a декан, a closed year) prints the full text instead.

## Year

**The report belongs to the active rating year** (`getActiveTemplate()`) — my
call; owner did not answer which year comes first. The sheet's «календарний
рік» matches the rating's calendar years, so a report has the rating year's
`year`, opens and closes with it: editable while that `RatingTemplate` is OPEN,
read-only once it is CLOSED, editable again on `reopenYear`. Same rule as
ставки: the year is never taken from client input — every mutation compares the
submitted year to the active one and refuses a mismatch.

The year shows in the headings («Звіт за 2026 календарний рік», item 14's
«за 2026 рік»).

## Data model

Separate from the personal rating. Suggested shape (builder may rename):

- `DepartmentIndicator` — the year's catalogue: `year`, `itemNumber`,
  `order`, `label`, `kind` (`HEADING` | `COUNT` | `CHOICE`), `coefficient`
  (for COUNT), `options` JSON `[{ label, points }]` (for CHOICE), `isActive`.
  `@@unique([year, itemNumber])`. Lives in the DB, not in code, so next year's
  changes are data (same principle as `ActivityType`).
- `DepartmentReport` — one per кафедра per year: `departmentId`, `year`,
  `values` JSON (indicator id → count or chosen option index), `narrative`
  JSON (Part 2), `totalScore` Float (rounded to 2 dp, written on save),
  `updatedById`, timestamps. `@@unique([departmentId, year])`.
  `onDelete: Cascade` from Department is fine — a кафедра is not deleted in
  practice; builder to check what deleting a кафедра does today.

**Part 2's structure is fixed in code** (a schema module, e.g.
`validations/department-report.ts`) — my call: it carries no points, no
editor is planned, and its shape (repeat counts, char limits, the 12 options)
is easier to validate as Zod than as JSON definitions. If the narrative
changes next year it is a code change.

**Scores:** computed on every save from the year's current indicator rows.
Not frozen per value: the catalogue only changes by a script, and a closed
year is read-only anyway.

**Closed year:** the report is simply not editable; no snapshot is needed
because the indicator rows for that year are not changed after close. (If an
admin editor is added later, a snapshot becomes necessary — note in code.)

**Next year:** `cloneTemplate` (`app/(dashboard)/admin/rating/actions.ts`)
also copies the year's `DepartmentIndicator` rows to the new year.

## Who may do what

All server-side; the sidebar flag is not a permission.

| Who                          | List `/department-rating`                | Report `/department-rating/[id]` |
| ---------------------------- | ---------------------------------------- | -------------------------------- |
| ADMIN                        | all 31 кафедри, ranked                   | read + edit any                  |
| Завідувач (`headOf`)         | redirected to their own (if one кафедра) | read + edit their own            |
| Декан (`deanOf` / `scopeOf`) | their факультет's кафедри, ranked        | **read only**                    |
| Anyone else                  | `notFound` / redirect, like `/stakes`    | `notFound`                       |

- **Заступник завідувача кафедри з наукової роботи** (owner, 2026-10-21): the
  person who actually fills the report. Same rights as the завідувач on THIS
  screen only — fill and save, sidebar link, redirect to their кафедра — and
  nothing else. `Department.scienceDeputyId`, set by whoever may edit the
  кафедра on `/departments/[id]/edit` (not in the create dialog), audited,
  cleared when the person is archived. Not a `Role`, not in `scopeOf`.
- «May I look» = `scopeOf` or `scienceDeputyOf` (or ADMIN); «may I save» =
  `headOf` or `scienceDeputyOf` (or ADMIN).
  `scope.ts` already draws exactly this line.
- A декан read-only is my call from the app's standing rule «a декан inspects,
  the head decides»; the owner approved the summary containing it.
- EDITORs (ННВ etc.) get nothing in this version.
- A head of two кафедри sees a list of the two.

## Screens

Follow `docs/aurora.md` and the existing controls in `components/aurora/ui/`;
copy the shape of `/stakes` and `/stakes/[id]`.

- **Sidebar:** «Рейтинг кафедри» in «Управління», next to «Розподіл ставок»,
  for ADMIN, завідувачі and декани (`components/sidebar.tsx`). Owner asked for
  its own sidebar link, not a tab under «Моя кафедра».
- **`/department-rating`** — table: кафедра, факультет, «Всього», status
  («Не заповнено» when no report, a `--warning` pill), sortable by total,
  each row links to the report. A декан's list is their факультет only.
- **`/department-rating/[id]`** — the report. Header: кафедра name, «Звіт за
  {year} календарний рік», the «ЛИШЕ по ШТАТНИМ працівникам» note, «Всього»
  as the one accent figure. Part 1 as a table: №, Назва критерію, К-сть
  (number input / select for item 3), Бал (computed live). Headings 1, 2, 6, 7,
  12 as group rows. Part 2 below as cards (14, 15, 16, 17), item 14 and 15 with
  «Додати» for the repeated rows up to their limit. One «Зберегти», the
  unsaved-changes guard (`components/unsaved-changes-guard.tsx`). Read-only
  render for a декан and for a closed year.
- **Excel:** «Вивантажити Excel» on the report page →
  `GET /api/export/department-report?department=<id>` in the template's
  layout (exceljs, see `lib/rating/export-workbook.ts` for the house pattern).
  Authenticates itself (`/api` is not behind `proxy.ts`), same scope as the page.

**Name clash:** «Моя кафедра» already has an export button labelled
«Рейтинг кафедри {year}» which is the staff's personal ratings. Rename that
button to «Рейтинг НПП кафедри {year}» — my call.

## Saving

- Server action `saveDepartmentReport({ departmentId, year, values, narrative })`
  in `app/(dashboard)/department-rating/actions.ts`.
- Zod schema shared by form and action (counts: int ≥ 0; choice: a valid option
  index or none; narrative: lengths).
- Unknown or inactive indicator ids in `values` are refused.
- Audited (`diffChanges`, entity `DepartmentReport`), labels in `lib/labels.ts`.
- Errors via `parseDbError` / `logError` as the CLAUDE.md «Errors» section says.

## Getting the catalogue in

- Catalogue def in code (e.g. `lib/department-rating/catalogue-2026.ts`) is
  seed input only, like `ACTIVITY_TYPES_2026`.
- `pnpm db:seed` upserts it for the seed year.
- Production is never seeded again: a one-off `pnpm db:department-rating-catalogue`,
  **create-only**, report first, `--apply` to write — same as
  `db:science-catalogue`. Creates the rows for the active year if missing.

## Tests

Scoring (count × coefficient, the choice, rounding, 12.2 in the total),
access (admin / head / декан read-only / outsider / closed year / year
mismatch), narrative limits, clone copies the indicators.

## Open — for the owner

1. Which year does a head fill first? Design assumes the active rating year
   (2026). If the 2025 report must be entered now, a closed year needs to accept
   it — that changes the year rule above.

## Left to the builder

Table and file names, the exact layout of the Excel sheet beyond «follow the
template», the icon, how the narrative cards collapse.
