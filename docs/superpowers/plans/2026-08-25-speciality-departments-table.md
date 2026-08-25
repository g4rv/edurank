# Випускові кафедри as a table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move «which кафедра graduates which спеціальність» out of a hardcoded,
name-matched constant into a database table keyed by id, editable by ADMIN.

**Architecture:** A `SpecialityDepartment` join table with two real foreign keys,
the same shape `StaffDepartment` already uses. A server-side loader reads it into
a `Map<specialityName, departmentId[]>`. The origin decision (`own` / `other` /
`unknown`) becomes a pure function over that map, computed on the server and
handed to the client already decided — today it is computed inside a client
component, which a database read cannot be. `SPECIALITY_DEPARTMENTS` survives as
seed input only, the same way `ACTIVITY_TYPES_2026` did after the template editor.

**Tech Stack:** Prisma 7 + PostgreSQL, Next.js 16 App Router, Vitest.

**Spec:** No separate spec document. The decision was taken in conversation on
2026-08-25; the Background section below is the spec, and every claim in it was
verified against the code that day.

---

## Background — why this changes

`lib/specialities/departments.ts` holds `SPECIALITY_DEPARTMENTS`: 40
спеціальностей mapped to 30 unique кафедра **names**. Its own header records the
decision that put it there (2026-08-12):

> A constant rather than a table with an editing UI: it moves about once a year,
> a wrong row is a one-line patch, and a table nobody maintains goes stale
> without anybody noticing.

**That premise no longer holds** (owner, 2026-08-25). The university is
reorganising: fewer факультети, кафедри merged and renamed. This is not one row a
year; it is most of the table at once, and after it the ADMIN cannot fix their own
structure without a developer and a deploy.

**The defect is name-matching.** `isKnownDepartment` compares a кафедра's editable
`name` against the constant. CLAUDE.md already records this exact failure for
another entity:

> **Divisions are identified by `registryKey`, never by `name`.** The name is
> editable on /divisions; matching on it left a re-added catalogue indicator with
> no verifying division and blanked the export's «Дані внесені» column.

A rename on `/departments` silently breaks every link here. Nothing throws,
nothing is logged — the chips just go grey and the create form starts warning
about a кафедра that has existed for years.

**What this map does NOT do**, and must not start doing: it does not restrict
anything. Its header is explicit that an НПП may recruit onto any programme and
the bonus follows the recruiter (confirmed 2026-08-10), which is why `Speciality`
carries no `departmentId` and must not gain one. This is a many-to-many **display**
mapping — six спеціальності already have two owner кафедри — so a join table is
the right shape and does not touch that rule.

**Blast radius today** (all display, no calculation, no money):

| File                                           | Use                                                     |
| ---------------------------------------------- | ------------------------------------------------------- |
| `components/stake/bonus-cell.tsx:88-91`        | chip colour: своя / чужа / невідома кафедра             |
| `lib/queries/get-stake-distribution.ts:278`    | `knownDepartment` flag feeding that cell                |
| `components/department/department-form.tsx:87` | the amber «немає в довіднику» warning                   |
| `lib/students/accepted.ts:130`                 | кафедри listed under a speciality in the student picker |

## Global Constraints

- **Integer ids only.** Every link is a foreign key to `Department.id` /
  `Speciality.id`. No code in this plan may compare кафедра names to decide a
  link. Name comparison survives in exactly one place — the one-off backfill
  script of Task 4, which exists to turn names into ids once.
- **Display only.** Nothing here may gate, refuse, or alter a ставка, a bonus, a
  rating or a claim. `Speciality` must not gain a `departmentId`.
- **Prod is live and cannot be seeded** (`[[prod-no-more-seeds]]`). Data reaches
  production through a one-off script in `prisma/` with a dry-run default and an
  `--apply` flag, never through `db:seed*`.
- **Empty table must degrade, not break.** Until the backfill runs, the loader
  falls back to the constant so production keeps behaving exactly as it does
  today. The fallback is removed in Task 9, only after prod is verified.
- All UI text in Ukrainian. Tests colocated, `.test.ts` beside the file.
- Every mutation writes an `AuditLog` row via `diffChanges`, per CLAUDE.md.
- Run `pnpm db:generate` after any schema change, and restart `pnpm dev`
  (`[[dev-server-holds-prisma-client]]`).

## File Structure

**Create**

- `prisma/migrations/<timestamp>_speciality_departments/migration.sql` — the table.
- `lib/specialities/origin.ts` — pure `originOf` / `knowsDepartment` over an id map.
- `lib/specialities/origin.test.ts`
- `lib/queries/get-speciality-departments.ts` — loads the map, falls back to the constant.
- `lib/queries/get-speciality-departments.test.ts`
- `prisma/link-speciality-departments.ts` — one-off backfill, dry-run default.
- `components/admin/speciality-departments-cell.tsx` — the ADMIN editor cell.

**Modify**

