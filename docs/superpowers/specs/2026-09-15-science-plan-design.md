# Планування наукової роботи — Додаток III до наказу №152

**Date:** 2026-09-15
**Status:** approved by the owner 2026-09-15, not built
**Source documents:** наказ №152 від 04.05.2026 «Про планування обсягів
педагогічного навантаження ПВС на 2026/2027 н.р.», and its **Додаток III**
(the standalone, corrected copy the owner supplied — see «Which Додаток III»
below).

## Why this exists

The university plans every викладач's year as **1548 годин** of pedagogical load
(п.2), split four ways: навчальна, методична, наукова, організаційна. Of that,
**наукова робота must be planned at no less than 500 годин per one
науково-педагогічна ставка**, pro-rata for anybody who works less than a full
one (п.3). Individual plans go to the навчальний відділ by 18 September (п.33).

Today that planning happens on paper. EduRank holds the same people, the same
кафедри and the same ставки, and already knows how to run a per-year catalogue of
indicators — so the plan belongs here.

**This is not the rating.** The rating scores achievements in **балах** with its
own coefficients, for ranking people. Додаток III prices the same real-world work
in **годинах**, to fill a workload quota. Two measuring systems over one world.
They are kept fully separate (D3).

### Which Додаток III

The наказ carries a copy of Додаток III bound into it (pages 13–14), and the
owner supplied a **separate, corrected file** dated to the same наказ. They
differ. The standalone file is authoritative (owner, 2026-09-15). Known
differences:

| Item | Bound copy                         | Standalone (authoritative)                              |
| ---- | ---------------------------------- | ------------------------------------------------------- |
| 3    | «монографії, підручника — 200 г.»  | «монографії, підручника, **посібника** — 200 г./100 г.» |
| 16   | «Видання творів мистецтва» — 56 г. | 50 г.                                                   |

Seed from the standalone file. Where the two disagree anywhere else, the
standalone wins, and the difference is recorded here when found.

### The year to build for: 2026/2027

Наказ п.33 sets **18 вересня 2026** as the date plans reach the навчальний
відділ, and this document is dated **15 вересня 2026**. That date is when the
year **starts**, not a gate that is missed and skipped (owner, 2026-09-15): the
навчальний рік runs to summer 2027, and an НПП who gets the app in October fills
their plan in then. Nothing about being late changes which year is being
planned.

So the target is **2026/2027, план and факт**, and lateness costs catch-up
typing, not a year.

## Decisions

Every row was answered by the owner on **2026-09-15**.

| #   | Question                                      | Decision                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | What does the feature produce?                | **План + факт.** Plan the year, then record what was actually done, and show both against the target.                                                                                                                                                          |
| D2  | Which додатки are covered?                    | **Додаток III only** — наукова робота, 18 items. Built so Додаток II (методична) and IV (організаційна) can be added later as further catalogues of the same shape.                                                                                            |
| D3  | Relation to the existing rating?              | **Fully separate.** No shared rows, no derivation. An НПП enters an article for балів and, separately, for годин.                                                                                                                                              |
| D4  | Who else reads it?                            | **Завідувач reads their кафедра, ННВ and ADMIN read everybody. No approval step** — the НПП fills it and it is final, like the rating and the ставки.                                                                                                          |
| D5  | Where does the catalogue live?                | **DB rows, one template per навчальний рік, clonable**, edited by ADMIN. A new наказ is an admin afternoon, not a release.                                                                                                                                     |
| D6  | One plan per person, or per кафедра?          | **Per кафедра.** Somebody on two кафедри has two plans and fills them separately.                                                                                                                                                                              |
| D7  | What is the target?                           | `minHoursPerRate × ` that person's ставка **on that кафедра**.                                                                                                                                                                                                 |
| D8  | What if the розподіл ставок is not saved yet? | **No target is shown at all.** The plan opens, hours still add up, and nothing claims to know how much is enough. No fallback, no typed override.                                                                                                              |
| D9  | Below the target?                             | **Shown, never blocked.** Same rule as the ставки grid, where overspending is shown and never refused.                                                                                                                                                         |
| D10 | The reuse rule?                               | **One person draws from one work once, on one кафедра, ever** — except where the work type says otherwise. Each work type is flagged `ONCE` or `YEARLY`.                                                                                                       |
| D11 | Evidence?                                     | **Mandatory on a record, not on a plan row.** A publication needs its link; a course needs its certificate. Which is required is a property of the work type.                                                                                                  |
| D12 | Where do files live?                          | **Cloudflare R2**, free tier. Presigned upload straight from the browser; short-lived signed reads.                                                                                                                                                            |
| D13 | Architecture?                                 | **Own tables, shared code.** New models; the scoring engine, evidence-field specs, Zod generator and form renderer lifted out of `lib/rating/` into a neutral module.                                                                                          |
| D14 | Co-authors?                                   | **One work, one pool of hours, shared.** An article worth 200 г gives 200 г in total however many authors draw on it — 150 taken leaves 50. Modelled as `ScienceWork` + per-person claims.                                                                     |
| D15 | Which work types share?                       | **A column on the work type.** ADMIN marks each Додаток III row `SHARED` or `INDIVIDUAL`. Стаття, монографія, патент, доповідь share; аспірант, гурток, участь у конференції do not.                                                                           |
| D16 | Who divides the pool?                         | **First come, takes what they need.** A claimer sees «залишилось 50 з 200 год» and types their share. Refused above what is left. No approver, no automatic equal split.                                                                                       |
| D17 | A second person entering the same work?       | **Refused, and told who has it** — «цей запис уже додав Іваненко І. І.». Only one record of a work ever exists. They then **join that record** and draw from what is left.                                                                                     |
| D18 | Декан?                                        | **Inspects, never edits** — the app's existing rule (`scopeOf` reads, `headOf` decides).                                                                                                                                                                       |
| D19 | An official export form?                      | **Later.** Not in scope now; the shape is unknown and the file has not been supplied.                                                                                                                                                                          |
| D20 | Are records reviewed?                         | **Yes — post-check, not a gate** (owner, 2026-09-15). A record counts as soon as it is saved; ННВ and ADMIN may decline it afterwards, with a reason, and it stops counting. The same shape as the rating's moderation, which already works here.              |
| D21 | Why not a gate?                               | The owner's reasoning: a gate «would be too complicated to implement since we would have to predict EVERYTHING». It also blocks 328 people behind one office's queue. Post-check keeps everybody moving and still makes every claim removable.                 |
| D22 | What evidence does a record demand?           | **Per work type, and never just a name.** An article is proved by a **link** — DOI, Scopus, the journal's issue page, the university repository. A certificate, наказ, диплом or посвідчення is proved by an uploaded **file**. Whichever applies is REQUIRED. |
| D23 | Does a plan row carry evidence?               | **No.** A plan row is an intention — in September the article does not exist and has no title. It carries the work type, its variant, the quantity and an optional free note. Nothing else.                                                                    |

