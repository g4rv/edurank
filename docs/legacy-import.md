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

## What 2025 actually took — and what the sheets do not say (2026-08-20)

The first import ran and came out at **72%** of the university's own total. Every
step below is a thing the documents do that nobody could have guessed from
reading one of them. `pnpm import:verify-2025` is the measurement; run it after
any change here.

| розділ | after the first import | now      |
| ------ | ---------------------- | -------- |
| 1      | 38%                    | 100%     |
| 2      | 40%                    | 100%     |
| 3      | 75%                    | 100%     |
| 4      | 28%                    | 100%     |
| 5      | 113%                   | 100%     |
| разом  | **72%**                | **100%** |

749 530 against their 749 846, and **every розділ at 100%**. 219 of 250 people
match their sheet **to the last 0.5 балів**; the differences that remain add up
to 2 550 in absolute terms, **0.34%**.

### The order to run them in

```bash
pnpm legacy:template                        # read the year's structure out of the sheets
pnpm import:template-2025 --apply           # …add --replace to rebuild an existing year
pnpm import:activities-2025 --apply         # the Розділ_* files — what НПП reported
pnpm import:registers-2025 --apply          # the відділи' own Дані * registers
pnpm import:division-2025 --apply           # the little the registers do not cover
pnpm import:trim-2025 --apply               # back to their figure where somebody submitted twice
pnpm db:recompute 2025
pnpm import:verify-2025                     # against «Загальна сума балів»
```

`pnpm import:profiles --apply` is separate and fills `Staff` from `УГСП_Дані`.
It does not touch 2025 — a 2025 стаж is a 2025 fact and comes from that year's
sheet — but every `PROFILE_DERIVED` indicator of the **open** year depends on it.

### 1. A «1» in the criteria column is a heading, not a price

Fourteen indicators open with a group title that carries `1` where the points go.
Read as a choice, it became an option worth one point — and because the Розділ
files write the group's TITLE into their option column, the import then matched
it for every row underneath. 399 conference-organiser rows scored 1 instead of
20–100. Соловйова's розділ 4 came out at **3** against her sheet's 90.

Every genuine first choice in the document is priced 10–500. Every «1» is a
title. There is not one exception in the 53 indicators.

### 2. One indicator can hold two groups at different prices

4.1 organises Міжнародні conferences and Всеукраїнські ones, both with голова /
заступник / член — worth 100/80/50 and 50/40/20. Flat, they are one label twice.
`legacy:template` folds the group title into the choice («…Всеукраїнських… —
член оргкомітету»), but only where an indicator has more than one group.

### 3. Column 3 of a Розділ row means two different things

It is the **quantity** when column 2 already named the choice — 1.11 «дистанційно
(не менше 1 місяця)» × 2 стажування = 20. It is the **price** when column 2 named
only the group, and is then the one thing identifying which choice it was.
`resolveOption` tells them apart; getting it wrong loses either the multiplier or
the choice.

### 4. The unit is often on the choices, not on the indicator

2.2 «Видання затверджені вченою радою» and 1.11 are headings with an empty
column 4; «балів\* др.а./с.а.» and «балів кредит 10» sit on the rows beneath.
Reading only the top row made both flat, so a textbook of six друкованих аркушів
scored one textbook.

Two more units are not obviously units at all:

- **5.1's «за умови заповнення усіх обов'язкових пунктів» is a proportion.** A
  Moodle course with every obligatory item pays 150 and a partly filled one pays
  its share; the Розділ rows carry that share (0.175…). Priced flat, розділ 5
  came to 113% of the sheet.
- **2.1's price of `1` means «1 бал за одиницю».** 227 годин навантаження is 227
  points — and, read as a flat award, 227 separate activity rows.

### 5. Numbers drift between the two documents of the SAME year

The Розділ files number патенти **3.28**; the «Рейтинг» sheet numbers it **3.29**
and gives 3.28 to цитування. 60 patent rows were filed as citation counts. A
label that matches an indicator outright now beats the number, including where
one label is the opening of the other («…на об'єкти інтелектуальної власності»
against «…власності за поточний рік») and exactly one indicator matches.

### 6. Розділи 1 and 2 are not in the Розділ files at all

