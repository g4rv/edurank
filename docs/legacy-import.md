# Importing the university's existing data

Notes from reading `edu-reference/ФАКУЛЬТЕТИ/`, taken before any import is
written. Nothing here is built yet — this is what is in the folder, how it lines
up with our schema, and the four things that will go wrong if we are careless.

Worked example throughout: **Дудар Василь Леонідович**, проректор, кафедра
соціальних комунікацій.

## What is actually there

```
ФАКУЛЬТЕТИ/
  <факультет>/                    8 of them
    <кафедра>/                    31 in total
      Розділ_1/ … Розділ_5/       one .xlsx PER PERSON per section
      Таблиці_Викладачів/         one .xlsx per person — the rating sheet
      Сертифікати/<ПІБ>/<рік>/    scanned certificates, only 31 folders
```

|                                            | count      |
| ------------------------------------------ | ---------- |
| факультети                                 | 8          |
| кафедри                                    | 31         |
| people (unique `Таблиці_Викладачів` files) | **318**    |
| `Розділ_*` files                           | 1 588      |
| **activity rows inside them**              | **19 418** |
| distinct item codes used                   | 35         |
| certificate files                          | 39         |

Rows by year — and this is the reason the import matters:

| 2021  | 2022  | 2023  | 2024  | 2025  |
| ----- | ----- | ----- | ----- | ----- |
| 2 165 | 2 118 | 1 684 | 6 145 | 7 306 |

The Характеристика reads a **five-year window**, so 2021–2024 is not history we
are keeping for sentiment — it is the input to «відповідає ліцензійним умовам»
for every person, and therefore to `Кнпп` and the ставка distribution.

## The three kinds of file

### 1. `Розділ_N/<ПІБ>.xlsx` — the activities. This is the one that matters.

One sheet per year (`2025`, `2024`, `2023`, `2022`, sometimes `2021`), one row
per activity, four columns:

| col | holds                   | Дудар, Розділ_3, sheet «2025»                          |
| --- | ----------------------- | ------------------------------------------------------ |
| 1   | item number + label     | `3.9. Публікації у виданнях категорії Б`               |
| 2   | the option chosen       | `співавторство`                                        |
| 3   | quantity / multiplier   | `1`, `0.5`, `10`                                       |
| 4   | the evidence, free text | `Дудар, В., & Панчук, Ю. (2025). ІСТОРИЧНИЙ РОЗВИТОК…` |

**This maps almost one-to-one onto `Activity`**: col 1 → `activityType`,
col 2 + col 4 → `evidence`, the sheet name → `year`. It is the closest thing to
a clean import in the whole folder.

### 2. `Таблиці_Викладачів/<ПІБ>.xlsx` — the rating sheet, 5 sheets

- **«Рейтинг»** — the full scored table for 2025. ~996 rows: every indicator in
  the catalogue, with the person's score against the ones they hold. Columns:
  `№ п/п | Зміст показників | Критерії (балів) | одиниця | Отриманий рейтинг |
Дані внесені`. Section totals at «Всього балів по розділу N», grand total at
  «Загальна сума балів» (Дудар: **2931**, of which розділ 3 = 2675).
- **«Рейтинг_2024»** — the same sheet for the previous year.
- **«Характеристика_РНПАВ»** — the 20 п.38 positions with evidence text under each.
- **«Дані»** — ORCID, Google Scholar, Scopus, WoS links. Straight into `Staff`.
- **«Таблиця_2»** — the accreditation table (посада, стаж, дисципліни).

The «Рейтинг» sheet is a **computed view, not a source**. Its numbers come from
the `Розділ_*` files. Import the Розділ files; use «Рейтинг» to CHECK the totals.

### 3. `Сертифікати/<ПІБ>/<рік>/` — 39 files across 31 people

Almost nobody has them. Not worth blocking the import on: there is no file
storage and no attachment model.

## The four things that will go wrong

### 1. Item numbers are NOT stable between years — the big one

The old sheets number indicators differently from our 2026 catalogue:

| item     | old sheet (2025)                       | our 2026 catalogue                    |
| -------- | -------------------------------------- | ------------------------------------- |
| 3.5      | Ініціативна тематика кафедри           | Реалізація ініціативної тематики ✅   |
| 3.8      | Публікації у наукометричних базах      | same ✅                               |
| 3.9      | Публікації категорії «Б»               | same ✅                               |
| **3.10** | **Статті у наукових виданнях**         | **Захист під керівництвом НПП** ❌    |
| **3.12** | **Наукове консультування/керівництво** | **Підготовка здобувачів-призерів** ❌ |

Somewhere in section 3 the numbering shifts by one. **Matching on the item
number alone will silently file publications as something else.** The label in
column 1 has to be the primary key, with the number as a hint — the same lesson
as «never key rating behaviour on `code`» in CLAUDE.md, reached from the other
direction.

### 2. Excel turned item numbers into dates

In the «Рейтинг» sheet, column 1 holds `2022-05-03T00:00:00.000Z` where the
document says **3.5**. Ukrainian `d.m` parsing: day 3, month 5. It affects
`x.1`–`x.12` only — `3.15` and up survived as text, because there is no month 15.

Decoding is easy once known (`day.month`), but a reader that treats column 1 as
a string sees a timestamp and skips the row.

### 3. Our own catalogue reuses item numbers

`ACTIVITY_TYPES_2026` has 67 indicators over 5 sections and the numbers are not
unique: `3.17` appears three times, `3.24` three times, `3.25` three times, `4.1`
twice. So even a correct number does not identify one indicator. The option text
in column 2 is what separates them (`одноосібно` vs `співавторство`).

### 4. Only 35 of 67 indicators appear in the data

The old template was smaller. Anything new in 2026 has no history, which is
fine — but «nothing imported for this indicator» is then expected rather than a
bug, and worth saying up front so nobody chases it.

## How it lands in our schema

| source                   | target                                                     |
| ------------------------ | ---------------------------------------------------------- |
| `Розділ_N` row           | `Activity` — `activityTypeId`, `year`, `evidence`, `score` |
| sheet name (`2024`)      | `Activity.year`                                            |
| col 2 + col 4            | `Activity.evidence` JSON                                   |
| «Рейтинг» section totals | check against `RatingEntry` after recompute                |
| «Дані» sheet             | `Staff.orcidId`, `scopusUrl`, `googleScholarUrl`, `wosUrl` |
| «Характеристика_РНПАВ»   | nothing — we DERIVE this from activities                   |
| `Сертифікати/`           | nothing yet — no attachment model                          |

Two things follow from how the app already works:

- **Scores are frozen at save** (`Activity.score`). An import can recompute from
  the 2026 coefficients or carry the old score across. Those give different
  numbers for a past year, and it is a decision, not a detail.
- **A year needs a `RatingTemplate`** before activities can hang off it. 2021–2024
  have none. Either clone 2026 backwards, or build per-year templates from the
  old «Рейтинг» sheets — more faithful, more work.

## Decisions (owner, 2026-08-19)

1. **Import every year we can**, for both the Характеристика and the rating.
   The floor, if something proves impossible: the Характеристика in full, plus
   at least the last year's rating VALUES — enough to spread the ставки.
2. **Keep the old scores.** They were produced by the university's system, not
   ours, and reproducing them is the point. Comparing them against what our
   engine would compute is interesting and is its own task — not a reason to
   overwrite what they recorded.
3. **Print every row we cannot map** rather than guessing or refusing. An empty
   score cell is not a problem to solve: it means no score for that item.
4. **Import only people present in `staff-roster.json`.** Everyone else goes in
   a separate list to be looked at by hand.
5. **Imported years arrive CLOSED.** They render from a snapshot and are not
   silently recomputed later.

## What the survey found

`pnpm legacy:report` (read-only, writes to the gitignored `import-report/`):

|                                   |                                                             |
| --------------------------------- | ----------------------------------------------------------- |
| activity rows parsed              | 19 418                                                      |
| people with activities            | 294                                                         |
| …matched to the roster            | **256**                                                     |
| …not in the roster                | **38** → `not-in-roster.md`                                 |
| labels mapped to a 2026 indicator | 9 423 rows                                                  |
| labels NOT mapped                 | **9 995 rows, but only 21 distinct labels** → `unmapped.md` |