### Why D10 is not the blanket rule the owner first asked for

The owner's words were «npp cannot reuse same record across the years or between
his departments». Between кафедри that holds with no exception. Across years it
does not, and the наказ says so in its own Примітка column:

| Item | Примітка                              | Repeats?                       |
| ---- | ------------------------------------- | ------------------------------ |
| 2    | «За 1 навч. рік (протягом 2/4 років)» | yes, 2–4 years running         |
| 12   | «**Щороку** на одного аспіранта»      | yes, every year, same аспірант |
| 14   | «На навчальний рік» (гурток)          | yes                            |
| 15   | «На навчальний рік» (лабораторія)     | yes                            |
| 4    | «За 1 сторінку» (стаття)              | **no — once, ever**            |
| 3    | «За 1 друкований аркуш» (монографія)  | **no**                         |
| 6    | «За 1 сторінку» (доповідь)            | **no**                         |

A blanket rule would refuse a supervisor their second year with the same
аспірант, which the наказ explicitly grants. So the rule is a **column on the
work type**, for the same reason `requiresVerification`, `entityFirstEntry` and
`licencePositions` are columns: a list in code silently excludes every item an
admin adds later, and the наказ is reissued yearly.

### What D3 accepts

An НПП enters the same article twice — once on `/achievements/3` for балів, once
here for годин. That is deliberate. The alternative was examined and rejected:
the rating **does not hold the number Додаток III prices on**.

| Додаток III                       | Its unit  | What the rating stores                                     |
| --------------------------------- | --------- | ---------------------------------------------------------- |
| Стаття Scopus/WoS — 50 г/сторінку | pages     | `publication_cat_a` — SELECT by quartile. No page count.   |
| Стаття «Б» — 30 г/сторінку        | pages     | `publication_cat_b` — SELECT by authorship. No page count. |
| Доповідь — 5/3/2 г/сторінку       | pages     | scored per thesis, not per page                            |
| Монографія — 200 г/друк. аркуш    | друк. арк | `monograph_ua` — MULT × друковані аркуші. **Matches.**     |

Deriving hours from rating rows would mean adding a page-count field to several
live indicators and asking ~200 people to go back and fill in rows they already
submitted.

The two also treat co-authors differently, which would keep them apart even with
the pages in hand. The rating **divides** a monograph's points by the number of
співавтори, so each author's score shrinks as the group grows. Додаток III prints
no such rule — so the university's own answer (D14) is that the hours are a
**pool the authors share**: 200 г stays 200 г, and how it splits is theirs to
agree. Different arithmetic over the same article, on purpose.

## Data model

All new. Nothing in `prisma/schema.prisma` changes except the addition of these
models and their back-relations on `Staff` and `Department`.

