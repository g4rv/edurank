# Реєстр здобувачів — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the admitted-student register out of a committed JSON file into a database table, and give ADMIN a page at `/admin/students` to search it, add one student and remove one.

**Architecture:** A new `AdmittedStudent` model keyed by `year`, with a foreign key to `Speciality`. `lib/students/accepted.ts` keeps its pure shaping and stops importing the JSON; every read moves to `lib/queries/list-admitted-students.ts`. The existing 1046 rows arrive through a one-off `pnpm db:import-students` script that reads the still-committed JSON, so production can be filled without `edu-reference/`.

**Tech Stack:** Next.js 16 App Router (React 19, Server Components), Prisma 7 + PostgreSQL 16, Zod, Tailwind v4, shadcn/ui, Vitest.

**Spec:** [`docs/students-register.md`](../../students-register.md) — read it before Task 1. Every "why" lives there; this plan is the "how".

## Global Constraints

- **All UI text in Ukrainian.** No hardcoded Ukrainian strings in logic files — only in components and label maps.
- **Prisma 7:** client is imported from `@/lib/generated/prisma/client`. Run `pnpm db:generate` after any schema change, then **restart `pnpm dev`** — the running dev server holds the old client.
- **The user starts and stops `pnpm dev` and Docker themselves.** Do not launch them.
- **Role checks server-side**, in every page and every action — never only in a component.
- **Tests are colocated** next to the file they cover, `.test.ts(x)`.
- **`@/lib/db` is mocked in every test** (`vi.mock('@/lib/db', …)`). The suite never opens a connection; `vitest.config.ts` supplies a dummy `DATABASE_URL` only because `lib/db.ts` builds the client at import time.
- **Commit with the `/commit` skill.** Format `<type>(<scope>): <description>`, imperative, ≤72 chars on the first line. **No AI attribution or co-author lines — ever.** Scope for this work: `students`.
- **Errors:** write failures go through `parseDbError(e, '<Ukrainian sentence>', '<scope>.<action>', { userId })`. Never show a code, digest or id to a user.
- **Feedback placement:** field problems inline; destructive confirmations in an `AlertDialog`; only transient outcomes in a toast.
- Run `pnpm type-check` and `pnpm test` before every commit. The pre-commit hook runs prettier and `tsc --noEmit` and will reject a broken commit.

---

### Task 1: The `AdmittedStudent` model

**Files:**

- Modify: `prisma/schema.prisma` — add the model, and one relation field on `Speciality` (currently `prisma/schema.prisma:622-633`)
- Create: `prisma/migrations/<timestamp>_add_admitted_student/migration.sql` (generated)

**Interfaces:**

- Consumes: nothing.
- Produces: the Prisma model `AdmittedStudent` with fields `id: string`, `year: number`, `name: string`, `nameNormalised: string`, `specialityId: string`, `degree: StudentDegree`, `form: StudyForm`, `funding: StudentFunding`, `createdAt: Date`, `updatedAt: Date`. Every later task depends on these exact names.

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

Place it directly **after** the `SpecialityDepartment` model (which ends at line 686) and **before** the `StudentClaim` comment block that begins at line 688, so the three speciality-related models stay together.

```prisma
// Реєстр зарахованих — who an НПП is allowed to claim.
//
// A row is an ADMISSION, not a person. 1046 rows of the 2026 intake carry 1026
// distinct ПІБ: twenty people were admitted onto two programmes at once (Немеш
// Вікторія Іванівна is on Фінанси and on Середня освіта (історія)), and those
// are two different students to every claim, норматив and bonus.
//
// This was `lib/students/accepted-2026.json` until 2026-09-03 — a committed
// file, deliberately "reference data, not a table". Admins can now add and
// remove students on /admin/students, and a container cannot write to its own
// bundle. The JSON stays in git as import input only; see docs/students-register.md.
model AdmittedStudent {
  id String @id @default(cuid())

  /// Вступна кампанія. A year owns its intake, the way a RatingTemplate owns
  /// its indicators — so last year's students are never cleared to make room.
  year Int

  /// ПІБ as the наказ spells it
  name String
  /// normaliseStudentName() from lib/stake/claims.ts — the SAME normaliser
  /// StudentClaim uses, so the delete guard can match the two. Stored rather
  /// than computed so search and that guard can use an index.
  nameNormalised String

  specialityId String
  speciality   Speciality @relation(fields: [specialityId], references: [id])

  degree  StudentDegree
  form    StudyForm
  funding StudentFunding

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  /// What an import skips as «вже в списку», and what a claim is looked up by.
  /// Degree is NOT in the key: it follows from the programme, and a person on
  /// one programme twice under two ступені is not a case that exists.
  @@unique([year, nameNormalised, specialityId, form, funding])
  /// The picker's query — everyone on one programme, one combination
  @@index([year, specialityId, form, funding])
}
```

- [ ] **Step 2: Add the relation field on `Speciality`**

In the `Speciality` model (`prisma/schema.prisma:622`), beside the existing `norms`, `claims` and `departments`:

```prisma
  norms       SpecialityNorm[]
  claims      StudentClaim[]
  departments SpecialityDepartment[]
  admittedStudents AdmittedStudent[]
```

- [ ] **Step 3: Create the migration**

Run: `pnpm db:migrate --name add_admitted_student`
Expected: a new folder under `prisma/migrations/`, and `Applying migration` in the output.

- [ ] **Step 4: Regenerate the client**

Run: `pnpm db:generate`
Expected: `Generated Prisma Client`.

Then **ask the user to restart `pnpm dev`** — the running server holds the previous client and will report that `db.admittedStudent` is undefined until it is restarted.

- [ ] **Step 5: Verify the client knows the model**

Run: `pnpm type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit   # via the /commit skill
```

Message:

```
db(students): add AdmittedStudent, the register as a table

Keyed by вступна кампанія, with a foreign key to Speciality rather than
the name string the JSON carries — the name is editable on screen, and
SpecialityDepartment was converted from a name-matched constant for
exactly that reason.

The unique key is the four things a claim is looked up by plus the year.
Ступінь is out of it: it follows from the programme.
```

---

### Task 2: Ukrainian labels for the three student enums

The maps `DEGREE` / `FORM` / `FUNDING` are copy-pasted in two components today (`components/stake/claims-review.tsx:14-16` and `components/stake/my-claims.tsx:33-35`). The new page needs a third copy. Per CLAUDE.md, enum label maps belong in `lib/labels.ts`.

**Files:**

- Modify: `lib/labels.ts` — add three exported maps
- Modify: `components/stake/claims-review.tsx:14-16` — delete the local maps, import instead
- Modify: `components/stake/my-claims.tsx:33-35` — same
- Test: `lib/labels.test.ts` (create if absent; append if present)

**Interfaces:**

- Consumes: `StudentDegree`, `StudyForm`, `StudentFunding` from `@/lib/generated/prisma/client`.
- Produces: `STUDENT_DEGREE_LABELS`, `STUDY_FORM_LABELS`, `STUDENT_FUNDING_LABELS` — each `Record<Enum, string>`.

- [ ] **Step 1: Write the failing test**

Create or append to `lib/labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STUDENT_DEGREE_LABELS, STUDENT_FUNDING_LABELS, STUDY_FORM_LABELS } from './labels';

// A Record<Enum, string> already fails to compile if a member is missing, so
// these guard the thing types cannot: that the WORDS are the ones already on
// screen. /admin/students, /my-department/students and /achievements/students
// must not drift into three vocabularies for one enum.
describe('student enum labels', () => {
  it('spells the ступінь the way the claim screens already do', () => {
    expect(STUDENT_DEGREE_LABELS).toEqual({ BACHELOR: 'Бакалавр', MASTER: 'Магістр' });
  });

  it('spells the форма the way the claim screens already do', () => {
    expect(STUDY_FORM_LABELS).toEqual({ FULL_TIME: 'Денна', PART_TIME: 'Заочна' });
  });

  it('spells the фінансування the way the claim screens already do', () => {
    expect(STUDENT_FUNDING_LABELS).toEqual({ STATE: 'Бюджет', CONTRACT: 'Контракт' });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test lib/labels.test.ts`
Expected: FAIL — `STUDENT_DEGREE_LABELS` is not exported.

- [ ] **Step 3: Add the maps to `lib/labels.ts`**

Beside the existing `SCIENTIFIC_DEGREE_LABELS` (line 21):

```ts
/**
 * The three student enums, in the words the claim screens have used since
 * August. Lifted out of components/stake/{claims-review,my-claims}.tsx, which
 * each carried their own copy — /admin/students would have made a third.
 */
export const STUDENT_DEGREE_LABELS: Record<StudentDegree, string> = {
  BACHELOR: 'Бакалавр',
  MASTER: 'Магістр',
};

export const STUDY_FORM_LABELS: Record<StudyForm, string> = {
  FULL_TIME: 'Денна',
  PART_TIME: 'Заочна',
};

export const STUDENT_FUNDING_LABELS: Record<StudentFunding, string> = {
  STATE: 'Бюджет',
  CONTRACT: 'Контракт',
};
```

Add `StudentDegree`, `StudyForm`, `StudentFunding` to the existing type import from `@/lib/generated/prisma/client` at the top of the file.

- [ ] **Step 4: Run the test**

Run: `pnpm test lib/labels.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace both copies**

In `components/stake/claims-review.tsx`, delete lines 14-16 and add to the imports:

```ts
import {
  STUDENT_DEGREE_LABELS as DEGREE,
  STUDENT_FUNDING_LABELS as FUNDING,
  STUDY_FORM_LABELS as FORM,
} from '@/lib/labels';
```

Do exactly the same in `components/stake/my-claims.tsx` (delete lines 33-35). Aliasing on import keeps every use site in both files unchanged.

- [ ] **Step 6: Verify nothing else defined them**

Run: `pnpm exec grep -rn "BACHELOR: 'Бакалавр'" components/ app/ lib/`
Expected: one hit only — `lib/labels.ts`.

- [ ] **Step 7: Type-check and test**

Run: `pnpm type-check && pnpm test`
Expected: both clean.

- [ ] **Step 8: Commit**

```
refactor(students): move the three student enum labels into labels.ts

