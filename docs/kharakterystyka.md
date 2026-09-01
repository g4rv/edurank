# Характеристика / п.38 — specification

Written 2026-08-04. The document the university calls
`Характеристика рівня наукової та професійної активності викладача` is **п.38 of
the Ліцензійні умови** — the same 20 positions, in the same order, confirmed
against постанова КМУ 1187 and against додаток 1 of the university's own
положення.

It is worth building for three reasons at once:

1. it is a report someone types by hand today, per person, every five years;
2. **`Кнпп` in the ставка formula comes from it** — the count of staff on a
   кафедра with ≥4 of the 20 positions (see [stake-distribution.md](./stake-distribution.md));
3. it also produces додаток 3's «Досягнення … (позицій із 20)» column and most of
   додаток 6, the мотивований висновок.

## The model: a view of the rating, not a second place to type

**Decided 2026-08-04.** Staff fill in the rating as they already do. Each position
of Характеристика is then **derived** from the rating entries that match it, over
the last five years, and the evidence text is generated from the same
`summarizeEvidence` output the app already produces, with the year appended.

Nobody re-enters anything that is already in the rating. Only the positions the
rating genuinely cannot know are entered by hand.

## The mapping

Fourteen of twenty positions come straight from indicators we already have.

|   п.38 | What it asks for                                                | Our indicators                                                                                                   |
| -----: | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
|  **1** | ≥5 публікацій у фахових виданнях / Scopus / WoS                 | `3.8 publication_cat_a`, `3.9 publication_cat_b` — count ≥5                                                      |
|  **2** | патент, або 5 деклараційних, або 5 свідоцтв авторського права   | `3.25 patent_granted` (за «Видом патенту» — див. нижче), `3.25 copyright_registration`                           |
|  **3** | підручник / навчальний посібник / монографія, ≥5 авт. аркушів   | `3.7 monograph_ua`, `3.7 monograph_eu`, `2.2 edition_publication` (types «підручник», «навчальний посібник»)     |
|  **4** | навч.-метод. посібники, електронні курси на освітніх платформах | `5.1 moodle_course`, `2.2 edition_publication` (types «навчально-методичний посібник», «методичні рекомендації») |
|  **5** | захист дисертації                                               | profile: ступінь + **дата захисту** (new field)                                                                  |
|  **6** | наукове керівництво здобувачем, який захистився                 | `3.10 defense_supervision`                                                                                       |
|  **7** | опонент / член спеціалізованої вченої ради                      | `3.16 specialized_council`, `3.22 dissertation_opponent`                                                         |
|  **8** | керівник наукової теми, редколегія наукового видання            | `3.4 ndr_execution`, `3.5 initiative_topic`, `3.17 journal_editorial_a/b`                                        |
|  **9** | експертна рада МОН / галузева експертна рада НАЗЯВО             | `1.5 mon_nazyavo_councils`, `3.23 mon_textbook_expertise`                                                        |
| **10** | участь у міжнародних проєктах, міжнародна експертиза            | `3.1 intl_grant_won`, `3.2 intl_program_participation`, `3.6 intl_open_lectures`                                 |
| **11** | наукове консультування установ ≥3 років                         | `3.18 org_consulting` — exact, including the three years                                                         |
| **12** | ≥5 апробаційних / науково-популярних публікацій                 | `3.19 conf_abroad`, `3.20 conf_ukraine`                                                                          |
| **13** | заняття іноземною мовою ≥50 год на рік                          | `2.3 foreign_language_teaching` — exact, including the hours                                                     |
| **14** | студент — призер олімпіади / конкурсу наукових робіт            | `3.13 ukr_olympiad_winners`, `3.12 intl_olympiad_winners`                                                        |
| **19** | участь у професійних / громадських об'єднаннях                  | `1.10 prof_associations`                                                                                         |

### Thresholds the data can actually check

Not just «is there such an entry» — several positions carry a condition, and we
already store what it needs:

- **п.1** and **п.12** want **five** of something: count the entries.
- **п.3** wants **≥5 авторських аркушів**. `edition_publication` and the monographs
  store `pages` and `coAuthors`, and the scoring already computes друковані
  аркуші as `pages / 24 / coAuthors` — so the threshold is checkable.
- **п.2** wants one granted patent **or** five declaration patents **or** five
  copyright certificates — three separate counts. See «Вид патенту» below: the
  first two come from the same indicator and are told apart by its own select.
- **п.11** and **п.13** carry their conditions inside the indicator itself.

### What the rating cannot give

|           п.38 | Why                                                                                                                                           | Plan                                             |
| -------------: | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
|         **15** | керівництво **школярем** (МАН, учнівські олімпіади) — we only track здобувачі вищої освіти                                                    | manual; such НПП exist, see below                |
|         **20** | досвід практичної роботи за фахом ≥5 років, **крім** педагогічної — a personnel fact, and `pedagogicalExperience` is exactly what it excludes | manual; nobody qualifies today, see below        |
| **16, 17, 18** | учасник бойових дій, операції ООН, навчання НАТО — «для вищих військових навчальних закладів»                                                 | not applicable here; shown but never auto-filled |

Since only **≥4 of 20** are needed and 14 auto-fill, most staff should qualify
without anybody typing anything.

## Applications never count (decided 2026-08-07)

**Only a completed, defined achievement goes into the Характеристика.** An
application — for anything — is not one. The owner's words: «we accept only
defined achievements, we don't put applications in the Характеристика file».

That is a single rule covering both of the questions we had open, and it should
be applied to any future indicator of the same shape, not just these two:

| Position | Counts                                                                           | Does **not** count                                                  |
| -------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **п.2**  | `3.25 patent_granted`, `3.25 copyright_registration`                             | `3.25 patent_application` — а submitted application is not a patent |
| **п.10** | `3.1 intl_grant_won`, `3.2 intl_program_participation`, `3.6 intl_open_lectures` | `3.3 intl_grant_application` — an unwon proposal is not a project   |

The indicators themselves are unaffected: an application still **scores points in
the rating**, because the rating rewards the effort. It just does not satisfy a
п.38 position. Two different questions about the same row, and the code must keep
them separate — the Характеристика reads a filtered subset of the activities, not
all of them.

## Записи вручну — one row, one item (decided 2026-09-01)

ADMIN types evidence for a position in `KharakterystykaEntry`. Two rules:

**One row stands for exactly one item.** A position asking for five wants five
rows. The row used to carry a `count`, so a single row could claim to be five —
and that number was checkable against nothing, because there is one
реєстраційний номер in the text, not five. The column is gone.

**A row names which alternative it satisfies.** Only п.2 has more than one, so
only п.2 asks; everywhere else the row stores `group: null` and lands on the
position's single alternative. A group that is not one of that position's own is
refused by the action — it would save into a bucket nothing reads, and the status
beside it would not move.

The screen is a dialog with two views: what is already typed (with delete), and
the form that adds one more. Saving returns to the list rather than closing,
because five свідоцтв is now five saves. The table cell itself carries no
controls — typed rows already print in its evidence list, labelled «Внесено
вручну», and listing them again to hang a delete button off was the same rows
twice.

Imported rows never appear in the dialog. They are replaced wholesale on the next
import run, so deleting one there would come back and look like a failed delete.

**Every position asks its own questions.** The form is a field spec per position
(`lib/kharakterystyka/position-evidence.ts`) of exactly the kind an indicator
carries, so the dialog renders it with the rating's own component, validates it
with `schemaForFields`, and builds the printed sentence with `summarizeEvidence`.
The text is **generated, never typed** (owner, 2026-09-01), so every row of one
position reads the same way; a live preview shows it before saving. `evidence`
holds the answers beside the generated `text`, which is what keeps a future
«edit this row» screen possible.

Only what NAMES the achievement is required. A typed row usually records an old
year from a document that said less than we would like, and a form refusing to
save until every box is full would send somebody to invent a реєстраційний номер.