```prisma
/// Один навчальний рік планування наукової роботи. The analogue of
/// RatingTemplate, and deliberately a separate table: a навчальний рік spans two
/// calendar years, a rating year does not, and the two are opened and closed by
/// different people at different times.
model SciencePlanTemplate {
  id String @id @default(cuid())

  /// «2026/2027». A STRING, not an Int: it is not a year, it is a pair of them,
  /// and every document the university prints writes it this way.
  academicYear String @unique

  /// Which наказ this catalogue came from — «№152 від 04.05.2026». Printed on
  /// the plan and in the export, so a person can check the rules they were
  /// planned against.
  orderRef String?

  /// п.3: «не менше 500 годин на одну науково-педагогічну ставку». A COLUMN
  /// rather than a constant, because it is set by a наказ that is reissued every
  /// year and has no obligation to keep the number.
  minHoursPerRate Int @default(500)

  /// Which calendar year's StakeAllocation supplies the ставка. Derived on
  /// creation from the first half of academicYear (2026/2027 → 2026) and stored,
  /// so that reopening an old template cannot silently re-target it at a
  /// different розподіл. See `lib/science/stake-year.ts`.
  stakeYear Int

  status SciencePlanStatus @default(OPEN)

  workTypes ScienceWorkType[]
  plans     SciencePlan[]
  records   ScienceRecord[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum SciencePlanStatus {
  OPEN
  CLOSED
}

/// Один рядок Додатка III.
model ScienceWorkType {
  id         String              @id @default(cuid())
  templateId String
  template   SciencePlanTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  order      Int
  /// Stable semantic key — survives renumbering by the next наказ.
  code       String
  /// The printed number: «4», «11». Display and export ordering only.
  itemNumber String
  label      String

  /// EvidenceField[] — the SAME spec shape as ActivityType.evidenceFields.
  evidenceFields Json
  /// ScoringSpec — the same five kinds. See «The hours engine» below.
  scoring        Json

  /// Hours per unit. For SELECT kinds the per-option hours live in the spec.
  coefficient Float
  /// The Примітка column: «За 1 сторінку», «Щороку на одного аспіранта».
  unitNote    String?
  /// The «Форма звітності» column: «Екземпляр видання», «Наказ по аспірантурі».
  /// Shown beside the upload control so a person knows what to attach.
  reportingForm String?

  /// D10. ONCE — the record may be claimed one time, by this person, ever, on
  /// one кафедра. YEARLY — once per навчальний рік. Enforced through the dedup
  /// key, not by a runtime check. See «Reuse».
  reuse ScienceReuse @default(ONCE)

  /// Which evidence fields build the WORK's identity, in priority order —
  /// e.g. ["doi", "url", "title"]. A COLUMN, not a code list, for the same
  /// reason `reuse` is one. Validated on save: every name must exist in
  /// evidenceFields, and at least one must be required.
  identityFields Json

  /// D11. A link is not enough for this type — a file must be attached.
  requiresFile Boolean @default(false)

  /// D15. SHARED — one work, one pool of hours, several people draw on it
  /// (стаття, монографія, патент, доповідь). INDIVIDUAL — the work belongs to
  /// one person and its hours are theirs alone (аспірант, гурток, участь у
  /// конференції). A column for the same reason `reuse` is one.
  sharing ScienceSharing @default(INDIVIDUAL)

  /// Item 6's «Участь в конференціях (мах.5)».
  maxPerYear Int?

  isActive Boolean @default(true)

  planRows SciencePlanRow[]
  works    ScienceWork[]

  @@unique([templateId, code])
}

enum ScienceReuse {
  ONCE
  YEARLY
}

enum ScienceSharing {
  SHARED
  INDIVIDUAL
}

/// D6 — one plan per person per кафедра per навчальний рік.
model SciencePlan {
  id String @id @default(cuid())

  staffId      String
  staff        Staff               @relation(fields: [staffId], references: [id], onDelete: Cascade)
  departmentId String
  department   Department          @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  templateId   String
  template     SciencePlanTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  /// The ставка this plan's target was computed from, in INTEGER HUNDREDTHS —
  /// the same unit every ставка in this codebase uses, never a float. Copied
  /// from StakeAllocation when the plan is opened and refreshed while the
  /// template is OPEN. `null` means the розподіл has not reached this кафедра:
  /// D8 says show no target at all, not a guess.
  rateHundredths Int?

  rows    SciencePlanRow[]
  records ScienceRecord[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([staffId, departmentId, templateId])
  @@index([departmentId, templateId])
}

/// An INTENTION. No evidence — in September the article does not exist yet.
model SciencePlanRow {
  id     String      @id @default(cuid())
  planId String
  plan   SciencePlan @relation(fields: [planId], references: [id], onDelete: Cascade)

  workTypeId String
  workType   ScienceWorkType @relation(fields: [workTypeId], references: [id])

  order Int
  /// How many units are intended — сторінок, аспірантів, програм.
  quantity Float?
  /// quantity × coefficient at the moment of planning. Frozen like
  /// Activity.score: editing the наказ later must not rewrite a signed plan.
  plannedHours Float
  /// Free text: «стаття у Q2 з історії освіти». Helps the завідувач read it.
  note String?

  records ScienceRecord[]

  @@index([planId])
}

/// The REAL WORK — one row per actual article, monograph, patent or аспірант.
///
/// **It belongs to nobody.** D14: an article is one object with one pool of
/// hours, and the people who wrote it draw from that pool. D17: exactly one row
/// of a given work exists, so a second author entering the same DOI is refused
/// and joins this row instead. An INDIVIDUAL work simply has one claim on it.
model ScienceWork {
  id String @id @default(cuid())

  templateId String
  template   SciencePlanTemplate @relation(fields: [templateId], references: [id])

  workTypeId String
  workType   ScienceWorkType @relation(fields: [workTypeId], references: [id])

  /// The article's own data — заголовок, DOI, сторінки. Entered once, by
  /// whoever added it first, and it is what `totalHours` is computed from.
  evidence      Json
  computedValue Float

  /// The whole pool, in INTEGER HUNDREDTHS OF AN HOUR. Never a float: this is a
  /// quantity divided among people, which is exactly what `lib/stake/units.ts`
  /// exists for — the old ставки system used floats here and produced a
  /// negative «нерозподілено». Frozen at creation; editing the наказ later must
  /// not move a pool people have already drawn from.
  totalHundredths Int

  /// Who typed it in. Named in the refusal a second author sees (D17), and the
  /// only person who may correct the evidence — see «Correcting a work».
  createdById String
  createdBy   Staff  @relation("ScienceWorkAuthor", fields: [createdById], references: [id])

  /// Normalised identity, GLOBALLY unique — not per person. This is what makes
  /// D17 structural: there is no way to create a second row for one work.
  /// Carries the academic year for a YEARLY type. See «Reuse».
  dedupKey String @unique

  claims ScienceRecord[]
  files  ScienceRecordFile[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([templateId, workTypeId])
}

/// One person's DRAW against a work — what lands in their plan and counts
/// toward their 500 годин.
model ScienceRecord {
  id String @id @default(cuid())

  /// Owned by the PERSON, not by the plan. This is what makes the reuse rule
  /// hold across both кафедри: the unique index below is per staffId.
  staffId String
  staff   Staff  @relation(fields: [staffId], references: [id], onDelete: Cascade)

  workId String
  work   ScienceWork @relation(fields: [workId], references: [id], onDelete: Cascade)

  /// Denormalised from work.template, the way Activity.year is denormalised
  /// from its template: every «what did this person do in 2026/2027» query
  /// would otherwise join through two tables. Always derived server-side.
  templateId String
  template   SciencePlanTemplate @relation(fields: [templateId], references: [id])

  /// Exactly one plan — i.e. exactly one кафедра — counts this draw.
  planId String
  plan   SciencePlan @relation(fields: [planId], references: [id], onDelete: Cascade)

  /// The intention it fulfils, when there was one. Null for unplanned work,
  /// which is ordinary: somebody plans two articles and publishes one article
  /// and a monograph.
  planRowId String?
  planRow   SciencePlanRow? @relation(fields: [planRowId], references: [id], onDelete: SetNull)

  /// D16 — what this person takes from the pool, integer hundredths of an hour.
  /// For an INDIVIDUAL work it always equals `work.totalHundredths`.
  hoursHundredths Int

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  /// D10 and D17 together, enforced BY CONSTRUCTION: one person draws from one
  /// work at most once. The reuse rule rides on `ScienceWork.dedupKey` being
  /// globally unique and carrying the year for YEARLY types, so this single
  /// index also stops the same article being claimed again next year or on the
  /// other кафедра. No code path can forget to check.
  @@unique([staffId, workId])
  @@index([planId])
  @@index([workId])
}

model ScienceRecordFile {
  id     String      @id @default(cuid())
  /// Attached to the WORK, not to one person's draw: the certificate of an
  /// article is the same file for every co-author, and it must not vanish when
  /// the person who uploaded it withdraws their claim.
  workId String
  work   ScienceWork @relation(fields: [workId], references: [id], onDelete: Cascade)

  /// The R2 object key. Server-generated, never anything the user typed.
  objectKey   String @unique
  fileName    String
  contentType String
  sizeBytes   Int

  /// Pages counted from the stored PDF, null for an image or an unreadable
  /// file. Item 4 pays 50 г PER PAGE, so this is the number the page claim is
  /// checked against.
  pageCount Int?

  uploadedAt DateTime @default(now())

  @@index([workId])
}
```

