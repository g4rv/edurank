# Administrative positions, and where a ставка is shown

**Date:** 2026-08-24
**Status:** approved, not built
**Follows:** [`2026-08-24-sumisnytstvo-design.md`](./2026-08-24-sumisnytstvo-design.md), which made
`Staff.employmentRate` the sum written by `saveDistribution`

## Three independent changes

They share a file or two but nothing else, and each can ship on its own:

| Part  | What                                                                                  | Size   |
| ----- | ------------------------------------------------------------------------------------- | ------ |
| **A** | The staff edit form stops asking for a ставка and shows the allocated one per кафедра | small  |
| **B** | One person may hold several administrative positions; the enum splits on «/»          | medium |
| **C** | Проректор and декан leave the **ставка надбавка** pricing list                        | small  |

## The fact that shapes B

**Nobody holds an administrative position.** Measured on the dev database, which
carries the real university import:

```
330 staff, 0 with adminPosition
0 rows in StakeStatusBonus
0 Activity rows for admin_position
```

The feature has never been used. So splitting the enum migrates no data, no
`StakeStatusBonus` row needs remapping, and **no rating total can move**. That is
what makes an otherwise expensive change cheap.

**Verify the same on production before deploying** — see «Before this ships».

---

# Part A — the ставка is shown, never typed

## Why

`saveDistribution` writes `Staff.employmentRate` from the head's own number, and
since 2026-08-24 it is the sum across every кафедра that pays the person. The
edit form still carries a hand-typed «Ставка» input left over from before that
decision, so one field has two writers and the profile can silently disagree with
the grid.

## What changes

- The «Ставка» input is **removed** from the staff edit form.
- Under each кафедра combobox — «Основна кафедра» and «Додаткова кафедра» — the
  allocated ставка for **that** кафедра is shown as read-only text, from
  `getStakeBreakdown`, passed to the form as a prop.
- The «Розподілено: …» note on `/profile` and `/staff/[id]` is unchanged.

After this, `employmentRate` has exactly one writer.

## The trap this must not fall into

Deleting the input is **not** enough. `staffUpdateSchema` declares:

```ts
employmentRate: z.preprocess(num, z.number().nonnegative().nullable()),
```

With no input, the field arrives `undefined`, `num` turns it into `null`, and the
update writes `null` — **wiping the distributed ставка on every profile save**.

So `employmentRate` also comes out of:

- `staffUpdateSchema` in `validations/staff.ts`
- whatever the staff update action spreads into `db.staff.update`
- `RawStaffFormValues` and `staffToFormValues` in `staff-form-fields.tsx`

It stays in `CONFIDENTIAL_STAFF_FIELDS` (still ADMIN-read-only) and stays a column.

## Consequence accepted

Кадри can no longer type a ставка for somebody whose head has not filled a grid
yet — the field simply reads «—» until then. Chosen deliberately over keeping two
writers.

---

# Part B — several positions per person

## The enum splits on «/»

The «/» groups are the **university's own положення**, and each group carries one
point value, so splitting preserves every number in item 1.6:

| Position                     | Ukrainian                                               | Points (1.6) |
| ---------------------------- | ------------------------------------------------------- | ------------ |
| `VICE_RECTOR`                | Проректор                                               | 100          |
| `DEAN`                       | Декан                                                   | 80           |
| `VICE_DEAN`                  | Заступник декана                                        | 50           |
| `ACADEMIC_SECRETARY`         | Вчений секретар університету                            | 50           |
| `ADMISSION_SECRETARY`        | Відповідальний секретар приймальної комісії             | 50           |
| `DEPARTMENT_HEAD`            | Завідувач кафедри                                       | 60           |
| `UNIT_HEAD`                  | Керівник відділу                                        | 60           |
| `DEPUTY_DEPARTMENT_HEAD`     | Заступник завідувача кафедри                            | 40           |
| `DEPUTY_ADMISSION_SECRETARY` | Заступник відповідального секретаря приймальної комісії | 30           |
| `LAB_HEAD`                   | Завідувач лабораторії                                   | 30           |
| `CENTER_HEAD`                | Керівник центру                                         | 30           |

Eleven values, summing to 580 — a figure Part B needs twice, so it is derived in
code and never typed twice.

Three old values are retired: `VICE_DEAN_OR_SECRETARY`, `DEPARTMENT_OR_UNIT_HEAD`,
`LAB_OR_CENTER_HEAD`. With zero rows using them the Postgres type is simply
recreated.

## Storage: a list on the row, not a join table

```prisma
adminPositions AdminPosition[]
```