## Imported evidence that evidences nothing (cleaned 2026-09-01)

The 2022–2024 backfill reads column D (the description) and falls back to
column B when it is empty — and column B is a dropdown. So a monograph row whose
author answered **«Ні»** — _I have none of this_ — was stored as proof that they
do. **26 documents claimed a licence position on the evidence «Ні».**

`pnpm db:kharakterystyka-cleanup` removes it, in two tiers:

| Tier                                   | Rows | Removed by       |
| -------------------------------------- | ---- | ---------------- |
| «Так» / «Ні» / a bare number           | 113  | `--apply`        |
| a role or place with no subject        | 462  | `--apply --bare` |
| «Оберіть …:» prompt stripped from text | 68   | `--apply`        |

Tier 2 — «виконавець» (of what?), «1 місце» (in what?) — is not false, merely
unusable: each names half a fact. It is removed only on request because of that.
The description was never in the source either, so re-importing recovers nothing.

Three people fell below the four-position bar and left `Кнпп`: Бобровнік Ю.,
Куйбіда В., Козій Т. That is the correct reading — each was held there by one
unevidenced row — and any of them may put the work back through the form,
described properly.

The importer now refuses tier 1 by itself and strips the prompts, so a re-run
cannot reintroduce either.

## The Excel export: one row per entry (decided 2026-09-01)

Excel will not make a row taller than **409 points**, about 27 lines. A person
with seventeen publications needs a hundred, so two thirds of п.1 was invisible —
and a spreadsheet gives no sign at all that a cell is cut off.

So a position spans as many rows as it has entries, with `№` and the показник
merged down the side of them. The document still reads as the twenty positions of
п.38, and each entry gets the height its own text needs.

Row heights are computed by simulating Excel's **word** wrap, not by dividing
characters by column width: a real line stops at whatever word would cross the
edge, which is worth about one line per paragraph — enough, on its own, to cut
the last line off every publication. One spare line is added on top, because the
two failure modes are not equal: a row a line too tall is a gap, a row a line too
short silently drops evidence.

## «Вид патенту» — п.2 (decided 2026-09-01)

Indicator `3.25 patent_granted` is «Отримання патенту на винахід / патенту на
корисну модель» — one indicator for two things the law does **not** treat alike:

| Смуга п.2                                          | Потрібно |
| -------------------------------------------------- | -------- |
| патент на винахід                                  | 1        |
| деклараційний патент на винахід чи корисну модель  | 5        |
| свідоцтво про реєстрацію авторського права на твір | 5        |

Until this date the indicator fed the first bar with every patent it held, and
the evidence stored nothing that told the kinds apart — дата, реєстраційний
номер, назва. So **one патент на корисну модель printed as «Виконано»** on a
document the university is licensed against.

The indicator now carries a **«Вид патенту»** select, and each answer routes to
its own bar — the same mechanism `2.2` uses to route п.3 against п.4. The rating
score is untouched: it is a FIXED indicator and pays 50 for either kind. This is
a licence question, not a rating one.

Rows written before the select existed carry no answer and feed **neither** bar,
deliberately: an unanswered patent is a claim nobody has checked, and keeping it
on the bar of one is the very thing being fixed. `pnpm db:patent-kind` lists them
and updates the indicator on every template — `pnpm db:seed` reaches only the
2026 one, a cloned template is never reseeded, and production is never seeded at
all.

The third bar, `declarative`, has **no indicator pointing at it**. Nothing in the
rating counts деклараційні патенти separately, so it is reachable only by hand.

## Where the first Характеристики come from (decided 2026-08-07)

There are **no existing Характеристики to import**. The plan is the other way
round: gather the historical rating data the university already holds, import
that, and **generate the Характеристики from it**. Nobody retypes twenty
positions for ~300 people.

This makes the п.38 mapping above load-bearing rather than a convenience — it is
the only thing that turns the imported history into a filled document.