Back-relations to add: `sciencePlans SciencePlan[]`, `scienceRecords
ScienceRecord[]` and `scienceWorksCreated ScienceWork[] @relation("ScienceWorkAuthor")`
on `Staff`; `sciencePlans SciencePlan[]` on `Department`.

## Reuse — the rule is the index, not a check

`workKey(workType, evidence, academicYear)` is a pure function in
`lib/science/work-key.ts`. It walks `identityFields` in order and returns the
first that yields a value:

| Field kind    | Key                                                                             |
| ------------- | ------------------------------------------------------------------------------- |
| `doi`         | `doi:` + `normalizeDoi(value)` (`lib/doi.ts` exists)                            |
| `isbn`        | `isbn:` + digits only (`lib/isbn.ts` exists)                                    |
| `url`         | `url:` + lowercased host + path, no query, no fragment, no trailing slash       |
| anything else | `t:` + lowercased, whitespace-collapsed, trimmed, trailing punctuation stripped |

For a `YEARLY` work type the academic year is appended: `@2026/2027`.

```
ONCE   стаття    →  doi:10.31392/xyz-2026
YEARLY аспірант  →  t:іваненко іван іванович@2026/2027
```

Two indexes then carry the whole rule, and no runtime check does any of it:

- **`ScienceWork.dedupKey @unique`** — globally, across every person. One work,
  one row. A second author entering the same DOI cannot create a duplicate; the
  insert fails and the app turns that into D17's message rather than an error.
