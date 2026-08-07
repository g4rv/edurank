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
|  **2** | патент, або 5 деклараційних, або 5 свідоцтв авторського права   | `3.25 patent_granted`, `3.25 copyright_registration`                                                             |
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
  copyright certificates — three separate counts.
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

**п.15 — yes, some НПП do prepare школярі** for МАН and учнівські олімпіади. So
this is real work being done that the rating currently cannot see at all.

That makes it a genuine question rather than a formality, and the two ways to
handle it are **not** equivalent:

| Option                             | Effect                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Manual entry on the Характеристика | Fills п.15. Awards **no rating points**. Safe — changes nobody's score.                                                        |
| A new rating indicator             | Fills п.15 **and** awards points, so it changes rating totals, кафедра averages, and therefore **every ставка** on the кафедра |

The second is not ours to decide. The rating catalogue is admin-editable, so
adding an indicator needs no code — but the points it carries are approved by the
вчена рада, and inventing a value here would quietly move real money. **Default
to manual entry** until someone with the authority says otherwise. Raising it is
worth doing: the work exists and currently earns nothing.

**п.20 — nobody currently qualifies.** Asked whether staff have ≥5 years of
practical experience outside teaching and research, the answer was that we have
no such НПП today. So:

- keep the position on the form, entered by hand, never auto-filled;
- **do not build a кадри import for it** — there is nothing to import;
- it stays a plain profile field if it is ever needed, not an integration.

Treat this as "true today", not "true forever" — one hire changes it. The cost of
being wrong is one person typing one field, which is why no machinery is
justified.

## Open — asked, not yet answered

Design questions still open, for the owner rather than the boss:

- **Defence date** — one field for the current ступінь, or one per degree
  (кандидат, then доктор)?
- **Editing generated text** — the evidence text is generated. If somebody edits
  it, is that stored as an override, or is generated text always final?
