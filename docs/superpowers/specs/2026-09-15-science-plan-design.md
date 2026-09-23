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

| #   | Question                                      | Decision                                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | What does the feature produce?                | **План + факт.** Plan the year, then record what was actually done, and show both against the target.                                                                                                                                                                                                                            |
| D2  | Which додатки are covered?                    | **Додаток III only** — наукова робота, 18 items. Built so Додаток II (методична) and IV (організаційна) can be added later as further catalogues of the same shape.                                                                                                                                                              |
| D3  | Relation to the existing rating?              | **Fully separate.** No shared rows, no derivation. An НПП enters an article for балів and, separately, for годин.                                                                                                                                                                                                                |
| D4  | Who else reads it?                            | **Завідувач reads their кафедра, ННВ and ADMIN read everybody. No approval step** — the НПП fills it and it is final, like the rating and the ставки.                                                                                                                                                                            |
| D5  | Where does the catalogue live?                | **DB rows, one template per навчальний рік, clonable**, edited by ADMIN. A new наказ is an admin afternoon, not a release.                                                                                                                                                                                                       |
| D6  | One plan per person, or per кафедра?          | **Per кафедра.** Somebody on two кафедри has two plans and fills them separately.                                                                                                                                                                                                                                                |
| D7  | What is the target?                           | `minHoursPerRate × ` that person's ставка **on that кафедра**.                                                                                                                                                                                                                                                                   |
| D8  | What if the розподіл ставок is not saved yet? | **No target is shown at all.** The plan opens, hours still add up, and nothing claims to know how much is enough. No fallback, no typed override.                                                                                                                                                                                |
| D9  | Below the target?                             | **Shown, never blocked.** Same rule as the ставки grid, where overspending is shown and never refused.                                                                                                                                                                                                                           |
| D10 | The reuse rule?                               | **One person draws from one work once, on one кафедра, ever** — except where the work type says otherwise. Each work type is flagged `ONCE` or `YEARLY`.                                                                                                                                                                         |
| D11 | Evidence?                                     | **Mandatory on a record, not on a plan row.** A publication needs its link; a course needs its certificate. Which is required is a property of the work type.                                                                                                                                                                    |
| D12 | Where do files live?                          | **Cloudflare R2**, free tier. Presigned upload straight from the browser; short-lived signed reads.                                                                                                                                                                                                                              |
| D13 | Architecture?                                 | **Own tables, shared code.** New models; the scoring engine, evidence-field specs, Zod generator and form renderer lifted out of `lib/rating/` into a neutral module.                                                                                                                                                            |
| D14 | Co-authors?                                   | **One work, one pool of hours, shared.** An article worth 200 г gives 200 г in total however many authors draw on it — 150 taken leaves 50. Modelled as `ScienceWork` + per-person claims.                                                                                                                                       |
| D15 | Which work types share?                       | **A column on the work type.** ADMIN marks each Додаток III row `SHARED` or `INDIVIDUAL`. Стаття, монографія, патент, доповідь share; аспірант, гурток, участь у конференції do not.                                                                                                                                             |
| D16 | Who divides the pool?                         | **First come, takes what they need.** A claimer sees «залишилось 50 з 200 год» and types their share. Refused above what is left. No approver, no automatic equal split.                                                                                                                                                         |
| D17 | A second person entering the same work?       | **Refused, and told who has it** — «цей запис уже додав Іваненко І. І.». Only one record of a work ever exists. They then **join that record** and draw from what is left.                                                                                                                                                       |
| D18 | Декан?                                        | **Inspects, never edits** — the app's existing rule (`scopeOf` reads, `headOf` decides).                                                                                                                                                                                                                                         |
| D19 | An official export form?                      | **Later.** Not in scope now; the shape is unknown and the file has not been supplied.                                                                                                                                                                                                                                            |
| D20 | Are records reviewed?                         | **Yes — post-check, not a gate** (owner, 2026-09-15). A record counts as soon as it is saved; ННВ and ADMIN may decline it afterwards, with a reason, and it stops counting. The same shape as the rating's moderation, which already works here.                                                                                |
| D21 | Why not a gate?                               | The owner's reasoning: a gate «would be too complicated to implement since we would have to predict EVERYTHING». It also blocks 328 people behind one office's queue. Post-check keeps everybody moving and still makes every claim removable.                                                                                   |
| D22 | What evidence does a record demand?           | **Per work type, and never just a name.** An article is proved by a **link** — DOI, Scopus, the journal's issue page, the university repository. A certificate, наказ, диплом or посвідчення is proved by an uploaded **file**. Whichever applies is REQUIRED.                                                                   |
| D23 | Does a plan row carry evidence?               | **No.** A plan row is an intention — in September the article does not exist and has no title. It carries the work type, its variant, the quantity and an optional free note. Nothing else.                                                                                                                                      |
| D24 | Is the dedup key global for every work type?  | **No — its scope follows `sharing`** (corrected 2026-09-17). Global for a `SHARED` work, prefixed with `staffId` for an `INDIVIDUAL` one. Four seeded types identify by a name several people legitimately share — a journal's редколегія is four people — and a global key would have refused hours to everybody but the first. |

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

  /// SHA-256 of the bytes, lowercase hex. UNIQUE across the university (D28):
  /// one file, one record, for everybody. Renaming a file, re-exporting it or
  /// changing its date does not change this; only changing its content does,
  /// which is the whole reason the check is not on `fileName`.
  ///
  /// Computed TWICE on purpose. The browser hashes before uploading, so a
  /// duplicate is refused in a second instead of after a 5 MB PUT; the server
  /// hashes the stored object afterwards and that one is the authority, because
  /// a browser can send any hash it likes.
  sha256 String @unique

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

