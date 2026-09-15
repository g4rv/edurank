# Планування наукової роботи — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An НПП can open their science plan for 2026/2027 on each кафедра they work on, add planned work from Додаток III, see the hours add up against 500 × their ставка on that кафедра, and have their завідувач, декан and ННВ read it.

**Architecture:** Four new Prisma models (`SciencePlanTemplate`, `ScienceWorkType`, `SciencePlan`, `SciencePlanRow`) that mirror the rating's template/indicator shape but hold **hours**, not points. The scoring engine is lifted out of `lib/rating/scoring.ts` into a neutral `lib/specs/scoring.ts` and re-exported from its old path, so both subsystems compute from one engine and no rating file changes. The ставка for the target comes from `StakeAllocation` for that person on that кафедра — never from `Staff.employmentRate`, which is the sum across all of them.

**Tech Stack:** Next.js 16 App Router (React 19, Server Components), Prisma 7 + PostgreSQL 16, Zod, Tailwind v4, «Аврора» components, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-15-science-plan-design.md`](../specs/2026-09-15-science-plan-design.md) — **read it before Task 1.** Every «why» lives there; this plan is the «how». The наказ itself and Додаток III are the owner's PDFs, quoted in the spec.

**Out of this stage:** `ScienceWork`, `ScienceRecord`, the pool, joining a work, evidence entry, files, R2. Those are Stages 2 and 3. Nothing here creates a record.

## Global Constraints

- **All UI text in Ukrainian.** No hardcoded Ukrainian strings in logic files — only in components and label maps.
- **Prisma 7:** the client is imported from `@/lib/generated/prisma/client`. Run `pnpm db:generate` after any schema change, **then restart `pnpm dev`** — the running dev server holds the old client and pages selecting a new column crash with `PrismaClientValidationError`.
- **The user starts and stops `pnpm dev` and Docker themselves.** Do not launch them. Ask, and wait.
- **Hours are INTEGER HUNDREDTHS everywhere** — `plannedHundredths`, `rateHundredths`, every sum. Never a float in the database or in any addition. Use `toHundredths` / `fromHundredths` from `lib/stake/units.ts`. This is the rule that exists because the old ставки system used floats and produced a negative «нерозподілено».
- **A year is never taken from client input.** Every mutation resolves the active `SciencePlanTemplate` server-side and compares it against what arrived.
- **Role checks server-side**, in every page and every action — never only in a component. `proxy.ts` is a cookie gate and nothing more.
- **Tests are colocated** next to the file they cover, `.test.ts(x)`.
- **`@/lib/db` is mocked in every test** — `vi.mock('@/lib/db', () => ({ db: { … } }))`. The suite never opens a connection.
- **Errors:** write failures go through `parseDbError(e, '<Ukrainian sentence>', '<scope>.<action>', { userId })`. Never show a code, digest or id to a user. Scope for this work: `science`.
- **Feedback placement:** field problems inline; destructive confirmations in a `Dialog`; only transient outcomes in a toast.
- **«Аврора» only.** New components import from `@/components/aurora/ui/*`. Do not add callers to `@/components/ui/*` — see `docs/aurora.md` §11 and the memory note on the redesign.
- **Even numbers only** in spacing and sizes — no 13/15/17/23.
- **Commit with the `/commit` skill.** Format `<type>(<scope>): <description>`, imperative, ≤72 chars on the first line. The owner decides when to commit — **ask before every commit.**
- Run `pnpm type-check` and `pnpm test` before every commit. The pre-commit hook runs prettier and `tsc --noEmit`.

---

### Task 1: Academic-year helpers

Pure functions, no database. Everything later depends on the string format, so it is settled first and pinned by tests.

**Files:**

- Create: `lib/science/academic-year.ts`
- Test: `lib/science/academic-year.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `ACADEMIC_YEAR_PATTERN: RegExp`
  - `isAcademicYear(value: string): boolean`
  - `stakeYearOf(academicYear: string): number` — «2026/2027» → `2026`
  - `nextAcademicYear(academicYear: string): string` — «2026/2027» → «2027/2028»
  - `currentAcademicYear(now?: Date): string` — a date in September–December is in `<Y>/<Y+1>`; January–August is in `<Y-1>/<Y>`

- [ ] **Step 1: Write the failing test**

Create `lib/science/academic-year.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  currentAcademicYear,
  isAcademicYear,
  nextAcademicYear,
  stakeYearOf,
} from './academic-year';

describe('isAcademicYear', () => {
  it('accepts consecutive years', () => {
    expect(isAcademicYear('2026/2027')).toBe(true);
  });

  it('refuses a gap, a repeat and a reversal', () => {
    expect(isAcademicYear('2026/2028')).toBe(false);
    expect(isAcademicYear('2026/2026')).toBe(false);
    expect(isAcademicYear('2027/2026')).toBe(false);
  });

  it('refuses anything that is not two four-digit years', () => {
    expect(isAcademicYear('2026')).toBe(false);
    expect(isAcademicYear('26/27')).toBe(false);
    expect(isAcademicYear('2026-2027')).toBe(false);
    expect(isAcademicYear(' 2026/2027 ')).toBe(false);
  });
});

describe('stakeYearOf', () => {
  // The ставка comes from the розподіл of the calendar year the навчальний рік
  // OPENS in — September 2026 is spent against the 2026 distribution.
  it('takes the first half', () => {
    expect(stakeYearOf('2026/2027')).toBe(2026);
  });

  it('throws on a malformed year rather than returning NaN', () => {
    expect(() => stakeYearOf('2026')).toThrow('2026');
  });
});

describe('nextAcademicYear', () => {
  it('moves both halves', () => {
    expect(nextAcademicYear('2026/2027')).toBe('2027/2028');
  });
});

describe('currentAcademicYear', () => {
  it('puts September in the year that is starting', () => {
    expect(currentAcademicYear(new Date('2026-09-15T00:00:00Z'))).toBe('2026/2027');
  });

  it('puts May in the year that is ending', () => {
    expect(currentAcademicYear(new Date('2027-05-04T00:00:00Z'))).toBe('2026/2027');
  });

  it('turns over on 1 September, not 1 January', () => {
    expect(currentAcademicYear(new Date('2026-08-31T00:00:00Z'))).toBe('2025/2026');
    expect(currentAcademicYear(new Date('2026-09-01T00:00:00Z'))).toBe('2026/2027');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run lib/science/academic-year.test.ts`
Expected: FAIL — `Failed to resolve import "./academic-year"`.

- [ ] **Step 3: Write the implementation**

Create `lib/science/academic-year.ts`:

```ts
/**
 * A навчальний рік is «2026/2027» — a STRING, not an Int.
 *
 * It is not a year, it is a pair of them, and every document the university
 * prints writes it this way. The rating's calendar `year: Int` is a different
 * thing and the two must never be mixed: наказ №152 plans 2026/2027, while
 * `RatingTemplate` 2026 scores January to December.
 */
export const ACADEMIC_YEAR_PATTERN = /^(\d{4})\/(\d{4})$/;

function halves(academicYear: string): [number, number] | null {
  const match = ACADEMIC_YEAR_PATTERN.exec(academicYear);
  if (!match) return null;
  const from = Number(match[1]);
  const to = Number(match[2]);
  // Consecutive, in order. «2026/2028» is not a навчальний рік, and neither is
  // «2027/2026» — both are typos worth refusing at the door rather than
  // discovering when a target is computed against the wrong розподіл.
  return to === from + 1 ? [from, to] : null;
}

export function isAcademicYear(value: string): boolean {
  return halves(value) !== null;
}

/**
 * Which calendar year's `StakeAllocation` supplies the ставка — the year the
 * навчальний рік OPENS in. September 2026 is worked against the 2026 розподіл.
 *
 * Throws rather than returning NaN: a silent NaN here would make every target
 * on the кафедра read «—» with nothing to point at.
 */
export function stakeYearOf(academicYear: string): number {
  const parsed = halves(academicYear);
  if (!parsed) throw new Error(`Не навчальний рік: "${academicYear}"`);
  return parsed[0];
}

export function nextAcademicYear(academicYear: string): string {
  const parsed = halves(academicYear);
  if (!parsed) throw new Error(`Не навчальний рік: "${academicYear}"`);
  return `${parsed[0] + 1}/${parsed[1] + 1}`;
}

