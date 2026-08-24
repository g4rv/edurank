# Сумісництво — an НПП on two кафедри

**Date:** 2026-08-24
**Status:** approved, not built
**Supersedes:** Q12 in [`docs/open-questions.md`](../../open-questions.md), and the
«Сумісництво (Q12)» paragraph in [`docs/stake-distribution.md`](../../stake-distribution.md)

## Why this exists

The university reported missing functionality: an НПП may hold posts on **two**
кафедри, and **both** кафедри are expected to give that person a ставка.

EduRank assumed the opposite. On 2026-08-04 the ставка design recorded, as an
explicit assumption that nobody had confirmed with the boss:

> A сумісник gets one Vc, computed on their **primary** кафедра only. `Кст`,
> `Кнпп` and `<Rк>` are all per кафедра, so counting one person in two of them
> produces two Vc values that nothing reconciles.

That assumption is now known to be wrong. This document replaces it.

The join table (`StaffDepartment`), the editing UI and the «Сумісник» badge on
`/departments/[id]` already exist — сумісництво has always been recorded. What
was missing is that the record was invisible to the ставка formula and to every
«who is on this кафедра» query except one.

## Decisions

Every row here was answered by the owner on 2026-08-24. Where an answer
overturns an earlier one, the earlier one is named.

| #   | Question                                                            | Decision                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | How many кафедри may one person hold?                               | **Two.** One primary, one additional.                                                                                                                                                                                                                                                                                                                               |
| D2  | What rating does the сумісник bring to the second кафедра?          | **Their full university-wide total**, the same number as on the primary кафедра.                                                                                                                                                                                                                                                                                    |
| D3  | Is the сумісник inside the second кафедра's formula?                | **Yes**, a full member — counted in `<Rк>`, in `ΣR`, in `n`.                                                                                                                                                                                                                                                                                                        |
| D4  | What is their ceiling on the second кафедра?                        | **0.25**, as a default. ADMIN may raise or lower it per person per кафедра.                                                                                                                                                                                                                                                                                         |
| D5  | May the two ставки add up to more than 1.00?                        | **Yes, independently.** 1.00 + 0.25 = 1.25 is legal. Neither head needs to read the other's grid.                                                                                                                                                                                                                                                                   |
| D6  | Does the сумісник count in `Кст ≥ 0.1 × headcount`?                 | **Yes.** Everyone in the grid gets a floor, so the pool must be able to pay everyone in the grid.                                                                                                                                                                                                                                                                   |
| D7  | Does the сумісник count in the second кафедра's `Кнпп`?             | **No.** Primary кафедра only. `Кнпп` is the п.38 licence figure the ministry sees, and claiming one person on two кафедри is not something EduRank's data supports. `Кнпп` does not appear in the formula, so this costs nothing arithmetically.                                                                                                                    |
| D8  | Which кафедра's бонусний фонд pays a сумісник's recruited students? | **Both grids show the full picture.** The «Бонус» column appears on both grids, with no rule about which кафедра «owns» the students. Rationale: the bonus is a signal about the person, not a fixed sum, and a head who sees that this сумісник filled _their own_ programmes can choose to be more generous. This overturns the primary-only half of Q12 as well. |
| D9  | Where is the split shown on a profile?                              | The existing «Ставка» field stays a single number. A **note under it** names where the person's ставки come from: «Кафедра A — 0,90 + Кафедра B — 0,25».                                                                                                                                                                                                            |
| D10 | How is the additional кафедра chosen?                               | A **single select** «Додаткова кафедра», beside «Кафедра», replacing the checkbox grid.                                                                                                                                                                                                                                                                             |

### What D8 accepts

The bonus is stored per **person** (`StudentClaim.staffId`), never per кафедра.
Showing it on both grids means both heads can pay it from their own бонусний
фонд, and nothing in the system prevents that.

This is deliberate and consistent with two rules the ставка feature already
follows: overspending is shown and never refused, and duplicate student claims
are surfaced as evidence rather than arbitrated. Both payments land in their own
кафедра's «нерозподілено», so the double payment is visible to the проректор on
`/stakes` rather than hidden.

Not building: any cross-кафедра reconciliation of the bonus.

## Data model

### `StaffDepartment` — unchanged

