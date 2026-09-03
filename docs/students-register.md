# Реєстр здобувачів — specification

Written 2026-09-03. The register of admitted students: who exists, so that an
НПП can say «I recruited this one» and a завідувач can weigh the claim.

It exists today, and this document is about **moving it**, not inventing it.
Since 2026-08 the register has been `lib/students/accepted-2026.json` — a
345 KB file, committed to git, written by `pnpm students:build` on a
maintainer's machine and baked into the Docker image at build time.
`lib/students/accepted.ts` says so in its own header: _"Reference data, not a
table."_

That sentence is now false, and this spec is the retraction.

## Why it has to become a table

The owner asked for an admin page where students are **added** and **removed**.
The moment a person on the running site can change the register, a file cannot
hold it:

- a container cannot write to its own bundle;
- and if it could, the next redeploy would overwrite it with what is in git.

There is no version of "admins edit the list" that a build-time JSON file can
serve. So the register becomes a Prisma model, and everything that reads it
changes shape from a synchronous array scan to a query.

The old reasoning was not wrong when it was written — a list that changes on a
handful of days in August genuinely did not need three moving parts. What
changed is who does the changing.

## What is NOT changing

Worth stating, because a move like this invites scope creep:

- **The claim flow.** `StudentClaim`, the duplicate rules, the bonus formula,
  `/achievements/students`, `/my-department/students`, `/moderation` — untouched
  in behaviour. Only the source the picker reads from moves.
