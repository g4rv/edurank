# Планування наукової роботи — Stage 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An НПП records the наукова робота they actually did, priced in годинах against the same Додаток III catalogue their план came from, proved by a link or a file, with co-authors drawing from one shared pool of hours that cannot be overspent.

**Architecture:** Three new tables. `ScienceWork` is the work itself — one row per real-world thing, identified by a normalised `dedupKey` that is globally unique, which is what makes «one article, one row» structural rather than a check somebody can forget. `ScienceRecord` is one person's **draw** against a work, and `@@unique([staffId, workId])` is the whole reuse rule. `ScienceRecordFile` hangs off the work, not off a person, because a co-authored article's certificate is one file. The pool is enforced the way `saveDistribution` enforces a кафедра's: inside a transaction that re-reads the current sum, never from a number the client sent.

**Tech Stack:** Next.js 16 App Router · Prisma 7 + PostgreSQL 16 · Zod · React Hook Form · Vitest · `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (already installed, commit 8a60bb1) · `pdf-lib` (new) · Cloudflare R2, EU jurisdiction.

**Spec:** `docs/superpowers/specs/2026-09-15-science-plan-design.md` — read D1–D24, then the `D25–D29` section added 2026-09-17, then «Reuse — the rule is the index», «The pool», «Evidence, per work type» and «Files». The plan argues from that document; where the two disagree, the spec is right and the plan has a bug.

---

## Global Constraints

Every task's requirements implicitly include all of these.

- **Hours are INTEGER HUNDREDTHS OF AN HOUR. Never a float, in the database or in any sum.** `lib/stake/units.ts` has `toHundredths` / `fromHundredths` and the tests that pin them. The old ставки system used floats here and produced a negative «нерозподілено».
- **Never key behaviour on `ScienceWorkType.code`.** Read the row. Per-type behaviour is a column: `reuse`, `sharing`, `identityFields`, `requiresFile`, `maxPerYear`, `isActive`.
- **The year is never taken from client input.** Resolve it server-side from the one OPEN `SciencePlanTemplate`. A CLOSED or absent template refuses the write.
- **Every page starts with `auth()` + `if (!session) redirect('/login')`; every server action re-checks role and ownership.** `proxy.ts` is a cookie gate only.
- **All UI text in Ukrainian.** No Ukrainian string literals in logic files — components only.
- **Every mutation writes an `AuditLog` row** with `diffChanges` from `lib/audit.ts`.
- **Write failures go through `parseDbError(e, '<Ukrainian sentence>', 'science.<action>', { userId })`.** Anything else you catch goes through `logError`. Never a bare `} catch {` that returns a string. Never show a user an error code or id.
- **Tests are colocated** next to what they cover, `*.test.ts`, Vitest. Suite is currently 114 files / 1740 tests, all passing — keep it that way.
- **New UI uses `components/aurora/ui/*` only.** The old `components/ui/*` set is not extended. Read `docs/aurora.md` before touching any screen; §3 for colour, §11 for where a shared component lives, §12 for traps.
- **Prisma 7:** the client is imported from `@/lib/generated/prisma/client`, never `@prisma/client`. After any schema change run `pnpm db:generate`, and **tell the owner to restart `pnpm dev`** — the running dev server holds the old client.
- **Do not run `git commit` yourself.** The owner commits, and always through the `/commit` skill. Where a step below says «Commit», it means: stop, report what is done, and let the owner commit. Never `git add`/`git commit` directly.
- **Do not run `pnpm dev` or `docker compose`.** The owner runs the services.
- **Production is never reseeded** (`pnpm db:seed` upserts 2026 only, and prod is populated with admin edits). Any change to an already-seeded row needs a one-off script under `prisma/`, reporting by default and writing only with `--apply`.

---

## File Structure

**New — pure logic (no database, fully unit-tested):**

| File                           | Responsibility                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `lib/science/work-key.ts`      | `workKey()` — the normalised identity of one work. The whole reuse rule rides on this string. |
| `lib/science/pool.ts`          | What is left of a work's hours, and whether a requested draw fits.                            |
| `lib/science/file-checks.ts`   | Magic-byte sniffing, SHA-256, PDF page count, the type and size caps.                         |
| `lib/science/evidence-rule.ts` | D27 — a record needs at least one of link or file; `requiresFile` narrows it.                 |

**New — infrastructure:**

| File                | Responsibility                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `lib/science/r2.ts` | The S3 client, object keys, presigned PUT/GET, HEAD, delete. The only file that knows R2 exists. |

**New — server actions:**

| File                                             | Responsibility                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `app/(dashboard)/science-plan/record-actions.ts` | Create a work + record, join an existing work, edit a work's evidence, delete a record. |
| `app/(dashboard)/science-plan/file-actions.ts`   | Presign an upload, confirm one, issue a read URL, delete a file.                        |
| `app/(dashboard)/moderation/science-actions.ts`  | ННВ / ADMIN decline a record with a reason, and restore one.                            |

**New — queries:**

| File                                  | Responsibility                                                           |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `lib/queries/get-science-work.ts`     | One work with its draws — for the join dialog and the post-check detail. |
| `lib/queries/list-science-records.ts` | The post-check feed: recent records across the university.               |

**New — components:**

| File                                            | Responsibility                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `components/science/record-tabs.tsx`            | «План» / «Виконано» (D29).                                                        |
| `components/science/add-record-dialog.tsx`      | The record form: work type, evidence, link, file, plan row, hours.                |
| `components/science/join-work-panel.tsx`        | D17's refusal turned into an offer — who has it, what is left, how much you take. |
| `components/science/record-list.tsx`            | The «Виконано» list.                                                              |
| `components/science/evidence-file-field.tsx`    | Browser-side hash, presign, PUT, confirm.                                         |
| `components/science/moderation/record-feed.tsx` | The post-check list.                                                              |

**Modified:**

| File                                                                                             | Change                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                                                           | Three models, one enum, back-relations on `Staff`, `SciencePlan`, `SciencePlanRow`, `SciencePlanTemplate`, `ScienceWorkType`. |
| `lib/science/work-types-2027.ts`                                                                 | `conference_attendance` → `reuse: 'YEARLY'` (D25).                                                                            |
| `lib/science/target.ts`                                                                          | `planTarget` gains `doneHundredths` and `doneShortfallHundredths`.                                                            |
| `lib/queries/get-science-plan.ts`                                                                | Returns records beside rows, and the факт total.                                                                              |
| `lib/queries/list-science-plans.ts`                                                              | Each summary row gains `doneHundredths`.                                                                                      |
| `app/(dashboard)/science-plan/page.tsx`                                                          | Renders the tabs.                                                                                                             |
| `app/(dashboard)/science-plans/page.tsx`, `app/(dashboard)/my-department/science-plans/page.tsx` | A «Виконано» column and a fifth stat tile.                                                                                    |
| `components/science/department-plans-table.tsx`                                                  | The column, and its sort field.                                                                                               |
| `lib/science/plan-rows.ts`, `lib/science/list-params.ts`                                         | `done` joins the sort fields and the states.                                                                                  |
| `app/(dashboard)/moderation/page.tsx`                                                            | A «Наукова робота» section.                                                                                                   |
| `lib/labels.ts`                                                                                  | Ukrainian labels for every new field the audit log can print.                                                                 |
| `.env.example`, `lib/env.ts`                                                                     | R2 keys asserted at boot.                                                                                                     |

---

## Phase A — the catalogue correction

Independent of everything else and worth shipping on its own.

### Task 1: `conference_attendance` becomes YEARLY (D25)

**Files:**

- Modify: `lib/science/work-types-2027.ts` (the `conference_attendance` def)
- Modify: `lib/science/work-types-2027.test.ts` (the test that pins the YEARLY set)
- Create: `prisma/science-conference-yearly.ts`
- Modify: `package.json` (one script)

**Interfaces:**

- Consumes: nothing.
- Produces: nothing new. `ScienceWorkType.reuse` for `conference_attendance` reads `YEARLY` in the seed and in the database.

- [ ] **Step 1: Read the existing test so you change the right assertion**

Run: `grep -n "YEARLY" lib/science/work-types-2027.test.ts`

It pins the exact set of YEARLY codes. That set is the thing being corrected.

- [ ] **Step 2: Write the failing test**

In `lib/science/work-types-2027.test.ts`, change the YEARLY set assertion to include the conference, and add the reason as a test of its own:

```ts
it('repeats every year where the наказ says so', () => {
  const yearly = SCIENCE_WORK_TYPES_2027.filter((t) => t.reuse === 'YEARLY').map((t) => t.code);
  expect(yearly.sort()).toEqual(
    [
      'conference_attendance',
      'dissertation',
      'editorial_board',
      'lab_leadership',
      'phd_supervision',
      'student_group',
    ].sort()
  );
});

it('gives a per-year cap a per-year key — otherwise the cap can never restart', () => {
  // «Участь в конференціях (мах.5)» is a limit per навчальний рік. A ONCE key
  // carries no year, so the same annual конференція could never be attended
  // again — and the cap would never reset (D25).
  const capped = SCIENCE_WORK_TYPES_2027.filter((t) => t.maxPerYear !== undefined);
  for (const type of capped) {
    expect(type.reuse, `${type.code} carries maxPerYear but not a yearly key`).toBe('YEARLY');
  }
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run lib/science/work-types-2027.test.ts`
Expected: FAIL — the YEARLY set is missing `conference_attendance`, and the capped-type test reports `conference_attendance carries maxPerYear but not a yearly key`.

- [ ] **Step 4: Make it pass**

In `lib/science/work-types-2027.ts`, in the `conference_attendance` def:

```ts
    reuse: 'YEARLY',
```

and put the reasoning where the next reader will meet it:

```ts
    // YEARLY, not ONCE (owner, 2026-09-17 — D25). The наказ caps this at five
    // per рік, and a cap that restarts every year only makes sense if the
    // counting does. With a ONCE key an annual конференція attended in
    // 2026/2027 could never be attended again in any later year.
    reuse: 'YEARLY',
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run lib/science`
Expected: PASS.

- [ ] **Step 6: Write the one-off script for the row already in the database**

`pnpm db:seed` upserts the 2026/2027 template, so a dev database is fixed by reseeding — but **production is never seeded again**, and a cloned year is never reseeded at all. Create `prisma/science-conference-yearly.ts`:

```ts
import 'dotenv/config';
import { PrismaClient } from '../lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * One-off: give «Участь у конференціях» a per-year dedup key (D25).
 *
 * Reaches EVERY template, which `pnpm db:seed` cannot — it upserts 2026/2027
 * alone, production is never seeded again, and a cloned year is not reseeded.
 * Reports by default; writes only with `--apply`, the same shape as
 * `prisma/gate-to-check-sum.ts`.
 */
const apply = process.argv.includes('--apply');

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const rows = await prisma.scienceWorkType.findMany({
    where: { code: 'conference_attendance', reuse: 'ONCE' },
    select: { id: true, reuse: true, template: { select: { academicYear: true } } },
  });

  if (rows.length === 0) {
    console.log('Нічого змінювати: жоден рядок не має reuse=ONCE');
    await prisma.$disconnect();
    return;
  }

  for (const row of rows) {
    console.log(`${row.template.academicYear}: ONCE → YEARLY`);
  }

  if (!apply) {
    console.log(`\n${rows.length} рядків. Запустіть з --apply, щоб записати.`);
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.scienceWorkType.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { reuse: 'YEARLY' },
  });
  console.log(`Оновлено ${result.count}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 7: Add the script to `package.json`**

Beside the other one-offs:

```json
    "db:science-conference-yearly": "tsx prisma/science-conference-yearly.ts",
```

- [ ] **Step 8: Run it in report mode against the dev database**

Run: `pnpm db:science-conference-yearly`
Expected: it lists `2026/2027: ONCE → YEARLY` and says to pass `--apply`. Then run `pnpm db:science-conference-yearly --apply` and expect `Оновлено 1`.

- [ ] **Step 9: Document it**

Add the command to the `## Commands` block in `CLAUDE.md`, beside the other one-offs, with one line saying what it does and why it is not a seed.

- [ ] **Step 10: Commit** — report to the owner; they run `/commit`.

---

## Phase B — identity, the pool, and the tables

Three pure modules first, because every rule in Stage 2 is one of them. None of these tasks touches the database or a screen, so all three are fully unit-tested before anything can be saved wrong.

### Task 2: `workKey()` — the identity of one work

**Files:**

- Create: `lib/science/work-key.ts`
- Test: `lib/science/work-key.test.ts`

**Interfaces:**

- Consumes: `normalizeDoi` from `lib/doi.ts`, `normalizeIsbn` from `lib/isbn.ts`, `EvidenceField` from `lib/rating/evidence-fields.ts`, `ScienceReuse` / `ScienceSharing` from `@/lib/generated/prisma/client`.
- Produces:

```ts
export function workKey(input: {
  identityFields: readonly string[];
  evidenceFields: readonly EvidenceField[];
  reuse: ScienceReuse;
  sharing: ScienceSharing;
  evidence: Record<string, unknown>;
  academicYear: string;
  staffId: string;
}): string | null;
```

`null` means no identity field carried a value — the caller refuses the save rather than inventing a key.

- [ ] **Step 1: Write the failing test**

Create `lib/science/work-key.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { workKey } from './work-key';
import type { EvidenceField } from '@/lib/rating/evidence-fields';

const FIELDS: EvidenceField[] = [
  { kind: 'doi', name: 'doi', label: 'DOI', optional: true },
  { kind: 'url', name: 'url', label: 'Посилання', optional: true },
  { kind: 'text', name: 'title', label: 'Назва роботи' },
];

const key = (over: Partial<Parameters<typeof workKey>[0]> = {}) =>
  workKey({
    identityFields: ['doi', 'url', 'title'],
    evidenceFields: FIELDS,
    reuse: 'ONCE',
    sharing: 'SHARED',
    evidence: { title: 'Стаття про освіту' },
    academicYear: '2026/2027',
    staffId: 'staff-1',
    ...over,
  });

describe('workKey', () => {
  it('takes the first identity field that has a value, in order', () => {
    expect(key({ evidence: { doi: '10.31392/XYZ', url: 'https://a.b/c', title: 'Стаття' } })).toBe(
      'doi:10.31392/xyz'
    );
    expect(key({ evidence: { url: 'https://Example.com/A/', title: 'Стаття' } })).toBe(
      'url:example.com/a'
    );
  });

  it('drops a URL query and fragment — the same page reached two ways is one work', () => {
    expect(key({ evidence: { url: 'https://example.com/a?utm=1#top' } })).toBe('url:example.com/a');
  });

  it('normalises a title conservatively: case, whitespace, trailing punctuation', () => {
    expect(key({ evidence: { title: '  Стаття   про   освіту.  ' } })).toBe('t:стаття про освіту');
  });

  it('does NOT transliterate or strip inner punctuation — a false collision refuses real work', () => {
    expect(key({ evidence: { title: 'Мова, освіта' } })).not.toBe(
      key({ evidence: { title: 'Мова освіта' } })
    );
  });

  it('appends the навчальний рік for a YEARLY type, and not for a ONCE one', () => {
    expect(key({ reuse: 'YEARLY' })).toBe('t:стаття про освіту@2026/2027');
    expect(key({ reuse: 'ONCE' })).toBe('t:стаття про освіту');
  });

  it('prefixes an INDIVIDUAL type with the person — four editors of one journal must all fit (D24)', () => {
    const a = key({ sharing: 'INDIVIDUAL', staffId: 'staff-1' });
    const b = key({ sharing: 'INDIVIDUAL', staffId: 'staff-2' });
    expect(a).toBe('s_staff-1:t:стаття про освіту');
    expect(b).not.toBe(a);
  });

  it('leaves a SHARED type global — that is what lets a co-author find it', () => {
    expect(key({ sharing: 'SHARED', staffId: 'staff-1' })).toBe(
      key({ sharing: 'SHARED', staffId: 'staff-2' })
    );
  });

  it('is null when no identity field carries a value', () => {
    expect(key({ evidence: {} })).toBeNull();
    expect(key({ evidence: { title: '   ' } })).toBeNull();
  });

  it('ignores an identity field the type does not actually declare', () => {
    expect(key({ identityFields: ['missing', 'title'] })).toBe('t:стаття про освіту');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/science/work-key.test.ts`
Expected: FAIL — `Failed to resolve import "./work-key"`.

- [ ] **Step 3: Write the implementation**

Create `lib/science/work-key.ts`:

```ts
import { normalizeDoi } from '@/lib/doi';
import { normalizeIsbn } from '@/lib/isbn';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import type { ScienceReuse, ScienceSharing } from '@/lib/generated/prisma/client';

/**
 * The normalised identity of ONE work — the string two unique indexes carry the
 * whole reuse rule on (spec, «Reuse — the rule is the index, not a check»).
 *
 * Normalisation stays CONSERVATIVE: lowercase, collapse whitespace, trim, strip
 * trailing punctuation. Not transliteration, not stemming, not punctuation
 * inside the string. A false collision refuses work somebody really did, which
 * is a worse failure than a duplicate somebody can report.
 */

function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.host.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    // Not a URL at all — fall through to the text rule rather than refusing.
    return null;
  }
}

function normalizeText(raw: string): string | null {
  const value = raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:!?]+$/, '')
    .trim();
  return value || null;
}

function valueFor(field: EvidenceField, raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  switch (field.kind) {
    case 'doi': {
      const doi = normalizeDoi(raw);
      return doi ? `doi:${doi.toLowerCase()}` : null;
    }
    case 'isbn': {
      const isbn = normalizeIsbn(raw);
      return isbn ? `isbn:${isbn}` : null;
    }
    case 'url': {
      const url = normalizeUrl(raw);
      return url ? `url:${url}` : null;
    }
    default: {
      const text = normalizeText(raw);
      return text ? `t:${text}` : null;
    }
  }
}

export function workKey(input: {
  identityFields: readonly string[];
  evidenceFields: readonly EvidenceField[];
  reuse: ScienceReuse;
  sharing: ScienceSharing;
  evidence: Record<string, unknown>;
  academicYear: string;
  staffId: string;
}): string | null {
  let core: string | null = null;
  for (const name of input.identityFields) {
    const field = input.evidenceFields.find((f) => f.name === name);
    // An identityFields entry naming a field the type does not declare is a
    // catalogue mistake an ADMIN can make on /admin/science-plan/[id]. Skip it
    // rather than throw: the next name in the list is usually `title`, and a
    // typo in the catalogue must not stop somebody recording their work.
    if (!field) continue;
    core = valueFor(field, input.evidence[name]);
    if (core) break;
  }
  if (!core) return null;

  // The year goes INSIDE the key for a YEARLY type, which is what lets the same
  // аспірант be supervised again next year while the same стаття never repeats.
  const withYear = input.reuse === 'YEARLY' ? `${core}@${input.academicYear}` : core;

  // D24: an INDIVIDUAL type's identity is often a name several people
  // legitimately share — a journal's редколегія is four people, one
  // конференція is twenty. Prefixing with the person gives each their own key
  // space, while `@@unique([staffId, workId])` still stops them claiming it
  // twice inside it.
  return input.sharing === 'INDIVIDUAL' ? `s_${input.staffId}:${withYear}` : withYear;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/science/work-key.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Check the two normalisers return what you assumed**

Run: `sed -n '32,60p' lib/doi.ts; sed -n '12,42p' lib/isbn.ts`

Both are expected to return a normalised string, empty for junk. If either returns something else, fix `valueFor` to match the real signature and re-run. **Do not change `lib/doi.ts` or `lib/isbn.ts`** — the rating's DOI and ISBN fields depend on them.

- [ ] **Step 6: Commit** — report to the owner; they run `/commit`.

---

### Task 3: the pool

**Files:**

- Create: `lib/science/pool.ts`
- Test: `lib/science/pool.test.ts`

**Interfaces:**

- Consumes: `formatStakeValue` from `lib/stake/units.ts`.
- Produces:

```ts
export function remainingHundredths(totalHundredths: number, drawnByOthers: number): number;
export function poolProblem(input: {
  totalHundredths: number;
  drawnByOthers: number;
  requested: number;
}): string | null;
```

- [ ] **Step 1: Write the failing test**

Create `lib/science/pool.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { poolProblem, remainingHundredths } from './pool';

describe('remainingHundredths', () => {
  it('is what nobody has taken yet', () => {
    expect(remainingHundredths(20000, 15000)).toBe(5000);
  });

  it('never goes negative — an overdrawn pool reads as empty, not as a debt', () => {
    // Only reachable if a work's evidence were edited down; that edit is itself
    // refused for this reason, and this is the belt beside the braces.
    expect(remainingHundredths(20000, 25000)).toBe(0);
  });
});

describe('poolProblem', () => {
  it('passes a draw that fits exactly', () => {
    expect(
      poolProblem({ totalHundredths: 20000, drawnByOthers: 15000, requested: 5000 })
    ).toBeNull();
  });

  it('refuses a draw over what is left, and says how much is left', () => {
    const problem = poolProblem({ totalHundredths: 20000, drawnByOthers: 15000, requested: 5001 });
    expect(problem).toMatch(/50/);
  });

  it('refuses zero and negative hours', () => {
    expect(poolProblem({ totalHundredths: 20000, drawnByOthers: 0, requested: 0 })).not.toBeNull();
    expect(
      poolProblem({ totalHundredths: 20000, drawnByOthers: 0, requested: -100 })
    ).not.toBeNull();
  });

  it('refuses a fractional hundredth — hours are integers all the way down', () => {
    expect(
      poolProblem({ totalHundredths: 20000, drawnByOthers: 0, requested: 12.5 })
    ).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/science/pool.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/science/pool.ts`:

```ts
import { formatStakeValue } from '@/lib/stake/units';

/**
 * D14/D16 — one work, one pool of hours, shared by everybody who draws on it.
 *
 * INTEGER HUNDREDTHS throughout. This is a quantity divided among people, which
 * is exactly what `lib/stake/units.ts` exists for: the old ставки system used
 * floats for the same job and produced a negative «нерозподілено» — a кафедра
 * that had overspent according to a subtraction and had not according to the
 * people in it.
 *
 * The RULE lives here; the ENFORCEMENT is a transaction that re-reads
 * `drawnByOthers` (see `record-actions.ts`). Two co-authors saving at the same
 * moment must not both see 50 free hours and both take them, and no pure
 * function can promise that.
 */

export function remainingHundredths(totalHundredths: number, drawnByOthers: number): number {
  return Math.max(0, totalHundredths - drawnByOthers);
}

export function poolProblem(input: {
  totalHundredths: number;
  drawnByOthers: number;
  requested: number;
}): string | null {
  const { totalHundredths, drawnByOthers, requested } = input;

  if (!Number.isInteger(requested)) return 'Години мають бути цілим числом сотих';
  if (requested <= 0) return 'Вкажіть кількість годин більше нуля';

  const left = remainingHundredths(totalHundredths, drawnByOthers);
  if (requested > left) {
    return `Залишилось ${formatStakeValue(left / 100)} з ${formatStakeValue(totalHundredths / 100)} год`;
  }
  return null;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/science/pool.test.ts`
Expected: PASS. If the `/50/` assertion fails, read what `formatStakeValue` actually prints — it is the app's own «1,35»-style formatter — and fix the assertion to the real output rather than changing the formatter, which ставки depend on.

- [ ] **Step 5: Commit** — report to the owner.

---

### Task 4: the evidence rule (D27)

**Files:**

- Create: `lib/science/evidence-rule.ts`
- Test: `lib/science/evidence-rule.test.ts`

**Interfaces:**

- Produces:

```ts
export function evidenceProblem(input: {
  requiresFile: boolean;
  link: string | null;
  fileCount: number;
}): string | null;
```

- [ ] **Step 1: Write the failing test**

Create `lib/science/evidence-rule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { evidenceProblem } from './evidence-rule';

const check = (over: Partial<Parameters<typeof evidenceProblem>[0]> = {}) =>
  evidenceProblem({ requiresFile: false, link: null, fileCount: 0, ...over });

describe('evidenceProblem', () => {
  it('refuses a record with neither link nor file — never neither (D27)', () => {
    expect(check()).not.toBeNull();
  });

  it('accepts a link alone', () => {
    expect(check({ link: 'https://doi.org/10.31392/xyz' })).toBeNull();
  });

  it('accepts a file alone — the same сертифікат is a URL for one person and a PDF for another', () => {
    expect(check({ fileCount: 1 })).toBeNull();
  });

  it('refuses a link alone where the type says a link is not enough', () => {
    expect(check({ requiresFile: true, link: 'https://example.com/x' })).not.toBeNull();
  });

  it('accepts a file where the type demands one, link or no link', () => {
    expect(check({ requiresFile: true, fileCount: 1 })).toBeNull();
    expect(check({ requiresFile: true, fileCount: 1, link: 'https://example.com/x' })).toBeNull();
  });

  it('treats a blank link as no link', () => {
    expect(check({ link: '   ' })).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/science/evidence-rule.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/science/evidence-rule.ts`:

```ts
/**
 * D27 — what proves a record.
 *
 * The owner's rule (2026-09-17): **a link proves anything with a public record;
 * a file is only for a document that exists only in the person's own hands** —
 * a сертифікат downloaded from a personal cabinet or sent by email.
 *
 * The choice belongs to the RECORD, not only to the work type, because the same
 * сертифікат is a public URL for one person and a PDF in an inbox for another.
 * So the rule is: **at least one of link or file, never neither.**
 *
 * `requiresFile` survives and narrows: it no longer means «this type is proved
 * by a file», it means «a link alone is not enough for this type». Expect it on
 * very few rows, not on half the catalogue — the spec's first reading of the
 * наказ put наказ, патент and свідоцтво in the file column, and all three are
 * public documents with a public record.
 *
 * Why «never neither» is refused at all: the owner's reason for moving off
 * paper is that people «tend to photoshop their certificates and print them on
 * paper». A typed name is weaker than the paper it replaces.
 */
export function evidenceProblem(input: {
  requiresFile: boolean;
  link: string | null;
  fileCount: number;
}): string | null {
  const hasLink = Boolean(input.link?.trim());
  const hasFile = input.fileCount > 0;

  if (input.requiresFile && !hasFile) {
    return 'Для цього виду роботи потрібен файл підтвердження';
  }
  if (!hasLink && !hasFile) {
    return 'Додайте посилання або файл підтвердження';
  }
  return null;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/science/evidence-rule.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit** — report to the owner.

---

### Task 5: the tables

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_science_records/migration.sql` (generated)
- Modify: `lib/labels.ts`

**Interfaces:**

- Produces: the Prisma models `ScienceWork`, `ScienceRecord`, `ScienceRecordFile` and the enum `ScienceRecordStatus`, all importable from `@/lib/generated/prisma/client`.

- [ ] **Step 1: Read the neighbouring models first**

Run: `sed -n '/model SciencePlanTemplate/,/^}/p;/model ScienceWorkType/,/^}/p;/model SciencePlanRow/,/^}/p' prisma/schema.prisma`

Stage 1's models are the house style: a `///` docstring on every non-obvious field saying WHY, not what.

- [ ] **Step 2: Add the models**

Append to `prisma/schema.prisma`, after `SciencePlanRow`:

```prisma
/// Одна реальна робота — стаття, монографія, конференція. ONE row per
/// real-world thing, whoever enters it first. Co-authors do not get their own
/// copy; they draw from this one (D14).
model ScienceWork {
  id String @id @default(cuid())

  templateId String
  template   SciencePlanTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  workTypeId String
  workType   ScienceWorkType @relation(fields: [workTypeId], references: [id])

  /// The work's own data — назва, DOI, сторінки. Entered once, by whoever added
  /// it first, and it is what `totalHundredths` is computed from.
  evidence      Json
  computedValue Float

  /// A public link that proves it. D27: a record needs at least one of link or
  /// file; this is the link half, and it lives on the WORK because a
  /// co-authored article has one DOI, not one per author.
  link String?

  /// The whole pool, in INTEGER HUNDREDTHS OF AN HOUR. Frozen at creation:
  /// editing the наказ later must not move a pool people have already drawn
  /// from.
  totalHundredths Int

  /// Who typed it in. Named in the refusal a second author sees (D17), and the
  /// only person besides ADMIN who may correct the evidence.
  createdById String
  createdBy   Staff  @relation("ScienceWorkAuthor", fields: [createdById], references: [id])

  /// Normalised identity — `lib/science/work-key.ts`. UNIQUE, which is what
  /// makes D17 structural: there is no way to create a second row for one work.
  /// Carries the навчальний рік for a YEARLY type and a `s_<staffId>:` prefix
  /// for an INDIVIDUAL one (D24).
  dedupKey String @unique

  records ScienceRecord[]
  files   ScienceRecordFile[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([templateId, workTypeId])
}

/// One person's DRAW against a work — what lands in their план and counts
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
  template   SciencePlanTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

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

  /// D20 — post-check, not a gate. A record counts the moment it is saved;
  /// ННВ or ADMIN may decline it afterwards with a reason, and it stops
  /// counting. The row STAYS — it is the person's evidence of what happened and
  /// the reason they can read. Same shape as `Activity.status` / `removedBy`.
  status         ScienceRecordStatus @default(APPROVED)
  removedReason  String?
  removedByUserId String?
  removedBy      Staff?    @relation("ScienceRecordRemover", fields: [removedByUserId], references: [id])
  removedAt      DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  /// D10 and D17 together, enforced BY CONSTRUCTION: one person draws from one
  /// work at most once. The reuse rule rides on `ScienceWork.dedupKey` being
  /// unique and carrying the year for YEARLY types, so this single index also
  /// stops the same article being claimed again next year or on the other
  /// кафедра. No code path can forget to check.
  @@unique([staffId, workId])
  @@index([planId])
  @@index([workId])
  @@index([templateId, status])
}

enum ScienceRecordStatus {
  APPROVED
  REMOVED
}

model ScienceRecordFile {
  id String @id @default(cuid())

  /// Attached to the WORK, not to one person's draw: the сертифікат of an
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
  /// file. Item 4 pays 50 г PER PAGE, so this is the number a page claim is
  /// checked against.
  pageCount Int?

  /// SHA-256 of the bytes, lowercase hex. UNIQUE across the university (D28):
  /// one file, one record, for everybody. Renaming a file, re-exporting it or
  /// changing its date does not change this — only changing its content does,
  /// which is the whole reason the check is not on `fileName`.
  ///
  /// Under D27 a file is a PERSONAL document by construction, so there is no
  /// «one наказ covers three аспіранти» case this would wrongly refuse: a наказ
  /// is public and is proved by a link.
  sha256 String @unique

  uploadedById String
  uploadedBy   Staff  @relation("ScienceFileUploader", fields: [uploadedById], references: [id])

  uploadedAt DateTime @default(now())

  @@index([workId])
}
```

- [ ] **Step 3: Add every back-relation**

Prisma refuses to generate without both sides. Add:

- on `Staff`: `scienceRecords ScienceRecord[]`, `scienceWorksCreated ScienceWork[] @relation("ScienceWorkAuthor")`, `scienceRecordsRemoved ScienceRecord[] @relation("ScienceRecordRemover")`, `scienceFilesUploaded ScienceRecordFile[] @relation("ScienceFileUploader")`
- on `SciencePlanTemplate`: `works ScienceWork[]`, `records ScienceRecord[]`
- on `ScienceWorkType`: `works ScienceWork[]`
- on `SciencePlan`: `records ScienceRecord[]`
- on `SciencePlanRow`: `records ScienceRecord[]`

- [ ] **Step 4: Create the migration**

Run: `pnpm db:migrate --name science_records`
Expected: a new folder under `prisma/migrations/` and «Your database is now in sync with your schema».

- [ ] **Step 5: Regenerate the client, and tell the owner**

Run: `pnpm db:generate`

Then **say to the owner: restart `pnpm dev`.** The running dev server holds the old client and will throw `Unknown field` until it does. Do not restart it yourself.

- [ ] **Step 6: Read the generated SQL and check the two unique indexes are really there**

Run: `grep -n "UNIQUE" prisma/migrations/*science_records/migration.sql`
Expected: unique indexes on `ScienceWork.dedupKey`, `ScienceRecordFile.objectKey`, `ScienceRecordFile.sha256`, and the composite on `ScienceRecord(staffId, workId)`. **If any of the four is missing, stop** — every rule in this stage is one of them, and a missing index means the rule is not enforced anywhere.

- [ ] **Step 7: Add the Ukrainian labels**

In `lib/labels.ts`, add to `FIELD_LABELS` every field the audit log can now print:

```ts
  hoursHundredths: 'Години',
  totalHundredths: 'Загальні години роботи',
  link: 'Посилання',
  dedupKey: 'Ключ роботи',
  removedReason: 'Причина відхилення',
  fileName: 'Файл',
  pageCount: 'Сторінок у файлі',
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 9: Commit** — report to the owner.

---

## Phase C — recording a work, against a link

At the end of this phase an НПП can record work, a second author is refused and offered the join, and the pool cannot be overspent. **No files yet** — every record here is proved by a link, which is the whole catalogue as seeded (nothing sets `requiresFile` today; confirm with `grep -n "requiresFile" lib/science/work-types-2027.ts`).

### Task 6: `saveRecord` — create the work and the first draw

**Files:**

- Create: `app/(dashboard)/science-plan/record-actions.ts`
- Test: `app/(dashboard)/science-plan/record-actions.test.ts`

**Interfaces:**

- Consumes: `workKey` (Task 2), `poolProblem` (Task 3), `evidenceProblem` (Task 4), the models (Task 5), `getActiveScienceTemplate`, `rateForPlan` from `lib/science/target.ts`, `computeScore` from `lib/specs/scoring.ts`, `schemaForFields` from `validations/activity-evidence.ts`, `toHundredths` from `lib/stake/units.ts`.
- Produces:

```ts
export interface SaveRecordInput {
  departmentId: string;
  workTypeId: string;
  /** The type's WHOLE evidenceFields set — a record is not a plan row (D23). */
  evidence: unknown;
  link?: string;
  planRowId?: string;
  /** Only meaningful for a SHARED type; an INDIVIDUAL one always takes the whole pool. */
  hoursHundredths?: number;
}

export interface WorkConflict {
  workId: string;
  createdByName: string;
  summary: string;
  totalHundredths: number;
  remainingHundredths: number;
}

export type SaveRecordResult =
  | { ok: true; recordId: string }
  | { error: string }
  | { conflict: WorkConflict };

export async function saveRecord(input: SaveRecordInput): Promise<SaveRecordResult>;
```

- [ ] **Step 1: Read the harness you are writing tests into**

Run: `sed -n '1,40p' "app/(dashboard)/science-plan/actions.test.ts"`

It mocks `@/lib/db` with a `tx` object and a `$transaction` that calls the callback with it. Copy that shape exactly — adding `scienceWork`, `scienceRecord` and `staff.findUnique` to the mocked `tx`.

- [ ] **Step 2: Write the failing tests**

Create `app/(dashboard)/science-plan/record-actions.test.ts`. Mock exactly as Stage 1 does, then:

```ts
describe('saveRecord', () => {
  it('refuses a кафедра the person does not work on', async () => {
    const result = await saveRecord({ ...base, departmentId: 'other-dept' });
    expect(result).toEqual({ error: 'Ви не працюєте на цій кафедрі' });
  });

  it('refuses a closed year', async () => {
    mockTemplate.mockResolvedValue({ ...TEMPLATE, status: 'CLOSED' });
    expect(await saveRecord(base)).toEqual({ error: 'Планування на цей рік закрито' });
  });

  it('refuses evidence with neither link nor file (D27)', async () => {
    const result = await saveRecord({ ...base, link: undefined });
    expect(result).toEqual({ error: 'Додайте посилання або файл підтвердження' });
  });

  it('refuses evidence that identifies nothing — no key, no work', async () => {
    const result = await saveRecord({ ...base, evidence: { option: 'scopus', credits: 10 } });
    expect(result).toMatchObject({ error: expect.stringContaining('розпізнати') });
  });

  it('creates the work and the draw, freezing the hours at INTEGER HUNDREDTHS', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(null);
    (db.scienceWork.create as Mock).mockResolvedValue({ id: 'w1', totalHundredths: 50000 });
    (db.scienceRecord.create as Mock).mockResolvedValue({ id: 'r1' });

    const result = await saveRecord(base);

    expect(result).toEqual({ ok: true, recordId: 'r1' });
    // 10 сторінок × 50 г = 500 год
    expect((db.scienceWork.create as Mock).mock.calls[0][0].data.totalHundredths).toBe(50000);
    expect(
      Number.isInteger((db.scienceRecord.create as Mock).mock.calls[0][0].data.hoursHundredths)
    ).toBe(true);
  });

  it('gives an INDIVIDUAL work its whole pool and ignores a typed hours figure', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue({ ...ARTICLE, sharing: 'INDIVIDUAL' });
    (db.scienceWork.findUnique as Mock).mockResolvedValue(null);
    (db.scienceWork.create as Mock).mockResolvedValue({ id: 'w1', totalHundredths: 50000 });
    (db.scienceRecord.create as Mock).mockResolvedValue({ id: 'r1' });

    await saveRecord({ ...base, hoursHundredths: 100 });

    expect((db.scienceRecord.create as Mock).mock.calls[0][0].data.hoursHundredths).toBe(50000);
  });

  it('returns a CONFLICT naming the person who has it, not an error (D17)', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      id: 'w1',
      totalHundredths: 20000,
      createdBy: { lastName: 'Іваненко', firstName: 'Іван', patronymic: 'Іванович' },
      evidence: { title: 'Стаття' },
      records: [{ staffId: 'other', hoursHundredths: 15000 }],
    });

    const result = await saveRecord(base);

    expect(result).toMatchObject({
      conflict: { workId: 'w1', createdByName: 'Іваненко І. І.', remainingHundredths: 5000 },
    });
  });

  it('tells a person who already drew on that work, rather than offering the join again', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      id: 'w1',
      totalHundredths: 20000,
      createdBy: { lastName: 'Іваненко', firstName: 'Іван', patronymic: 'Іванович' },
      evidence: { title: 'Стаття' },
      records: [{ staffId: 'staff-1', hoursHundredths: 5000 }],
    });
    expect(await saveRecord(base)).toEqual({ error: 'Ви вже додали цю роботу' });
  });

  it('turns a dedupKey race into the same conflict, not a 500', async () => {
    // Two co-authors press save in the same second. The pre-read saw nothing;
    // the unique index is what actually decides.
    (db.scienceWork.findUnique as Mock).mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'w1',
      totalHundredths: 20000,
      createdBy: { lastName: 'Іваненко', firstName: 'Іван', patronymic: 'Іванович' },
      evidence: { title: 'Стаття' },
      records: [],
    });
    (db.$transaction as Mock).mockRejectedValueOnce(
      Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['dedupKey'] } })
    );

    expect(await saveRecord(base)).toMatchObject({ conflict: { workId: 'w1' } });
  });

  it('refuses a work type already at its maxPerYear', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue({ ...ARTICLE, maxPerYear: 5 });
    (db.scienceRecord.count as Mock).mockResolvedValue(5);
    expect(await saveRecord(base)).toMatchObject({
      error: expect.stringContaining('Не більше 5'),
    });
  });

  it('refuses a plan row belonging to somebody else, or to another work type', async () => {
    (db.sciencePlanRow.findUnique as Mock).mockResolvedValue({
      id: 'pr1',
      planId: 'someone-elses-plan',
      workTypeId: 'wt1',
    });
    expect(await saveRecord({ ...base, planRowId: 'pr1' })).toEqual({
      error: 'Рядок плану не знайдено',
    });
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run "app/(dashboard)/science-plan/record-actions.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the action**

Create `app/(dashboard)/science-plan/record-actions.ts`. The whole file, in order:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { logError } from '@/lib/log';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { rateForPlan } from '@/lib/science/target';
import { workKey } from '@/lib/science/work-key';
import { poolProblem, remainingHundredths } from '@/lib/science/pool';
import { evidenceProblem } from '@/lib/science/evidence-rule';
import { computeScore, type ScoringSpec } from '@/lib/specs/scoring';
import { toHundredths } from '@/lib/stake/units';
import { schemaForFields } from '@/validations/activity-evidence';
import { summarizeEvidence, type EvidenceField } from '@/lib/rating/evidence-fields';
import { initials } from '@/lib/name';
```

Then the exported types exactly as given in **Interfaces** above, then:

```ts
/** «Іваненко І. І.» — what D17's refusal names. */
function shortName(p: { lastName: string; firstName: string; patronymic: string | null }): string {
  return initials(p);
}

export async function saveRecord(input: SaveRecordInput): Promise<SaveRecordResult> {
  const session = await auth();
  const userId = session?.user?.id;
  const staffId = session?.user?.staffId;
  if (!session || !userId || !staffId) return { error: 'Недостатньо прав' };

  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: {
      lastName: true,
      firstName: true,
      patronymic: true,
      isNpp: true,
      departmentId: true,
      partTimeDepartments: { select: { departmentId: true } },
    },
  });
  if (!staff?.isNpp) return { error: 'Облік наукової роботи доступний лише для НПП' };

  // Never trust the кафедра that arrived — primary, or additional through
  // StaffDepartment. Same check `savePlanRow` makes, same reason.
  const worksHere =
    staff.departmentId === input.departmentId ||
    staff.partTimeDepartments.some((d) => d.departmentId === input.departmentId);
  if (!worksHere) return { error: 'Ви не працюєте на цій кафедрі' };

  const template = await getActiveScienceTemplate();
  if (!template || template.status !== 'OPEN') return { error: 'Планування на цей рік закрито' };

  const type = await db.scienceWorkType.findFirst({
    where: { id: input.workTypeId, templateId: template.id, isActive: true },
  });
  if (!type) return { error: 'Цей вид роботи недоступний' };

  const fields = type.evidenceFields as unknown as EvidenceField[];
  const scoring = type.scoring as unknown as ScoringSpec;

  // A RECORD parses the type's WHOLE field set — unlike a plan row, which takes
  // only what the scoring rule reads (D23). By now the work exists, so it has a
  // назва, a DOI, a page count.
  const parsed = schemaForFields(fields, scoring).safeParse(input.evidence);
  if (!parsed.success) return { error: 'Невірні дані форми' };

  const link = input.link?.trim() || null;
  // fileCount is 0 until Phase E; `requiresFile` is set on no seeded type, so
  // this refuses exactly the «neither link nor file» case today.
  const problem = evidenceProblem({ requiresFile: type.requiresFile, link, fileCount: 0 });
  if (problem) return { error: problem };

  const key = workKey({
    identityFields: Array.isArray(type.identityFields) ? (type.identityFields as string[]) : [],
    evidenceFields: fields,
    reuse: type.reuse,
    sharing: type.sharing,
    evidence: parsed.data,
    academicYear: template.academicYear,
    staffId,
  });
  if (!key) return { error: 'Вкажіть назву або посилання, щоб роботу можна було розпізнати' };

  let score: number;
  try {
    ({ score } = computeScore(
      { code: type.code, coefficient: type.coefficient, scoring, evidenceFields: fields },
      parsed.data
    ));
  } catch (e) {
    logError('science.saveRecord', e, { userId, entityId: type.id });
    return { error: 'Невідомий вид роботи' };
  }
  const totalHundredths = toHundredths(score);

  // ── Does the work already exist? ──────────────────────────────────────────
  const existing = await db.scienceWork.findUnique({
    where: { dedupKey: key },
    select: {
      id: true,
      totalHundredths: true,
      evidence: true,
      createdBy: { select: { lastName: true, firstName: true, patronymic: true } },
      records: {
        where: { status: 'APPROVED' },
        select: { staffId: true, hoursHundredths: true },
      },
    },
  });
  if (existing) {
    if (existing.records.some((r) => r.staffId === staffId)) {
      return { error: 'Ви вже додали цю роботу' };
    }
    const drawn = existing.records.reduce((sum, r) => sum + r.hoursHundredths, 0);
    return {
      conflict: {
        workId: existing.id,
        createdByName: shortName(existing.createdBy),
        summary: summarizeEvidence(fields, existing.evidence) ?? type.label,
        totalHundredths: existing.totalHundredths,
        remainingHundredths: remainingHundredths(existing.totalHundredths, drawn),
      },
    };
  }

  // A SHARED work's creator takes what they need and leaves the rest (D16,
  // «first come, takes what they need»); an INDIVIDUAL one has no pool to
  // share, so the control is not even shown and the figure is ignored.
  const requested =
    type.sharing === 'INDIVIDUAL' ? totalHundredths : (input.hoursHundredths ?? totalHundredths);
  const poolFault = poolProblem({ totalHundredths, drawnByOthers: 0, requested });
  if (poolFault) return { error: poolFault };

  const auditLabel =
    `${staff.lastName} ${staff.firstName} ${staff.patronymic ?? ''} — ${type.label}`.trim();

  try {
    const recordId = await db.$transaction(async (tx) => {
      const plan =
        (await tx.sciencePlan.findUnique({
          where: {
            staffId_departmentId_templateId: {
              staffId,
              departmentId: input.departmentId,
              templateId: template.id,
            },
          },
          select: { id: true },
        })) ??
        (await tx.sciencePlan.create({
          data: {
            staffId,
            departmentId: input.departmentId,
            templateId: template.id,
            // Same live refresh `savePlanRow` does: a розподіл saved in
            // November must reach a plan made in September.
            rateHundredths: await rateForPlan(tx, {
              staffId,
              departmentId: input.departmentId,
              stakeYear: template.stakeYear,
            }),
          },
          select: { id: true },
        }));

      if (input.planRowId) {
        const row = await tx.sciencePlanRow.findUnique({
          where: { id: input.planRowId },
          select: { planId: true, workTypeId: true },
        });
        // Somebody else's row, or a row of a different вид роботи — neither is
        // a thing this record can fulfil.
        if (!row || row.planId !== plan.id || row.workTypeId !== type.id) {
          throw new PlanRowNotFoundError();
        }
      }

      if (type.maxPerYear) {
        const count = await tx.scienceRecord.count({
          where: {
            staffId,
            templateId: template.id,
            status: 'APPROVED',
            work: { workTypeId: type.id },
          },
        });
        if (count >= type.maxPerYear) throw new CapExceededError(type.maxPerYear);
      }

      const work = await tx.scienceWork.create({
        data: {
          templateId: template.id,
          workTypeId: type.id,
          evidence: parsed.data as Prisma.InputJsonValue,
          computedValue: score,
          link,
          totalHundredths,
          createdById: staffId,
          dedupKey: key,
        },
        select: { id: true },
      });

      const record = await tx.scienceRecord.create({
        data: {
          staffId,
          workId: work.id,
          templateId: template.id,
          planId: plan.id,
          planRowId: input.planRowId ?? null,
          hoursHundredths: requested,
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'ScienceRecord',
          entityId: record.id,
          label: auditLabel,
          userId,
          changes: diffChanges(
            {},
            { workType: type.label, hoursHundredths: requested, totalHundredths, link }
          ),
        },
      });

      return record.id;
    });

    revalidatePath('/science-plan');
    return { ok: true, recordId };
  } catch (e) {
    if (e instanceof CapExceededError) {
      return { error: `Не більше ${e.cap} записів цього виду роботи на рік` };
    }
    if (e instanceof PlanRowNotFoundError) return { error: 'Рядок плану не знайдено' };

    // The dedupKey race: the pre-read above saw nothing and somebody else's
    // insert landed first. The unique index is what actually decides, so read
    // the winner and return D17's offer instead of an error nobody can act on.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002' &&
      String(e.meta?.target).includes('dedupKey')
    ) {
      const winner = await db.scienceWork.findUnique({
        where: { dedupKey: key },
        select: {
          id: true,
          totalHundredths: true,
          evidence: true,
          createdBy: { select: { lastName: true, firstName: true, patronymic: true } },
          records: { where: { status: 'APPROVED' }, select: { hoursHundredths: true } },
        },
      });
      if (winner) {
        const drawn = winner.records.reduce((sum, r) => sum + r.hoursHundredths, 0);
        return {
          conflict: {
            workId: winner.id,
            createdByName: shortName(winner.createdBy),
            summary: summarizeEvidence(fields, winner.evidence) ?? type.label,
            totalHundredths: winner.totalHundredths,
            remainingHundredths: remainingHundredths(winner.totalHundredths, drawn),
          },
        };
      }
    }

    return {
      error: parseDbError(e, 'Не вдалося зберегти. Зміни не застосовано', 'science.saveRecord', {
        userId,
      }),
    };
  }
}
```

with the two sentinels beside `SaveRecordInput`, copying `savePlanRow`'s pattern:

```ts
class CapExceededError extends Error {
  constructor(public readonly cap: number) {
    super('cap exceeded');
  }
}
class PlanRowNotFoundError extends Error {}
```

- [ ] **Step 5: Check `initials` exists, or write it**

Run: `grep -rn "export function initials" lib/`

If nothing comes back, add it to `lib/name.ts` (create the file) with its own test:

```ts
/** «Іваненко Іван Іванович» → «Іваненко І. І.» — the form every list in the
 *  app already prints, and the form D17's refusal names somebody in. */
