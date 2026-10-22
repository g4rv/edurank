# Рейтинг кафедри Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A кафедра's own report (the «department_raiting_template.xlsx» sheet) filled by its завідувач, read by its декан, ranked and edited by ADMIN, exported to Excel.

**Architecture:** Two new tables separate from the personal rating — `DepartmentIndicator` (the year's scored catalogue, in the DB) and `DepartmentReport` (one per кафедра per year: counts JSON, narrative JSON, stored total). Pure scoring + Zod in `lib/department-rating/` and `validations/`, one server action, two pages shaped like `/stakes` and `/stakes/[id]`, one `/api` export route.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Zod, React Hook Form, exceljs, Vitest, Аврора components.

**Spec:** `docs/superpowers/specs/2026-10-20-department-rating-design.md`

## Global Constraints

- All UI text Ukrainian; no Ukrainian strings in logic files except refusal messages returned by actions (house pattern).
- Read `docs/aurora.md` before any UI; use `components/aurora/ui/*` controls only; even sizes; status colour by token (`--warning` pill for «Не заповнено»), never Tailwind palette classes.
- Never key behaviour on an indicator's `code`/`itemNumber`; read the row's `kind`, `coefficient`, `options`.
- Scores rounded to 2 decimals at save.
- Year never from client input: compare with `activeYear()`; refuse a mismatch with `closedYearProblem`'s message; also refuse when the active template's `status` is `CLOSED` ( `closeYear` leaves `isActive` true).
- «May I look» = ADMIN or `scopeOf`; «may I save» = ADMIN or `headOf`. EDITOR gets nothing.
- Every page starts with `auth()` + `if (!session) redirect('/login')`; the `/api` route authenticates itself.
- Errors: `parseDbError` on writes, `logError` elsewhere; never show codes.
- Audit every save with `diffChanges`, entity `DepartmentReport`.
- Commits only through the `/commit` skill, and only when the owner says so.

## Decisions taken by me (from the builder check — owner may override)

- Only the active year exists in the UI; no year selector. Closed active year → read-only.
- 12.2 counts in «Всього». Counts: integer ≥ 0, max 999 (sanity bound only).
- A кафедра with no head: only ADMIN fills it. `updatedById` = whoever saved.
- List order: total desc, then кафедра name (uk collation); «Не заповнено» rows last. Декан's list shows only their факультет, rank numbered within it.
- No backfill of 2025.

## Review Focus

1. A head of кафедра A posting `departmentId` of кафедра B → refused (test in Task 4).
2. Saving after the year was closed while the page was open → refused with the reload message (Task 4).
3. A декан posting a save directly → refused although they can read (Task 4).
4. A narrative box over its limit, or 4 rows in item 14 / 3 studies in item 15 → refused by the shared schema (Task 2).
5. `values` naming a HEADING, an inactive or another year's indicator, or a CHOICE index out of range → refused (Task 2 for shape, Task 4 for ids).

---

### Task 1: Schema, catalogue, seed, prod script, clone

**Files:**

- Modify: `prisma/schema.prisma` (new enum + 2 models; back-relations on `Department` and `Staff`)
- Create: migration via `pnpm db:migrate --name department-rating`
- Create: `lib/department-rating/catalogue-2026.ts`
- Modify: `prisma/catalogue.ts` (`seedCatalogue` calls `seedDepartmentIndicators(prisma, year)`)
- Create: `prisma/department-rating-catalogue.ts`; Modify: `package.json` script `db:department-rating-catalogue`
- Modify: `app/(dashboard)/admin/rating/actions.ts` `cloneTemplate` (copy rows to `toYear` inside the same transaction)
- Test: `lib/department-rating/catalogue-2026.test.ts`, extend `app/(dashboard)/admin/rating/actions.test.ts`

**Interfaces — Produces:**

```prisma
enum DepartmentIndicatorKind { HEADING COUNT CHOICE }

model DepartmentIndicator {
  id          String                  @id @default(cuid())
  year        Int
  itemNumber  String                  // «1.1», «13.2»
  order       Int
  label       String
  kind        DepartmentIndicatorKind
  coefficient Float                   @default(0)   // COUNT: points per unit
  options     Json                    @default("[]") // CHOICE: [{ label, points }]
  isActive    Boolean                 @default(true)
  @@unique([year, itemNumber])
  @@index([year, order])
}

model DepartmentReport {
  id           String     @id @default(cuid())
  departmentId String
  department   Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  year         Int
  values       Json       @default("{}")  // indicatorId → number (COUNT) | option index (CHOICE)
  narrative    Json       @default("{}")  // DepartmentNarrative, Task 2
  totalScore   Float      @default(0)
  updatedById  String?
  updatedBy    Staff?     @relation("DepartmentReportEditor", fields: [updatedById], references: [id], onDelete: SetNull)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  @@unique([departmentId, year])
}
```

- `DEPARTMENT_INDICATORS_2026: DepartmentIndicatorDef[]` where `DepartmentIndicatorDef = { itemNumber; label; kind; coefficient?; options? }`, in sheet order; labels verbatim from `B9:B40` of the template. HEADING rows: 1, 2, 6, 7, 12. Item 3 CHOICE options `[{label:'0-10 тис. грн.',points:10},{label:'10-20 тис. грн.',points:20},{label:'більше 20 тис. грн.',points:30}]`. Coefficients per the spec table.
- `seedDepartmentIndicators(prisma, year): Promise<number>` — upsert on `(year, itemNumber)`, `order` = index.

- [ ] **Step 1: Test the catalogue** — `catalogue-2026.test.ts`: 32 rows (5 headings + 26 COUNT + 1 CHOICE); itemNumbers unique; every COUNT has `coefficient > 0`; `'10'` has 0.5, `'1.1'` has 50, `'13.2'` has 10; the CHOICE has the three options above. Run `pnpm test lib/department-rating/catalogue-2026` → FAIL.
- [ ] **Step 2: Write the catalogue** → test PASS.
- [ ] **Step 3: Schema + migration** — add models, run `pnpm db:migrate --name department-rating` then `pnpm db:generate`. Expected: migration folder created, generate succeeds. (Postgres must be up — the owner starts Docker; ask if it is down.)
- [ ] **Step 4: Seed + script** — `seedDepartmentIndicators` in `prisma/catalogue.ts`; `prisma/department-rating-catalogue.ts` copies the header/report/`--apply` shape of `prisma/science-catalogue.ts`: CREATE-ONLY for `activeYear`'s year, lists missing rows, writes only with `--apply`.
- [ ] **Step 5: Clone** — failing test in `admin/rating/actions.test.ts`: cloning 2026 creates `departmentIndicator` rows for 2027 with the same itemNumber/label/kind/coefficient/options/isActive. Implement with `tx.departmentIndicator.createMany`. Test PASS.
- [ ] **Step 6:** `pnpm type-check` clean; stop for the owner's commit decision.

### Task 2: Scoring and the shared schema

**Files:**

- Create: `lib/department-rating/score.ts`, `lib/department-rating/score.test.ts`
- Create: `validations/department-report.ts`, `validations/department-report.test.ts`

**Interfaces — Produces:**

```ts
// score.ts
export type IndicatorRow = {
  id: string;
  itemNumber: string;
  kind: 'HEADING' | 'COUNT' | 'CHOICE';
  coefficient: number;
  options: { label: string; points: number }[];
  isActive: boolean;
};
export type ReportValues = Record<string, number>;
export function indicatorScore(row: IndicatorRow, value: number | undefined): number;
export function reportTotal(rows: IndicatorRow[], values: ReportValues): number; // round2, active non-heading only
export function valuesProblem(rows: IndicatorRow[], values: ReportValues): string | null; // unknown/HEADING/inactive id, CHOICE index out of range

// validations/department-report.ts
export const NARRATIVE_LIMITS = {
  initiativeRows: 3,
  studies: 2,
  results: 3000,
  role: 2000,
  impact: 6000,
  confirmations: 1000,
} as const;
export const IMPACT_KINDS: readonly string[]; // the 12 options from C69, verbatim, in order
export const narrativeSchema: z.ZodType<DepartmentNarrative>;
export const departmentReportSchema: z.ZodObject<{ departmentId; year; values; narrative }>;
export type DepartmentNarrative = {
  initiative: { topic: string; results: string; expected: string }[]; // item 14, ≤3
  studies: {
    title: string;
    customer: string;
    lead: string;
    team: string;
    funding: string;
    results: string;
  }[]; // item 15, ≤2
  development: {
    name: string;
    essence: string;
    patentability: string;
    comparison: string;
    economics: string;
    adopters: string;
    readiness: string;
    contacts: string;
  }; // item 16
  impact: {
    kind: string | null;
    resultsList: string;
    results: string;
    role: string;
    description: string;
    confirmations: string;
  }; // item 17
};
export const EMPTY_NARRATIVE: DepartmentNarrative;
```

Every narrative string optional-empty (`''` allowed), trimmed; `impact.kind` null or one of `IMPACT_KINDS`. `values`: record of string → int 0…999. The schema must accept its own output (CLAUDE.md, certificates rule).

- [ ] **Step 1: Failing tests** — `score.test.ts`: COUNT 3 × 50 = 150; CHOICE index 1 → 20; missing value → 0; HEADING never scores; inactive row ignored by `reportTotal`; `reportTotal` of 0.5 × 3 + 1 = 2.5 exact; `valuesProblem` refuses a HEADING id, an unknown id, CHOICE index 3, and passes a valid set. `department-report.test.ts`: 4 initiative rows refused; 3 studies refused; `results` of 3001 chars refused, 3000 passes; `impact.kind` not in list refused; `narrativeSchema.parse(narrativeSchema.parse(EMPTY_NARRATIVE))` passes; value 1.5 or −1 refused.
- [ ] **Step 2:** run `pnpm test lib/department-rating/score validations/department-report` → FAIL.
- [ ] **Step 3:** implement both files → PASS.
- [ ] **Step 4:** stop for the commit decision.

### Task 3: Access and queries

**Files:**

- Create: `lib/department-rating/access.ts` (+ `.test.ts`)
- Create: `lib/queries/get-department-report.ts`, `lib/queries/list-department-reports.ts`

**Interfaces:**

- Consumes: `scopeOf`, `headOf`, `deanOf` from `lib/queries/scope.ts`; `getActiveTemplate`.
- Produces:

```ts
export type ReportAccess = { canView: boolean; canEdit: boolean };
export async function reportAccessFor(
  user: { role: Role; staffId?: string | null },
  departmentId: string
): Promise<ReportAccess>;
export async function visibleDepartmentIds(user): Promise<string[] | 'all'>; // ADMIN → 'all', else scopeOf
export async function getDepartmentReport(
  departmentId: string,
  year: number
): Promise<{
  department: { id; name; faculty: string | null };
  indicators: IndicatorRow[];
  report: {
    values: ReportValues;
    narrative: DepartmentNarrative;
    totalScore: number;
    updatedAt: Date;
    updatedByName: string | null;
  } | null;
} | null>;
export async function listDepartmentReports(
  year: number,
  ids: string[] | 'all'
): Promise<
  {
    id;
    name;
    faculty: string | null;
    facultyId: string | null;
    totalScore: number | null;
    updatedAt: Date | null;
  }[]
>; // ordered per «Decisions»
```

`canEdit` = ADMIN or `headOf` includes it; `canView` = `canEdit` or `scopeOf` includes it. A stored narrative is read through `narrativeSchema.catch(EMPTY_NARRATIVE)`-style parsing so a malformed row renders empty, not a crash.

- [ ] **Step 1: Failing tests** (`access.test.ts`, mocking `scope`): ADMIN → view+edit anywhere; head of D → view+edit D, nothing on E; декан whose scope has D → view, not edit; EDITOR with empty scope → neither.
- [ ] **Step 2:** FAIL → implement → PASS. Queries are thin Prisma reads; no tests beyond type-check.
- [ ] **Step 3:** stop for the commit decision.

### Task 4: `saveDepartmentReport`

**Files:**

- Create: `app/(dashboard)/department-rating/actions.ts` (+ `.test.ts`)
- Modify: `lib/labels.ts` — `FIELD_LABELS` keys `values: 'Показники'`, `narrative: 'Опис діяльності'`, `totalScore: 'Всього'` if not present, else `ENTITY_FIELD_LABELS.DepartmentReport`.

**Interfaces:**

- Consumes: Tasks 2–3; `closedYearProblem`; `diffChanges`; `parseDbError`.
- Produces: `export async function saveDepartmentReport(payload: unknown): Promise<{ error: string } | { success: true; totalScore: number } | null>`

Order: auth → `departmentReportSchema.safeParse` («Невірні дані форми») → `reportAccessFor(...).canEdit` else «Звіт кафедри заповнює завідувач кафедри» → `closedYearProblem(year)` → active template `status === 'CLOSED'` → «Рейтинговий рік закрито. Звіт не редагується» → load the year's indicators → `valuesProblem` → `reportTotal` → `upsert` + `auditLog.create` in one `$transaction` (label `${department.name} — рейтинг кафедри ${year}`, `changes: diffChanges(before, after)` over `{ values (printed as itemNumber → value), narrative, totalScore }`) → `revalidatePath('/department-rating')` and `/department-rating/${id}`.

- [ ] **Step 1: Failing tests** (mock pattern of `app/(dashboard)/stakes/actions.test.ts`): head saves own → upsert with `totalScore` 150 for `{ '1.1-id': 3 }`, audit entry written; head posts another кафедра → error, no upsert; декан (scope yes, head no) → error; year 2025 while active is 2026 → reload message; active template CLOSED → closed message; HEADING id in values → error; ADMIN saves any → success.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** stop for the commit decision.

### Task 5: Pages, form, sidebar

**Files:**

- Create: `app/(dashboard)/department-rating/page.tsx`, `app/(dashboard)/department-rating/[id]/page.tsx`, `loading.tsx` for both (copy `/stakes` skeleton pattern if one exists)
- Create: `components/department-rating/report-list.tsx`, `report-form.tsx` (client), `narrative-cards.tsx`
- Modify: `components/sidebar.tsx` — «Рейтинг кафедри» (icon `Landmark` or `Award`), shown when `isAdmin || headsDepartment || isDean`, placed right after «Розподіл ставок» / at that position for a декан.
- Modify: `app/(dashboard)/my-department/page.tsx:186` — button label → `Рейтинг НПП кафедри ${year}`.

Behaviour:

- **List page:** session guard → `visibleDepartmentIds`; empty → `redirect('/profile')`; a non-ADMIN with exactly one кафедра → `redirect('/department-rating/<id>')` (like `/stakes`). No active template → the «Рейтинговий рік ще не налаштовано.» empty state. Table (aurora `Table`, `SortHead`): №, Кафедра, Факультет, Всього, Оновлено; «Не заповнено» `--warning` pill; row links to the report. Subtitle «Звіт за {year} календарний рік».
- **Report page:** `reportAccessFor`, `!canView` → `notFound()`; read-only when `!canEdit` or template CLOSED. ADMIN and декан get breadcrumbs back to the list. Header: кафедра, «Звіт за {year} календарний рік», note «У показники кафедри вносяться дані ЛИШЕ по ШТАТНИМ працівникам», «Всього» as the one accent figure (live), «Оновлено … · {name}».
- **Form** (RHF + `zodResolver(departmentReportSchema)`): Part 1 table №/Назва критерію/К-сть/Бал — HEADING as a group row, COUNT a numeric `Input` (integer), CHOICE an aurora `Select` with «—» for none; Бал and Всього via `indicatorScore` / `reportTotal` live. Part 2 = cards 14–17: 14 and 15 with «Додати» up to `NARRATIVE_LIMITS`, a remove button per row; 17.1 a `Select` of `IMPACT_KINDS`; char counters on limited `Textarea`s. One «Зберегти» (pending state), `UnsavedChangesGuard when={isDirty}`, toast on success, `{ error }` shown beside the button. Item 14's heading uses the year.
- «Вивантажити Excel» `DownloadButton` → `/api/export/department-report?department=<id>` (Task 6).

- [ ] **Step 1:** read `docs/aurora.md`, `components/aurora/ui/table.tsx`, `/stakes/[id]` and a form using RHF + aurora controls (e.g. `components/qualifications/*`), then build.
- [ ] **Step 2:** `pnpm type-check` + `pnpm lint` clean.
- [ ] **Step 3:** browser check with the owner's dev server (Playwright, logins in memory `dev-test-logins`): ADMIN list + edit + save; head redirect + save; декан read-only. Stop for the commit decision.

### Task 6: Excel export

**Files:**

- Create: `lib/department-rating/export-workbook.ts` (+ `.test.ts`), `app/api/export/department-report/route.ts`

**Interfaces:** `export async function buildDepartmentReportWorkbook(input: { departmentName: string; year: number; indicators: IndicatorRow[]; values: ReportValues; narrative: DepartmentNarrative; total: number }): Promise<ExcelJS.Workbook>`

Layout after the template: A2 «Звіт за {year} календарний рік», B4 «Назва кафедри» + name, B6 «Всього» + total, header row «Назва критерію | К-сть | Бал», then one row per indicator (№ in A as TEXT — the sheet's own dates bug must not recur), headings bold; then items 14–17 as label/value rows. Route: `auth()` → 401; `?department` required → 400; `reportAccessFor().canView` → 403; no active template → 404; file name via `attachmentHeader` (`lib/export/file-names`); `logError('departmentRating.export', …)` on failure.

- [ ] **Step 1: Failing test:** workbook has A2 text with the year, total in C6 equals input, row for «1.1» has A cell `'1.1'` of type string and Бал 150 for value 3, impact kind text present.
- [ ] **Step 2:** FAIL → implement → PASS; route type-checks.
- [ ] **Step 3:** stop for the commit decision.

### Task 7: Docs and final checks

**Files:** Modify `CLAUDE.md` (a short «Рейтинг кафедри (built)» section: separate tables, head fills / декан reads / ADMIN all, active year only, 12.2 counted, catalogue via `db:department-rating-catalogue`; folder-structure lines for `department-rating/`; the new command in «Commands»).

- [ ] **Step 1:** write the section.
- [ ] **Step 2:** `pnpm test`, `pnpm type-check`, `pnpm lint` — all clean (lint: only the known `watch()` warning).
- [ ] **Step 3:** report to the owner; commit and merge only on their word.
