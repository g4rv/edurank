# Сумісництво Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An НПП may hold posts on two кафедри, appear in both кафедри's lists, and be paid a ставка by both.

**Architecture:** One shared `onDepartment()` `where`-fragment replaces eight hand-written `departmentId` filters, so «who is on this кафедра» becomes a single greppable rule. `StaffStakeLimits` gains `departmentId` so a person's Мін/Макс is per-кафедра. The pure `formulaShares()` is untouched — only its input widens.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript strict, Prisma 7 + PostgreSQL 16, Zod, React Hook Form, Tailwind v4 + shadcn/ui, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-24-sumisnytstvo-design.md`](../specs/2026-08-24-sumisnytstvo-design.md)

## Global Constraints

- **All UI text in Ukrainian.** No hardcoded Ukrainian strings in logic files — only in components.
- **Every ставка is an INTEGER HUNDREDTHS**, never a float, in the database or in any sum.
- **`Кст` bounds the first term only.** The formula must never read `bonusPoolHundredths`.
- **Tests are colocated**, `*.test.ts(x)` next to the file they cover. Run with `pnpm test`.
- **Commits go through the `/commit` skill** — never compose raw `git add`/`git commit` yourself. Each task's «Commit» step names the files and the message; hand both to the skill.
- **A pre-commit hook runs `prettier --write` and `tsc --noEmit`.** A commit that does not type-check is rejected, so every task must leave the tree compiling.
- **Never key rating or ставка behaviour on `ActivityType.code`.** Not touched here, but do not introduce it.
- **Server-side enforcement always.** Role and permission checks live in server actions and queries, never only in components.
- **Errors:** write failures go through `parseDbError(e, '<Ukrainian sentence>', 'scope.action', { userId })`. Never show a code, digest or id to a user.
- **After any `prisma/schema.prisma` change run `pnpm db:generate`, then restart `pnpm dev`** — the dev server holds the old client.
- **Chrome and data stay monochrome.** A «Сумісник» badge is a small state pill and may use `bg-muted text-muted-foreground`. Never colour a whole table row by value.

## Colour and label vocabulary (used by several tasks)

| Thing                                    | Exact value                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Badge text for an additional-кафедра row | `Сумісник`                                                                                             |
| Badge classes                            | `inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground` |
| Field label for the second select        | `Додаткова кафедра`                                                                                    |
| Audit label for `partTimeDepartmentIds`  | `Додаткова кафедра`                                                                                    |
| Max-one-additional error                 | `НПП може працювати щонайбільше на двох кафедрах`                                                      |
| Same-as-primary error                    | `Додаткова кафедра не може збігатися з основною`                                                       |

---

### Task 1: The `onDepartment` where-fragment

The foundation every later task spreads into a query. Pure data, no database access, so it is testable on its own.

**Files:**

- Modify: `lib/queries/roster.ts`
- Test: `lib/queries/roster.test.ts` (create)

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `onDepartment(departmentId: string): { OR: [{ departmentId: string }, { partTimeDepartments: { some: { departmentId: string } } }] }`
  - `onDepartments(departmentIds: readonly string[]): { OR: [...] }`

- [ ] **Step 1: Write the failing test**

Create `lib/queries/roster.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ON_ROSTER, REAL_PEOPLE, onDepartment, onDepartments } from './roster';

describe('onDepartment', () => {
  it('matches a primary кафедра or a сумісництво row', () => {
    expect(onDepartment('d1')).toEqual({
      OR: [{ departmentId: 'd1' }, { partTimeDepartments: { some: { departmentId: 'd1' } } }],
    });
  });

  it('composes with ON_ROSTER without either clobbering the other', () => {
    const where = { ...ON_ROSTER, isNpp: true, ...onDepartment('d1') };
    expect(where).toMatchObject({ archivedAt: null, isSystem: false, isNpp: true });
    expect(where.OR).toHaveLength(2);
  });
});

describe('onDepartments', () => {
  it('matches any of several кафедри, primary or сумісництво', () => {
    expect(onDepartments(['d1', 'd2'])).toEqual({
      OR: [
        { departmentId: { in: ['d1', 'd2'] } },
        { partTimeDepartments: { some: { departmentId: { in: ['d1', 'd2'] } } } },
      ],
    });
  });

  it('copies the array so a caller mutating theirs cannot change the filter', () => {
    const ids = ['d1'];
    const where = onDepartments(ids);
    ids.push('d2');
    expect(where.OR[0]).toEqual({ departmentId: { in: ['d1'] } });
  });

  it('still exports the roster fragments unchanged', () => {
    expect(ON_ROSTER).toEqual({ archivedAt: null, isSystem: false });
    expect(REAL_PEOPLE).toEqual({ isSystem: false });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test roster`
Expected: FAIL — `onDepartment` is not exported from `./roster`.

- [ ] **Step 3: Implement**

Append to `lib/queries/roster.ts`:

```ts
/**
 * Everyone attached to this кафедра — primary or сумісник.
 *
 * Since 2026-08-24 an НПП may hold posts on two кафедри and BOTH pay them a
 * ставка, so «who is on this кафедра» is no longer `departmentId` alone. Eight
 * queries used to write that filter by hand; spread this instead, so the rule
 * is one greppable thing rather than eight copies that drift apart:
 *
 *   where: { ...ON_ROSTER, isNpp: true, ...onDepartment(id) }
 *
 * A row's own `departmentId` compared against the кафедра being viewed is what
 * tells primary from сумісник — no extra column is needed anywhere.
 *
 * Note it produces an `OR`, so it cannot be spread beside another top-level
 * `OR` in the same object. Where a query already has one, put both inside `AND`.
 */
export const onDepartment = (departmentId: string) => ({
  OR: [{ departmentId }, { partTimeDepartments: { some: { departmentId } } }],
});

/** The same for several кафедри at once — one query, not one per кафедра. */
export const onDepartments = (departmentIds: readonly string[]) => ({
  OR: [
    { departmentId: { in: [...departmentIds] } },
    { partTimeDepartments: { some: { departmentId: { in: [...departmentIds] } } } },
  ],
});
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test roster`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

Files: `lib/queries/roster.ts`, `lib/queries/roster.test.ts`

Message:

```
feat(stakes): add onDepartment — primary or сумісник, one rule

«Who is on this кафедра» stops being `departmentId` alone once an НПП
may hold two posts. Eight queries wrote that filter by hand; this is
the single fragment they will spread instead.
```

---

### Task 2: `StaffStakeLimits` becomes per-кафедра

The one schema change. Its migration is hand-written because a backfill sits in the middle of it, and it must contain no destructive statement.

**Files:**

- Modify: `prisma/schema.prisma` (model `StaffStakeLimits`; model `Department` back-relation)
- Create: `prisma/migrations/20260824120000_stake_limits_per_department/migration.sql`
- Modify: `app/(dashboard)/stakes/actions.ts:399-407` (the only two uses of the `staffId_year` composite on this model)
- Modify: `prisma/core-export.ts`, `prisma/core-import.ts` — only if they carry `StaffStakeLimits`; verify in Step 1

**Interfaces:**

- Consumes: nothing.
- Produces: `StaffStakeLimits` rows keyed `staffId_departmentId_year`. Every later task that reads limits must pass `departmentId`.

- [ ] **Step 1: Confirm the blast radius before touching anything**

Run:

```bash
grep -rn "staffId_year" --include=*.ts --include=*.tsx app lib prisma validations components
grep -rn "staffStakeLimits\|stakeLimits" --include=*.ts --include=*.tsx app lib prisma components | grep -v generated
```

Expected: the `staffId_year` hits on **`StaffStakeLimits`** are only `app/(dashboard)/stakes/actions.ts:400` and `:405`. Every other `staffId_year` belongs to `RatingEntry` — a different model, leave them alone. `prisma/core-export.ts` and `prisma/core-import.ts` are expected to carry **no** `StaffStakeLimits` at all (the ставка grids are live work the export deliberately skips); if the grep proves otherwise, add the column there too in Step 5.

- [ ] **Step 2: Change the schema**

In `prisma/schema.prisma`, replace the `StaffStakeLimits` model with:

```prisma
model StaffStakeLimits {
  id      String @id @default(cuid())
  staffId String
  staff   Staff  @relation(fields: [staffId], references: [id], onDelete: Cascade)

  /// WHICH кафедра these bounds apply to. Required, never nullable.
  ///
  /// Since 2026-08-24 a сумісник gets a row in TWO кафедри's grids, with a
  /// different ceiling in each — 1,00 on their own кафедра, 0,25 on the other.
  /// Per-person bounds could not express that: capping the second кафедра would
  /// have capped the first.
  ///
  /// Not nullable-meaning-primary, because Postgres does not deduplicate NULLs
  /// in a unique index, so two rows could both claim to be the primary bound.
  departmentId String
  department   Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)

  year Int

  /// Integer hundredths. The lowest a floor may go is 10 (0.1), never 0 — a
  /// deliberate override of the положення's «менше 0,5 → встановлюється 0,5».
  minHundredths Int
  maxHundredths Int

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([staffId, departmentId, year])
  @@index([year])
}
```

In model `Department`, add the back-relation beside `stakes`:

```prisma
  stakeLimits   StaffStakeLimits[]
```

- [ ] **Step 3: Write the migration by hand**

Create `prisma/migrations/20260824120000_stake_limits_per_department/migration.sql`:

```sql
-- StaffStakeLimits: bounds become per-кафедра rather than per-person.
--
-- A сумісник gets a row in two кафедри's grids with a different ceiling in
-- each, so the bound has to know which кафедра it bounds.
--
-- THERE IS NO DELETE IN THIS FILE, ON PURPOSE. An earlier draft dropped rows
-- whose staff has no кафедра on the argument that they should not exist. If
-- the backfill misses a row, SET NOT NULL below fails, the deploy stops, and a
-- person looks at it — nothing is destroyed by a wrong assumption.

ALTER TABLE "StaffStakeLimits" ADD COLUMN "departmentId" TEXT;

UPDATE "StaffStakeLimits" AS l
SET "departmentId" = s."departmentId"
FROM "Staff" AS s
WHERE s."id" = l."staffId"
  AND s."departmentId" IS NOT NULL;

ALTER TABLE "StaffStakeLimits" ALTER COLUMN "departmentId" SET NOT NULL;

DROP INDEX "StaffStakeLimits_staffId_year_key";

CREATE UNIQUE INDEX "StaffStakeLimits_staffId_departmentId_year_key"
  ON "StaffStakeLimits"("staffId", "departmentId", "year");

CREATE INDEX "StaffStakeLimits_departmentId_idx"
  ON "StaffStakeLimits"("departmentId");

ALTER TABLE "StaffStakeLimits"
  ADD CONSTRAINT "StaffStakeLimits_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

Add `@@index([departmentId])` to the model so the schema matches the SQL:

```prisma
  @@unique([staffId, departmentId, year])
  @@index([year])
  @@index([departmentId])