/** September–December belong to the year that is starting; January–August to the one ending. */
export function currentAcademicYear(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const startsThisYear = now.getUTCMonth() >= 8; // 8 = September, zero-based
  const from = startsThisYear ? year : year - 1;
  return `${from}/${from + 1}`;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run lib/science/academic-year.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Type-check, then ask to commit**

Run: `pnpm type-check`
Then ask the owner for permission and commit with `/commit`:
`feat(science): add навчальний рік helpers`

---

### Task 2: The schema

**Files:**

- Modify: `prisma/schema.prisma` — four models, two enums, three back-relations
- Create: `prisma/migrations/<timestamp>_science_plan/migration.sql` (generated)

**Interfaces:**

- Consumes: `lib/science/academic-year.ts` only conceptually — the schema stores the string, nothing validates it at the database level.
- Produces: the Prisma models `SciencePlanTemplate`, `ScienceWorkType`, `SciencePlan`, `SciencePlanRow`, and the enums `SciencePlanStatus`, `ScienceReuse`, `ScienceSharing`. Every later task depends on these exact field names.

- [ ] **Step 1: Add the models**

Append to `prisma/schema.prisma`, after `StakeSandbox` and before `LoginThrottle`, so the workload-planning models sit together and away from the rating's.

```prisma
// ─── Планування наукової роботи (Додаток III до наказу №152) ─────────────────
//
// НЕ рейтинг. The rating scores achievements in БАЛАХ to rank people; Додаток
// III prices the same real-world work in ГОДИНАХ to fill a workload quota
// (наказ №152 п.3: не менше 500 годин на одну науково-педагогічну ставку).
// Two measuring systems over one world, deliberately sharing no rows.
// Full reasoning: docs/superpowers/specs/2026-09-15-science-plan-design.md

enum SciencePlanStatus {
  OPEN
  CLOSED
}

enum ScienceReuse {
  /// A published article, a monograph, a patent — claimable one time, ever.
  ONCE
  /// What the наказ's Примітка column marks «щороку» or «на навчальний рік» —
  /// керівництво аспірантом, гурток, лабораторія, дисертація (2–4 роки).
  YEARLY
}

enum ScienceSharing {
  /// One work, one pool of hours, several authors draw on it.
  SHARED
  /// The work belongs to one person and its hours are theirs alone.
  INDIVIDUAL
}

/// Один навчальний рік планування. The analogue of RatingTemplate, and
/// deliberately a separate table: a навчальний рік spans two calendar years, a
/// rating year does not, and the two are opened and closed by different people.
model SciencePlanTemplate {
  id String @id @default(cuid())

  /// «2026/2027». A STRING — see lib/science/academic-year.ts.
  academicYear String @unique

  /// «№152 від 04.05.2026». Printed on the plan so a person can check the rules
  /// they were planned against.
  orderRef String?

  /// п.3's «не менше 500 годин». A COLUMN rather than a constant: it is set by
  /// a наказ reissued every year, with no obligation to keep the number.
  minHoursPerRate Int @default(500)

  /// Which calendar year's StakeAllocation supplies the ставка. Derived from
  /// academicYear on creation and STORED, so reopening an old template cannot
  /// silently re-target it at a different розподіл.
  stakeYear Int

  status SciencePlanStatus @default(OPEN)

  workTypes ScienceWorkType[]
  plans     SciencePlan[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

/// Один рядок Додатка III.
model ScienceWorkType {
  id         String              @id @default(cuid())
  templateId String
  template   SciencePlanTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  order Int
  /// Stable semantic key — survives renumbering by the next наказ.
  code  String
  /// The printed number: «4», «11». Display and ordering only.
  itemNumber String
  label      String

  /// EvidenceField[] — the SAME spec shape as ActivityType.evidenceFields.
  /// Stage 1 uses only the select options (which variant of the work) and the
  /// number field (сторінки, аркуші, дні); Stage 2 renders the whole form.
  evidenceFields Json
  /// ScoringSpec — the same five kinds. lib/specs/scoring.ts computes from it.
  scoring        Json

  /// Hours per unit. For SELECT kinds the per-option hours live in the spec.
  coefficient Float
  /// The Примітка column: «За 1 сторінку», «Щороку на одного аспіранта».
  unitNote    String?
  /// The «Форма звітності» column: «Екземпляр видання», «Наказ по аспірантурі».
  reportingForm String?

  reuse   ScienceReuse   @default(ONCE)
  sharing ScienceSharing @default(INDIVIDUAL)

  /// Which evidence fields build the WORK's identity, in priority order — e.g.
  /// ["doi", "url", "title"]. A COLUMN, not a code list, for the same reason
  /// `reuse` is one. Unused until Stage 2; seeded now so the catalogue is whole.
  identityFields Json @default("[]")

  /// A link is not enough for this type — a file must be attached. Stage 3.
  requiresFile Boolean @default(false)

  /// Item 6's «Участь в конференціях (мах.5)».
  maxPerYear Int?

  isActive Boolean @default(true)

  planRows SciencePlanRow[]

  @@unique([templateId, code])
}

/// One plan per person per кафедра per навчальний рік. A сумісник on two
/// кафедри has two plans and fills them separately (owner, 2026-09-15).
model SciencePlan {
  id String @id @default(cuid())

  staffId      String
  staff        Staff               @relation(fields: [staffId], references: [id], onDelete: Cascade)
  departmentId String
  department   Department          @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  templateId   String
  template     SciencePlanTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  /// The ставка this plan's target is computed from, in INTEGER HUNDREDTHS.
  /// Refreshed from StakeAllocation while the template is OPEN. `null` means
  /// the розподіл has not reached this кафедра — the page then shows NO target
  /// at all rather than a guess (owner, 2026-09-15).
  rateHundredths Int?

  rows SciencePlanRow[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([staffId, departmentId, templateId])
  @@index([departmentId, templateId])
}

/// An INTENTION. No evidence: in September the article does not exist yet.
model SciencePlanRow {
  id     String      @id @default(cuid())
  planId String
  plan   SciencePlan @relation(fields: [planId], references: [id], onDelete: Cascade)

  workTypeId String
  workType   ScienceWorkType @relation(fields: [workTypeId], references: [id])

  order Int

  /// Which variant was chosen and how many units — the same JSON shape as
  /// Activity.evidence, holding only what the scoring rule reads. For an
  /// article: `{ "kind": "scopus", "pages": 10 }`.
  ///
  /// NOT called `plan`: that name is already the relation back to SciencePlan
  /// on the line above, and Prisma would refuse the model.
  details Json

  /// computedValue × coefficient at the moment of planning, in INTEGER
  /// HUNDREDTHS OF AN HOUR. Frozen like Activity.score: editing the наказ later
  /// must not rewrite a plan already handed in.
  plannedHundredths Int

  /// «стаття у Q2 з історії освіти» — helps the завідувач read the plan.
  note String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([planId])
}
```

Then add the back-relations:

- on `model Staff`, beside the other relation lists: `sciencePlans SciencePlan[]`
- on `model Department`, beside `partTimeStaff`: `sciencePlans SciencePlan[]`

- [ ] **Step 2: Generate the migration**

`prisma migrate dev` is interactive and cannot run here. Follow the project's established route:

Run: `npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20260915120000_science_plan/migration.sql`

Create the directory first if it does not exist. **Read the generated SQL before applying it** — it must contain only `CREATE TABLE`, `CREATE INDEX`, `CREATE TYPE` and `ALTER TABLE … ADD CONSTRAINT` for the new tables. If it contains a `DROP` of anything, stop and report: the schema has drifted and applying it would lose data.

- [ ] **Step 3: Apply it and regenerate the client**

Run: `npx prisma migrate deploy`
Run: `pnpm db:generate`

Then **ask the owner to restart `pnpm dev`** — the running server holds the old client, and every page will crash with `PrismaClientValidationError` until they do.

- [ ] **Step 4: Verify the client has the models**

Run: `pnpm type-check`
Expected: clean. If `db.sciencePlanTemplate` is not a property, `pnpm db:generate` did not run.

- [ ] **Step 5: Ask to commit**

`feat(science): add the science-plan schema`

---

### Task 3: Lift the scoring engine to a neutral module

The engine must not live under `lib/rating/` once two subsystems compute from it. The move is mechanical and **must change no behaviour** — the rating's 1620 tests are the proof.

**Files:**

- Create: `lib/specs/scoring.ts` — the whole current contents of `lib/rating/scoring.ts`
- Create: `lib/specs/scoring.test.ts` — the whole current contents of `lib/rating/scoring.test.ts`, with its import changed to `./scoring`
- Modify: `lib/rating/scoring.ts` — becomes a re-export
- Delete: `lib/rating/scoring.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `lib/specs/scoring.ts` exporting exactly what `lib/rating/scoring.ts` exports today — `computeScore`, `ScoringSpec`, `ScorableType`, `ScoreResult`, `PAGES_PER_AUTHOR_SHEET`. The old path keeps exporting all of them, so **no other file changes in this task.**

- [ ] **Step 1: Copy the module and its tests**

Run: `cp lib/rating/scoring.ts lib/specs/scoring.ts` (create `lib/specs/` first)
Run: `cp lib/rating/scoring.test.ts lib/specs/scoring.test.ts`

In `lib/specs/scoring.ts`, fix the two relative imports — `./activity-types` and `./evidence-fields` become `@/lib/rating/activity-types` and `@/lib/rating/evidence-fields`. Those two modules stay where they are in this stage; only the engine moves.

In `lib/specs/scoring.test.ts` the import `from './scoring'` already resolves correctly. Check any other relative import in it and repoint it at `@/lib/rating/...`.

- [ ] **Step 2: Turn the old path into a re-export**

Replace the whole of `lib/rating/scoring.ts` with:

```ts
/**
 * Moved to `lib/specs/scoring.ts` on 2026-09-15.
 *
 * The engine computes `value × coefficient` and knows nothing about the unit:
 * the rating calls the result БАЛИ, the science plan calls it ГОДИНИ. Once two
 * subsystems compute from it, living under `lib/rating/` was a lie about who
 * owns it.
 *
 * This file stays so that no rating import changed in the move — a rename and a
 * behaviour change must never share a commit. Remove it in a later pass that
 * repoints the callers and does nothing else.
 */
export * from '@/lib/specs/scoring';
```

- [ ] **Step 3: Delete the duplicated test**

Run: `rm lib/rating/scoring.test.ts`

Both copies passing would prove nothing twice and drift apart.

- [ ] **Step 4: Run the WHOLE suite**

Run: `pnpm test`
Expected: the same count as before the move — **1620 passed** — and no file reporting a failed import. If the number differs, a test was lost; find it before going on.

Run: `pnpm type-check`
Expected: clean.

- [ ] **Step 5: Ask to commit**

`refactor(specs): move the scoring engine out of lib/rating`

---

### Task 4: The Додаток III catalogue as seed input

Twenty-six work types out of the наказ's eighteen printed items — an item with two units (доповідь per page, участь per day) is two types, because one type has one scoring rule.

**Files:**

- Create: `lib/science/work-types-2027.ts`
- Test: `lib/science/work-types-2027.test.ts`

**Interfaces:**

- Consumes: `ScoringSpec` from `@/lib/specs/scoring`, `EvidenceField` from `@/lib/rating/evidence-fields`.
- Produces:
  - `interface ScienceWorkTypeDef { code, itemNumber, order, label, kind, coefficient, unitNote?, reportingForm?, reuse, sharing, identityFields, requiresFile?, maxPerYear?, fields }`
  - `SCIENCE_WORK_TYPES_2027: readonly ScienceWorkTypeDef[]` — 26 entries
  - `scienceDbSpecs(def: ScienceWorkTypeDef)` — returns `{ evidenceFields, scoring, coefficient }` ready for a Prisma create, mirroring `dbSpecs` in `lib/rating/db-specs.ts`
  - `SCIENCE_TEMPLATE_2027 = { academicYear: '2026/2027', orderRef: '№152 від 04.05.2026', minHoursPerRate: 500 }`

- [ ] **Step 1: Write the failing test**

This test is the one that catches a mis-typed coefficient, so every number in it comes straight off the printed Додаток III.

Create `lib/science/work-types-2027.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeScore } from '@/lib/specs/scoring';
import { SCIENCE_WORK_TYPES_2027, scienceDbSpecs } from './work-types-2027';

const byCode = (code: string) => {
  const def = SCIENCE_WORK_TYPES_2027.find((d) => d.code === code);
  if (!def) throw new Error(`no work type "${code}"`);
  const { evidenceFields, scoring, coefficient } = scienceDbSpecs(def);
  return { code, coefficient, scoring, evidenceFields };
};

/** Hours the engine computes for this evidence. */
const hours = (code: string, evidence: object) => computeScore(byCode(code), evidence).score;