- `prisma/schema.prisma` — the model, plus relations on `Speciality` and `Department`.
- `lib/queries/list-student-claims.ts` — `BonusBySpeciality` gains `origin`.
- `lib/queries/get-stake-distribution.ts:278` — pass ids, not names.
- `components/stake/bonus-cell.tsx` — render `entry.origin`, stop computing it.
- `components/department/department-form.tsx` — take `known` as a prop.
- `app/(dashboard)/departments/new/page.tsx`, `app/(dashboard)/departments/[id]/edit/page.tsx` — supply that prop.
- `lib/students/accepted.ts` — `registerOptions` takes the owner map.
- `app/(dashboard)/achievements/students/page.tsx`, `app/(dashboard)/achievements/students/actions.ts` — supply it.
- `lib/queries/list-stake-settings.ts` — `listSpecialityNorms` returns owner кафедри.
- `app/(dashboard)/admin/stakes/norms/page.tsx` — the new column.
- `app/(dashboard)/admin/stakes/actions.ts` — `linkSpecialityDepartment` / `unlinkSpecialityDepartment`.
- `lib/specialities/departments.ts` — demote the constant to seed input.
- `prisma/seed.ts` — seed the join table on a fresh database.
- `CLAUDE.md` — record the new rule.

---

### Task 1: The table

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_speciality_departments/migration.sql` (generated)

**Interfaces:**

- Produces: model `SpecialityDepartment` with composite id `[specialityId, departmentId]`;
  `Speciality.departments: SpecialityDepartment[]`; `Department.specialities: SpecialityDepartment[]`.

Nothing reads this table yet. Deploying this task alone changes no behaviour.

- [ ] **Step 1: Add the model**

In `prisma/schema.prisma`, directly after `model SpecialityNorm` (currently ends line 572):

```prisma
// Випускові кафедри — which кафедра graduates which спеціальність.
//
// **DISPLAY ONLY.** It does not restrict anything. An НПП may recruit a student
// onto any programme in the university and the bonus follows the RECRUITER
// wherever the student ends up studying (confirmed 2026-08-10) — which is why
// `Speciality` carries no `departmentId` and must not gain one. This table
// exists so the «Здобувачі» column can tell a завідувач whether the students
// their people brought in went onto their OWN кафедра's programmes or somebody
// else's. Those are different pieces of work and the head weighs them.
//
// A TABLE and not the constant it replaced (owner, 2026-08-25). The constant
// matched кафедри by NAME, and the name is editable on /departments: the 2026
// reorganisation renames most of them, and every link would have broken in
// silence — grey chips, no error, nothing in the log. This is the same lesson
// `Division.registryKey` records. Foreign keys cannot break on a rename, and
// `onDelete: Cascade` means a кафедра that is dissolved takes its rows with it.
//
// Many-to-many because six спеціальності are taught by more than one кафедра.
model SpecialityDepartment {
  specialityId String
  speciality   Speciality @relation(fields: [specialityId], references: [id], onDelete: Cascade)
  departmentId String
  department   Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@id([specialityId, departmentId])
  @@index([departmentId])
}
```

- [ ] **Step 2: Add the two back-relations**

In `model Speciality` (line 539), after `claims StudentClaim[]`:

```prisma
  departments SpecialityDepartment[]
```

In `model Department` (line 146), after `stakeSandboxes StakeSandbox[]`:

```prisma
  specialities SpecialityDepartment[]
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:migrate --name speciality_departments`
Expected: a new folder under `prisma/migrations/`, and `CREATE TABLE "SpecialityDepartment"` in its `migration.sql`.

- [ ] **Step 4: Regenerate the client and check it compiles**

Run: `pnpm db:generate && pnpm type-check`
Expected: no output from either.

Restart `pnpm dev` if it is running — it holds the old client.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "db(schema): add SpecialityDepartment, the випускові кафедри link"
```

---

### Task 2: The pure origin decision

**Files:**

- Create: `lib/specialities/origin.ts`
- Test: `lib/specialities/origin.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type SpecialityOrigin = 'own' | 'other' | 'unknown'` (re-exported; the same
    union `lib/specialities/departments.ts` exports today)
  - `type SpecialityOwners = ReadonlyMap<string, readonly string[]>` — speciality
    NAME → owner department **ids**
  - `originOf(owners: SpecialityOwners, speciality: string, departmentId: string): SpecialityOrigin`
  - `knowsDepartment(owners: SpecialityOwners, departmentId: string): boolean`

Pure, synchronous, no Prisma import. Task 5 calls it on the server.

- [ ] **Step 1: Write the failing test**

Create `lib/specialities/origin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { knowsDepartment, originOf, type SpecialityOwners } from './origin';

// «Психологія» is taught by two кафедри — one of the six that are, which is why
// the value is a list and not a single id.
const owners: SpecialityOwners = new Map([
  ['Економіка', ['dep-econ']],
  ['Психологія', ['dep-psy', 'dep-practical-psy']],
  ['Ветеринарна медицина', []],
]);

describe('originOf', () => {
  it('is own when the кафедра graduates that спеціальність', () => {
    expect(originOf(owners, 'Економіка', 'dep-econ')).toBe('own');
  });

  it('is own for either кафедра of a shared спеціальність', () => {
    expect(originOf(owners, 'Психологія', 'dep-psy')).toBe('own');
    expect(originOf(owners, 'Психологія', 'dep-practical-psy')).toBe('own');
  });

  it('is other when somebody else graduates it', () => {
    expect(originOf(owners, 'Психологія', 'dep-econ')).toBe('other');
  });

  // «We do not know», never «somebody else's» — telling a head their people
  // recruit for strangers is a claim we cannot support.
  it('is unknown for a спеціальність nobody is recorded as graduating', () => {
    expect(originOf(owners, 'Ветеринарна медицина', 'dep-econ')).toBe('unknown');
    expect(originOf(owners, 'Астрономія', 'dep-econ')).toBe('unknown');
  });

  it('is unknown for a кафедра that graduates nothing at all', () => {
    expect(originOf(owners, 'Економіка', 'dep-brand-new')).toBe('unknown');
  });
});

describe('knowsDepartment', () => {
  it('is true for a кафедра that graduates something', () => {
    expect(knowsDepartment(owners, 'dep-econ')).toBe(true);
    expect(knowsDepartment(owners, 'dep-practical-psy')).toBe(true);
  });

  it('is false for one that graduates nothing', () => {
    expect(knowsDepartment(owners, 'dep-brand-new')).toBe(false);
  });

  it('is false for an empty map', () => {
    expect(knowsDepartment(new Map(), 'dep-econ')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test lib/specialities/origin`