```

- [ ] **Step 4: Apply it and regenerate**

Run:

```bash
pnpm db:migrate --name stake_limits_per_department
pnpm db:generate
```

Expected: Prisma reports the migration already present and applies it, then generates. If Prisma offers to create its own migration instead, say no and re-check the folder name matches what is committed.

**Then restart `pnpm dev`** — the dev server holds the old Prisma client.

- [ ] **Step 5: Fix the two call sites so the tree compiles again**

In `app/(dashboard)/stakes/actions.ts`, `setStaffLimits` currently keys on `staffId_year` and derives the кафедра from `person.departmentId`. It must take the кафедра from the form instead. Replace the parse and the person lookup:

```ts
const parsed = staffStakeLimitsSchema.safeParse({
  staffId: formData.get('staffId'),
  // Which кафедра's row this is. Taken from the form, not from
  // `person.departmentId`: a сумісник has a row on a кафедра that is not
  // their primary one, and deriving it would always write the wrong one.
  departmentId: formData.get('departmentId'),
  year: Number(formData.get('year')),
  minHundredths: formData.get('min'),
  maxHundredths: formData.get('max'),
});
if (!parsed.success) {
  return { error: parsed.error.issues[0]?.message ?? 'Невірні дані' };
}
const { staffId, departmentId, year, minHundredths, maxHundredths } = parsed.data;
```

and the two lookups:

```ts
const existing = await db.staffStakeLimits.findUnique({
  where: { staffId_departmentId_year: { staffId, departmentId, year } },
  select: { minHundredths: true, maxHundredths: true },
});

const row = await db.staffStakeLimits.upsert({
  where: { staffId_departmentId_year: { staffId, departmentId, year } },
  update: { minHundredths, maxHundredths },
  create: { staffId, departmentId, year, minHundredths, maxHundredths },
});
```

Then replace every remaining `person.departmentId` in the rest of `setStaffLimits` with the `departmentId` from the form, and delete the `if (!person.departmentId) return { success: true, formulaHundredths: null };` guard — the кафедра is now always known. Keep the `person` lookup itself; it supplies the ПІБ for the audit label.

Add `departmentId` to `staffStakeLimitsSchema` in `validations/stake.ts`, as the first field:

```ts
export const staffStakeLimitsSchema = z
  .object({
    staffId: z.string().min(1),
    // Bounds are per-кафедра since 2026-08-24: a сумісник has a different
    // ceiling on their additional кафедра than on their own.
    departmentId: z.string().min(1),
    year: z.number().int(),
```

- [ ] **Step 6: Prove the tree compiles and nothing regressed**

Run:

```bash
pnpm type-check
pnpm test
```

Expected: type-check clean. `pnpm test` passes — the existing suite does not exercise `setStaffLimits`' new field, and Task 6 adds that coverage.

- [ ] **Step 7: Commit**

Files: `prisma/schema.prisma`, `prisma/migrations/20260824120000_stake_limits_per_department/migration.sql`, `app/(dashboard)/stakes/actions.ts`, `validations/stake.ts`

Message:

```
db(stakes): make StaffStakeLimits per-кафедра

A сумісник needs a different ceiling on their additional кафедра than
on their own — 0,25 against 1,00 — and per-person bounds could not
express that: capping the second would have capped the first.

The migration is additive. It contains no DELETE: if the backfill
misses a row, SET NOT NULL fails and the deploy stops rather than
losing it.
```

---

### Task 3: `PART_TIME_LIMITS`, and proof the formula already handles a low cap

`formulaShares()` itself does not change. This task adds the constant and pins the two behaviours the spec relies on, so a later refactor cannot quietly break them.

**Files:**

- Modify: `lib/stake/formula.ts`
- Test: `lib/stake/formula.test.ts`

**Interfaces:**

- Consumes: `MIN_STAKE`, `toHundredths` from `lib/stake/units` (already imported in this file).
- Produces: `PART_TIME_LIMITS: { readonly minHundredths: number; readonly maxHundredths: number }` — `{ minHundredths: 10, maxHundredths: 25 }`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/stake/formula.test.ts`:

```ts
describe('a сумісник on their additional кафедра', () => {
  const people = [
    { staffId: 'own-a', rating: 1000, minHundredths: 10, maxHundredths: 100 },
    { staffId: 'own-b', rating: 500, minHundredths: 10, maxHundredths: 100 },
    // The сумісник brings their WHOLE university rating (D2) and the 0,25 cap.
    { staffId: 'part', rating: 3000, ...PART_TIME_LIMITS },
  ];

  it('caps them at 0,25 however high their rating', () => {
    const { shares } = formulaShares({ people, kstHundredths: 300 });
    const part = shares.find((s) => s.staffId === 'part')!;
    expect(part.hundredths).toBe(25);
    expect(part.clampedTo).toBe('max');
  });

  it('leaves the excess in the pool rather than giving it to somebody else', () => {
    const { shares, totalHundredths } = formulaShares({ people, kstHundredths: 300 });
    // Σ of the proposal is below Кст: the capped share is not redistributed,
    // it becomes «не розподілено» for the head to hand out.
    expect(totalHundredths).toBe(shares.reduce((sum, s) => sum + s.hundredths, 0));
    expect(totalHundredths).toBeLessThan(300);
  });

  it('does not drag their preliminary WEIGHT under the 0,5 floor', () => {
    // Pass 1 applies the cap BEFORE the 0,5 floor, so a 0,25 ceiling gives a
    // weight of 0,5. If that order ever flips, the сумісник's presence stops
    // moving <Rк> the way the spec assumes and everyone else's share shifts.
    const withPartTimer = formulaShares({ people, kstHundredths: 300 });
    const withoutPartTimer = formulaShares({ people: people.slice(0, 2), kstHundredths: 300 });
    const ownA = (r: ReturnType<typeof formulaShares>) =>
      r.shares.find((s) => s.staffId === 'own-a')!.hundredths;
    expect(ownA(withPartTimer)).toBeLessThan(ownA(withoutPartTimer));
  });

  it('still gives them the 0,10 floor when their share rounds to nothing', () => {
    const { shares } = formulaShares({
      people: [
        { staffId: 'own-a', rating: 100000, minHundredths: 10, maxHundredths: 100 },
        { staffId: 'part', rating: 1, ...PART_TIME_LIMITS },
      ],
      kstHundredths: 100,
    });
    const part = shares.find((s) => s.staffId === 'part')!;
    expect(part.hundredths).toBe(10);
    expect(part.clampedTo).toBe('min');
  });
});

describe('PART_TIME_LIMITS', () => {
  it('is 0,10 to 0,25 in hundredths', () => {
    expect(PART_TIME_LIMITS).toEqual({ minHundredths: 10, maxHundredths: 25 });
  });

  it('shares its floor with everybody else — a сумісник is not paid less than the minimum', () => {
    expect(PART_TIME_LIMITS.minHundredths).toBe(DEFAULT_LIMITS.minHundredths);
  });
});
```

Add `PART_TIME_LIMITS` to the file's existing import from `./formula`.

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm test formula`
Expected: FAIL — `PART_TIME_LIMITS` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/stake/formula.ts`, directly below `DEFAULT_LIMITS`:

```ts
/**
 * The bounds for a row on somebody's ADDITIONAL кафедра (owner, 2026-08-24).
 *
 * A сумісник is a full member of the second кафедра's formula — their whole
 * university rating counts in `<Rк>` and `ΣR` there — but they hold a part of a
 * post, not a post, so 0,25 is where the кафедра's own share of them stops.
 * ADMIN may type something else for one person on one кафедра.
 *
 * **Never inherited from the primary кафедра.** The limits lookup is scoped by
 * `departmentId`, so a Макс of 1,50 typed on somebody's own кафедра cannot
 * reach this row; with no row of its own the additional кафедра falls back
 * here, not to `DEFAULT_LIMITS`.
 *
 * The floor is the same 0,10 everybody gets: «nobody who works is left without
 * a ставка» does not have a part-time exception.
 */
export const PART_TIME_LIMITS = {
  minHundredths: MIN_STAKE,
  maxHundredths: toHundredths(0.25),
} as const;
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test formula`
Expected: PASS. **The existing Кафедра історії fixture must still reproduce exactly** — it has no сумісники and is the regression guard for the whole formula. If it moved, something in `formulaShares` was edited; revert that.

- [ ] **Step 5: Commit**

Files: `lib/stake/formula.ts`, `lib/stake/formula.test.ts`

Message:

```
feat(stakes): add PART_TIME_LIMITS — 0,10 to 0,25 on a second кафедра

formulaShares itself is unchanged; these tests pin the two properties
the сумісництво design leans on — a cap below 0,5 does not drag the
preliminary weight under it, and a capped share is left in the pool
rather than redistributed.
```

---

### Task 4: `Кнпп` counts primary only; `headcount` counts everybody in the grid

D6 and D7 pull in opposite directions and both are right. Changing the `DepartmentKnpp` interface breaks its three consumers, so they move in the same commit.

**Files:**

- Modify: `lib/queries/get-department-knpp.ts`
- Modify: `components/kharakterystyka/knpp-summary.tsx`
- Modify: `lib/queries/list-stake-settings.ts` (reads `counts.headcount` / `counts.knpp` — verify it still compiles; no change expected)
- Test: `lib/queries/get-department-knpp.test.ts`

**Interfaces:**

- Consumes: `onDepartments` from Task 1.
- Produces: `DepartmentKnpp` with `primaryHeadcount: number`, `partTimeHeadcount: number`, `headcount: number`, `knpp: number`, `staff: {...}[]`. `headcount === primaryHeadcount + partTimeHeadcount`. `knpp` and `staff` are **primary only**.

- [ ] **Step 1: Write the failing tests**

In `lib/queries/get-department-knpp.test.ts`, replace the `staffRows` helper so rows can carry сумісництво, and add the new cases:

```ts
function staffRows(rows: { id: string; departmentId: string | null; partTimeIn?: string[] }[]) {
  mockStaff.mockResolvedValue(
    rows.map((r) => ({
      id: r.id,
      departmentId: r.departmentId,
      partTimeDepartments: (r.partTimeIn ?? []).map((departmentId) => ({ departmentId })),
      lastName: r.id,
      firstName: 'І',
      patronymic: 'П',
    }))
  );
}

describe('a сумісник on somebody else’s кафедра', () => {
  it('counts in headcount, because the pool must pay them a floor too', async () => {
    staffRows([
      { id: 'a', departmentId: 'd1' },
      { id: 'b', departmentId: 'd1' },
      { id: 'guest', departmentId: 'd2', partTimeIn: ['d1'] },
    ]);
    documents({ a: 7, b: 7, guest: 9 });

    const [d1] = await getDepartmentsKnpp(['d1'], 2026);
    expect(d1).toMatchObject({ primaryHeadcount: 2, partTimeHeadcount: 1, headcount: 3 });
  });

  it('never counts in Кнпп — that is the licence figure, primary кафедра only', async () => {
    staffRows([
      { id: 'a', departmentId: 'd1' },
      { id: 'guest', departmentId: 'd2', partTimeIn: ['d1'] },
    ]);
    documents({ a: 7, guest: 20 });

    const [d1] = await getDepartmentsKnpp(['d1'], 2026);
    expect(d1.knpp).toBe(1);
  });

  it('is not in the п.38 staff list either', async () => {
    staffRows([
      { id: 'a', departmentId: 'd1' },
      { id: 'guest', departmentId: 'd2', partTimeIn: ['d1'] },
    ]);
    documents({ a: 7, guest: 20 });

    const [d1] = await getDepartmentsKnpp(['d1'], 2026);
    expect(d1.staff.map((s) => s.id)).toEqual(['a']);
  });

  it('counts on their own кафедра exactly as before', async () => {
    staffRows([{ id: 'guest', departmentId: 'd2', partTimeIn: ['d1'] }]);
    documents({ guest: 20 });

    const [d2] = await getDepartmentsKnpp(['d2'], 2026);
    expect(d2).toMatchObject({ primaryHeadcount: 1, partTimeHeadcount: 0, headcount: 1, knpp: 1 });
  });

  it('raises the pool minimum by 0,10 for each of them', async () => {
    staffRows([
      { id: 'a', departmentId: 'd1' },
      { id: 'guest', departmentId: 'd2', partTimeIn: ['d1'] },
    ]);
    documents({ a: 7, guest: 7 });

    const [d1] = await getDepartmentsKnpp(['d1'], 2026);
    expect(minimumKst(d1.headcount)).toBeCloseTo(0.2, 5);
  });
});
```

Every existing test in this file passes `departmentId` only, so they keep working through the widened helper — check that they still assert `headcount` correctly now that `primaryHeadcount` exists beside it.

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm test get-department-knpp`
Expected: FAIL — `primaryHeadcount` is undefined, and the сумісник is missing from `d1` entirely.

- [ ] **Step 3: Implement**

In `lib/queries/get-department-knpp.ts`:

Replace the last paragraph of the file's header comment — the one beginning «Primary кафедра only. A сумісник gets one Vc…» — with:

```
 * ── Сумісники (2026-08-24, reversing Q12) ──────────────────────────────────
 *
 * An НПП may hold posts on two кафедри and BOTH pay them a ставка. The two
 * counts here part company over that, and the split is deliberate:
 *
 *   headcount   INCLUDES сумісники. They get a row in this кафедра's grid and
 *               a 0,10 floor like everybody else, so the pool has to be able
 *               to pay them: `Кст ≥ 0.1 × headcount` counts everyone in the
 *               grid, not just the кафедра's own staff.
 *
 *   knpp        PRIMARY кафедра only, and `staff[]` with it. `Кнпп` is the
 *               п.38 licence figure the ministry sees. Counting one person
 *               toward two кафедри's licence numbers is a claim EduRank's data
 *               does not support, and `Кнпп` sizes nothing in the formula
 *               anyway, so it costs nothing to be strict here.
```

Widen the interface:

```ts
export interface DepartmentKnpp {
  departmentId: string;
  /** The кафедра's OWN staff — the population the п.38 figures describe */
  primaryHeadcount: number;
  /** Сумісники from other кафедри — in the grid, never in the licence figure */
  partTimeHeadcount: number;
  /** primary + сумісники. The N in `Кст ≥ 0.1 × N`. */
  headcount: number;
  /** Those meeting ≥4 of 20. PRIMARY ONLY. */
  knpp: number;
  /** The п.38 list. Primary only, for the same reason `knpp` is. */
  staff: {
    id: string;
    name: string;
    /** «позицій із 20» — додаток 3 has a column for exactly this */
    metCount: number;
    qualifies: boolean;
  }[];
}
```

Update the empty fallback in `getDepartmentKnpp`:

```ts
return (
  result ?? {
    departmentId,
    primaryHeadcount: 0,
    partTimeHeadcount: 0,
    headcount: 0,
    knpp: 0,
    staff: [],
  }
);
```

In `getDepartmentsKnpp`, widen the query and the bucketing:

```ts
const staff = await db.staff.findMany({
  where: { ...ON_ROSTER, isNpp: true, ...onDepartments(departmentIds) },
  select: {
    id: true,
    departmentId: true,
    partTimeDepartments: { select: { departmentId: true } },
    lastName: true,
    firstName: true,
    patronymic: true,
  },
  orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
});

const documents = await getKharakterystykaMany(
  staff.map((s) => s.id),
  year
);

const byDepartment = new Map<string, DepartmentKnpp>();
for (const id of departmentIds) {
  byDepartment.set(id, {
    departmentId: id,
    primaryHeadcount: 0,
    partTimeHeadcount: 0,
    headcount: 0,
    knpp: 0,
    staff: [],
  });
}

for (const person of staff) {
  const metCount = documents.get(person.id)?.metCount ?? 0;
  const qualifies = metCount >= REQUIRED_POSITIONS;

  // Their own кафедра: the full treatment — licence figure and list.
  const primary = person.departmentId ? byDepartment.get(person.departmentId) : undefined;
  if (primary) {
    primary.primaryHeadcount += 1;
    primary.headcount += 1;
    if (qualifies) primary.knpp += 1;
    primary.staff.push({
      id: person.id,
      name: `${person.lastName} ${person.firstName} ${person.patronymic}`,
      metCount,
      qualifies,
    });
  }

  // Every additional кафедра: headcount only. They are in that grid and get
  // a floor there, but they are not part of its licence population.
  for (const { departmentId } of person.partTimeDepartments) {
    if (departmentId === person.departmentId) continue;
    const extra = byDepartment.get(departmentId);
    if (!extra) continue;
    extra.partTimeHeadcount += 1;
    extra.headcount += 1;
  }
}

return [...byDepartment.values()];
```

Import `onDepartments` alongside `ON_ROSTER` at the top of the file.

- [ ] **Step 4: Update `KnppSummary` so the numbers on screen still explain each other**

In `components/kharakterystyka/knpp-summary.tsx`, change `belowBar` to measure the primary population, and add the сумісник line:

```tsx
export function KnppSummary({ data, year }: { data: DepartmentKnpp; year: number }) {
  // Against the кафедра's OWN staff: `headcount` now includes сумісники, who
  // are not in `knpp` by design, so subtracting from it would report them all
  // as failing the licence positions.
  const belowBar = data.primaryHeadcount - data.knpp;
```

and, after the existing `belowBar` paragraph, before the closing `</div>`:

```tsx
{
  data.partTimeHeadcount > 0 && (
    <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
      Із них {data.partTimeHeadcount} {data.partTimeHeadcount === 1 ? 'сумісник' : 'сумісників'} з
      інших кафедр. Вони входять у мінімум ставок, бо теж отримують ставку тут, але не входять у
      Кнпп — ліцензійні позиції рахує основна кафедра.
    </p>
  );
}
```

The `hint` on the «НПП усього» figure should say what it now counts:

```tsx
<Figure
  value={data.headcount}
  label="НПП усього"
  hint="на кафедрі разом із сумісниками, крім архівних"
/>
```

- [ ] **Step 5: Run everything**

Run:

```bash
pnpm test get-department-knpp
pnpm type-check
```

Expected: tests PASS. Type-check clean — if `lib/queries/list-stake-settings.ts` or `app/(dashboard)/departments/[id]/page.tsx` complains, they are reading a field that still exists; fix by name, do not widen the interface further.

- [ ] **Step 6: Commit**

Files: `lib/queries/get-department-knpp.ts`, `lib/queries/get-department-knpp.test.ts`, `components/kharakterystyka/knpp-summary.tsx`

Message:

```
feat(stakes): count сумісники in headcount, never in Кнпп

Two figures that used to move together part company. A сумісник gets a
row in this кафедра's grid and a 0,10 floor, so `Кст ≥ 0,1 × N` has to
count them. Кнпп is the п.38 licence figure the ministry sees, and one
person cannot be claimed by two кафедри — it stays primary-only.

KnppSummary says which is which, so «18 осіб × 0,10» keeps matching the
list under it.
```

---

### Task 5: The distribution grid's data — сумісники in, sorted last

**Files:**

- Modify: `lib/queries/get-stake-distribution.ts`
- Test: `lib/queries/get-stake-distribution.test.ts` (create)

**Interfaces:**

- Consumes: `onDepartment` (Task 1), `PART_TIME_LIMITS` (Task 3), `DepartmentKnpp` shape (Task 4).
- Produces: `StakeRow` gains `isPartTime: boolean`. `StakeDistributionView.headcount` now includes сумісники.

- [ ] **Step 1: Write the failing test**

Create `lib/queries/get-stake-distribution.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    department: { findUnique: vi.fn() },
    staff: { findMany: vi.fn() },
    departmentStake: { findUnique: vi.fn() },
    stakeDistribution: { findUnique: vi.fn() },
  },
}));
vi.mock('./get-kharakterystyka', () => ({ getKharakterystykaMany: vi.fn() }));
vi.mock('./list-student-claims', async () => {
  const actual =
    await vi.importActual<typeof import('./list-student-claims')>('./list-student-claims');
  return { ...actual, bonusForStaff: vi.fn() };
});
vi.mock('@/lib/stake/rating-year', () => ({ ratingYearFor: vi.fn() }));