export function initials(p: {
  lastName: string;
  firstName: string;
  patronymic: string | null;
}): string {
  const first = p.firstName ? `${p.firstName[0]}.` : '';
  const middle = p.patronymic ? ` ${p.patronymic[0]}.` : '';
  return `${p.lastName} ${first}${middle}`.trim();
}
```

If it exists somewhere else, import from there instead of writing a second one (§11: one caller means local, two means shared).

- [ ] **Step 6: Run the tests**

Run: `npx vitest run "app/(dashboard)/science-plan/record-actions.test.ts"`
Expected: PASS, 10 tests.

- [ ] **Step 7: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint "app/(dashboard)/science-plan" lib/science`
Expected: clean.

- [ ] **Step 8: Commit** — report to the owner.

---

### Task 7: `joinWork` — the second author's draw

**Files:**

- Modify: `app/(dashboard)/science-plan/record-actions.ts`
- Modify: `app/(dashboard)/science-plan/record-actions.test.ts`

**Interfaces:**

- Produces:

```ts
export async function joinWork(input: {
  workId: string;
  departmentId: string;
  hoursHundredths: number;
  planRowId?: string;
}): Promise<SaveRecordResult>;
```

- [ ] **Step 1: Write the failing tests**

Add to `record-actions.test.ts`:

