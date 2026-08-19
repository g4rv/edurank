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

## Open questions

1. **Which years do we import?** All five, or 2021–2025 for the Характеристика
   window and only 2025 for the rating?
2. **Recompute scores, or keep the old ones?** Old scores reproduce the sheets
   exactly; recomputed ones agree with our engine. They will not match.
3. **What happens to a row we cannot map?** Refuse the whole import, skip and
   report, or park it on a «не розпізнано» indicator for a human?
4. **How do we match a person?** The file name is `ПІБ.xlsx`; our key is email.
   `staff-roster.json` already links the two — is it complete for all 318?
5. **Is an imported past year OPEN or CLOSED?** Closed is truthful, and means
   those years render from a snapshot instead of being recomputed later.

## Suggested order

1. A **read-only reporter**: parse everything, map nothing, print what is there
   and what will not map. It answers questions 3 and 4 with evidence instead of
   guesses, and it is throwaway if we change our minds.
2. Then a **label → indicator mapping table**, reviewed by a person, because the
   numbering shift makes anything fully automatic untrustworthy.
3. Then the import itself, one кафедра at a time, checked against «Загальна сума
   балів» from the old sheet.