Expected: FAIL — `Failed to resolve import "./origin"`.

- [ ] **Step 3: Write the implementation**

Create `lib/specialities/origin.ts`:

```ts
/**
 * Where a recruited student's спеціальність sits relative to one кафедра.
 *
 * Pure and synchronous on purpose: the decision is needed per chip in a CLIENT
 * component, which cannot read the database. The server loads the map once
 * (`lib/queries/get-speciality-departments.ts`), decides here, and hands the
 * answer down already made.
 *
 * Keyed by department **id**. Names are editable and the 2026 reorganisation
 * changes most of them — see the model comment on `SpecialityDepartment`.
 */
export type SpecialityOrigin = 'own' | 'other' | 'unknown';

/** Спеціальність NAME → the ids of the кафедри that graduate it */
export type SpecialityOwners = ReadonlyMap<string, readonly string[]>;

/**
 * `unknown` is a real third answer, not a fallback we tolerate.
 *
 * A кафедра nobody has linked yet, or a спеціальність nobody graduates, means we
 * do not know. Reporting either as `other` would tell a завідувач their people
 * recruit for strangers, which is a claim we cannot support.
 */
export function originOf(
  owners: SpecialityOwners,
  speciality: string,
  departmentId: string
): SpecialityOrigin {
  if (!knowsDepartment(owners, departmentId)) return 'unknown';

  const ids = owners.get(speciality);
  if (!ids || ids.length === 0) return 'unknown';

  return ids.includes(departmentId) ? 'own' : 'other';
}

/** Does this кафедра graduate anything at all? */
export function knowsDepartment(owners: SpecialityOwners, departmentId: string): boolean {
  for (const ids of owners.values()) {
    if (ids.includes(departmentId)) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm test lib/specialities/origin`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/specialities/origin.ts lib/specialities/origin.test.ts
git commit -m "feat(specialities): decide випускова-кафедра origin from ids, not names"
```

---

### Task 3: The loader, with the fallback that keeps prod safe

**Files:**

- Create: `lib/queries/get-speciality-departments.ts`
- Test: `lib/queries/get-speciality-departments.test.ts`

**Interfaces:**

- Consumes: `SpecialityOwners` from Task 2; `SPECIALITY_DEPARTMENTS`, `normaliseDepartmentName` from `lib/specialities/departments.ts`.
- Produces:
  - `getSpecialityOwners(): Promise<SpecialityOwners>` — ids, from the table
  - `getSpecialityOwnerNames(): Promise<ReadonlyMap<string, readonly string[]>>` — speciality NAME → кафедра NAMES, for display only (Task 7 uses it)

- [ ] **Step 1: Write the failing test**

Create `lib/queries/get-speciality-departments.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    specialityDepartment: { findMany: vi.fn() },
    department: { findMany: vi.fn() },
  },
}));

import { db } from '@/lib/db';
import { getSpecialityOwners } from './get-speciality-departments';

const mockLinks = db.specialityDepartment.findMany as unknown as Mock;
const mockDepartments = db.department.findMany as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockDepartments.mockResolvedValue([]);
});