```ts
describe('joinWork', () => {
  it('refuses more hours than the pool has left', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      id: 'w1',
      templateId: 't1',
      totalHundredths: 20000,
      workType: ARTICLE,
      records: [{ staffId: 'other', hoursHundredths: 15000 }],
    });
    const result = await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 5001 });
    expect(result).toMatchObject({ error: expect.stringContaining('Залишилось') });
  });

  it('re-reads the drawn sum INSIDE the transaction, not from the client', async () => {
    // Two co-authors both saw «50 год залишилось». The second must lose.
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      id: 'w1',
      templateId: 't1',
      totalHundredths: 20000,
      workType: ARTICLE,
      records: [],
    });
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 20000 } });

    const result = await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 5000 });
    expect(result).toMatchObject({ error: expect.stringContaining('Залишилось') });
    expect(db.scienceRecord.create).not.toHaveBeenCalled();
  });

  it('refuses joining an INDIVIDUAL work — it has no pool to share', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      id: 'w1',
      templateId: 't1',
      totalHundredths: 20000,
      workType: { ...ARTICLE, sharing: 'INDIVIDUAL' },
      records: [],
    });
    expect(
      await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 100 })
    ).toMatchObject({ error: expect.stringContaining('індивідуальн') });
  });

  it('refuses a work from another навчальний рік', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      id: 'w1',
      templateId: 'old-template',
      totalHundredths: 20000,
      workType: ARTICLE,
      records: [],
    });
    expect(await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 100 })).toEqual({
      error: 'Роботу не знайдено',
    });
  });

  it('turns the double-claim race into a plain message', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      id: 'w1',
      templateId: 't1',
      totalHundredths: 20000,
      workType: ARTICLE,
      records: [],
    });
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 0 } });
    (db.$transaction as Mock).mockRejectedValueOnce(
      Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['staffId', 'workId'] } })
    );
    expect(await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 100 })).toEqual({
      error: 'Ви вже додали цю роботу',
    });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run "app/(dashboard)/science-plan/record-actions.test.ts" -t joinWork`