claims-review and my-claims each carried their own copy of Бакалавр /
Денна / Бюджет, and /admin/students would have made a third. The test
pins the words, which is the part a Record<Enum, string> cannot.
```

---

### Task 3: `lib/students/accepted.ts` stops reading the JSON

The shaping stays; the data comes in as an argument. The test file keeps importing the JSON, so every existing assertion about the real 2026 data survives — it just feeds it in by hand.

**Files:**

- Modify: `lib/students/accepted.ts` — whole file
- Modify: `lib/students/accepted.test.ts` — whole file
- Modify: `app/(dashboard)/achievements/students/page.tsx:49` (temporarily, to keep the build green — see Step 6)

**Interfaces:**

- Consumes: `normaliseStudentName` from `@/lib/stake/claims`.
- Produces:
  - `interface RegisterRow { name: string; speciality: string; degree: StudentDegree; form: StudyForm; funding: Funding }`
  - `registerOptions(students: readonly RegisterRow[], ownerNames: ReadonlyMap<string, readonly string[]>): RegisterSpeciality[]`
  - unchanged and still exported: `RegisterCriteria`, `RegisterSpeciality`, `RegisterBranch`, `RegisterVariant`
  - **removed:** `ACCEPTED_STUDENTS`, `AcceptedStudent`, `REGISTER_YEAR`, `studentsMatching`, `findAcceptedStudent`, `normaliseName`

- [ ] **Step 1: Rewrite the test file's data source**

At the top of `lib/students/accepted.test.ts`, replace the import block:

```ts
import { describe, expect, it } from 'vitest';
import { SPECIALITY_CODES } from '@/lib/specialities/codes';
import { SPECIALITY_NORMS_2026 } from '@/lib/stake/norms';
import accepted2026 from './accepted-2026.json';
import { registerOptions, type RegisterCriteria, type RegisterRow } from './accepted';

// The JSON is no longer what the app reads — `pnpm db:import-students` loads it
// into AdmittedStudent and the app queries that. It is still the best fixture
// there is: 1046 real rows with every шаблон the shaping has to survive, so
// these tests keep feeding it in by hand rather than inventing a fake register.

const ACCEPTED_STUDENTS = accepted2026 as RegisterRow[];
const NORM_NAMES = new Set(SPECIALITY_NORMS_2026.map(([name]) => name));

/** What lib/queries/list-admitted-students.ts now does in SQL */
function studentsMatching(criteria: RegisterCriteria): RegisterRow[] {
  return ACCEPTED_STUDENTS.filter(
    (s) =>
      s.speciality === criteria.speciality &&
      s.form === criteria.form &&
      s.funding === criteria.funding
  );
}
```

- [ ] **Step 2: Delete the tests that no longer belong here, and fix the rest**

Delete these three `it(...)` blocks from the `describe('the 2026 register')` group — they check the shape of the JSON as a data file, and Task 5 re-homes them onto the import script, which is where that data is now validated:

- `'holds every admitted student'`
- `'carries no birth date, contact or document number'`
- `'spells every факультет the way the database does'`

Also delete the now-unused `import { FACULTIES } from '@/prisma/preprod-org'` and the `FACULTY_NAMES` constant.

Keep `'names one person once per programme'`, `'names a speciality the codes list knows'` and `'names a speciality that has a норматив'` for now — Task 5 moves them.

In `describe('registerOptions')`, change the first line to pass the rows:

```ts
const options = registerOptions(ACCEPTED_STUDENTS, new Map());
```

In the test `'gathers «Психологія» from both its факультети into one list'`, the last assertion reads `expect(new Set(students.map((s) => s.faculty)).size).toBe(2)`. `faculty` is gone from `RegisterRow`. Replace that assertion with the fact it was standing in for — that one speciality gathers everyone, whichever факультет teaches them:

```ts
expect(students).toHaveLength(97);
```

and rename the test to `'gathers «Психологія» into one list, whichever факультет teaches it'`.

Delete the whole `describe('findAcceptedStudent')` block — that function is now a database query and is tested in Task 4.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `pnpm test lib/students/accepted.test.ts`
Expected: FAIL — `registerOptions` takes one argument, and `RegisterRow` is not exported.

- [ ] **Step 4: Rewrite `lib/students/accepted.ts`**

Replace the file header comment (lines 1-26, the "Reference data, not a table" block) with:

```ts
import {
  baseCode,
  SPECIALITY_CODES,
  specialityCodeSortKey,
  subjectOf,
} from '@/lib/specialities/codes';
import type { Funding, StudentDegree, StudyForm } from '@/lib/stake/norms';

// Shaping the register for the claim picker. NO DATA and NO DATABASE.
//
// It read `accepted-2026.json` until 2026-09-03 and described itself as
// "reference data, not a table". It is a table now — see
// docs/students-register.md — and every read lives in
// lib/queries/list-admitted-students.ts. What is left here is the part that was
// always pure: turning a flat list of admissions into the cascade the picker
// walks. Rows come in as an argument, which is also why the tests can still
// feed it the real 1046 out of the JSON.

/** One admission, as everything here needs it. The `id` is nobody's business. */
export interface RegisterRow {
  /** ПІБ as the наказ spells it */
  name: string;
  /** Speciality name as `SPECIALITY_NORMS_2026` spells it */
  speciality: string;
  degree: StudentDegree;
  form: StudyForm;
  funding: Funding;
}
```

Then:

- delete `import accepted2026 from './accepted-2026.json'`, `AcceptedStudent`, `REGISTER_YEAR` and `ACCEPTED_STUDENTS`;
- change the signature to `export function registerOptions(students: readonly RegisterRow[], ownerNames: ReadonlyMap<string, readonly string[]>): RegisterSpeciality[]` and change the loop's first line to `for (const student of students) {`;
- delete `matches`, `studentsMatching`, `findAcceptedStudent` and `normaliseName` (the last four exports at the bottom of the file);
- leave `RegisterCriteria` exactly where it is, comment included — the query layer still takes it.

- [ ] **Step 5: Run the tests**

Run: `pnpm test lib/students/accepted.test.ts`
Expected: PASS.

- [ ] **Step 6: Keep the build compiling**

`app/(dashboard)/achievements/students/page.tsx:49` still calls `registerOptions(await getSpecialityOwnerNames())`. Task 6 rewires it properly. For now, so this task ends on a green `type-check`, change that one line to:

```ts
const register = registerOptions([], await getSpecialityOwnerNames());
```

and add a comment directly above it:

```ts
// TEMPORARY, until Task 6 of docs/superpowers/plans/2026-09-03-students-register.md:
// the register moved to the database and this page has not been rewired yet.
// An empty picker is visible and wrong — do NOT ship a release on this commit.
```

- [ ] **Step 7: Type-check and run the whole suite**

Run: `pnpm type-check && pnpm test`
Expected: both clean.

- [ ] **Step 8: Commit**

```
refactor(students): make the register shaping take its rows

registerOptions built the picker's cascade out of a module-level array
imported from JSON. It now takes the rows, which is what lets the data
live in the database and still lets the tests feed it the real 1046.

studentsMatching and findAcceptedStudent are gone from here; they become
queries in the next commit. normaliseName goes with them — there is one
normaliser now, the one StudentClaim already writes with.

/achievements/students is left passing an empty list and is rewired two
commits from here. Do not cut a release on this commit.
```

---

### Task 4: `lib/queries/list-admitted-students.ts`

**Files:**

- Create: `lib/queries/list-admitted-students.ts`
- Test: `lib/queries/list-admitted-students.test.ts`

**Interfaces:**

- Consumes: `RegisterCriteria`, `RegisterRow` from `@/lib/students/accepted`; `normaliseStudentName` from `@/lib/stake/claims`; `db` from `@/lib/db`.
- Produces:
  - `ADMITTED_PAGE_SIZE = 30`
  - `interface AdmittedStudentRow { id: string; name: string; speciality: string; degree: StudentDegree; form: StudyForm; funding: Funding }`
  - `registerRows(year: number): Promise<RegisterRow[]>`
  - `studentsMatching(year: number, criteria: RegisterCriteria): Promise<string[]>`
  - `findAcceptedStudent(year: number, name: string, criteria: RegisterCriteria): Promise<AdmittedStudentRow | null>`
  - `admittedYears(): Promise<number[]>`
  - `interface AdmittedFilters { year: number; degree?: StudentDegree; form?: StudyForm; funding?: Funding; specialityId?: string; search?: string; page: number }`
  - `interface AdmittedPage { rows: AdmittedStudentRow[]; total: number; totalPages: number }`
  - `listAdmittedStudents(filters: AdmittedFilters): Promise<AdmittedPage>`

- [ ] **Step 1: Write the failing test**

Create `lib/queries/list-admitted-students.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    admittedStudent: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { db } from '@/lib/db';
import {
  ADMITTED_PAGE_SIZE,
  admittedYears,
  findAcceptedStudent,
  listAdmittedStudents,
  studentsMatching,
} from './list-admitted-students';

const findMany = db.admittedStudent.findMany as unknown as Mock;
const findFirst = db.admittedStudent.findFirst as unknown as Mock;
const count = db.admittedStudent.count as unknown as Mock;

/** What Prisma hands back for a row with its speciality joined in */
function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'c1',
    name: 'Ковальчук Олена Ігорівна',
    degree: 'BACHELOR',
    form: 'FULL_TIME',
    funding: 'STATE',
    speciality: { name: 'Психологія' },
    ...over,
  };
}

beforeEach(() => {
  findMany.mockReset();
  findFirst.mockReset();
  count.mockReset();
});

describe('studentsMatching', () => {
  it('asks for one year, one programme, one combination — and returns ПІБ only', async () => {
    findMany.mockResolvedValue([{ name: 'Б' }, { name: 'А' }]);

    const names = await studentsMatching(2026, {
      speciality: 'Психологія',
      form: 'FULL_TIME',
      funding: 'STATE',
    });

    expect(names).toEqual(['Б', 'А']);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          year: 2026,
          form: 'FULL_TIME',
          funding: 'STATE',
          speciality: { name: 'Психологія' },
        },
      })
    );
  });
});

describe('findAcceptedStudent', () => {
  const criteria = {
    speciality: 'Психологія',
    form: 'FULL_TIME',
    funding: 'STATE',
  } as const;

  it('looks the ПІБ up normalised, not as typed', async () => {
    findFirst.mockResolvedValue(row());

    await findAcceptedStudent(2026, '  КОВАЛЬЧУК   Олена Ігорівна ', criteria);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          year: 2026,
          nameNormalised: 'ковальчук олена ігорівна',
        }),
      })
    );
  });

  // The apostrophe is why both sides must use normaliseStudentName: a наказ
  // types О’лена with U+2019 and a person types О'лена with an ASCII quote.
  it('folds the apostrophe the claims normaliser folds', async () => {
    findFirst.mockResolvedValue(null);

    await findAcceptedStudent(2026, 'Мар’яна Іванівна Коваль', criteria);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ nameNormalised: "мар'яна іванівна коваль" }),
      })
    );
  });

  it('flattens the joined speciality onto the row', async () => {
    findFirst.mockResolvedValue(row());

    await expect(findAcceptedStudent(2026, 'Ковальчук Олена Ігорівна', criteria)).resolves.toEqual({
      id: 'c1',
      name: 'Ковальчук Олена Ігорівна',
      speciality: 'Психологія',
      degree: 'BACHELOR',
      form: 'FULL_TIME',
      funding: 'STATE',
    });
  });

  it('returns null when nothing matches', async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      findAcceptedStudent(2026, 'Вигаданий Ніхто Ніхтович', criteria)
    ).resolves.toBeNull();
  });
});