describe('the catalogue is whole', () => {
  it('has 26 types covering the 18 printed items', () => {
    expect(SCIENCE_WORK_TYPES_2027).toHaveLength(26);
    const items = new Set(SCIENCE_WORK_TYPES_2027.map((d) => d.itemNumber));
    expect(items.size).toBe(18);
  });

  it('has no duplicate code and no duplicate order', () => {
    const codes = SCIENCE_WORK_TYPES_2027.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
    const orders = SCIENCE_WORK_TYPES_2027.map((d) => d.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('names identity fields that its own form actually has', () => {
    for (const def of SCIENCE_WORK_TYPES_2027) {
      const names = new Set(def.fields.map((f) => f.name));
      for (const field of def.identityFields) {
        expect(names, `${def.code} → ${field}`).toContain(field);
      }
    }
  });
});

describe('hours match the printed Додаток III', () => {
  it('п.1 — грант: 400 г за одну програму', () => {
    expect(hours('intl_grant_program', {})).toBe(400);
  });

  it('п.1 — проєкт: 300 керівнику, 100 члену', () => {
    expect(hours('intl_project', { role: 'lead' })).toBe(300);
    expect(hours('intl_project', { role: 'member' })).toBe(100);
  });

  it('п.2 — дисертація: 500 доктора наук, 300 доктора філософії', () => {
    expect(hours('dissertation', { degree: 'doctor' })).toBe(500);
    expect(hours('dissertation', { degree: 'phd' })).toBe(300);
  });

  it('п.3 — монографія 200 і посібник 100 за друкований аркуш', () => {
    expect(hours('monograph', { kind: 'monograph', sheets: 3 })).toBe(600);
    expect(hours('monograph', { kind: 'manual', sheets: 3 })).toBe(300);
  });

  it('п.3 — перевидання: 50 за друкований аркуш', () => {
    expect(hours('monograph_reissue', { sheets: 2 })).toBe(100);
  });

  it('п.4 — стаття, за 1 сторінку, six tiers', () => {
    expect(hours('article', { kind: 'scopus', pages: 10 })).toBe(500);
    expect(hours('article', { kind: 'fahove_b', pages: 10 })).toBe(300);
    expect(hours('article', { kind: 'foreign', pages: 10 })).toBe(200);
    expect(hours('article', { kind: 'journal', pages: 10 })).toBe(150);
    expect(hours('article', { kind: 'proceedings', pages: 10 })).toBe(100);
    expect(hours('article', { kind: 'other', pages: 10 })).toBe(50);
  });

  it('п.5 — заявка: 100 винахід, 40 корисна модель, 30 авторське право', () => {
    expect(hours('ip_application', { kind: 'invention' })).toBe(100);
    expect(hours('ip_application', { kind: 'utility_model' })).toBe(40);
    expect(hours('ip_application', { kind: 'copyright' })).toBe(30);
  });

  it('п.6 — доповідь: 5 / 3 / 2 за сторінку', () => {
    expect(hours('conference_paper', { level: 'international', pages: 4 })).toBe(20);
    expect(hours('conference_paper', { level: 'national', pages: 4 })).toBe(12);
    expect(hours('conference_paper', { level: 'other', pages: 4 })).toBe(8);
  });

  it('п.6 — участь: 6 г за день, не більше 5', () => {
    expect(hours('conference_attendance', { days: 3 })).toBe(18);
    expect(byCode('conference_attendance')).toBeDefined();
    const def = SCIENCE_WORK_TYPES_2027.find((d) => d.code === 'conference_attendance');
    expect(def?.maxPerYear).toBe(5);
  });

  it('п.7 — рецензування, four separate units', () => {
    expect(hours('review_publication', { sheets: 2 })).toBe(20);
    expect(hours('review_dissertation', {})).toBe(50);
    expect(hours('review_intl_project', {})).toBe(30);
    expect(hours('review_article', {})).toBe(10);
  });

  it('п.8 — конкурс: 50 / 40 / 30 за підготовку, 100 за перемогу', () => {
    expect(hours('state_competition_entry', { role: 'lead' })).toBe(50);
    expect(hours('state_competition_entry', { role: 'secretary' })).toBe(40);
    expect(hours('state_competition_entry', { role: 'member' })).toBe(30);
    expect(hours('state_competition_win', {})).toBe(100);
  });

  it('п.9 — госпдоговірне дослідження: 100', () => {
    expect(hours('contract_research', {})).toBe(100);
  });

  it('п.10 — редколегія 100 / 100 / 100 / 50, англомовний супровід 5 за сторінку', () => {
    expect(hours('editorial_board', { role: 'editor_in_chief' })).toBe(100);
    expect(hours('editorial_board', { role: 'managing_editor' })).toBe(100);
    expect(hours('editorial_board', { role: 'secretary' })).toBe(100);
    expect(hours('editorial_board', { role: 'member' })).toBe(50);
    expect(hours('english_support', { pages: 6 })).toBe(30);
  });

  it('п.11 — авторський доробок', () => {
    expect(hours('art_achievement', { kind: 'laureate_intl' })).toBe(100);
    expect(hours('art_achievement', { kind: 'laureate_national' })).toBe(50);
    expect(hours('art_achievement', { kind: 'personal_show' })).toBe(100);
    expect(hours('art_achievement', { kind: 'honoured_person' })).toBe(100);
    expect(hours('art_achievement', { kind: 'prepared_laureate_intl' })).toBe(50);
    expect(hours('art_achievement', { kind: 'prepared_laureate_national' })).toBe(30);
  });

  it('п.12–п.18 — the flat ones', () => {
    expect(hours('phd_supervision', {})).toBe(50);
    expect(hours('expert_review', {})).toBe(50);
    expect(hours('student_group', {})).toBe(50);
    expect(hours('lab_leadership', {})).toBe(100);
    expect(hours('art_publication', {})).toBe(50);
    expect(hours('academic_mobility', {})).toBe(100);
    expect(hours('student_research_win', { place: 'winner' })).toBe(30);
    expect(hours('student_research_win', { place: 'runner_up' })).toBe(20);
  });
});

describe('the flags the наказ dictates', () => {
  it('marks as YEARLY exactly what the Примітка column repeats', () => {
    const yearly = SCIENCE_WORK_TYPES_2027.filter((d) => d.reuse === 'YEARLY').map((d) => d.code);
    expect(yearly.sort()).toEqual(
      [
        'dissertation',
        'editorial_board',
        'lab_leadership',
        'phd_supervision',
        'student_group',
      ].sort()
    );
  });

  it('shares a pool only where a work has co-authors', () => {
    const shared = SCIENCE_WORK_TYPES_2027.filter((d) => d.sharing === 'SHARED').map((d) => d.code);
    expect(shared.sort()).toEqual(
      [
        'article',
        'art_publication',
        'conference_paper',
        'ip_application',
        'monograph',
        'monograph_reissue',
      ].sort()
    );
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run lib/science/work-types-2027.test.ts`
Expected: FAIL — `Failed to resolve import "./work-types-2027"`.

- [ ] **Step 3: Write the catalogue**

Create `lib/science/work-types-2027.ts`. Read `lib/rating/activity-types.ts` first for the `ActivityTypeDef` shape this mirrors, and `lib/rating/db-specs.ts` for what `dbSpecs` does.

```ts
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import type { ScoringSpec } from '@/lib/specs/scoring';
import type { ActivityKind } from '@/lib/rating/activity-types';

/**
 * Додаток III до наказу №152 від 04.05.2026 — SEED INPUT ONLY.
 *
 * After `pnpm db:seed` the database is the truth and this file is history, the
 * same contract `ACTIVITY_TYPES_2026` has with the rating. An ADMIN edits the
 * catalogue at /admin/science-plan/[year]; nobody edits it here.
 *
 * **Twenty-six types from eighteen printed items.** An item that prices two
 * different units is two types, because one type has one scoring rule: п.6 pays
 * 5 г за сторінку for a доповідь and 6 г за день for attendance, and п.7 pays
 * per друкований аркуш, per дисертація, per проєкт and per рецензія.
 *
 * **The authoritative source is the STANDALONE Додаток 3 file**, not the copy
 * bound into the наказ. They differ: item 3 there reads «монографії,
 * підручника, посібника — 200 г./100 г.» against «монографії, підручника —
 * 200 г.» bound in, and item 16 reads 50 г against 56.
 *
 * **`reuse` and `sharing` are first readings of the наказ, not law.** The
 * Примітка column says «щороку» or «на навчальний рік» for five items, and those
 * are YEARLY; everything else is ONCE. SHARED is set where a work genuinely has
 * co-authors. ADMIN can change either on any row, which is the point of their
 * being columns.
 */
export interface ScienceWorkTypeDef {
  code: string;
  /** The printed number in Додаток III — several types may share one. */
  itemNumber: string;
  order: number;
  label: string;
  kind: ActivityKind;
  /** Hours per unit. For SELECT kinds this is 1 and the hours are on the options. */
  coefficient: number;
  /** The Примітка column, verbatim. */
  unitNote?: string;
  /** The Форма звітності column, verbatim. */
  reportingForm?: string;
  reuse: 'ONCE' | 'YEARLY';
  sharing: 'SHARED' | 'INDIVIDUAL';
  /** Field names, in priority order, that build the work's identity in Stage 2. */
  identityFields: readonly string[];
  requiresFile?: boolean;
  maxPerYear?: number;
  fields: readonly EvidenceField[];
}

/** «Назва роботи» — every type has one, and it is the identity of last resort. */
const title: EvidenceField = {
  kind: 'text',
  name: 'title',
  label: 'Назва роботи',
  required: true,
};

/** A page or sheet count the hours multiply by. */
const count = (name: string, label: string): EvidenceField => ({
  kind: 'number',
  name,
  label,
  required: true,
  min: 1,
});

export const SCIENCE_WORK_TYPES_2027: readonly ScienceWorkTypeDef[] = [
  {
    code: 'intl_grant_program',
    itemNumber: '1',
    order: 1,
    label: 'Участь у міжнародних програмах на проведення наукових досліджень з отримання гранту',
    kind: 'FIXED',
    coefficient: 400,
    unitNote: 'За одну програму',
    reportingForm: 'Звіт — грант',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    identityFields: ['title'],
    fields: [title],
  },
  {
    code: 'intl_project',
    itemNumber: '1',
    order: 2,
    label: 'Участь у міжнародних проєктах',
    kind: 'SELECT',
    coefficient: 1,
    reportingForm: 'Звіт-проєкт',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    identityFields: ['title'],
    fields: [
      title,
      {
        kind: 'select',
        name: 'role',
        label: 'Роль у проєкті',
        required: true,
        options: [
          { value: 'lead', label: 'Керівник проєктної групи', points: 300 },
          { value: 'member', label: 'Член проєктної групи', points: 100 },
        ],
      },
    ],
  },
  // … the remaining 20 follow the same shape. Write them in the order of the
  // printed table, keeping `order` dense and `itemNumber` as printed.
] as const;
```

**Write out all 26.** The numbers, labels, Примітка and Форма звітності for every one are in the spec's tables and in the owner's PDF; the test above pins every hour figure. The remaining codes, in order, are:

| order | code                      | item | kind          | hours                                        |
| ----- | ------------------------- | ---- | ------------- | -------------------------------------------- |
| 3     | `dissertation`            | 2    | `SELECT`      | доктор наук 500, доктор філософії 300        |
| 4     | `monograph`               | 3    | `SELECT_MULT` | монографія/підручник 200, посібник 100 × арк |
| 5     | `monograph_reissue`       | 3    | `MULT`        | 50 × друк. аркуші                            |
| 6     | `article`                 | 4    | `SELECT_MULT` | 50 / 30 / 20 / 15 / 10 / 5 × сторінки        |
| 7     | `ip_application`          | 5    | `SELECT`      | 100 / 40 / 30                                |
| 8     | `conference_paper`        | 6    | `SELECT_MULT` | 5 / 3 / 2 × сторінки                         |
| 9     | `conference_attendance`   | 6    | `MULT`        | 6 × днів, `maxPerYear: 5`                    |
| 10    | `review_publication`      | 7    | `MULT`        | 10 × друк. аркуші                            |
| 11    | `review_dissertation`     | 7    | `FIXED`       | 50                                           |
| 12    | `review_intl_project`     | 7    | `FIXED`       | 30                                           |
| 13    | `review_article`          | 7    | `FIXED`       | 10                                           |
| 14    | `state_competition_entry` | 8    | `SELECT`      | 50 / 40 / 30                                 |
| 15    | `state_competition_win`   | 8    | `FIXED`       | 100                                          |
| 16    | `contract_research`       | 9    | `FIXED`       | 100                                          |
| 17    | `editorial_board`         | 10   | `SELECT`      | 100 / 100 / 100 / 50                         |
| 18    | `english_support`         | 10   | `MULT`        | 5 × сторінки                                 |
| 19    | `art_achievement`         | 11   | `SELECT`      | 100 / 50 / 100 / 100 / 50 / 30               |
| 20    | `phd_supervision`         | 12   | `FIXED`       | 50, `YEARLY`                                 |
| 21    | `expert_review`           | 13   | `FIXED`       | 50                                           |
| 22    | `student_group`           | 14   | `FIXED`       | 50, `YEARLY`                                 |
| 23    | `lab_leadership`          | 15   | `FIXED`       | 100, `YEARLY`                                |
| 24    | `art_publication`         | 16   | `FIXED`       | 50                                           |
| 25    | `academic_mobility`       | 17   | `FIXED`       | 100                                          |
| 26    | `student_research_win`    | 18   | `SELECT`      | 30 переможець / 20 призер                    |

**`order` runs 1…26 with no gaps.** The first two are written above as `order: 1` and `order: 2`; the table's first row continues at 3 and its last is 26. Several types share an `itemNumber` — that is the printed number and repeats on purpose.

`phd_supervision` and `student_group` take an extra required text field naming the person or the гурток, and that field is their `identityFields` — it is what makes «той самий аспірант, наступного року» resolvable in Stage 2. `article` takes `identityFields: ['doi', 'url', 'title']` and a `doi` and `url` field alongside `pages`.

Then the converter:

```ts
/**
 * A catalogue def → the columns a ScienceWorkType row carries. Mirrors
 * `dbSpecs` in lib/rating/db-specs.ts, which does the same job for the rating.
 */
export function scienceDbSpecs(def: ScienceWorkTypeDef): {
  evidenceFields: EvidenceField[];
  scoring: ScoringSpec;
  coefficient: number;
} {
  return {
    evidenceFields: [...def.fields],
    // `pageBased` is the rating's «сторінок / 24 / співавторів» rule and is
    // NOT used here: Додаток III prices друковані аркуші directly, and it does
    // not divide by co-authors at all — the hours are a pool the authors share
    // (Stage 2), which is a different arithmetic entirely.
    scoring: { kind: def.kind },
    coefficient: def.coefficient,
  };
}

export const SCIENCE_TEMPLATE_2027 = {
  academicYear: '2026/2027',
  orderRef: '№152 від 04.05.2026',
  minHoursPerRate: 500,
} as const;
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run lib/science/work-types-2027.test.ts`
Expected: PASS. Every failure here is a mis-typed number from the наказ — fix the catalogue, never the expectation, without checking the PDF again.

- [ ] **Step 5: Type-check and ask to commit**

Run: `pnpm type-check` and `pnpm test`
`feat(science): add the Додаток III catalogue`

---

### Task 5: Seed the 2026/2027 template

**Files:**

- Modify: `prisma/seed.ts` — a new function called from the catalogue (safe, idempotent) path
- Test: none. Seeds are verified by running them; the catalogue's numbers are already pinned by Task 4.

**Interfaces:**

- Consumes: `SCIENCE_WORK_TYPES_2027`, `scienceDbSpecs`, `SCIENCE_TEMPLATE_2027` from Task 4; `stakeYearOf` from Task 1.
- Produces: `seedSciencePlan(prisma): Promise<void>`, called from the same place the rating catalogue is seeded.

- [ ] **Step 1: Read the seed's own rules**

Open `prisma/seed.ts` and read its header block in full before changing anything. It explains which of the four modes does what, and that `pnpm db:seed` — the one this task extends — is the **PRODUCTION-safe, idempotent** one that also runs as part of `pnpm db:reset`.

- [ ] **Step 2: Add the seeding function**

```ts
/**
 * Додаток III до наказу №152 — the 2026/2027 planning catalogue.
 *
 * Idempotent and production-safe, like the rating catalogue beside it: the
 * template is upserted on `academicYear`, every work type on
 * `[templateId, code]`. It creates no accounts, writes no plans and overwrites
 * nothing a person typed.
 *
 * `status` is set on CREATE only. An ADMIN who has closed 2026/2027 must not
 * find it reopened by a deploy that happened to run the seed.
 */
async function seedSciencePlan(prisma: PrismaClient): Promise<void> {
  const { academicYear, orderRef, minHoursPerRate } = SCIENCE_TEMPLATE_2027;

  const template = await prisma.sciencePlanTemplate.upsert({
    where: { academicYear },
    update: { orderRef, minHoursPerRate },
    create: {
      academicYear,
      orderRef,
      minHoursPerRate,
      stakeYear: stakeYearOf(academicYear),
      status: 'OPEN',
    },
  });

  for (const def of SCIENCE_WORK_TYPES_2027) {
    const { evidenceFields, scoring, coefficient } = scienceDbSpecs(def);
    const shape = {
      order: def.order,
      itemNumber: def.itemNumber,
      label: def.label,
      evidenceFields: evidenceFields as unknown as Prisma.InputJsonValue,
      scoring: scoring as unknown as Prisma.InputJsonValue,
      coefficient,
      unitNote: def.unitNote ?? null,
      reportingForm: def.reportingForm ?? null,
      reuse: def.reuse,
      sharing: def.sharing,
      identityFields: [...def.identityFields] as unknown as Prisma.InputJsonValue,
      requiresFile: def.requiresFile ?? false,
      maxPerYear: def.maxPerYear ?? null,
    };

    await prisma.scienceWorkType.upsert({
      where: { templateId_code: { templateId: template.id, code: def.code } },
      // `isActive` is deliberately absent from the update: an ADMIN who
      // deactivated an indicator must not find it back after a deploy.
      update: shape,
      create: { ...shape, templateId: template.id, code: def.code },
    });
  }

  console.log(`  Додаток III: ${SCIENCE_WORK_TYPES_2027.length} видів роботи (${academicYear})`);
}
```

- [ ] **Step 3: Call it from the catalogue path**

Find where the rating catalogue is seeded in the default (no-flag) branch of `prisma/seed.ts` and add `await seedSciencePlan(prisma);` directly after it. Do **not** add it to the `--test` destructive path separately — that path already runs the catalogue.

- [ ] **Step 4: Run it, twice**

Ask the owner to run it, or run it yourself if the database is reachable:

Run: `pnpm db:seed`
Expected: `Додаток III: 26 видів роботи (2026/2027)`.

Run: `pnpm db:seed` **again**
Expected: the same line, no error, and no duplicate rows. Idempotence is the whole contract of this seed.

Verify: `npx prisma studio` → `ScienceWorkType` holds 26 rows, all pointing at one `SciencePlanTemplate`.

- [ ] **Step 5: Ask to commit**

`feat(science): seed the 2026/2027 planning catalogue`

---

### Task 6: The target

**Files:**

- Create: `lib/science/target.ts`
- Test: `lib/science/target.test.ts`

**Interfaces:**

- Consumes: `fromHundredths` from `@/lib/stake/units`.
- Produces:
  - `interface PlanTarget { rateHundredths: number | null; targetHundredths: number | null; plannedHundredths: number; shortfallHundredths: number | null }`
  - `planTarget(input: { minHoursPerRate: number; rateHundredths: number | null; plannedHundredths: number }): PlanTarget`
  - `rateForPlan(tx, { staffId, departmentId, stakeYear }): Promise<number | null>` — the ставка on **that** кафедра

- [ ] **Step 1: Write the failing test**

Create `lib/science/target.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { planTarget } from './target';

const target = (rateHundredths: number | null, plannedHundredths = 0) =>
  planTarget({ minHoursPerRate: 500, rateHundredths, plannedHundredths });

describe('planTarget', () => {
  it('is 500 годин on a full ставка', () => {
    expect(target(100).targetHundredths).toBe(50000);
  });

  it('is proportional below a full ставка — наказ п.3', () => {
    expect(target(25).targetHundredths).toBe(12500); // 0,25 → 125 год
    expect(target(75).targetHundredths).toBe(37500); // 0,75 → 375 год
  });

  it('splits a сумісник across two кафедри to 500 in total', () => {
    const primary = target(75).targetHundredths!;
    const additional = target(25).targetHundredths!;
    expect(primary + additional).toBe(50000);
  });

  it('has NO target when the розподіл has not reached this кафедра', () => {
    const t = target(null);
    expect(t.targetHundredths).toBeNull();
    expect(t.shortfallHundredths).toBeNull();
  });

  it('still counts planned hours with no target', () => {
    expect(target(null, 34000).plannedHundredths).toBe(34000);
  });

  it('reports the shortfall and never a negative one', () => {
    expect(target(100, 34000).shortfallHundredths).toBe(16000);
    expect(target(100, 52000).shortfallHundredths).toBe(0);
  });

  it('stays in integers — a third of a ставка does not produce a float', () => {
    const t = target(35, 0);
    expect(Number.isInteger(t.targetHundredths)).toBe(true);
    expect(t.targetHundredths).toBe(17500); // 0,35 × 500 = 175 год
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run lib/science/target.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/science/target.ts`:

```ts
import type { Prisma } from '@/lib/generated/prisma/client';

/**
 * наказ №152 п.3 — «не менше 500 годин на одну науково-педагогічну ставку. У
 * випадках, коли НПП працюють не на ставку, обсяг наукових видів робіт
 * встановлюється пропорційно до фактичного обсягу ставки».
 *
 * Everything is INTEGER HUNDREDTHS. `minHoursPerRate` is whole hours from the
 * template, `rateHundredths` is the ставка, and the product of the two is
 * already in hundredths of an hour — no rounding, no float, by construction.
 */
export interface PlanTarget {
  rateHundredths: number | null;
  /** null when there is no ставка: show no target at all, not a guess. */
  targetHundredths: number | null;
  plannedHundredths: number;
  /** null when there is no target; never negative — an excess is not a shortfall. */
  shortfallHundredths: number | null;
}

export function planTarget(input: {
  minHoursPerRate: number;
  rateHundredths: number | null;
  plannedHundredths: number;
}): PlanTarget {
  const { minHoursPerRate, rateHundredths, plannedHundredths } = input;
  if (rateHundredths === null) {
    return {
      rateHundredths: null,
      targetHundredths: null,
      plannedHundredths,
      shortfallHundredths: null,
    };
  }
  const targetHundredths = minHoursPerRate * rateHundredths;
  return {
    rateHundredths,
    targetHundredths,
    plannedHundredths,
    shortfallHundredths: Math.max(0, targetHundredths - plannedHundredths),
  };
}

/**
 * The ставка this person holds ON THIS кафедра — never `Staff.employmentRate`,
 * which is the SUM across every кафедра that pays them (`lib/stake/employment-rate.ts`).
 * Using the sum would target each of a сумісник's two plans at their whole
 * workload and ask for 500 годин twice.
 *
 * `null` when the кафедра has not saved its розподіл. Measured on dev
 * 2026-09-15: 306 of 328 НПП had no allocation at all, so this is the common
 * case in September, not an edge case.
 */
export async function rateForPlan(
  tx: Prisma.TransactionClient,
  where: { staffId: string; departmentId: string; stakeYear: number }
): Promise<number | null> {
  const allocation = await tx.stakeAllocation.findFirst({
    where: {
      staffId: where.staffId,
      distribution: { departmentId: where.departmentId, year: where.stakeYear },
    },
    select: { proposedHundredths: true },
  });
  return allocation?.proposedHundredths ?? null;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run lib/science/target.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Type-check and ask to commit**

`feat(science): compute the 500-hour target from the кафедра's ставка`

---

### Task 7: Queries

**Files:**

- Create: `lib/queries/get-science-template.ts`
- Create: `lib/queries/get-science-plan.ts`
- Create: `lib/queries/list-science-plans.ts`
- Test: `lib/queries/list-science-plans.test.ts`

**Interfaces:**

- Consumes: `planTarget` from `lib/science/target`, `ON_ROSTER` and `onDepartment` from `lib/queries/roster`.
- Produces:
  - `getActiveScienceTemplate(): Promise<ScienceTemplate | null>` — the OPEN template with its active work types
  - `listScienceTemplates(): Promise<{ academicYear, status }[]>`
  - `getSciencePlan(staffId, departmentId, templateId)` — the plan with its rows, each row's work type label, and the computed `PlanTarget`
  - `planDepartmentsFor(staffId): Promise<{ id, name }[]>` — every кафедра a person needs a plan on: their primary plus every `StaffDepartment`
  - `listSciencePlans({ templateId, departmentIds })` — one row per person per кафедра, for the head and ННВ views

- [ ] **Step 1: Write the failing test**

The query worth testing is the one with the сумісництво trap. Create `lib/queries/list-science-plans.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { staff: { findMany: vi.fn() }, sciencePlanTemplate: { findUnique: vi.fn() } },
}));

import { db } from '@/lib/db';
import { listSciencePlans } from './list-science-plans';

const mockStaff = db.staff.findMany as unknown as Mock;
const mockTemplate = db.sciencePlanTemplate.findUnique as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockTemplate.mockResolvedValue({ id: 't1', academicYear: '2026/2027', minHoursPerRate: 500 });
  mockStaff.mockResolvedValue([]);
});

const conditions = () => mockStaff.mock.calls[0][0].where as Record<string, unknown>;

describe('who is on a кафедра', () => {
  it('finds сумісники as well as the кафедра’s own staff', async () => {
    await listSciencePlans({ templateId: 't1', departmentIds: ['d1'] });

    expect(conditions().OR).toEqual([
      { departmentId: { in: ['d1'] } },
      { partTimeDepartments: { some: { departmentId: { in: ['d1'] } } } },
    ]);
  });

  it('excludes archived people — a plan is about the current year', async () => {
    await listSciencePlans({ templateId: 't1', departmentIds: ['d1'] });
    expect(conditions().archivedAt).toBeNull();
  });

  it('asks only for НПП', async () => {
    await listSciencePlans({ templateId: 't1', departmentIds: ['d1'] });
    expect(conditions().isNpp).toBe(true);
  });
});

describe('the rows it returns', () => {
  it('gives a person one row per кафедра they work on', async () => {
    mockStaff.mockResolvedValue([
      {
        id: 's1',
        lastName: 'Перчук',
        firstName: 'Оксана',
        patronymic: 'І',
        departmentId: 'd1',
        department: { id: 'd1', name: 'Кафедра історії' },
        partTimeDepartments: [{ department: { id: 'd2', name: 'Кафедра філософії' } }],
        sciencePlans: [],
      },
    ]);

    const rows = await listSciencePlans({ templateId: 't1', departmentIds: ['d1', 'd2'] });

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.departmentName).sort()).toEqual(
      ['Кафедра філософії', 'Кафедра історії'].sort()
    );
  });

  it('shows no target where the кафедра has no розподіл', async () => {
    mockStaff.mockResolvedValue([
      {
        id: 's1',
        lastName: 'Іваненко',
        firstName: 'Іван',
        patronymic: 'І',
        departmentId: 'd1',
        department: { id: 'd1', name: 'Кафедра історії' },
        partTimeDepartments: [],
        sciencePlans: [{ departmentId: 'd1', rateHundredths: null, rows: [] }],
      },
    ]);

    const [row] = await listSciencePlans({ templateId: 't1', departmentIds: ['d1'] });
    expect(row.targetHundredths).toBeNull();
    expect(row.plannedHundredths).toBe(0);
  });

  it('sums the planned hours of an existing plan', async () => {
    mockStaff.mockResolvedValue([
      {
        id: 's1',
        lastName: 'Іваненко',
        firstName: 'Іван',
        patronymic: 'І',
        departmentId: 'd1',
        department: { id: 'd1', name: 'Кафедра історії' },
        partTimeDepartments: [],
        sciencePlans: [
          {
            departmentId: 'd1',
            rateHundredths: 100,
            rows: [{ plannedHundredths: 30000 }, { plannedHundredths: 12000 }],
          },
        ],
      },
    ]);

    const [row] = await listSciencePlans({ templateId: 't1', departmentIds: ['d1'] });
    expect(row.plannedHundredths).toBe(42000);
    expect(row.targetHundredths).toBe(50000);
    expect(row.shortfallHundredths).toBe(8000);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/queries/list-science-plans.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the three query modules**

`lib/queries/get-science-template.ts`:

```ts
import { cache } from 'react';
import { db } from '@/lib/db';

/**
 * The OPEN planning template with the work types somebody may plan against.
 *
 * `cache()`d per request: the plan page asks for it once for the picker and
 * once to price a row, the same reason `getActiveTemplate` is cached.
 *
 * **There is exactly one OPEN template at a time**, by convention rather than
 * by a constraint — /admin/science-plan closes the previous year before opening
 * the next. `findFirst` on the newest is therefore the right read, and a second
 * OPEN year shows as the newer of the two rather than as an error nobody can act on.
 */
export const getActiveScienceTemplate = cache(async function getActiveScienceTemplate() {
  return db.sciencePlanTemplate.findFirst({
    where: { status: 'OPEN' },
    orderBy: { academicYear: 'desc' },
    select: {
      id: true,
      academicYear: true,
      orderRef: true,
      minHoursPerRate: true,
      stakeYear: true,
      status: true,
      workTypes: {
        where: { isActive: true },
        select: {
          id: true,
          code: true,
          label: true,
          itemNumber: true,
          coefficient: true,
          unitNote: true,
          reportingForm: true,
          evidenceFields: true,
          scoring: true,
          maxPerYear: true,
        },
        orderBy: { order: 'asc' },
      },
    },
  });
});

export type ScienceTemplate = NonNullable<Awaited<ReturnType<typeof getActiveScienceTemplate>>>;
export type ScienceWorkTypeRow = ScienceTemplate['workTypes'][number];

/** Every planning year, newest first — for the admin list and the year picker. */
export const listScienceTemplates = cache(async function listScienceTemplates() {
  return db.sciencePlanTemplate.findMany({
    select: { id: true, academicYear: true, status: true, orderRef: true, minHoursPerRate: true },
    orderBy: { academicYear: 'desc' },
  });
});
```

`lib/queries/get-science-plan.ts` — `planDepartmentsFor` and `getSciencePlan`. `planDepartmentsFor` returns the primary кафедра when there is one, plus every `StaffDepartment`, deduplicated and sorted by name; it is the switcher's source, and **an НПП with no primary кафедра still gets their additional one** (owner, 2026-08-26). `getSciencePlan` loads the plan with `rows: { include: { workType: … }, orderBy: { order: 'asc' } }`, sums `plannedHundredths`, and returns `planTarget({ minHoursPerRate, rateHundredths, plannedHundredths })` beside the rows. When no plan row exists yet it returns `null` for the plan and a target computed from a freshly read `rateForPlan` — so the page can show the target before anybody has typed a thing.

`lib/queries/list-science-plans.ts`:

```ts
import { db } from '@/lib/db';
import { ON_ROSTER } from './roster';
import { planTarget } from '@/lib/science/target';

export interface SciencePlanRowSummary {
  staffId: string;
  fullName: string;
  departmentId: string;
  departmentName: string;
  /** True where this кафедра is not their primary one — the «Сумісник» badge. */
  isPartTime: boolean;
  rateHundredths: number | null;
  targetHundredths: number | null;
  plannedHundredths: number;
  shortfallHundredths: number | null;
  hasPlan: boolean;
}

/**
 * One row per person PER КАФЕДРА — a сумісник appears twice, because they have
 * two plans and each кафедра's head reads their own.
 *
 * `departmentId` alone does not answer «who is on this кафедра»: spread the
 * сумісництво condition, the same rule as `onDepartments` in roster.ts.
 */
export async function listSciencePlans(input: {
  templateId: string;
  departmentIds: readonly string[];
}): Promise<SciencePlanRowSummary[]> {
  const template = await db.sciencePlanTemplate.findUnique({
    where: { id: input.templateId },
    select: { id: true, academicYear: true, minHoursPerRate: true },
  });
  if (!template) return [];

  const ids = [...input.departmentIds];
  const staff = await db.staff.findMany({
    where: {
      ...ON_ROSTER,
      isNpp: true,
      OR: [
        { departmentId: { in: ids } },
        { partTimeDepartments: { some: { departmentId: { in: ids } } } },
      ],
    },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
      partTimeDepartments: { select: { department: { select: { id: true, name: true } } } },
      sciencePlans: {
        where: { templateId: template.id },
        select: {
          departmentId: true,
          rateHundredths: true,
          rows: { select: { plannedHundredths: true } },
        },
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  const rows: SciencePlanRowSummary[] = [];
  for (const person of staff) {
    const places = [
      ...(person.department ? [{ dept: person.department, isPartTime: false }] : []),
      ...person.partTimeDepartments.map((p) => ({ dept: p.department, isPartTime: true })),
    ].filter((p) => ids.includes(p.dept.id));

    for (const place of places) {
      const plan = person.sciencePlans.find((p) => p.departmentId === place.dept.id);
      const plannedHundredths = (plan?.rows ?? []).reduce((sum, r) => sum + r.plannedHundredths, 0);
      const target = planTarget({
        minHoursPerRate: template.minHoursPerRate,
        rateHundredths: plan?.rateHundredths ?? null,
        plannedHundredths,
      });
      rows.push({
        staffId: person.id,
        fullName: [person.lastName, person.firstName, person.patronymic].filter(Boolean).join(' '),
        departmentId: place.dept.id,
        departmentName: place.dept.name,
        isPartTime: place.isPartTime,
        ...target,
        hasPlan: Boolean(plan),
      });
    }
  }
  return rows;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run lib/queries/list-science-plans.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Type-check and ask to commit**

`feat(science): add the science-plan queries`

---

### Task 8: Plan actions

**Files:**

- Create: `app/(dashboard)/science-plan/actions.ts`
- Test: `app/(dashboard)/science-plan/actions.test.ts`

**Interfaces:**

- Consumes: `getActiveScienceTemplate`, `rateForPlan`, `computeScore`, `evidenceSchemaFor` (the Zod generator in `validations/activity-evidence.ts`), `parseDbError` from `lib/log`, `diffChanges` from `lib/audit`.
- Produces:
  - `savePlanRow(input: { departmentId: string; rowId?: string; workTypeId: string; details: unknown; note?: string }): Promise<{ ok: true } | { error: string }>`
  - `deletePlanRow(rowId: string): Promise<{ ok: true } | { error: string }>`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/science-plan/actions.test.ts`. Read `app/(dashboard)/stakes/actions.test.ts` first for how this project mocks a transaction.

```ts
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => {
  const tx = {
    staff: { findUnique: vi.fn() },
    scienceWorkType: { findFirst: vi.fn() },
    sciencePlan: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    sciencePlanRow: {
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    stakeAllocation: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { db: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
vi.mock('@/lib/queries/get-science-template', () => ({ getActiveScienceTemplate: vi.fn() }));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { savePlanRow, deletePlanRow } from './actions';

const mockAuth = auth as unknown as Mock;
const mockTemplate = getActiveScienceTemplate as unknown as Mock;

/** The article type: SELECT_MULT, 50 г per page for Scopus. */
const ARTICLE = {
  id: 'wt1',
  templateId: 't1',
  code: 'article',
  label: 'Наукова стаття',
  isActive: true,
  coefficient: 1,
  maxPerYear: null,
  scoring: { kind: 'SELECT_MULT' },
  evidenceFields: [
    { kind: 'text', name: 'title', label: 'Назва', required: true },
    {
      kind: 'select',
      name: 'kind',
      label: 'Видання',
      required: true,
      options: [
        { value: 'scopus', label: 'Scopus / WoS', points: 50 },
        { value: 'fahove_b', label: 'Фахове «Б»', points: 30 },
      ],
    },
    { kind: 'number', name: 'pages', label: 'Сторінок', required: true, min: 1 },
  ],
};

const GOOD = {
  departmentId: 'd1',
  workTypeId: 'wt1',
  details: { title: 'Про щось', kind: 'scopus', pages: 10 },
};

/** Signed in, НПП, primary кафедра d1, сумісництво on d2. */
function signedIn() {
  mockAuth.mockResolvedValue({ user: { id: 'u1', staffId: 's1', role: 'USER' } });
  (db.staff.findUnique as Mock).mockResolvedValue({
    id: 's1',
    isNpp: true,
    departmentId: 'd1',
    partTimeDepartments: [{ departmentId: 'd2' }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  signedIn();
  mockTemplate.mockResolvedValue({
    id: 't1',
    academicYear: '2026/2027',
    status: 'OPEN',
    stakeYear: 2026,
    minHoursPerRate: 500,
  });
  (db.scienceWorkType.findFirst as Mock).mockResolvedValue(ARTICLE);
  (db.sciencePlan.findUnique as Mock).mockResolvedValue({
    id: 'p1',
    staffId: 's1',
    departmentId: 'd1',
    rateHundredths: 100,
  });
  (db.sciencePlanRow.count as Mock).mockResolvedValue(0);
  (db.stakeAllocation.findFirst as Mock).mockResolvedValue({ proposedHundredths: 100 });
  (db.sciencePlanRow.create as Mock).mockResolvedValue({ id: 'r1' });
});

describe('savePlanRow — who may write', () => {
  it('refuses an anonymous caller', async () => {
    mockAuth.mockResolvedValue(null);
    expect(await savePlanRow(GOOD)).toEqual({ error: expect.any(String) });
    expect(db.sciencePlanRow.create).not.toHaveBeenCalled();
  });

  it('refuses somebody who is not an НПП', async () => {
    (db.staff.findUnique as Mock).mockResolvedValue({
      id: 's1',
      isNpp: false,
      departmentId: 'd1',
      partTimeDepartments: [],
    });
    expect(await savePlanRow(GOOD)).toEqual({ error: expect.any(String) });
    expect(db.sciencePlanRow.create).not.toHaveBeenCalled();
  });

  it('refuses a кафедра the person does not work on', async () => {
    expect(await savePlanRow({ ...GOOD, departmentId: 'd9' })).toEqual({
      error: expect.any(String),
    });
    expect(db.sciencePlanRow.create).not.toHaveBeenCalled();
  });

  it('accepts the additional кафедра of a сумісник', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue(null);
    (db.sciencePlan.create as Mock).mockResolvedValue({ id: 'p2', rateHundredths: 25 });
    (db.stakeAllocation.findFirst as Mock).mockResolvedValue({ proposedHundredths: 25 });

    expect(await savePlanRow({ ...GOOD, departmentId: 'd2' })).toEqual({ ok: true });
    expect(db.sciencePlanRow.create).toHaveBeenCalled();
  });
});

describe('savePlanRow — which year and which type', () => {
  it('refuses when there is no open template', async () => {
    mockTemplate.mockResolvedValue(null);
    expect(await savePlanRow(GOOD)).toEqual({ error: expect.any(String) });
  });

  it('refuses when the template is CLOSED', async () => {
    mockTemplate.mockResolvedValue({
      id: 't1',
      status: 'CLOSED',
      stakeYear: 2026,
      minHoursPerRate: 500,
    });
    expect(await savePlanRow(GOOD)).toEqual({ error: expect.any(String) });
    expect(db.sciencePlanRow.create).not.toHaveBeenCalled();
  });

  it('looks the work type up by template as well as by id', async () => {
    await savePlanRow(GOOD);
    expect((db.scienceWorkType.findFirst as Mock).mock.calls[0][0].where).toMatchObject({
      id: 'wt1',
      templateId: 't1',
      isActive: true,
    });
  });

  it('refuses a work type that does not answer that lookup', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue(null);
    expect(await savePlanRow(GOOD)).toEqual({ error: expect.any(String) });
  });

  it('refuses when the type is already at maxPerYear', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue({ ...ARTICLE, maxPerYear: 5 });
    (db.sciencePlanRow.count as Mock).mockResolvedValue(5);
    expect(await savePlanRow(GOOD)).toEqual({ error: expect.stringContaining('5') });
    expect(db.sciencePlanRow.create).not.toHaveBeenCalled();
  });
});

describe('savePlanRow — the hours', () => {
  it('refuses details the type’s own schema rejects', async () => {
    expect(
      await savePlanRow({ ...GOOD, details: { title: '', kind: 'scopus', pages: 0 } })
    ).toEqual({
      error: expect.any(String),
    });
    expect(db.sciencePlanRow.create).not.toHaveBeenCalled();
  });

  it('stores INTEGER HUNDREDTHS — 10 сторінок × 50 г = 500 год → 50000', async () => {
    await savePlanRow(GOOD);
    const written = (db.sciencePlanRow.create as Mock).mock.calls[0][0].data;
    expect(written.plannedHundredths).toBe(50000);
    expect(Number.isInteger(written.plannedHundredths)).toBe(true);
  });

  it('prices the chosen variant, not the first one', async () => {
    await savePlanRow({ ...GOOD, details: { title: 'Про щось', kind: 'fahove_b', pages: 10 } });
    expect((db.sciencePlanRow.create as Mock).mock.calls[0][0].data.plannedHundredths).toBe(30000);
  });
});

describe('savePlanRow — the plan and its ставка', () => {
  it('creates the plan on first save, copying the кафедра’s ставка', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue(null);
    (db.sciencePlan.create as Mock).mockResolvedValue({ id: 'p1', rateHundredths: 100 });

    await savePlanRow(GOOD);

    expect((db.sciencePlan.create as Mock).mock.calls[0][0].data).toMatchObject({
      staffId: 's1',
      departmentId: 'd1',
      templateId: 't1',
      rateHundredths: 100,
    });
  });

  it('leaves rateHundredths null when the кафедра has no розподіл', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue(null);
    (db.stakeAllocation.findFirst as Mock).mockResolvedValue(null);
    (db.sciencePlan.create as Mock).mockResolvedValue({ id: 'p1', rateHundredths: null });

    await savePlanRow(GOOD);

    expect((db.sciencePlan.create as Mock).mock.calls[0][0].data.rateHundredths).toBeNull();
  });

  it('asks for the allocation on THIS кафедра and THIS stake year', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue(null);
    (db.sciencePlan.create as Mock).mockResolvedValue({ id: 'p1', rateHundredths: 100 });

    await savePlanRow(GOOD);

    expect((db.stakeAllocation.findFirst as Mock).mock.calls[0][0].where).toMatchObject({
      staffId: 's1',
      distribution: { departmentId: 'd1', year: 2026 },
    });
  });

  it('refreshes a stale ставка on a later save', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue({
      id: 'p1',
      staffId: 's1',
      departmentId: 'd1',
      rateHundredths: null,
    });
    (db.stakeAllocation.findFirst as Mock).mockResolvedValue({ proposedHundredths: 75 });

    await savePlanRow(GOOD);

    expect((db.sciencePlan.update as Mock).mock.calls[0][0].data).toMatchObject({
      rateHundredths: 75,
    });
  });

  it('writes an audit entry', async () => {
    await savePlanRow(GOOD);
    expect(db.auditLog.create).toHaveBeenCalled();
  });
});

describe('deletePlanRow', () => {
  beforeEach(() => {
    (db.sciencePlanRow.findUnique as Mock).mockResolvedValue({
      id: 'r1',
      plannedHundredths: 50000,
      workType: { label: 'Наукова стаття' },
      plan: { id: 'p1', staffId: 's1', templateId: 't1' },
    });
  });

  it('refuses a row on somebody else’s plan', async () => {
    (db.sciencePlanRow.findUnique as Mock).mockResolvedValue({
      id: 'r1',
      plannedHundredths: 50000,
      workType: { label: 'Наукова стаття' },
      plan: { id: 'p9', staffId: 's9', templateId: 't1' },
    });
    expect(await deletePlanRow('r1')).toEqual({ error: expect.any(String) });
    expect(db.sciencePlanRow.delete).not.toHaveBeenCalled();
  });

  it('refuses when the template is CLOSED', async () => {
    mockTemplate.mockResolvedValue({
      id: 't1',
      status: 'CLOSED',
      stakeYear: 2026,
      minHoursPerRate: 500,
    });
    expect(await deletePlanRow('r1')).toEqual({ error: expect.any(String) });
    expect(db.sciencePlanRow.delete).not.toHaveBeenCalled();
  });

  it('refuses a row that no longer exists, without throwing', async () => {
    (db.sciencePlanRow.findUnique as Mock).mockResolvedValue(null);
    expect(await deletePlanRow('r1')).toEqual({ error: expect.any(String) });
  });

  it('deletes its own row and writes an audit entry', async () => {
    expect(await deletePlanRow('r1')).toEqual({ ok: true });
    expect((db.sciencePlanRow.delete as Mock).mock.calls[0][0].where).toEqual({ id: 'r1' });
    expect(db.auditLog.create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run "app/(dashboard)/science-plan/actions.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the actions**

Key rules the implementation must follow, each of which the tests above pin:

- `'use server'` at the top of the file.
- The session is read with `auth()`; `session.user.staffId` must exist and the Staff row must be `isNpp`. **Being an НПП is what grants this, not the USER role** — a проректор who teaches plans a year like anybody else.
- The кафедра is checked against the person's own placements: `staff.departmentId === departmentId` **or** a `StaffDepartment` row for it. Never trust the id that arrived.
- The template is resolved server-side with `getActiveScienceTemplate()`; a `CLOSED` or absent template refuses with «Планування на цей рік закрито».
- The work type is loaded by id **and** `templateId`, so a type from another year cannot be planned.
- Evidence is parsed with the schema generated from the type's own `evidenceFields` — the same generator the rating uses.
- Hours: `computeScore(type, evidence).score` is whole hours; store `toHundredths(score)`. Never store the float.
- The plan is upserted inside the same transaction as the row, and `rateHundredths` is filled from `rateForPlan(tx, …)` **on create and on every save while the template is OPEN**, so a розподіл saved in November reaches a plan typed in September without anybody touching it.
- Every write goes through `parseDbError(e, 'Не вдалося зберегти. Зміни не застосовано', 'science.savePlanRow', { userId: session.user.id })`.
- `revalidatePath('/science-plan')` after a successful write.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run "app/(dashboard)/science-plan/actions.test.ts"`
Expected: PASS, 22 tests.

- [ ] **Step 5: Type-check, run the whole suite, ask to commit**

`feat(science): let an НПП plan a row of наукова робота`

---

### Task 9: The НПП page

**Files:**

- Create: `app/(dashboard)/science-plan/page.tsx`
- Create: `app/(dashboard)/science-plan/loading.tsx`
- Create: `components/science/plan-view.tsx` — the кафедра switcher, the target band and the row list
- Create: `components/science/add-plan-row-dialog.tsx` — pick a work type, its variant and the quantity
- Create: `components/science/plan-total.tsx` — «Заплановано 340 з 500 год»

**Interfaces:**

- Consumes: `getActiveScienceTemplate`, `getSciencePlan`, `planDepartmentsFor`, `savePlanRow`, `deletePlanRow`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Read the design rules**

Read `docs/aurora.md` §1 (surfaces), §3 (colour), §4 (type) and §7 (form controls) before writing any markup. The rules that will bite here: a surface separates by getting **lighter** and taking a border, never darker; `--brand` marks the primary action and nothing else; only a small status badge may carry a hue.

- [ ] **Step 2: Build the page**

`page.tsx`, in this order:

```tsx
const session = await auth();
if (!session) redirect('/login');
const staffId = session.user.staffId;
if (!staffId) redirect('/profile');
const staff = await getStaff(staffId, true);
if (!staff?.isNpp) redirect('/profile');
```

Then: `planDepartmentsFor(staffId)`. **Zero кафедри** → an `EmptyState` saying the person is on no кафедра and to contact the відділ кадрів — do not crash. **One** → no switcher. **Two** → a switcher; the chosen one comes from `?dept=`, defaulting to the primary.

No active template → `EmptyState`: «Планування наукової роботи на цей рік ще не відкрито».

- [ ] **Step 3: The target band**

Three states, and the third is the common one in September:

| State                        | Shows                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| target met                   | «Заплановано 520 з 500 год» + a `--success` check                                         |
| below target                 | «Заплановано 340 з 500 год — бракує 160 год», `--warning`                                 |
| `rateHundredths` is **null** | «Заплановано 340 год. Ставку на цій кафедрі ще не визначено — ціль буде показано пізніше» |

**Never block a save because of the target** — it is shown and nothing more, the same rule as the ставки grid.

- [ ] **Step 4: The add dialog**

A `Dialog` from `@/components/aurora/ui/dialog` (not `AlertDialog` — that is for confirmations). Three controls: the work type (a `Select` grouped by `itemNumber`), then, driven by the chosen type's `evidenceFields`, its `select` field if it has one and its `number` field if it has one, plus the optional note. Show the type's `unitNote` under the quantity («За 1 сторінку») and its `reportingForm` as a hint («Форма звітності: Екземпляр видання»), because that is what a person will have to produce later.

Show the hours the row will be worth, live, as they type — computed on the client with the same `computeScore` the server uses. The server recomputes and is the truth; the client figure is a preview.

- [ ] **Step 5: Drive it in a browser**

Ask the owner to have `pnpm dev` running, then open `/science-plan` as an НПП and walk it: add a row → toast → the row appears → the total moves → delete → the total moves back. Check it at **400px** as well; these are iPhone users.

- [ ] **Step 6: Type-check, test, ask to commit**

`feat(science): build the НПП planning screen`

---

### Task 10: The кафедра view

**Files:**

- Create: `app/(dashboard)/my-department/science-plans/page.tsx`
- Create: `app/(dashboard)/my-department/science-plans/loading.tsx`
- Create: `components/science/department-plans-table.tsx`

**Interfaces:**

- Consumes: `listSciencePlans`, `scopeOf` from `lib/queries/scope`, `getActiveScienceTemplate`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: The guard**

`scopeOf(session.user.staffId)` returns the кафедра ids this person oversees — **a завідувач's own, and every кафедра of a декан's faculty.** An empty array means they oversee nothing: redirect to `/profile`.

**Read-only. There is no edit path on this page for anybody**, декан or завідувач (owner, 2026-09-15). Do not add one «while we are here».

- [ ] **Step 2: The table**

Columns: ПІБ, кафедра (only when the person oversees more than one), ставка, ціль, заплановано, бракує, стан. Sort: people under target first, then alphabetically — the page exists to find who has not planned.

Two badges, and nothing else carries a hue: «Сумісник» in `--warning` on a `isPartTime` row (that person's hours come out of two plans), and «Немає плану» in `--warning` where `hasPlan` is false.

A row with a null target shows «—» in ціль and бракує, not a zero. Zero is a number somebody will act on; «—» is the truth.

- [ ] **Step 3: Type-check, test, ask to commit**

`feat(science): show a кафедра's plans to its head and декан`

---

### Task 11: The ННВ view

**Files:**

- Create: `app/(dashboard)/science-plans/page.tsx`
- Create: `app/(dashboard)/science-plans/loading.tsx`
- Create: `components/science/all-plans-view.tsx`

**Interfaces:**

- Consumes: `listSciencePlans`, `listDepartments`, `listFaculties`, `getEditorDivisionId` and the ННВ `registryKey` lookup.
- Produces: nothing other tasks consume.

- [ ] **Step 1: The guard**

ADMIN, or an EDITOR whose division is ННВ. **Match the division by `registryKey`, never by `name`** — the name is editable on `/divisions`, and matching on it is how a re-added catalogue indicator once ended up with no verifying division. Follow how `canModerateRating` in `lib/rating/moderation.ts` resolves this today and reuse it rather than writing a second lookup.

- [ ] **Step 2: The page**

The same table as Task 10, over every кафедра, with a факультет filter and a кафедра filter in the URL (`?faculty=&dept=`). Add a summary strip above it: скільки НПП мають план, скільки під ціллю, скільки без ставки.

**The кафедра filter must not cancel the факультет filter.** That exact bug was found and fixed in the rating (`audit-2026-08-27` finding #6): picking a кафедра leaves the факультет in the URL, and a primary-only faculty condition then hid every сумісник. Use `onFaculty` from `lib/queries/roster.ts`.

- [ ] **Step 3: Type-check, test, ask to commit**

`feat(science): give ННВ the university-wide plan list`

---

### Task 12: Admin — the planning years

**Files:**

- Create: `app/(dashboard)/admin/science-plan/page.tsx`
- Create: `app/(dashboard)/admin/science-plan/actions.ts`
- Test: `app/(dashboard)/admin/science-plan/actions.test.ts`
- Create: `components/science/admin/year-list.tsx`

**Interfaces:**

- Consumes: `requireAdmin` from `lib/permissions`, `nextAcademicYear` and `stakeYearOf` from Task 1, `listScienceTemplates`.
- Produces: `createScienceYear(academicYear, orderRef, minHoursPerRate)`, `cloneScienceYear(fromAcademicYear)`, `openScienceYear(id)`, `closeScienceYear(id)`.

- [ ] **Step 1: Write the failing tests**

Create `app/(dashboard)/admin/science-plan/actions.test.ts`, mocking `@/lib/permissions`, `@/lib/db` and `next/cache`:

```ts
describe('permission', () => {
  it('refuses a non-admin on every action', async () => {
    (requireAdmin as Mock).mockResolvedValue(null);
    for (const call of [
      () => createScienceYear({ academicYear: '2027/2028', orderRef: null, minHoursPerRate: 500 }),
      () => cloneScienceYear('2026/2027'),
      () => openScienceYear('t1'),
      () => closeScienceYear('t1'),
    ]) {
      expect(await call()).toEqual({ error: 'Недостатньо прав' });
    }
    expect(db.sciencePlanTemplate.create).not.toHaveBeenCalled();
  });
});

describe('createScienceYear', () => {
  it('refuses a malformed навчальний рік', async () => {
    expect(
      await createScienceYear({ academicYear: '2027', orderRef: null, minHoursPerRate: 500 })
    ).toEqual({ error: expect.any(String) });
    expect(
      await createScienceYear({ academicYear: '2027/2029', orderRef: null, minHoursPerRate: 500 })
    ).toEqual({ error: expect.any(String) });
  });

  it('refuses a year that already exists', async () => {
    (db.sciencePlanTemplate.findUnique as Mock).mockResolvedValue({ id: 't1' });
    expect(
      await createScienceYear({ academicYear: '2026/2027', orderRef: null, minHoursPerRate: 500 })
    ).toEqual({ error: expect.stringContaining('2026/2027') });
  });

  it('derives stakeYear from the first half and creates it CLOSED', async () => {
    (db.sciencePlanTemplate.findUnique as Mock).mockResolvedValue(null);
    await createScienceYear({ academicYear: '2027/2028', orderRef: 'N160', minHoursPerRate: 500 });
    expect((db.sciencePlanTemplate.create as Mock).mock.calls[0][0].data).toMatchObject({
      academicYear: '2027/2028',
      stakeYear: 2027,
      status: 'CLOSED',
    });
  });
});

describe('cloneScienceYear', () => {
  beforeEach(() => {
    (db.sciencePlanTemplate.findUnique as Mock).mockImplementation(({ where }) =>
      where.academicYear === '2026/2027'
        ? Promise.resolve({
            id: 't1',
            academicYear: '2026/2027',
            minHoursPerRate: 500,
            workTypes: [
              {
                code: 'article',
                order: 1,
                itemNumber: '4',
                label: 'Наукова стаття',
                coefficient: 1,
                evidenceFields: [{ kind: 'number', name: 'pages' }],
                scoring: { kind: 'SELECT_MULT' },
                unitNote: 'За 1 сторінку',
                reportingForm: 'Екземпляр видання',
                reuse: 'ONCE',
                sharing: 'SHARED',
                identityFields: ['pages'],
                requiresFile: false,
                maxPerYear: null,
                isActive: true,
              },
            ],
          })
        : Promise.resolve(null)
    );
  });

  it('refuses when the source year does not exist', async () => {
    expect(await cloneScienceYear('2019/2020')).toEqual({ error: expect.any(String) });
  });

  it('creates the NEXT year, closed, and copies every work type with its JSON', async () => {
    await cloneScienceYear('2026/2027');

    expect((db.sciencePlanTemplate.create as Mock).mock.calls[0][0].data).toMatchObject({
      academicYear: '2027/2028',
      stakeYear: 2027,
      status: 'CLOSED',
    });
    expect((db.scienceWorkType.create as Mock).mock.calls[0][0].data).toMatchObject({
      code: 'article',
      reuse: 'ONCE',
      sharing: 'SHARED',
      scoring: { kind: 'SELECT_MULT' },
      identityFields: ['pages'],
    });
  });
});

describe('openScienceYear', () => {
  it('closes whatever else is open, in the same transaction', async () => {
    await openScienceYear('t2');
    expect((db.sciencePlanTemplate.updateMany as Mock).mock.calls[0][0]).toMatchObject({
      where: { status: 'OPEN', id: { not: 't2' } },
      data: { status: 'CLOSED' },
    });
    expect((db.sciencePlanTemplate.update as Mock).mock.calls[0][0]).toMatchObject({
      where: { id: 't2' },
      data: { status: 'OPEN' },
    });
  });
});

describe('closeScienceYear', () => {
  it('is a no-op on a year that is already closed', async () => {
    (db.sciencePlanTemplate.findUnique as Mock).mockResolvedValue({ id: 't1', status: 'CLOSED' });
    expect(await closeScienceYear('t1')).toEqual({ ok: true });
    expect(db.sciencePlanTemplate.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Write the actions**

`cloneScienceYear` follows `cloneTemplate` in `app/(dashboard)/admin/rating/actions.ts:60` — read it first. The differences: there are no sections to remap, the new year's `academicYear` comes from `nextAcademicYear`, and `stakeYear` is recomputed with `stakeYearOf` rather than copied.

**A cloned year copies the JSON**, so reshaping 2027/2028 can never touch 2026/2027. That is what makes reopening an old year for a correction safe.

- [ ] **Step 4: Run the tests and watch them pass.**

- [ ] **Step 5: Build the page** — a list of years with status, work-type count, `Кст`-style actions (open / close / clone), following `/admin/rating`'s layout.

- [ ] **Step 6: Type-check, test, ask to commit**

`feat(science): manage planning years`

---

### Task 13: Admin — the catalogue editor

**Files:**

- Create: `app/(dashboard)/admin/science-plan/[year]/page.tsx`
- Create: `app/(dashboard)/admin/science-plan/[year]/actions.ts`
- Test: `app/(dashboard)/admin/science-plan/[year]/actions.test.ts`
- Create: `components/science/admin/work-type-dialog.tsx`
- Create: `components/science/admin/work-type-list.tsx`

**Interfaces:**

- Consumes: `requireAdmin`, `specProblems` from `lib/rating/db-specs.ts` (read it — it is the contract between a field set and its scoring rule), the evidence-field builder in `components/admin/evidence-field-builder.tsx` as the pattern.
- Produces: `saveWorkType(input)`, `toggleWorkTypeActive(id)`, `reorderWorkTypes(ids)`.

- [ ] **Step 1: Write the failing tests**

Create `app/(dashboard)/admin/science-plan/[year]/actions.test.ts`:

```ts
const VALID = {
  templateId: 't1',
  code: 'article',
  itemNumber: '4',
  label: 'Наукова стаття',
  coefficient: 1,
  scoring: { kind: 'SELECT_MULT' },
  evidenceFields: [
    {
      kind: 'select',
      name: 'kind',
      label: 'Видання',
      required: true,
      options: [{ value: 'scopus', label: 'Scopus', points: 50 }],
    },
    { kind: 'number', name: 'pages', label: 'Сторінок', required: true, min: 1 },
  ],
  unitNote: 'За 1 сторінку',
  reportingForm: 'Екземпляр видання',
  reuse: 'ONCE',
  sharing: 'SHARED',
  identityFields: ['pages'],
  requiresFile: false,
  maxPerYear: null,
};

it('refuses a non-admin', async () => {
  (requireAdmin as Mock).mockResolvedValue(null);
  expect(await saveWorkType(VALID)).toEqual({ error: 'Недостатньо прав' });
});

it('refuses a duplicate code in the same template', async () => {
  (db.scienceWorkType.findFirst as Mock).mockResolvedValue({ id: 'other' });
  expect(await saveWorkType(VALID)).toEqual({ error: expect.stringContaining('article') });
});

it('refuses a field set its scoring rule cannot work with', async () => {
  // SELECT_MULT needs both a select carrying points and a number field —
  // `specProblems` is the contract, and it must run before anything is written.
  const broken = {
    ...VALID,
    evidenceFields: [{ kind: 'text', name: 'title', label: 'Назва', required: true }],
  };
  expect(await saveWorkType(broken)).toEqual({ error: expect.any(String) });
  expect(db.scienceWorkType.create).not.toHaveBeenCalled();
});

it('refuses identityFields naming a field the form does not have', async () => {
  // Stage 2's dedup reads these names. A typo here would silently stop the
  // reuse rule working, with nothing on screen to show it.
  expect(await saveWorkType({ ...VALID, identityFields: ['doi'] })).toEqual({
    error: expect.stringContaining('doi'),
  });
});

it('allows reuse and sharing to change on a type that already has rows', async () => {
  (db.sciencePlanRow.count as Mock).mockResolvedValue(12);
  expect(await saveWorkType({ ...VALID, id: 'wt1', reuse: 'YEARLY' })).toEqual({ ok: true });
  expect(db.auditLog.create).toHaveBeenCalled();
});

it('deactivating keeps existing rows and only hides it from the picker', async () => {
  (db.scienceWorkType.findUnique as Mock).mockResolvedValue({
    id: 'wt1',
    isActive: true,
    templateId: 't1',
  });
  expect(await toggleWorkTypeActive('wt1')).toEqual({ ok: true });
  expect((db.scienceWorkType.update as Mock).mock.calls[0][0].data).toEqual({ isActive: false });
  expect(db.sciencePlanRow.deleteMany).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Write the actions and the editor.** Model the dialog on `components/admin/activity-type-dialog.tsx`, with the science-only columns added: `unitNote`, `reportingForm`, `reuse`, `sharing`, `identityFields`, `requiresFile`.

Label `reuse` and `sharing` in plain Ukrainian with the consequence spelled out, not the enum:

- `ONCE` → «Один раз назавжди» / `YEARLY` → «Щороку заново (аспірант, гурток, лабораторія)»
- `SHARED` → «Години діляться між співавторами» / `INDIVIDUAL` → «Години належать одній особі»

- [ ] **Step 4: Run the tests and watch them pass.**

- [ ] **Step 5: Type-check, test, ask to commit**

`feat(science): edit the Додаток III catalogue`

---

### Task 14: Navigation, labels and documents

**Files:**

- Modify: `components/sidebar.tsx`
- Modify: `lib/labels.ts` — `FIELD_LABELS` for every new field a mutation diffs
- Modify: `CLAUDE.md`
- Modify: `docs/work-remaining.md`

**Interfaces:**

- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: The sidebar**

Read `components/sidebar.tsx:100-210` first — the three groups are split by **whose data a screen is about**, and a new link goes in the group that matches, not at the end.

- «Особисте», for `isNpp`: **«План наукової роботи»** → `/science-plan`, icon `ClipboardList`
- «Управління», for a head or декан: **«Плани кафедри»** → `/my-department/science-plans`
- «Управління», for ННВ and ADMIN: **«Плани наукової роботи»** → `/science-plans`
- «Адміністрування», ADMIN: **«Планування науки»** → `/admin/science-plan`

Check the labels against what is already there — «Мій рейтинг» and «Мої здобувачі» sit in the same group, and two links that read alike are a coin toss for the person using them.

- [ ] **Step 2: `FIELD_LABELS`**

Add a Ukrainian label for every field the audit log will render: `academicYear`, `orderRef`, `minHoursPerRate`, `rateHundredths`, `plannedHundredths`, `workTypeId`, `reuse`, `sharing`, `identityFields`, `requiresFile`, `unitNote`, `reportingForm`, `maxPerYear`, `note`. Without these the audit page renders raw column names.

- [ ] **Step 3: `CLAUDE.md`**

Add a «Планування наукової роботи» section beside «Характеристика» and «Розподіл ставок», pointing at the spec. State the four things that are easy to get wrong:

- hours are integer hundredths, never floats;
- the ставка is the **per-кафедра** one from `StakeAllocation`, never `Staff.employmentRate`;
- a навчальний рік is a string («2026/2027»), not the rating's `Int`;
- one plan per person **per кафедра**.

Add the new routes to the folder tree.

- [ ] **Step 4: `docs/work-remaining.md`**

Record Stage 1 as shipped and Stages 2 and 3 as outstanding, with a line naming what each contains. Follow the file's own rule: move things out of it when they ship, do not strike them through.

- [ ] **Step 5: Final verification**

Run: `pnpm type-check` — clean
Run: `pnpm lint` — clean
Run: `pnpm test` — every test passes, and the count is **1620 plus what this stage added**

Ask the owner to walk the four screens in a browser, at desktop and at 400px, before this is called done.

- [ ] **Step 6: Ask to commit**

`feat(science): wire the planning screens into the navigation`

---

## Self-review against the spec

| Spec section                | Covered by                                                              |
| --------------------------- | ----------------------------------------------------------------------- |
| D1 план + факт              | Stage 1 builds план only, as the spec's staging says. Факт is Stage 2   |
| D2 Додаток III only         | Task 4 — 22 types, 18 printed items                                     |
| D3 fully separate           | Task 2 — new tables; Task 3 shares only the engine                      |
| D4 who reads                | Tasks 10, 11                                                            |
| D5 DB catalogue, clonable   | Tasks 2, 5, 12, 13                                                      |
| D6 per кафедра              | Task 2 unique index; Tasks 7, 9                                         |
| D7 target                   | Task 6                                                                  |
| D8 no ставка → no target    | Task 6, Task 9 step 3, Task 10 step 2                                   |
| D9 shown, never blocked     | Task 9 step 3                                                           |
| D10 reuse flag              | Task 2 column, Task 4 seeding, Task 13 editing. **Enforced in Stage 2** |
| D11 evidence mandatory      | Stage 2 — a plan row has no evidence by design                          |
| D12 R2                      | Stage 3                                                                 |
| D13 own tables, shared code | Tasks 2, 3                                                              |
| D14–D17 the pool            | Stage 2 — no `ScienceWork` in this plan                                 |
| D18 декан inspects          | Task 10 step 1                                                          |
| D19 export later            | Not in this plan                                                        |

**Known gap, deliberate:** `identityFields`, `reuse`, `sharing` and `requiresFile` are seeded and editable in Stage 1 but nothing reads them until Stage 2. Task 13's test pins `identityFields` against the form's own field names so that a catalogue edited now cannot break the dedup built later.