A Postgres enum array replaces the single `adminPosition` column.

**Decided against a join table** (owner, 2026-08-24): a position is only a label —
nothing else is stored about it. A `StaffAdminPosition` table earns its join and
its delete-then-recreate write only when a position needs facts of its own: dates
held, or which лабораторія it refers to. If that day comes, migrating a list of
~11 values per person to a table is cheap.

Note the app **already** knows завідувач кафедри from `Department.headId` and
декан from `Faculty.deanId`, and derives headship from those, never from this
field. `adminPositions` remains what it always was: what the rating and the
надбавка are scored on, not who may decide anything.

## Which positions block which

From the owner, 2026-08-24. «Відділ is a separate thing», so `UNIT_HEAD` blocks
nothing and combines with anything — a проректор may also head a відділ.

```ts
// lib/staff/admin-positions.ts

/** Positions that cannot be held at the same time as each other */
const CONFLICT_GROUPS: readonly (readonly AdminPosition[])[] = [
  // One top post only. A проректор is not also a декан or a завідувач кафедри.
  ['VICE_RECTOR', 'DEAN', 'DEPARTMENT_HEAD'],
  // Nobody is their own deputy.
  ['DEAN', 'VICE_DEAN'],
  ['DEPARTMENT_HEAD', 'DEPUTY_DEPARTMENT_HEAD'],
  ['ADMISSION_SECRETARY', 'DEPUTY_ADMISSION_SECRETARY'],
];

/** Which positions `held` rules out, and because of which one */
export function blockedBy(held: readonly AdminPosition[]): Map<AdminPosition, AdminPosition>;
```

`blockedBy` returns the blocking position as well as the blocked one, so the UI
can say **why** rather than just greying a row out.

**Enforced on the server**, in `staffUpdateSchema`, not only in the component —
the project's rule for every permission and every constraint.

## The field

A combobox above a list of badges, replacing the single select.

- Choosing a position adds a badge; each badge has an × to remove it.
- **Every position always stays in the list.** Already-held ones are greyed out
  and read «вже вибрано»; blocked ones are greyed out and read «не поєднується з:
  Декан». Removing them from the list was the owner's first instruction and was
  revised on 2026-08-24: a row that vanishes looks like a row that does not exist.
- The «Додаткова кафедра» combobox keeps **filtering** rather than greying out
  (owner, explicitly, same day). The two fields differ on purpose: a кафедра is
  excluded because it is taken by the _other field_, and there are 31 of them.

## Rating item 1.6 becomes a sum

Owner's decision: завідувач кафедри (60) plus завідувач лабораторії (30) scores
**90**, not 60.

`admin_position` moves from `SELECT` to the existing **`CHECK_SUM`** kind. No new
scoring kind and no new field kind are needed — this was checked against
`checkSumValue` and `checkSumProblems`:

```
evidenceFields:
  { kind: 'select',   name: 'mode', options: [{ value: 'all', label: 'Посади', points: 580 }] }
  { kind: 'checkbox', name: 'vice_rector', label: 'Проректор', points: { all: 100 } }
  { kind: 'checkbox', name: 'dean',        label: 'Декан',     points: { all: 80 } }
  … one per position …

scoring: { kind: 'CHECK_SUM' }
```

`checkSumProblems` requires the checkbox points to sum to the mode option's points
— 580 = 580, so the spec is legal. `checkSumValue` returns `Math.min(sum, 580)`,
and the cap can never bind because 580 is the total of everything.

**It stays ONE Activity row per person per year**, which is the point.
`planProfileDerived` enforces «exactly one APPROVED SYSTEM row per derived type»
and purges extras as farmed duplicates; a row-per-position design would have
fought that invariant. This one does not touch it.

`derivedEvidence('admin_position', staff)` returns
`{ mode: 'all', dean: true, lab_head: true }` — absent keys are false, which is
what `checkSumValue` already assumes.

## The template is a data migration, not a code change

`ActivityType.evidenceFields` and `scoring` are JSON **columns**. Editing the
catalogue in `lib/rating/` changes what a fresh seed writes and nothing else; the
running app keeps the old spec. So Part B needs a one-off script, in the shape of
the existing `prisma/gate-to-check-sum.ts`:

```
pnpm db:admin-position-to-check-sum
```

It rewrites the `admin_position` row on every template that has one, and is
idempotent. **Not `pnpm db:seed`** — that command overwrites every indicator an
admin has edited, which is a separate hazard recorded on 2026-08-24.

`computeValue` throws on a scoring kind it does not know, so a row the script
misses fails loudly instead of scoring `NaN`.

