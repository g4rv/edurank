# Science-plan rules (D36–D46) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the owner's 2026-09-23 decisions to планування наукової роботи — a grantable oversight flag, the factual target, URL-only publications, the execution month with its age fence, and the НПП's own corrections — so the analytics (next plan) can be built on them.

**Architecture:** Every rule is a column or a pure function in `lib/science/`, checked again inside the server action that writes. Two migrations carry data with them (the ННВ flag, URL-only codes, the month backfill), so every environment — dev, a cloned year, production — gets the same state without a one-off script.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (Postgres 16), Zod, Vitest, shadcn/«Аврора» components.

**Spec:** `docs/superpowers/specs/2026-09-15-science-plan-design.md` — section **«D36–D46 — the owner's answers, 2026-09-23»**. Read it and D14–D29 before starting. The analytics that follow this plan are `docs/superpowers/specs/2026-09-22-science-analytics-design.md`.

## Global Constraints

- Hours are **INTEGER HUNDREDTHS OF AN HOUR**, never a float — in the DB and in every sum.
- Every SUM over `hoursHundredths` filters `status: 'APPROVED'`.
- A year is **never** taken from client input — `resolveActor` resolves the OPEN template.
- All UI text in Ukrainian. Errors never show an id or code to the person.
- Write failures go through `parseDbError(e, 'Ukrainian message', 'science.<action>', { userId })`.
- Every mutation writes an `AuditLog` row with `diffChanges`; every new diffed field gets a label in `FIELD_LABELS` (`lib/labels.ts`).
- Status colour only through tokens (`--success`/`--warning`/`--error`), never Tailwind palette classes. Read `docs/aurora.md` before any UI step.
- Even sizes only — no 13/15/17/23.
- Tests colocated as `*.test.ts` next to the file they cover. Run one file with `pnpm test <path>`.
- **Commits: the owner decides when.** Each task ends with «ask, then `/commit`» — never a raw `git commit`. The two uncommitted stake files (`components/stake/second-stage-note.tsx`, `components/stake/students-header.tsx`) are the owner's — never stage them.
- The owner runs `pnpm dev` and Docker. Do not start them. After `pnpm db:generate`, tell the owner to restart `pnpm dev` (it holds the old Prisma client).

---

## File map

| file                                                                                                                   | change                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                                                                                 | `Division.canOverseeScience`, `ScienceWorkType.linkRule` + `fileRule`, `SciencePlanTemplate.maxLookbackMonths`, `ScienceWork.executedMonth` |
| `prisma/migrations/…_science_oversight_flag/`                                                                          | column + ННВ = true                                                                                                                         |
| `prisma/migrations/…_science_proof_rules/`                                                                             | `ProofRule` enum, `linkRule`/`fileRule`, the eight link-only codes, drop `requiresFile`                                                     |
| `prisma/migrations/…_science_execution_month/`                                                                         | `maxLookbackMonths`, `executedMonth` + backfill                                                                                             |
| `lib/science/oversight.ts` (+ new test)                                                                                | `isNnvOversight` → `canOverseeScience`, reads the flag                                                                                      |
| `lib/science/target.ts` (+ test)                                                                                       | `doneTargetHundredths`, D37 shortfall                                                                                                       |
| `lib/science/evidence-rule.ts` (+ test)                                                                                | `linkRule`/`fileRule`                                                                                                                       |
| `lib/science/execution-month.ts` (new, + test)                                                                         | month keys, options, the fence, labels                                                                                                      |
| `app/(dashboard)/science-plan/record-actions.ts` (+ test)                                                              | month, URL-only, `updateRecordHours`                                                                                                        |
| `app/(dashboard)/science-plan/file-actions.ts` (+ test)                                                                | link-only refusal; uploader may change a file; `replaceFile`                                                                                |
| `app/(dashboard)/admin/science-plan/actions.ts` (+ test)                                                               | lookback on create/clone, `updateScienceYearSettings`                                                                                       |
| `app/(dashboard)/admin/science-plan/[id]/actions.ts`, `validations/science-work-type.ts`, `components/science/admin/*` | `linkRule`/`fileRule` switch                                                                                                                |
| `app/(dashboard)/divisions/*`, `validations/division.ts`, `components/division/division-form.tsx`                      | oversight switch                                                                                                                            |
| `components/science/month-select.tsx` (new)                                                                            | the month picker                                                                                                                            |
| `components/science/edit-hours-dialog.tsx` (new)                                                                       | «Моя частка»                                                                                                                                |
| `components/science/replace-file-dialog.tsx` (new)                                                                     | «Замінити»                                                                                                                                  |
| `components/science/{add-record-dialog,edit-record-dialog,record-list,plan-header}.tsx`                                | wire it all                                                                                                                                 |
| `lib/queries/{get-science-plan,get-science-template,list-science-records}.ts`                                          | new fields                                                                                                                                  |
| `app/(dashboard)/my-department/science-plans/`                                                                         | **deleted**                                                                                                                                 |
| `components/sidebar.tsx`, `app/(dashboard)/layout.tsx`                                                                 | nav                                                                                                                                         |
| `CLAUDE.md`, `docs/work-remaining.md`                                                                                  | docs                                                                                                                                        |

---

### Task 1: Oversight becomes a division flag (D43)

**Files:**

- Modify: `prisma/schema.prisma` (model `Division`, after `canModerateRating`)
- Create: `prisma/migrations/<timestamp>_science_oversight_flag/migration.sql`
- Modify: `lib/science/oversight.ts`
- Create: `lib/science/oversight.test.ts`
- Modify: `validations/division.ts`, `components/division/division-form.tsx`, `app/(dashboard)/divisions/actions.ts`, `app/(dashboard)/divisions/[id]/edit/page.tsx`, `lib/labels.ts`
- Modify: `prisma/catalogue.ts:67-71`, `prisma/core-data.ts:28`, `prisma/core-export.ts:144`
- Modify (rename callers): `app/(dashboard)/layout.tsx`, `app/(dashboard)/moderation/page.tsx`, `app/(dashboard)/moderation/science-actions.ts`, `app/(dashboard)/science-plan/file-actions.ts`, `app/(dashboard)/science-plans/actions.ts`, `app/(dashboard)/science-plans/page.tsx`
- Modify tests: `app/(dashboard)/moderation/science-actions.test.ts`, and any other test grep finds mocking `db.division.findUnique` for ННВ

**Interfaces:**

- Produces: `canOverseeScience(user: { role: Role; staffId?: string | null }): Promise<boolean>` in `lib/science/oversight.ts`. `isNnvOversight` no longer exists.

- [ ] **Step 1: Schema**

In `model Division`, directly under `canModerateRating`:

```prisma
  // May this division's editors oversee наукова робота — read every plan and
  // record, open evidence files, decline a record, unlock a plan? D43 (owner,
  // 2026-09-23): a switch ADMIN sets, like canModerateRating. The migration
  // turns it on for ННВ. ADMIN always oversees and needs no row here.
  canOverseeScience Boolean @default(false)
```

- [ ] **Step 2: Migration with its data**

Run: `pnpm prisma migrate dev --create-only --name science_oversight_flag`
Open the generated `migration.sql` and make it exactly:

```sql
ALTER TABLE "Division" ADD COLUMN "canOverseeScience" BOOLEAN NOT NULL DEFAULT false;

-- D43: the right used to be hard-coded to ННВ by registryKey. Carry it over so
-- nobody loses access on deploy.
UPDATE "Division" SET "canOverseeScience" = true WHERE "registryKey" = 'NNV';
```

Run: `pnpm db:migrate` then `pnpm db:generate`. Tell the owner to restart `pnpm dev`.

- [ ] **Step 3: Write the failing test** — `lib/science/oversight.test.ts`

```ts
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { staff: { findUnique: vi.fn() } } }));

import { db } from '@/lib/db';
import { canOverseeScience } from './oversight';

const findStaff = db.staff.findUnique as unknown as Mock;

beforeEach(() => vi.clearAllMocks());

describe('canOverseeScience', () => {
  it('lets ADMIN in without a query', async () => {
    expect(await canOverseeScience({ role: 'ADMIN', staffId: 's1' })).toBe(true);
    expect(findStaff).not.toHaveBeenCalled();
  });

  it('lets in an EDITOR whose division carries the flag', async () => {
    findStaff.mockResolvedValue({ division: { canOverseeScience: true } });
    expect(await canOverseeScience({ role: 'EDITOR', staffId: 's1' })).toBe(true);
  });

  it('refuses an EDITOR whose division does not', async () => {
    findStaff.mockResolvedValue({ division: { canOverseeScience: false } });
    expect(await canOverseeScience({ role: 'EDITOR', staffId: 's1' })).toBe(false);
  });

  it('refuses an EDITOR with no division', async () => {
    findStaff.mockResolvedValue({ division: null });
    expect(await canOverseeScience({ role: 'EDITOR', staffId: 's1' })).toBe(false);
  });

  it('refuses a USER even if their row says otherwise', async () => {
    findStaff.mockResolvedValue({ division: { canOverseeScience: true } });
    expect(await canOverseeScience({ role: 'USER', staffId: 's1' })).toBe(false);
  });
});
```

- [ ] **Step 4: Run it — expect FAIL** (`canOverseeScience` is not exported)

Run: `pnpm test lib/science/oversight.test.ts`

- [ ] **Step 5: Replace the helper** — `lib/science/oversight.ts`, whole file:

```ts
import { db } from '@/lib/db';
import type { Role } from '@/lib/generated/prisma/client';

/**
 * Who oversees наукова робота: ADMIN, or an EDITOR whose division carries
 * `canOverseeScience` (D43, owner 2026-09-23).
 *
 * This used to be ННВ by `registryKey`, deliberately NOT a grantable flag, on
 * the reading that наказ №152 п.3 names ННВ. The owner reversed it: the right
 * is now a switch on `/divisions/[id]/edit`, and the migration that added it
 * turned it on for ННВ, so nobody lost access on deploy.
 *
 * Shape mirrors `canModerateRating` (`lib/rating/moderation.ts`) on purpose —
 * two division rights, read the same way. They stay separate flags: rating
 * moderation and science oversight may be given to different divisions.
 *
 * Callers: the dashboard nav, `/science-plans`, `/moderation`'s science
 * section, `fileUrl`, `unlockPlan` — every one enforces it server-side again.
 */
export async function canOverseeScience(user: {
  role: Role;
  staffId?: string | null;
}): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'EDITOR' || !user.staffId) return false;

  const staff = await db.staff.findUnique({
    where: { id: user.staffId },
    select: { division: { select: { canOverseeScience: true } } },
  });
  return staff?.division?.canOverseeScience === true;
}
```