describe('getSpecialityOwners', () => {
  it('groups the rows by спеціальність name', async () => {
    mockLinks.mockResolvedValue([
      { departmentId: 'dep-psy', speciality: { name: 'Психологія' } },
      { departmentId: 'dep-practical-psy', speciality: { name: 'Психологія' } },
      { departmentId: 'dep-econ', speciality: { name: 'Економіка' } },
    ]);

    const owners = await getSpecialityOwners();

    expect(owners.get('Психологія')).toEqual(['dep-psy', 'dep-practical-psy']);
    expect(owners.get('Економіка')).toEqual(['dep-econ']);
  });

  // The safety net. Until the backfill of Task 4 has run on a database, the
  // table is empty and production must behave exactly as it does today.
  it('falls back to the constant, matched by name, when the table is empty', async () => {
    mockLinks.mockResolvedValue([]);
    mockDepartments.mockResolvedValue([
      { id: 'dep-econ', name: 'Кафедра економіки' },
      { id: 'dep-unrelated', name: 'Кафедра нової історії' },
    ]);

    const owners = await getSpecialityOwners();

    expect(owners.get('Економіка')).toEqual(['dep-econ']);
  });

  // One row is enough to mean «somebody has started filling this in». Mixing
  // the two sources would hide a half-finished backfill behind old guesses.
  it('does NOT fall back when the table has even one row', async () => {
    mockLinks.mockResolvedValue([{ departmentId: 'dep-econ', speciality: { name: 'Економіка' } }]);

    const owners = await getSpecialityOwners();

    expect(owners.get('Психологія')).toBeUndefined();
    expect(mockDepartments).not.toHaveBeenCalled();
  });

  it('is an empty map when the table is empty and no кафедра name matches', async () => {
    mockLinks.mockResolvedValue([]);
    mockDepartments.mockResolvedValue([{ id: 'dep-x', name: 'Кафедра чогось нового' }]);

    const owners = await getSpecialityOwners();

    expect(owners.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test lib/queries/get-speciality-departments`
Expected: FAIL — cannot resolve `./get-speciality-departments`.

- [ ] **Step 3: Write the implementation**

Create `lib/queries/get-speciality-departments.ts`:

```ts
import { db } from '@/lib/db';
import type { SpecialityOwners } from '@/lib/specialities/origin';
import { SPECIALITY_DEPARTMENTS, normaliseDepartmentName } from '@/lib/specialities/departments';

/**
 * Спеціальність → the кафедри that graduate it, as ids.
 *
 * **The fallback is deliberate and temporary.** Until
 * `pnpm db:link-speciality-departments --apply` has run on a database, the table
 * is empty and this derives the same answer from the old constant by matching
 * кафедра names — so deploying the read path changes nothing anywhere, including
 * on production. One row in the table switches the fallback off entirely:
 * mixing the two would hide a half-finished backfill behind stale guesses.
 *
 * Remove the fallback once production is verified (Task 8 of the plan).
 */
export async function getSpecialityOwners(): Promise<SpecialityOwners> {
  const links = await db.specialityDepartment.findMany({
    select: { departmentId: true, speciality: { select: { name: true } } },
  });

  if (links.length > 0) {
    const owners = new Map<string, string[]>();
    for (const link of links) {
      const list = owners.get(link.speciality.name) ?? [];
      list.push(link.departmentId);
      owners.set(link.speciality.name, list);
    }
    return owners;
  }

  return fallbackFromConstant();
}

/** Спеціальність → кафедра NAMES. Display only — never use it to decide a link. */
export async function getSpecialityOwnerNames(): Promise<ReadonlyMap<string, readonly string[]>> {
  const [owners, departments] = await Promise.all([
    getSpecialityOwners(),
    db.department.findMany({ select: { id: true, name: true } }),
  ]);

  const nameById = new Map(departments.map((d) => [d.id, d.name]));
  const result = new Map<string, string[]>();
  for (const [speciality, ids] of owners) {
    result.set(
      speciality,
      ids.map((id) => nameById.get(id)).filter((name): name is string => !!name)
    );
  }
  return result;
}

/** The ONLY place in the running app that still matches a кафедра by name. */
async function fallbackFromConstant(): Promise<SpecialityOwners> {
  const departments = await db.department.findMany({ select: { id: true, name: true } });
  const idByName = new Map(departments.map((d) => [normaliseDepartmentName(d.name), d.id]));

  const owners = new Map<string, string[]>();
  for (const [speciality, names] of Object.entries(SPECIALITY_DEPARTMENTS)) {
    const ids = names
      .map((name) => idByName.get(normaliseDepartmentName(name)))
      .filter((id): id is string => !!id);
    if (ids.length > 0) owners.set(speciality, ids);
  }
  return owners;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm test lib/queries/get-speciality-departments`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/queries/get-speciality-departments.ts lib/queries/get-speciality-departments.test.ts
git commit -m "feat(specialities): load випускові кафедри from the table, falling back to the constant"
```

---

### Task 4: The one-off backfill script

**Files:**

- Create: `prisma/link-speciality-departments.ts`
- Modify: `package.json` (one script line)

**Interfaces:**

- Consumes: `SPECIALITY_DEPARTMENTS`, `normaliseDepartmentName`.
- Produces: `pnpm db:link-speciality-departments [--apply]`.

This is the script that runs on production. Dry-run by default, like every other
one-off in `prisma/`.

- [ ] **Step 1: Write the script**

Create `prisma/link-speciality-departments.ts`:

```ts
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { SPECIALITY_DEPARTMENTS, normaliseDepartmentName } from '../lib/specialities/departments';

// Fills `SpecialityDepartment` from the constant that used to be the довідник.
//
//   pnpm db:link-speciality-departments          list what would be written
//   pnpm db:link-speciality-departments --apply  write it
//
// This is the ONE place a кафедра is matched by name, and it exists to stop that
// happening ever again: it turns 30 names into 30 ids, once. Run it BEFORE the
// 2026 reorganisation renames anything — after the rename there is nothing left
// to match against and the links have to be typed in by hand on
// /admin/stakes/norms.
//
// Adds only. It never deletes a link somebody made in the app, so a re-run after
// hand-editing cannot undo their work.
//
// Safe to run twice: the second run finds every pair already present.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const apply = process.argv.includes('--apply');

  const [specialities, departments, existing] = await Promise.all([
    prisma.speciality.findMany({ select: { id: true, name: true } }),
    prisma.department.findMany({ select: { id: true, name: true } }),
    prisma.specialityDepartment.findMany({
      select: { specialityId: true, departmentId: true },
    }),
  ]);

  const specialityByName = new Map(specialities.map((s) => [s.name, s.id]));
  const departmentByName = new Map(departments.map((d) => [normaliseDepartmentName(d.name), d.id]));
  const already = new Set(existing.map((e) => `${e.specialityId}|${e.departmentId}`));

  const planned: { specialityId: string; departmentId: string; label: string }[] = [];
  const missingSpeciality: string[] = [];
  const missingDepartment: string[] = [];

  for (const [speciality, names] of Object.entries(SPECIALITY_DEPARTMENTS)) {
    const specialityId = specialityByName.get(speciality);
    if (!specialityId) {
      missingSpeciality.push(speciality);
      continue;
    }
    for (const name of names) {
      const departmentId = departmentByName.get(normaliseDepartmentName(name));
      if (!departmentId) {
        missingDepartment.push(`${speciality} → ${name}`);
        continue;
      }
      if (already.has(`${specialityId}|${departmentId}`)) continue;
      planned.push({ specialityId, departmentId, label: `${speciality} → ${name}` });
    }
  }

  console.log(`Уже пов’язано: ${existing.length}`);
  console.log(`Буде додано: ${planned.length}\n`);
  for (const p of planned) console.log(`  ${p.label}`);

  // The two lists somebody has to read before pressing --apply. A кафедра that
  // does not match gets no випускові спеціальності, exactly as today.
  if (missingSpeciality.length > 0) {
    console.log(`\nНемає такої спеціальності в базі: ${missingSpeciality.length}`);
    for (const name of missingSpeciality) console.log(`  ${name}`);
  }
  if (missingDepartment.length > 0) {
    console.log(`\nНемає такої кафедри в базі: ${missingDepartment.length}`);
    for (const line of missingDepartment) console.log(`  ${line}`);
  }

  if (planned.length === 0) {
    console.log('\nНічого додавати.');
    return;
  }
  if (!apply) {
    console.log(`\n${planned.length} зв’язків буде створено. Запустіть з --apply, щоб записати.`);
    return;
  }

  await prisma.specialityDepartment.createMany({
    data: planned.map(({ specialityId, departmentId }) => ({ specialityId, departmentId })),
    skipDuplicates: true,
  });
  console.log(`\nСтворено: ${planned.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Wire the script**

In `package.json`, after the `"db:clear-profile-links"` line:

```json
    "db:link-speciality-departments": "tsx prisma/link-speciality-departments.ts",
```

- [ ] **Step 3: Run the dry run against dev**

Run: `pnpm db:link-speciality-departments`
Expected: `Буде додано: 48` (40 спеціальностей, six with two owner кафедри), an
empty «Немає такої кафедри» list, and the closing «Запустіть з --apply» line.

If «Немає такої кафедри» is not empty, stop and report the names — a mismatch here
is the thing this task exists to catch, and it must be fixed before applying.

- [ ] **Step 4: Apply it on dev and confirm it is idempotent**

Run: `pnpm db:link-speciality-departments --apply`
Expected: `Створено: 48.`

Run it again: `pnpm db:link-speciality-departments`
Expected: `Уже пов’язано: 48`, `Буде додано: 0`, `Нічого додавати.`

- [ ] **Step 5: Commit**

```bash
git add prisma/link-speciality-departments.ts package.json
git commit -m "chore(db): add a one-off script to fill SpecialityDepartment"
```

---

### Task 5: Read the table on the ставка grid

**Files:**

- Modify: `lib/queries/list-student-claims.ts` (`BonusBySpeciality`)
- Modify: `lib/queries/get-stake-distribution.ts:278`
- Modify: `components/stake/bonus-cell.tsx`
- Test: `lib/queries/get-stake-distribution.test.ts`

**Interfaces:**

- Consumes: `getSpecialityOwners` (Task 3), `originOf` / `knowsDepartment` (Task 2).
- Produces: `BonusBySpeciality` gains `origin: SpecialityOrigin`. `BonusCell` loses
  its `departmentName` and `knownDepartment` props.

This is the task that can break a live page. `/stakes/[id]` is a завідувач's main
screen — check it in the browser before committing.

- [ ] **Step 1: Write the failing test**

Append to `lib/queries/get-stake-distribution.test.ts`:

```ts
describe('випускова кафедра origin', () => {
  it('marks a спеціальність this кафедра graduates as own, and another as other', async () => {
    // Follow the mocking style already used in this file: whatever it mocks for
    // `db`, add `specialityDepartment.findMany` returning the two links below.
    // The кафедра under test is `dep-1`.
    //   { departmentId: 'dep-1', speciality: { name: 'Економіка' } }
    //   { departmentId: 'dep-2', speciality: { name: 'Психологія' } }
    const view = await getStakeDistribution('dep-1', 2026);
    const row = view.rows[0];

    expect(row.bonus.bySpeciality.find((e) => e.speciality === 'Економіка')?.origin).toBe('own');
    expect(row.bonus.bySpeciality.find((e) => e.speciality === 'Психологія')?.origin).toBe('other');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test lib/queries/get-stake-distribution`
Expected: FAIL — `origin` is `undefined`.

- [ ] **Step 3: Add `origin` to the row type**

In `lib/queries/list-student-claims.ts`, on `interface BonusBySpeciality`:

```ts
/**
 * Decided on the server (`originOf`), because the chip is drawn in a client
 * component and a client component cannot read the table.
 */
origin: SpecialityOrigin;
```

Import the type: `import type { SpecialityOrigin } from '@/lib/specialities/origin';`

- [ ] **Step 4: Fill it in `get-stake-distribution.ts`**

Load the map beside the other reads, then decide per entry. Replace line 278's
`knownDepartment: isKnownDepartment(department.name),` — the flag moves onto each
chip and the field goes away:

```ts
const owners = await getSpecialityOwners();
// …when building each row's bonus:
bySpeciality: bonus.bySpeciality.map((entry) => ({
  ...entry,
  origin: originOf(owners, entry.speciality, departmentId),
})),
```

Drop the `isKnownDepartment` import and the `knownDepartment` field from the
returned view.

- [ ] **Step 5: Make the cell render what it is given**

In `components/stake/bonus-cell.tsx`, delete the `departmentName` and
`knownDepartment` props and the `specialityOrigin` import, and replace lines 88-91:

```tsx
const origin: SpecialityOrigin = entry.origin;
```

Update `components/stake/distribution-grid.tsx` where `<BonusCell>` is rendered —
remove the two props it no longer takes.

- [ ] **Step 6: Run the tests and make sure they pass**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all pass.

- [ ] **Step 7: Check it on screen**

Open `/stakes/<a кафедра with confirmed claims>` and confirm the «Здобувачі» chips
still colour: green for a спеціальність that кафедра graduates, grey-blue for
another's, plain grey for an unlinked кафедра.

- [ ] **Step 8: Commit**

```bash
git add lib/queries components/stake
git commit -m "refactor(stakes): decide chip origin on the server, from the table"
```

---

### Task 6: The create/edit form warning

**Files:**

- Modify: `components/department/department-form.tsx:87,111-116`
- Modify: `app/(dashboard)/departments/new/page.tsx`
- Modify: `app/(dashboard)/departments/[id]/edit/page.tsx`

**Interfaces:**

- Consumes: `getSpecialityOwnerNames` (Task 3).
- Produces: `DepartmentForm` gains a `knownNames: readonly string[]` prop.

The form is a client component, so it cannot call the database. The page supplies
the list of names that are already linked, and the form compares against that.

- [ ] **Step 1: Pass the names in from both pages**

In each page, before rendering the form:

```tsx
const owners = await getSpecialityOwnerNames();
const knownNames = [...new Set([...owners.values()].flat())];
```

and pass `knownNames={knownNames}` to `<DepartmentForm>`.

- [ ] **Step 2: Use it in the form**

In `components/department/department-form.tsx`, add `knownNames` to the props,
drop the `isKnownDepartment` import, and replace line 87:

```tsx
const known = new Set(knownNames.map(normaliseDepartmentName));
const unknownName = trimmed.length > 2 && !known.has(normaliseDepartmentName(trimmed));
```

- [ ] **Step 3: Fix the message**

Replace lines 112-116. The old hint («Найчастіша причина — «і» замість «та» або
ініціали без пробілів») named a cause that is usually wrong, and «ініціали» has no
meaning in a кафедра name at all — it was written for a person's name:

```tsx
<p className="mt-1.5 text-xs text-amber-700 dark:text-amber-500">
  Для цієї кафедри ще не вказано випускових спеціальностей. Зберегти можна — у розподілі ставок
  здобувачі просто не позначатимуться як «своя спеціальність». Вказати їх можна пізніше на сторінці
  «Нормативи чисельності».
</p>
```

- [ ] **Step 4: Check it compiles and looks right**

Run: `pnpm type-check && pnpm lint`
Then open `/departments/new`, type «Кафедра фів», and confirm the new wording.
Type «Кафедра економіки» and confirm the warning disappears.

- [ ] **Step 5: Commit**

```bash
git add components/department app/\(dashboard\)/departments
git commit -m "fix(departments): warn from the table, and say something actionable"
```

---

### Task 7: The student register

**Files:**

- Modify: `lib/students/accepted.ts:130`
- Modify: `app/(dashboard)/achievements/students/page.tsx`
- Modify: `app/(dashboard)/achievements/students/actions.ts`

**Interfaces:**

- Consumes: `getSpecialityOwnerNames` (Task 3).
- Produces: `registerOptions(ownerNames: ReadonlyMap<string, readonly string[]>): RegisterSpeciality[]`
  — was `registerOptions()`.

`registerOptions` stays pure and synchronous; the caller loads the map.

- [ ] **Step 1: Take the map as a parameter**

In `lib/students/accepted.ts`, change the signature to accept
`ownerNames: ReadonlyMap<string, readonly string[]>`, drop the
`SPECIALITY_DEPARTMENTS` import, and replace line 130:

```ts
          departments: ownerNames.get(speciality) ?? [],
```

- [ ] **Step 2: Supply it from both callers**

In `app/(dashboard)/achievements/students/page.tsx` and in the action file,
replace each `registerOptions()` call with:

```ts
const register = registerOptions(await getSpecialityOwnerNames());
```

- [ ] **Step 3: Check it**

Run: `pnpm test && pnpm type-check && pnpm lint`
Then open `/achievements/students` as an НПП, pick a спеціальність, and confirm the
кафедра name still shows under the picker.

- [ ] **Step 4: Commit**

```bash
git add lib/students app/\(dashboard\)/achievements/students
git commit -m "refactor(students): take випускові кафедри from the table"
```

---

### Task 8: The ADMIN editor

**Files:**

- Create: `components/admin/speciality-departments-cell.tsx`
- Modify: `lib/queries/list-stake-settings.ts` (`listSpecialityNorms`)
- Modify: `app/(dashboard)/admin/stakes/norms/page.tsx`
- Modify: `app/(dashboard)/admin/stakes/actions.ts`
- Test: `app/(dashboard)/admin/stakes/actions.test.ts`

**Interfaces:**

- Consumes: `DepartmentCombobox` from `components/department-combobox.tsx`.
- Produces:
  - `SpecialityNormRow` gains `departments: { id: string; name: string }[]`
  - `linkSpecialityDepartment(_prev, formData)` and
    `unlinkSpecialityDepartment(_prev, formData)`, both `Promise<StakeActionState>`,
    both ADMIN-only, both audited.

This is what makes the reorganisation survivable without a developer.

- [ ] **Step 1: Write the failing authorization test**

Append to `app/(dashboard)/admin/stakes/actions.test.ts`, in the style already used
there:

```ts
describe('linkSpecialityDepartment authorization', () => {
  it('refuses an EDITOR', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'e1' } });
    const form = new FormData();
    form.set('specialityId', 'spec-1');
    form.set('departmentId', 'dep-1');
    expect(await linkSpecialityDepartment(null, form)).toEqual({ error: 'Недостатньо прав' });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test app/\(dashboard\)/admin/stakes`
Expected: FAIL — `linkSpecialityDepartment` is not exported.

- [ ] **Step 3: Write the two actions**

In `app/(dashboard)/admin/stakes/actions.ts`, following `setSpecialityNorm`
(line 141) exactly — `requireAdmin`, Zod parse, `parseDbError`, `diffChanges`
audit row, `revalidatePath`:

```ts
export async function linkSpecialityDepartment(
  _prev: StakeActionState,
  formData: FormData
): Promise<StakeActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const specialityId = String(formData.get('specialityId') ?? '');
  const departmentId = String(formData.get('departmentId') ?? '');
  if (!specialityId || !departmentId) return { error: 'Невірні дані' };

  const [speciality, department] = await Promise.all([
    db.speciality.findUnique({ where: { id: specialityId }, select: { name: true } }),
    db.department.findUnique({ where: { id: departmentId }, select: { name: true } }),
  ]);
  if (!speciality || !department) return { error: 'Запис не знайдено' };

  try {
    await db.specialityDepartment.create({ data: { specialityId, departmentId } });
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'SpecialityDepartment',
        entityId: `${specialityId}:${departmentId}`,
        label: `${speciality.name} → ${department.name}`,
        userId: session.user.id,
        changes: diffChanges({}, { department: department.name }),
      },
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося зберегти. Зміни не застосовано', 'stakes.linkSpeciality', {
        userId: session.user.id,
        entityId: specialityId,
      }),
    };
  }

  revalidatePath('/admin/stakes/norms');
  revalidatePath('/stakes', 'layout');
  return { success: true };
}
```

And the mirror, in the same file:

```ts
export async function unlinkSpecialityDepartment(
  _prev: StakeActionState,
  formData: FormData
): Promise<StakeActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const specialityId = String(formData.get('specialityId') ?? '');
  const departmentId = String(formData.get('departmentId') ?? '');
  if (!specialityId || !departmentId) return { error: 'Невірні дані' };

  const [speciality, department] = await Promise.all([
    db.speciality.findUnique({ where: { id: specialityId }, select: { name: true } }),
    db.department.findUnique({ where: { id: departmentId }, select: { name: true } }),
  ]);
  if (!speciality || !department) return { error: 'Запис не знайдено' };

  try {
    await db.specialityDepartment.delete({
      where: { specialityId_departmentId: { specialityId, departmentId } },
    });
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        entity: 'SpecialityDepartment',
        entityId: `${specialityId}:${departmentId}`,
        label: `${speciality.name} → ${department.name}`,
        userId: session.user.id,
        changes: diffChanges({ department: department.name }, {}),
      },
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти. Зміни не застосовано',
        'stakes.unlinkSpeciality',
        {
          userId: session.user.id,
          entityId: specialityId,
        }
      ),
    };
  }

  revalidatePath('/admin/stakes/norms');
  revalidatePath('/stakes', 'layout');
  return { success: true };
}
```

- [ ] **Step 4: Return the linked кафедри with each norm row**

In `lib/queries/list-stake-settings.ts`, in `listSpecialityNorms`, add to the
`select`:

```ts
      departments: { select: { department: { select: { id: true, name: true } } } },
```

and to the mapped row:

```ts
    departments: s.departments.map((d) => d.department),
```

- [ ] **Step 5: Write the cell**

Create `components/admin/speciality-departments-cell.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { DepartmentCombobox } from '@/components/department-combobox';
import {
  linkSpecialityDepartment,
  unlinkSpecialityDepartment,
} from '@/app/(dashboard)/admin/stakes/actions';

/**
 * Which кафедри graduate one спеціальність — the ADMIN's half of
 * `SpecialityDepartment`.
 *
 * A chip per link with an × , and a combobox offering only кафедри not already
 * linked. Six спеціальності have two owner кафедри, so adding is not replacing.
 *
 * Errors render under the cell rather than as a toast: the convention is that
 * feedback appears as close to its cause as possible, and here there is an
 * obvious element to attach it to.
 */
export function SpecialityDepartmentsCell({
  specialityId,
  linked,
  allDepartments,
}: {
  specialityId: string;
  linked: readonly { id: string; name: string }[];
  allDepartments: readonly { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const linkedIds = new Set(linked.map((d) => d.id));
  const available = allDepartments.filter((d) => !linkedIds.has(d.id));

  function run(action: typeof linkSpecialityDepartment, departmentId: string) {
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set('specialityId', specialityId);
      form.set('departmentId', departmentId);
      const result = await action(null, form);
      if (result && 'error' in result) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {linked.map((d) => (
          <span
            key={d.id}
            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
          >
            {d.name}
            <button
              type="button"
              aria-label={`Прибрати ${d.name}`}
              disabled={pending}
              onClick={() => run(unlinkSpecialityDepartment, d.id)}
              className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {linked.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
      </div>

      {available.length > 0 && (
        <DepartmentCombobox
          departments={available}
          value=""
          onChange={(next) => next && run(linkSpecialityDepartment, next)}
          placeholder="Додати кафедру…"
          disabled={pending}
        />
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

The page must also pass `allDepartments` — add `listDepartments()` to the
`Promise.all` already in `app/(dashboard)/admin/stakes/norms/page.tsx`.

- [ ] **Step 6: Add the column**

In `app/(dashboard)/admin/stakes/norms/page.tsx`, add a `<th>` «Випускові кафедри»
after «Спеціальність», and the cell in each row. Widen the table container.

- [ ] **Step 7: Run everything and click it**

Run: `pnpm test && pnpm type-check && pnpm lint && pnpm build`
Then on `/admin/stakes/norms`: add a кафедра to a спеціальність, reload, remove it,
and confirm `/admin/audit-log` shows both entries.

- [ ] **Step 8: Commit**

```bash
git add components/admin lib/queries/list-stake-settings.ts app/\(dashboard\)/admin/stakes
git commit -m "feat(admin): edit випускові кафедри per спеціальність"
```

---

### Task 9: Demote the constant, document the rule

**Files:**

- Modify: `lib/specialities/departments.ts`
- Modify: `lib/specialities/departments.test.ts`
- Modify: `prisma/seed.ts`
- Modify: `CLAUDE.md`

Do this only **after** production has been backfilled and checked. It removes the
safety net.

- [ ] **Step 1: Seed the join table on a fresh database**

In `prisma/seed.ts`, wherever спеціальності are created, add the links from
`SPECIALITY_DEPARTMENTS` using the same name→id matching the Task 4 script uses.
A fresh database must come up already linked; only existing databases need the
one-off script.

- [ ] **Step 2: Remove the fallback**

In `lib/queries/get-speciality-departments.ts`, delete `fallbackFromConstant` and
the branch that calls it. `getSpecialityOwners` returns whatever the table holds,
empty map included.

- [ ] **Step 3: Demote the constant**

At the top of `lib/specialities/departments.ts`, replace the «A constant rather
than a table» paragraph:

```ts
// **SEED INPUT ONLY** since 2026-08-25. The running app reads
// `SpecialityDepartment` through `lib/queries/get-speciality-departments.ts`;
// this object only supplies the first fill, for a fresh database (`prisma/seed.ts`)
// and for the one-off `prisma/link-speciality-departments.ts`. Editing it changes
// nothing on any database that already has rows — that is now an ADMIN action on
// /admin/stakes/norms. The same shape `ACTIVITY_TYPES_2026` took when indicators
// moved into the database.
```

Delete `isKnownDepartment` and `specialityOrigin` — Tasks 2, 5 and 6 replaced
every caller. Keep `normaliseDepartmentName`: the seed and the one-off script
still need it.

**Two callers are NOT covered by Tasks 5–7 and must be handled here**, or the
build breaks:

- `prisma/test-data.ts:519-520` calls `specialitiesOf(departmentName)` to decide
  which спеціальності a demo кафедра graduates. Keep `specialitiesOf` exported —
  it reads the constant, and the constant is exactly what a seed should read.
  Add a one-line note above it: `/** Seed only — the app reads the table. */`
- `lib/specialities/departments.test.ts:117-120,146` pins `isKnownDepartment`
  against `prisma/preprod-org.ts`. That test is worth keeping, rewritten: assert
  every кафедра in `DEPARTMENTS` appears somewhere in `SPECIALITY_DEPARTMENTS`,
  using `normaliseDepartmentName` directly instead of the deleted function. It
  guards the seed input, which still matters.

- [ ] **Step 4: Record the rule**

In `CLAUDE.md`, under «Розподіл ставок», beside the `registryKey` rule:

```markdown
- **Випускові кафедри live in `SpecialityDepartment`, keyed by id.** The constant
  `SPECIALITY_DEPARTMENTS` is seed input only (2026-08-25). It matched кафедри by
  `name`, which is editable on /departments — the 2026 reorganisation would have
  broken every link in silence. Read it through `getSpecialityOwners()`; decide
  own/other/unknown with `originOf`. Never compare a кафедра name to decide a link.
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm test && pnpm type-check && pnpm lint && pnpm build`

```bash
git add lib/specialities prisma/seed.ts lib/queries/get-speciality-departments.ts CLAUDE.md
git commit -m "refactor(specialities): make the constant seed input only"
```

---

## Deploying to production

In order, and not before Task 8 is merged:

1. **Back up the database.** Nothing below is reversible by itself.
2. Deploy Tasks 1–8. The migration adds an empty table; the fallback means
   behaviour is unchanged while it is empty.
3. Check `/stakes/<кафедра>` still colours its chips as before.
4. Run `pnpm db:link-speciality-departments` — **no flag**. Read the output. The
   «Немає такої кафедри» list must be empty.
5. Run it again with `--apply`.
6. Check the same кафедра grid again, and `/admin/stakes/norms`.
7. Only then merge and deploy Task 9.

**Run this before the reorganisation renames anything.** The backfill matches by
name; once the names change there is nothing to match, and the 48 links have to be
typed in by hand.