Expected: FAIL — `joinWork is not a function`.

- [ ] **Step 3: Write it**

Append to `record-actions.ts`. The guards repeat `saveRecord`'s (auth, isNpp, worksHere, OPEN template) — factor those into one local helper both call, returning either the resolved context or an error string. Then the part that is only this action's:

```ts
const drawnByOthers = await tx.scienceRecord.aggregate({
  where: { workId: work.id, status: 'APPROVED', staffId: { not: staffId } },
  _sum: { hoursHundredths: true },
});
// Re-read INSIDE the transaction, never from a figure the client sent.
// Two co-authors saving at the same moment must not both see 50 free hours
// and both take them — the same rule `saveDistribution` follows for a
// кафедра's pool.
const fault = poolProblem({
  totalHundredths: work.totalHundredths,
  drawnByOthers: drawnByOthers._sum.hoursHundredths ?? 0,
  requested: input.hoursHundredths,
});
if (fault) throw new PoolError(fault);
```

and, before the transaction:

```ts
if (work.templateId !== template.id) return { error: 'Роботу не знайдено' };
if (work.workType.sharing === 'INDIVIDUAL') {
  return { error: 'Ця робота індивідуальна — до неї не можна приєднатися' };
}
```

`@@unique([staffId, workId])` catches the double-claim race; map `P2002` on that target to `'Ви вже додали цю роботу'`. Audit the join with `diffChanges({}, { workType, hoursHundredths, joinedWorkId })` — the spec asks for it by name: «because joining is open, `ScienceRecord` rows are audited, so who attached themselves to which work, and for how many hours, is always answerable».