- [ ] **Step 6: Run it — expect PASS**

Run: `pnpm test lib/science/oversight.test.ts`

- [ ] **Step 7: Rename every caller**

Run: `grep -rn "isNnvOversight" app lib components` and replace each import and call with `canOverseeScience`. In the comments beside them, replace «ННВ by registryKey» / «exactly ННВ's editors» wording with «the division flag `canOverseeScience` (D43)». The comment in `app/(dashboard)/layout.tsx:37-41` and `app/(dashboard)/science-plans/page.tsx:27-38` both argue the OLD rule — rewrite them to one line each pointing at `lib/science/oversight.ts`.

- [ ] **Step 8: Fix the test mocks that drove the old guard**

`app/(dashboard)/moderation/science-actions.test.ts` mocks `db.division.findUnique` (`mockDivisionFind`) and `db.staff.findUnique` returning `{ divisionId }`. The new guard reads `db.staff.findUnique` → `{ division: { canOverseeScience } }`. Change the `beforeEach` to:

```ts
mockStaffFind.mockResolvedValue({ division: { canOverseeScience: true } });
```

and the «not ННВ» case to `mockStaffFind.mockResolvedValue({ division: { canOverseeScience: false } })`. Delete `mockDivisionFind` if nothing else uses it. Rename the test titles from «is not ННВ» / «IS ННВ» to «without the oversight flag» / «with the oversight flag». Repeat for any other test grep finds (`grep -rln "nnv-div\|registryKey: 'NNV'" app lib --include=*.test.ts`). If a test's `staff.findUnique` mock is shared with a different query in the action under test, use `mockResolvedValueOnce` in call order and say so in a comment.

- [ ] **Step 9: The division form, validation, actions**

`validations/division.ts` — add under `canModerateRating`:

```ts
  // D43 — grants this division's editors наукова робота oversight. ADMIN-only
  // to set, like everything else about a division.
  canOverseeScience: z.boolean().default(false),
```

`components/division/division-form.tsx` — `defaultValues: { name: '', canModerateRating: false, canOverseeScience: false, ...defaultValues }`, and after the existing moderation `<label>` add a second one:

```tsx
<label className="flex cursor-pointer items-start gap-3">
  <Controller
    name="canOverseeScience"
    control={control}
    render={({ field }) => (
      <Switch checked={!!field.value} disabled={isPending} onCheckedChange={field.onChange} />
    )}
  />
  <span className="text-sm">
    Перевірка науки
    <span className="block text-xs text-muted-foreground">
      Редактори цього відділу бачитимуть плани й виконання наукової роботи всіх НПП, відкриватимуть
      файли підтвердження та зможуть відхиляти записи
    </span>
  </span>
</label>
```

`app/(dashboard)/divisions/actions.ts` — in `createDivision` and `updateDivision`, every place that reads or writes `canModerateRating` (the `data`, the `select`, both sides of `diffChanges`) gets `canOverseeScience` beside it, same shape. Add `revalidatePath('/science-plans')` and `revalidatePath('/moderation')` to `revalidateDivisions` — the nav and both pages follow the flag.

`app/(dashboard)/divisions/[id]/edit/page.tsx` — select `canOverseeScience: true` and pass it in `defaultValues`.

`lib/labels.ts` — beside `canModerateRating: 'Модерація рейтингу',` add `canOverseeScience: 'Перевірка науки',`.

- [ ] **Step 10: Seed and core export**

`prisma/catalogue.ts:67-71` — beside `const canModerateRating = key === 'NNV';` add `const canOverseeScience = key === 'NNV';` and put it in both `update` and `create`.
`prisma/core-data.ts:28` — add `canOverseeScience?: boolean;` (optional: a `prod-core.json` written before this change has no such key).
`prisma/core-export.ts:144` — add `canOverseeScience: d.canOverseeScience,`. Find where core-data's divisions are upserted (`grep -n "canModerateRating" prisma/seed*.ts prisma/core*.ts`) and write `canOverseeScience: d.canOverseeScience ?? d.registryKey === 'NNV'` there.

- [ ] **Step 11: Divisions action test**

In `app/(dashboard)/divisions/actions.test.ts`, find the test that asserts the audit diff for `canModerateRating` and add a sibling asserting `canOverseeScience` is written and diffed. Run: `pnpm test "app/(dashboard)/divisions"` — PASS.

- [ ] **Step 12: Full check**

Run: `pnpm type-check && pnpm test` — all green.

- [ ] **Step 13: Ask the owner, then `/commit`** — `feat(science): make наукова робота oversight a division switch`

---

### Task 2: Remove the head's science view (D44)

**Files:**

- Delete: `app/(dashboard)/my-department/science-plans/page.tsx`, `app/(dashboard)/my-department/science-plans/loading.tsx`
- Modify: `components/sidebar.tsx:176-185`, `app/(dashboard)/admin/science-plan/actions.ts:17`, `app/(dashboard)/admin/science-plan/[id]/actions.ts:28`, `app/(dashboard)/science-plans/actions.ts:98`, `app/(dashboard)/science-plans/page.tsx` (comments), `app/(dashboard)/science-plans/loading.tsx` (comment)

- [ ] **Step 1: Delete the route**

Run: `git rm -r "app/(dashboard)/my-department/science-plans"`

- [ ] **Step 2: Remove the nav item** — in `components/sidebar.tsx`, delete the `management.push({ href: '/my-department/science-plans', … })` call and its comment inside `if (headsDepartment)`. Leave «Моя кафедра».

- [ ] **Step 3: Remove every `revalidatePath('/my-department/science-plans')`**

Run: `grep -rn "my-department/science-plans" app components lib` — delete each `revalidatePath` line, and rewrite each comment that mentions the page. In `app/(dashboard)/science-plans/page.tsx` the header comment calls it «the university-wide sibling of `/my-department/science-plans`» — replace with: «The only list of every person's plan. A завідувач and декан no longer have one (D44, owner 2026-09-23).» In the `canUnlock` comment, drop the sentence about the head's read.

- [ ] **Step 4: Check nothing still links there**

Run: `grep -rn "my-department/science-plans" .  --include=*.ts --include=*.tsx` — expect no output. Then `pnpm type-check && pnpm lint`.

- [ ] **Step 5: Ask the owner, then `/commit`** — `refactor(science): drop the head's read of the кафедра's plans`

---

### Task 3: The factual target (D37)

**Files:**

- Modify: `lib/science/target.ts`, `lib/science/target.test.ts`, `components/science/plan-header.tsx`

**Interfaces:**

- Produces: `PlanTarget.doneTargetHundredths: number | null` — `max(targetHundredths, plannedHundredths)`, null when there is no target. `doneShortfallHundredths` is now measured against it.

- [ ] **Step 1: Write the failing tests** — append to `lib/science/target.test.ts`:

```ts
describe('D37 — somebody owes what they planned', () => {
  it('owes the plan when the plan is above the norm', () => {
    const t = target(100, 70000, 50000); // plan 700, did 500
    expect(t.doneTargetHundredths).toBe(70000);
    expect(t.doneShortfallHundredths).toBe(20000);
  });

  it('still owes the norm when the plan is below it', () => {
    const t = target(100, 40000, 45000); // plan 400, did 450
    expect(t.doneTargetHundredths).toBe(50000);
    expect(t.doneShortfallHundredths).toBe(5000);
  });

  it('leaves the PLAN shortfall measured against the norm alone', () => {
    expect(target(100, 70000, 0).shortfallHundredths).toBe(0);
    expect(target(100, 40000, 0).shortfallHundredths).toBe(10000);
  });

  it('has no factual target without a ставка', () => {
    const t = target(null, 70000, 0);
    expect(t.doneTargetHundredths).toBeNull();
    expect(t.doneShortfallHundredths).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`doneTargetHundredths` undefined). `pnpm test lib/science/target.test.ts`

- [ ] **Step 3: Implement** — in `lib/science/target.ts`:

Add to `PlanTarget`, after `doneHundredths`:

```ts
/**
 * D37 (owner, 2026-09-23): what the FACT is measured against —
 * `max(targetHundredths, plannedHundredths)`. Plan 700 and you owe 700; plan
 * 400 and you still owe the 500 norm. The norm is a floor for the plan and
 * the plan is a promise for the fact. Null when there is no target.
 */
