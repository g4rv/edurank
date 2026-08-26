@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

EduRank — a self-hosted university staff management platform replacing Google Sheets + a Google Apps Script pipeline (6-minute execution limit). Built by a junior front-end dev for internal use at a university science department.

## University structure

```
University
└── Faculty (факультет)          — organizational grouping only, no system role
    └── Department (кафедра)     — organizational grouping only, no system role
        └── Staff (НПП) live here

Division (відділ)                — separate cross-cutting structure, university-wide
    Examples: ННВ (навчально-науковий відділ), ННЦЗЯО (Навчально-науковий центр забезпечення якості освіти)
```

- Staff has **at least one кафедра and at most two** — enforced in
  `validations/staff.ts`. Three shapes are legal: a primary one; a primary plus
  one additional (сумісництво) via the `StaffDepartment` join table; or **only
  the additional one** (owner, 2026-08-26). What is refused is an НПП attached
  to nothing, which would be absent from every list, grid and `Кнпп` with no
  screen to show the mistake.
- **A null `departmentId` IS the сумісник marker.** Somebody with no primary
  reads as a сумісник on every кафедра they are on, and that is the intent — the
  0,10–0,25 bounds, the badge, sorted last, no place in that кафедра's `Кнпп`.
  There is no extra column: every check compares the row's own `departmentId`
  against the кафедра being viewed.
- **A сумісник is paid a ставка by BOTH кафедри** (2026-08-24, reversing Q12). They
  appear in both кафедри's lists and both distribution grids, badged «Сумісник» and
  sorted last, with their **whole** university rating and a 0,25 default ceiling on
  the additional one. Spread `onDepartment` from `lib/queries/roster.ts` into every
  «who is on this кафедра» query — `departmentId` alone no longer answers it.
- Staff is split into two types via `isNpp: boolean`:
  - `true` — НПП (науково-педагогічний працівник): academic staff, must belong to at least one кафедра (primary or additional), have profiles with ratings/achievements
  - `false` — non-НПП: administrative staff (e.g. division employees), department is optional
- Both types live in the same `Staff` table; the UI shows a unified list with a filter tab (НПП / Адміністративний / Всі).
- Divisions operate university-wide — not scoped to faculty or department.

**A person is never deleted — they are archived** (`Staff.archivedAt`). Deleting
cascades their activities and rating entries, closed years included, and those
numbers are final university records. Two ordinary cases decided this: someone
who leaves and returns years later must find their history intact, and someone on
декретна відпустка must drop out of the current rating while every past result
stays. There is no hard delete of a person anywhere — `archiveStaff` /
`restoreStaff` are it, and the `STAFF DELETE` entity permission governs them.

Consequences to keep in mind:

- An archived account **cannot sign in** (`authorize` in `lib/auth.ts`), and
  archiving bumps `tokenVersion` so an open session ends immediately.
- Every query that lists people or scores the **current** year must exclude them:
  spread `ON_ROSTER` from `lib/queries/roster.ts` into the `where`. A **closed**
  year is the exception — its ranking is frozen history and keeps whoever was in
  it (`listRatings` checks the template status for exactly this).
- Their profile-derived rows are dropped from the open year on archive and
  refilled on restore, so nobody retypes a returning person.

## Roles

- `ADMIN` — hardcoded full read/write, including confidential fields (e.g. ставка / work rate). No permission rows needed.
- `EDITOR` — division employee. View access to nearly all pages. What they can actually **do** is entirely determined by their division's configured permissions (see below). Not all editors have the same capabilities.
- `USER` — is a staff member (НПП). Can only view and edit their own profile, and submit achievements via forms.

## Permission model (two layers, both per division, both configured by ADMIN)

**Layer 1 — Field permissions (`DivisionFieldPermission` table)**
Which fields on a `Staff` record each division's editors can edit. Example: ННВ can edit `academicRank` and `pedagogicalExperience`; another division might be granted only `orcidId`. (`employmentRate` is confidential and grantable to nobody — see `CONFIDENTIAL_STAFF_FIELDS`.)