Stays exactly as it is. D1's limit of two is enforced in validation, not in the
schema — a `@@unique` cannot express «at most one row per staffId» without a
column that means nothing else.

### `StaffStakeLimits` — gains `departmentId`

This is the only schema change, and D4 forces it.

Today the table is unique on `(staffId, year)`: one Мін/Макс per person per
year. If a сумісник's ceiling on кафедра B must be 0.25, and limits stay
per-person, then setting that ceiling would also cap their **primary** кафедра
at 0.25. The bound has to know which кафедра it bounds.

```prisma
model StaffStakeLimits {
  id           String     @id @default(cuid())
  staffId      String
  staff        Staff      @relation(fields: [staffId], references: [id], onDelete: Cascade)
  departmentId String                                       // NEW, required
  department   Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  year         Int

  minHundredths Int
  maxHundredths Int

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([staffId, departmentId, year])                   // was [staffId, year]
  @@index([year])
}
```

`Department` gains the back-relation `stakeLimits StaffStakeLimits[]`.

**Required, not nullable.** Postgres does not deduplicate NULLs in a unique
index, so a nullable `departmentId` meaning «primary» would allow two rows that
both claim to be the primary bound.

**Migration.** Add the column nullable → backfill from `Staff.departmentId` → set NOT NULL → drop
the old unique → add the new unique and the foreign key. One migration, written by hand rather than
generated, because the backfill sits in the middle of it.

**No `DELETE` anywhere in it.** An earlier draft deleted rows whose staff has no кафедра, on the
argument that a non-НПП should never have had limits. That is a silent destructive statement in a
production migration to save a case that should not exist, and it is not worth it. Instead the
`SET NOT NULL` is left to fail: if any row cannot be backfilled, the migration aborts, the deploy
stops, and a person looks at it. Nothing is destroyed by a wrong assumption.

Every statement in the migration is therefore additive or a constraint change. The only destructive
verb in the whole feature would have been that `DELETE`, and it is gone.

### Defaults

`lib/stake/formula.ts` gains a second constant beside `DEFAULT_LIMITS`:

```ts
/** The bounds for a row on somebody's ADDITIONAL кафедра (D4, 2026-08-24). */
export const PART_TIME_LIMITS = {
  minHundredths: MIN_STAKE, // 10 — the same floor everyone gets
  maxHundredths: toHundredths(0.25),
} as const;
```

| Row type            | Мін  | Макс |
| ------------------- | ---- | ---- |
| primary (unchanged) | 0.10 | 1.00 |
| additional          | 0.10 | 0.25 |

**The additional кафедра never inherits the primary кафедра's bounds.** Two things guarantee it, and
both matter: the limits lookup is scoped `{ year, departmentId }`, so it cannot see the other
кафедра's row at all, and the fallback when no row exists is `PART_TIME_LIMITS`, not
`DEFAULT_LIMITS`. If ADMIN types a Макс of 1,50 for somebody on their main кафедра, their additional
кафедра still opens at 0,25. The two rows are independent in both directions, and neither `Мін` nor
`Макс` is ever copied from one to the other.

## The formula

**`formulaShares()` does not change.** It is pure and already correct; what
changes is who is passed to it.

Two properties of the existing code were checked against D3/D4 and hold:

1. **Pass 1 does not break on a low cap.** `prelim` applies the cap _before_ the
   `PRELIM_FLOOR` of 0.5, so a 0.25 ceiling gives a weight of 0.5, not 0.25. The
   comment in `formula.ts` already states this is deliberate. The cap still binds
   the final ставка in pass 2, which is where it belongs.
2. **A capped row's excess is not redistributed.** `clampedTo: 'max'` leaves the
   remainder in the pool, and it surfaces as «не розподілено» for the head to
   hand out. This is existing behaviour, unchanged.

The visible consequence, which the owner accepted: **every existing person on a
кафедра with a сумісник gets slightly less.** The сумісник's rating enters
`<Rк>` and `ΣR`, so the pool divides more ways. That is arithmetic, not a bug,
and it is what «both кафедри pay them» means.

## Query layer — one rule, not eight patches

A person is attached to a кафедра in two different ways, and eight queries
currently filter on `departmentId` by hand. Patching each call site is how this
feature would rot. One shared helper, in the style `ON_ROSTER` already
established:

```ts
// lib/queries/roster.ts

/**
 * Everyone attached to this кафедра — primary or сумісник.
 *
 * Since 2026-08-24 an НПП may hold posts on two кафедри and both pay them a
 * ставка, so «who is on this кафедра» is no longer `departmentId` alone. Spread
 * it into a `where` so the rule is one greppable thing:
 *
 *   where: { ...ON_ROSTER, isNpp: true, ...onDepartment(id) }
 */
export const onDepartment = (departmentId: string) => ({
  OR: [{ departmentId }, { partTimeDepartments: { some: { departmentId } } }],
});

/** The same for several кафедри at once. */
export const onDepartments = (departmentIds: readonly string[]) => ({
  OR: [
    { departmentId: { in: [...departmentIds] } },
    { partTimeDepartments: { some: { departmentId: { in: [...departmentIds] } } } },
  ],
});
```

A row's own `departmentId` compared against the кафедра being viewed is what
tells primary from сумісник. No extra column is needed anywhere.

## Screens

### `/stakes/[id]` — the distribution grid

`getStakeDistribution` widens its roster query to `onDepartment(departmentId)`,
selects `departmentId`, and scopes `stakeLimits` to `{ year, departmentId }`.

`StakeRow` gains one field:

```ts
/** True when this кафедра is their ADDITIONAL one — bounds and sort differ */
isPartTime: boolean;
```

- **Bounds:** `boundsFor()` falls back to `PART_TIME_LIMITS` instead of
  `DEFAULT_LIMITS` when `isPartTime`.
- **Sort:** сумісники last. `Number(a.isPartTime) - Number(b.isPartTime)`, then
  the existing rating-descending / name tie-break within each group.
- **Badge:** «Сумісник» pill on the name cell, in the muted style
  `/departments/[id]` already uses. Not a coloured row — colouring a table row
  by value breaks the project's colour rule.
- **Бонус column:** rendered as it is for everyone else (D8). The green/amber
  speciality colouring already resolves against the кафедра being viewed, so
  head B automatically sees «onto my programmes» vs «somebody else's» with no
  extra work.

`saveDistribution` and `setStaffLimits` in `app/(dashboard)/stakes/actions.ts`
must load the same widened set and the same per-кафедра limits — otherwise the
server refuses a value the grid legally proposed. Affected: the roster reads
around lines 142 and 459, the limits lookups at 161–162, 203, 469–470 and 547,
and `staffStakeLimitsSchema`, which gains `departmentId`.

### `/stakes` — the university-wide overview

`headcount` now includes сумісники (D6), so `minimumKstHundredths(headcount)`
rises by 0.10 per сумісник.

**Known side effect:** a кафедра whose `Кст` was saved before this change may
turn amber («нижче мінімуму») without anybody touching it. `listDepartmentStakes`
already computes `belowMinimum` on read for exactly this reason, so it surfaces
on screen rather than failing later at save time. The проректор raises the pool.

### `get-department-knpp.ts` — two counts become three

The file's long comment about `knpp` vs `headcount` stays true and gains a third
figure. D6 and D7 pull in opposite directions and both are right.

```ts
export interface DepartmentKnpp {
  departmentId: string;
  /** Own staff — the п.38 population */
  primaryHeadcount: number;
  /** Сумісники from other кафедри — in the grid, not in the licence figure */
  partTimeHeadcount: number;
  /** primary + part-time. The N in `Кст ≥ 0.1 × N` (D6). */
  headcount: number;
  /** Those meeting ≥4 of 20. PRIMARY ONLY (D7). */
  knpp: number;
  /** The п.38 list. Primary only — сумісники are not in the licence document. */
  staff: { id; name; metCount; qualifies }[];
}
```

`staff[]` and `knpp` keep their current meaning exactly, so the Характеристика,
додаток 3 and `KnppSummary` are untouched. Only `headcount` widens.

`KnppSummary` gets one extra line when `partTimeHeadcount > 0`, saying how many
сумісники are counted in the floor and that they are not in `Кнпп`. Without it
the sentence «18 осіб × 0,1 = 1,80» stops matching the list underneath it.

### `/staff`

- The кафедра filter uses `onDepartment` — filtering by кафедра B finds its
  сумісники.
- The «Кафедра» cell shows the primary кафедра, with a small «+ Кафедра B»
  marker when the person has an additional one.
