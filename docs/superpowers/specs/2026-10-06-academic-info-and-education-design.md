# Academic info and «Освіта» — design

Owner decisions of 2026-10-06. Branch `feat/academic-info-fields` (off
`fix/no-self-archive`). Source lists: `edu-reference/Науковий ступінь.docx`
(35 options) and `edu-reference/Почесне звання.docx` (12 options).

## Why

The profile's «вчене звання» mixes two things: two of its four values
(викладач, старший викладач) are **посади**, not звання. The university now asks
for a real посада, a real вчене звання, почесні звання, and both наукові
ступені with their own date and diploma speciality. Until somebody in HR owns
this data, **every НПП fills it in themselves**.

## The fields

### «Академічна інформація»

| Field                          | Values                                          | Storage                     | Rating                                     |
| ------------------------------ | ----------------------------------------------- | --------------------------- | ------------------------------------------ |
| **Посада** (new)               | викладач · старший викладач · доцент · професор | single                      | **1.2 reads it** (50/30/15/10 — unchanged) |
| **Вчене звання** (new meaning) | старший дослідник · доцент · професор           | single                      | none                                       |
| **Почесне звання** (new)       | the 12 options of the docx                      | **badge list** (several)    | none — 1.4 stays separate                  |
| **Адміністративна посада**     | the 7 existing options                          | **badge list** (was single) | **1.6 pays the highest** badge             |
| Педагогічний стаж              | unchanged                                       |                             | 1.1 unchanged                              |

### «Освіта» (new section)

| Block              | Fields                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Базова освіта      | moved here unchanged (спеціальність, відповідність кафедрі)                                                      |
| **Кандидат / PhD** | ступінь (18 options: «Доктор філософії (PhD)» + 17 «Кандидат … наук») · спеціальність за дипломом · дата захисту |
| **Доктор наук**    | ступінь (17 «Доктор … наук») · спеціальність за дипломом · дата захисту                                          |

- **Rating 1.3** pays by the **highest filled level** — доктор if the doctor slot
  is filled, else кандидат — with the existing «за спеціальністю кафедри» flag
  (`degreeMatchesDepartment`). The 50/40/30/20 points do not change.
- **Характеристика п.5** reads the **newer** of the two defence dates.

## Decisions

1. **Rating 1.2 reads «Посада»** — it holds exactly the four values the old
   field held, so every point stays.
2. **«Вчене звання» is pre-filled** from the old field: доцент → Доцент,
   професор → Професор (176 + 50 on the 2026-09-26 production copy); the rest
   start empty.
3. **«Почесне звання» is a badge list** (pick from the options, it becomes a
   badge; several allowed), **information only** — rating 1.4 «Інші звання і
   відзнаки» stays entered by відділ кадрів on /division-data, unchanged.
4. **«Адміністративна посада» becomes a badge list**; rating 1.6 pays the
   **highest** badge only, so adding badges can never raise anybody's points.
5. **Existing degrees keep counting.** 253 НПП have only «кандидат»/«доктор»
   with no branch of science. The migration moves the existing defence date
   into the matching slot; until the person picks the exact option, the old
   level still feeds 1.3.
6. **Option lists live in code, not in database enums**, validated by Zod — the
   lists will change again, and a new «Кандидат хімічних наук» should be one
   line, not a migration. (Посада and Вчене звання may stay enums: they are
   short and fixed.)
7. **Every НПП edits their own** «Академічна інформація» and «Освіта»
   (temporary, until HR). ADMIN still edits everybody; editor field grants are
   unchanged.
8. **ADMIN gets a list of self-made changes** to these fields — who, old → new,
   when — because посада and ступінь move rating points. Built on the existing
   audit log.
9. **Staff list filters**: посада, вчене звання, науковий ступінь (level),
   почесне звання, адміністративна посада.

## Production safety

- **One additive migration.** New columns are added and every value is copied
  into them **in the same migration**: посада ← old field; вчене звання ←
  доцент/професор; admin-position badges ← the single value; the defence date ←
  into the slot of the existing level. **Nothing is dropped** in this release;
  the old columns go in a later one, once the new ones are confirmed.
- **Proof before deploy.** On the local production copy (`edurank_prod`) a
  script compares every НПП's 2026 profile-derived points (1.2, 1.3, 1.6)
  before and after the migration — **they must be identical**. Then back up
  production, then deploy.
- The closed 2025 year renders from its frozen snapshot and cannot move.
- Production is never seeded; the migration itself carries the data.

## Out of scope

- Whether вчене звання, почесне звання or the branch of science should ever pay
  rating points — the rating catalogue belongs to the вчена рада.
- Removing the old columns (a later release).
- Moving these fields to HR's ownership (later, when the person is found).