Two things that were guesses and are now facts:

- **`_` in a file name is a sanitised apostrophe.** `Дем_яненко` is
  `Дем'яненко`, and the факультет folder «Фізичної культури, спорту і здоров_я»
  says the same. A `(1)` suffix is a duplicated file, not a name. Normalising
  both recovered 4 people who otherwise read as leavers.
- **Of the 38 remaining, 4 are typos, not departures** — «Мізін Констянтин» for
  «Костянтин», «Потапенко Олександер» for «Олександр», and two more, each one or
  two letters out. The report now prints the closest roster name beside each, as
  a suggestion for a person to accept or reject. It never matches on it: «Коцур
  Дмитро» and «Коцур Роман» are one surname and two different people.

### The unmapped 9 995 are 21 labels, and that is good news

Almost all of it is a handful of very common indicators whose wording moved
between the 2025 sheets and the 2026 catalogue:

| rows  | the sheet says                        | almost certainly            |
| ----- | ------------------------------------- | --------------------------- |
| 2 913 | Публікації у виданнях категорії «Б»   | 3.9 publication_cat_b       |
| 1 982 | Статті у наукових виданнях, збірниках | 3.10 in the OLD numbering   |
| 1 641 | Участь у конференціях в Україні       | a 3.19–3.21 conference item |
| 947   | Ініціативна тематика кафедри          | 3.5                         |
| 454   | Публікації… категорії «А»             | 3.8 publication_cat_a       |

Twenty-one decisions covers 9 995 rows, which is a review a person can actually
do. It is deliberately NOT automated: prefix matching already fails here — the
sheet's «Публікації у виданнях категорії Б» is not a prefix of the catalogue's
«Публікації у фахових наукових виданнях України категорії Б» — and a fuzzy match
that is wrong files somebody's article as a supervised dissertation.

Curiosities worth keeping: one label is literally «Видання монографії
(undefined)» — a JavaScript value that leaked into the old system's output and
was saved 73 times — and «Підгтовка кадрів вищої кваліфікації» carries a typo
across 224 rows.

## The fallback path, measured

The owner's point about «the total at the very bottom» is the safety net: if the
activity rows cannot be mapped one by one, the university's own computed figures
are still enough to fill `RatingEntry` — and `RatingEntry` is what
`formulaShares` reads. **The ставки can be spread with no `Activity` row in the
database at all.**

Measured, it holds up:

|                                       |                                   |
| ------------------------------------- | --------------------------------- |
| sheets carrying «Загальна сума балів» | **571**, none missing             |
| with all five section subtotals       | yes — «Всього балів по розділу N» |
| years covered                         | **2024 and 2025 only**            |

Spot check against the university's live ставки screen: Коцур Віктор Петрович
2025 = **3517.32** in the sheet, and 3517.32 on their screen. The figure is
sound.

### But the Характеристика is NOT in these files

The «Характеристика_РНПАВ» sheet exists in all 319 workbooks and its layout is
consistent (col 3 = «Дані підтвердження показника», two header spellings). It is
also **empty for 294 of them** — only **25 people** have evidence against even
one of the twenty positions.

So it cannot be imported. The Характеристика has to be DERIVED from activities,
the way the app already does it — which makes the 21-label mapping mandatory
rather than a nicety, because `Кнпп` depends on it and `Кнпп` is on the ставка
screen.

### What that means for the «bare minimum»

The two halves of the minimum have very different costs:

- **Last year's rating values — available now.** The totals are parsed, complete
  for 2024 and 2025, and need no mapping, no `Activity` rows and no decisions.
- **Характеристика — needs the label mapping first.** There is no shortcut in
  the data; the source sheets do not carry it.

One consequence to decide on: a `RatingEntry` written from a total, with no
activities behind it, is a number nothing can recompute. That is exactly why
imported years land CLOSED — but it also means `closeYear` must never be run
over them, because it rebuilds the snapshot from activities and would zero
them.

## The profile half — УГСП_Дані.xlsx