- **`@@unique([staffId, workId])` on `ScienceRecord`** — one person draws from
  one work at most once. Because the year lives inside `dedupKey` for `YEARLY`
  types and is absent for `ONCE` ones, this also means the same article can
  never be claimed again next year or on the other кафедра, while the same
  аспірант can be claimed once each year.

Normalisation stays **conservative** — lowercase, collapse whitespace, trim. Not
transliteration, not stemming, not punctuation inside the string. A false
collision refuses work somebody really did.

**Editing a work recomputes its key**, and only `createdBy` or ADMIN may edit —
see «Correcting a work».

**Deleting the last claim does not delete the work.** A work with no claims is
kept, because its `dedupKey` is what stops it being re-entered, and because a
co-author may still draw on it. ADMIN deletes a genuinely wrong work, which
cascades its claims and files.

**Known limit, accepted:** two genuinely different works with identical titles
and no DOI collide. The person is told the work already exists and who added it,
looks at it, sees it is not theirs, and reports it — ADMIN corrects. Adding a
DOI or link to either one separates them. Worth watching once real data exists.

## The pool — D14, D16, D17

`ScienceWork.totalHundredths` is the pool. `Σ ScienceRecord.hoursHundredths` over
a work may never exceed it.

This is not a constraint a database can express, so it is enforced the way
`saveDistribution` enforces a кафедра's pool: **inside a transaction that re-reads
the current sum**, never from a number the client sent. Two co-authors saving at
the same moment must not both see 50 free hours and both take them.

- Adding or changing a claim: re-read `Σ hoursHundredths` for the work excluding
  this claim, and refuse when `existing + requested > totalHundredths`. The
  message names what is left.
- An `INDIVIDUAL` work: the single claim always equals the pool, and the hours
  control is not shown at all.
- **Integer hundredths of an hour throughout.** Never a float, in the database or
  in any sum — `lib/stake/units.ts` already has `toHundredths` / `fromHundredths`
  and the tests that pin them. This is the same shape of bug that produced a
  negative «нерозподілено» in the old ставки system.

### Joining a work

D17 in practice. Петренко enters the DOI Іваненко already added:

1. The save is refused, and the page shows «Цей запис уже додав Іваненко І. І. —
   залишилось 50 з 200 год» together with the work's title and link.
2. Петренко presses «Приєднатися» and types the hours they take, capped at what
   is left. That creates a `ScienceRecord` against the existing work, on their
   own plan.
3. The co-author list Іваненко may fill in is a **convenience, not a gate** — it
   puts the work in front of a colleague before they go looking for it. Nobody
   depends on being remembered.

Because joining is open, `ScienceRecord` rows are audited (`diffChanges`), so who
attached themselves to which work, and for how many hours, is always answerable.

### Correcting a work

The evidence belongs to the work, and the pool is computed from it, so an edit
moves everybody's ceiling. Rules:

- Only `createdBy` may edit, and only while `Σ claims ≤ the new totalHundredths`;
  an edit that would put the pool below what is already drawn is refused, naming
  the shortfall.
- ADMIN may edit anything, and the audit entry records it.
- Nobody else — including a co-author who has joined — edits the evidence. They
  report it instead. The alternative is two authors disagreeing about a page
  count with no tiebreak.

## The hours engine — D13 in practice

The five scoring kinds already in `lib/rating/scoring.ts` cover Додаток III with
nothing new:

| Додаток III                                | Kind                  |
| ------------------------------------------ | --------------------- |
| 1. Грант — 400 г за програму               | `FIXED`               |
| 1. Проєкт — 300 керівнику / 100 члену      | `SELECT`              |
| 3. Монографія — 200/100 г за друк. аркуш   | `SELECT_MULT`         |
| 4. Стаття — 50/30/20/15/10/5 г за сторінку | `SELECT_MULT`         |
| 5. Патент — 100/40/30 г за свідоцтво       | `SELECT`              |
| 6. Доповідь — 5/3/2 г за сторінку          | `SELECT_MULT`         |
| 6. Участь — 6 г за день, max 5             | `MULT` + `maxPerYear` |
| 12. Аспірант — 50 г щороку на одного       | `MULT`                |
| 14, 15, 17. На навчальний рік              | `FIXED`               |
| 18. Переможець / призер — 30 / 20 г        | `SELECT_MULT`         |

So the work is **moving**, not writing. These become neutral and are imported by
both subsystems:

| From                                    | To                                     |
| --------------------------------------- | -------------------------------------- |
| `lib/rating/scoring.ts`                 | `lib/specs/scoring.ts`                 |
| `lib/rating/evidence-fields.ts`         | `lib/specs/evidence-fields.ts`         |
| `validations/activity-type-spec.ts`     | `validations/type-spec.ts`             |
| `validations/activity-evidence.ts`      | `validations/evidence.ts`              |
| `components/rating/evidence-fields.tsx` | `components/specs/evidence-fields.tsx` |