- The existing `partTime` boolean filter is unchanged.

### `/rating`

- The кафедра filter uses `onDepartment`.
- `RatingRow` gains `partTimeDepartments: string[]` so the badge can render.
- **The unfiltered university ranking stays one row per person.** Duplicating a
  person in the ranking would break the ranking. Only the кафедра-filtered view
  shows them under their additional кафедра, badged.

### `/my-department`

`listMyDepartments` currently reads through the `primaryStaff` relation, which
cannot express `onDepartment`. Restructured: one staff query with
`onDepartments(scopeIds)`, then bucketed by кафедра — a сумісник lands in two
buckets. Same badge, same sort-last rule as the grid.

### `/departments/[id]` — already works, two bugs to fix

The page already lists сумісники with a «Сумісник» badge. Two existing defects
are in scope because this change makes them visible:

1. **Neither `primaryStaff` nor `partTimeStaff` filters `ON_ROSTER`.** An
   archived person — someone on декретна відпустка — still appears in the list
   and in the «N основних · M сумісників» count. Every other roster query in the
   app excludes them.
2. Neither filters `isSystem`, so the seeded core administrator would appear on
   whatever кафедра it were given.

### The rest

| Screen                     | Change                                                                     |
| -------------------------- | -------------------------------------------------------------------------- |
| `/faculties/[id]`          | кафедра staff counts use `onDepartment`                                    |
| `/dashboard`               | the faculty/кафедра tree counts likewise                                   |
| `/api/export/rating-chart` | the per-кафедра ranked bar chart includes сумісники                        |
| `/api/export/ratings`      | verify whether the Excel zip groups by кафедра; if it does, same treatment |

## The form

`components/staff/staff-form-fields.tsx`: the «Сумісництво» checkbox grid
becomes a single select, «Додаткова кафедра», placed beside «Кафедра».

- Offers every кафедра except the one chosen as primary.
- Offers «—» to clear it.
- Disabled, with the primary кафедра's own select, when the person is not an НПП
  and has no кафедра.

`validations/staff.ts`:

```ts
partTimeDepartmentIds: z.array(z.string()).max(1, {
  error: 'НПП може працювати щонайбільше на двох кафедрах',
}).default([]),
```

plus a `.refine` that the additional кафедра is not the primary one. The array
shape is kept rather than collapsed to a single nullable string: the join table
is a many-to-many, the server action already diffs it as a set, and D1 is a
policy that could change without a migration.

`lib/labels.ts` gains a `partTimeDepartmentIds` entry — «Додаткова кафедра» —
so the audit log renders the diff. It has none today, which means every
сумісництво change ever recorded shows as a raw field name.

## The profile note (D9)

Under the existing «Ставка» field on `/profile` and `/staff/[id]`, a line naming
where the person's ставки come from, read from `StakeAllocation` for the active
year:

```
Ставка   1,15
Розподілено: Кафедра ботаніки — 0,90 + Кафедра екології — 0,25
```

With no additional кафедра it is one term. With no distribution saved yet the
note names the кафедра without a value.

**The note is labelled «Розподілено» on purpose.** `Staff.employmentRate` is the
contract rate typed by the кадри office; the note is what the heads actually
spread. The two can legitimately differ — a head may not have filled their grid
yet — and presenting the note as a breakdown _of the field_ would make normal
timing look like a data error.

Visibility follows the existing rule for `employmentRate`: ADMIN, or the person
themselves. An EDITOR sees neither.

## Testing

Colocated, as the project requires.

- `lib/stake/formula.test.ts` — a кафедра with one сумісник capped at 0.25: the
  cap binds, the excess lands in the remainder, and the primary staff's shares
  drop by the expected amount. The existing Кафедра історії fixture must still
  reproduce exactly — it has no сумісники, so it is the regression guard.
- `lib/queries/get-department-knpp.test.ts` — `headcount` counts a сумісник,
  `knpp` and `staff[]` do not.
- `lib/queries/get-stake-distribution` — a сумісник sorts last, carries
  `isPartTime`, and picks up `PART_TIME_LIMITS` rather than `DEFAULT_LIMITS`.
- `app/(dashboard)/stakes/actions.test.ts` — `saveDistribution` accepts a value
  for a сумісник on their additional кафедра; `setStaffLimits` writes a
  per-кафедра row and does not disturb the person's primary bounds.