doneTargetHundredths: number | null;
```

In the `rateHundredths === null` branch add `doneTargetHundredths: null,`. In the other branch:

```ts
const targetHundredths = minHoursPerRate * rateHundredths;
const doneTargetHundredths = Math.max(targetHundredths, plannedHundredths);
return {
  rateHundredths,
  targetHundredths,
  plannedHundredths,
  shortfallHundredths: Math.max(0, targetHundredths - plannedHundredths),
  doneHundredths,
  doneTargetHundredths,
  doneShortfallHundredths: Math.max(0, doneTargetHundredths - doneHundredths),
};
```

`lib/queries/get-science-plan.ts` has an `EMPTY_TARGET` constant — add `doneTargetHundredths: null`. Run `pnpm type-check` and add the field wherever else TypeScript asks (test fixtures of `PlanTarget`).

- [ ] **Step 4: Run — expect PASS.** `pnpm test lib/science`

- [ ] **Step 5: Say it on the header** — in `components/science/plan-header.tsx`, replace the single «ціль N год» `<p>` with:

```tsx
{
  targetHundredths === null ? null : (
    <p className="text-sm text-foreground-soft">
      ціль{' '}
      <span className="font-medium text-foreground tabular-nums">
        {formatHours(targetHundredths)}
      </span>{' '}
      год
      {/* D37: once the plan is above the norm, the plan is what the
                    fact has to reach — say so, or «Виконано: бракує 200»
                    reads as a sum that does not add up. */}
      {target.doneTargetHundredths !== null && target.doneTargetHundredths > targetHundredths && (
        <>
          {' '}
          · виконати{' '}
          <span className="font-medium text-foreground tabular-nums">
            {formatHours(target.doneTargetHundredths)}
          </span>{' '}
          год за планом
        </>
      )}
    </p>
  );
}
```

- [ ] **Step 6: Check** — `pnpm type-check && pnpm test`. Ask the owner to look at `/science-plan` for a person whose plan is above the norm.

- [ ] **Step 7: Ask the owner, then `/commit`** — `feat(science): measure the fact against the plan when it exceeds the norm`

---

### Task 4: Link and file as two separate rules (D39, D40, D47)

**Files:**

- Modify: `prisma/schema.prisma` (`ScienceWorkType`: drop `requiresFile`, add `linkRule`, `fileRule`, enum `ProofRule`)
- Create: `prisma/migrations/<timestamp>_science_proof_rules/migration.sql`
- Modify: `lib/science/evidence-rule.ts` (+ test), `lib/science/work-types-2027.ts` (+ test), `prisma/catalogue.ts`
- Modify: `app/(dashboard)/science-plan/record-actions.ts` (+ test), `app/(dashboard)/science-plan/file-actions.ts` (+ test)
- Modify: `validations/science-work-type.ts`, `app/(dashboard)/admin/science-plan/[id]/actions.ts` (+ test), `app/(dashboard)/admin/science-plan/[id]/page.tsx`, `app/(dashboard)/admin/science-plan/actions.ts` (clone, + test), `components/science/admin/work-type-dialog.tsx`, `components/science/admin/work-type-list.tsx`
- Modify: `lib/queries/get-science-template.ts`, `app/(dashboard)/science-plan/page.tsx`, `components/science/add-plan-row-dialog.tsx` (`PlanWorkType`), `components/science/add-record-dialog.tsx`, `components/science/edit-record-dialog.tsx`, `components/science/record-list.tsx`
- Modify: `lib/labels.ts`

**The model (owner, 2026-09-23 — D47).** The link and the file are two different proofs with **two independent settings** per вид роботи, each `REQUIRED | OPTIONAL | NONE`:

|            | link                                  | file                                  |
| ---------- | ------------------------------------- | ------------------------------------- |
| `REQUIRED` | must be given                         | must be given                         |
| `OPTIONAL` | box shown, may be empty               | box shown, may be empty               |
| `NONE`     | no box; a link sent anyway is refused | no box; a file sent anyway is refused |

Two rules across the pair: **when neither side is REQUIRED, at least one of the two must still be given** (D27), and **both NONE is refused** in the admin action. `requiresFile` is dropped; the migration maps it to `fileRule = REQUIRED`. A proof on a `NONE` side does not count (a file left over from before a type became link-only proves nothing).

Starting values: the eight types of D39 → link `REQUIRED`, file `NONE`; every other type → both `OPTIONAL`.

**Interfaces:**

- Produces: Prisma enum `ProofRule`; `ScienceWorkType.linkRule`, `.fileRule`; in `lib/science/evidence-rule.ts`: `type ProofRule = 'REQUIRED' | 'OPTIONAL' | 'NONE'`, `evidenceProblem({ linkRule, fileRule, link, fileCount })`, `proofRulesProblem(linkRule, fileRule): string | null`, `LINK_NOT_ALLOWED`, `FILE_NOT_ALLOWED`; `PlanWorkType.linkRule`, `.fileRule`.

- [ ] **Step 1: Schema + migration.** Enum `ProofRule { REQUIRED OPTIONAL NONE }`; on `ScienceWorkType` replace `requiresFile` with `linkRule ProofRule @default(OPTIONAL)` and `fileRule ProofRule @default(OPTIONAL)`. `pnpm prisma migrate dev --create-only --name science_proof_rules`, then write the SQL so the data moves BEFORE the old column is dropped:

```sql
CREATE TYPE "ProofRule" AS ENUM ('REQUIRED', 'OPTIONAL', 'NONE');
ALTER TABLE "ScienceWorkType"
  ADD COLUMN "linkRule" "ProofRule" NOT NULL DEFAULT 'OPTIONAL',
  ADD COLUMN "fileRule" "ProofRule" NOT NULL DEFAULT 'OPTIONAL';
UPDATE "ScienceWorkType" SET "fileRule" = 'REQUIRED' WHERE "requiresFile" = true;
UPDATE "ScienceWorkType" SET "linkRule" = 'REQUIRED', "fileRule" = 'NONE'
WHERE "code" IN ('intl_grant_program', 'intl_project', 'monograph', 'monograph_reissue',
                 'article', 'conference_paper', 'editorial_board', 'english_support');
ALTER TABLE "ScienceWorkType" DROP COLUMN "requiresFile";
```

Apply, generate, check `migrate status`, and query the eight rows.

- [ ] **Step 2: The rule, test first.** Rewrite `lib/science/evidence-rule.test.ts` around `linkRule`/`fileRule`: link REQUIRED + none → «Для цього виду роботи потрібне посилання»; file REQUIRED + none → «Для цього виду роботи потрібен файл підтвердження»; both OPTIONAL + nothing → «Додайте посилання або файл підтвердження»; both OPTIONAL + either → ok; link REQUIRED + file NONE + a leftover file and no link → the link sentence; file NONE never satisfies «at least one». `proofRulesProblem('NONE', 'NONE')` → «Має бути хоча б один спосіб підтвердження»; any other pair → null. Then implement.

- [ ] **Step 3: The actions, test first.** `saveRecord`: a file on a `fileRule: NONE` type → `FILE_NOT_ALLOWED`, object dropped, nothing created; a link on a `linkRule: NONE` type → `LINK_NOT_ALLOWED`, object dropped. `updateWorkEvidence`: same link refusal. `attachFile`: `fileRule: NONE` → `FILE_NOT_ALLOWED`, object dropped. `deleteFile`: passes both rules to `evidenceProblem` (a file on a link-REQUIRED type whose link exists may be deleted). Replace every `requiresFile` fixture with the rule pair.

- [ ] **Step 4: Catalogue.** `work-types-2027.ts`: `linkRule?`/`fileRule?` replace `requiresFile?` in the def type; the eight D39 defs get `linkRule: 'REQUIRED', fileRule: 'NONE'`. `prisma/catalogue.ts`: `linkRule: def.linkRule ?? 'OPTIONAL', fileRule: def.fileRule ?? 'OPTIONAL'`. A test pins exactly those eight.

- [ ] **Step 5: Admin.** `validations/science-work-type.ts`: `linkRule`/`fileRule` as `z.enum(['REQUIRED','OPTIONAL','NONE'])`, and `proofRulesProblem` refused in `saveWorkType` (a field-level message on the dialog). `[id]/actions.ts`, clone, `[id]/page.tsx`, `work-type-list.tsx`: carry both fields wherever `requiresFile` was. `work-type-dialog.tsx`: the `requiresFile` switch becomes two Selects, «Посилання» and «Файл», each «Обов'язково / Необов'язково / Не використовується». `lib/labels.ts`: `linkRule: 'Посилання'`, `fileRule: 'Файл'`, and a `PROOF_RULE_LABELS` map; keep the old `requiresFile` label so past audit rows still read.

- [ ] **Step 6: The НПП's forms.** `get-science-template.ts` selects both; `PlanWorkType` carries both. `add-record-dialog.tsx`: the link box hides on `NONE` and is marked required on `REQUIRED`; the file box likewise; the hint under them follows the pair («Досить або посилання, або файлу» only when both are OPTIONAL). `edit-record-dialog.tsx`: the link box hides on `NONE`. `record-list.tsx`: «Додати файл» hides on `fileRule: NONE`.

- [ ] **Step 7: Check** — `pnpm type-check && pnpm test`, lint the touched files. The owner opens a стаття (link only), a доповідь (link only) and a сертифікат-type (both optional) in the add dialog, and changes one type's rules in `/admin/science-plan/[id]`.

- [ ] **Step 8: Ask the owner, then `/commit`** — `feat(science): let ADMIN set the link and the file rule per вид роботи`

---

### Task 5: Month helpers (D41, D42 — pure functions)

**Files:**

- Create: `lib/science/execution-month.ts`, `lib/science/execution-month.test.ts`

**Interfaces:**

- Produces, all in `lib/science/execution-month.ts`:
  - `isMonthKey(value: string): boolean` — `"YYYY-MM"`
  - `currentMonthKey(now?: Date): string` — in Europe/Kyiv
  - `monthOptions(now: Date, lookbackMonths: number): string[]` — newest first, `lookbackMonths + 1` keys
  - `monthProblem(input: { month: string; now: Date; lookbackMonths: number }): string | null`
  - `monthToDate(key: string): Date` — UTC midnight of the 1st
  - `dateToMonthKey(date: Date): string` — reads UTC parts (a `@db.Date` comes back as UTC midnight)
  - `monthLabel(key: string): string` — «Вересень 2026»

- [ ] **Step 1: Write the failing tests** — `lib/science/execution-month.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  currentMonthKey,
  dateToMonthKey,
  isMonthKey,
  monthLabel,
  monthOptions,
  monthProblem,
  monthToDate,
} from './execution-month';

const SEPT_15 = new Date('2026-09-15T12:00:00Z');

describe('month keys', () => {
  it('accepts YYYY-MM only', () => {
    expect(isMonthKey('2026-09')).toBe(true);
    expect(isMonthKey('2026-9')).toBe(false);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('')).toBe(false);
  });

  it('reads the current month in Kyiv, not UTC', () => {
    // 31 Aug 22:30 UTC is already 1 September 01:30 in Kyiv (EEST, UTC+3).
    expect(currentMonthKey(new Date('2026-08-31T22:30:00Z'))).toBe('2026-09');
  });

  it('round-trips through the stored DATE', () => {
    expect(monthToDate('2026-09').toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(dateToMonthKey(monthToDate('2027-01'))).toBe('2027-01');
  });

  it('names the month in Ukrainian', () => {
    expect(monthLabel('2026-09')).toBe('Вересень 2026');
    expect(monthLabel('2027-01')).toBe('Січень 2027');
  });
});