import { db } from '@/lib/db';
import { getKharakterystykaMany } from './get-kharakterystyka';
import { bonusForStaff } from './list-student-claims';
import { ratingYearFor } from '@/lib/stake/rating-year';
import { getStakeDistribution } from './get-stake-distribution';

const mockStaff = db.staff.findMany as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  (ratingYearFor as unknown as Mock).mockResolvedValue(2025);
  (getKharakterystykaMany as unknown as Mock).mockResolvedValue(new Map());
  (bonusForStaff as unknown as Mock).mockResolvedValue(new Map());
  (db.department.findUnique as unknown as Mock).mockResolvedValue({
    id: 'd1',
    name: 'Кафедра ботаніки',
    faculty: { name: 'Природничий факультет' },
  });
  (db.departmentStake.findUnique as unknown as Mock).mockResolvedValue({
    kstHundredths: 300,
    bonusPoolHundredths: null,
  });
  (db.stakeDistribution.findUnique as unknown as Mock).mockResolvedValue(null);
});

/** `own` sits on d1; `guest` sits on d2 and is a сумісник here. */
function roster() {
  mockStaff.mockResolvedValue([
    {
      id: 'own',
      departmentId: 'd1',
      lastName: 'Власний',
      firstName: 'І',
      patronymic: 'П',
      adminPosition: null,
      ratingEntries: [{ totalScore: 1000 }],
      stakeLimits: [],
    },
    {
      id: 'guest',
      departmentId: 'd2',
      lastName: 'Гість',
      firstName: 'І',
      patronymic: 'П',
      adminPosition: null,
      ratingEntries: [{ totalScore: 9000 }],
      stakeLimits: [],
    },
  ]);
}