**But the history is mostly totals, so it mostly cannot.** Asked what the old
Excel files actually contain, the owner's answer was «most of data is results
only» — a score per person per year, with no row per achievement. Publications
are the exception: per-item records may exist for those.

That splits the plan in two, and the split is not a detail:

| Source data                   | What we can do                                                  |
| ----------------------------- | --------------------------------------------------------------- |
| Publications, if per-item     | Import as activities → **п.1, п.12 auto-fill**, maybe п.3       |
| Everything else — totals only | Import as historical scores only. **No позиція can be derived** |

A yearly total tells us a person scored 1250 points. It cannot tell us whether
five of those were Scopus articles, whether a monograph reached ≥5 авторських
аркушів (that needs `pages` and `coAuthors`), or whether five деклараційні
патенти exist separately from one granted one. The thresholds in «Thresholds the
data can actually check» all need the individual rows.

**So the first Характеристика is largely manual, and that is now expected, not a
failure.** The realistic shape:

- import per-item publications where they exist, and auto-fill what they cover;
- import the remaining years as totals, for rating history and charts only;
- everything else on the first Характеристика is typed once, by hand;
- from the first live year onward the system accumulates its own rows, and the
  five-year window fills itself — the manual pass is a one-time cost, not annual.

Worth checking when the files arrive: whether anything besides publications kept
per-item rows. Every category that did is a позиція nobody has to type.

**Timing: not before ~2026-08-12.** The source files are on a local disk the
owner cannot reach while working remotely. Format is Excel throughout. So the
importer can be built and tested against invented data now, but its real shape is
not confirmed until the files arrive — expect it to need adjusting, and do not
treat the first import run as a migration that only happens once.

## п.15 and п.20 — answered 2026-08-07

**п.15 — yes, some НПП do prepare школярі** for МАН and учнівські олімпіади. It
is nonetheless **entered by hand, and no rating indicator is added for it.**

The answer to "should we add a field to the rating for this?" was: _«absolutely
not, rating is managed by science consilium with voting»_. That is a rule far
beyond п.15, and it is the important part of this answer:

> **We never add, remove or re-price a rating indicator.** The catalogue belongs
> to the вчена рада and changes only by their vote. That `/admin/rating/[year]`
> makes it technically easy is irrelevant — easy is not the same as permitted.

So п.15 is filled by hand on the Характеристика, awards no points, and the work
stays invisible to the rating until the вчена рада decides otherwise. If that
seems unfair, the route is a vote, not a code change.

**п.20 — nobody currently qualifies.** Asked whether staff have ≥5 years of
practical experience outside teaching and research, the answer was that we have
no such НПП today. So:

- keep the position on the form, entered by hand, never auto-filled;
- **do not build a кадри import for it** — there is nothing to import;
- it stays a plain profile field if it is ever needed, not an integration.

Treat this as "true today", not "true forever" — one hire changes it. The cost of
being wrong is one person typing one field, which is why no machinery is
justified.

## Defence date and generated text — answered 2026-08-07

**One defence date, for the highest degree.** Not one per ступінь. If someone
defended кандидат in 2015 and доктор in 2024, we store 2024 and the earlier date
is not kept.

This is enough for п.5, which asks for a defence **within the last five years**:
the highest degree is also the most recent one, so if that date is outside the
window, no defence falls inside it either. The concern that a single field would
break п.5 was wrong.

**Generated text is never editable.** The evidence sentences are assembled from
rating data and that is the final form — no override field, no «edit» button,
nothing stored per-person. The text is therefore always a true reflection of what
is in the rating, which is the point: an editable Характеристика could assert
something the underlying entries do not support.

The consequence to accept: if a generated sentence reads badly, the fix is in the
**generator**, for everybody at once — not a manual correction on one document.

## Підвищення кваліфікації is just an indicator

Confirmed 2026-08-07. It is a way to submit a document against indicators 1.11
and 1.12 — no separate «визнання результатів» step, no review page, no status
machine, no new entity. The form collects its fields and the entry scores like
any other.