Rules for the move:

- **Re-export from the old paths** in the same commit, so no rating file changes
  and no rating test breaks. Remove the re-exports in a later, separate pass —
  never in the same commit as a behaviour change.
- `computeScore` keeps its name and returns a number. The science side calls the
  result **hours**; the rating calls it **балів**. Neither module knows the unit,
  which is why one engine is safe here.
- **No new scoring kind is needed.** If one turns out to be, add it to the
  neutral module with a test on both sides.

## The target

```
target = template.minHoursPerRate × (plan.rateHundredths / 100)
```

`rateHundredths` comes from `StakeAllocation` for `template.stakeYear`, that
person, **that кафедра** — the per-кафедра share, not `Staff.employmentRate`,
which is the sum across all of them and would target each plan at the person's
whole workload.

A person on 0,75 + 0,25 therefore gets a 375-hour plan and a 125-hour plan: 500
in total, which is what п.3 intends. The >1,00 case the sum produces (0,90 + 0,25
= 1,15) cannot arise, because no single кафедра allocates more than 1,00.

**When there is no allocation, `rateHundredths` is null** and the page shows
«Ставку на цій кафедрі ще не визначено — ціль буде показано пізніше» in place of
a target (D8). Hours still sum, the plan is still editable, and nothing is
blocked. Measured on dev 2026-09-15: **22 of 328 НПП have any rate at all** —
this is the common case in September, not an edge case, and the screen must be
designed for it rather than around it.

Under target: shown, never blocked (D9).

## Screens