describe('getStakeDistribution with a сумісник', () => {
  it('marks the row whose primary кафедра is elsewhere', async () => {
    roster();
    const view = (await getStakeDistribution('d1', 2026))!;
    expect(view.rows.find((r) => r.staffId === 'own')!.isPartTime).toBe(false);
    expect(view.rows.find((r) => r.staffId === 'guest')!.isPartTime).toBe(true);
  });

  it('sorts them last, however high their rating', async () => {
    roster();
    const view = (await getStakeDistribution('d1', 2026))!;
    // `guest` outranks `own` 9000 to 1000 and still comes second.
    expect(view.rows.map((r) => r.staffId)).toEqual(['own', 'guest']);
  });

  it('gives them the 0,25 ceiling, not the 1,00 one', async () => {
    roster();
    const view = (await getStakeDistribution('d1', 2026))!;
    const guest = view.rows.find((r) => r.staffId === 'guest')!;
    expect(guest.maxHundredths).toBe(25);
    expect(guest.hasOwnLimits).toBe(false);
    expect(guest.formulaHundredths).toBeLessThanOrEqual(25);
  });

  it('shows their whole university rating, not a share of it', async () => {
    roster();
    const view = (await getStakeDistribution('d1', 2026))!;
    expect(view.rows.find((r) => r.staffId === 'guest')!.rating).toBe(9000);
  });

  it('counts them in headcount, so the pool minimum covers them', async () => {
    roster();
    const view = (await getStakeDistribution('d1', 2026))!;
    expect(view.headcount).toBe(2);
    expect(view.minimumKstHundredths).toBe(20);
  });

  it('asks the database for сумісники as well as primary staff', async () => {
    roster();
    await getStakeDistribution('d1', 2026);
    expect(mockStaff.mock.calls[0][0].where.OR).toEqual([
      { departmentId: 'd1' },
      { partTimeDepartments: { some: { departmentId: 'd1' } } },
    ]);
  });

  it('scopes the limits lookup to this кафедра', async () => {
    roster();
    await getStakeDistribution('d1', 2026);
    expect(mockStaff.mock.calls[0][0].select.stakeLimits.where).toEqual({
      year: 2026,
      departmentId: 'd1',
    });
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm test get-stake-distribution`
Expected: FAIL — `isPartTime` is undefined and the where-clause has no `OR`.

- [ ] **Step 3: Implement**

In `lib/queries/get-stake-distribution.ts`:

Add to the `StakeRow` interface, after `adminPosition`:

```ts
/**
 * This кафедра is their ADDITIONAL one — they sit primarily elsewhere.
 *
 * Drives three things and nothing else: the «Сумісник» badge, the sort to the
 * bottom, and which default bounds apply. Their rating, their bonus and their
 * place in the formula are exactly the same as anybody else's (2026-08-24).
 */
isPartTime: boolean;
```

Widen the roster read:

```ts
const staff = await db.staff.findMany({
  where: { ...ON_ROSTER, isNpp: true, ...onDepartment(departmentId) },
  select: {
    id: true,
    departmentId: true,
    lastName: true,
    firstName: true,
    patronymic: true,
    adminPosition: true,
    ratingEntries: { where: { year: ratingYear }, select: { totalScore: true } },
    // Scoped to THIS кафедра: bounds are per-кафедра since 2026-08-24, and an
    // unscoped read would hand a сумісник their own кафедра's 1,00 ceiling.
    stakeLimits: {
      where: { year, departmentId },
      select: { minHundredths: true, maxHundredths: true },
    },
  },
});
```

Import `onDepartment` beside `ON_ROSTER`, and `PART_TIME_LIMITS` beside `DEFAULT_LIMITS`.

`departmentId` is now a **required** part of every row this query returns — `isPartTime` reads it,
and a row without it is silently treated as a сумісник. Any test fixture or caller that builds these
rows by hand must carry it.

Replace `boundsFor`:

```ts
/** Is this кафедра their additional one? */
const isPartTime = (s: (typeof staff)[number]) => s.departmentId !== departmentId;

/**
 * This person's bounds on THIS кафедра — their own row, or the defaults.
 *
 * The fallback differs by row type and never crosses кафедри: a сумісник with
 * no row of their own gets 0,10–0,25, not whatever ADMIN typed for them on
 * their primary кафедра.
 */
function boundsFor(s: (typeof staff)[number]) {
  const own = s.stakeLimits[0];
  const fallback = isPartTime(s) ? PART_TIME_LIMITS : DEFAULT_LIMITS;
  return {
    minHundredths: own?.minHundredths ?? fallback.minHundredths,
    maxHundredths: own?.maxHundredths ?? fallback.maxHundredths,
    /** Dimming keys off this: «somebody decided this for this person» */
    hasOwnLimits: !!own,
  };
}
```

In the row map, add `isPartTime: isPartTime(s),` beside `adminPosition`, and replace the sort:

```ts
    // Сумісники last as a block, then the order the formula spreads in — which
    // is the order a head already thinks in. Display only: the formula does not
    // read this. Name as the final tie-break so it never wobbles.
    .sort(
      (a, b) =>
        Number(a.isPartTime) - Number(b.isPartTime) ||
        b.rating - a.rating ||
        a.name.localeCompare(b.name, 'uk')
    );
```

`knpp` in this file counts `documents.get(s.id)` over `staff`, which now includes сумісники. Restrict it to keep D7:

```ts
// Primary кафедра only — Кнпп is the п.38 licence figure and one person
// cannot be claimed by two кафедри. `headcount` below deliberately differs.
const knpp = staff.filter(
  (s) => !isPartTime(s) && (documents.get(s.id)?.metCount ?? 0) >= REQUIRED_POSITIONS
).length;
```

`headcount: staff.length` and `minimumKstHundredths(staff.length)` already include сумісники now — leave both.

**The «Бонус» column needs no change, and that is the point (D8).** `bonusForStaff` is called with
every id in `staff`, so a сумісник's recruited students now appear on both grids automatically. The
green/amber speciality colouring resolves against `department.name` — the кафедра being viewed — so
head B sees «onto my programmes» and head A sees «somebody else's», from the same data, with no
per-кафедра bonus rule anywhere. Do not add one.

- [ ] **Step 4: Run the tests**

Run: `pnpm test get-stake-distribution`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

Files: `lib/queries/get-stake-distribution.ts`, `lib/queries/get-stake-distribution.test.ts`

Message:

```
feat(stakes): put сумісники in the кафедра they also work for

They join the grid with their whole university rating, a 0,25 ceiling
that never inherits from their own кафедра, and a sort to the bottom.
Кнпп stays primary-only; headcount does not.
```

---

### Task 6: The server accepts what the grid proposes, and stops overwriting a сумісник's ставка

Two problems in one file. Both roster reads inside `app/(dashboard)/stakes/actions.ts` must match
Task 5's, or the server refuses a value the formula legally offered.

**And a correctness bug this feature would otherwise ship.** `saveDistribution` writes the head's
number onto `Staff.employmentRate` (line ~322), so the profile field IS the distributed ставка. With
two кафедри paying one person, the second head to save **overwrites** the first: a сумісник on 0,90

- 0,25 would show 0,25, and whoever saved last would win. `employmentRate` has to become the sum of
  that person's allocations across every кафедра for the year.

**Files:**

- Modify: `app/(dashboard)/stakes/actions.ts` (`saveDistribution` roster read ~line 135; the bounds loop ~line 200; `setStaffLimits` recompute read ~line 455; `liftStoredAllocations` limits map ~line 545)
- Test: `app/(dashboard)/stakes/actions.test.ts`

**Interfaces:**

- Consumes: `onDepartment` (Task 1), `PART_TIME_LIMITS` (Task 3), `staffStakeLimitsSchema` with `departmentId` (Task 2).
- Produces: `Staff.employmentRate` becomes **the person's total across all кафедри** for the year, which Task 14's note then breaks down. Action signatures are otherwise unchanged, apart from `setStaffLimits` requiring a `departmentId` form field.

- [ ] **Step 1: Write the failing tests**

Append to `app/(dashboard)/stakes/actions.test.ts`. It already has `roster()`, `payload()`, `DEPT`,
`YEAR` and a `beforeEach` that wires every mock — reuse them, do not build a second setup.

**First, one change to `roster()` itself, or every existing test in the file breaks.** The roster
read now selects `departmentId`, and `fallbackFor` decides between 1,00 and 0,25 by comparing it
against the кафедра being saved. `roster()` returns rows without one, so `undefined !== DEPT` would
silently give all three fixture people a 0,25 ceiling and fail assertions that have nothing to do
with сумісництво. Add it:

```ts
function roster(n = 3) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    // Their own кафедра. Compared against the one being saved to tell a
    // primary row from a сумісник's, so it can never be left off.
    departmentId: DEPT,
    lastName: `Прізвище${i}`,
    firstName: 'Ім’я',
    ratingEntries: [{ totalScore: 1000 }],
    stakeLimits: [],
  }));
}
```

and simplify `withGuest()` accordingly — it then only needs to override the guest's own кафедра:

```ts
/** `roster()` plus a fourth person whose primary кафедра is elsewhere. */
function withGuest() {
  const staff = roster();
  staff.push({
    id: 'guest',
    departmentId: 'dept-2',
    lastName: 'Гість',
    firstName: 'Ім’я',
    ratingEntries: [{ totalScore: 1000 }],
    stakeLimits: [],
  });
  mockStaff.mockResolvedValue(staff);
}
```

```ts
describe('a сумісник on the кафедра', () => {
  it('is asked for by the roster read, or the save rejects the whole кафедра', async () => {
    withGuest();
    await saveDistribution({
      departmentId: DEPT,
      year: YEAR,
      allocations: [
        { staffId: 's0', hundredths: 100, justification: null },
        { staffId: 's1', hundredths: 100, justification: null },
        { staffId: 's2', hundredths: 75, justification: null },
        { staffId: 'guest', hundredths: 25, justification: null },
      ],
    });
    expect(mockStaff.mock.calls[0][0].where.OR).toEqual([
      { departmentId: DEPT },
      { partTimeDepartments: { some: { departmentId: DEPT } } },
    ]);
  });

  it('is bounded at 0,25 here, not at the 1,00 their own кафедра gives them', async () => {
    withGuest();
    const result = await saveDistribution({
      departmentId: DEPT,
      year: YEAR,
      allocations: [
        { staffId: 's0', hundredths: 100, justification: null },
        { staffId: 's1', hundredths: 100, justification: null },
        { staffId: 's2', hundredths: 75, justification: null },
        { staffId: 'guest', hundredths: 50, justification: null },
      ],
    });
    expect(result).toEqual({ error: expect.stringContaining('Гість') });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('accepts 0,25 for them', async () => {
    withGuest();
    const result = await saveDistribution({
      departmentId: DEPT,
      year: YEAR,
      allocations: [
        { staffId: 's0', hundredths: 100, justification: null },
        { staffId: 's1', hundredths: 100, justification: null },
        { staffId: 's2', hundredths: 75, justification: null },
        { staffId: 'guest', hundredths: 25, justification: null },
      ],
    });
    expect(result).toEqual({ success: true });
  });
});

describe('employmentRate is the person’s TOTAL, not this кафедра’s share', () => {
  it('adds what other кафедри already pay them', async () => {
    withGuest();
    // Кафедра B has already saved 0,25 for the same person this year.
    mockAllocationAggregate.mockResolvedValue({ _sum: { proposedHundredths: 25 } });

    await saveDistribution({
      departmentId: DEPT,
      year: YEAR,
      allocations: [
        { staffId: 's0', hundredths: 100, justification: null },
        { staffId: 's1', hundredths: 100, justification: null },
        { staffId: 's2', hundredths: 75, justification: null },
        { staffId: 'guest', hundredths: 25, justification: null },
      ],
    });

    const written = mockStaffUpdate.mock.calls.find((c) => c[0].where.id === 'guest')![0];
    // 0,25 here + 0,25 already elsewhere. Before this, the second head to save
    // overwrote the first and the person's profile showed one кафедра's share.
    expect(written.data.employmentRate).toBeCloseTo(0.5, 5);
  });

  it('excludes THIS кафедра’s own previous allocation from the sum', async () => {
    withGuest();
    mockAllocationAggregate.mockResolvedValue({ _sum: { proposedHundredths: 0 } });

    await saveDistribution(payload([100, 100, 75]));

    const written = mockStaffUpdate.mock.calls.find((c) => c[0].where.id === 's0')![0];
    expect(written.data.employmentRate).toBeCloseTo(1, 5);
    // The aggregate must exclude this distribution, or re-saving a кафедра
    // would double every ставка on it.
    expect(mockAllocationAggregate.mock.calls[0][0].where.distributionId).toEqual({
      not: 'dist-1',
    });
  });

  it('is just this кафедра’s number when nobody else pays them', async () => {
    mockAllocationAggregate.mockResolvedValue({ _sum: { proposedHundredths: null } });

    await saveDistribution(payload([100, 100, 75]));

    const written = mockStaffUpdate.mock.calls.find((c) => c[0].where.id === 's2')![0];
    expect(written.data.employmentRate).toBeCloseTo(0.75, 5);
  });
});

describe('setStaffLimits', () => {
  it('writes the row for the кафедра named in the form, not the person’s own', async () => {
    mockAuth.mockResolvedValue(ADMIN);
    mockStaffOne.mockResolvedValue({
      lastName: 'Гість',
      firstName: 'Ім’я',
      patronymic: 'По',
      departmentId: 'dept-2',
    });
    mockLimitsFind.mockResolvedValue(null);
    mockLimitsUpsert.mockResolvedValue({ id: 'lim-1' });

    const fd = new FormData();
    fd.set('staffId', 'guest');
    fd.set('departmentId', DEPT);
    fd.set('year', String(YEAR));
    fd.set('min', '0,10');
    fd.set('max', '0,25');
    await setStaffLimits(null, fd);

    expect(mockLimitsUpsert.mock.calls[0][0].where).toEqual({
      staffId_departmentId_year: { staffId: 'guest', departmentId: DEPT, year: YEAR },
    });
  });

  it('refuses a submission with no departmentId', async () => {
    mockAuth.mockResolvedValue(ADMIN);

    const fd = new FormData();
    fd.set('staffId', 'guest');
    fd.set('year', String(YEAR));
    fd.set('min', '0,10');
    fd.set('max', '0,25');
    const result = await setStaffLimits(null, fd);

    expect(result).toEqual({ error: expect.any(String) });
    expect(mockLimitsUpsert).not.toHaveBeenCalled();
  });
});
```

Two additions to the file's existing scaffolding are needed for these to run:

```ts
// beside the other mock handles at the top
const mockAllocationAggregate = vi.fn();
```

and inside the `mockTransaction` implementation, extend the fake `tx`:

```ts
          stakeAllocation: {
            findMany: vi.fn().mockResolvedValue([]),
            deleteMany: vi.fn(),
            createMany: vi.fn(),
            aggregate: mockAllocationAggregate,
          },
```

and give it a default in `beforeEach`, so the tests that do not care are unaffected:

```ts
mockAllocationAggregate.mockResolvedValue({ _sum: { proposedHundredths: 0 } });
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm test stakes/actions`
Expected: FAIL — the roster read has no `OR`, the сумісник is bounded at 1,00, and `employmentRate` is written as this кафедра's share alone.

- [ ] **Step 3: Implement — `saveDistribution`**

Widen the roster read (around line 135):

```ts
    db.staff.findMany({
      where: { ...ON_ROSTER, isNpp: true, ...onDepartment(departmentId) },
      select: {
        id: true,
        departmentId: true,
        lastName: true,
        firstName: true,
        ratingEntries: { where: { year: ratingYear }, select: { totalScore: true } },
        stakeLimits: {
          where: { year, departmentId },
          select: { minHundredths: true, maxHundredths: true },
        },
      },
    }),
```

Add a helper just below the destructuring, and use it in both the formula call and the bounds loop:

```ts
/**
 * The defaults for this person ON THIS кафедра.
 *
 * A сумісник's ceiling is 0,25 here and 1,00 on their own кафедра, and the
 * two must never be confused: the grid offers the narrower one, so a server
 * still using `DEFAULT_LIMITS` would accept a number the head never saw.
 */
const fallbackFor = (s: { departmentId: string | null }) =>
  s.departmentId === departmentId ? DEFAULT_LIMITS : PART_TIME_LIMITS;
```

In the `formulaShares` call:

```ts
    people: staff.map((s) => ({
      staffId: s.id,
      rating: s.ratingEntries[0]?.totalScore ?? 0,
      minHundredths: s.stakeLimits[0]?.minHundredths ?? fallbackFor(s).minHundredths,
      maxHundredths: s.stakeLimits[0]?.maxHundredths ?? fallbackFor(s).maxHundredths,
    })),
```

In the per-allocation bounds loop:

```ts
const min =
  rating > 0 ? Math.max(limits?.minHundredths ?? fallbackFor(person).minHundredths, MIN_STAKE) : 0;
const max = Math.max(limits?.maxHundredths ?? fallbackFor(person).maxHundredths, min);
```

- [ ] **Step 4: Implement — `setStaffLimits` recompute**

Task 2 already replaced `person.departmentId` with the form's `departmentId` here. Now widen the recompute roster the same way:

```ts
    db.staff.findMany({
      where: { ...ON_ROSTER, isNpp: true, ...onDepartment(departmentId) },
      select: {
        id: true,
        departmentId: true,
        ratingEntries: { where: { year: ratingYear }, select: { totalScore: true } },
        stakeLimits: {
          where: { year, departmentId },
          select: { minHundredths: true, maxHundredths: true },
        },
      },
    }),
```

and apply the same `fallbackFor` in its `formulaShares` call. `liftStoredAllocations` receives `roster` and reads `stakeLimits[0]` off it — extend its `roster` parameter type with `departmentId: string | null` and pass the кафедра in so it can apply the same fallback:

```ts
async function liftStoredAllocations(
  departmentId: string,
  year: number,
  roster: {
    id: string;
    departmentId: string | null;
    ratingEntries: { totalScore: number }[];
  }[],
  shares: { staffId: string; hundredths: number }[],
  userId: string
): Promise<void> {
```

Inside its `limitsByStaff` map, where the fallback is applied, use `s.departmentId === departmentId ? DEFAULT_LIMITS : PART_TIME_LIMITS`.

Import `onDepartment` and `PART_TIME_LIMITS` at the top of the file.

- [ ] **Step 5: Make `employmentRate` the person's total across every кафедра**

Inside `saveDistribution`'s transaction, at line ~322, replace the loop:

```ts
// ── The ставка lands on the person ──
//
// …existing comment stays…
//
// **The SUM across every кафедра, not this one's share** (2026-08-24).
// Since a сумісник is paid by two кафедри, writing this кафедра's number
// alone meant the second head to save overwrote the first: somebody on
// 0,90 + 0,25 showed 0,25, and which figure survived depended on who
// saved last. The other кафедри's rows are read fresh inside the same
// transaction, so the total is right whichever order the heads work in.
for (const a of allocations) {
  const elsewhere = await tx.stakeAllocation.aggregate({
    where: {
      staffId: a.staffId,
      distribution: { year },
      // Not this кафедра's own previous rows — they are being replaced by
      // `a.hundredths`, and counting them would double every ставка on a
      // re-save.
      distributionId: { not: distribution.id },
    },
    _sum: { proposedHundredths: true },
  });
  await tx.staff.update({
    where: { id: a.staffId },
    data: {
      employmentRate: fromHundredths((elsewhere._sum.proposedHundredths ?? 0) + a.hundredths),
    },
  });
}
```

**Known limitation, deliberately not fixed here.** `liftStoredAllocations` moves stored allocations
when ADMIN changes a cap, and it has never refreshed `employmentRate` — that gap predates this
feature and is out of its scope. Note it and move on; do not widen this task.

- [ ] **Step 6: Run everything**

Run:

```bash
pnpm test stakes
pnpm type-check
```

Expected: PASS, clean.

- [ ] **Step 7: Commit**

Files: `app/(dashboard)/stakes/actions.ts`, `app/(dashboard)/stakes/actions.test.ts`

Message:

```
fix(stakes): sum a сумісник's ставка across both кафедри

Two fixes in the one file. Both roster reads still asked for primary
staff only, so a сумісник's row was «Список НПП змінився» on save and
their bounds were read as 1,00.

And `employmentRate` took this кафедра's share alone, so the second head
to save overwrote the first — somebody on 0,90 + 0,25 showed 0,25, and
which number survived depended on who saved last. It is now the sum of
every кафедра's allocation for the year.
```

---

### Task 7: The grid shows who is a сумісник

**Files:**

- Modify: `components/stake/distribution-grid.tsx` (the name cell around line 1124; `limitsFormData` around line 741)
- Modify: `app/(dashboard)/stakes/[id]/page.tsx` — only if it renders rows itself; verify in Step 1

**Interfaces:**

- Consumes: `StakeRow.isPartTime` (Task 5), `setStaffLimits` requiring `departmentId` (Tasks 2 and 6).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Read the two places before editing**

Run:

```bash
sed -n '735,760p' components/stake/distribution-grid.tsx
sed -n '1118,1150p' components/stake/distribution-grid.tsx
```

Confirm `limitsFormData(staffId, year, next)` builds the FormData that `setStaffLimits` reads, and that the name cell renders `{row.name}` inside a `<Link>`.

- [ ] **Step 2: Carry the кафедра into the limits form**

`setStaffLimits` now requires `departmentId`; without it every cap edit returns «Невірні дані». Change the signature and the call site:

```ts
function limitsFormData(
  staffId: string,
  departmentId: string,
  year: number,
  next: LimitDraft
): FormData {
  const form = new FormData();
  form.set('staffId', staffId);
  // Bounds are per-кафедра: this says WHICH кафедра's row is being edited.
  form.set('departmentId', departmentId);
```

and in `commitLimits`:

```ts
const result = await setStaffLimits(
  null,
  limitsFormData(row.staffId, view.departmentId, view.year, next)
);
```

- [ ] **Step 3: Add the badge**

In the name cell, directly after `{row.name}`:

```tsx
{
  row.isPartTime && (
    <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Сумісник
    </span>
  );
}
```

A muted pill, not a coloured row: colour marks a series on a chart or a small state indicator, and «works here part-time» is neither an error nor a warning.

- [ ] **Step 4: Verify by hand in the browser**

The user starts `pnpm dev` themselves — ask them to, then open `/stakes/<id>` for a кафедра with a сумісник (create one first via `/staff/<id>/edit` once Task 10 lands; until then, add a `StaffDepartment` row in `pnpm db:studio`).

Confirm: the badge renders, the row sits at the bottom, its Макс field shows `0,25`, and editing a cap saves without «Невірні дані».

- [ ] **Step 5: Run the checks**

Run:

```bash
pnpm type-check
pnpm lint
```

- [ ] **Step 6: Commit**

Files: `components/stake/distribution-grid.tsx`

Message:

```
feat(stakes): badge сумісники in the distribution grid

A muted pill on the name, and the limits form now names which кафедра's
bounds it is editing — without that every cap edit was «Невірні дані».
```

---

### Task 8: Two кафедри maximum, and the audit log can name the field

**Files:**

- Modify: `validations/staff.ts` (the `partTimeDepartmentIds` field and the `superRefine`)
- Modify: `lib/labels.ts` (`FIELD_LABELS`)
- Test: `validations/staff.test.ts` (create if absent)

**Interfaces:**

- Consumes: nothing.
- Produces: `staffUpdateSchema` rejecting more than one additional кафедра, and rejecting the primary кафедра as the additional one.

- [ ] **Step 1: Write the failing test**

Create or extend `validations/staff.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { staffUpdateSchema } from './staff';

/** A minimal valid НПП — every test varies one field off this. */
function base(overrides: Record<string, unknown> = {}) {
  return {
    lastName: 'Шевченко',
    firstName: 'Тарас',
    patronymic: 'Григорович',
    email: 'shevchenko@uhsp.edu.ua',
    isNpp: true,
    departmentId: 'd1',
    partTimeDepartmentIds: [],
    ...overrides,
  };
}

describe('partTimeDepartmentIds', () => {
  it('accepts none', () => {
    expect(staffUpdateSchema.safeParse(base()).success).toBe(true);
  });

  it('accepts exactly one', () => {
    expect(staffUpdateSchema.safeParse(base({ partTimeDepartmentIds: ['d2'] })).success).toBe(true);
  });

  it('refuses two — a person holds at most two кафедри in total', () => {
    const result = staffUpdateSchema.safeParse(base({ partTimeDepartmentIds: ['d2', 'd3'] }));
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe('НПП може працювати щонайбільше на двох кафедрах');
  });

  it('refuses the primary кафедра as the additional one', () => {
    const result = staffUpdateSchema.safeParse(base({ partTimeDepartmentIds: ['d1'] }));
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((i) => i.path[0] === 'partTimeDepartmentIds')).toBe(true);
  });
});
```

The `base()` shape must satisfy every required field on `staffUpdateSchema` — read `validations/staff.ts` and add whatever else it demands before running.

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm test validations/staff`
Expected: FAIL — two ids and a duplicate of the primary are both accepted.

- [ ] **Step 3: Implement**

In `validations/staff.ts`, replace the field:

```ts
    // At most one. A person holds two кафедри in total — their own and one
    // more (owner, 2026-08-24). Kept an array rather than a nullable string:
    // the join table is many-to-many, the action already diffs it as a set,
    // and «two» is a policy that can change without a migration.
    partTimeDepartmentIds: z
      .array(z.string())
      .max(1, { error: 'НПП може працювати щонайбільше на двох кафедрах' })
      .default([]),
```

and add to the existing `superRefine`, after the departmentId check:

```ts
if (data.departmentId && data.partTimeDepartmentIds.includes(data.departmentId)) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Додаткова кафедра не може збігатися з основною',
    path: ['partTimeDepartmentIds'],
  });
}
```

In `lib/labels.ts`, add to `FIELD_LABELS`:

```ts
  partTimeDepartmentIds: 'Додаткова кафедра',
```

Without it the audit log renders the raw field name for every сумісництво change — it has none today.

- [ ] **Step 4: Run the tests**

Run: `pnpm test validations/staff`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

Files: `validations/staff.ts`, `validations/staff.test.ts`, `lib/labels.ts`

Message:

```
feat(staff): cap сумісництво at one additional кафедра

Two кафедри in total, and the additional one may not be the primary
one. Adds the FIELD_LABELS entry the audit log has always been missing
for this field.
```

---

### Task 9: One select instead of a checkbox grid

**Files:**

- Modify: `components/staff/staff-form-fields.tsx` (the «Сумісництво» block, currently around lines 288-330)

**Interfaces:**

- Consumes: `staffUpdateSchema`'s one-element array (Task 8).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace the block**

Delete the whole `{isAdmin && (<div><p …>Сумісництво</p><Controller name="partTimeDepartmentIds" …/></div>)}` block, and instead add a second `FormField` **inside the existing `grid grid-cols-2 gap-4`**, directly after the «Основна кафедра» field — so the two кафедри sit side by side as the owner asked:

```tsx
{
  /* ADMIN only, like «Основна кафедра»'s neighbours: сумісництво
                decides who appears in a second кафедра's ставка grid, which is
                money, so an editor may see it and never set it. */
}
{
  isAdmin && (
    <FormField label="Додаткова кафедра" error={errors.partTimeDepartmentIds}>
      <Controller
        name="partTimeDepartmentIds"
        control={control}
        render={({ field }) => (
          <Select
            value={field.value[0] ?? ' '}
            onValueChange={(next) => field.onChange(next === ' ' ? [] : [next])}
            disabled={isPending}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=" ">—</SelectItem>
              {departments
                // Never their own кафедра: the schema refuses it, and
                // offering a choice that cannot be saved is worse
                // than not offering it.
                .filter((dept) => dept.id !== primaryDepartmentId)
                .map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.faculty?.name ? `${dept.faculty.name} — ` : ''}
                    {dept.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      />
    </FormField>
  );
}
```

The «Відділ» field currently occupies the second column of that grid. Move it onto its own row below, so the layout stays two-up: `Основна кафедра` + `Додаткова кафедра` on the first row, `Відділ` on the second.

- [ ] **Step 2: Watch the primary кафедра so the filter follows it**

Above the returned JSX, add:

```tsx
// So the «Додаткова кафедра» list drops whichever кафедра is chosen as the
// main one, the moment it changes.
const primaryDepartmentId = useWatch({ control, name: 'departmentId' });
```

Import `useWatch` from `react-hook-form` alongside `Controller`.

- [ ] **Step 3: Clear a now-illegal choice**

If somebody picks кафедра B as the additional one and then sets B as their primary, the form would hold an unsaveable value. Add, after the `useWatch`:

```tsx
  const setValue = /* the form's existing setValue, add it to the props/hook destructure */;
  useEffect(() => {
    if (primaryDepartmentId && getValues('partTimeDepartmentIds').includes(primaryDepartmentId)) {
      setValue('partTimeDepartmentIds', [], { shouldDirty: true });
    }
  }, [primaryDepartmentId, getValues, setValue]);
```

Read the component's existing hook destructure first and add `setValue` and `getValues` to it rather than introducing a second `useFormContext`/`useForm` call.

- [ ] **Step 4: Verify by hand**

Ask the user to run `pnpm dev`, then on `/staff/<id>/edit`:

- «Додаткова кафедра» sits beside «Основна кафедра» and offers «—».
- The кафедра chosen as main is absent from the additional list.
- Choosing an additional кафедра, saving, and reloading keeps it.
- Choosing «—» clears it, and the person disappears from that кафедра's grid.

- [ ] **Step 5: Run the checks**

Run:

```bash
pnpm type-check
pnpm lint
pnpm test
```

- [ ] **Step 6: Commit**

Files: `components/staff/staff-form-fields.tsx`

Message:

```
feat(staff): choose the additional кафедра from a select

A checkbox grid over 31 кафедри invited a person to tick five. One
select beside «Основна кафедра», which is the shape the rule now has,
and it cannot offer the кафедра already chosen as the main one.
```

---

### Task 10: `/staff` finds and marks them

**Files:**

- Modify: `lib/queries/list-staff.ts`
- Modify: `components/staff/staff-table.tsx` (the «Кафедра» cell)
- Test: `lib/queries/list-staff.test.ts` (create if absent; otherwise extend)

**Interfaces:**

- Consumes: `onDepartment` (Task 1).
- Produces: `StaffListItem` gains `partTimeDepartments: { department: { name: string } }[]`.

- [ ] **Step 1: Write the failing test**

Assert two things against a mocked `db.staff.findMany`:

```ts
it('finds сумісники when filtering by кафедра', async () => {
  await listStaff({ departmentId: 'd1' });
  const conditions = (db.staff.findMany as unknown as Mock).mock.calls[0][0].where.AND;
  expect(conditions).toContainEqual({
    OR: [{ departmentId: 'd1' }, { partTimeDepartments: { some: { departmentId: 'd1' } } }],
  });
});

it('returns each person once, however many кафедри they hold', async () => {
  // A `some` filter cannot duplicate a row — this pins that the query stays a
  // filter and never becomes a join over StaffDepartment.
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm test list-staff`
Expected: FAIL — the condition is `{ departmentId: 'd1' }`.

- [ ] **Step 3: Implement**

In `lib/queries/list-staff.ts`, replace the кафедра filter:

```ts
// Primary or сумісник — filtering by кафедра must find everyone the кафедра
// actually has, which is what its ставка grid will show.
if (filters?.departmentId) conditions.push(onDepartment(filters.departmentId));
```

and add to the `select`:

```ts
      partTimeDepartments: { select: { department: { select: { name: true } } } },
```

Import `onDepartment` beside `ON_ROSTER, REAL_PEOPLE`.

- [ ] **Step 4: Mark the cell**

In `components/staff/staff-table.tsx`, in the «Кафедра» cell, after the primary кафедра's name:

```tsx
{
  person.partTimeDepartments.length > 0 && (
    <span className="ml-1.5 text-xs text-muted-foreground">
      + {person.partTimeDepartments[0].department.name}
    </span>
  );
}
```

Read the cell first — if it currently renders `person.department?.name ?? person.division?.name ?? '—'`, keep that expression and append this beside it.

- [ ] **Step 5: Run everything**

Run:

```bash
pnpm test list-staff
pnpm type-check
```

- [ ] **Step 6: Commit**

Files: `lib/queries/list-staff.ts`, `lib/queries/list-staff.test.ts`, `components/staff/staff-table.tsx`

Message:

```
feat(staff): show and find people on their additional кафедра

Filtering /staff by кафедра now returns its сумісники, and the кафедра
cell names the second one.
```

---

### Task 11: `/rating` finds them, without duplicating the ranking

**Files:**

- Modify: `lib/queries/list-ratings.ts`
- Modify: `app/(dashboard)/rating/page.tsx` (or the row component it renders — find it in Step 1)
- Test: `lib/queries/list-ratings.test.ts` (create if absent; otherwise extend)

**Interfaces:**

- Consumes: `onDepartment` (Task 1).
- Produces: `RatingRow` gains `partTimeDepartments: string[]` — кафедра names, possibly empty.

- [ ] **Step 1: Locate the row rendering**

Run: `grep -n "department\b" "app/(dashboard)/rating/page.tsx" components/rating/*.tsx | head -20`

- [ ] **Step 2: Write the failing test**

```ts
it('finds сумісники when filtering by кафедра', async () => {
  await listRatings({ year: 2026, departmentId: 'd1' });
  const conditions = (db.staff.findMany as unknown as Mock).mock.calls[0][0].where.AND;
  expect(conditions).toContainEqual({
    OR: [{ departmentId: 'd1' }, { partTimeDepartments: { some: { departmentId: 'd1' } } }],
  });
});

it('names their additional кафедра on the row', async () => {
  // Mocked person with partTimeDepartments: [{ department: { name: 'Кафедра екології' } }]
  // → row.partTimeDepartments === ['Кафедра екології']
});

it('leaves the unfiltered ranking one row per person', async () => {
  // Two people, one of them a сумісник elsewhere → 2 rows, not 3. The
  // university ranking must never list somebody twice.
});
```

- [ ] **Step 3: Implement**

In `lib/queries/list-ratings.ts`:

```ts
// Primary or сумісник. Note this only widens the FILTERED view — the
// unfiltered university ranking is still one row per person, because a
// `some` filter selects people, it does not multiply them. Listing somebody
// twice would break the ranking, which is the whole point of the page.
if (filters.departmentId) conditions.push(onDepartment(filters.departmentId));
```

Add to the `select`:

```ts
      partTimeDepartments: { select: { department: { select: { name: true } } } },
```

and to the row map:

```ts
      partTimeDepartments: s.partTimeDepartments.map((p) => p.department.name),
```

Import `onDepartment` beside `ON_ROSTER, REAL_PEOPLE`.

- [ ] **Step 4: Badge the row**

In the кафедра cell of the rating table, after the кафедра name:

```tsx
{
  row.partTimeDepartments.length > 0 && (
    <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Сумісник
    </span>
  );
}
```

- [ ] **Step 5: Run everything**

Run:

```bash
pnpm test list-ratings
pnpm type-check
```

- [ ] **Step 6: Commit**

Files: `lib/queries/list-ratings.ts`, `lib/queries/list-ratings.test.ts`, and the rating row component

Message:

```
feat(rating): find сумісники when filtering by кафедра

The кафедра filter now returns them, badged. The unfiltered university
ranking stays one row per person — a `some` filter selects people, it
does not multiply them.
```

---

### Task 12: `/my-department` shows them to the head who pays them

`listMyDepartments` reads through the `primaryStaff` relation, which cannot express `onDepartment`. It gets one staff query and a bucketing pass instead — a person lands in two buckets.

**Files:**

- Modify: `lib/queries/list-my-department.ts`
- Modify: the component rendering `MyDepartment['staff']` — find it in Step 1
- Test: `lib/queries/list-my-department.test.ts` (create)

**Interfaces:**

- Consumes: `onDepartments` (Task 1), `scopeOf`.
- Produces: `MyDepartment['staff'][number]` gains `isPartTime: boolean`.

- [ ] **Step 1: Find the consumer**

Run: `grep -rn "listMyDepartments\|MyDepartment" --include=*.tsx app components`

- [ ] **Step 2: Write the failing test**

```ts
it('shows a сумісник to the head of the кафедра they also work for', async () => {
  // scopeOf → ['d1']; one person with departmentId 'd2' and a StaffDepartment
  // row on 'd1' → they appear in d1's staff list with isPartTime true.
});

it('shows the same person to their own head as a primary member', async () => {
  // scopeOf → ['d2'] → isPartTime false.
});

it('lists a декан’s two кафедри with the same person in both', async () => {
  // scopeOf → ['d1','d2'] → the сумісник appears once under each.
});

it('sorts сумісники last, then by total descending', async () => {
  // A сумісник on 9000 still comes after a primary member on 100.
});
```

- [ ] **Step 3: Implement**

Replace the body of `listMyDepartments`:

```ts
export async function listMyDepartments(staffId: string | null | undefined, year: number) {
  const departmentIds = await scopeOf(staffId);
  if (departmentIds.length === 0) return [];

  // Two reads rather than a nested relation: `primaryStaff` cannot express
  // «or a сумісник here», and a сумісник has to appear under BOTH кафедри —
  // which a relation filter cannot do either, because it would return them
  // once, under whichever кафедра owned the relation.
  const [departments, staff] = await Promise.all([
    db.department.findMany({
      where: { id: { in: departmentIds } },
      select: { id: true, name: true, faculty: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
    db.staff.findMany({
      where: { ...ON_ROSTER, isNpp: true, ...onDepartments(departmentIds) },
      select: {
        id: true,
        departmentId: true,
        partTimeDepartments: { select: { departmentId: true } },
        lastName: true,
        firstName: true,
        patronymic: true,
        academicRank: true,
        scientificDegree: true,
        ratingEntries: { where: { year }, select: { totalScore: true } },
      },
    }),
  ]);

  const inScope = new Set(departmentIds);
  const byDepartment = new Map<string, MyDepartmentStaff[]>();
  for (const id of departmentIds) byDepartment.set(id, []);

  for (const s of staff) {
    const person = {
      id: s.id,
      name: `${s.lastName} ${s.firstName} ${s.patronymic}`,
      academicRank: s.academicRank,
      scientificDegree: s.scientificDegree,
      total: s.ratingEntries[0]?.totalScore ?? 0,
    };

    if (s.departmentId && inScope.has(s.departmentId)) {
      byDepartment.get(s.departmentId)!.push({ ...person, isPartTime: false });
    }
    for (const { departmentId } of s.partTimeDepartments) {
      if (departmentId === s.departmentId || !inScope.has(departmentId)) continue;
      byDepartment.get(departmentId)!.push({ ...person, isPartTime: true });
    }
  }

  return departments.map((d) => ({
    id: d.id,
    name: d.name,
    faculty: d.faculty.name,
    // Сумісники as a block at the bottom, then the ranking order — which is the
    // order the ставка formula spreads a pool in, so it is the order a head
    // already thinks in.
    staff: (byDepartment.get(d.id) ?? []).sort(
      (a, b) =>
        Number(a.isPartTime) - Number(b.isPartTime) ||
        b.total - a.total ||
        a.name.localeCompare(b.name, 'uk')
    ),
  }));
}
```

Declare the row type above the function so the map is typed:

```ts
interface MyDepartmentStaff {
  id: string;
  name: string;
  academicRank: AcademicRank | null;
  scientificDegree: ScientificDegree | null;
  total: number;
  /** This кафедра is their additional one */
  isPartTime: boolean;
}
```

Import the two enums from `@/lib/generated/prisma/client`, and `onDepartments` beside `ON_ROSTER`.

- [ ] **Step 4: Badge the row in the component found in Step 1**

Use the badge markup from the vocabulary table at the top of this plan.

- [ ] **Step 5: Run everything**

Run:

```bash
pnpm test list-my-department
pnpm type-check
```

- [ ] **Step 6: Commit**

Files: `lib/queries/list-my-department.ts`, `lib/queries/list-my-department.test.ts`, the consuming component

Message:

```
feat(stakes): show сумісники on «Моя кафедра»

A head who pays somebody a ставка has to be able to see them. The
relation read could not express it — a сумісник has to appear under two
кафедри — so it is one staff query and a bucketing pass.
```

---

### Task 13: `/departments/[id]` — the roster bug, and the rest of the counts

The кафедра page already badges сумісники. It has never filtered archived or system rows out of either list, and this feature makes that visible.

**Files:**

- Modify: `app/(dashboard)/departments/[id]/page.tsx`
- Modify: `app/(dashboard)/faculties/[id]/page.tsx:36` (`_count.primaryStaff`)
- Modify: `lib/queries/get-dashboard.ts` (~lines 98, 143-147)
- Modify: `lib/queries/get-rating-chart.ts` (lines 78-92, 117-140, 184-199)

**Interfaces:**

- Consumes: `ON_ROSTER`, `onDepartment` (Task 1).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Fix the кафедра page's two lists**

In `app/(dashboard)/departments/[id]/page.tsx`, add the roster filter to both:

```ts
      primaryStaff: {
        // Archived people — someone on декретна відпустка — are off the roster
        // and out of every other list in the app. This one never filtered them,
        // so they showed here and in «N основних · M сумісників» (2026-08-24).
        where: ON_ROSTER,
        select: { … },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      },
      partTimeStaff: {
        where: { staff: ON_ROSTER },
        select: { staff: { select: { … } } },
      },
```

Import `ON_ROSTER` from `@/lib/queries/roster`.

- [ ] **Step 2: Faculty page — count сумісники too**

`_count: { select: { primaryStaff: true } }` counts own staff only and includes archived ones. Replace with a filtered count:

```ts
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              primaryStaff: { where: ON_ROSTER },
              partTimeStaff: { where: { staff: ON_ROSTER } },
            },
          },
        },
```

and at line ~130:

```tsx
{
  dept._count.primaryStaff + dept._count.partTimeStaff;
}
НПП;
```

- [ ] **Step 3: Dashboard tree**

In `lib/queries/get-dashboard.ts`, the loop at ~143 buckets each person by `member.departmentId` alone. Add `partTimeDepartments: { select: { departmentId: true } }` to the select at ~98, and after the primary bucketing:

```ts
    // A сумісник counts on both кафедри — both pay them, and both include them
    // in «N НПП» (2026-08-24).
    for (const { departmentId } of member.partTimeDepartments) {
      if (departmentId === member.departmentId) continue;
      const extra = byDepartment.get(departmentId) ?? { count: 0, sum: 0 };
      extra.count += 1;
      extra.sum += /* the same value the primary branch adds */;
      byDepartment.set(departmentId, extra);
    }
```

Read the primary branch first and mirror exactly what it adds to `sum`.

- [ ] **Step 4: Rating charts**

`lib/queries/get-rating-chart.ts` uses `primaryStaff` in three places. Each is a per-кафедра average or list, so each must include сумісники. Replace the nested relation read with a `db.staff.findMany({ where: { ...ON_ROSTER, isNpp: true, ...onDepartments(ids) } })` plus bucketing, mirroring Task 12's shape — a person contributes to the average of **both** кафедри.

Read all three sites before editing; they differ (one is university-wide, one is a single кафедра, one builds `ReportStaff[]`).

- [ ] **Step 5: The Excel export needs no change — confirm, do not edit**

`app/api/export/ratings/route.ts` prints one form per person and reads `staff.department?.name` for
that person's own кафедра. It does not group by кафедра and has no `departmentId` filter, so a
сумісник gets one form naming their primary кафедра — which is correct: the form is their rating,
and their rating is one number. Confirm with
`grep -n "departmentId\|department" app/api/export/ratings/route.ts` and move on.

- [ ] **Step 6: Verify by hand**

Ask the user to run `pnpm dev` and check, for a кафедра with a сумісник:

- `/departments/<id>` — «N основних · M сумісників» matches the table, and nobody archived is in it.
- `/faculties/<id>` — the кафедра's «N НПП» went up by one.
- `/dashboard` — the same кафедра's count and average moved.

- [ ] **Step 7: Run the checks**

Run:

```bash
pnpm test
pnpm type-check
pnpm lint
```

- [ ] **Step 8: Commit**

Files: the four files above

Message:

```
fix(department): keep archived people out of the кафедра page

Neither list on /departments/[id] filtered the roster, so someone on
декретна відпустка still appeared and was counted. Both do now.

The faculty page, the dashboard tree and the rating charts also count
сумісники on the кафедра they work for.
```

---

### Task 14: The «Ставка» note on a profile

**Files:**

- Modify: `lib/queries/get-staff.ts` (add the allocations read)
- Modify: `app/(dashboard)/staff/[id]/page.tsx` (~line 199)
- Modify: `app/(dashboard)/profile/page.tsx` (~line 217)
- Test: `lib/queries/get-staff.test.ts` (create if absent; otherwise extend)

**Interfaces:**

- Consumes: `getActiveTemplate` (for the year), `formatStakeValue`.
- Produces: on the staff detail shape, `stakeBreakdown: { departmentId: string; department: string; hundredths: number }[]`, primary кафедра first.

- [ ] **Step 1: Understand what the field already is**

`Staff.employmentRate` is **not** a hand-typed contract rate any more, and this changes the note.
`saveDistribution` writes it from the head's own number, and after Task 6 it holds the person's
**total across every кафедра**. So the field and the note now describe the same money: the field is
the sum, the note says where the parts came from. That is exactly the shape the owner asked for —
«simple rate field, just add a note under it saying where it comes from».

Two consequences to respect:

- The note reads `StakeAllocation` for the active year, the same rows the field was computed from,
  so the parts always add up to the whole.
- Until a head fills their grid there are no allocations and no note. Render nothing rather than
  «0,00» — a кафедра that has not been spread yet is not a кафедра paying zero.

- [ ] **Step 2: Write the failing test**

```ts
it('names one кафедра when the person holds one post', async () => {
  // One allocation of 90 on «Кафедра ботаніки»
  // → [{ department: 'Кафедра ботаніки', hundredths: 90 }]
});

it('names both when they are a сумісник', async () => {
  // 90 on ботаніки + 25 on екології, primary кафедра first.
});

it('is empty when no head has filled a grid yet', async () => {
  // No allocations → []. The component renders no note rather than «0,00»:
  // a кафедра nobody has spread yet is not a кафедра paying zero.
});

it('puts the primary кафедра first', async () => {
  // Allocations arriving екології-then-ботаніки for somebody whose
  // departmentId is ботаніки → ботаніки first, so the note reads in the
  // order «основна + додаткова».
});
```

- [ ] **Step 3: Read the allocations**

In `lib/queries/get-staff.ts`, add to the select:

```ts
      // What the кафедри actually spread this year, per кафедра. Separate from
      // `employmentRate`, which is the contract rate somebody types — the two
      // can differ while a head has not filled their grid, and presenting one
      // as a breakdown of the other would make normal timing look like an error.
      allocations: {
        where: { distribution: { year } },
        select: {
          proposedHundredths: true,
          distribution: { select: { department: { select: { id: true, name: true } } } },
        },
      },
```

and map it into `stakeBreakdown`, with the person's primary кафедра first:

```ts
const stakeBreakdown = row.allocations
  .map((a) => ({
    departmentId: a.distribution.department.id,
    department: a.distribution.department.name,
    hundredths: a.proposedHundredths,
  }))
  .sort(
    (a, b) =>
      Number(b.departmentId === row.departmentId) - Number(a.departmentId === row.departmentId) ||
      a.department.localeCompare(b.department, 'uk')
  );
```

The function needs the active year — read `getActiveTemplate()` inside it, or take a `year` parameter if its callers already have one. Check both call sites before choosing.

- [ ] **Step 4: Render the note**

On both pages, below the existing «Ставка» `Field`:

```tsx
{
  staff.stakeBreakdown.length > 0 && (
    <p className="mt-1 text-xs text-muted-foreground">
      Розподілено:{' '}
      {staff.stakeBreakdown
        .map((s) => `${s.department} — ${formatStake(s.hundredths)}`)
        .join(' + ')}
    </p>
  );
}
```

`formatStake` lives in `lib/stake/units.ts` and renders hundredths as «0,90». If the `Field` component cannot hold a second line, render the note as a sibling directly after it inside the same `InfoCard`.

The label reads «Розподілено» because that is what the parts are — what each кафедра's head
actually spread. It is a breakdown of the field above it, and after Task 6 the two genuinely agree.

**Visibility follows the existing rule for `employmentRate`:** on `/staff/[id]` the note sits inside the same `{showConfidential && …}` guard; on `/profile` it is the person's own page and needs no extra guard.

- [ ] **Step 5: Verify by hand**

Ask the user to run `pnpm dev` and open a сумісник's profile: the note names both кафедри and the two numbers, in the order primary-then-additional.

- [ ] **Step 6: Run the checks**

Run:

```bash
pnpm test
pnpm type-check
pnpm lint
```

- [ ] **Step 7: Commit**

Files: `lib/queries/get-staff.ts`, `lib/queries/get-staff.test.ts`, `app/(dashboard)/staff/[id]/page.tsx`, `app/(dashboard)/profile/page.tsx`

Message:

```
feat(profile): say which кафедри a person's ставка comes from

«Кафедра ботаніки — 0,90 + Кафедра екології — 0,25» under the existing
field, which since the distribution began writing it is the person's
total across both кафедри. The field is the sum; the note is the parts.

Nothing renders until a head has filled a grid — a кафедра nobody has
spread yet is not a кафедра paying 0,00.
```

---

### Task 15: Make the documents stop asserting the old rule

Four places state in prose that a сумісник is paid by their primary кафедра only. They are the first thing anybody reads.

**Files:**

- Modify: `docs/open-questions.md` (Q12, ~line 197)
- Modify: `docs/stake-distribution.md` (the «Сумісництво (Q12)» paragraph, ~line 292)
- Modify: `CLAUDE.md` (the university-structure section and the «Розподіл ставок» section)
- Modify: `lib/queries/get-department-knpp.ts` — already done in Task 4; verify no stale wording survives

**Interfaces:** none.

- [ ] **Step 1: Q12 moves from assumed to answered**

In `docs/open-questions.md`, replace the Q12 block:

```markdown
**Q12.** Сумісництво — if an НПП works in two departments, which one gets a bonus? ✅ ANSWERED 2026-08-24

> **Both.** Reported by the university as missing functionality: an НПП may hold posts on two
> кафедри and both are expected to pay them a ставка. The 2026-08-04 answer — primary only, one
> Vc — was recorded as an assumption and turned out wrong.
>
> The сумісник is a full member of the second кафедра's formula with their whole university
> rating, capped at 0,25 by default; the two ставки are independent and may exceed 1,00; they
> count toward `Кст ≥ 0,1 × N` but never toward `Кнпп`; and the бонус shows on both grids so each
> head sees the whole picture. Design:
> [`superpowers/specs/2026-08-24-sumisnytstvo-design.md`](./superpowers/specs/2026-08-24-sumisnytstvo-design.md).
```

- [ ] **Step 2: Rewrite the ставка paragraph**

In `docs/stake-distribution.md`, replace the «Сумісництво (Q12) — assumed, not confirmed» paragraph with:

```markdown
**Сумісництво — an НПП on two кафедри (2026-08-24).** Both кафедри pay them. The
сумісник joins the second кафедра's formula with their **whole** university
rating — there is no per-кафедра rating and nothing to type — and is capped at
**0,25** there by default, a bound ADMIN sets per person per кафедра. Their
`StaffStakeLimits` row carries a `departmentId` for exactly this: the two
ceilings never inherit from one another.

Two figures part company over it. `headcount` counts сумісники, because they get
a row in the grid and a 0,10 floor, so `Кст ≥ 0,1 × N` has to cover them. `Кнпп`
does not: it is the п.38 licence figure and one person cannot be claimed by two
кафедри. The бонус appears on **both** grids — it is a signal about the person,
and a head who sees that this сумісник filled their own programmes can weigh it.

This replaces the primary-only assumption recorded on 2026-08-04, which was
never confirmed and was reported wrong by the university.
```

- [ ] **Step 3: `CLAUDE.md`**

In the «University structure» section, after the `StaffDepartment` sentence, add:

```markdown
- A сумісник is paid a ставка by **both** кафедри (2026-08-24). They appear in
  both кафедри's lists and in both distribution grids, badged «Сумісник» and
  sorted last, with their whole university rating and a 0,25 default ceiling on
  the additional one. At most two кафедри per person, enforced in validation.
```

In the «Розподіл ставок» rules list, add:

```markdown
- **A person's Мін/Макс is per кафедра, not per person.** `StaffStakeLimits`
  carries a `departmentId`, and the additional кафедра never inherits the
  primary one's bounds — the lookup is scoped and the fallback is
  `PART_TIME_LIMITS` (0,10–0,25), not `DEFAULT_LIMITS`.
```

- [ ] **Step 4: Check nothing stale survives**

Run:

```bash
grep -rn "primary кафедра only\|one Vc\|Primary кафедра only" docs lib app components CLAUDE.md
```

Expected: no hit asserts the old rule. Any that remains is either updated or, if it is describing `Кнпп` specifically, correct as it stands — read it before changing it.

- [ ] **Step 5: Commit**

Files: `docs/open-questions.md`, `docs/stake-distribution.md`, `CLAUDE.md`

Message:

```
docs(stakes): record that both кафедри pay a сумісник

Q12 moves from ⚠️ ASSUMED to ✅ ANSWERED with the answer reversed. Three
documents asserted the primary-only rule in prose and were the first
thing anybody read.
```

---

## Before this ships

Not code, and not optional. From the spec's «Risk to existing production data».

- [ ] **Run the pre-deploy check against production.** Validation now caps a person at one additional кафедра, so anyone already over it could not be saved from the staff form.

```sql
SELECT "staffId", count(*) FROM "StaffDepartment" GROUP BY "staffId" HAVING count(*) > 1;
```

Expected: zero rows. No seed or import has ever written a `StaffDepartment` row, so one exists only if somebody typed it.

- [ ] **Back up production**, then **restore that backup into a scratch database and run the migration there first.** The migration has a hand-written backfill; the rehearsal is what catches a problem before the live run, and the backup is the fallback if it does not. Production backups are Coolify's custom format — `pg_restore`, not `psql`. See `docs/deployment.md` §7.

- [ ] **Tell the кадри office the feature is inert until they use it.** We have no list of сумісники and this change invents none. Nothing on any screen differs until somebody picks an «Додаткова кафедра».

- [ ] **Warn the проректор that some кафедри may turn amber on `/stakes`.** Adding a сумісник raises that кафедра's pool minimum by 0,10, so a `Кст` saved at exactly its old floor drops below the new one. It surfaces on read as «нижче мінімуму»; the fix is to raise the pool.
