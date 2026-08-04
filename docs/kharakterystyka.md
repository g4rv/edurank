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
|         **15** | керівництво **школярем** (МАН, учнівські олімпіади) — we only track здобувачі вищої освіти                                                    | manual, unless it becomes a rating indicator     |
|         **20** | досвід практичної роботи за фахом ≥5 років, **крім** педагогічної — a personnel fact, and `pedagogicalExperience` is exactly what it excludes | manual, or a profile field from кадри            |
| **16, 17, 18** | учасник бойових дій, операції ООН, навчання НАТО — «для вищих військових навчальних закладів»                                                 | not applicable here; shown but never auto-filled |

Since only **≥4 of 20** are needed and 14 auto-fill, most staff should qualify
without anybody typing anything.

## Open — asked, not yet answered

Recorded in [questions-for-boss-ua.md](./questions-for-boss-ua.md):

- **п.2** — do a submitted patent application (`3.25 patent_application`) and the
  «5 деклараційних патентів» / «5 свідоцтв» thresholds work the way we read them?
  Current plan: count granted patents and copyright registrations, **not**
  applications.
- **п.10** — does preparing and submitting an international grant proposal
  (`3.3 intl_grant_application`) count as «участь у проєкті»? Current plan: no —
  an unsuccessful application is not a project.
- **п.15** — do НПП here supervise школярі at all? If yes it probably deserves a
  rating indicator rather than a manual tick.
- **п.20** — where does «досвід практичної роботи за фахом» come from? Кадри?

Design questions still open, for the owner rather than the boss:

- **Defence date** — one field for the current ступінь, or one per degree
  (кандидат, then доктор)?
- **Editing generated text** — the evidence text is generated. If somebody edits
  it, is that stored as an override, or is generated text always final?