A second source, and the only one that fills a `Staff` row. Its «НПП» sheet
carries стаж, звання, ступінь, ORCID and the three research profiles with their
citation counts — which is precisely the input to every `PROFILE_DERIVED`
indicator (1.1 стаж, 1.2 звання, 1.3 ступінь, 3.24 цитування). Without it those
score nothing however well the activities import.

317 people listed, **276 on our roster**; the rest are skipped, per the owner.

| field                     | filled |     |
| ------------------------- | ------ | --- |
| вчене звання              | 271    | 98% |
| ORCID                     | 269    | 97% |
| науково-педагогічний стаж | 264    | 96% |
| Google Scholar            | 260    | 94% |
| науковий ступінь          | 224    | 81% |
| Web of Science            | 136    | 49% |
| Scopus                    | 117    | 42% |

Both vocabularies map 1:1 onto our enums with nothing left over — four ranks,
four degrees — and the report says so rather than assuming it.

**«кандидат наук (PhD) за спеціальністю кафедри» is not a fifth degree.** It is
the degree plus `degreeMatchesDepartment`, which we store as a separate boolean
and which is worth 10 more points in indicator 1.3.

### employmentRate does not come from here

The sheet has an «Обсяг ставки» column and it is empty for everybody. That is
fine: **`employmentRate` is set by the розподіл ставок, not imported** (owner,
2026-08-19).

Worth knowing before relying on it: **nothing in the ставка flow writes
`Staff.employmentRate` today.** The розподіл stores its decision in
`StakeAllocation.proposedHundredths`, and `Staff.employmentRate` is a separate
confidential field an ADMIN types on the staff form. The two are not connected
yet — so the field stays empty after an import until either somebody fills it in
by hand or the ставка flow is made to write it.

## Next## Next

1. Turn those 21 labels into a reviewed **label → indicator table**, checked in,
   with a line per decision.
2. Decide the 38 by hand: 4 typos to fold in, ~34 to record as departed.
3. Then the import, one кафедра at a time, checked against «Загальна сума балів».

## The 2026 restructuring — noted, not applied

`edu-reference/new_deps.docx` (2026-08-20) regroups the university: **8
факультети become 6 plus a навчально-науковий інститут**, 21 of the 31 кафедри
change parent, and four are renamed.

**Deliberately not applied** (owner, 2026-08-20): the owner and the boss will
make these changes by hand in the app. What is recorded here is what the
document says, so nobody has to read it again:

| кафедра                                 | today                   | in the document                                                                                   |
| --------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| Здоров'я і безпеки життєдіяльності      | Природничої освіти      | renamed **Фізичної реабілітації, здоров'я і безпеки життєдіяльності**, moved to Фізичної культури |
| Математики, інформатики **і** методики  | —                       | «…**та** методики»                                                                                |
| Української лінгвістики **та** методики | —                       | «…**і** методики»                                                                                 |
| Філософії… **І. П.** Стогнія            | Соціально-психологічний | «**І.П.**Стогнія», moved to Української та іноземної філології                                    |
| **Професійної освіти**                  | Фінансово-економічної   | **absent from the document entirely**                                                             |

Only one факультет keeps its name: «Української та іноземної філології».

Two things to settle before anybody applies it:

- **Кафедра професійної освіти** has staff and 2025 activities. Closed, merged
  into «Теорії та методики професійної підготовки», or simply left out?
- The **навчально-науковий інститут** is not a факультет, and the app has only
  `Faculty`. It would sit in that table under a name that says otherwise.

None of this blocks the import: `staff-roster.json` and the `ФАКУЛЬТЕТИ`
folders are keyed on **кафедра**, never on факультет.

**If the кафедра names are ever changed** — in the app or in the seed — the old
spellings have to keep resolving. 32 people in the roster carry them, and every
folder under `edu-reference/ФАКУЛЬТЕТИ/` is named the old way permanently.
`normaliseDepartmentName` forgives case, apostrophes and the «Кафедра» prefix
but NOT «і» against «та», so a rename without an alias silently leaves those
people with no кафедра. This was tried and reverted in `9400c1d` / `c1ba555`;
the alias map there is worth reading before doing it again.