describe('listAdmittedStudents', () => {
  it('pages 30 at a time and reports the total', async () => {
    count.mockResolvedValue(61);
    findMany.mockResolvedValue([row()]);

    const page = await listAdmittedStudents({ year: 2026, page: 3 });

    expect(ADMITTED_PAGE_SIZE).toBe(30);
    expect(page.total).toBe(61);
    expect(page.totalPages).toBe(3);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 60, take: 30 }));
  });

  it('leaves an absent filter out of the where clause entirely', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await listAdmittedStudents({ year: 2026, page: 1 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { year: 2026 } }));
  });

  it('applies every filter it is given', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await listAdmittedStudents({
      year: 2026,
      degree: 'MASTER',
      form: 'PART_TIME',
      funding: 'CONTRACT',
      specialityId: 'sp1',
      page: 1,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          year: 2026,
          degree: 'MASTER',
          form: 'PART_TIME',
          funding: 'CONTRACT',
          specialityId: 'sp1',
        },
      })
    );
  });

  // «петренко  о» must find «Петренко О.І.» — the person searching types what
  // they remember, not what the наказ spells.
  it('searches the normalised column, with the query normalised too', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await listAdmittedStudents({ year: 2026, search: '  ПЕТРЕНКО   О ', page: 1 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { year: 2026, nameNormalised: { contains: 'петренко о' } },
      })
    );
  });

  it('ignores a search that is only whitespace', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await listAdmittedStudents({ year: 2026, search: '   ', page: 1 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { year: 2026 } }));
  });

  it('never asks for a page below the first', async () => {
    count.mockResolvedValue(10);
    findMany.mockResolvedValue([]);

    await listAdmittedStudents({ year: 2026, page: 0 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }));
  });

  it('reports one page when the year is empty, so the pager stays hidden', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    const page = await listAdmittedStudents({ year: 2026, page: 1 });
    expect(page.totalPages).toBe(1);
  });
});