describe('monthOptions', () => {
  it('lists this month and N before it, newest first, across a year boundary', () => {
    const options = monthOptions(new Date('2027-02-10T12:00:00Z'), 3);
    expect(options).toEqual(['2027-02', '2027-01', '2026-12', '2026-11']);
  });

  it('gives 13 options for the default 12', () => {
    expect(monthOptions(SEPT_15, 12)).toHaveLength(13);
    expect(monthOptions(SEPT_15, 12).at(-1)).toBe('2025-09');
  });
});

describe('monthProblem — D42', () => {
  const check = (month: string) => monthProblem({ month, now: SEPT_15, lookbackMonths: 12 });

  it('accepts this month and exactly 12 back', () => {
    expect(check('2026-09')).toBeNull();
    expect(check('2025-09')).toBeNull();
  });

  it('refuses 13 back', () => {
    expect(check('2025-08')).toBe('Роботу, виконану понад 12 міс. тому, додати не можна');
  });

  it('refuses the future', () => {
    expect(check('2026-10')).toBe('Місяць виконання не може бути в майбутньому');
  });

  it('refuses a missing or malformed month', () => {
    expect(check('')).toBe('Оберіть місяць виконання');
    expect(check('вересень')).toBe('Оберіть місяць виконання');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module missing). `pnpm test lib/science/execution-month.test.ts`

- [ ] **Step 3: Implement** — `lib/science/execution-month.ts`:

```ts
/**
 * D41/D42 (owner, 2026-09-23) — the month a work was done, and how old it may be.
 *
 * Held in code as a `"YYYY-MM"` key and stored as a Postgres DATE on the 1st
 * (`ScienceWork.executedMonth`). The key is what a <select> can carry and what
 * sorts correctly as a string; the DATE is what a chart can group by.
 *
 * «This month» is read in Europe/Kyiv, for the reason `currentAcademicYear`
 * gives: at 00:30 on 1 September in Kyiv it is still August in UTC.
 *
 * The fence moves with the date of ENTRY, not the навчальний рік — an article
 * published in May and indexed in September still gets in; one from 2019 does
 * not. See D42 in the science-plan spec.
 */

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

const MONTH_NAMES = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
] as const;

export function isMonthKey(value: string): boolean {
  return MONTH_KEY.test(value);
}

/** Months since year 0 — makes «N months back» plain subtraction. */
function toIndex(key: string): number {
  const [, year, month] = MONTH_KEY.exec(key)!;
  return Number(year) * 12 + (Number(month) - 1);
}

function fromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function currentMonthKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  return `${year}-${month}`;
}

export function monthOptions(now: Date, lookbackMonths: number): string[] {
  const current = toIndex(currentMonthKey(now));
  return Array.from({ length: lookbackMonths + 1 }, (_, i) => fromIndex(current - i));
}

export function monthProblem(input: {
  month: string;
  now: Date;
  lookbackMonths: number;
}): string | null {
  if (!isMonthKey(input.month)) return 'Оберіть місяць виконання';
  const back = toIndex(currentMonthKey(input.now)) - toIndex(input.month);
  if (back < 0) return 'Місяць виконання не може бути в майбутньому';
  if (back > input.lookbackMonths) {
    return `Роботу, виконану понад ${input.lookbackMonths} міс. тому, додати не можна`;
  }
  return null;
}

export function monthToDate(key: string): Date {
  const index = toIndex(key);
  return new Date(Date.UTC(Math.floor(index / 12), index % 12, 1));
}

/** A `@db.Date` comes back as UTC midnight — read UTC parts, never local ones. */
export function dateToMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const index = toIndex(key);
  return `${MONTH_NAMES[index % 12]} ${Math.floor(index / 12)}`;
}
```

- [ ] **Step 4: Run — expect PASS.** `pnpm test lib/science/execution-month.test.ts`

- [ ] **Step 5: Ask the owner, then `/commit`** — `feat(science): add execution-month helpers and the age fence`

---

### Task 6: Month and lookback in the schema; the year setting (D41, D42)

**Files:**

- Modify: `prisma/schema.prisma` (`ScienceWork`, `SciencePlanTemplate`)
- Create: `prisma/migrations/<timestamp>_science_execution_month/migration.sql`
- Modify: `app/(dashboard)/admin/science-plan/actions.ts` (+ test), `app/(dashboard)/admin/science-plan/page.tsx`, `components/science/admin/year-list.tsx`
- Modify: `lib/queries/get-science-template.ts`, `lib/labels.ts`

**Interfaces:**

- Produces: `ScienceWork.executedMonth: Date` (required), `SciencePlanTemplate.maxLookbackMonths: number` (default 12), `getActiveScienceTemplate()` returns `maxLookbackMonths`, `updateScienceYearSettings(input: { id: string; orderRef: string | null; minHoursPerRate: number; maxLookbackMonths: number }): Promise<ScienceYearState>`, `lookbackProblem(months: number): string | null` in `lib/science/execution-month.ts`.

- [ ] **Step 1: Schema**

`model SciencePlanTemplate`, after `minHoursPerRate`:

```prisma
  /// D42: how many months back a work may have been done, counted from the
  /// month it is entered. A column for the reason minHoursPerRate is one — a
  /// rule the university may change next year. 12 by the owner, 2026-09-23.
  maxLookbackMonths Int @default(12)
```

`model ScienceWork`, after `computedValue`:

```prisma
  /// D41: the month the work was done — for an article, its publication
  /// month. Always the 1st. Belongs to the WORK, like its DOI: co-authors share
  /// one article and one month. `lib/science/execution-month.ts` handles it.
  executedMonth DateTime @db.Date
```

and add `@@index([templateId, executedMonth])` to `ScienceWork` (the per-month chart groups by it).

- [ ] **Step 2: Migration with backfill**

Run: `pnpm prisma migrate dev --create-only --name science_execution_month`
Replace the generated SQL with:

```sql
ALTER TABLE "SciencePlanTemplate" ADD COLUMN "maxLookbackMonths" INTEGER NOT NULL DEFAULT 12;

-- D41: existing works have no month. The month they were ENTERED is the best
-- honest guess, read in Kyiv like everything else here; the person can correct
-- it in «Редагувати».
ALTER TABLE "ScienceWork" ADD COLUMN "executedMonth" DATE;
UPDATE "ScienceWork"
SET "executedMonth" = date_trunc('month', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Kyiv')::date;
ALTER TABLE "ScienceWork" ALTER COLUMN "executedMonth" SET NOT NULL;

CREATE INDEX "ScienceWork_templateId_executedMonth_idx" ON "ScienceWork"("templateId", "executedMonth");
```

Run `pnpm db:migrate && pnpm db:generate`. Check `pnpm prisma migrate status` says in sync (no drift — if Prisma wants another migration, the index name differs; copy the name Prisma generates). Tell the owner to restart `pnpm dev`.

- [ ] **Step 3: Failing test for the setting's rule** — append to `lib/science/execution-month.test.ts`:

```ts
describe('lookbackProblem', () => {
  it('accepts 0 to 60 whole months', () => {
    expect(lookbackProblem(0)).toBeNull();
    expect(lookbackProblem(12)).toBeNull();
    expect(lookbackProblem(60)).toBeNull();
  });

  it('refuses anything else', () => {
    expect(lookbackProblem(-1)).toBe('Кількість місяців — ціле число від 0 до 60');
    expect(lookbackProblem(61)).toBe('Кількість місяців — ціле число від 0 до 60');
    expect(lookbackProblem(1.5)).toBe('Кількість місяців — ціле число від 0 до 60');
  });
});
```

(add `lookbackProblem` to the import). Run — FAIL. Implement in `execution-month.ts`:

```ts
/** 60 is a sanity ceiling, not policy: five years back is already no fence. */
export function lookbackProblem(months: number): string | null {
  return Number.isInteger(months) && months >= 0 && months <= 60
    ? null
    : 'Кількість місяців — ціле число від 0 до 60';
}
```

Run — PASS.

- [ ] **Step 4: Failing tests for the admin actions** — in `app/(dashboard)/admin/science-plan/actions.test.ts`:
  - `createScienceYear` with `maxLookbackMonths: 8` writes `maxLookbackMonths: 8` and diffs it;
  - `createScienceYear` with `maxLookbackMonths: 99` returns `{ error: 'Кількість місяців — ціле число від 0 до 60' }`;
  - `cloneScienceYear` copies `maxLookbackMonths` from the source (add it to the source fixture);
  - `updateScienceYearSettings` as ADMIN updates `orderRef`, `minHoursPerRate`, `maxLookbackMonths` and writes an `UPDATE` audit row whose changes include `maxLookbackMonths: { from: 12, to: 8 }` (check the `diffChanges` output shape in `lib/audit.ts` and assert that shape);
  - `updateScienceYearSettings` as EDITOR returns `{ error: 'Недостатньо прав' }`.

Follow the mocks already in that file; add `sciencePlanTemplate.update` / `findUnique` to its `db` mock if absent. Run — FAIL.

- [ ] **Step 5: Implement the actions** — `app/(dashboard)/admin/science-plan/actions.ts`:
  - `CreateScienceYearInput` gains `maxLookbackMonths: number`. After the hours check: `const lookbackFault = lookbackProblem(input.maxLookbackMonths); if (lookbackFault) return { error: lookbackFault };`. Write it in `create` and in the audit diff.
  - `cloneScienceYear` — `maxLookbackMonths: source.maxLookbackMonths,` beside `minHoursPerRate`.
  - New action, placed after `createScienceYear`:

```ts
// ─── Settings ────────────────────────────────────────────────────────────────

interface ScienceYearSettingsInput {
  id: string;
  orderRef: string | null;
  minHoursPerRate: number;
  maxLookbackMonths: number;
}

/**
 * The three numbers a year carries, editable after creation. Before D42 there
 * was nothing worth editing; the lookback is a rule the owner expects to tune
 * («8, or 12 — let the admin set it»), so it needs a way in that is not a new
 * year.
 *
 * Changes apply to what is entered FROM NOW: a work already saved keeps its
 * month even if a shorter window would refuse it today.
 */
export async function updateScienceYearSettings(
  input: ScienceYearSettingsInput
): Promise<ScienceYearState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  if (!Number.isInteger(input.minHoursPerRate) || input.minHoursPerRate <= 0) {
    return { error: 'Некоректна кількість годин на ставку' };
  }
  const lookbackFault = lookbackProblem(input.maxLookbackMonths);
  if (lookbackFault) return { error: lookbackFault };

  const existing = await db.sciencePlanTemplate.findUnique({
    where: { id: input.id },
    select: { academicYear: true, orderRef: true, minHoursPerRate: true, maxLookbackMonths: true },
  });
  if (!existing) return { error: 'Рік не знайдено' };

  const next = {
    orderRef: input.orderRef?.trim() || null,
    minHoursPerRate: input.minHoursPerRate,
    maxLookbackMonths: input.maxLookbackMonths,
  };

  try {
    await db.$transaction(async (tx) => {
      await tx.sciencePlanTemplate.update({ where: { id: input.id }, data: next });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'SciencePlanTemplate',
          entityId: input.id,
          label: `Планування ${existing.academicYear}`,
          userId: session.user.id,
          changes: diffChanges(
            {
              orderRef: existing.orderRef,
              minHoursPerRate: existing.minHoursPerRate,
              maxLookbackMonths: existing.maxLookbackMonths,
            },
            next
          ),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти. Зміни не застосовано',
        'science.updateScienceYearSettings',
        { userId: session.user.id }
      ),
    };
  }

  revalidateSciencePlan();
  return { ok: true, message: 'Збережено' };
}
```

Import `lookbackProblem` from `@/lib/science/execution-month`. Run the tests — PASS.

- [ ] **Step 6: Labels** — `lib/labels.ts`: `maxLookbackMonths: 'Скільки місяців назад можна вносити',` and `executedMonth: 'Місяць виконання',`.

- [ ] **Step 7: The admin UI** — `components/science/admin/year-list.tsx`:
  - `ScienceYearRow` gains `maxLookbackMonths: number`; `app/(dashboard)/admin/science-plan/page.tsx` selects and passes it.
  - `CreateYearDialog` gains a fourth field, same pattern as «Мінімум годин на ставку»: state `const [maxLookbackMonths, setMaxLookbackMonths] = useState('12');`, reset to `'12'`, `<Label htmlFor="science-lookback">Скільки місяців назад можна вносити роботу</Label>`, `type="number" min={0} max={60} step={1}`, and `maxLookbackMonths: Number(maxLookbackMonths)` in the call.
  - New `EditYearDialog({ year }: { year: ScienceYearRow })` — copy `CreateYearDialog`, drop the «Навчальний рік» field (it is the year's identity and never changes), pre-fill the three states from `year`, call `updateScienceYearSettings({ id: year.id, … })`, title «Налаштування {year.academicYear}», trigger `<Button size="sm" variant="ghost"><Settings2 className="size-4" />Налаштування</Button>` (import `Settings2` from lucide-react).
  - Put the trigger in the row's action cell beside «Каталог». The comment above `COLUMNS` says the last column holds three buttons at 21rem — with four, widen it to `'26rem'` and update that comment's sentence to «FOUR buttons … about 24rem together».

- [ ] **Step 8: The template query** — `lib/queries/get-science-template.ts`: `maxLookbackMonths: true,` in `getActiveScienceTemplate`'s select.

- [ ] **Step 9: Check** — `pnpm type-check` will now fail in `saveRecord` (`executedMonth` is required on `scienceWork.create`). That is Task 7. Run `pnpm test lib/science "app/(dashboard)/admin/science-plan"` — PASS.

- [ ] **Step 10: Ask the owner, then `/commit`** together with Task 7 (the tree does not type-check between them) — or commit Task 6 with `saveRecord` temporarily passing `executedMonth: monthToDate(currentMonthKey())`, which Task 7 replaces. Prefer committing 6 and 7 together.

---

### Task 7: The month on save and on edit (D41, D42)

**Files:**

- Modify: `app/(dashboard)/science-plan/record-actions.ts`, `record-actions.test.ts`
- Create: `components/science/month-select.tsx`
- Modify: `components/science/add-record-dialog.tsx`, `components/science/edit-record-dialog.tsx`, `components/science/record-list.tsx` (passes the month to the edit dialog), `app/(dashboard)/science-plan/page.tsx`, `components/science/plan-view.tsx`

**Interfaces:**

- Consumes: Task 5's helpers; `template.maxLookbackMonths` from Task 6.
- Produces: `SaveRecordInput.executedMonth: string` (required); `updateWorkEvidence` input gains `executedMonth: string` (required — the form always sends it); `MonthSelect({ id, value, onChange, lookbackMonths, error? })`.

- [ ] **Step 1: Failing tests** — in `record-actions.test.ts`:
  - At the top of the outer `beforeEach`: `vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));` and an `afterEach(() => vi.useRealTimers())` (import `afterEach`). Only `Date` is faked so the async transaction mocks still run.
  - `TEMPLATE` gains `maxLookbackMonths: 12`; `base` gains `executedMonth: '2026-10'`.
  - New describe:

```ts
describe('saveRecord — D41/D42, the month', () => {
  it('stores the month as the 1st of it', async () => {
    await saveRecord({ ...base, executedMonth: '2026-05' });
    expect(db.scienceWork.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ executedMonth: new Date('2026-05-01T00:00:00Z') }),
      })
    );
  });

  it('refuses a month older than the year allows, and drops the file', async () => {
    mockVerifyFile.mockResolvedValue({ file: VERIFIED });
    const result = await saveRecord({ ...base, executedMonth: '2025-09', file: STAGED });
    expect(result).toEqual({ error: 'Роботу, виконану понад 12 міс. тому, додати не можна' });
    expect(mockDropObject).toHaveBeenCalled();
    expect(db.scienceWork.create).not.toHaveBeenCalled();
  });

  it('follows the year’s own setting', async () => {
    mockTemplate.mockResolvedValue({ ...TEMPLATE, maxLookbackMonths: 3 });
    expect(await saveRecord({ ...base, executedMonth: '2026-06' })).toEqual({
      error: 'Роботу, виконану понад 3 міс. тому, додати не можна',
    });
  });

  it('refuses the future', async () => {
    expect(await saveRecord({ ...base, executedMonth: '2026-11' })).toEqual({
      error: 'Місяць виконання не може бути в майбутньому',
    });
  });
});

describe('updateWorkEvidence — the month', () => {
  // Use this file's existing updateWorkEvidence fixture for the work; add
  // `executedMonth: new Date('2026-09-01T00:00:00Z')` to it.
  it('moves the month when it is inside the window', async () => {
    /* arrange the work fixture as the existing tests do */
    const result = await updateWorkEvidence({
      workId: 'w1',
      evidence: base.evidence,
      link: base.link,
      executedMonth: '2026-08',
    });
    expect(result).toEqual({ ok: true });
    expect(db.scienceWork.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ executedMonth: new Date('2026-08-01T00:00:00Z') }),
      })
    );
  });

  it('keeps an unchanged month even when it has fallen out of the window', async () => {
    /* work fixture with executedMonth 2025-08-01 — 14 months before the fake now */
    const result = await updateWorkEvidence({
      workId: 'w1',
      evidence: base.evidence,
      link: base.link,
      executedMonth: '2025-08',
    });
    expect(result).toEqual({ ok: true });
  });

  it('refuses moving it OUT of the window', async () => {
    const result = await updateWorkEvidence({
      workId: 'w1',
      evidence: base.evidence,
      link: base.link,
      executedMonth: '2024-01',
    });
    expect(result).toEqual({ error: 'Роботу, виконану понад 12 міс. тому, додати не можна' });
  });
});
```

Replace each `/* arrange … */` with the same `(db.scienceWork.findUnique as Mock).mockResolvedValue({...})` the neighbouring `updateWorkEvidence` tests use, plus `executedMonth`. Every existing `updateWorkEvidence(...)` call in the file gains `executedMonth: '2026-09'` and its work fixture `executedMonth: new Date('2026-09-01T00:00:00Z')`.

Run — FAIL.

- [ ] **Step 2: Implement in `saveRecord`**

- `SaveRecordInput` gains:

```ts
/** D41: `"YYYY-MM"`, the month the work was done. Checked against D42's
 *  window — the OPEN year's `maxLookbackMonths`, counted from today. */
executedMonth: string;
```

- After the `FILE_NOT_ALLOWED` check from Task 4:

```ts
const monthFault = monthProblem({
  month: input.executedMonth,
  now: new Date(),
  lookbackMonths: template.maxLookbackMonths,
});
if (monthFault) {
  await dropFile();
  return { error: monthFault };
}
```

- `scienceWork.create` data: `executedMonth: monthToDate(input.executedMonth),`. Audit diff: `executedMonth: input.executedMonth,`.
- Imports: `monthProblem, monthToDate, dateToMonthKey` from `@/lib/science/execution-month`.
- `resolveActor`'s `ActorContext.template` type is `ReturnType<typeof getActiveScienceTemplate>` — Task 6 Step 8 already added the field, so it is typed.

- [ ] **Step 3: Implement in `updateWorkEvidence`**

- Input gains `executedMonth: string;`. Select `executedMonth: true` on the work.
- After `evidenceFault`:

```ts
// D42 applies to a CHANGE of month only. A work saved in time keeps its
// month when its author later fixes a typo in the title, even if the window
// has moved past it since.
const monthChanged = input.executedMonth !== dateToMonthKey(work.executedMonth);
if (monthChanged) {
  const monthFault = monthProblem({
    month: input.executedMonth,
    now: new Date(),
    lookbackMonths: template.maxLookbackMonths,
  });
  if (monthFault) return { error: monthFault };
}
```

- `scienceWork.update` data: `executedMonth: monthToDate(input.executedMonth),`. Audit: add `executedMonth: dateToMonthKey(work.executedMonth)` / `executedMonth: input.executedMonth` to the two sides.

Run the tests — PASS. Run `pnpm type-check` — only the UI callers should still fail.

- [ ] **Step 4: The picker** — `components/science/month-select.tsx`:

```tsx
'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { monthLabel, monthOptions } from '@/lib/science/execution-month';

/**
 * «Місяць виконання» — D41. The options ARE the D42 window: this month and
 * `lookbackMonths` before it, newest first, so a month the server would refuse
 * is never offered. The server checks again.
 *
 * `extra` keeps a work's stored month selectable when it has fallen out of the
 * window — the edit form must be able to show what is saved (see
 * `updateWorkEvidence`, which accepts an unchanged month).
 */
export function MonthSelect({
  id,
  value,
  onChange,
  lookbackMonths,
  extra,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  lookbackMonths: number;
  extra?: string;
  disabled?: boolean;
}) {
  // Computed once per mount — a dialog left open over midnight on the 1st must
  // not reshuffle its own list under the cursor.
  const [options] = useState(() => {
    const window = monthOptions(new Date(), lookbackMonths);
    return extra && !window.includes(extra) ? [...window, extra] : window;
  });

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Оберіть місяць" />
      </SelectTrigger>
      <SelectContent>
        {options.map((key) => (
          <SelectItem key={key} value={key}>
            {monthLabel(key)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 5: Wire the add dialog**

- `plan-view.tsx` and `page.tsx`: pass `lookbackMonths={template.maxLookbackMonths}` down to `AddRecordDialog` and `RecordList` (follow how `workTypes` is threaded; add the prop to each component's props type).
- `AddRecordDialog` → `RecordForm` gains `lookbackMonths: number`. In `RecordForm`: `const [month, setMonth] = useState(() => currentMonthKey());` and, placed right after `<EvidenceFields … />`:

```tsx
<div className="space-y-1">
  <Label htmlFor="record-month">Місяць виконання</Label>
  <MonthSelect
    id="record-month"
    value={month}
    onChange={setMonth}
    lookbackMonths={lookbackMonths}
  />
  <p className="text-sm text-foreground-soft">
    {/* D41/D42: for a publication this is the month it came out. */}
    Для публікації — місяць виходу. Не раніше ніж {lookbackMonths} міс. тому.
  </p>
</div>
```

- `saveRecord({ …, executedMonth: month })`.

- [ ] **Step 6: Wire the edit dialog**

- `SciencePlanRecordDetail` (in `lib/queries/get-science-plan.ts`) gains `executedMonth: string;` — select `executedMonth: true` on `work` and map `executedMonth: dateToMonthKey(r.work.executedMonth)`.
- `EditRecordDialog` gains props `executedMonth: string` and `lookbackMonths: number`; state `const [month, setMonth] = useState(executedMonth)`; the same `MonthSelect` block with `id="edit-record-month"` and `extra={executedMonth}`; pass `executedMonth: month` to `updateWorkEvidence`.
- `RecordList` passes `executedMonth={record.executedMonth}` and `lookbackMonths={lookbackMonths}`.

- [ ] **Step 7: Check** — `pnpm type-check && pnpm test && pnpm lint`. Ask the owner to add one record and edit its month in the browser.

- [ ] **Step 8: Ask the owner, then `/commit`** (with Task 6) — `feat(science): record the month a work was done and fence old works`

---

### Task 8: «Виконано» grouped by month; the month on moderation (D41)

**Files:**

- Create: `lib/science/group-by-month.ts`, `lib/science/group-by-month.test.ts`
- Modify: `components/science/record-list.tsx`, `lib/queries/list-science-records.ts` (+ test), `components/science/moderation/record-feed.tsx`

**Interfaces:**

- Produces: `groupByMonth<T extends { executedMonth: string }>(rows: readonly T[]): { month: string; rows: T[] }[]` — newest month first, row order inside a group preserved. `ScienceRecordFeedRow.executedMonth: string`.

- [ ] **Step 1: Failing test** — `lib/science/group-by-month.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { groupByMonth } from './group-by-month';

describe('groupByMonth', () => {
  it('groups newest month first and keeps the order inside a month', () => {
    const rows = [
      { id: 'a', executedMonth: '2026-09' },
      { id: 'b', executedMonth: '2027-01' },
      { id: 'c', executedMonth: '2026-09' },
    ];
    expect(groupByMonth(rows)).toEqual([
      { month: '2027-01', rows: [{ id: 'b', executedMonth: '2027-01' }] },
      {
        month: '2026-09',
        rows: [
          { id: 'a', executedMonth: '2026-09' },
          { id: 'c', executedMonth: '2026-09' },
        ],
      },
    ]);
  });

  it('returns nothing for nothing', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
```

Run — FAIL.

- [ ] **Step 2: Implement** — `lib/science/group-by-month.ts`:

```ts
/**
 * D41 — «Виконано» reads as a diary of the year, one section per month,
 * newest first. `"YYYY-MM"` keys sort correctly as strings, so no date maths.
 */
export function groupByMonth<T extends { executedMonth: string }>(
  rows: readonly T[]
): { month: string; rows: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.executedMonth);
    if (group) group.push(row);
    else groups.set(row.executedMonth, [row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([month, rows]) => ({ month, rows }));
}
```

Run — PASS.

- [ ] **Step 3: Group the list** — in `components/science/record-list.tsx`, replace the single `<Card padding="none"><ul className="divide-y">{records.map(…)}</ul></Card>` with one card per month:

```tsx
  return (
    <div className="space-y-4">
      {groupByMonth(records).map((group) => (
        <section key={group.month} className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground-soft">{monthLabel(group.month)}</h2>
          <Card padding="none">
            <ul className="divide-y">{group.rows.map((record) => /* the existing <li> unchanged */)}</ul>
          </Card>
        </section>
      ))}
    </div>
  );
```

Move the existing `<li>` body into a local `function RecordRow({ record, … })` in the same file so the map stays readable; do not change its markup. Check `docs/aurora.md` for the section-heading style other grouped lists use (`grep -rn "text-sm font-semibold text-foreground-soft" components | head`) and match it if it differs.

- [ ] **Step 4: The month on moderation** — `lib/queries/list-science-records.ts`: add `executedMonth: string` to `ScienceRecordFeedRow` (doc: «D41 — ННВ compares it against the publication date on the linked page»), select `executedMonth: true` on `work`, map with `dateToMonthKey`. Update `list-science-records.test.ts` fixtures and assert the field. In `components/science/moderation/record-feed.tsx`, print `monthLabel(row.executedMonth)` in the row's meta line (find where `summary` is rendered and add ` · {monthLabel(row.executedMonth)}` after it).

- [ ] **Step 5: Check** — `pnpm type-check && pnpm test && pnpm lint`; the owner looks at «Виконано» and `/moderation`.

- [ ] **Step 6: Ask the owner, then `/commit`** — `feat(science): group done work by month and show it to ННВ`

---

### Task 9: A co-author changes their own share (D46)

**Files:**

- Modify: `app/(dashboard)/science-plan/record-actions.ts`, `record-actions.test.ts`
- Create: `components/science/edit-hours-dialog.tsx`
- Modify: `lib/queries/get-science-plan.ts` (`sharing` on the record), `components/science/record-list.tsx`

**Interfaces:**

- Produces: `updateRecordHours(input: { recordId: string; hoursHundredths: number }): Promise<{ ok: true } | { error: string }>`; `SciencePlanRecordDetail.sharing: 'SHARED' | 'INDIVIDUAL'`.

- [ ] **Step 1: Failing tests** — add `update: vi.fn()` to the `scienceRecord` mock at the top of `record-actions.test.ts`, import `updateRecordHours`, then:

```ts
describe('updateRecordHours — D46, my own share', () => {
  const RECORD = {
    id: 'r1',
    staffId: 'staff-1',
    templateId: 't1',
    status: 'APPROVED',
    hoursHundredths: 15000,
    work: {
      id: 'w1',
      totalHundredths: 20000,
      workType: { label: 'Наукова стаття', sharing: 'SHARED' },
    },
  };

  beforeEach(() => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue(RECORD);
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 5000 } });
  });

  it('lowers my share and audits it', async () => {
    expect(await updateRecordHours({ recordId: 'r1', hoursHundredths: 10000 })).toEqual({
      ok: true,
    });
    expect(db.scienceRecord.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { hoursHundredths: 10000 },
    });
    expect(db.auditLog.create).toHaveBeenCalled();
  });

  it('raises it up to what the others left', async () => {
    expect(await updateRecordHours({ recordId: 'r1', hoursHundredths: 15000 })).toEqual({
      ok: true,
    });
  });

  it('refuses taking hours a co-author holds', async () => {
    expect(await updateRecordHours({ recordId: 'r1', hoursHundredths: 16000 })).toEqual({
      error: 'Залишилось 150 з 200 год',
    });
    expect(db.scienceRecord.update).not.toHaveBeenCalled();
  });

  it('measures against OTHERS only, never my own row', async () => {
    await updateRecordHours({ recordId: 'r1', hoursHundredths: 10000 });
    expect(db.scienceRecord.aggregate).toHaveBeenCalledWith({
      where: { workId: 'w1', status: 'APPROVED', staffId: { not: 'staff-1' } },
      _sum: { hoursHundredths: true },
    });
  });

  it('refuses somebody else’s record', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({ ...RECORD, staffId: 'staff-2' });
    expect(await updateRecordHours({ recordId: 'r1', hoursHundredths: 10000 })).toEqual({
      error: 'Запис не знайдено',
    });
  });

  it('refuses a declined record', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({ ...RECORD, status: 'REMOVED' });
    expect(await updateRecordHours({ recordId: 'r1', hoursHundredths: 10000 })).toEqual({
      error: 'Відхилений запис змінити не можна',
    });
  });

  it('refuses an INDIVIDUAL work — its hours come from its data', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({
      ...RECORD,
      work: { ...RECORD.work, workType: { label: 'Конференція', sharing: 'INDIVIDUAL' } },
    });
    expect(await updateRecordHours({ recordId: 'r1', hoursHundredths: 10000 })).toEqual({
      error: 'Години цієї роботи визначаються її даними — змініть їх у «Редагувати»',
    });
  });
});
```

`'Залишилось 150 з 200 год'` depends on `formatHours` — check its output for 15000 (`lib/science/hours.ts`) and adjust the literal if it prints `150,00`. Run — FAIL.

- [ ] **Step 2: Implement** — add to `record-actions.ts`, after `updateWorkEvidence`:

```ts
/**
 * Change MY share of a shared work — D46, and the tool the 2026-09-22 note
 * («CONFIRMED — the shared pool is right») said was missing.
 *
 * Co-authors agree a split AFTER somebody has already entered a number, so
 * «150 to me, 50 to you» has to be changeable without deleting the record —
 * which would also throw away its files.
 *
 * Bounded by what OTHERS hold, re-read inside the transaction, the rule
 * `joinWork` follows. Only the caller's own row moves; nobody changes a
 * colleague's share.
 */