- **Who decides a claim.** Still ADMIN alone (2026-08-25).
- **`prisma/seed.ts`.** Production is populated with admin edits and is never
  seeded again. The 1046 existing rows arrive by a one-off script instead —
  see [Getting the existing rows in](#getting-the-existing-rows-in).
- **`Speciality`, `SpecialityNorm`, `SpecialityDepartment`.** All three already
  exist and are used as-is.

## The model

```prisma
// One admission — one person on one programme.
//
// A row is an ADMISSION, not a person. Eighteen of the 2026 intake were
// admitted onto two programmes at once (Немеш Вікторія Іванівна is on Фінанси
// and on Середня освіта (історія)), and those are two different students as far
// as every claim, норматив and bonus is concerned. One row per person would
// need два фінансування and дві форми in one cell, and a filter on «Бюджет»
// would stop having an answer.
model AdmittedStudent {
  id   String @id @default(cuid())

  /// Вступна кампанія — 2026, 2027… A year owns its intake, the same way a
  /// RatingTemplate owns its indicators and a SpecialityNorm owns its норматив.
  year Int

  /// ПІБ as the наказ spells it
  name String
  /// Trimmed, lower-cased, apostrophes and dashes folded — see the note below.
  /// Stored rather than computed so search and the delete guard can use an index.
  nameNormalised String

  specialityId String
  speciality   Speciality @relation(fields: [specialityId], references: [id])

  degree  StudentDegree
  form    StudyForm
  funding StudentFunding

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  /// What the import skips as «вже в списку», and what a claim is looked up by.
  @@unique([year, nameNormalised, specialityId, form, funding])
  /// The claim picker's query: everyone on one programme, one combination
  @@index([year, specialityId, form, funding])
}
```

`Speciality` gains `admittedStudents AdmittedStudent[]`.

### A foreign key to `Speciality`, not a name string

The JSON stores the speciality as text. The table must not.

`StudentClaim` already carries `specialityId`, and `SpecialityDepartment` was
converted from a name-matching constant into a table on 2026-08-25 for exactly
this reason: **the name is editable on `/departments` and `/admin`**, the 2026
reorganisation renames things, and a name-matched link breaks in silence — grey
chips, no error, nothing in the log. `Division.registryKey` records the same
lesson. A foreign key cannot break on a rename.

Checked before committing to it: every speciality named in the current 1046 rows
has a `SpecialityNorm` row, and therefore a `Speciality` row. The FK is safe for
the whole import, and the import refuses a row it cannot resolve rather than
inventing a speciality.

### `nameNormalised` uses the claims normaliser

Two normalisers exist today and they disagree. `normaliseStudentName` does
everything `normaliseName` does, and then folds the punctuation Ukrainian names
are written with in several ways:

| in                                 | trims, collapses spaces, lower-cases | folds apostrophes | folds dashes |
| ---------------------------------- | :----------------------------------: | :---------------: | :----------: |
| `normaliseName` (accepted.ts)      |                 yes                  |        no         |      no      |
| `normaliseStudentName` (claims.ts) |                 yes                  |        yes        |     yes      |

The apostrophes are U+2019, U+02BC, U+2018, a backtick and U+00B4, all folded to
a plain `'`; the dashes are U+2010 through U+2015 and U+2212, folded to `-`.

The delete guard has to match a register row against `StudentClaim.studentNameNormalised`,
which is written by the claims one. If the two sides normalise differently,
«Ковальчук О'лена» in the register and «Ковальчук О’лена» in a claim are
different people, and the guard silently finds no claims — the exact failure the
warning dialog exists to prevent.

So `normaliseStudentName` becomes the single normaliser, and the weaker
`normaliseName` is deleted. `lib/students/accepted.ts` imports it from
`lib/stake/claims.ts`.

### No факультет

The JSON carries one per student. Verified 2026-09-03: **nothing in the app
reads it.** The only reads anywhere are two assertions inside the register's own
test file (`lib/students/accepted.test.ts:65,129`) checking the field is
well-formed. No page, no query, no action, no claim.

It was designed out on purpose, in three places:

- `RegisterCriteria` omits it — _"a claim does not record one, and a speciality
  taught on two факультети is still one speciality."_
- `registerOptions()` stopped grouping by факультет on 2026-08-13, because
  grouping split «Психологія» in two: 36 students on СП and 39 on ММПП are one
  speciality with one норматив, and an НПП who picked the wrong факультет found
  their student missing from a list that looked complete.
- `StudentClaim` has no факультет column, and the bonus follows the RECRUITER
  wherever the student ends up studying (2026-08-10).

It is also partly invented data. For the 316 students who came from the накази
rather than from the ЄДЕБО export, the наказ names no факультет at all — the
builder derives one through the випускова кафедра, and for Психологія it openly
guesses which of the two it is.

Dropped (owner, 2026-09-03). Should a факультет filter ever be wanted, it is
derivable through `SpecialityDepartment` → `Department.facultyId`, which is a
real chain in the database. Психологія would then correctly appear under both.

## The page — `/admin/students`

ADMIN only. A Server Component that pages through the URL, the same shape as
`/admin/audit-log`. A sidebar link in the admin group.

**No new entity permission** (owner, 2026-09-03). `DivisionEntityPermission`
covers Staff, Department, Faculty and the rest; the register is not offered to
divisions. If a приймальна комісія ever needs it, that is a `STUDENT` entity
permission and a separate decision.

```
Здобувачі                          [ + Додати ]  [ Імпортувати наказ ]

Рік [2026 ▾]  Ступінь [Усі ▾]  Форма [Усі ▾]  Фінанс. [Усі ▾]
Спеціальність [Усі ▾]     Пошук за ПІБ [___________]

ПІБ                        │ Фінанс.  │ Форма  │ Ступінь  │ Спеціальність
───────────────────────────┼──────────┼────────┼──────────┼──────────────────────────────
Абдуназаров Андрій Анат.   │ Контракт │ Заочна │ Бакалавр │ A7 Фізична культура і спорт   🗑
Аблов Артем Аркадійович    │ Контракт │ Денна  │ Бакалавр │ D2 Фінанси, банківська справа 🗑
…

1046 здобувачів                                    1 … 5 6 7 … 35   ‹ ›
```

**Columns**, in this order: ПІБ | Фінансування | Форма | Ступінь |
Спеціальність. The Ukrainian enum labels already exist in `lib/labels.ts` and
are reused; no new wording is invented here.

**Спеціальність** renders as code + name — `A4.16 Середня освіта (захист
України)`, `C4 Психологія`, `A3 Початкова освіта`. The code comes from
`SPECIALITY_CODES` in `lib/specialities/codes.ts`, the same lookup
`lib/queries/list-student-claims.ts:400` already uses. A speciality with no code
renders as the bare name.

**30 rows per page**, through the existing `components/ui/pagination.tsx` in
`hrefFor` mode. Every filter and the search term live in the URL, so a page is
linkable and the browser Back button works.

**Search** is a `contains` on `nameNormalised` with the query put through
`normaliseStudentName` first. So «петренко о» finds «Петренко О.І.».

**Рік** defaults to the newest year that has rows. A year with none is not
offered.

### «+ Додати»

A dialog: ПІБ, спеціальність (combobox over `Speciality`), форма, фінансування,
ступінь. Writes one row.

It exists so the one person the деканат forgot does not require a whole new
file, and so the page is fully usable before the importer is built. A duplicate
— same year, ПІБ, спеціальність, форма and фінансування — comes back as an
inline error on the form, not a toast, per the app's feedback conventions.

### «Імпортувати наказ»

Phase 2. See [Phasing](#phasing). Specified here only far enough to fix the
button's wording and its rule:

**An import adds; it never removes** (owner, 2026-09-03). A row already present
under the unique key is skipped and counted. This follows how накази actually
arrive — one at a time through August, №520 and №521 on the 19th, №522 and №527
later — so a file is always a part of the truth and never the whole of it. A
"replace the year" import would let №522 alone wipe №520 and №521.

```
Імпортовано: наказ_522.xlsx

  Додано          188
  Вже в списку     12
  Помилки           0

Всього за 2026: 1234

                          [ Скасувати ]  [ Застосувати ]
```

Nothing is written until «Застосувати». A file with any unreadable row shows the
rows and their reasons, and the same rule the builder script already follows
applies: a partial import is refused, because the alternative is a register that
silently lost the students nobody can then claim.

## Deleting a student

`deleteAdmittedStudent(id)` — ADMIN only, audit-logged with `diffChanges`.

**Removing the student removes their claims.** (owner, 2026-09-03, after the
premise behind the first proposal was checked and found false.)

The premise: it was assumed that deleting a register row costs the claiming НПП
their bonus. It does not. `bonusByStaff` in `lib/stake/claims.ts:63` reads
`StudentClaim` rows alone — a claim stores the student's name as **text** plus a
`Speciality` FK, and points at no register row. Delete the student and the claim
survives, still paying.

That left three options and one of them chosen: cascade the delete, so the
warning the owner wanted is **true** rather than merely alarming. It also keeps
the invariant that a claim always has a register row behind it.

Two steps, because the dialog quotes real numbers:

1. Clicking 🗑 calls a read action. It finds claims by
   `year` + `studentNameNormalised` + `specialityId`, and returns each
   claimant's ПІБ, `status`, and — for `CONFIRMED` ones — what `claimValue()`
   says the claim is worth, in ставки.
2. The dialog renders that. Confirming deletes the student and those claims in
   one transaction.

```
Видалити здобувача?

Ковальчук Олена Ігорівна
A4.07 Середня освіта (географія) · Денна · Бюджет

⚠  Цього здобувача вже заявили. Їхні заявки буде видалено разом із ним.

   • Петренко І. М.    підтверджено — втратить 0,048 ст.
   • Сидоренко О. В.   очікує — балів не втрачає

                          [ Скасувати ]  [ Видалити ]
```

With no claims it is a plain «Видалити здобувача?» confirmation. A `PENDING` or
`REJECTED` claim is listed but marked as costing nothing, because
`claimValue()` returns zero for anything not `CONFIRMED`.

The claims are matched by the **normalised** name, which is why both sides must
use `normaliseStudentName` — see above.

## What happens to `lib/students/accepted.ts`

It splits along the line between shaping and reading.

**Stays, as pure functions over rows passed in:**

- `registerOptions(students, ownerNames)` — the picker's cascade. Gains a first
  parameter; the body is unchanged.
- the спеціальність / спеціалізація splitting, the code lookup, the sorting.
- `RegisterCriteria`, `RegisterSpeciality`, `RegisterBranch`, `RegisterVariant`.

**Moves to `lib/queries/list-admitted-students.ts`**, per the `lib/queries/`
convention:

| was                                   | becomes                                           |
| ------------------------------------- | ------------------------------------------------- |
| `ACCEPTED_STUDENTS` (module constant) | `listRegister(year)`                              |
| `studentsMatching(criteria)`          | `async studentsMatching(year, criteria)`          |
| `findAcceptedStudent(name, criteria)` | `async findAcceptedStudent(year, name, criteria)` |
| `REGISTER_YEAR` (constant `2026`)     | gone — the year comes from the active template    |

**Deleted:** `normaliseName`.

`accepted-2026.json` stays in git, demoted to import input — the same role
`ACTIVITY_TYPES_2026` plays for the rating catalogue. `scripts/build-accepted-students.ts`
keeps working and keeps writing it; it is now one step of a two-step path
(build the JSON here, import it there) rather than the whole path.

### The year the picker uses

`REGISTER_YEAR` was a constant because there was one file. Now the picker asks
the register for **the claim's year**, which is already the active OPEN
template's year and is never taken from client input (`activeYear()` in
`app/(dashboard)/achievements/students/actions.ts`).

If that year has no rows, `/achievements/students` says so — «Здобувачів за 2026
рік ще не імпортовано» — rather than rendering an empty picker. An empty select
is a dead end the person cannot diagnose, which is the same reasoning that keeps
студентless combinations out of the cascade.

### Callers that change

- `app/(dashboard)/achievements/students/page.tsx` — `registerOptions` gains its rows
- `app/(dashboard)/achievements/students/actions.ts` — three call sites become `await`
- `validations/student-claim.ts` — its header comment names the JSON
- `prisma/test-data.ts` — reads the JSON directly for its demo claims; unaffected
  in behaviour, but must also insert `AdmittedStudent` rows so the seeded
  database has a register
- `lib/students/accepted.test.ts`, `lib/queries/list-student-claims.test.ts`

## Getting the existing rows in

A one-off script, `pnpm db:import-students`, reading the committed
`lib/students/accepted-2026.json`.

**Reports by default, writes only with `--apply`** — the same shape as
`db:patent-kind`, `db:kharakterystyka-cleanup` and `db:gate-to-check-sum`.
Idempotent on the unique key, so a second run adds nothing.

It is **not a seed**, deliberately. `pnpm db:seed` upserts the 2026 catalogue and
production is never seeded again (owner, 2026-08). This script touches one table
and can be run against production safely.

It is also the one import path that works there. `edu-reference/` is not on the
server and neither is `staff-roster.json` — which is why the Характеристика
backfill needed its own script too — but `accepted-2026.json` **is** in git, so
this one runs unchanged wherever the code is.

`--year` defaults to 2026 and names both the source file and the `year` column.

It refuses to write a partial import: an unresolvable speciality stops the run
and lists the rows, rather than leaving a register missing the students nobody
can then claim.

## Audit log

Both mutations are logged with `diffChanges`, and the project's rule for a new
model applies in full:

- `FIELD_LABELS` in `lib/labels.ts` gains Ukrainian labels for `name`,
  `specialityId`, `degree`, `form`, `funding` and `year`, so a diff on
  `/admin/audit-log` is readable. `nameNormalised` is derived and is **not**
  logged — it would show every change twice, once in a spelling nobody typed.
- `VALID_ENTITIES` in `app/(dashboard)/admin/audit-log/page.tsx` gains
  `AdmittedStudent`, otherwise the entity filter silently drops the rows.
- `resolveEntityName` there gains a case, so a deleted student shows a ПІБ
  rather than a cuid. The row is gone by then, so the `label` written at delete
  time is what it falls back to — which is why `label` carries the ПІБ.

A cascaded claim delete is logged as part of the student's entry, not as
separate `StudentClaim` deletions. One admin action is one line; the claimants
and what each lost belong in that line's `changes`, because that is the fact
somebody will later need to explain to an НПП whose bonus moved.

## Testing

| file                                         | covers                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `lib/students/accepted.test.ts`              | reworked onto a fixture: the cascade, the спеціалізація split, sorting                   |
| `lib/queries/list-admitted-students.test.ts` | filters, ПІБ search through the normaliser, paging, the year default                     |
| `prisma/import-students.test.ts`             | every speciality resolves; the four-part key is unique; a second run is a no-op          |
| the delete action's test                     | claims found by normalised name; `claimValue` figures; both rows gone in one transaction |
| the add action's test                        | duplicate refused inline                                                                 |

The two assertions that currently live in `accepted.test.ts` and guard the data
rather than the code — "every speciality has a норматив" and "the four-part key
is unique" — move to the import script's test, which is where that data is now
checked.

## Phasing

**Phase 1 — this spec.** Model, migration, import script, the page, «+ Додати»,
delete, and the move of every caller. At the end of it the register lives in the
database and an admin can work with it by hand.

**Phase 2 — the importer.** Read an `.xlsx`, map its columns, show the preview
panel above, insert. Much smaller than it sounds:
`scripts/build-accepted-students.ts` already holds the code→speciality table,
the форма and ступінь tables, and the наказ→фінансування rule, all of them
checked against 722 real rows. Phase 2 lifts that logic into
`lib/students/import/` and puts a file input in front of it.

The шаблон the деканат will be asked to keep to is settled in phase 2, with the
files in hand — as of writing, `edu-reference/magisters_students.xlsx` and the
list of which наказ means which фінансування have not been received.