One grant is not a `Staff` column: **`partTimeDepartmentIds`** (сумісництво,
grantable since 2026-08-26) lives in the `StaffDepartment` join table, so
`updateStaff` checks it beside the field loop rather than inside it — including
in the «no editable fields» guard, which counts scalar columns and would
otherwise refuse a division granted only this one. Pages ask
`editorHasFieldGrant` so the control is offered only where the save would keep
it. It is structure, not money: `/stakes/[id]` still refuses anyone who is not
ADMIN, a head or a декан.

**Layer 2 — Entity permissions (`DivisionEntityPermission` table)**
Which CRUD operations on top-level entities each division can perform. Example: ННВ can create/delete Staff, Departments, Faculties. Another division may have none of these.

Rules:

- Divisions themselves can **only** be created/deleted by `ADMIN` — never by editors (divisions control permissions; editors touching them would be privilege escalation).
- Confidential fields (e.g. ставка): only `ADMIN` can read them. `EDITOR` never sees them. `USER` sees only their own.
- All permission enforcement is **server-side** — never only in UI components.

## Stack

**Current:**

- Next.js 16.2.10 (App Router, React 19)
- TypeScript (strict mode)
- Tailwind CSS v4 — configured via CSS `@theme` directive, no `tailwind.config.js`
- ESLint with `eslint-config-next`

**Auth:** Email + password, no OAuth. NextAuth v5 credentials provider with **JWT sessions — no database adapter**. The `jwt` callback in `lib/auth.ts` re-reads the Staff row on every call so role changes and the `tokenVersion` kill-switch (`forceLogout`) take effect immediately.

**Scale:** ~300 staff, tens of editors, a couple of admins.

**Design direction:** Clean & modern — whitespace, card-based profiles, polished SaaS feel. shadcn/ui base. All UI text in Ukrainian.

**Also installed:**

- Prisma 7 — ORM + migrations (`prisma/schema.prisma` is source of truth)
- PostgreSQL 16 — via Docker; Docker Compose runs postgres + adminer + backup
- NextAuth v5 beta + bcryptjs — auth, wired up
- Zod — schema validation; React Hook Form + @hookform/resolvers — form state
- radix-ui + shadcn, lucide-react (icons), sonner (toasts), motion (animations),
  next-themes, react-day-picker + date-fns