- [ ] **Step 4: Run the tests**

Run: `npx vitest run "app/(dashboard)/science-plan/record-actions.test.ts"`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit** — report to the owner.

---

### Task 8: correcting and withdrawing

**Files:**

- Modify: `app/(dashboard)/science-plan/record-actions.ts`
- Modify: `app/(dashboard)/science-plan/record-actions.test.ts`

**Interfaces:**

- Produces:

```ts
export async function updateWorkEvidence(input: {
  workId: string;
  evidence: unknown;
  link?: string;
}): Promise<{ ok: true } | { error: string }>;

export async function deleteRecord(recordId: string): Promise<{ ok: true } | { error: string }>;
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('updateWorkEvidence', () => {
  it('refuses anybody but the creator and ADMIN', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ ...WORK, createdById: 'someone-else' });
    expect(await updateWorkEvidence({ workId: 'w1', evidence: EVIDENCE })).toEqual({
      error: 'Редагувати роботу може лише той, хто її додав',
    });
  });

  it('refuses an edit that would put the pool below what is already drawn', async () => {
    // 10 сторінок → 2 сторінки moves the pool from 500 to 100 год, and 300 are
    // already taken by two authors.
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ ...WORK, createdById: 'staff-1' });
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 30000 } });
    const result = await updateWorkEvidence({
      workId: 'w1',
      evidence: { ...EVIDENCE, credits: 2 },
      link: 'https://example.com/a',
    });
    expect(result).toMatchObject({ error: expect.stringContaining('300') });
  });

  it('recomputes the dedupKey when the identity changes', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ ...WORK, createdById: 'staff-1' });
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 0 } });
    await updateWorkEvidence({
      workId: 'w1',
      evidence: { ...EVIDENCE, title: 'Інша назва' },
      link: 'https://example.com/a',
    });
    expect((db.scienceWork.update as Mock).mock.calls[0][0].data.dedupKey).toBe('t:інша назва');
  });
});

describe('deleteRecord', () => {
  it('refuses somebody else’s record', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({ ...RECORD, staffId: 'other' });
    expect(await deleteRecord('r1')).toEqual({ error: 'Запис не знайдено' });
  });

  it('deletes the draw and LEAVES the work standing', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue(RECORD);
    await deleteRecord('r1');
    expect(db.scienceRecord.delete).toHaveBeenCalled();
    expect(db.scienceWork.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run "app/(dashboard)/science-plan/record-actions.test.ts" -t "updateWorkEvidence|deleteRecord"`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Write both**