## Everything that reads the field

| Place                                       | Change                                                                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `lib/stake/status-bonus.ts` — `statusValue` | Becomes a **sum** over held positions. The file already predicted this: «the column may well become several positions later». |
| `lib/stake/status-bonus.ts` — `statusLines` | `counts` becomes «is this position in the list», not «is it the one»                                                          |
| `lib/rating/profile-derived.ts`             | `POSITION_OPTION` → checkbox field names; `derivedEvidence` returns the CHECK_SUM shape                                       |
| `components/stake/status-cell.tsx`          | Renders several ticked rows instead of one                                                                                    |
| `components/stake/distribution-grid.tsx`    | Passes the list                                                                                                               |
| `lib/queries/get-stake-distribution.ts`     | `StakeRow.adminPosition` → `adminPositions: AdminPosition[]`                                                                  |
| `prisma/core-export.ts` / `core-import.ts`  | Carry the array                                                                                                               |
| `prisma/test-data.ts`                       | Its «somebody on EVERY adminPosition» fixture                                                                                 |
| `lib/labels.ts`                             | Eleven labels; `FIELD_LABELS.adminPositions`                                                                                  |
| `app/(dashboard)/admin/permissions/field/*` | `adminPosition` → `adminPositions` in `ALLOWED_FIELD_NAMES` and `FIELD_GROUPS`                                                |

The Характеристика is **unaffected**: `ActivityType.licencePositions` is declared
on the type, not per option, so which п.38 positions the indicator satisfies does
not depend on which administrative posts a person holds.

---

# Part C — проректор and декан leave the priced list

`POSITION_ORDER` currently does two jobs: it is the label order everywhere, and it
is the list of positions ADMIN prices on the надбавка screen. Those come apart:

```ts
/** All eleven, in the university's own order — labels, tooltips, the field */
export const POSITION_ORDER: readonly AdminPosition[] = [...];

/**
 * The positions a ставка надбавка may be set for.
 *
 * Проректор and декан are out (owner, 2026-08-24): they have their own
 * arrangements outside EduRank, so pricing them here would invite somebody to
 * pay a надбавка twice.
 */
export const PRICED_POSITIONS = POSITION_ORDER.filter(
  (p) => p !== 'VICE_RECTOR' && p !== 'DEAN'
);
```

`components/stake/status-bonus-settings.tsx` and the two `/stakes` pages switch to
`PRICED_POSITIONS`. `statusLines` keeps the full list, so a проректор's row still
explains itself — it simply carries no value.

**Their rating points are untouched.** Проректор is still worth 100 and декан 80
in item 1.6; that is the положення and this change does not reach it.

---

## Testing

- `lib/staff/admin-positions.test.ts` — the conflict rules in both directions;
  `UNIT_HEAD` blocks nothing; a person may hold завідувач кафедри and завідувач
  лабораторії together.
- `validations/staff.test.ts` — the server refuses a conflicting pair, accepts a
  legal one, accepts an empty list.
- `lib/rating/profile-derived.test.ts` — two positions produce one row scoring the
  sum; none produces no row; the row is deleted when the last position is removed.
- `lib/rating/scoring.test.ts` — the new `admin_position` spec passes
  `specProblems` and scores 90 for завідувач кафедри + завідувач лабораторії.
- `lib/stake/status-bonus.test.ts` — `statusValue` sums; unpriced positions
  contribute zero; `statusLines` ticks every held position.
- A test that `PRICED_POSITIONS` excludes проректор and декан and that
  `POSITION_ORDER` still contains them.

## Before this ships

- **Confirm production matches dev.** The whole cheapness of Part B rests on the
  field being empty:

  ```sql
  SELECT "adminPosition", count(*) FROM "Staff" GROUP BY 1;
  SELECT count(*) FROM "StakeStatusBonus";
  ```

  If either is non-empty, stop: `VICE_DEAN_OR_SECRETARY` cannot be split into
  three automatically, and somebody has to say which people are which.

- **Run the template script** after the deploy, once per environment:
  `pnpm db:admin-position-to-check-sum`.

- Back up, and rehearse the migration on a restored copy. The enum type is
  recreated, which is not a change to attempt blind on live data.

## Out of scope

- **Dates on a position.** Decided against with the join table; revisit together.
- **Deriving positions from `Department.headId` / `Faculty.deanId`.** Tempting,
  and deliberately not done: headship is a decision-making fact and
  `adminPositions` is a scoring fact. Merging them would make editing one change
  the other.
- **Pricing проректор and декан anywhere.** Part C removes it; nothing replaces it.