export async function updateRecordHours(input: {
  recordId: string;
  hoursHundredths: number;
}): Promise<{ ok: true } | { error: string }> {
  const actor = await resolveActor();
  if (!actor.ok) return { error: actor.error };
  const { userId, staffId, template } = actor.context;

  const record = await db.scienceRecord.findUnique({
    where: { id: input.recordId },
    select: {
      id: true,
      staffId: true,
      templateId: true,
      status: true,
      hoursHundredths: true,
      work: {
        select: {
          id: true,
          totalHundredths: true,
          workType: { select: { label: true, sharing: true } },
        },
      },
    },
  });
  if (!record || record.staffId !== staffId || record.templateId !== template.id) {
    return { error: 'Запис не знайдено' };
  }
  if (record.status !== 'APPROVED') return { error: 'Відхилений запис змінити не можна' };
  if (record.work.workType.sharing === 'INDIVIDUAL') {
    return { error: 'Години цієї роботи визначаються її даними — змініть їх у «Редагувати»' };
  }

  try {
    await db.$transaction(async (tx) => {
      const drawn = await tx.scienceRecord.aggregate({
        where: { workId: record.work.id, status: 'APPROVED', staffId: { not: staffId } },
        _sum: { hoursHundredths: true },
      });
      const fault = poolProblem({
        totalHundredths: record.work.totalHundredths,
        drawnByOthers: drawn._sum.hoursHundredths ?? 0,
        requested: input.hoursHundredths,
      });
      if (fault) throw new PoolError(fault);

      await tx.scienceRecord.update({
        where: { id: record.id },
        data: { hoursHundredths: input.hoursHundredths },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'ScienceRecord',
          entityId: record.id,
          label: record.work.workType.label,
          userId,
          changes: diffChanges(
            { hoursHundredths: record.hoursHundredths },
            { hoursHundredths: input.hoursHundredths }
          ),
        },
      });
    });
  } catch (e) {
    if (e instanceof PoolError) return { error: e.reason };
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти. Зміни не застосовано',
        'science.updateRecordHours',
        {
          userId,
        }
      ),
    };
  }

  revalidatePath('/science-plan');
  return { ok: true };
}
```

Run — PASS.

- [ ] **Step 3: `sharing` on the record** — `lib/queries/get-science-plan.ts`: select `sharing: true` inside `work.workType`, add `sharing: 'SHARED' | 'INDIVIDUAL';` to `SciencePlanRecordDetail` (doc: «Whether «Змінити мою частку» is offered — every co-author of a SHARED work, including a sole author who left room»), map it. Update `get-science-plan.test.ts` fixtures.

- [ ] **Step 4: The dialog** — `components/science/edit-hours-dialog.tsx`. Copy the structure of `components/science/edit-record-dialog.tsx` (Dialog, `DialogProblem` in the footer, `useTransition`, `router.refresh()`, `toast.success`). Its body is one field:

```tsx
<div className="space-y-1">
  <Label htmlFor="edit-hours">Скільки годин берете ви</Label>
  <Input
    id="edit-hours"
    inputMode="decimal"
    value={hours}
    onChange={(e) => setHours(e.target.value)}
  />
  <p className="text-sm text-foreground-soft">
    Уся робота — {formatHours(totalHundredths)} год. Співавтори вже взяли{' '}
    {formatHours(othersHundredths)} год.
  </p>