- nodemailer — invite / password-reset mail (`lib/mail/`)
- exceljs + jszip — the rating export at `/api/export/ratings`
- recharts + `components/ui/chart.tsx` (shadcn) — the charts on `/dashboard`
- @react-pdf/renderer — the PDF charts at `/api/export/rating-chart`; needs the TTF in
  `public/fonts/` (Geist's woff2 is unreadable to it and has no Cyrillic). No headless
  browser: Puppeteer would add ~300MB of Chromium to the image for two bar charts.
- Vitest — tests

**On-screen charts share the circulated reports' palette.** The university's Word PDFs
(`edu-reference/*.pdf`, reproduced by `lib/rating/pdf-chart.tsx`) use `#4472C4` for the
single series on «Рейтинг кафедр», and `#C00000` (total) beside `#0070C0` (розділ) on a
department's staff chart. The app adopts the same family as CSS tokens — `--chart-accent`
(blue `#4472C4`) for a chart series and `--chart-total` (red `#C00000`) for the «Загальний
бал» bar paired with a розділ — so screen and print read as one thing. Red for a total is
not a warning here; it is their house style. Both tokens are stepped lighter in dark mode
so they hold on the `oklch(0.205)` card.

**Colour marks a series, not decoration.** A chart uses one accent for a single series and
lets length do the comparing; it reaches for a second hue only where there are genuinely
two series — the paired кафедра view (total vs розділ), matching the printed sheet. The
score distribution is an `AreaChart` (a continuum, not a ranking): a gradient fill with a
dot per band and a dashed foreground median line. The `--chart-1…5` gray ramp remains for
any future monochrome chart, stepped separately for light and dark because the dark card
sits at `oklch(0.205)` and a flipped light ramp would sink into it.

**Chrome and data stay monochrome; small status indicators may carry a hue.** Layout, the
sidebar, tables, and text are gray. A small badge or icon that reports **state** is the one
place hue is allowed off the chart palette, because it encodes one condition, not a category:

- **green** — ok / verified / valid (activation done, «Перевірено», a valid DOI/ISBN)
- **amber** — pending / needs attention (not activated, «не вказано», «Сумісник»)
- **red** (`--destructive`) — destructive / error (delete, discard)

Examples live in `staff-table`, `account-card`, `moderation-list`, `audit-log`,
`admin/rating`, and the `doi-input` / `isbn-input` checkmarks. The «Сумісник»
pill is amber for the same reason (owner, 2026-08-24): that row's ставка comes
out of two pools, it does not count toward this кафедра's `Кнпп`, and it raises
the кафедра's own pool minimum — a head scanning the grid has to notice it. This is deliberately narrow:
anything larger than a pill/icon, and colouring a **table row** by value, still breaks the
rule. The active nav and all chrome stay pure gray.

## Commands

```bash
pnpm dev              # dev server
pnpm build            # production build
pnpm start            # production server
pnpm lint             # ESLint
pnpm type-check       # tsc --noEmit
pnpm test             # Vitest (1115 tests, colocated next to what they cover)

pnpm db:migrate       # prisma migrate dev (pass --name <x> to skip prompt)

# Four seeds, each answering a different question. The full reasoning, and what
# each one guarantees, is in the header of prisma/seed.ts.
pnpm db:seed          # PRODUCTION, safe, idempotent: the catalogue (відділи, the
                      #   2026 template and its indicators, додаток 5's спеціальності)
                      #   plus the real 8 факультети / 31 кафедра. Creates NO accounts.
pnpm db:seed:staff    # safe: the real НПП from staff-roster.json, upserted on email.
                      #   No passwords — invitations go out from /admin/invites.
pnpm db:seed:core     # PRODUCTION, safe, idempotent: the catalogue, then the whole
                      #   real university from prod-core.json — структура, people,
                      #   both templates, every activity and total. This is the ONLY
                      #   way production gets the real numbers: the server has neither
                      #   staff-roster.json nor edu-reference/, so nothing there can
                      #   rebuild them. Carries no passwords and never overwrites one.
pnpm data:export      # the other half: writes prod-core.json (~14 MB, gitignored)
                      #   from THIS database. Run on a maintainer's machine, scp it up.
pnpm db:seed:test     # DESTRUCTIVE: wipes people, structure and templates, then builds
                      #   a small complete university you can click every button in.
                      #   Refuses a populated database unless you pass --force.
# The bare command is the safe one on purpose — `prisma db seed` also runs as
# part of `pnpm db:reset`, which people type without thinking.

pnpm db:create-admin  # interactive: the first ADMIN account (db:seed makes none)
pnpm db:reset         # prisma migrate reset --force (wipe + reapply, dev only)
pnpm db:fix-rounding  # one-off repair: re-round RatingEntry totals to 2 decimals
pnpm db:gate-to-check-sum  # one-off: convert retired GATE indicator rows to CHECK_SUM
pnpm db:generate      # prisma generate (run after any schema change)
pnpm db:studio        # Prisma Studio at localhost:5555

pnpm staff:build      # rebuild staff-roster.json from edu-reference/ (gitignored output)
pnpm students:build   # rebuild lib/students/accepted-2026.json from the ЄДЕБО export

docker compose up -d  # start all services
```

## Prisma 7 notes

Prisma 7 differs significantly from earlier versions:

- **No `url` in `schema.prisma`** — database URL lives in `prisma.config.ts`, read via `dotenv/config` from `.env`.
- **Client entry point is `client.ts`**, not `index.ts`. Always import as `@/lib/generated/prisma/client`.
- **Generated client is gitignored** — run `pnpm db:generate` after `pnpm install` or after any schema change.
- **Seed config** lives in `prisma.config.ts` under `migrations.seed`, not in `package.json`.
- **Driver adapter required** — uses `@prisma/adapter-pg` (pure Node.js, no native binary engines needed).
- **`db:migrate --name <x>`** — pass `--name` flag to skip the interactive name prompt.

## Folder structure

```
app/
  (auth)/                         ← public routes; whitelist new ones in proxy.ts
    login/                        ← page.tsx checks the session server-side, form in login-form.tsx
    forgot-password/              ← self-service reset request
    activate/[token]/             ← set password from an emailed link
    layout.tsx
  (dashboard)/                    ← all authenticated routes, shared dashboard shell
    dashboard/                    ← ADMIN + EDITOR: «Огляд» — charts + faculty/department tree
    admin/                        ← ADMIN-only pages
      permissions/
        field/                    ← configure DivisionFieldPermission per division
        entity/                   ← configure DivisionEntityPermission per division
      rating/                     ← rating years: activate / clone / close / reopen
        [year]/                   ← per-section indicator editor
      stakes/                     ← redirects to /stakes (merged 2026-08-12)
        norms/                    ← додаток 5's норматив table + the year's contract coefficient
      invites/                    ← bulk «надіслати запрошення» over people with no password
      rating-debug/               ← service page: renders every evidence form (no nav link)
      design/                     ← service page: design concepts (no nav link)
      audit-log/
    staff/                        ← ADMIN + EDITOR (НПП + non-НПП unified list)
      [id]/
        edit/
        rating/                   ← the staff member's rating tab
        kharakterystyka/          ← their Характеристика (п.38 licence positions)
      new/
    faculties/                    ← [id]/, [id]/edit/, new/
    departments/                  ← same shape; [id]/stakes/ redirects to /stakes/[id]
    divisions/                    ← same shape; create/delete is ADMIN-only
    profile/                      ← own profile (personal data only)
    achievements/                 ← USER: «Мій рейтинг» + submission forms
      [section]/                  ← add an activity from section 1–5
      students/                   ← «Мої залучені здобувачі» — own StudentClaim list
      kharakterystyka/            ← own Характеристика
    moderation/                   ← ННВ + ADMIN: discard self-reports, verify publications
    division-data/                ← EDITOR: their division's direct-entry grid
    rating/                       ← ADMIN + EDITOR: university-wide rollup
    stakes/                       ← ADMIN/проректор: Кст + бонусний фонд across all кафедри
      [id]/                       ← the завідувач's grid for ONE кафедра (додаток 2)
    my-department/                ← завідувач/декан: their кафедра
      students/                   ← ADMIN rules on StudentClaims; a head/декан reads
    actions.ts                    ← sign-out
    layout.tsx                    ← dashboard shell (sidebar), redirects anonymous to /login
  api/                            ← NOT covered by proxy.ts — every route authenticates itself
    auth/[...nextauth]/           ← NextAuth handler
    export/ratings/               ← zip of per-staff Excel forms (or one, with ?staffId=)
    export/kharakterystyka/       ← same shape, for the Характеристика
    export/rating-chart/          ← ranked bar charts as PDF (@react-pdf/renderer)
  globals.css
  layout.tsx                      ← root layout
  page.tsx                        ← redirects by role

components/
  ui/                             ← shadcn base components (Button, Input, etc.)
  [feature]/                      ← admin/, staff/, rating/, stake/, kharakterystyka/,
                                    dashboard/, faculty/, department/, division/, profile/

lib/
  db.ts                           ← Prisma client singleton
  auth.ts                         ← NextAuth config (jwt callback re-reads Staff for role/tokenVersion)
  auth/                           ← password rules + the login throttle (LoginThrottle)
  audit.ts                        ← diffChanges
  labels.ts                       ← FIELD_LABELS and enum label maps
  permissions.ts                  ← role/field/entity guards shared by actions
  activation.ts                   ← invite + reset tokens (separate lifetimes)
  log.ts                          ← logError / logWarning — see «Errors: never swallow one»
  utils.ts                        ← cn() and other shared utilities (shadcn convention)
  mail/                           ← mailer, templates, validity phrasing
  queries/                        ← read-only DB functions, one file per entity
    scope.ts                      ← who oversees whom: scopeOf (read) vs headOf (decide)
    roster.ts                     ← ON_ROSTER — spread into every «current» query
  rating/                         ← scoring, recompute, db-specs, profile-derived, export
  stake/                          ← ставки: units, formula, settle, claims, norms, status-bonus
  kharakterystyka/                ← the п.38 licence document and its Excel export
  specialities/                   ← speciality codes and their кафедри
  students/                       ← the admitted-student register (server-only, ~240 KB JSON)

validations/                      ← Zod schemas, one file per entity

types/                            ← next-auth.d.ts (session shape)

prisma/
  schema.prisma
  seed.ts                         ← three modes; read its header before changing a seed

proxy.ts                          ← optimistic cookie gate only (see «Next.js 16 notes»)
```

Tests live next to the file they cover (`*.test.ts`), so `lib/` and `actions.ts` folders
contain test files alongside the source. There is no `hooks/` directory yet — add one if a
custom hook ever appears.

## Phase 2 — Achievement & Rating system (built)

Full design and milestone history: `docs/phase-2-plan.md`. The 2026 indicator catalogue:
`docs/rating-2026-catalogue.md`. Read those before changing rating behaviour.

How an indicator's value gets in is decided by `ActivityType.inputSource`:

| Source             | Who enters it                          | Where                           |
| ------------------ | -------------------------------------- | ------------------------------- |
| `NPP_SUBMISSION`   | the НПП, for themselves                | `/achievements/[section]`       |
| `DIVISION_MANAGED` | editors of `verifyingDivision`         | `/division-data`                |
| `PROFILE_DERIVED`  | nobody — synced from the Staff profile | `lib/rating/profile-derived.ts` |

Rules that are easy to get wrong:

- **There is no approval queue.** Submissions are `APPROVED` on save and count immediately; `PENDING` is never written. Oversight is _post_-moderation: ННВ editors and ADMIN discard a wrong entry with a reason (`/moderation`). So «Зараховано» means "counts", not "someone checked it".
- **«Перевірено» is a separate flag** (`Activity.verifiedAt`), manual, publications only, and it does **not** affect the score.
- **Scores are frozen at save.** `Activity.score` is computed once; editing a coefficient later does not rewrite existing rows.
- **A deactivated indicator scores nothing.** Only `APPROVED` rows of an `isActive` type count — see `COUNTED` in `lib/rating/recompute.ts`. Toggling `isActive` recomputes everyone holding it.
- **`year` is always derived** from the type's template, never taken from client input.
- **Closed years are read-only** and render from `RatingEntry.snapshot`. Appeals go through ADMIN `reopenYear` → fix → close again.

### Indicators live in the database, not in code

Each `ActivityType` row carries its own form definition (`evidenceFields`) and scoring rule (`scoring`), both JSON, plus `itemNumber` and `maxPerYear`. Adding or changing an indicator is an ADMIN action in `/admin/rating/[year]` — **no code change**. Consequences:

- **Never key rating behaviour on `code`.** Read the row: `parseTypeSpecs(row)` gives typed field specs, the scoring spec and the generated Zod schema. `computeScore(type, evidence)` takes the type, not a code. Per-indicator behaviour is a **column**, and there are three: `isActive`, `requiresVerification` («Перевірено» on /moderation) and `entityFirstEntry` (the bulk group dialog on /division-data). All three were code lists once, and each one silently excluded any indicator an admin built themselves.
- **Divisions are identified by `registryKey`, never by `name`.** The name is editable on /divisions; matching on it left a re-added catalogue indicator with no verifying division and blanked the export's «Дані внесені» column.
- **Select options carry their own `points`.** There is no central points map at runtime.
- **A year owns its structure.** `cloneTemplate` copies the JSON, so reshaping 2027 cannot touch 2026 — which is what makes reopening an old year for a correction safe.
- `ACTIVITY_TYPES_2026` + `EVIDENCE_FIELDS` are now **seed input only**: `dbSpecs(def)` converts a catalogue def into the row columns. `catalogueType(code)` gives tests the same view the app builds from a row.
- **What still needs code:** a new field kind (`lib/rating/evidence-fields.ts` + renderer + Zod generator), a new scoring kind (`lib/rating/scoring.ts`), and `PROFILE_DERIVED` indicators (they map to a Staff column). `specProblems()` is the contract between a field set and its rule — it guards both the builder and the seed.
- **Changing a scoring kind is a data migration, not just a code change.** `scoring` and `evidenceFields` are JSON columns, so editing the catalogue in `lib/rating/` leaves every existing row untouched and the running app keeps the old behaviour. `pnpm db:seed` upserts the current template; a **cloned** template is not reseeded and needs a one-off script (see `prisma/gate-to-check-sum.ts`). `computeValue` throws on a kind it does not know, so a missed row fails loudly instead of scoring `NaN`.

## Розподіл ставок (built)

Full specification: `docs/stake-distribution.md`. Read it before changing anything here.

Two people, two screens. ADMIN/проректор allocates pools across all 31 кафедри on
`/stakes`; the завідувач spreads one pool among their own people on `/stakes/[id]`,
which is додаток 2 on screen. A декан may **read** every кафедра of their faculty
and write none of them.

Three facts shape every model, and all three are easy to lose:

1. **Every ставка is an INTEGER HUNDREDTHS.** Never a float, in the database or in
   any sum. The old system used floats and produced negative «нерозподілено» — a
   кафедра that had overspent according to a subtraction and had not according to
   the people in it. See `lib/stake/units.ts`.
2. **`Кст` bounds the first term only.** The pool is spread by rating; recruitment
   bonuses are a second phase, months later, handed out by hand. `bonusPoolHundredths`
   is a separate column and **the formula must never read it**.
3. **There is no approval step** (decided 2026-08-10, retracting Q1). ADMIN sets the
   pool, the завідувач spreads it, and that is final. Do not add a SUBMITTED/APPROVED
   status or an approver id.

Rules that are easy to get wrong:

- **Headship is not a `Role`.** It is derived from `Department.headId` and
  `Faculty.deanId`, because one person is routinely a head, an НПП and a division
  editor at once. `scopeOf` answers «may I look», `headOf` answers «may I decide» —
  the difference is a декан. A завідувач is never also a декан (`headDeanConflict`).
- **The formula follows the university's own working sheet**, not the положення's
  printed formula, which overspends when computed literally. Two passes, both
  normalised, so the кафедра lands on its pool by construction. See
  `lib/stake/formula.ts`.
- **Four rules meet on one number** — the person's Мін/Макс, «тільки збільшити», what
  is left of both funds, and the 0,05 ladder. They interact, so they live and are
  tested together in `lib/stake/settle.ts`. Note that «тільки збільшити» is currently
  enforced on the client only; the server checks bounds and the ladder.
- **Overspending is allowed and shown, never refused.** The university's own sheet
  does the same. Refusing it deadlocked the grid, because ladder rounding can put the
  formula's own proposal above `Кст`.
- **A year is never taken from client input.** Every ставка mutation compares the
  submitted year against `activeYear()` and refuses a mismatch (`closedYearProblem`).
- **A student claim is the app's first and only approval queue**, deliberately: a
  rating entry affects its own author, but a claim takes a bonus from a colleague who
  may have recruited the same person. Duplicates are shown as evidence — there is no
  automatic winner and no «assign to».
- **Only ADMIN confirms or rejects a claim** (2026-08-25, retracting «admin/head can
  approve» of 2026-08-17). A confirmed claim pays a bonus out of a fund the завідувач
  then spends, so the head is not the one confirming it. A head and a декан still READ
  `/my-department/students` — the duplicate list is context for their own ставка
  grid — and `canDecide` there is `isAdmin` alone. Headship is not consulted: the page
  and the action no longer call `headOf`.
- **`StakeStatusBonus` is information, never money.** The grid shows what somebody's
  positions and recruited students add up to; the head still types the ставка.
- **A person's Мін/Макс is per кафедра, not per person.** `StaffStakeLimits` carries
  a `departmentId`, and the additional кафедра never inherits the primary one's
  bounds — the lookup is scoped and the fallback is `PART_TIME_LIMITS` (0,10–0,25),
  not `DEFAULT_LIMITS`.
- **`Staff.employmentRate` is the SUM across every кафедра that pays somebody.**
  `saveDistribution` writes it, adding what the other кафедри already allocated this
  year. Writing only this кафедра's share meant the second head to save overwrote
  the first. `headcount` counts сумісники so `Кст ≥ 0,1 × N` covers them; `Кнпп`
  never does.

## Характеристика (built)

Full specification: `docs/kharakterystyka.md`. The п.38 licence document: twenty
positions a person either satisfies or does not, derived from their activities over a
five-year window. `Кнпп` — how many people on a кафедра meet enough of them — is
**never stored**; it is computed in `lib/queries/get-department-knpp.ts`, because
freezing it would go stale the moment somebody submits an achievement.

Which indicators satisfy which position is `ActivityType.licencePositions`, a JSON
column and not a list in code — for the same reason `requiresVerification` and
`entityFirstEntry` are columns: a code list silently excludes every indicator an
admin builds themselves, and the вчена рада votes new ones in yearly.

## Naming conventions

- Files and folders: `kebab-case` everywhere
- React component exports: `PascalCase`
- `actions.ts` colocated inside each feature route folder, `'use server'` at top of file
- Queries (`lib/queries/`): noun-first (`get-professor.ts`, `list-divisions.ts`)
- Zod schemas (`validations/`): entity name (`professor.ts`, `division.ts`)
- Hooks (`hooks/`): `use` prefix, camelCase (`useProfessorForm.ts`)
- Tests: colocated next to the file they test, `.test.ts(x)` suffix

## Audit log

Mutations use `diffChanges` from `lib/audit.ts` to capture before/after state in `AuditLog.changes` (JSON). The audit log page renders these diffs using `FIELD_LABELS` from `lib/labels.ts`.

**When adding a new field to any model**, also add its Ukrainian label to `FIELD_LABELS` in `lib/labels.ts`. When adding a new entity with mutations, wire up `diffChanges` in its `actions.ts` following the pattern in existing action files.

**When adding a new editable Staff field**, also add it to `ALLOWED_FIELD_NAMES` in `app/(dashboard)/admin/permissions/field/actions.ts` and to `FIELD_GROUPS` in `app/(dashboard)/admin/permissions/field/page.tsx` so it appears in the permissions UI and can be granted to divisions.

## UI feedback conventions

Feedback must appear as close to its cause as possible:

- **Field-level problems → inline.** Required-but-empty, wrong format, etc. render as red text directly under the field (react-hook-form resolver + `FormField` error). Never a toast for something a field can show itself.
- **Modal (dialog)** — for actions the user must explicitly confirm (destructive, irreversible) or events they must understand before continuing.
- **Toast** — only for quick transient outcomes with no specific element to attach to: save success, unexpected server error.

## Errors: never swallow one

An action that fails must leave two traces — a Ukrainian sentence for the person
and an entry somebody can debug from. Before `lib/log.ts` existed there was only
the first, and «Помилка при збереженні» with no stack anywhere made a support
report unactionable.

- **Never show an error code, a digest or an id to a user.** They cannot act on
  it, and it makes an ordinary failure look alarming. A message says what failed
  and what happened to their work — «Не вдалося зберегти. Зміни не застосовано» —
  so they know whether to try again. Support traces an entry by `userId` and
  time, which every log line carries.
- **Write failures → `parseDbError(e, 'Ukrainian message', 'scope.action', { userId })`.**
  It splits the two cases by itself: P2002/P2025/P2003 are the person doing what
  the data forbids, so they get a specific message and are **not** logged;
  anything else is a defect and gets the stack, the scope and the caller's id in
  the log, while the person just gets the sentence.
- **Anything else you catch → `logError(scope, e, context)`** before returning a
  message. A bare `} catch {` that returns a string is how SMTP stayed broken
  with nobody knowing.
- **`logWarning`** for what nobody is blocked by and no id is needed — a failed
  invite mail, a backfill that did not run.
- Scope names the operation, not the file: `staff.archiveStaff`, `rating.closeYear`.
  It is what you grep when the report is «archiving is broken».
- Output is one JSON line per entry to stdout, which the container runtime
  already collects. There is no error table and no external service — if
  support gets painful, an `ErrorLog` model plus a small admin page is the next
  step, deliberately not an outside dependency.

## Key conventions

- **Commits: always use the `commit` skill (`/commit`)** — never compose raw `git add`/`git commit` commands yourself
- Import alias `@/*` maps to project root (e.g. `@/lib/db`, `@/components/ui`)
- App Router only — no Pages Router
- Server Actions for all mutations — no separate REST API layer
- Zod schemas are the single source of truth for validation — shared between client form and server action
- Role checks in server actions and queries, never only in components
- All UI text in Ukrainian — no hardcoded Ukrainian strings in logic files, only in components
- Add tests whenever practical — colocated, not in a separate test directory
- `lib/utils.ts` — `cn()` and shared utilities (shadcn convention, do not move)

## Tailwind v4 + shadcn conventions

- No `tailwind.config.js` — configure via `@theme` directive in `app/globals.css`
- Use Tailwind utility classes; avoid arbitrary values (`[value]`) when a standard utility exists
- Follow shadcn/ui patterns for all base UI components
- PostCSS plugin: `@tailwindcss/postcss`

## Next.js 16 notes

This is Next.js 16 with React 19 — APIs and conventions differ from older versions. Before writing any routing, data-fetching, or caching code, check `node_modules/next/dist/docs/` for current behavior. Do not rely on pre-2025 Next.js knowledge.

`proxy.ts` (Next 16's rename of `middleware.ts`) is an **optimistic gate only**: it checks that a session cookie exists and nothing more. It deliberately does not call `auth()`, because it runs on every route including prefetched ones and `lib/auth.ts` re-reads the Staff row on each call — that cost a query per prefetched link. Next's own auth guide says the proxy "should not be your only line of defense".

**The real check is per page and per action.** Every page starts with `if (!session) redirect('/login')` and every server action re-checks role and permissions. Keep doing both:

- **New public (unauthenticated) route** → whitelist it in `proxy.ts`, otherwise visitors are bounced to `/login`.
- **New authenticated page** → start it with the `auth()` + `if (!session)` guard. The proxy will not do it for you.
- **New `/api` route** → the proxy matcher excludes `/api` entirely, so it must authenticate itself (see `app/api/export/ratings/route.ts`).
- `/login` is intentionally not gated on the cookie — a stale cookie would ping-pong against the dashboard's own redirect. `app/(auth)/login/page.tsx` checks the verified session instead.

## Tailwind v4 notes

Tailwind v4 has no `tailwind.config.js`. Configuration (custom colors, fonts, spacing) is done in `app/globals.css` using the `@theme` directive. The PostCSS plugin is `@tailwindcss/postcss`.