`updateWorkEvidence`: only `createdById === staffId` or `session.user.role === 'ADMIN'`; re-parse, recompute `computedValue`, `totalHundredths` and `dedupKey`; refuse when `Σ drawn > newTotal`, naming the shortfall; a `P2002` on `dedupKey` means the new identity collides with another work — return `'Робота з такою назвою вже існує'`. Audit with before/after.

`deleteRecord`: the row must be the caller's own and on the OPEN template. **Delete the record, never the work** — the spec is explicit: «Deleting the last claim does not delete the work», because its `dedupKey` is what stops it being re-entered and a co-author may still draw on it. Audit the delete.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run "app/(dashboard)/science-plan/record-actions.test.ts"`
Expected: PASS, 20 tests.

- [ ] **Step 5: Commit** — report to the owner.

---

### Task 9: план and факт in one read

**Files:**

- Modify: `lib/science/target.ts`
- Modify: `lib/science/target.test.ts`
- Modify: `lib/queries/get-science-plan.ts`
- Modify: `lib/queries/get-science-plan.test.ts`
- Create: `lib/queries/get-science-work.ts`

**Interfaces:**

- Produces:

```ts
// lib/science/target.ts — PlanTarget gains two fields
export interface PlanTarget {
  rateHundredths: number | null;
  targetHundredths: number | null;
  plannedHundredths: number;
  shortfallHundredths: number | null;
  doneHundredths: number;
  /** null when there is no target; never negative. */
  doneShortfallHundredths: number | null;
}

// lib/queries/get-science-plan.ts
export interface SciencePlanRecordDetail {
  id: string;
  workId: string;
  workTypeId: string;
  workTypeLabel: string;
  itemNumber: string;
  summary: string;
  link: string | null;
  hoursHundredths: number;
  totalHundredths: number;
  planRowId: string | null;
  status: ScienceRecordStatus;
  removedReason: string | null;
  fileCount: number;
  /** Other people drawing on the same work — «Іваненко І. І. — 150 год». */
  coAuthors: { name: string; hoursHundredths: number }[];
}
// SciencePlanDetail gains: records: SciencePlanRecordDetail[]
// SciencePlanRowDetail gains: doneHundredths: number  ← the «Виконано» marker

// lib/queries/get-science-work.ts
export async function getScienceWork(workId: string): Promise<{
  id: string;
  label: string;
  summary: string;
  link: string | null;
  totalHundredths: number;
  remainingHundredths: number;
  createdByName: string;
  draws: { staffId: string; name: string; hoursHundredths: number }[];
} | null>;
```

- [ ] **Step 1: Write the failing test for the target**

Add to `lib/science/target.test.ts`:

```ts
it('counts план and факт against the same ціль, separately', () => {
  const t = planTarget({
    minHoursPerRate: 500,
    rateHundredths: 100,
    plannedHundredths: 50000,
    doneHundredths: 20000,
  });
  expect(t.targetHundredths).toBe(50000);
  expect(t.shortfallHundredths).toBe(0);
  expect(t.doneHundredths).toBe(20000);
  expect(t.doneShortfallHundredths).toBe(30000);
});

it('has no факт shortfall when there is no target at all', () => {
  const t = planTarget({
    minHoursPerRate: 500,
    rateHundredths: null,
    plannedHundredths: 0,
    doneHundredths: 12000,
  });
  expect(t.doneShortfallHundredths).toBeNull();
  expect(t.doneHundredths).toBe(12000);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/science/target.test.ts`
Expected: FAIL — `doneHundredths` is not a property.

- [ ] **Step 3: Extend `planTarget`**

`doneHundredths` becomes a required input (default it to `0` at the two call sites that do not have records yet, rather than making the parameter optional — an optional one silently reads zero on the screen that forgot to pass it).

- [ ] **Step 4: Extend `getSciencePlan`**

Read the person's records for this plan in the same query, `status: 'APPROVED'` only — a declined record must stop counting the moment ННВ declines it (D20). Sum them into `doneHundredths`. Attach each record's co-authors by reading its work's other APPROVED records.

Each `SciencePlanRowDetail` gains `doneHundredths` — the sum of records pointing at that row — which is what draws the «Виконано» marker inside the «План» tab (D29).

- [ ] **Step 5: Extend the query's test**

`lib/queries/get-science-plan.test.ts` already mocks the db. Add: a REMOVED record is excluded from `doneHundredths`; a record with `planRowId` raises that row's `doneHundredths`; an unplanned record raises the plan total but no row's.

- [ ] **Step 6: Run everything**

Run: `npx vitest run lib/science lib/queries`
Expected: PASS.

- [ ] **Step 7: Commit** — report to the owner.

---

## Phase D — the screens

### Task 10: «План» / «Виконано» on `/science-plan` (D29)

**Files:**

- Create: `components/science/record-tabs.tsx`
- Create: `components/science/record-list.tsx`
- Create: `components/science/add-record-dialog.tsx`
- Create: `components/science/join-work-panel.tsx`
- Create: `components/science/delete-record-button.tsx`
- Modify: `components/science/plan-total.tsx` (the band shows both numbers)
- Modify: `components/science/plan-view.tsx` (the «Виконано» marker on a fulfilled row)
- Modify: `app/(dashboard)/science-plan/page.tsx`
- Modify: `app/(dashboard)/science-plan/loading.tsx`

**Interfaces:**

- Consumes: `SciencePlanDetail` and `SciencePlanRecordDetail` (Task 9), `saveRecord` / `joinWork` / `deleteRecord` (Tasks 6–8), `PlanWorkType` from `components/science/add-plan-row-dialog.tsx`.
- Produces: no new exported logic. `formatHours` stays where it is, in `plan-total.tsx`.

- [ ] **Step 1: Read the rules before drawing anything**

Run: `sed -n '1,60p' docs/aurora.md` and the §3 (colour) and §12 (traps) sections.

Two that bite on this screen specifically: a status badge may carry a hue, a table row may not; and **a page with furniture above a list needs `fill`, not the table's default cap** (§12, added 2026-09-17 after the ННВ list scrolled twice).

- [ ] **Step 2: Build the tab row**

`record-tabs.tsx` is a **server** component: two links styled exactly like `DepartmentSwitcher` in `plan-view.tsx` — the active one takes `bg-brand text-brand-foreground`, per §3's «the accent marks the active tab». The tab lives in the URL (`?tab=done`), not in client state, so it survives a refresh and the Back button, and so the server renders only the list being looked at.

```tsx
const TABS = [
  { key: 'plan', label: 'План' },
  { key: 'done', label: 'Виконано' },
] as const;
```

- [ ] **Step 3: Make the band show both numbers**

In `plan-total.tsx`, the card becomes:

```
Заплановано 520 з 500 год     ✓ Ціль виконано
Виконано 180 з 500 год        ⚠ Бракує 320 год
```

Both lines, always, under one target — that is what makes the tab switch cost nothing (D29: «the comparison lives in the band, not the lists»). The three states the band already has (met / short / no target at all) apply to each line independently; keep the existing `Badge tone="ok" | "warn"` treatment and **do not** colour the numbers themselves.

- [ ] **Step 4: The «Виконано» marker inside the «План» tab**

In `plan-view.tsx`, a row whose `doneHundredths > 0` gets a `<Badge tone="ok">Виконано</Badge>` beside its hours, and one whose `doneHundredths` is short of `plannedHundredths` shows nothing extra — a partially fulfilled intention is not a problem to flag, it is an ordinary September-to-June state.

- [ ] **Step 5: The record list**

`record-list.tsx` mirrors `plan-view.tsx`'s list: item number, label, the evidence summary, the link as an `<a>`, the hours, and a delete button. Two things it adds:

- **co-authors**, when the work has other draws: «Разом з: Іваненко І. І. — 150 год». Plain text, `text-foreground-soft`. This is the only place a person sees that their 50 год came out of a 200 год pool.
- **a declined record** (`status: 'REMOVED'`) renders greyed, with `<Badge tone="error">Відхилено</Badge>` and the reason underneath, and **does not** count in the band. It stays visible because the person has to be able to read why.

- [ ] **Step 6: The add dialog**

`add-record-dialog.tsx` follows `add-plan-row-dialog.tsx` closely — same `Dialog`, same work-type picker grouped by `itemNumber`, same live hours preview through `computeScore`. Four differences:

1. **The whole `evidenceFields` set is rendered**, not `planFields`'s subset. A record describes work that exists, so it has a назва, a DOI, a page count (D23 is about the PLAN, and only the plan).
2. **A link box**, always present, labelled «Посилання на підтвердження».
3. **A «Виконання пункту плану» select**, listing this person's plan rows of the same work type plus «Не заплановано». Optional, and the default is «Не заплановано» — most records are unplanned and nobody should have to dismiss a required field to say so.
4. **An hours box, only when the work type is `SHARED`**, defaulting to the whole computed pool with the note «Ви можете взяти менше, якщо роботу ділите зі співавторами». Hidden entirely for an `INDIVIDUAL` type, which has no pool to divide.