## D24 — the dedup key's SCOPE follows `sharing`

**Corrected 2026-09-17**, found by the Stage 1 whole-branch review before any
code read `identityFields`. The earlier text said `ScienceWork.dedupKey` is
unique «globally, across every person», full stop. That is right for a `SHARED`
work and **wrong for an `INDIVIDUAL` one whose identity is a name several people
legitimately share.**

What it would have done, with the seeded catalogue as it stands:

| Work type                 | sharing    | identity        | What breaks                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ---------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editorial_board`         | INDIVIDUAL | the journal     | Its own select offers головний редактор, відповідальний редактор, відповідальний секретар and член редколегії — **four people on one journal in one year.** The first to enter it takes 100 год; the other three are told «цей запис уже додав …» and, an INDIVIDUAL work having no pool, can draw nothing. |
| `conference_attendance`   | INDIVIDUAL | the conference  | Twenty people from one кафедра attend one конференція. Only the first gets 6 г × days.                                                                                                                                                                                                                      |
| `intl_project`            | INDIVIDUAL | the project     | керівник проєктної групи and член проєктної групи are different people on one project.                                                                                                                                                                                                                      |
| `state_competition_entry` | INDIVIDUAL | the competition | The name is by construction identical for everybody who prepared an entry.                                                                                                                                                                                                                                  |

**The rule.** `workKey()` prefixes the key with `staffId` when the work type is
`INDIVIDUAL`, and leaves it global when `SHARED`:

```
SHARED      doi:10.31392/xyz                 ← one row, several authors draw on it
INDIVIDUAL  s_<staffId>:t:назва@2026/2027    ← one row per person, no collision
```

Both rules that matter survive intact. **D17** («refused, and told who has it»)
still applies where it belongs — to co-authored works, which is the only place
two people entering the same thing means the same thing. **D10** («one person
draws from one work once, ever») still holds, because `@@unique([staffId,
workId])` operates inside the person's own key space and the academic year still
lives inside the key for `YEARLY` types.

The alternative — demanding that an INDIVIDUAL type's `identityFields` name
something that distinguishes the claimant — was rejected: it needs a catalogue
edit on eleven rows, a new validation in `saveWorkType`, and it would still fail
the moment an admin adds a twelfth type and forgets.

### ANSWERED 2026-09-17: `conference_attendance` becomes `YEARLY`

It carries `maxPerYear: 5`, from the наказ's «Участь в конференціях (мах.5)» —
a PER-YEAR cap. But `reuse: ONCE` puts no year in the key, so a conference
attended in 2026/2027 could never be attended again in any later year. Annual
conferences are the norm, so this is very likely wrong.

**The owner agreed on 2026-09-17: it becomes `YEARLY`.** The наказ's own per-year
cap is the argument — a limit that restarts every year only makes sense if the
counting restarts too. Two changes, not one: the seed def, and a one-off script
for the 2026/2027 row already in the database, which `pnpm db:seed` would
otherwise leave alone on production. The Task 4 test that pins the `YEARLY` set
moves with it.

## D25–D29 — Stage 2's own decisions (owner, 2026-09-17)

Five questions Stage 1 left open, answered when Stage 2 was scoped. D1–D24 are
unchanged except where named here.

| #   | Question                                          | Decision                                                                                                                                                               |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D25 | Is `conference_attendance` `ONCE` or `YEARLY`?    | **`YEARLY`.** See the section above.                                                                                                                                   |
| D26 | Do files wait for a stage of their own?           | **No — files ship with records.** Stage 3 is folded into Stage 2.                                                                                                      |
| D27 | Link or file — decided per type or per record?    | **Per record: at least one of the two, never neither.** A link proves a public record; a file is for a document only the person holds. Rewrites the D22 section below. |
| D28 | The same file attached twice?                     | **Refused, university-wide,** on a SHA-256 of the bytes.                                                                                                               |
| D29 | How does факт sit beside план on `/science-plan`? | **Two tabs — «План» and «Виконано» — under one shared target band.**                                                                                                   |

### D26 — why files could not wait

Stage 3 existed because R2, presigned uploads, magic bytes and PDF page counting
are a body of work with no dependency on records being correct. That is still
true, and it is still the order the plan builds in: **records work end to end
against links before a single byte is uploaded.**

What changed is what «usable on its own» means. Under D27 a personal document is
the ONLY proof for a сертифікат nobody publishes, so a stage that can record only
link-proved work asks a third of the catalogue to wait — and asks the people
holding those certificates to remember, months later, to come back. The owner
chose one stage. It roughly doubles Stage 2 and that trade was made knowingly.

### D28 — the hash is refused, not flagged

The gate is deliberately harder than D21's «post-check, not a gate», and it is
the one place that is right, because D27 changed what a file IS. While a file
could be a наказ covering three аспіранти, a block would have refused correct
work: one document legitimately evidences several records. Under D27 that
document is a **link**, and what remains in the file column is personal by
construction — a сертифікат carries one person's name.

So one file means one record, for everybody:

- it catches a person attaching the same сертифікат to five конференції, which
  the dedup key never sees because the five conference names all differ;
- it catches a colleague passing their сертифікат on — the owner's original
  words were that people «tend to photoshop their certificates», and this is the
  cheap half of that problem;
- it is deterministic. Nothing is predicted, nothing is judged. Either the bytes
  are already in the bucket or they are not.

The refusal says the file is already in use and **names nothing else** — who
holds it may be somebody on another кафедра, and a refusal message is not a
place to leak that. ННВ sees both records and decides. ADMIN is the escape hatch
if a genuinely shared file ever turns up; the first time one does is the day this
decision gets re-read.

### D29 — two tabs, one band

«План» and «Виконано» are two lists under one target band showing заплановано,
виконано and the ціль together.

Rejected: nesting each record under the plan row it fulfils. It reads well for
the case where somebody did exactly what they planned, and badly for the ordinary
one — the spec already says unplanned work is normal («plans two articles and
publishes one article and a monograph»), and that monograph has no parent to nest
under. It also mixes two jobs done months apart: planning in September, recording
through the year.

What nesting was FOR is kept without it: a plan row that has a record against it
carries a «Виконано» marker inside the «План» tab, so «did I do what I planned»
is answerable without leaving the list.

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
- evidence that fails the work type's generated Zod schema;
- a record carrying **neither a link nor a file** (D27), and one carrying only a
  link where the type sets `requiresFile`;
- a file whose **SHA-256 is already in the bucket** (D28), refused before the
  upload spends on the browser's own hash and again on the server's;
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
  cap refused; closed template refused; another person's plan refused; a record
  with neither link nor file refused (D27); a link-only record refused where the
  type sets `requiresFile`.
- `lib/science/files.test.ts` — key generation, type and size rejection, magic
  bytes, page-count mismatch, and the SHA-256 gate: the same bytes under a
  different file name are still refused (D28).
- The moved modules keep their existing tests **and** gain a test that the old
  re-export paths still resolve, so the move cannot silently break the rating.

## Stages

Each stage is usable on its own and ends in a working app.

**Stage 1 — catalogue and план.** `SciencePlanTemplate` and `ScienceWorkType`,
the 18 work types, the admin editor and clone, `SciencePlan` and
`SciencePlanRow`, the target, the НПП plan screen, the завідувач / декан / ННВ
read views. No works, no records, no files.

**Stage 2 — факт, the pool, files and the post-check** (widened by the owner,
2026-09-17 — D26). `ScienceWork` and `ScienceRecord`, `workKey` and both unique
indexes, the transactional pool check, joining an existing work, evidence by
link or file, план-vs-факт totals, the record↔plan-row link, R2 upload and
signed reads, magic bytes, the SHA-256 gate, PDF page counting against the page
claim, and ННВ's post-check of a record.

**Stage 3 — folded into Stage 2.** It was «files and checks»; the owner asked
for files in the same stage as records, on the grounds that half the catalogue
is proved by a personal document and a stage that cannot record those is not
«usable on its own». The plan still ORDERS it that way: records work end to end
against links before a single byte is uploaded.

**Later, unscheduled.** The export document (D19), and a Crossref DOI check.

## D30–D35 — answers from the meeting with the boss (2026-09-22)

The owner met the boss and brought back six points. **Nothing here is built
yet** — this section records the decisions so the work can be planned against
them.

| #   | Question                                                      | Answer                                                                                                               |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| D30 | Split one article's hours across two years?                   | **No.** Q12 closed. The app already refuses this — no change needed.                                                 |
| D31 | Conditional items in a PLAN?                                  | **No — remove them from planning, keep them in execution.** You cannot plan to win a competition.                    |
| D32 | Somebody who overplanned?                                     | **They owe what they planned.** План and факт must match up; the norm is a floor, not a ceiling.                     |
| D33 | An article published in one year, indexed in Scopus the next? | **Counts in the year it was indexed** — but an OLD article may not be dragged in. Where the line sits is still open. |
| D34 | An official export form for results?                          | **Not needed.** D19 closes. Instead: **analytics inside the system** — see the analytics spec.                       |
| D35 | Files for articles?                                           | **No — URL only.** A file upload is for small documents (сертифікат and the like), never for a whole article.        |

### D31 — п.18 named, п.5 still open

**«Unpredictable» means a result you cannot possibly predict** (owner,
2026-09-22), and the owner named **п.18** — «Керівництво науковою роботою
здобувачів, які стали **переможцями**…». You can plan to supervise; you
cannot plan to win.

Checked the other 17 for the same shape:

- **п.8** is roles — Керівник / Відповідальний секретар / Учасник. Taking part is
  a decision, so it stays plannable.
- **п.5 is the one open case.** Its heading is «Підготовка та подача заявки» —
  an action — but every one of its види роботи is «**Отримання** патенту…», which
  is a result nobody controls. The catalogue disagrees with itself here.
  **Ask the owner.**

### D31 — what «conditional» means, and what it costs

A new boolean on `ScienceWorkType`, edited by ADMIN like `sharing` and `reuse`:
a type that is **recordable but not plannable**. It appears in «Виконано» and not
in «План».

**Which of the 18 items are conditional is NOT decided.** The obvious candidate
is п.8's «Перемога» variant as against its «Участь» one, and п.5 відрізняє
«подача заявки» from «отримання патенту» the same way — but guessing the list is
exactly how a catalogue ends up wrong. **Ask the owner for the list, or send the
18 rows as a sheet to mark.**

### D32 — the target stops being one number

Today both план and факт are measured against `500 × ставка`. D32 splits them:

```
план target  = 500 × ставка                 (unchanged — a floor)
факт target  = max(план, 500 × ставка)       (new)
```

Plan 700 and you owe 700; plan 400 and you still owe 500. **The owner has not
confirmed this formula in writing** — it is a reading of «they have to match
up». Confirm before building: it changes the shortfall shown to all 328 people
and every number on the oversight screens.

### D33 — the indexing lag, and why it is smaller than it looks

The article is claimed **once**; the only question is which рік it lands in.
That is not a split, so it does not contradict D30 — and **the app already
allows it**: enter the article this year and it belongs to this year, because
nothing asks when it was published.

So what is missing is only the **fence**: stopping a 2019 article being entered
today. That needs

1. a publication date on п.4's form, which it does not have; and
2. a rule — «не раніше ніж …».

**Where the line sits is still the open question.** The owner proposed
«indexed > published» (2026-09-22) — which is a good **sanity** check and is
worth having, but it is not the fence: an article published in 2019 and indexed
in 2026 satisfies it too.

**Proposed instead, and matching how this app already works:** ask for both
dates, show them together on the record, and let ННВ decline the implausible
ones. That is D20/D21's post-check — the project has refused a gate three
times, and «публікація 2019, індексація 2026» is exactly the kind of thing a
human spots instantly and a rule argues about. A hard maximum gap can be added
later if abuse appears, and would then be one number rather than a redesign.

**Not decided.** Awaiting the owner.

### D35 — URL-only, and the one thing it costs

`requiresFile` exists on the work type and **no row in the 2027 catalogue sets
it**, so today every record takes «either a link or a file» and an article can
be uploaded as a PDF. D35 wants the opposite flag — `allowsFile: false` on the
publication types, so those forms offer a URL box and no upload.

**What that gives up:** п.4 pays 50 год за сторінку, and the page count is read
from the attached PDF. With URL-only there is no file to count against, and the
page number becomes a typed claim nobody can check. That may be acceptable — it
should be a decision, not a surprise.

## D36–D46 — the owner's answers, 2026-09-23

These settle D31, D32, D33 and D35 above and add four new rules. **Where this
section and the D31–D35 notes above disagree, this section wins.**

| #   | Question                                       | Answer                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D36 | D31 — remove «unpredictable» пункти from план? | **No, reversed.** Every пункт stays plannable, п.18 included. Only the planned HOURS matter; what a person plans to do to reach them is theirs. No `plannable` flag.                                                                                                                                      |
| D37 | D32 — the факт target                          | **Confirmed:** `факт target = max(план, 500 × ставка)`. The план target stays `500 × ставка`.                                                                                                                                                                                                             |
| D38 | Is a planned-vs-done mismatch flagged?         | **No.** Plan a стаття, deliver a монографія — fine. The comparison is hours against hours, as totals, never пункт against пункт.                                                                                                                                                                          |
| D39 | D35 — which types are link only?               | **Every type whose proof is a large or published document** — п.1 (грант, проєкт: звіт), п.3 (both), п.4, п.6 доповідь (матеріали), п.10 (both: екземпляр видання). The other 18 take a link or a file; none requires a file. Reviewed type by type with the owner.                                       |
| D40 | D35 — the page count with no PDF               | **Typed by the НПП, checked by ННВ.** A wrong URL is declined at once; a valid one, ННВ opens and counts the pages.                                                                                                                                                                                       |
| D41 | Month of execution                             | **Every work carries the month it was done** — required, defaults to this month. «Виконано» is grouped by month, and the analytics chart execution per month.                                                                                                                                             |
| D42 | D33 — how old may a work be?                   | **No older than 12 months before the month it is entered**, and never in the future. 12 is a per-year setting ADMIN can change.                                                                                                                                                                           |
| D43 | Who oversees наукова робота?                   | **ADMIN, plus any відділ ADMIN grants it** — a switch on the division form, like «Модерація рейтингу». ННВ has it on by default. Replaces the hard-coded `registryKey: 'NNV'`.                                                                                                                            |
| D44 | Who reads a person's план/факт page?           | **ADMIN, the overseeing відділ, and the person.** Not the завідувач, not the декан. `/my-department/science-plans` is removed.                                                                                                                                                                            |
| D45 | Who opens an evidence file?                    | **The person (any co-author on the work), the overseeing відділ, ADMIN.** Unchanged from today apart from D43's flag.                                                                                                                                                                                     |
| D46 | What can the НПП fix on their own record?      | **Everything that is theirs:** the work's evidence and month (whoever entered it), their own share of hours (every co-author), and a file they uploaded themselves.                                                                                                                                       |
| D47 | How is «link only» expressed?                  | **Two independent rules per вид роботи, set by ADMIN:** `linkRule` and `fileRule`, each Обовʼязково / Необовʼязково / Не використовується. Only when neither is required must one of the two be given (D27); both «не використовується» is refused. Replaces `requiresFile` and the planned `allowsFile`. |

### D41 + D42 — the month, and why it is also the age fence

`ScienceWork.executedMonth` — the month the work happened. For an article that is
its publication month, which is exactly what D33 needed: «not older than N
months» becomes one comparison on a field that exists for its own reason, and
no second «дата публікації» box is added.

- Stored as a `DATE`, always the 1st of the month. Code handles it as a
  `"YYYY-MM"` key; the current month is read in **Europe/Kyiv**, for the same
  reason `currentAcademicYear` does.
- Belongs to the **work**, not the record: co-authors share one article and one
  publication month. The person who joins does not choose it.
- The allowed range is `[this month − lookback, this month]`. With 12 in
  September 2026 that is September 2025 … September 2026. **The window moves
  with the date the record is ENTERED** (owner: «from the current date»), not
  with the навчальний рік — so an article published in May 2026 and indexed in
  September still gets in, and one from 2019 does not.
- `SciencePlanTemplate.maxLookbackMonths Int @default(12)`. A column, not a
  constant, for the reason `minHoursPerRate` is one.
- **Known consequence, accepted for now:** the fence is the same for every
  пункт. A конференція attended in October 2025 can be entered in September
  2026 under 2026/2027. ННВ declines it if that is wrong; a per-type rule is a
  later change if abuse appears.
- Existing works are backfilled from `createdAt` by the migration.

### D43 — the flag, and why the old comment is now wrong

`lib/science/oversight.ts` said oversight was «ННВ's specifically, by наказ»
and deliberately NOT a grantable flag. The owner reversed that: it becomes
`Division.canOverseeScience`, set on `/divisions/[id]/edit`, with the migration
turning it on for the division whose `registryKey` is `NNV`. The helper keeps
its one-call shape; only its body changes.

### D46 — what changes in who may edit what

| action                                | today                                                                   | after                                                                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| edit the work's evidence, link, month | whoever entered the work, or ADMIN                                      | unchanged                                                                                                                                                 |
| change **my own** share of hours      | nobody — delete and retype                                              | **every co-author, bounded by `pool − others`** (`updateRecordHours`)                                                                                     |
| delete a file                         | whoever entered the work, or ADMIN                                      | **also whoever uploaded that file**                                                                                                                       |
| **replace** a file                    | nobody — and delete-then-add is refused when the file is the only proof | **«Замінити»: the new file is verified and saved, the old one removed, in one transaction.** If anything fails the old file stays. Same people as delete. |
| attach a file                         | anybody on the work                                                     | unchanged — but refused on a URL-only type                                                                                                                |

A co-author still cannot change the page count of a shared article: that moves
everybody's pool, and D14's «no tiebreak» reasoning stands.

## Аспіранти from the наказ — design only (owner, 2026-09-23)

**Not built, and not planned in detail:** the file format is unknown. Recorded
so the plan can be written the day the file arrives.

- The university issues a наказ по аспірантурі naming, per аспірант: **the year
  they started, their ПІБ, and their керівник(и)**. It will come as a file,
  format unknown.
- **At most two керівники per аспірант, and each gets the full 50 год** (п.12
  stays `INDIVIDUAL`). The import refuses a third.
- The import builds a **personal list per керівник** — it does NOT create
  records. Some НПП deliberately do not count their аспіранти, so adding one to
  «Виконано» stays the person's own act: they pick from «Ваші аспіранти за
  наказом».
- п.12 stops accepting a typed name. Somebody with no list sees п.12 closed with
  a sentence saying why, rather than a free-text box.
- **Matching names to people** is the hard part — the наказ is typed by hand.
  Same rule as the 2025 import: ПІБ **and** кафедра, never the name alone. The
  import sorts every row into exact match (assigned), near match (ADMIN confirms
  once) and no match (listed to fix or skip). Like `db:import-students`, it
  reports by default and writes with `--apply`, adding and never removing.

## CONFIRMED 2026-09-22 — the shared pool is right, and what it still owes

The owner put D14/D16 to the boss and brought back a plain answer: **several
co-authors write ONE article, and the hours are a fixed rate per article
(× pages where the пункт prices by page). Who gets what is the co-authors'
problem to solve — the app only provides the tools.**

So the pool model stays exactly as D14/D16 built it, and the university
deliberately does not arbitrate the split. No equal division, no approver.

**What «the tools» means, and where we fall short of it:**

| the tool                                   | state                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------- |
| add yourself to a work somebody else added | **built** — `joinWork`, showing «залишилось N з 200 год»              |
| **change your own share afterwards**       | **missing** — no action edits a saved `ScienceRecord.hoursHundredths` |
| **add a colleague to a work**              | **missing** — a colleague can only add themselves                     |

The first gap is the sharper one: agreeing a split is a conversation that
happens AFTER somebody has already entered a number, so «150 to me, 50 to you»
has to be changeable without deleting and retyping the record — which today also
throws away the attached file, since files hang off the record.

`updateWorkEvidence` already clamps the editor's OWN draw down when a pool
shrinks (`hoursHundredths: { gt: ownHours }`), so the transaction shape for a
bounded edit exists; what is missing is a person-facing action.

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

**Rewritten 2026-09-17 (D27).** The first version of this section is kept
below the line, because what it got wrong is worth not getting wrong again.

The rule, in the owner's words: **a link proves anything with a public record. A
file is only for a document that exists only in the person's own hands** — a
сертифікат downloaded from a personal cabinet, or one that arrived by email.

| Evidence | When                                                            | Examples                                                                                                          |
| -------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Link** | a public record of this exists that the person does not control | стаття (DOI, Scopus, the journal's issue page, the репозитарій), **наказ**, **патент**, **свідоцтво**, редколегія |
| **File** | the document exists only in the person's own hands              | сертифікат участі, довідка, лист, a диплом sent by email                                                          |

**Never neither.** A record with only a name is the thing this feature exists to
stop: the owner's words for why the university is moving off paper are that
people «tend to photoshop their certificates and print them on paper», and a
typed name is weaker than the paper it replaces.

**The choice belongs to the RECORD, not only to the work type.** The same
сертифікат is a public URL for one person and a PDF in an inbox for another —
same work type, same year, different evidence. So the rule a record is validated
against is:

> at least one of **link** or **file**, never neither.

`ScienceWorkType.requiresFile` survives and narrows: it no longer means «this
type is proved by a file», it means **«a link alone is not enough for this
type»**. Expect it set on very few rows, not on half the catalogue.

---

_Superseded. The original text read:_ the column `ScienceWorkType.requiresFile`
carries this, `false` meaning a link is required and `true` meaning a file is —
one or the other, decided per type. Its split put «Наказ», «Патент» and
«Свідоцтво» in the **file** column. All three are public documents with a public
record, so by D27 all three are links, and the per-type-only rule would have left
somebody holding a PDF of a link-typed сертифікат unable to record it at all.

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