A `Розділ_N` workbook is what the НПП reported about themselves. Everything ННВ,
ННЦЗЯО and ВМЗ fill in — навантаження, гарант ОП, стаж, звання, ступінь,
h-індекс, спецради — was typed straight into the «Рейтинг» sheet and exists
nowhere else. That is **28% of the university's total**, and it is why розділи 1
and 2 sat at 38% and 40% with every scoring bug already fixed.

`pnpm import:division-2025` reads it back out: 2 451 rows, 176 302 points. It
skips any indicator a person already holds, so nothing is counted twice, and it
refuses any row whose arithmetic does not land back on the sheet's figure.

### 7. «Отриманий рейтинг» is a merged cell

The score spans a heading and every choice under it, and exceljs repeats it on
each row. Read row by row, Ткаченко's 80 under 3.14 appears three times — as
1 місце × 1, as 3 місце × 2, and on the heading — and two of those would have
been written. The division import groups rows by their merge master.

### 8. The відділи keep their own registers, and they are the real source

The single biggest thing, found only because the owner pointed at it. The four
`edu-reference/Дані *.xlsx` files are to the division half what the `Розділ_*`
files are to the self-reported half. The «Рейтинг» sheet is a computed view of
BOTH — which is why it carries totals and not reasons.

| file                                             | what it holds                                                  |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `Дані Аспірантура` → «Спеціалізовані вчені ради» | 37 ради, роль per person → 3.17                                |
| `Дані ННВ` → «2025»/«2024»                       | НДР, наукова школа, редколегії, виставки, експертиза           |
| `Дані ВМіжнароднихЗ` → «2025»/«2024»             | проєкти, роль per person → 3.1–3.3                             |
| `Дані ННЦЗЯО` → «Обовязки»                       | навантаження in hours, предметні комісії, сайт → 2.1, 2.6, 2.9 |
| `Дані ННЦЗЯО` → «Відомості про ОП»               | гарант, склад, самоаналіз, оновлення ОП → 1.7, 2.4             |
| `Дані ННЦЗЯО` → «Навчальні плани»                | розробка / оновлення плану → 2.5                               |
| `Дані ННЦЗЯО` → «Ради»                           | методичні ради → 1.8                                           |

Seven sheets, two shapes: a person per row with indicators in columns (ННВ,
«Обовязки»), or an entity per row with a comma-separated name list under each
role. `pnpm import:registers-2025` reads both from one config table. 1 734 name
mentions, 95% of which match the roster on the first try.

This is what closed розділ 3. Сіропол's 1 600 under 3.17 is 16 rows of «ДФ
27.053.012 — заступник, відповідальний секретар, вчений секретар»; the «Рейтинг»
sheet records only the 1 600, and 1 600 is заступник × 16 and член ради × 32
equally well. Онищенко's 600 under 3.18 is four випуски of «Scientia et societus»
as член редакційної колегії, not one of the four readings the amount allows.

Two things the registers do NOT settle:

- **«балів / група розробників» divides.** Соловйова's 2.4 is 40 × (1/3 + 1/6 +
  1/6 + 1/7) = 32.38 and her sheet says 32.4; her 2.5 is 60/2 = 30. Each member
  of the розробників group gets an equal share, which is what the unit says and
  nothing else in the document does.
- **«Рік акредитації» is not the 1000-point bonus.** 1.7 prices a гарант at 1000
  «на рік акредитації» against 100 otherwise, and the register has a column that
  looks like the answer. The university awarded 100 to all three people whose ОП
  carries 2025. The column records when accreditation is DUE.

### The register decides the role, never the amount

**A register group is imported only up to what the «Рейтинг» sheet awarded that
person for that indicator.** Where the register has more — it kept going after
the workbook was made — whole entries are dropped until the two agree, and the
roles are still the відділ's own. 252 groups worth 26 585 points cannot be made
to agree that way and are printed instead, in `import-report/registers-2025.md`.

**Ковтун Олександр is the case that shows why this beats arithmetic.** The
register gives him four Erasmus+ projects as менеджер (350) and two as учасник
(150) — 1 700. His sheet says 1 350, which is three менеджер plus two учасник.
Read from the amount alone, 1 350 is «керівник × 3» or «учасник × 9» and BOTH
are wrong: it is a mix of two roles, and no single price lands on it. Dropping
one менеджер entry reproduces his sheet exactly. He was missing **half his own
rating** before this; he is now exact.