- [ ] **Step 7: The join panel**

When `saveRecord` returns `{ conflict }`, the dialog does **not** close and does **not** show a red error. It swaps its body for `join-work-panel.tsx`:

```
Цю роботу вже додав Іваненко І. І.
«Стаття про цифрову освіту»
Залишилось 50 з 200 год

[ Години: 50 ]   [ Приєднатися ]   [ Скасувати ]
```

D17 in practice: a refusal turned into an offer. The hours box is capped at `remainingHundredths` client-side and re-checked server-side inside the transaction — the client cap is a convenience, never the rule.

- [ ] **Step 8: Wire the page**

`page.tsx` reads `?tab=`, passes `records` to the list or `rows` to the plan view, and renders the band above both. Keep the кафедра switcher where it is — it applies to both tabs.

- [ ] **Step 9: Update the skeleton**

`loading.tsx` must draw the band with BOTH lines and the tab row, or the page will jump on every load. §12's «pin the fixed chrome to the pixel» — the staff record skeletons were fixed for exactly this.

- [ ] **Step 10: Check it in the browser**

**Ask the owner to look**, with this list — you cannot run the dev server:

1. Add a record with a link → it appears under «Виконано», the band's second line moves.
2. Add the same DOI as a second person → the join offer appears, naming the first person and what is left.
3. Join with more hours than are left → refused, with the remaining figure.
4. Plan a row, then record against it → the «План» tab's row shows «Виконано».
5. Narrow the window to phone width → one scrollbar, nothing clipped.

- [ ] **Step 11: Commit** — report to the owner.

---

### Task 11: «Виконано» on the three read screens

**Files:**

- Modify: `lib/queries/list-science-plans.ts`
- Modify: `lib/queries/list-science-plans.test.ts`
- Modify: `lib/science/plan-rows.ts` and `lib/science/plan-rows.test.ts`
- Modify: `components/science/department-plans-table.tsx`
- Modify: `app/(dashboard)/science-plans/page.tsx`
- Modify: `app/(dashboard)/my-department/science-plans/page.tsx`
- Modify: both `loading.tsx` files

**Interfaces:**

- Produces: `SciencePlanRowSummary` gains `doneHundredths: number` and `doneShortfallHundredths: number | null`; `PLAN_SORT_FIELDS` gains `'done'`; `PLAN_STATES` gains `'nodone'`.

- [ ] **Step 1: Write the failing query test**

In `lib/queries/list-science-plans.test.ts`:

```ts
it('sums only APPROVED records into виконано', async () => {
  // A declined record stops counting the moment ННВ declines it (D20).
  const rows = await listSciencePlans({ templateId: 't1', departmentIds: ['d1'] });
  expect(rows[0].doneHundredths).toBe(20000);
});

it('counts a сумісник’s records on the кафедра whose plan holds them', async () => {
  // A record belongs to exactly one plan — i.e. exactly one кафедра — so the
  // other кафедра's row must not see those hours.
  const rows = await listSciencePlans({ templateId: 't1', departmentIds: ['d1', 'd2'] });
  expect(rows.find((r) => r.departmentId === 'd2')?.doneHundredths).toBe(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/queries/list-science-plans.test.ts`
Expected: FAIL — `doneHundredths` is undefined.

- [ ] **Step 3: Extend the query**

Select each person's `scienceRecords` for this template filtered to `status: 'APPROVED'`, grouped by the record's `plan.departmentId`, and feed the sum into `planTarget` as `doneHundredths`.

- [ ] **Step 4: Add the state and the sort field**

In `plan-rows.ts`: `'nodone'` (`doneHundredths === 0`) joins `PLAN_STATES` with the label «Нічого не виконано», and `'done'` joins `PLAN_SORT_FIELDS` as a numeric column. Extend `plan-rows.test.ts` for both.

- [ ] **Step 5: Add the column and the tile**

`department-plans-table.tsx` gains a sortable «Виконано» column between «Заплановано» and «Бракує». Both pages gain a fifth stat tile, «Нічого не виконано», linking to `?state=nodone`.

Note the strip is `sm:grid-cols-4`; five tiles need `sm:grid-cols-5` — and check it at 1280px before you decide five fit. If they do not, drop «Усього позицій» to the subtitle, which already prints the count.

- [ ] **Step 6: Run everything and check the build**

Run: `npx vitest run && npx tsc --noEmit && npx next build`
Expected: all pass.

- [ ] **Step 7: Commit** — report to the owner.

---

## Phase E — files

Nothing above this line touches R2. If the credentials are not ready, Phases A–D still ship a working stage against links.

### Task 12: the R2 client

**Files:**

- Create: `lib/science/r2.ts`
- Modify: `.env.example` (already has the keys — add `R2_JURISDICTION` handling if absent)
- Modify: `package.json` (`pdf-lib`)

**Interfaces:**

- Produces:

```ts
export function objectKeyFor(input: { templateId: string; workId: string; ext: string }): string;
export async function presignPut(key: string, contentType: string): Promise<string>;
export async function presignGet(key: string): Promise<string>;
export async function headObject(
  key: string
): Promise<{ sizeBytes: number; contentType: string } | null>;
export async function getObjectBytes(key: string): Promise<Buffer>;
export async function deleteObject(key: string): Promise<void>;
```

- [ ] **Step 1: Install `pdf-lib`**

Run: `pnpm add pdf-lib`

`@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` are already in `package.json` from commit 8a60bb1 — check with `grep aws-sdk package.json` before adding anything.

- [ ] **Step 2: Write the endpoint, carefully**

```ts
/**
 * **A bucket created with the EU jurisdiction does NOT answer at
 * `<account>.r2.cloudflarestorage.com`** — it answers at
 * `<account>.eu.r2.cloudflarestorage.com`, and the default address reports
 * «NoSuchBucket» with credentials that are perfectly valid. That cost an hour
 * on 2026-09-15. `R2_JURISDICTION` is the segment; empty for a plain bucket.
 */
function endpoint(): string {
  const jurisdiction = process.env.R2_JURISDICTION?.trim();
  const part = jurisdiction ? `${jurisdiction}.` : '';
  return `https://${process.env.R2_ACCOUNT_ID}.${part}r2.cloudflarestorage.com`;
}
```

- [ ] **Step 3: Key format, server-generated end to end**

```ts
/** `science/<templateId>/<workId>/<cuid>.<ext>` — keyed by the WORK, because
 *  the file belongs to the article rather than to one author. EVERY segment is
 *  server-generated; nothing the user typed reaches the key. */
```

- [ ] **Step 4: Assert the env at boot, but only when it is needed**

Follow whatever `lib/env.ts` already does (`grep -rn "R2_\|assertEnv\|process.env" lib/env.ts`). The R2 keys must be **optional at boot** and asserted at first use, so a developer with no R2 credentials can still run the rest of the app — the spec says this explicitly.

- [ ] **Step 5: Commit** — report to the owner.

---

### Task 13: what the machine can check about a file

**Files:**

- Create: `lib/science/file-checks.ts`
- Test: `lib/science/file-checks.test.ts`

**Interfaces:**

- Produces:

```ts
export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export function sniffType(bytes: Uint8Array): (typeof ALLOWED_FILE_TYPES)[number] | null;
export function sha256Hex(bytes: Uint8Array): string;
export async function pdfPageCount(bytes: Uint8Array): Promise<number | null>;
export function fileProblem(input: { declaredType: string; sizeBytes: number }): string | null;
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { sha256Hex, sniffType, fileProblem, MAX_FILE_BYTES } from './file-checks';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