- `validations/staff` — a second additional кафедра is refused; the primary
  кафедра as the additional one is refused.
- A migration test, or a checked manual run, that the backfill leaves every
  existing `StaffStakeLimits` row pointing at its owner's primary кафедра.

## Seeds and existing data

- `prisma/seed.ts`, `prisma/test-data.ts`, `prisma/core-export.ts` and
  `prisma/core-import.ts` all touch `StaffStakeLimits` or `StaffDepartment` and
  must carry the new column. `prod-core.json` is regenerated by
  `pnpm data:export` after the migration.
- **We do not have the list of сумісники.** Nothing in this change invents one.
  The кадри office enters them through the new select, one person at a time, and
  every screen above shows nothing different until they do. That is the intended
  rollout: the feature is inert on today's data.

## Risk to existing production data

Asked directly by the owner on 2026-08-24, before planning. Gone through statement by statement.

**Nothing in this change destroys data.** The migration is `ADD COLUMN` + `UPDATE` + `SET NOT NULL`

- index and foreign-key changes. There is no `DROP COLUMN`, no `DROP TABLE`, no type change and — as
  of the revision above — no `DELETE`. If the backfill misses a row the migration aborts and the
  deploy stops, which is loud and reversible by fixing the row.

Untouched entirely: `Activity`, `RatingEntry`, `StudentClaim`, `AuditLog`, `passwordHash`,
`tokenVersion`, `DepartmentStake`, `StakeDistribution`, `StakeAllocation`.

Four behaviour changes that are **not** data loss but will be noticed:

| What                                                  | Why it is safe                                                                                                                                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A saved distribution's numbers                        | `StakeAllocation.proposedHundredths` and `formulaHundredths` are stored and frozen at save. Nothing in this change rewrites them, and nothing re-saves without a person typing.                                                       |
| «тільки збільшити» on a кафедра that gains a сумісник | The floor a head may not go below is the **live** formula, not the frozen one. Once a сумісник joins, the live proposal for their colleagues drops, so the floor drops with it. A head reopening the grid gets more room, never less. |
| `Кст` validation                                      | Tightens by 0.10 per сумісник (D6). No stored `Кст` is modified; an ADMIN **editing** that кафедра's pool may be refused until they raise it, and `belowMinimum` already flags it on read.                                            |
| `/departments/[id]` counts                            | The roster fix makes «N основних · M сумісників» smaller where archived people were being counted. The old number was wrong.                                                                                                          |

One thing to check against production **before** deploying, because validation gets stricter:

```sql
-- D1 caps a person at one additional кафедра. Anyone already over it could not
-- be saved from the staff form until fixed. Expected result: zero rows.
SELECT "staffId", count(*) FROM "StaffDepartment" GROUP BY "staffId" HAVING count(*) > 1;
```

No seed or import has ever written a `StaffDepartment` row — `staff-import.ts`, `structure.ts` and
`test-data.ts` create none, and `core-export.ts` only reads them — so a row exists only if somebody
typed it in the UI. The query is cheap insurance, not an expected problem.

## Out of scope

- **Splitting a rating between кафедри.** D2 settles it: the whole score counts
  on both. There is no per-кафедра rating and no new number for anyone to type.
- **Coupling the two grids.** D5 settles it: neither head reads the other's
  numbers, and nothing enforces a combined ceiling.
- **Three or more кафедри.** D1 caps it at two, in validation only.
- **Reconciling a bonus paid twice.** D8 accepts it as visible, not prevented.
- **Past years.** Ставка distributions are current-year only — an existing
  decision (2026-08-07), untouched here.

## Documents to update when this ships

- `docs/open-questions.md` — Q12 moves from ⚠️ ASSUMED to ✅ ANSWERED 2026-08-24,
  with the answer reversed.
- `docs/stake-distribution.md` — the «Сумісництво (Q12)» paragraph is rewritten.
- `CLAUDE.md` — the university-structure section says a сумісник's rating and
  ставка are primary-кафедра only; it must say the opposite.
- `lib/queries/get-department-knpp.ts` — the comment «Primary кафедра only. A
  сумісник gets one Vc…» is now wrong and is the first thing anybody reads.