</div>
```

Props: `recordId`, `hoursHundredths` (initial value, shown via `formatHours`), `totalHundredths`, `othersHundredths` (sum of `record.coAuthors[].hoursHundredths`), `label`. Parse with `parseStake` exactly as `add-record-dialog.tsx:231` does; on `null` show `Вкажіть кількість годин, наприклад 200 або 12,5`. Trigger: `<Button size="sm" variant="ghost"><Scale className="size-4" />Моя частка</Button>` — check which icon `edit-record-dialog.tsx` uses for its trigger and pick a different lucide icon so the two do not look alike.

- [ ] **Step 5: Offer it** — in `RecordRow` (Task 8), inside the action row shown when `!declined`, add `{record.sharing === 'SHARED' && <EditHoursDialog … />}`. This row is currently gated on `record.canEdit` (creator only) — restructure so the row renders when `!declined && (record.canEdit || record.sharing === 'SHARED')`, with `EditRecordDialog` and `AttachFileDialog` still inside `record.canEdit` (unchanged — the attach dialog's own comment explains why it is narrowed to the author), and `EditHoursDialog` inside `record.sharing === 'SHARED'`.

- [ ] **Step 6: Check** — `pnpm type-check && pnpm test && pnpm lint`. The owner tries it on a shared article with a colleague's test account.

- [ ] **Step 7: Ask the owner, then `/commit`** — `feat(science): let a co-author change their own share of a shared work`

---

### Task 10: Replace a file in one step; the uploader may change it (D46)

**Files:**

- Modify: `app/(dashboard)/science-plan/file-actions.ts`, `file-actions.test.ts`, `lib/queries/get-science-plan.ts`, `components/science/record-list.tsx`
- Create: `components/science/replace-file-dialog.tsx`

**Interfaces:**

- Consumes: `FILE_NOT_ALLOWED` from `lib/science/evidence-rule.ts` (Task 4).
- Produces: `replaceFile(input: { fileId: string; objectKey: string; fileName: string }): Promise<{ ok: true; fileId: string } | { error: string }>`; `SciencePlanRecordDetail.files[].canChange: boolean` (may delete or replace this file).

**Why replace is its own action.** When a file is the only proof, `deleteFile` refuses (D27 survives a delete) — rightly: deleting first and uploading later leaves a record proving nothing in between, and forever if the upload never comes. The owner's rule (2026-09-23): **the old file goes only once the new one is in.** So the swap is one transaction — verify the new object, insert its row, delete the old row — and the old R2 object is dropped after the commit. On any refusal or failure the old file is untouched and the new object is dropped.

- [ ] **Step 1: Failing tests — who may change a file.** In `file-actions.test.ts`'s `deleteFile` describe, add `uploadedById` to the file fixture (default: the work's creator) and:

```ts
it('lets a co-author delete a file THEY uploaded', async () => {
  /* fixture: work.createdById = 'staff-2', file.uploadedById = 'staff-1' (the caller) */
  expect(await deleteFile('f1')).toEqual({ ok: true });
});