describe('sniffType', () => {
  it('reads the bytes, not the name', () => {
    expect(sniffType(PDF)).toBe('application/pdf');
    expect(sniffType(PNG)).toBe('image/png');
    expect(sniffType(JPEG)).toBe('image/jpeg');
  });

  it('is null for anything else — an .exe renamed to .pdf is not a PDF', () => {
    expect(sniffType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
    expect(sniffType(new Uint8Array([]))).toBeNull();
  });
});

describe('sha256Hex', () => {
  it('is the same for the same bytes and different for one changed byte', () => {
    expect(sha256Hex(PDF)).toBe(sha256Hex(new Uint8Array(PDF)));
    expect(sha256Hex(PDF)).not.toBe(sha256Hex(PNG));
  });

  it('is lowercase hex of the right length', () => {
    expect(sha256Hex(PDF)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('fileProblem', () => {
  it('refuses a type outside the list', () => {
    expect(fileProblem({ declaredType: 'application/zip', sizeBytes: 10 })).not.toBeNull();
  });

  it('refuses a file over the cap', () => {
    expect(
      fileProblem({ declaredType: 'application/pdf', sizeBytes: MAX_FILE_BYTES + 1 })
    ).not.toBeNull();
  });

  it('refuses an empty file', () => {
    expect(fileProblem({ declaredType: 'application/pdf', sizeBytes: 0 })).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/science/file-checks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write it**

`sha256Hex` uses `node:crypto`'s `createHash('sha256')`. `sniffType` checks the magic bytes above. `pdfPageCount` loads with `pdf-lib`'s `PDFDocument.load(bytes, { ignoreEncryption: true })` and returns `getPageCount()`, catching and returning `null` for anything it cannot read — an unreadable PDF is not a reason to refuse a record, only a reason not to check the page claim against it.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/science/file-checks.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit** — report to the owner.

---

### Task 14: upload, confirm, read, delete

**Files:**

- Create: `app/(dashboard)/science-plan/file-actions.ts`
- Test: `app/(dashboard)/science-plan/file-actions.test.ts`

**Interfaces:**

- Produces:

```ts
export async function presignUpload(input: {
  workId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}): Promise<{ ok: true; url: string; objectKey: string } | { error: string }>;

export async function confirmUpload(input: {
  workId: string;
  objectKey: string;
  fileName: string;
}): Promise<{ ok: true; fileId: string; pageCount: number | null } | { error: string }>;

export async function fileUrl(
  fileId: string
): Promise<{ ok: true; url: string } | { error: string }>;
export async function deleteFile(fileId: string): Promise<{ ok: true } | { error: string }>;
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('presignUpload', () => {
  it('refuses a hash that already exists ANYWHERE (D28) — before spending the upload', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({ id: 'f-existing' });
    const result = await presignUpload({ ...base, sha256: 'a'.repeat(64) });
    expect(result).toEqual({ error: 'Цей файл уже використано в іншому записі' });
  });

  it('names nothing about the other record — it may be on another кафедра', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      id: 'f-existing',
      uploadedBy: { lastName: 'Іваненко' },
    });
    const result = await presignUpload({ ...base, sha256: 'a'.repeat(64) });
    expect(JSON.stringify(result)).not.toContain('Іваненко');
  });

  it('refuses a type outside the list and a file over the cap', async () => {
    expect(await presignUpload({ ...base, contentType: 'application/zip' })).toMatchObject({
      error: expect.any(String),
    });
    expect(await presignUpload({ ...base, sizeBytes: 11 * 1024 * 1024 })).toMatchObject({
      error: expect.any(String),
    });
  });

  it('refuses a work the caller has no record on', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ id: 'w1', records: [] });
    expect(await presignUpload(base)).toEqual({ error: 'Роботу не знайдено' });
  });
});

describe('confirmUpload', () => {
  it('trusts the STORED bytes, not the browser', async () => {
    // The browser said PDF; the object is something else.
    mockGetObjectBytes.mockResolvedValue(new Uint8Array([0x4d, 0x5a]));
    const result = await confirmUpload(base);
    expect(result).toMatchObject({ error: expect.stringContaining('файл') });
    expect(db.scienceRecordFile.create).not.toHaveBeenCalled();
    expect(mockDeleteObject).toHaveBeenCalled(); // the bad object does not linger
  });

  it('re-hashes server-side and refuses a duplicate the browser lied about', async () => {
    mockGetObjectBytes.mockResolvedValue(PDF_BYTES);
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({ id: 'f-existing' });
    expect(await confirmUpload(base)).toMatchObject({ error: expect.any(String) });
  });

  it('counts the pages of a PDF and stores them', async () => {
    mockGetObjectBytes.mockResolvedValue(REAL_PDF_BYTES);
    (db.scienceRecordFile.create as Mock).mockResolvedValue({ id: 'f1' });
    const result = await confirmUpload(base);
    expect(result).toMatchObject({ ok: true, pageCount: 3 });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run "app/(dashboard)/science-plan/file-actions.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `presignUpload`**

Session, then: the work exists on the OPEN template, the caller has a record on it (or created it), `fileProblem` passes, and **`sha256` is not already in `ScienceRecordFile`**. The message says the file is already used and **names nothing else** — the other record may belong to somebody on another кафедра, and a refusal is not a place to leak that (D28). Then generate the key and presign a PUT with a short expiry (300s).

- [ ] **Step 4: Write `confirmUpload`**

`HEAD` the object; refuse and delete if the size disagrees with what was declared. Download it once with `getObjectBytes`, then in order: `sniffType` → must be in the list and must match the declared type; `sha256Hex` → the authority, re-checked against the table; `pdfPageCount` for a PDF. Write `ScienceRecordFile`. **Delete the object on every refusal** — an object nobody can reference is pure cost.

Map `P2002` on `sha256` to the same «вже використано» message: two uploads of the same bytes can race past the pre-check, and the unique index is what actually decides.

- [ ] **Step 5: Write `fileUrl` and `deleteFile`**

`fileUrl` issues a **short-lived signed GET (300s)** and only to somebody entitled: the file's work has a record of theirs, or they are ADMIN, or they are ННВ. No object is ever public.

`deleteFile` removes the row and the object; a failed object delete is `logWarning`, never a blocked user — «an orphan object costs storage, a blocked delete costs somebody their afternoon».

- [ ] **Step 6: Run the tests**

Run: `npx vitest run "app/(dashboard)/science-plan/file-actions.test.ts"`
Expected: PASS.

- [ ] **Step 7: Commit** — report to the owner.

---

### Task 15: the file control

**Files:**

- Create: `components/science/evidence-file-field.tsx`
- Modify: `components/science/add-record-dialog.tsx`
- Modify: `components/science/record-list.tsx`

**Interfaces:**

- Consumes: `presignUpload`, `confirmUpload`, `deleteFile`, `fileUrl`.

- [ ] **Step 1: Hash in the browser first**

```ts
/** The same SHA-256 the server will compute, done before the upload so a
 *  duplicate costs a round trip instead of 5 MB. `crypto.subtle` is available
 *  on every browser this app supports, and only over HTTPS or localhost — which
 *  is every environment this runs in. */
async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
```

**The browser's hash is a convenience, never the rule.** `confirmUpload` re-hashes the stored object and that one decides.

- [ ] **Step 2: The three-step flow, with the state the person sees**

`presignUpload` → `fetch(url, { method: 'PUT', body: file })` → `confirmUpload`. Show «Завантаження…» between, and on a refusal show the message under the control, inline — §«UI feedback conventions»: a field-level problem is never a toast.

- [ ] **Step 3: Use the existing file picker**

`components/aurora/ui/file-input.tsx` already exists. Do not write a second one.

- [ ] **Step 4: Show attached files in the record list**

File name, size, and a «Переглянути» button that calls `fileUrl` and opens the signed URL in a new tab. A PDF also shows its page count, because item 4 pays per page and that is the number a reviewer compares.

- [ ] **Step 5: Ask the owner to test it**

You cannot run the dev server. Give them this list:

1. Attach a PDF → it appears, with its page count.
2. Attach the **same file renamed** → refused, «Цей файл уже використано в іншому записі».
3. Attach a `.zip` renamed to `.pdf` → refused after upload, and the object does not stay in the bucket.
4. Open «Переглянути» → the file opens; copy that URL, wait six minutes, open it again → it is dead.

- [ ] **Step 6: Commit** — report to the owner.

---

## Phase F — the post-check

### Task 16: ННВ declines a record (D20)

**Files:**

- Create: `app/(dashboard)/moderation/science-actions.ts`
- Test: `app/(dashboard)/moderation/science-actions.test.ts`
- Create: `lib/queries/list-science-records.ts`
- Create: `components/science/moderation/record-feed.tsx`
- Modify: `app/(dashboard)/moderation/page.tsx`

**Interfaces:**

- Produces:

```ts
export async function removeScienceRecord(
  recordId: string,
  reason: string
): Promise<{ ok: true } | { error: string }>;
export async function restoreScienceRecord(
  recordId: string
): Promise<{ ok: true } | { error: string }>;
```

- [ ] **Step 1: Read the screen you are copying**

Run: `sed -n '18,105p' "app/(dashboard)/moderation/actions.ts"`

`removeActivity` is exactly this shape: a required reason, trimmed, capped at 500 characters, a soft status change, an audit entry. Follow it — including the guard `canModerateRating(session.user)`.

**One deliberate difference, and write the comment:** the science post-check belongs to **ННВ by наказ**, resolved by `registryKey`, the same way `/science-plans` resolves it — not to whoever holds the rating's moderation flag. Reuse the helper `/science-plans/page.tsx` already has rather than a third copy of the lookup; if it is still inline there, lift it into `lib/science/oversight.ts` and repoint that page in the same commit (§11).

- [ ] **Step 2: Write the failing tests**

```ts
it('refuses an editor who is not ННВ', async () => {
  expect(await removeScienceRecord('r1', 'Немає підтвердження')).toEqual({
    error: 'Недостатньо прав',
  });
});

it('demands a reason', async () => {
  expect(await removeScienceRecord('r1', '   ')).toEqual({ error: 'Вкажіть причину відхилення' });
});

it('sets REMOVED and keeps the row — the person has to be able to read why', async () => {
  await removeScienceRecord('r1', 'Посилання веде на іншу статтю');
  const data = (db.scienceRecord.update as Mock).mock.calls[0][0].data;
  expect(data.status).toBe('REMOVED');
  expect(data.removedReason).toBe('Посилання веде на іншу статтю');
  expect(db.scienceRecord.delete).not.toHaveBeenCalled();
});

it('frees the hours back into the pool', async () => {
  // A REMOVED draw must stop counting against the work's total, or a
  // co-author can never take the hours it was holding.
  await removeScienceRecord('r1', 'Дублікат');
  // covered by the query filter: every pool read is `status: 'APPROVED'`
  expect(true).toBe(true);
});

it('restores a record, clearing the reason', async () => {
  await restoreScienceRecord('r1');
  const data = (db.scienceRecord.update as Mock).mock.calls[0][0].data;
  expect(data).toMatchObject({ status: 'APPROVED', removedReason: null, removedAt: null });
});
```

The fourth test is a reminder, not a real assertion — replace it with a genuine one against `getSciencePlan` if the pool read is not already filtered. **Check that every `hoursHundredths` sum in the codebase filters on `status: 'APPROVED'`:**

Run: `grep -rn "hoursHundredths" lib/ app/ --include=*.ts | grep -v test`

Every aggregate must carry the filter. One that does not is a hole: a declined record would keep holding hours a co-author cannot take.

- [ ] **Step 3: Run them and watch them fail, then write the actions**

Run: `npx vitest run "app/(dashboard)/moderation/science-actions.test.ts"`

- [ ] **Step 4: The feed**

`list-science-records.ts` returns the newest records across the university — ПІБ, кафедра, вид роботи, hours, evidence summary, link, file count, and **whether the work's files are shared with another record**, which is the D28 flag ННВ acts on. Page it at 50, the same `PLAN_PAGE_SIZE` the other lists use.

`/moderation` gains a «Наукова робота» section beside the rating's. Follow the existing page's own structure — read it first.

- [ ] **Step 5: Show the person their own refusal**

A REMOVED record already renders greyed with its reason in `record-list.tsx` (Task 10, Step 5). Confirm that still works now that something can actually set the status.

- [ ] **Step 6: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npx eslint . && npx next build`
Expected: all clean.

- [ ] **Step 7: Commit** — report to the owner.

---

## Closing out

- [ ] **Update `CLAUDE.md`.** The «Планування наукової роботи (Stage 1 built)» section says Stage 2 and 3 are not built. Rewrite it: what a record is, that the pool is a transaction, that `dedupKey` and `@@unique([staffId, workId])` are the reuse rule, that a file's SHA-256 is unique university-wide, and that D27 is «at least one of link or file». Keep it the same length — that file is read every session.
- [ ] **Update `docs/work-remaining.md`.**
- [ ] **Backup.** `docker-compose.yml` backs up Postgres only. R2 is now a second thing to back up and **nothing covers it**. Turn on bucket versioning at minimum, and add it to `docs/deployment.md` — the restore drill in §7 has still never been run.
- [ ] **Tell the owner what is still unbuilt:** the official export document (D19, the blank has never been supplied) and the Crossref DOI check.

## Self-review notes

Checked against the spec, 2026-09-17:

- **Covered:** D10, D13–D17, D20–D22, D24–D29; the reuse indexes; the pool transaction; joining; correcting a work; every «what the app refuses» bullet in «Validation and anti-cheat»; the file flow's four steps; the key format; the type and size caps.
- **Deliberately not covered:** D19 (export — no blank exists), the Crossref check (listed «optional, later»), and `ScienceWorkType.identityFields` editing in the admin UI, which Stage 1 already ships.
- **One thing this plan decides that the spec does not:** what happens when a person edits a record ННВ has declined. The plan keeps the row REMOVED and does not revive it silently — the person may delete it and record the work again, which produces a fresh row ННВ sees in the feed. A silent revival would let somebody undo a review by touching a field. Flag this to the owner; it is a five-line change either way.