Almost every one is the register being AHEAD of the rating — Сердюк is listed six
times on «Професійна освіта» and her 2025 sheet has nothing under 3.18; Ржевська
appears in four ННЦЗЯО registers and was scored for none of them. Importing those
would hand people points the university did not give them, which is a worse error
than a missing role. A few may be points a відділ forgot to pass on, and the
report is where somebody can look.

### 9. Some people submitted the same thing twice, after the sheet was made

Гончаренко Олексій's Розділ_1 holds «декана» twice, «Базова освіта» twice,
«Всеукраїнська Асоціація…» twice — one capital letter apart — and «здобуття
другої вищої освіти» three times. His sheet awards 60, 50, 10 and 200; ours came
to 120, 100, 20 and 300, which is exactly the 220 he was over by.

**And that is not «count each thing once».** His three identical 1.11 rows are
worth **200** on their sheet, not 100 — they counted two of the three. The
reading that fits is that a «Рейтинг» workbook is a **snapshot**: when his was
generated he had 1.11 twice and 1.6 once, and he re-submitted afterwards. The
`Розділ_*` files are the current state; his workbook was never regenerated.

The same lag shows from the other side, and this is why it must not be «fixed»
by deduplication: Коцур Надія's nine publications under 3.9 are nine DIFFERENT
papers and her sheet counts eight; Юхименко's four Moodle courses are four
different disciplines and her sheet counts three. That is real work added after
the snapshot, and a fuzzy match would delete it to fit a stale figure.

`pnpm import:trim-2025` therefore trims to the FIGURE, never by a rule about
repeats. It only removes, only where the surplus is made of copies whose scores
close the difference exactly, and it prints everything else. 12 rows, 550 points,
4 people — which is all of what розділ 1 was over by.

### A row that appears twice is imported twice, deliberately

Шевчук Лариса Дмитрівна's Розділ_1 holds every one of her six rows a second time
— she filled the form twice — and three people have a whole Розділ file saved
again as «ПІБ(1).xlsx». Dropping the repeats is the obvious thing to do and it is
wrong: measured over all 250 people it moved the year from 0.19% under the
university's own total to **0.46% under**, and dropped the count of people
matching exactly from **215 to 195**. Their pipeline counts a repeated
submission, so ours has to.

### What is still missing: 0.34%, over 31 people

Nobody is short by more than 8.3% of their own total any more. What remains:

- **Товкун Лідія, −680 on 3.18** — the largest single case. Her register has 420
  (Scientia et societus, заступник twice, plus внесення даних) and her sheet says
  680; the register is BELOW, so there is nothing to trim, and no single role at
  one price makes 680. One question to ННВ settles it.
- **Eleven workbooks whose section subtotal disagrees with its own rows**, from
  −98 to +100 — Рибакова's розділ 3 says 640 where its rows add to 740. We match
  the rows, because the rows are what the source files contain. Nothing to fix on
  our side.
- **The snapshot lag, both ways** — Коцур's ninth paper and Юхименко's fourth
  Moodle course are ours and not theirs; Бочаріна and Вінс have courses on 5.1
  that the Розділ files do not carry. Listed in `import-report/trim-2025.md`.
- **A handful of ±5 to ±50**, mostly workbooks that merge 3.12/3.13/3.14 into one
  column.

All of them are listed by person in `import-report/ambiguous-2025.md` and
`import-report/registers-2025.md`.

## Next

1. Close 2025 from /admin/rating so it renders from a frozen snapshot. It is
   safe now: every `RatingEntry` is built from real `Activity` rows, so
   `closeYear` rebuilds the snapshot correctly. Reopening is the appeals path.
2. Decide the 38 not on the roster by hand: 4 typos to fold in, ~34 departed.
3. The other years. 2024 has the same shape, the same «Рейтинг» sheet and its own
   tab in Дані ННВ and Дані ВМіжнароднихЗ — but «Спеціалізовані вчені ради» and
   the ННЦЗЯО registers have no year and hold only the current one, so 2024's
   division half would come from the «Рейтинг» sheet alone. 2021–2023 have Розділ
   files but no per-year template to hang them off.

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