it('still refuses a co-author deleting somebody else’s file', async () => {
  /* fixture: work.createdById = 'staff-2', file.uploadedById = 'staff-2' */
  expect(await deleteFile('f1')).toEqual({
    error: 'Змінити файл може той, хто його додав, або автор роботи',
  });
});
```

Replace each `/* fixture … */` with the file's own `scienceRecordFile.findUnique` mock, adjusted. Update the existing refusal test's expected message to the new sentence. Run — FAIL.

- [ ] **Step 2: Implement the guard** — in `file-actions.ts`, beside `ownsWork`:

```ts
/** D46: who may delete or replace ONE file — ADMIN, whoever entered the work,
 *  or whoever uploaded this file. A co-author may take back their own scan,
 *  never a file another author's claim rests on. */
function mayChangeFile(
  file: { uploadedById: string; work: { createdById: string } },
  staffId: string,
  isAdmin: boolean
): boolean {
  return isAdmin || file.work.createdById === staffId || file.uploadedById === staffId;
}

const CHANGE_FILE_REFUSED = 'Змінити файл може той, хто його додав, або автор роботи';
```

In `deleteFile`, select `uploadedById: true` on the file and replace the creator check with `if (!mayChangeFile(file, staffId, isAdmin)) return { error: CHANGE_FILE_REFUSED };`. Update its doc comment («Creator or ADMIN only …») to name the uploader and to point at `replaceFile` for the only-proof case. Also change its only-proof refusal to `` `${fault}: це єдине підтвердження цього запису — скористайтеся «Замінити»` `` so the sentence names the way out, and update that test. Run — PASS.

- [ ] **Step 3: Failing tests — `replaceFile`.** Add a describe. Use the mocks this test file already declares for `verifyUploadedObject` and `safeDeleteObject` and its verified-file fixture (called `mockVerify`, `mockDrop`, `VERIFIED` below — rename to match); add `scienceRecordFile.delete` to the `db` mock if absent.

```ts
const CHANGE_FILE_REFUSED_TEXT = 'Змінити файл може той, хто його додав, або автор роботи';