describe('admittedYears', () => {
  it('lists the years that have rows, newest first', async () => {
    findMany.mockResolvedValue([{ year: 2027 }, { year: 2026 }]);
    await expect(admittedYears()).resolves.toEqual([2027, 2026]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test lib/queries/list-admitted-students.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write `lib/queries/list-admitted-students.ts`**

```ts
import { db } from '@/lib/db';
import { normaliseStudentName } from '@/lib/stake/claims';
import type { Funding, StudentDegree, StudyForm } from '@/lib/stake/norms';
import type { RegisterCriteria, RegisterRow } from '@/lib/students/accepted';

// Reading the реєстр зарахованих. Everything that used to be an array scan in
// lib/students/accepted.ts — see docs/students-register.md for why it moved.
//
// The year is never guessed here. Callers pass it: the claim flow passes the
// active template's year, and /admin/students passes whatever the URL says out
// of the years that actually have rows.

export const ADMITTED_PAGE_SIZE = 30;

/** One register row as every screen wants it — speciality flattened to its name */
export interface AdmittedStudentRow {
  id: string;
  name: string;
  speciality: string;
  degree: StudentDegree;
  form: StudyForm;
  funding: Funding;
}

const ROW_SELECT = {
  id: true,
  name: true,
  degree: true,
  form: true,
  funding: true,
  speciality: { select: { name: true } },
} as const;

type JoinedRow = {
  id: string;
  name: string;
  degree: StudentDegree;
  form: StudyForm;
  funding: Funding;
  speciality: { name: string };
};

function flatten(row: JoinedRow): AdmittedStudentRow {
  const { speciality, ...rest } = row;
  return { ...rest, speciality: speciality.name };
}

/**
 * A whole year's register, for `registerOptions` to build the picker's cascade.
 *
 * All of it, deliberately. The cascade is derived from which combinations have
 * a student behind them, so it cannot be built from a page — and the shape that
 * reaches the browser is a few KB of speciality names, not the names of a
 * thousand teenagers.
 */
export async function registerRows(year: number): Promise<RegisterRow[]> {
  const rows = await db.admittedStudent.findMany({
    where: { year },
    select: {
      name: true,
      degree: true,
      form: true,
      funding: true,
      speciality: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    name: row.name,
    speciality: row.speciality.name,
    degree: row.degree,
    form: row.form,
    funding: row.funding,
  }));
}

/**
 * The ПІБ admitted under one combination, in Ukrainian alphabetical order.
 *
 * Names only: this feeds the picker's last step, and the four criteria that got
 * here are already known to whoever asked.
 */
export async function studentsMatching(
  year: number,
  criteria: RegisterCriteria
): Promise<string[]> {
  const rows = await db.admittedStudent.findMany({
    where: {
      year,
      form: criteria.form,
      funding: criteria.funding,
      speciality: { name: criteria.speciality },
    },
    select: { name: true },
    orderBy: { name: 'asc' },
  });
  return rows.map((row) => row.name);
}

/**
 * The one register row a claim names, or null.
 *
 * ПІБ is the key WITH the criteria, never on its own: twenty people of the 2026
 * intake are on two programmes at once, so one ПІБ can name two register rows
 * and two different claims. The five together are unique — the model's
 * @@unique says so.
 *
 * The name is matched on `nameNormalised`, which is written by the SAME
 * normaliser StudentClaim uses. Anything else and «О’лена» typed with U+2019
 * and «О'лена» typed with an apostrophe are two people.
 */
export async function findAcceptedStudent(
  year: number,
  name: string,
  criteria: RegisterCriteria
): Promise<AdmittedStudentRow | null> {
  const row = await db.admittedStudent.findFirst({
    where: {
      year,
      nameNormalised: normaliseStudentName(name),
      form: criteria.form,
      funding: criteria.funding,
      speciality: { name: criteria.speciality },
    },
    select: ROW_SELECT,
  });
  return row ? flatten(row) : null;
}

/** The вступні кампанії that have students, newest first */
export async function admittedYears(): Promise<number[]> {
  const rows = await db.admittedStudent.findMany({
    distinct: ['year'],
    select: { year: true },
    orderBy: { year: 'desc' },
  });
  return rows.map((row) => row.year);
}

export interface AdmittedFilters {
  year: number;
  degree?: StudentDegree;
  form?: StudyForm;
  funding?: Funding;
  specialityId?: string;
  /** Free text over the ПІБ; normalised before it is matched */
  search?: string;
  page: number;
}

export interface AdmittedPage {
  rows: AdmittedStudentRow[];
  total: number;
  /** At least 1, so an empty year renders a table rather than a pager saying «0» */
  totalPages: number;
}

/** One page of /admin/students, filtered and searched */
export async function listAdmittedStudents(filters: AdmittedFilters): Promise<AdmittedPage> {
  const search = normaliseStudentName(filters.search ?? '');

  const where = {
    year: filters.year,
    ...(filters.degree ? { degree: filters.degree } : {}),
    ...(filters.form ? { form: filters.form } : {}),
    ...(filters.funding ? { funding: filters.funding } : {}),
    ...(filters.specialityId ? { specialityId: filters.specialityId } : {}),
    ...(search ? { nameNormalised: { contains: search } } : {}),
  };

  const page = Math.max(1, filters.page);

  const [total, rows] = await Promise.all([
    db.admittedStudent.count({ where }),
    db.admittedStudent.findMany({
      where,
      select: ROW_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * ADMITTED_PAGE_SIZE,
      take: ADMITTED_PAGE_SIZE,
    }),
  ]);

  return {
    rows: rows.map(flatten),
    total,
    totalPages: Math.max(1, Math.ceil(total / ADMITTED_PAGE_SIZE)),
  };
}
```

Note on `orderBy: [{ name: 'asc' }, { id: 'asc' }]`: a second key is required. Twenty ПІБ repeat, and a page boundary that falls between two identical names would otherwise return one of them on both pages and the other on neither.

- [ ] **Step 4: Run the tests**

Run: `pnpm test lib/queries/list-admitted-students.test.ts`
Expected: PASS, all 14.

- [ ] **Step 5: Type-check**

Run: `pnpm type-check`
Expected: clean.

- [ ] **Step 6: Commit**

```
feat(students): read the register from the database

registerRows feeds the picker's cascade, studentsMatching its last step,
findAcceptedStudent the save. listAdmittedStudents is the admin page's
filtered page of 30.

The ПІБ is matched on nameNormalised through normaliseStudentName —
the same normaliser StudentClaim writes with, so «О’лена» with U+2019
and «О'лена» with an apostrophe are one person on both sides.

Paging orders by name AND id: twenty ПІБ repeat in the 2026 intake, and
a page boundary between two of them would drop one and repeat the other.
```

---

### Task 5: `pnpm db:import-students`

**Files:**

- Create: `prisma/import-students.ts`
- Test: `prisma/import-students.test.ts`
- Modify: `package.json` — one script line
- Modify: `lib/students/accepted.test.ts` — move the two data assertions out
- Modify: `CLAUDE.md` — the Commands block

**Interfaces:**

- Consumes: `accepted-2026.json`, `normaliseStudentName`, `SPECIALITY_CODES`, `SPECIALITY_NORMS_2026`.
- Produces: `interface SourceStudent { name: string; speciality: string; degree: StudentDegree; form: StudyForm; funding: Funding }` and `planImport(source: readonly SourceStudent[], specialityIds: ReadonlyMap<string, string>, existing: ReadonlySet<string>): ImportPlan` — the pure half, which is what the test drives. `ImportPlan` is `{ create: PlannedRow[]; skipped: SourceStudent[]; problems: string[] }`.

- [ ] **Step 1: Write the failing test**

Create `prisma/import-students.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SPECIALITY_CODES } from '@/lib/specialities/codes';
import { SPECIALITY_NORMS_2026 } from '@/lib/stake/norms';
import accepted2026 from '@/lib/students/accepted-2026.json';
import { importKey, planImport, type SourceStudent } from './import-students';

const SOURCE = accepted2026 as SourceStudent[];
const NORM_NAMES = new Set(SPECIALITY_NORMS_2026.map(([name]) => name));

// These three guarded the JSON while it WAS the register. It is import input
// now, so they guard the import instead — same failure modes, one step later:
// a speciality the norms table does not know is a student nobody can claim, and
// a repeated key is a claim that would resolve to either of two people.

describe('the 2026 source file', () => {
  it('holds every admitted student', () => {
    // 722 from the ЄДЕБО export + 324 from the контрактні накази
    expect(SOURCE).toHaveLength(1046);
  });

  it('carries no birth date, contact or document number', () => {
    for (const student of SOURCE) {
      expect(Object.keys(student).sort()).toEqual([
        'degree',
        'faculty',
        'form',
        'funding',
        'name',
        'speciality',
      ]);
      expect(student.name).not.toMatch(/\d/);
    }
  });

  it('names a speciality the codes list knows', () => {
    for (const student of SOURCE) {
      expect(SPECIALITY_CODES[student.speciality], student.speciality).toBeDefined();
    }
  });

  it('names a speciality that has a норматив', () => {
    const unpriced = new Set(
      SOURCE.map((s) => s.speciality).filter((name) => !NORM_NAMES.has(name))
    );
    expect([...unpriced]).toEqual([]);
  });

  it('names one person once per programme', () => {
    const keys = SOURCE.map((s) => importKey(2026, s));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

const IDS = new Map([
  ['Психологія', 'sp-psy'],
  ['Початкова освіта', 'sp-prim'],
]);

function student(over: Partial<SourceStudent> = {}): SourceStudent {
  return {
    name: 'Ковальчук Олена Ігорівна',
    speciality: 'Психологія',
    degree: 'BACHELOR',
    form: 'FULL_TIME',
    funding: 'STATE',
    ...over,
  };
}

describe('planImport', () => {
  it('plans a row with the ПІБ normalised and the speciality resolved to an id', () => {
    const plan = planImport(2026, [student()], IDS, new Set());

    expect(plan.problems).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.create).toEqual([
      {
        year: 2026,
        name: 'Ковальчук Олена Ігорівна',
        nameNormalised: 'ковальчук олена ігорівна',
        specialityId: 'sp-psy',
        degree: 'BACHELOR',
        form: 'FULL_TIME',
        funding: 'STATE',
      },
    ]);
  });

  it('skips a row the database already holds, and does not call it a problem', () => {
    const existing = new Set([importKey(2026, student())]);

    const plan = planImport(2026, [student()], IDS, existing);

    expect(plan.create).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.problems).toEqual([]);
  });

  it('skips a row the same FILE lists twice', () => {
    const plan = planImport(2026, [student(), student()], IDS, new Set());

    expect(plan.create).toHaveLength(1);
    expect(plan.skipped).toHaveLength(1);
  });

  // Two programmes, one person — the case the key exists for.
  it('keeps one person twice when the programme differs', () => {
    const plan = planImport(
      2026,
      [student(), student({ speciality: 'Початкова освіта' })],
      IDS,
      new Set()
    );

    expect(plan.create).toHaveLength(2);
    expect(plan.skipped).toEqual([]);
  });

  it('reports an unresolvable speciality instead of inventing one', () => {
    const plan = planImport(2026, [student({ speciality: 'Вигадана' })], IDS, new Set());

    expect(plan.create).toEqual([]);
    expect(plan.problems).toEqual([
      'Ковальчук Олена Ігорівна: спеціальності «Вигадана» немає в базі',
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test prisma/import-students.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `prisma/import-students.ts`**

```ts
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { normaliseStudentName } from '../lib/stake/claims';
import type { Funding, StudentDegree, StudyForm } from '../lib/stake/norms';

// Loads the реєстр зарахованих into AdmittedStudent.
//
//   pnpm db:import-students                  — report only, writes nothing
//   pnpm db:import-students --apply          — write the missing rows
//   pnpm db:import-students --year 2027      — another campaign's file
//
// NOT a seed. `pnpm db:seed` upserts the 2026 catalogue and production is never
// seeded again now that it is populated by admin edits — but production still
// needs these 1046 rows, and this touches one table.
//
// It is also the only import path that works there. edu-reference/ is not on
// the server and neither is staff-roster.json, which is why the Характеристика
// backfill needed its own script too — but accepted-2026.json IS in git, so
// this runs unchanged wherever the code is.
//
// Adds only. A row already in the database is skipped and counted, never
// updated and never deleted: the same rule the /admin/students importer will
// follow, and for the same reason — a file is one наказ, not the whole truth.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

/** One row of `lib/students/accepted-<year>.json`. `faculty` is present and ignored. */
export interface SourceStudent {
  name: string;
  speciality: string;
  degree: StudentDegree;
  form: StudyForm;
  funding: Funding;
}

export interface PlannedRow {
  year: number;
  name: string;
  nameNormalised: string;
  specialityId: string;
  degree: StudentDegree;
  form: StudyForm;
  funding: Funding;
}

export interface ImportPlan {
  create: PlannedRow[];
  skipped: SourceStudent[];
  problems: string[];
}

/**
 * The model's @@unique, as a string.
 *
 * Ступінь is deliberately absent — it follows from the programme, and the
 * database key does not carry it either. The two must agree, or the script
 * would plan a row the database then rejects.
 */
export function importKey(
  year: number,
  student: Pick<SourceStudent, 'name' | 'speciality' | 'form' | 'funding'>
): string {
  return [
    year,
    normaliseStudentName(student.name),
    student.speciality,
    student.form,
    student.funding,
  ].join('|');
}

/**
 * What the run would do. Pure, so the rules are testable without a database.
 *
 * `existing` holds `importKey`s already in the database. Duplicates WITHIN the
 * file are skipped too — a наказ transcribed twice is the likeliest way one
 * arrives, and it is not an error worth stopping for.
 */
export function planImport(
  year: number,
  source: readonly SourceStudent[],
  specialityIds: ReadonlyMap<string, string>,
  existing: ReadonlySet<string>
): ImportPlan {
  const plan: ImportPlan = { create: [], skipped: [], problems: [] };
  const seen = new Set(existing);

  for (const student of source) {
    const specialityId = specialityIds.get(student.speciality);
    if (!specialityId) {
      plan.problems.push(`${student.name}: спеціальності «${student.speciality}» немає в базі`);
      continue;
    }

    const key = importKey(year, student);
    if (seen.has(key)) {
      plan.skipped.push(student);
      continue;
    }
    seen.add(key);

    plan.create.push({
      year,
      name: student.name,
      nameNormalised: normaliseStudentName(student.name),
      specialityId,
      degree: student.degree,
      form: student.form,
      funding: student.funding,
    });
  }

  return plan;
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const apply = process.argv.includes('--apply');
  const year = Number(argValue('--year') ?? 2026);
  if (!Number.isInteger(year)) throw new Error(`Не рік: «${argValue('--year')}»`);

  const file = resolve(`lib/students/accepted-${year}.json`);
  const source = JSON.parse(readFileSync(file, 'utf8')) as SourceStudent[];
  console.log(`${file}: ${source.length} рядків\n`);

  const [specialities, existingRows] = await Promise.all([
    prisma.speciality.findMany({ select: { id: true, name: true } }),
    prisma.admittedStudent.findMany({
      where: { year },
      select: {
        nameNormalised: true,
        form: true,
        funding: true,
        speciality: { select: { name: true } },
      },
    }),
  ]);

  const specialityIds = new Map(specialities.map((s) => [s.name, s.id]));
  const existing = new Set(
    existingRows.map((r) =>
      [year, r.nameNormalised, r.speciality.name, r.form, r.funding].join('|')
    )
  );

  const plan = planImport(year, source, specialityIds, existing);

  console.log(`  Додати        ${plan.create.length}`);
  console.log(`  Вже в списку  ${plan.skipped.length}`);
  console.log(`  Помилки       ${plan.problems.length}\n`);

  if (plan.problems.length > 0) {
    // Refuses a partial import, the same as scripts/build-accepted-students.ts:
    // the alternative is a register that silently lost the students nobody can
    // then claim.
    console.error('Імпорт скасовано — ці рядки прочитати не вдалося:\n');
    for (const problem of plan.problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  if (!apply) {
    console.log('Це лише звіт. Запустіть з --apply, щоб записати.');
    return;
  }

  if (plan.create.length === 0) {
    console.log('Нічого додавати.');
    return;
  }

  await prisma.admittedStudent.createMany({ data: plan.create });
  const total = await prisma.admittedStudent.count({ where: { year } });
  console.log(`Додано ${plan.create.length}. Усього за ${year}: ${total}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test prisma/import-students.test.ts`
Expected: PASS, all 10.

- [ ] **Step 5: Remove the moved assertions from the register test**

In `lib/students/accepted.test.ts`, delete the whole `describe('the 2026 register')` block — all three of its remaining tests now live in `prisma/import-students.test.ts`. Delete the now-unused `SPECIALITY_CODES`, `SPECIALITY_NORMS_2026` and `NORM_NAMES`.

Run: `pnpm test lib/students/accepted.test.ts`
Expected: PASS, only the `registerOptions` group left.

- [ ] **Step 6: Add the script to `package.json`**

Beside the other one-off scripts, after `"db:link-speciality-departments"`:

```json
    "db:import-students": "tsx prisma/import-students.ts",
```

- [ ] **Step 7: Run it against the dev database, as a report**

Run: `pnpm db:import-students`
Expected:

```
…/lib/students/accepted-2026.json: 1046 рядків

  Додати        1046
  Вже в списку  0
  Помилки       0

Це лише звіт. Запустіть з --apply, щоб записати.
```

If «Помилки» is not 0, stop — a speciality is missing from the database and `pnpm db:seed` has not been run on it.

- [ ] **Step 8: Apply it**

Run: `pnpm db:import-students --apply`
Expected: `Додано 1046. Усього за 2026: 1046.`

- [ ] **Step 9: Prove it is idempotent**

Run: `pnpm db:import-students --apply`
Expected: `Додати 0`, `Вже в списку 1046`, `Нічого додавати.`

- [ ] **Step 10: Document it in `CLAUDE.md`**

In the Commands block, directly after the `db:link-speciality-departments` group and before `db:generate`, add:

```
pnpm db:import-students  # one-off: load lib/students/accepted-<year>.json into
                      #   AdmittedStudent. Reports by default, --apply to write,
                      #   --year for another campaign. Adds only, never removes.
                      #   NOT a seed: this is how production gets the реєстр.
```

- [ ] **Step 11: Type-check, full suite, commit**

Run: `pnpm type-check && pnpm test`

```
feat(students): load the register with pnpm db:import-students

Reports by default, --apply to write, idempotent on the model's unique
key. Adds only — a file is one наказ, never the whole truth.

Reads the committed accepted-2026.json, which is the point: production
has no edu-reference/, so this is the one path that fills the реєстр
there. Not a seed — prod is populated by admin edits now.

The three assertions that guarded the JSON while it WAS the register
move here, where that data is validated from now on.
```

---

### Task 6: Point the claim flow at the database

**Files:**

- Modify: `app/(dashboard)/achievements/students/page.tsx:49` (and the temporary comment from Task 3)
- Modify: `app/(dashboard)/achievements/students/actions.ts` — imports, `addStudentClaim`, `listStudentCandidates`
- Modify: `validations/student-claim.ts:9-13` — the stale comment
- Modify: `prisma/test-data.ts` — seed `AdmittedStudent` rows

**Interfaces:**

- Consumes: everything Task 4 produced.
- Produces: no new exports. `listStudentCandidates(year, criteria)` gains a first parameter.

- [ ] **Step 1: Rewire the page**

In `app/(dashboard)/achievements/students/page.tsx`, replace the import of `registerOptions` with both modules:

```ts
import { registerRows } from '@/lib/queries/list-admitted-students';
import { registerOptions } from '@/lib/students/accepted';
```

Replace the temporary line from Task 3 (and delete its `// TEMPORARY` comment) with:

```ts
// The picker's tree, not the register itself — a few KB against a thousand names.
const [rows, ownerNames] = await Promise.all([
  registerRows(template.year),
  getSpecialityOwnerNames(),
]);
const register = registerOptions(rows, ownerNames);
```

- [ ] **Step 2: Say so when the year has no register**

Directly after that, before the `return`:

```ts
  // An empty picker is a dead end the person cannot diagnose — the same reason
  // the cascade never offers a combination with nobody behind it. Nobody has
  // imported the year's наказ yet, and only an ADMIN can.
  if (rows.length === 0) {
    return (
      <AnimatedPage className="space-y-6">
        <h1 className="text-2xl font-semibold">Мої залучені здобувачі</h1>
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Здобувачів за {template.year} рік ще не імпортовано. Зверніться до адміністратора.
        </div>
      </AnimatedPage>
    );
  }
```

- [ ] **Step 3: Rewire the actions**

In `app/(dashboard)/achievements/students/actions.ts`, replace the `@/lib/students/accepted` import with:

```ts
import { findAcceptedStudent, studentsMatching } from '@/lib/queries/list-admitted-students';
import type { RegisterCriteria } from '@/lib/students/accepted';
```

In `addStudentClaim`, the year must be read **before** the register is, because the register is now per-year. Replace the block that currently runs `findAcceptedStudent` then `activeYear()` with:

```ts
const year = await activeYear();
if (!year) return failed('Рейтинговий рік закрито або ще не налаштовано');

// The register decides what is saved. Everything below comes from `student`,
// never from `parsed.data` — the two agree when the form was used normally,
// and when they do not it is a request nobody made through the UI.
const { studentName, ...criteria } = parsed.data;
const student = await findAcceptedStudent(year, studentName, criteria);
if (!student) return failed('Такого здобувача немає у списку зарахованих на обраних умовах');
```

In `listStudentCandidates`, take the year from the active template rather than from the caller — a client component must not choose which year's register it reads:

```ts
export async function listStudentCandidates(criteria: RegisterCriteria): Promise<string[]> {
  const session = await auth();
  if (!session) redirect('/login');

  const year = await activeYear();
  if (!year) return [];

  return studentsMatching(year, criteria);
}
```

- [ ] **Step 4: Fix the stale comment in `validations/student-claim.ts`**

Replace `Every field is now a choice from `lib/students/accepted.ts` rather than` (line 9) with:

```
// Every field is a choice from the реєстр зарахованих — the AdmittedStudent
// table, read through lib/queries/list-admitted-students.ts — rather than
```

- [ ] **Step 5: Seed the register in `prisma/test-data.ts`**

`prisma/test-data.ts:6` imports `ACCEPTED_STUDENTS`, which no longer exists. Replace that import with a direct read of the JSON:

```ts
import accepted2026 from '../lib/students/accepted-2026.json';
import { normaliseStudentName } from '../lib/stake/claims';

const ACCEPTED_STUDENTS = accepted2026 as {
  name: string;
  speciality: string;
  degree: 'BACHELOR' | 'MASTER';
  form: 'FULL_TIME' | 'PART_TIME';
  funding: 'STATE' | 'CONTRACT';
}[];
```

Then, immediately before the block at line 521 that builds demo claims (`const pool = ACCEPTED_STUDENTS.filter(...)`), insert the register itself — `db:seed:test` builds a university somebody can click every button in, and the claim picker is now one of those buttons:

```ts
// The реєстр, so /achievements/students has something to pick from. The demo
// claims below are drawn from the same list, so the two always agree.
const specialityIds = new Map(
  (await prisma.speciality.findMany({ select: { id: true, name: true } })).map((s) => [
    s.name,
    s.id,
  ])
);
await prisma.admittedStudent.createMany({
  data: ACCEPTED_STUDENTS.flatMap((s) => {
    const specialityId = specialityIds.get(s.speciality);
    return specialityId
      ? [
          {
            year,
            name: s.name,
            nameNormalised: normaliseStudentName(s.name),
            specialityId,
            degree: s.degree,
            form: s.form,
            funding: s.funding,
          },
        ]
      : [];
  }),
  skipDuplicates: true,
});
```

If the surrounding function has no `year` in scope, use the same year the demo claims are created with — read it from the code around line 521 and match it.

- [ ] **Step 6: Type-check and run the whole suite**

Run: `pnpm type-check && pnpm test`
Expected: both clean. Nothing should still import `ACCEPTED_STUDENTS`:

Run: `pnpm exec grep -rn "ACCEPTED_STUDENTS\|REGISTER_YEAR" app/ lib/ components/ prisma/ scripts/ validations/`
Expected: hits only inside `prisma/import-students.test.ts` / `lib/students/accepted.test.ts` local constants — no import of either name from `lib/students/accepted`.

- [ ] **Step 7: Click it**

Ask the user to sign in as an НПП and open `/achievements/students`. Confirm the picker offers specialities, that choosing one down to a ПІБ works, and that adding a claim saves. This is the one task with no automated coverage of the whole path.

- [ ] **Step 8: Commit**

```
feat(students): claim picker reads the register from the database

The year is read before the register now, not after: a register is
per-campaign, so «which students exist» has no answer until the year is
known. listStudentCandidates takes the year from the active template
rather than the caller — a client component must not choose which year's
register it reads.

A year with no imported наказ says so instead of rendering an empty
picker, which is a dead end nobody can diagnose.

db:seed:test now seeds the реєстр, so the picker works on a test build.
```

---

### Task 7: `/admin/students` — the table

Read-only in this task. Add and delete follow.

**Files:**

- Create: `app/(dashboard)/admin/students/page.tsx`
- Create: `components/admin/admitted-students-filters.tsx`
- Modify: `components/sidebar.tsx` — one nav item and one icon import

**Interfaces:**

- Consumes: `listAdmittedStudents`, `admittedYears`, `ADMITTED_PAGE_SIZE` from Task 4; the label maps from Task 2.
- Produces: the route `/admin/students`, reading `year`, `degree`, `form`, `funding`, `speciality`, `q` and `page` from the URL.

- [ ] **Step 1: The filter bar**

Create `components/admin/admitted-students-filters.tsx`. It follows `components/admin/domain-filter.tsx` — a plain `<Select>` per filter, pushing to the URL.

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { STUDENT_DEGREE_LABELS, STUDENT_FUNDING_LABELS, STUDY_FORM_LABELS } from '@/lib/labels';

/** «Усі». Not `''` — Radix reserves that for «no selection». */
const ALL = '__all__';

export interface AdmittedFiltersValue {
  year: number;
  degree: string;
  form: string;
  funding: string;
  speciality: string;
  q: string;
}

/**
 * The filter bar of /admin/students. Every value lives in the URL, so a filtered
 * page is linkable and Back works — the same choice /admin/audit-log makes.
 *
 * The search box is the one control that does not navigate on every keystroke:
 * it waits until the person stops typing, because each change is a round trip
 * for a table of a thousand rows.
 */
export function AdmittedStudentsFilters({
  years,
  specialities,
  value,
}: {
  years: readonly number[];
  specialities: readonly { id: string; label: string }[];
  value: AdmittedFiltersValue;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(value.q);

  function go(next: Partial<AdmittedFiltersValue>) {
    const merged = { ...value, ...next };
    const params = new URLSearchParams();
    params.set('year', String(merged.year));
    if (merged.degree) params.set('degree', merged.degree);
    if (merged.form) params.set('form', merged.form);
    if (merged.funding) params.set('funding', merged.funding);
    if (merged.speciality) params.set('speciality', merged.speciality);
    if (merged.q.trim()) params.set('q', merged.q.trim());
    // Any change to a filter invalidates the page number: page 7 of the old
    // result is rarely page 7 of the new one, and is often past the end.
    startTransition(() => router.push(`/admin/students?${params.toString()}`));
  }

  useEffect(() => {
    if (search === value.q) return;
    const timer = setTimeout(() => go({ q: search }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const selects: {
    key: 'degree' | 'form' | 'funding';
    label: string;
    all: string;
    options: Record<string, string>;
  }[] = [
    { key: 'degree', label: 'Ступінь', all: 'Усі ступені', options: STUDENT_DEGREE_LABELS },
    { key: 'form', label: 'Форма', all: 'Усі форми', options: STUDY_FORM_LABELS },
    {
      key: 'funding',
      label: 'Фінансування',
      all: 'Будь-яке фінансування',
      options: STUDENT_FUNDING_LABELS,
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={String(value.year)}
        disabled={pending}
        onValueChange={(next) => go({ year: Number(next) })}
      >
        <SelectTrigger className="w-full sm:w-32" aria-label="Рік вступу">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((year) => (
            <SelectItem key={year} value={String(year)}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selects.map((s) => (
        <Select
          key={s.key}
          value={value[s.key] || ALL}
          disabled={pending}
          onValueChange={(next) => go({ [s.key]: next === ALL ? '' : next })}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label={s.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{s.all}</SelectItem>
            {Object.entries(s.options).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      <Select
        value={value.speciality || ALL}
        disabled={pending}
        onValueChange={(next) => go({ speciality: next === ALL ? '' : next })}
      >
        <SelectTrigger className="w-full sm:w-80" aria-label="Спеціальність">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Усі спеціальності</SelectItem>
          {specialities.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Пошук за ПІБ"
        aria-label="Пошук за ПІБ"
        className="w-full sm:w-64"
      />
    </div>
  );
}
```

- [ ] **Step 2: The page**

Create `app/(dashboard)/admin/students/page.tsx`:

```tsx
export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { UK } from '@/lib/plural';
import { STUDENT_DEGREE_LABELS, STUDENT_FUNDING_LABELS, STUDY_FORM_LABELS } from '@/lib/labels';
import { SPECIALITY_CODES } from '@/lib/specialities/codes';
import { admittedYears, listAdmittedStudents } from '@/lib/queries/list-admitted-students';
import { AnimatedPage } from '@/components/ui/animated-page';
import { AnimatedRow } from '@/components/ui/animated-row';
import { AnimatedTableBody } from '@/components/ui/animated-table-body';
import { DataTable } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { AdmittedStudentsFilters } from '@/components/admin/admitted-students-filters';

/** «A4.16 Середня освіта (захист України)», or the bare name where no code maps */
export function specialityLabel(name: string): string {
  const code = SPECIALITY_CODES[name]?.code;
  return code ? `${code} ${name}` : name;
}

const DEGREES = new Set(Object.keys(STUDENT_DEGREE_LABELS));
const FORMS = new Set(Object.keys(STUDY_FORM_LABELS));
const FUNDINGS = new Set(Object.keys(STUDENT_FUNDING_LABELS));

/** A URL value is only a filter if it names something real */
function oneOf(value: string | string[] | undefined, allowed: Set<string>): string {
  return typeof value === 'string' && allowed.has(value) ? value : '';
}

/**
 * Реєстр зарахованих — the admin's view of who an НПП may claim.
 *
 * ADMIN and nobody else: `DivisionEntityPermission` covers Staff, Department
 * and Faculty, and the register is deliberately not offered to divisions
 * (owner, 2026-09-03).
 */
export default async function AdmittedStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const params = await searchParams;
  const years = await admittedYears();

  // Nothing imported yet. Says who can fix it rather than rendering an empty
  // table with five filters over nothing.
  if (years.length === 0) {
    return (
      <AnimatedPage className="space-y-6">
        <h1 className="text-2xl font-semibold">Здобувачі</h1>
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Реєстр порожній. Запустіть <code>pnpm db:import-students --apply</code>, щоб завантажити
          зарахованих.
        </div>
      </AnimatedPage>
    );
  }

  const asked = Number(typeof params.year === 'string' ? params.year : '');
  const year = years.includes(asked) ? asked : years[0]!;

  const degree = oneOf(params.degree, DEGREES);
  const form = oneOf(params.form, FORMS);
  const funding = oneOf(params.funding, FUNDINGS);
  const speciality = typeof params.speciality === 'string' ? params.speciality : '';
  const q = typeof params.q === 'string' ? params.q : '';
  const page = Math.max(1, Number(typeof params.page === 'string' ? params.page : '1') || 1);

  const [{ rows, total, totalPages }, specialities] = await Promise.all([
    listAdmittedStudents({
      year,
      degree: (degree || undefined) as 'BACHELOR' | 'MASTER' | undefined,
      form: (form || undefined) as 'FULL_TIME' | 'PART_TIME' | undefined,
      funding: (funding || undefined) as 'STATE' | 'CONTRACT' | undefined,
      specialityId: speciality || undefined,
      search: q,
      page,
    }),
    db.speciality.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  function hrefFor(next: number) {
    const sp = new URLSearchParams();
    sp.set('year', String(year));
    if (degree) sp.set('degree', degree);
    if (form) sp.set('form', form);
    if (funding) sp.set('funding', funding);
    if (speciality) sp.set('speciality', speciality);
    if (q.trim()) sp.set('q', q.trim());
    if (next > 1) sp.set('page', String(next));
    return `/admin/students?${sp.toString()}`;
  }

  return (
    <AnimatedPage className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Здобувачі</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
          Реєстр зарахованих — з-поміж них НПП обирають залучених здобувачів. Один рядок — один
          вступ: людину, зараховану на дві спеціальності, тут видно двічі.
        </p>
      </div>

      <AdmittedStudentsFilters
        years={years}
        specialities={specialities.map((s) => ({ id: s.id, label: specialityLabel(s.name) }))}
        value={{ year, degree, form, funding, speciality, q }}
      />

      <DataTable>
        <thead>
          <tr>
            <th className="text-left">ПІБ</th>
            <th className="text-left">Фінансування</th>
            <th className="text-left">Форма</th>
            <th className="text-left">Ступінь</th>
            <th className="text-left">Спеціальність</th>
          </tr>
        </thead>
        <AnimatedTableBody>
          {rows.map((row) => (
            <AnimatedRow key={row.id}>
              <td className="font-medium">{row.name}</td>
              <td>{STUDENT_FUNDING_LABELS[row.funding]}</td>
              <td>{STUDY_FORM_LABELS[row.form]}</td>
              <td>{STUDENT_DEGREE_LABELS[row.degree]}</td>
              <td className="text-muted-foreground">{specialityLabel(row.speciality)}</td>
            </AnimatedRow>
          ))}
        </AnimatedTableBody>
      </DataTable>

      {rows.length === 0 && (
        <p className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Нічого не знайдено. Спробуйте змінити фільтри.
        </p>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={hrefFor}
        summary={`${total} ${UK.plural(total, 'здобувач', 'здобувачі', 'здобувачів')}`}
      />
    </AnimatedPage>
  );
}
```

**Before writing this**, open `lib/plural.ts` and `components/ui/data-table.tsx` and match their real APIs — `UK.plural` above is a guess at the helper's shape. If `DataTable` expects props rather than `<thead>` children, follow `app/(dashboard)/admin/audit-log/page.tsx`, which uses all three components together.

- [ ] **Step 3: The sidebar link**

In `components/sidebar.tsx`, add `GraduationCap` to the `lucide-react` import if it is not already there (it is, line 9 — reuse it). Add to `ADMINISTRATION_NAV`, after `'/admin/invites'`:

```ts
  { href: '/admin/students', label: 'Здобувачі', icon: GraduationCap },
```

- [ ] **Step 4: Type-check and build**

Run: `pnpm type-check && pnpm lint`
Expected: both clean.

- [ ] **Step 5: Click it**

Ask the user to open `/admin/students` as ADMIN and confirm: 1046 in the summary, 30 rows, the pager reaches page 35, each filter narrows the list, and «петренко» in the search finds people. Then confirm a non-ADMIN is redirected away.

- [ ] **Step 6: Commit**

```
feat(students): add the Здобувачі register page

ADMIN only, 30 a page, filtered by рік, ступінь, форма, фінансування and
спеціальність, searched by ПІБ. Every filter lives in the URL, so a
filtered page is linkable and Back works.

Search runs against nameNormalised with the query normalised too, so
«петренко  о» finds «Петренко О.І.».

One row is one admission, not one person — the page says so, because a
person on two programmes appears twice and that looks like a bug.
```

---

### Task 8: «+ Додати»

**Files:**

- Create: `app/(dashboard)/admin/students/actions.ts`
- Create: `components/admin/add-admitted-student.tsx`
- Create: `validations/admitted-student.ts`
- Test: `validations/admitted-student.test.ts`
- Modify: `app/(dashboard)/admin/students/page.tsx` — mount the button
- Modify: `lib/labels.ts` — `FIELD_LABELS` entries
- Modify: `app/(dashboard)/admin/audit-log/page.tsx` — `VALID_ENTITIES`, `ENTITY_LABELS`, `resolveEntityName`

**Interfaces:**

- Consumes: `requireAdmin` from `@/lib/permissions`, `normaliseStudentName`, `parseDbError`/`isUniqueViolation` from `@/lib/db-error`, `diffChanges` from `@/lib/audit`.
- Produces: `admittedStudentSchema` (Zod), and `addAdmittedStudent(_prev, formData): Promise<AdmittedActionState>` where `AdmittedActionState = { error: string } | { success: true } | null`.

- [ ] **Step 1: Write the failing validation test**

Create `validations/admitted-student.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { admittedStudentSchema } from './admitted-student';

const valid = {
  name: 'Ковальчук Олена Ігорівна',
  specialityId: 'sp1',
  degree: 'BACHELOR',
  form: 'FULL_TIME',
  funding: 'STATE',
  year: '2026',
};

describe('admittedStudentSchema', () => {
  it('accepts a complete row and gives the year back as a number', () => {
    const parsed = admittedStudentSchema.parse(valid);
    expect(parsed.year).toBe(2026);
  });

  it('trims the ПІБ', () => {
    expect(admittedStudentSchema.parse({ ...valid, name: '  Ковальчук О. І.  ' }).name).toBe(
      'Ковальчук О. І.'
    );
  });

  it('refuses a ПІБ that is too short to be one', () => {
    const result = admittedStudentSchema.safeParse({ ...valid, name: 'О' });
    expect(result.success).toBe(false);
  });

  it('refuses a ступінь that is not one of the two', () => {
    expect(admittedStudentSchema.safeParse({ ...valid, degree: 'PHD' }).success).toBe(false);
  });

  it('refuses a year outside the campaigns this system covers', () => {
    expect(admittedStudentSchema.safeParse({ ...valid, year: '1999' }).success).toBe(false);
    expect(admittedStudentSchema.safeParse({ ...valid, year: '2100' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test validations/admitted-student.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `validations/admitted-student.ts`**

```ts
import { z } from 'zod';

// One student typed in by hand on /admin/students.
//
// The import is the normal way in; this is for the one person the деканат
// forgot, which otherwise costs everyone a new file. It carries a `year`
// because the register is per-campaign — but the ACTION still checks that year
// against the ones the register holds, because a form value is not evidence.

export const admittedStudentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, { error: 'Вкажіть ПІБ' })
    .max(200, { error: 'Занадто довге значення' }),
  specialityId: z.string().trim().min(1, { error: 'Оберіть спеціальність' }),
  degree: z.enum(['BACHELOR', 'MASTER'], { error: 'Оберіть ступінь' }),
  form: z.enum(['FULL_TIME', 'PART_TIME'], { error: 'Оберіть форму навчання' }),
  funding: z.enum(['STATE', 'CONTRACT'], { error: 'Оберіть джерело фінансування' }),
  year: z.coerce
    .number()
    .int({ error: 'Невірний рік' })
    .min(2020, { error: 'Невірний рік' })
    .max(2100, { error: 'Невірний рік' }),
});
export type AdmittedStudentSchema = z.infer<typeof admittedStudentSchema>;
```

- [ ] **Step 4: Run the test**

Run: `pnpm test validations/admitted-student.test.ts`
Expected: PASS, all 5.

- [ ] **Step 5: Write the action**

Create `app/(dashboard)/admin/students/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { isUniqueViolation, parseDbError } from '@/lib/db-error';
import { normaliseStudentName } from '@/lib/stake/claims';
import { admittedStudentSchema } from '@/validations/admitted-student';

// Реєстр зарахованих — ADMIN only, on every action, not just on the page.
// The register is not offered to divisions, so there is no entity permission to
// consult here (owner, 2026-09-03).

export type AdmittedActionState = { error: string } | { success: true } | null;

async function requireAdminSession() {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') return null;
  return session;
}

export async function addAdmittedStudent(
  _prev: AdmittedActionState,
  formData: FormData
): Promise<AdmittedActionState> {
  const session = await requireAdminSession();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = admittedStudentSchema.safeParse({
    name: formData.get('name'),
    specialityId: formData.get('specialityId'),
    degree: formData.get('degree'),
    form: formData.get('form'),
    funding: formData.get('funding'),
    year: formData.get('year'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Невірні дані' };

  const { name, specialityId, degree, form, funding, year } = parsed.data;

  const speciality = await db.speciality.findUnique({
    where: { id: specialityId },
    select: { name: true },
  });
  if (!speciality) return { error: 'Спеціальність не знайдено' };

  try {
    const student = await db.admittedStudent.create({
      data: {
        year,
        name,
        nameNormalised: normaliseStudentName(name),
        specialityId,
        degree,
        form,
        funding,
      },
      select: { id: true },
    });

    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'AdmittedStudent',
        entityId: student.id,
        label: `${name} — ${speciality.name} (${year})`,
        userId: session.user.id,
        changes: diffChanges({}, { name, specialityId, degree, form, funding, year }),
      },
    });
  } catch (e) {
    // The unique key is (year, ПІБ, спеціальність, форма, фінансування) — so
    // this is a student already in the register on these exact terms.
    if (isUniqueViolation(e)) {
      return { error: 'Цей здобувач уже є в реєстрі на цих умовах' };
    }
    return {
      error: parseDbError(e, 'Не вдалося зберегти. Зміни не застосовано', 'students.add', {
        userId: session.user.id,
      }),
    };
  }

  revalidatePath('/admin/students');
  return { success: true };
}
```

Open `lib/db-error.ts` first and match the real signatures of `isUniqueViolation` and `parseDbError` — `app/(dashboard)/achievements/students/actions.ts:105-137` shows both in use.

- [ ] **Step 6: The dialog**

Create `components/admin/add-admitted-student.tsx` — a client component with `useActionState(addAdmittedStudent, null)`, wrapped in the shadcn `Dialog` (not `AlertDialog`; this is a form, not a confirmation). Fields, in order: ПІБ (`Input`), Спеціальність (`Combobox` over the same `{ id, label }` list the filter bar gets), Ступінь, Форма, Фінансування (three `Select`s), and a hidden `<input name="year">` carrying the page's current year.

The server's error goes **inline above the footer**, not in a toast — it is a problem with what was typed:

```tsx
{
  state && 'error' in state && <p className="text-sm text-destructive">{state.error}</p>;
}
```

On `success`, close the dialog, clear the fields, `router.refresh()`, and `toast.success('Здобувача додано')` — a save with nowhere to attach is the one case the conventions give a toast.

Follow `components/admin/add-activity-type.tsx` for the dialog-plus-action shape already used in this folder.

- [ ] **Step 7: Mount it on the page**

In `app/(dashboard)/admin/students/page.tsx`, put the button in the header row beside the title:

```tsx
<div className="flex flex-wrap items-start justify-between gap-3">
  <div>
    <h1 className="text-2xl font-semibold">Здобувачі</h1>
    <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">…</p>
  </div>
  <AddAdmittedStudent
    year={year}
    specialities={specialities.map((s) => ({ id: s.id, label: specialityLabel(s.name) }))}
  />
</div>
```

- [ ] **Step 8: Teach the audit log the new entity**

In `lib/labels.ts`, add to `FIELD_LABELS`:

```ts
  name: 'ПІБ',
  specialityId: 'Спеціальність',
  degree: 'Ступінь',
  form: 'Форма навчання',
  funding: 'Фінансування',
  year: 'Рік вступу',
```

Check each key first — `FIELD_LABELS` is shared across every entity, and `name` and `year` may already be there for another model. **Do not overwrite an existing label**; if one is taken and the two meanings differ, leave it and note it in the commit message.

`nameNormalised` is deliberately absent: it is derived, and logging it would show every change twice, the second time in a spelling nobody typed.

In `app/(dashboard)/admin/audit-log/page.tsx`:

- add `'AdmittedStudent'` to `VALID_ENTITIES` (line ~85)
- add `AdmittedStudent: 'Здобувач'` to `ENTITY_LABELS` (line ~29)
- in `resolveEntityName`, add a case returning `null` — a deleted student has no row left, and the `label` written at mutation time already carries the ПІБ, which is what the page falls back to. Confirm that fallback by reading the function's caller before relying on it.

- [ ] **Step 9: Type-check, lint, test**

Run: `pnpm type-check && pnpm lint && pnpm test`

- [ ] **Step 10: Click it**

Ask the user to add a student, then add the same one again and confirm the second attempt shows «Цей здобувач уже є в реєстрі на цих умовах» inline. Then check `/admin/audit-log` shows the creation as «Здобувач» with readable field names.

- [ ] **Step 11: Commit**

```
feat(students): add one здобувач by hand

The import is the normal way in; this is the one person the деканат
forgot, which otherwise costs everyone a new file. A duplicate comes
back inline on the form, not as a toast — it is a problem with what was
typed.

The audit log learns the entity and the field names. nameNormalised is
left out on purpose: it is derived, and logging it would show every
change twice, the second time in a spelling nobody typed.
```

---

### Task 9: Delete, with the claims it takes down

**Files:**

- Modify: `app/(dashboard)/admin/students/actions.ts` — `claimantsFor`, `deleteAdmittedStudent`
- Create: `components/admin/delete-admitted-student.tsx`
- Test: `app/(dashboard)/admin/students/actions.test.ts`
- Modify: `app/(dashboard)/admin/students/page.tsx` — the row's action cell

**Interfaces:**

- Consumes: `claimValue` from `@/lib/stake/claims`, `getStakeYearSettings` from `@/lib/queries/list-stake-settings`, `formatStake` from `@/lib/stake/units`.
- Produces:
  - `interface Claimant { staffName: string; status: 'PENDING' | 'CONFIRMED' | 'REJECTED'; loses: number }`
  - `claimantsFor(id: string): Promise<{ error: string } | { claimants: Claimant[] }>`
  - `deleteAdmittedStudent(id: string): Promise<AdmittedActionState>`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/admin/students/actions.test.ts`. Mock `@/lib/auth`, `@/lib/db` and `@/lib/queries/list-stake-settings`, following the mocking style of `lib/queries/list-student-claims.test.ts`.

```ts
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/queries/list-stake-settings', () => ({ getStakeYearSettings: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    admittedStudent: { findUnique: vi.fn(), delete: vi.fn() },
    studentClaim: { findMany: vi.fn(), deleteMany: vi.fn() },
    speciality: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { claimValue } from '@/lib/stake/claims';
import { getStakeYearSettings } from '@/lib/queries/list-stake-settings';
import { claimantsFor, deleteAdmittedStudent } from './actions';

const mockAuth = auth as unknown as Mock;
const findStudent = db.admittedStudent.findUnique as unknown as Mock;
const findClaims = db.studentClaim.findMany as unknown as Mock;
const settings = getStakeYearSettings as unknown as Mock;

const STUDENT = {
  id: 'st1',
  year: 2026,
  name: 'Ковальчук Олена Ігорівна',
  nameNormalised: 'ковальчук олена ігорівна',
  specialityId: 'sp1',
  degree: 'BACHELOR',
  form: 'FULL_TIME',
  funding: 'STATE',
  speciality: { name: 'Психологія', norms: [{ base: 10.5 }] },
};

function claim(over: Record<string, unknown> = {}) {
  return {
    id: 'cl1',
    status: 'CONFIRMED',
    degree: 'BACHELOR',
    form: 'FULL_TIME',
    funding: 'STATE',
    staff: { lastName: 'Петренко', firstName: 'Іван', patronymic: 'Миколайович' },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } });
  settings.mockResolvedValue({ contractCoefficient: 0.175 });
  findStudent.mockResolvedValue(STUDENT);
});

describe('claimantsFor', () => {
  it('refuses anybody who is not ADMIN', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u2', role: 'EDITOR' } });
    await expect(claimantsFor('st1')).resolves.toEqual({ error: 'Недостатньо прав' });
  });

  // The whole point of the two-step dialog: it must find the claims by the
  // SAME normalised name StudentClaim was written with.
  it('finds claims by year, normalised ПІБ and speciality', async () => {
    findClaims.mockResolvedValue([]);

    await claimantsFor('st1');

    expect(findClaims).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          year: 2026,
          studentNameNormalised: 'ковальчук олена ігорівна',
          specialityId: 'sp1',
        },
      })
    );
  });

  // The figure is taken from claimValue itself, not re-derived here. A test
  // that recomputes the arithmetic pins the test author's version of the
  // formula, and the whole point is that the dialog quotes the SAME number the
  // bonus is paid on.
  it('says what a CONFIRMED claim costs its author', async () => {
    findClaims.mockResolvedValue([claim()]);

    const expected = claimValue(
      {
        staffId: '',
        status: 'CONFIRMED',
        degree: 'BACHELOR',
        form: 'FULL_TIME',
        funding: 'STATE',
        base: 10.5,
      },
      0.175
    );
    expect(expected).toBeGreaterThan(0); // guards against a silent zero

    const result = await claimantsFor('st1');

    expect(result).toEqual({
      claimants: [{ staffName: 'Петренко Іван Миколайович', status: 'CONFIRMED', loses: expected }],
    });
  });

  it('costs a PENDING claim nothing', async () => {
    findClaims.mockResolvedValue([claim({ status: 'PENDING' })]);

    const result = await claimantsFor('st1');
    expect(result).toEqual({
      claimants: [{ staffName: 'Петренко Іван Миколайович', status: 'PENDING', loses: 0 }],
    });
  });

  it('returns an empty list for a student nobody claimed', async () => {
    findClaims.mockResolvedValue([]);
    await expect(claimantsFor('st1')).resolves.toEqual({ claimants: [] });
  });
});

describe('deleteAdmittedStudent', () => {
  it('refuses anybody who is not ADMIN', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u2', role: 'EDITOR' } });
    await expect(deleteAdmittedStudent('st1')).resolves.toEqual({ error: 'Недостатньо прав' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('removes the student and their claims in ONE transaction', async () => {
    const tx = {
      studentClaim: { deleteMany: vi.fn() },
      admittedStudent: { delete: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    (db.$transaction as unknown as Mock).mockImplementation(async (fn: (t: unknown) => unknown) =>
      fn(tx)
    );

    await expect(deleteAdmittedStudent('st1')).resolves.toEqual({ success: true });

    expect(tx.studentClaim.deleteMany).toHaveBeenCalledWith({
      where: {
        year: 2026,
        studentNameNormalised: 'ковальчук олена ігорівна',
        specialityId: 'sp1',
      },
    });
    expect(tx.admittedStudent.delete).toHaveBeenCalledWith({ where: { id: 'st1' } });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('reports a student that is already gone', async () => {
    findStudent.mockResolvedValue(null);
    await expect(deleteAdmittedStudent('st1')).resolves.toEqual({
      error: 'Здобувача не знайдено',
    });
  });
});
```

**Note for the implementer:** `@/lib/stake/claims` is imported for real in this test, not mocked. `claimValue` is a pure function over its arguments — mocking it would leave the dialog's figure agreeing only with itself.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test "app/(dashboard)/admin/students/actions.test.ts"`
Expected: FAIL — `claimantsFor` is not exported.

- [ ] **Step 3: Write both actions**

Append to `app/(dashboard)/admin/students/actions.ts`:

```ts
/** One НПП who claimed this student, and what deleting them costs */
export interface Claimant {
  staffName: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  /** In ставки. Zero for anything not CONFIRMED — claimValue says so. */
  loses: number;
}

/** The student, their claims, and the year's coefficient — everything both steps need */
async function studentWithClaims(id: string) {
  const student = await db.admittedStudent.findUnique({
    where: { id },
    select: {
      id: true,
      year: true,
      name: true,
      nameNormalised: true,
      specialityId: true,
      degree: true,
      form: true,
      funding: true,
      speciality: { select: { name: true, norms: { select: { base: true, year: true } } } },
    },
  });
  if (!student) return null;

  const claims = await db.studentClaim.findMany({
    where: {
      year: student.year,
      studentNameNormalised: student.nameNormalised,
      specialityId: student.specialityId,
    },
    select: {
      id: true,
      status: true,
      degree: true,
      form: true,
      funding: true,
      staff: { select: { lastName: true, firstName: true, patronymic: true } },
    },
  });

  return { student, claims };
}

/**
 * Who claimed this student, and what each of them loses. Step one of two.
 *
 * The dialog quotes real ставки, so the numbers come from `claimValue` — the
 * same function the bonus itself is computed with — rather than from a second
 * rule that could drift from it.
 *
 * Claims are found by the NORMALISED ПІБ. Both sides are written by
 * `normaliseStudentName`, which is the entire reason AdmittedStudent carries
 * that column: match on the typed name and «О’лена» and «О'лена» are two people
 * and this warning silently finds nothing.
 */
export async function claimantsFor(
  id: string
): Promise<{ error: string } | { claimants: Claimant[] }> {
  const session = await requireAdminSession();
  if (!session) return { error: 'Недостатньо прав' };

  const found = await studentWithClaims(id);
  if (!found) return { error: 'Здобувача не знайдено' };

  const { student, claims } = found;
  const settings = await getStakeYearSettings(student.year);
  const base = student.speciality.norms.find((n) => n.year === student.year)?.base ?? null;

  return {
    claimants: claims.map((claim) => ({
      staffName: `${claim.staff.lastName} ${claim.staff.firstName} ${claim.staff.patronymic}`,
      status: claim.status,
      loses: claimValue(
        {
          staffId: '',
          status: claim.status,
          degree: claim.degree,
          form: claim.form,
          funding: claim.funding,
          base,
        },
        settings?.contractCoefficient ?? 0.175
      ),
    })),
  };
}

/**
 * Remove a student, and the claims that name them.
 *
 * **The claims go too** (owner, 2026-09-03). A claim points at no register row
 * — it stores the ПІБ as text and a Speciality id — so deleting the student
 * alone would leave the claim paying a bonus for somebody who is on no list,
 * and nobody would ever see it. Cascading is what makes the warning the admin
 * confirms a true statement.
 *
 * One audit entry, not one per claim: one admin action is one line, and who
 * lost what belongs in that line's `changes` — it is the fact somebody will
 * later have to explain to an НПП whose bonus moved.
 */
export async function deleteAdmittedStudent(id: string): Promise<AdmittedActionState> {
  const session = await requireAdminSession();
  if (!session) return { error: 'Недостатньо прав' };

  const found = await studentWithClaims(id);
  if (!found) return { error: 'Здобувача не знайдено' };

  const { student, claims } = found;
  const where = {
    year: student.year,
    studentNameNormalised: student.nameNormalised,
    specialityId: student.specialityId,
  };

  try {
    await db.$transaction(async (tx) => {
      await tx.studentClaim.deleteMany({ where });
      await tx.admittedStudent.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'AdmittedStudent',
          entityId: id,
          label: `${student.name} — ${student.speciality.name} (${student.year})`,
          userId: session.user.id,
          changes: diffChanges(
            {
              name: student.name,
              specialityId: student.specialityId,
              degree: student.degree,
              form: student.form,
              funding: student.funding,
              year: student.year,
              claims: claims
                .map((c) => `${c.staff.lastName} ${c.staff.firstName} (${c.status})`)
                .join(', '),
            },
            {}
          ),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося видалити. Зміни не застосовано', 'students.delete', {
        userId: session.user.id,
      }),
    };
  }

  revalidatePath('/admin/students');
  revalidatePath('/achievements/students');
  revalidatePath('/my-department/students');
  return { success: true };
}
```

Add to the file's imports:

```ts
import { claimValue, normaliseStudentName } from '@/lib/stake/claims';
import { getStakeYearSettings } from '@/lib/queries/list-stake-settings';
```

Open `lib/queries/list-stake-settings.ts` and match `getStakeYearSettings`'s real signature and return shape before relying on `?.contractCoefficient`. Also confirm `SpecialityNorm` is exposed as `norms` on `Speciality` with a `year` field — `prisma/schema.prisma:642-656` says it is.

Add `claims: 'Заявки НПП'` to `FIELD_LABELS` in `lib/labels.ts`, so the audit diff renders that key with a name.

- [ ] **Step 4: Run the tests**

Run: `pnpm test "app/(dashboard)/admin/students/actions.test.ts"`
Expected: PASS, all 8.

- [ ] **Step 5: The dialog**

Create `components/admin/delete-admitted-student.tsx` — a client component. A `Trash2` ghost icon button opens an `AlertDialog`; follow `components/admin/activity-type-row.tsx:115-146` for the shape.

It loads the claimants when the dialog opens, not on render — one query per row would be 30 queries a page:

```tsx
const [claimants, setClaimants] = useState<Claimant[] | null>(null);

function onOpenChange(next: boolean) {
  setOpen(next);
  if (!next) return;
  setClaimants(null);
  startTransition(async () => {
    const result = await claimantsFor(student.id);
    if ('error' in result) {
      toast.error(result.error);
      setOpen(false);
      return;
    }
    setClaimants(result.claimants);
  });
}
```

The body renders three states — loading, nobody claimed them, somebody did:

```tsx
<AlertDialogTitle>Видалити здобувача?</AlertDialogTitle>
<AlertDialogDescription asChild>
  <div className="space-y-3">
    <p>
      <span className="font-medium text-foreground">{student.name}</span>
      <br />
      {student.speciality} · {STUDY_FORM_LABELS[student.form]} ·{' '}
      {STUDENT_FUNDING_LABELS[student.funding]}
    </p>

    {claimants === null && <p>Перевіряємо заявки…</p>}

    {claimants !== null && claimants.length > 0 && (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-400">
        <p className="font-medium">
          Цього здобувача вже заявили. Їхні заявки буде видалено разом із ним.
        </p>
        <ul className="mt-2 space-y-1">
          {claimants.map((c) => (
            <li key={c.staffName}>
              {c.staffName} —{' '}
              {c.loses > 0
                ? `підтверджено, втратить ${formatStake(c.loses)} ст.`
                : 'очікує, балів не втрачає'}
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
</AlertDialogDescription>
```

The amber panel is the project's «needs attention», and is a status indicator rather than decoration — the one place off the chart palette a hue is allowed.

Disable the confirm button while `claimants === null`: confirming before the check has answered is exactly the click this dialog exists to prevent.

Check `formatStake`'s signature in `lib/stake/units.ts` before using it — it may already append a unit.

- [ ] **Step 6: Add the action cell to the table**

In `app/(dashboard)/admin/students/page.tsx`, add a sixth header cell (`<th className="w-12" />`, no label — the icon says it) and, in the row:

```tsx
<td className="text-right">
  <DeleteAdmittedStudent student={row} />
</td>
```

- [ ] **Step 7: Type-check, lint, full suite**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all clean.

- [ ] **Step 8: Click it, both paths**

Ask the user to:

1. delete a student nobody claimed — plain confirmation, row disappears;
2. as an НПП, claim a student; then as ADMIN delete that student and confirm the dialog names the НПП. Confirm, then check `/achievements/students` — the claim is gone;
3. check `/admin/audit-log` shows one «Видалено · Здобувач» entry listing the claim in its diff.

- [ ] **Step 9: Commit**

```
feat(students): delete a здобувач, and the claims that name them

A claim points at no register row — it stores the ПІБ as text and a
Speciality id — so removing the student alone would leave a bonus paying
out for somebody on no list, with nothing on screen ever saying so. The
claims go in the same transaction, which is what makes the warning the
admin confirms a true sentence.

The dialog quotes real ставки from claimValue, the same function the
bonus itself uses, and names every claimant. It loads them when it
opens, not per row — thirty rows would be thirty queries a page.

One audit line per admin action, with the claimants in its diff.
```

---

## Self-review

**Spec coverage.** Walked the spec section by section: the model (Task 1), FK to `Speciality` (Task 1), the shared normaliser (Tasks 1, 4), no факультет (Task 1 — the column is simply never added; Task 3 drops it from `RegisterRow`), the page and its filters (Task 7), «+ Додати» (Task 8), the import rule (Task 5), delete with the claim cascade (Task 9), the `accepted.ts` split (Tasks 3, 4), the picker's year and its empty state (Task 6), the import script (Task 5), audit log (Tasks 8, 9), and the testing table (spread across Tasks 2-9). Phase 2, the `.xlsx` importer, is explicitly out — the «Імпортувати наказ» button is **not** built here, and Task 7's header deliberately mounts only «+ Додати».

**One gap found and closed:** the spec's testing table names a test for the add action's duplicate refusal. Task 8 covers the duplicate at the schema and action level but leaves the round trip to a manual click, because the action test would be asserting Prisma's unique-violation behaviour through a mock rather than the app's own logic. Step 10 of Task 8 makes that a required manual check instead.

**Placeholders:** none. Three steps deliberately say "open X and match its real signature" (`UK.plural` / `DataTable` in Task 7, `db-error` in Task 8, `getStakeYearSettings` / `formatStake` in Task 9) — those are instructions to verify an existing API, not deferred decisions.

**Type consistency:** `RegisterRow` (Task 3) is what `registerRows` returns (Task 4) and what `registerOptions` takes (Tasks 3, 6). `AdmittedStudentRow` (Task 4) is what the page renders (Task 7) and what the delete dialog takes (Task 9). `AdmittedActionState` (Task 8) is the return of both `addAdmittedStudent` and `deleteAdmittedStudent` (Task 9). `importKey` (Task 5) mirrors the model's `@@unique` (Task 1) — degree excluded on both sides, which the plan states in both places.

**Ordering:** Task 5 loads the data _before_ Task 6 switches the claim flow onto it, so the picker is never pointed at an empty table. Task 3 leaves the app compiling but visibly wrong for exactly two commits, and says so in its own commit message.