| Route                          | Who                          | What                                                                                                                    |
| ------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/science-plan`                | НПП                          | Their own plan. A кафедра switcher when they have two. «План» and «Виконано», with the running total against the target |
| `/my-department/science-plans` | завідувач; декан reads (D18) | Their кафедра: planned, done, target, who has nothing                                                                   |
| `/science-plans`               | ННВ, ADMIN                   | Everybody, filtered by факультет / кафедра. Shared works and who drew what                                              |
| `/admin/science-plan`          | ADMIN                        | Academic years: create, clone, open, close                                                                              |
| `/admin/science-plan/[year]`   | ADMIN                        | The Додаток III editor — the `/admin/rating/[year]` pattern                                                             |

Permissions follow the existing helpers, not new ones: `scopeOf` for «may I
look», `canModerateRating`-style division lookup for ННВ, `isAdmin` for the
admin pages. **Every page and every action re-checks**; the proxy is a cookie
gate only.

Design: «Аврора», per `docs/aurora.md`. New screens use
`components/aurora/ui/*` only — the old set is not extended (see
[[aurora-redesign-progress]]).

## Validation and anti-cheat

What the app **refuses**:

- creating a **second row for a work that already exists** — the person is told
  who added it and offered to join it (D17);
- a **second draw by the same person** on one work (the index);
- a draw that takes **more than the pool has left**, checked inside a
  transaction against the re-read sum, never against a client-sent figure;
- an edit to a work that would put its pool **below what is already drawn**;
- an edit to a work by anybody but `createdBy` or ADMIN;
- a record on a work type at its `maxPerYear`;
- evidence that fails the work type's generated Zod schema — including a missing
  link where the type requires one, and a missing file where `requiresFile`;
- a file whose magic bytes do not match its declared type, or over the size cap;
- a page claim higher than the page count of the attached PDF;
- a date outside the навчальний рік;
- any write to a `CLOSED` template;
- a record on a plan that is not the caller's own (or, for ADMIN, on any plan —
  with an audit entry).

**There is no duplicate report any more, and that is the point.** An earlier
draft of this document had ННВ reviewing works claimed by two people. D14 makes
co-authorship a modelled relationship rather than a collision to detect: one
work, several draws, a pool that cannot be overspent. Nothing is left to review.

What the app **cannot do**, stated so nobody assumes otherwise: tell whether a
certificate is genuine, whether a link describes the work claimed, whether the
person really is an author, or whether a group's 150/50 split is the one they
agreed. That stays with ННВ and the завідувач, who can see every draw on every
work. The app's job is to make a duplicate impossible, an overdraw impossible,
and everything else visible.

Optional, later: resolve a DOI against Crossref and compare journal, year and
page range. The project already contemplated a DOI-checker worker for the
rating's «Перевірено» flag; the same worker could serve both.

## Files

Flow, and the reason for each step:

1. The browser asks the server for a presigned PUT. The server checks the
   session, that the plan is the caller's, that the template is OPEN, and that
   the declared type and size are allowed; it generates the object key.
2. The browser PUTs **straight to R2**. Next's server actions cap a body at 1 MB
   by default and `next.config.ts` does not raise it — this is why the file never
   passes through the app, and it also keeps upload traffic off the VPS.
3. The browser tells the server the upload finished. The server `HEAD`s the
   object, confirms size and type, downloads it once to check magic bytes and
   count PDF pages, then writes `ScienceRecordFile`.
4. Reading is a **short-lived signed GET**, issued per request only to somebody
   entitled to see that record. No object is public.

- Key format: `science/<templateId>/<workId>/<cuid>.<ext>` — keyed by the WORK,
  because the file belongs to the article rather than to one author. Every
  segment server-generated.
- Accepted: `application/pdf`, `image/jpeg`, `image/png`. Cap **10 MB**.
- Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
  `R2_PUBLIC_HOST` (unset in dev). Asserted at boot beside the existing env
  checks, and **only when the science-plan feature is enabled**, so a dev without
  R2 keys can still run everything else.
- Deps: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, and `pdf-lib` for
  the page count.
- Deleting a record deletes its objects. A failed delete is logged with
  `logWarning` and never blocks the user — an orphan object costs storage, a
  blocked delete costs somebody their afternoon.

**Capacity, measured against real numbers.** ~350 plans a year; most evidence is
a link, so call it 5 files per plan at ~1,5 MB: **≈2,6 GB a year**. The free tier
is 10 GB, so roughly three years. Past that it is $0,015 per GB-month.

**Backup.** `docker-compose.yml` backs up Postgres only
(`prodrigestivill/postgres-backup-local`). R2 is a second thing to back up and is
**not covered by anything today**. Enable bucket versioning at minimum. This is
listed as a deployment task, not an afterthought — and the restore drill in
`docs/deployment.md` §7 has still never been run.

## Seeding

The catalogue seed — `pnpm db:seed`, the PRODUCTION-safe one — gains the
2026/2027 template, its 18 work types with their specs, and `orderRef
"№152 від 04.05.2026"`. Upserted on `[templateId, code]`, creating no accounts
and overwriting no records: the same contract that seed already holds for the
rating catalogue. **Read the header of `prisma/seed.ts` before touching it** —
which mode does what is written there, and `pnpm db:seed` also runs as part of
`pnpm db:reset`.

The catalogue definitions live in `lib/science/work-types-2027.ts` as **seed
input only**, converted by a `dbSpecs`-style function, exactly as
`ACTIVITY_TYPES_2026` feeds the rating. After seeding, the database is the truth
and the file is history.

## Testing

Colocated, Vitest, `@/lib/db` mocked as everywhere else.

- `lib/science/work-key.test.ts` — **one of the two most important files here.**
  DOI, ISBN, URL and title normalisation; `ONCE` vs `YEARLY`; that a year appears
  in a YEARLY key and never in a ONCE key; that conservative normalisation does
  not collide two real titles.
- `lib/science/pool.test.ts` — **the other one.** 150 of 200 leaves 50; a third
  author gets 0 and is told so; raising a claim above the remainder is refused;
  lowering one frees hours; an INDIVIDUAL work's single claim always equals the
  pool; editing a work below what is drawn is refused; **every sum in integer
  hundredths** — a 1/3 split of 100 г must not drift.
- `lib/science/target.test.ts` — per-кафедра ставка, null allocation, a сумісник
  on two кафедри summing to 500, hundredths never floats.
- `lib/science/hours.test.ts` — every one of the 18 items scored from its spec,
  against the numbers printed in Додаток III. This is the file that catches a
  mis-seeded coefficient.
- `app/(dashboard)/science-plan/actions.test.ts` — a second row for an existing
  work refused and the creator named; joining an existing work; two concurrent
  joins cannot both take the last 50 год (the transaction re-reads the sum);
  cap refused; closed template refused; another person's plan refused; evidence
  required; file required where `requiresFile`.
- `lib/science/files.test.ts` — key generation, type and size rejection, magic
  bytes, page-count mismatch.
- The moved modules keep their existing tests **and** gain a test that the old
  re-export paths still resolve, so the move cannot silently break the rating.

## Stages

Each stage is usable on its own and ends in a working app.

**Stage 1 — catalogue and план.** `SciencePlanTemplate` and `ScienceWorkType`,
the 18 work types, the admin editor and clone, `SciencePlan` and
`SciencePlanRow`, the target, the НПП plan screen, the завідувач / декан / ННВ
read views. No works, no records, no files.

**Stage 2 — факт and the pool.** `ScienceWork` and `ScienceRecord`, `workKey`
and both unique indexes, the transactional pool check, joining an existing work,
evidence by URL, план-vs-факт totals, the record↔plan-row link.

**Stage 3 — files and checks.** R2, upload and signed reads, magic bytes, PDF
page counting against the page claim.

**Later, unscheduled.** The export document (D19), and a Crossref DOI check.

## Open questions

All four questions this document opened were answered by the owner on
2026-09-15. Kept here because the reasoning is worth not re-deriving.

- **O1 — which year? CLOSED: 2026/2027.** The 18.09.2026 date is when the year
  begins, not a gate that is missed. Being late costs catch-up typing.
- **O2 — співавтори? ANSWERED, and it changed the model.** Not «each author takes
  the full hours» as this document first assumed. One work, one pool, shared —
  see D14, D16, D17 and «The pool».
- **O3 — декан? ANSWERED: inspects, never edits** (D18).
- **O4 — an export document? Later** (D19). If an official form exists, we need
  the file before building it.

- **O5 — п.27 vs the Scopus rate. NEW, found 2026-09-15 while transcribing the
  catalogue, and it needs the boss.** Додаток III item 4 prices a Scopus/WoS
  article at 50 год за сторінку «**за умови не застосування п.27 наказу**».
  п.27 of наказ №152 is a **навчальне навантаження** rule — the 50-hour teaching
  reduction for гаранти освітніх програм. **It is not about наукова робота at
  all** (owner, 2026-09-15), which makes the cross-reference stranger rather
  than clearer, and means the obvious reading is not safe to act on.

  Three readings are open, and we do not get to pick one: a гарант who took
  the reduction may not claim the Scopus rate; or the note points at п.27 of
  an EARLIER edition of the наказ, where the numbering differed; or it is dead
  text nobody applies. The question as written to the проректор asks which,
  rather than proposing an answer.

  Three things follow:
  1. **Nothing in this design expresses it.** `ScienceWorkType` has no «barred if
     item N also applies» concept, and inventing one on a single reading of one
     footnote would be speculation.
  2. **The app could enforce it.** Who is a гарант is already known — rating
     indicator 1.7 «Гарант освітньої програми», DIVISION_MANAGED, verified by
     ННЦЗЯО. So this is a policy question, not a data problem.
  3. **It may not be enforced in practice at all.** A footnote in a Примітка
     column is not evidence that anybody checks it.

  **Ask before building anything.** If it is real, the cheapest honest treatment
  is a warning on the plan screen for a person the app knows is a гарант, not a
  refusal — the app does not hold навчальне навантаження and cannot know whether
  the reduction was actually applied to them.

## Out of scope

- Додаток I (навчальна), II (методична), IV (організаційна), and the 1548-hour
  total. The model is built so a second catalogue is another
  `SciencePlanTemplate`-shaped table, not a redesign — but nothing here builds it.
- The п.11 навчальне навантаження table. The app holds no навчальне
  навантаження at all, and would need it before the 1548 arithmetic means
  anything.
- Any approval queue (D4).
- Deriving hours from rating activities (D3).

## Documents to update when this ships

- `CLAUDE.md` — a «Планування наукової роботи» section beside «Характеристика»
  and «Розподіл ставок», plus the new routes in the folder tree.
- `docs/work-remaining.md` — this feature, and what is left of it.
- `docs/deployment.md` — the R2 env vars, bucket versioning, and files in the
  backup plan.
- `lib/labels.ts` — `FIELD_LABELS` for every new field that a mutation diffs.

## Evidence, per work type — D22 in practice

The column `ScienceWorkType.requiresFile` already exists and carries this. It is
read one way and one way only:

| `requiresFile` | What a record must have                               |
| -------------- | ----------------------------------------------------- |
| `false`        | a **link**, required. A file may be attached as well. |
| `true`         | a **file**, required. A link may be attached as well. |

**Never neither.** A record with only a name is the thing this feature exists to
stop: the owner's words for why the university is moving off paper are that
people «tend to photoshop their certificates and print them on paper», and a
typed name is weaker than the paper it replaces.

The split follows the наказ's own «Форма звітності» column and, under it, one
question: **does a public record of this work exist that the person does not
control?**

- **Link** — стаття (DOI, Scopus, the journal's issue page, the інституційний
  репозитарій), англомовний супровід, редколегія (a journal lists its board).
- **File** — everything the наказ answers with a document: «Наказ», «Свідоцтво»,
  «Патент», «Диплом», «Посвідчення», «Сертифікат», «Експертний висновок», «План
  роботи гуртка», «Положення про лабораторію», «Звіт».

**ADMIN can flip any row** on `/admin/science-plan/[year]`, which is the point of
its being a column. The seed's split is a first reading of the наказ, not a
ruling — expect it to be corrected once real records arrive.

### A file is not proof, and the design should not pretend otherwise

A PDF is as forgeable as paper; uploading a doctored certificate is no harder
than printing one. What a file buys over paper is different and still worth
having:

- it is **kept** and can be re-examined next year; paper goes in a folder and is
  never looked at again;
- ННВ can check it **without the person present**;
- **the same file cannot be used twice** — hash it on upload and a file reused by
  a colleague, or by the same person next year, is caught. Paper can never do
  this;
- a PDF carries its own metadata, and a scan of a real document does not look
  like an export from a design tool. A signal for a reviewer, not proof.

So the ranking is: **a link to a source the person does not control** beats a
file; a file beats a name; a name alone is refused.

### What the machine checks, and what it cannot

Checked automatically: the same work claimed twice (the dedup key), the same file
uploaded twice (its hash), a page count higher than the PDF really has — item 4
pays **50 год per page**, so page inflation is the obvious cheat — a DOI that
resolves and matches the claimed journal, year and pages, an ISBN's check digit,
and a link whose host matches what it claims to be (`lib/link-hosts.ts`).

Not checkable: whether a certificate is genuine, whether the person really did
the work, whether a group's split of shared hours is the one they agreed. That is
what ННВ is for, and why D20 keeps a human able to decline anything.