describe('replaceFile — the new file in before the old one goes', () => {
  const OLD = {
    id: 'f1',
    objectKey: 'evidence/t1/old.pdf',
    fileName: 'old.pdf',
    uploadedById: 'staff-1',
    work: {
      id: 'w1',
      templateId: 't1',
      createdById: 'staff-1',
      workType: { fileRule: 'OPTIONAL' },
    },
  };
  const NEW = { fileId: 'f1', objectKey: 'evidence/t1/new.pdf', fileName: 'new.pdf' };

  beforeEach(() => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(OLD);
    mockVerify.mockResolvedValue({
      file: { ...VERIFIED, objectKey: NEW.objectKey, fileName: NEW.fileName },
    });
    (db.scienceRecordFile.create as Mock).mockResolvedValue({ id: 'f2' });
  });

  it('swaps the rows in one transaction, then drops the OLD object', async () => {
    expect(await replaceFile(NEW)).toEqual({ ok: true, fileId: 'f2' });
    expect(db.scienceRecordFile.create).toHaveBeenCalled();
    expect(db.scienceRecordFile.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
    expect(mockDrop).toHaveBeenCalledWith('science.replaceFile', OLD.objectKey, expect.anything());
    expect(mockDrop).not.toHaveBeenCalledWith(
      'science.replaceFile',
      NEW.objectKey,
      expect.anything()
    );
  });

  it('keeps the old file when the new one fails verification', async () => {
    mockVerify.mockResolvedValue({ error: 'Файл пошкоджено' });
    expect(await replaceFile(NEW)).toEqual({ error: 'Файл пошкоджено' });
    expect(db.scienceRecordFile.delete).not.toHaveBeenCalled();
  });

  it('keeps the old file and drops the new object when the save fails', async () => {
    (db.scienceRecordFile.create as Mock).mockRejectedValue(new Error('boom'));
    expect(await replaceFile(NEW)).toHaveProperty('error');
    expect(mockDrop).toHaveBeenCalledWith('science.replaceFile', NEW.objectKey, expect.anything());
    expect(mockDrop).not.toHaveBeenCalledWith(
      'science.replaceFile',
      OLD.objectKey,
      expect.anything()
    );
  });

  it('refuses somebody who may not change this file, and drops the new object', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...OLD,
      uploadedById: 'staff-2',
      work: { ...OLD.work, createdById: 'staff-2' },
    });
    expect(await replaceFile(NEW)).toEqual({ error: CHANGE_FILE_REFUSED_TEXT });
    expect(mockDrop).toHaveBeenCalledWith('science.replaceFile', NEW.objectKey, expect.anything());
  });

  it('refuses a file of another year', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...OLD,
      work: { ...OLD.work, templateId: 'old-year' },
    });
    expect(await replaceFile(NEW)).toEqual({ error: 'Файл не знайдено' });
  });
});
```

Run — FAIL.

- [ ] **Step 4: Implement `replaceFile`** — after `deleteFile` in `file-actions.ts`:

```ts
/**
 * «Замінити» — the new file in, the old one out, in ONE step (D46, owner
 * 2026-09-23).
 *
 * `deleteFile` refuses to remove the only proof of a record, so a bad scan
 * that is the only proof could not be changed at all without this. The order
 * is the owner's rule: the old file goes only once the new one is in. Both
 * rows move in one transaction; the old OBJECT is dropped after the commit,
 * and on any refusal or failure the NEW object is dropped and the old file is
 * left exactly as it was.
 *
 * A replacement never changes how many files the work has, so D27's «link or
 * file» holds by construction and is not re-checked.
 */
export async function replaceFile(input: {
  fileId: string;
  objectKey: string;
  fileName: string;
}): Promise<{ ok: true; fileId: string } | { error: string }> {
  const actor = await resolveActor(undefined, { allowAdmin: true });
  if (!actor.ok) return { error: actor.error };
  const { userId, staffId, template } = actor.context;
  const isAdmin = actor.context.role === 'ADMIN';

  const dropNew = () =>
    safeDeleteObject('science.replaceFile', input.objectKey, { userId, entityId: input.fileId });

  const old = await db.scienceRecordFile.findUnique({
    where: { id: input.fileId },
    select: {
      id: true,
      objectKey: true,
      fileName: true,
      uploadedById: true,
      work: {
        select: {
          id: true,
          templateId: true,
          createdById: true,
          workType: { select: { fileRule: true } },
        },
      },
    },
  });
  if (!old || old.work.templateId !== template.id) {
    await dropNew();
    return { error: 'Файл не знайдено' };
  }
  if (!mayChangeFile(old, staffId, isAdmin)) {
    await dropNew();
    return { error: CHANGE_FILE_REFUSED };
  }
  // A type whose file rule is NONE (D47) still carrying a file from before:
  // the way out is to delete it once a link is there, never to put in another.
  if (old.work.workType.fileRule === 'NONE') {
    await dropNew();
    return { error: FILE_NOT_ALLOWED };
  }

  const verified = await verifyUploadedObject({
    objectKey: input.objectKey,
    fileName: input.fileName,
    scope: 'science.replaceFile',
    context: { userId, entityId: old.work.id },
  });
  if ('error' in verified) return { error: verified.error };

  let fileId: string;
  try {
    fileId = await db.$transaction(async (tx) => {
      const created = await tx.scienceRecordFile.create({
        data: { ...verified.file, workId: old.work.id, uploadedById: staffId },
        select: { id: true },
      });
      await tx.scienceRecordFile.delete({ where: { id: old.id } });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'ScienceRecordFile',
          entityId: created.id,
          label: verified.file.fileName,
          userId,
          changes: diffChanges(
            { fileName: old.fileName },
            { fileName: verified.file.fileName, pageCount: verified.file.pageCount }
          ),
        },
      });
      return created.id;
    });
  } catch (e) {
    await dropNew();
    if (isUniqueViolation(e) && isDuplicateFileViolation(e)) {
      return { error: DUPLICATE_FILE_MESSAGE };
    }
    return {
      error: parseDbError(
        e,
        'Не вдалося замінити файл. Старий файл залишився без змін',
        'science.replaceFile',
        { userId }
      ),
    };
  }

  // After the commit, never inside it: a swap the person saw succeed must not
  // roll back because R2 was slow to delete.
  await safeDeleteObject('science.replaceFile', old.objectKey, { userId, entityId: old.id });

  revalidatePath('/science-plan');
  return { ok: true, fileId };
}
```

Check `verifyUploadedObject` in `lib/science/file-intake.ts`: if it already drops the object when it returns an error, leave that `return` as is; if it does not, add `await dropNew();` before it and assert the drop in the «fails verification» test. Run — PASS.

- [ ] **Step 5: The query** — `lib/queries/get-science-plan.ts`: select `uploadedById: true` in `files`, and map each file to `{ id, fileName, sizeBytes, pageCount, canChange: r.work.createdById === staffId || file.uploadedById === staffId }`. Add `canChange: boolean` to the `files` element type (doc: «May this person delete or replace this file — `mayChangeFile` on the server says the same»). Update `get-science-plan.test.ts`.

- [ ] **Step 6: The dialog** — `components/science/replace-file-dialog.tsx`: copy `attach-file-dialog.tsx` whole, then change: props `{ fileId: string; fileName: string }`; the action `replaceFile({ fileId, ...file })`; trigger `<Button size="sm" variant="ghost"><RefreshCw className="size-4" />Замінити</Button>`; title «Замінити файл»; description `Новий файл замінить «{fileName}». Старий буде видалено лише після того, як новий збережеться.`; success toast «Файл замінено». Keep its `EvidenceFileField`, `onBusyChange` guard and `DialogProblem` exactly as the attach dialog has them, and rewrite its doc comment for replace.

- [ ] **Step 7: Offer both** — in `RecordRow`, per file: when `file.canChange && !declined`, show `<ReplaceFileDialog fileId={file.id} fileName={file.fileName} />` and `<DeleteFileButton … />` (instead of gating delete on `record.canEdit`). «Видалити» stays visible even when it would be refused — the server's sentence now names «Замінити» as the way out.

- [ ] **Step 8: Check** — `pnpm type-check && pnpm test && pnpm lint`. The owner replaces the only file of a file-proved record in the browser.

- [ ] **Step 9: Ask the owner, then `/commit`** — `feat(science): replace an evidence file in one step`

---

### Task 11: Docs

**Files:**

- Modify: `CLAUDE.md` («Планування наукової роботи» section; folder tree), `docs/work-remaining.md` (§I)

- [ ] **Step 1: CLAUDE.md** — in «Планування наукової роботи (built)» add bullets:
  - **Oversight is a division switch** (`Division.canOverseeScience`, D43) — `canOverseeScience()` in `lib/science/oversight.ts`; ННВ has it by migration. Never match ННВ by `registryKey` for this again.
  - **The fact owes `max(план, 500 × ставка)`** (D37) — `doneTargetHundredths`.
  - **Link and file are two separate rules per вид роботи** (`linkRule`, `fileRule`: REQUIRED / OPTIONAL / NONE, D47). Only when neither is REQUIRED must one of the two be given. The eight D39 types start as link REQUIRED, file NONE.
  - **Every work has an `executedMonth`** (D41), fenced at `SciencePlanTemplate.maxLookbackMonths` months back from the day of entry (D42). Month maths only through `lib/science/execution-month.ts`, which reads Kyiv time.
  - **A co-author changes their own share with `updateRecordHours`** (D46). A file is changed by whoever uploaded it or entered the work; **the only proof is swapped with `replaceFile`, never deleted first**.
    In the folder tree, remove the `science-plans/` line under `my-department/` and, beside `science-plans/` at the top level, say «ADMIN + the division with `canOverseeScience`».
    In «Roles», nothing changes.
- [ ] **Step 2: work-remaining.md §I** — record D36–D46 as done, and list what is next: the analytics plan (НПП page, dashboard tab, charts incl. per month) and the аспіранти import (waits for the file).
- [ ] **Step 3: Ask the owner, then `/commit`** — `docs(science): record the 2026-09-23 rules`

---

## After this plan

**Next plan: the analytics** (`docs/superpowers/specs/2026-09-22-science-analytics-design.md`, build-order steps 2–5): the НПП page at `/science-plans/[staffId]` (ADMIN, `canOverseeScience`, the person), the dashboard tab with its tree, and the charts including execution per month. Write it after this plan lands — it reads `executedMonth` and `canOverseeScience`, and its shape depends on how both behave in the owner's browser.

**Production, once deployed:** the migrations carry every data change; nothing to run by hand. Still owed from before: `pnpm db:bib-placeholder --apply` (report first).
