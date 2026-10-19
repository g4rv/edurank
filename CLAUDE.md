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

**A person is archived, not deleted** (`Staff.archivedAt`). Deleting
cascades their activities and rating entries, closed years included, and those
numbers are final university records. Two ordinary cases decided this: someone
who leaves and returns years later must find their history intact, and someone on
декретна відпустка must drop out of the current rating while every past result
stays. `archiveStaff` / `restoreStaff` are how a person leaves and returns, and
the `STAFF DELETE` entity permission governs them.

**One exception: `deleteStaff`, ADMIN only, and only from the archive** (owner,
2026-10-08). Two layers: archiving is the bin, deleting empties it — an active
person is refused and the button is not drawn. For a record that should never
have existed — a duplicate above all, where the archived twin still holds the
email. It is not behind the entity permission: an editor's `STAFF DELETE` means
«archive». Refused for one's own record; the last-admin question never arises,
because archiving already refuses the last active admin. A person who authored a
`ScienceWork` or uploaded a science file cannot be deleted (required FKs, no
cascade) and stays in the archive.
Leaving a `ScienceRecordFile`'s R2 object behind on delete is known and not
cleaned up.

**An email is one spelling.** Typed in any case, folded to lower case by the
schemas (`validations/staff.ts`, login, forgot-password) before it reaches the
server; `Staff.email` is `@unique` but Postgres compares case-sensitively, so
`createStaff` / `updateStaff` also refuse a duplicate with `emailTaken`
(`lib/queries/email-taken.ts`, archived rows included). `updateStaff` leaves a
stored address untouched when the new one differs only in case, so a phone-number
save never rewrites it. Rows saved before 2026-10-08 may still hold capitals —
`emailMatches` still looks up case-insensitively for them. There is **no
`lower(email)` unique index yet**: it needs every existing case-duplicate gone
first, so it is a follow-up migration.

**Diplomas are a list, stored as `Diploma` rows** (owner, 2026-10-10; a JSON
column `Staff.degrees` until 2026-10-15, moved by migration `20261015120000`).
Any number per person, in their own order (`position`), edited with «Додати
освіту». The form, the audit and the field grant still call the list `degrees`:
every save lifts it out of the Staff payload AFTER the permission filter
(`takeDiplomas`, like the certificates) and replaces the person's rows inside
the transaction (`writeDiplomas`, `lib/staff/diplomas.ts`) — a `degrees` key
left in a Staff update names a column that no longer exists. Read them with
`diplomas` selected and `degreesOf(row)`. The six `candidate*` / `doctor*` columns are its
**mirrors**, written on every save (`mirrorsForUpdate` → `deriveDegreeColumns`):
the best doctor-level and the best candidate-level record, a record marked as
matching the кафедра first, otherwise the most recent. The rating, the lists and
the filters keep reading the columns, so no rating point moves; п.5's
`degreeDefenceDate` is the newest defence of ANY diploma. Nobody writes the six
columns directly — the field grant is `degrees`.

**Basic education is entries of that list** (owner, 2026-10-14): one kind,
«Базова освіта» (`basic_education` — бакалавр / магістр / спеціаліст are NOT told
apart), any number of entries. Its two old columns `basicEducationMatch` /
`basicEducationSpecialty` are mirrors too (`deriveBasicEducationColumns`): rating
1.9 pays when ANY entry matches the кафедра. The date on such an entry is the
diploma's issue date, never a defence — `newestDefence` skips it, so it cannot
open п.5's window. A person who had the old fields got one entry by migration
`20261014140000` (no date); the two old field grants became `degrees`.

**A diploma carries its papers** (owner, 2026-10-15): `issuedBy` («Ким
виданий»), `series`, `number`, and by kind: a **basic education** has
`basicLevel` (бакалавр / спеціаліст / магістр, `BASIC_LEVELS`) and its one date
is the issue date; a **candidate / doctor** has `topic` («Тема наукової
роботи») and an `issueDate` BESIDE the defence date — both kept, because п.5
turns on the defence (owner, 2026-10-15). The server drops a key the kind cannot
have. Information only: 1.9, 1.3 and п.5 read the same columns as before, and a
level is NOT a degree key (`degreeLevel('master')` is null). Series and number
are visible like the rest of «Освіта» (owner, 2026-10-15).

**Every field of a diploma is mandatory except the серія and «відповідає
кафедрі»** (owner, 2026-10-15), and a degree's diploma is never issued before its
defence. One rule, `diplomaGaps` (`lib/staff/academic.ts`), serves the popup
and the save. The SERVER refuses only a NEW or CHANGED entry
(`hasIncompleteDiploma`, via `diplomaRefusal` in all three saves): an entry
saved before the papers existed comes back untouched with every profile save,
and refusing it would block a phone number. Touching such an entry at all —
even the tick — makes it changed, and then it must be complete. Its card shows
«Заповніть усі поля диплома» until then.

**A diploma's date is mandatory and never in the future** (owner, 2026-10-14). The
popup refuses an entry with no date, and its picker and `validations/staff.ts`
stop at today (Kyiv). An old dateless entry is grandfathered like the papers
above — the server refuses it only once it is changed.

**An administrative (non-НПП) account edits its phone and nothing else** on
`/profile/edit` (owner, 2026-10-10; the photo comes later). The research
profiles and the academic fields are dropped on the server too
(`RESEARCH_PROFILE_FIELDS`, `ACADEMIC_EDITABLE_FIELDS`).

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
- **All of a division's rights are edited in one place** (owner, 2026-10-12): `/divisions/[id]` — name, the switches, entity actions and field access — with one Save (`updateDivisionSettings`), ADMIN only, audited as one entry. The former «Поля доступу» / «Дії доступу» screens and `/divisions/[id]/edit` are gone.

**Account switches (owner, 2026-10-12).** Three booleans on `Division`, set by
ADMIN on the division settings page, audited like the others, all `false` until
ticked: `canInviteStaff` («Надсилання запрошень»), `canSetPasswords` (set a
password **and reset one** — one switch covers both) and `canEndSessions`
(`forceLogout`). Like `canModerateRating` and `canOverseeScience` they are
columns, not entity rows.

- **An editor reaches only `USER` records.** `accountGrantsFor` in
  `lib/permissions.ts` returns the switches for a caller and a target; it is the
  only door. Without the `USER`-only rule «set pass» would be an account takeover
  of an admin or another editor. An editor therefore never acts on themselves.
- **An editor sets a password by hand only for a never-activated person**
  (owner, 2026-10-12; `passwordHash` is null). For an activated person — who may be
  a завідувач, a декан or hold other power — they use «Скинути пароль», which mails
  the person a link. ADMIN may set one for anyone.
- **No credential action on an archived person, ADMIN included** (owner,
  2026-10-12): invite, reset, password by hand, end sessions and unlock are
  refused — an archived account cannot sign in, so a letter is useless and a
  set password would survive a restore. Restore the person first. The buttons
  are not drawn, and `/forgot-password` sends nothing but answers as usual.
  `changeRole` is not a credential action and is unchanged.
- **Stay ADMIN-only:** `unlockLogin`, `changeRole`, bulk invite
  (`/admin/invites`, the invite checkbox on `createStaff`). Archive is still
  `STAFF DELETE`, not a switch.
- **Activation is visible to editors, heads and деканs** («Не активований»
  pill, the badge on `/staff`, `/my-department`, `/my-faculty`). Seeing it is not
  doing anything: heads and деканs get no buttons. Role and ставка stay
  ADMIN-only.

## Stack

**Current:**

- Next.js 16.2.10 (App Router, React 19)
- TypeScript (strict mode)
- Tailwind CSS v4 — configured via CSS `@theme` directive, no `tailwind.config.js`
- ESLint with `eslint-config-next`

**Auth:** Email + password, no OAuth. NextAuth v5 credentials provider with **JWT sessions — no database adapter**. The `jwt` callback in `lib/auth.ts` re-reads the Staff row on every call so role changes and the `tokenVersion` kill-switch (`forceLogout`) take effect immediately.

**Letters are limited** (owner, 2026-10-12): per person, one per 60 s and three
per 6 h, counted from the `MailSend` table by `lib/mail/allowance.ts`. This covers
every emailed link — invite and reset, including `/forgot-password`. ADMIN is
exempt. A row is written only **after the mail server accepted** the message, so
a failed send costs nothing. `/forgot-password` skips a limited request silently
(no enumeration) and its page text states the rule.

**Scale:** ~300 staff, tens of editors, a couple of admins.

**Design direction:** «Аврора» — glass and a colour wash over the university's own
`#4472C4`, Manrope, card-based. **The rules live in `docs/aurora.md` — read it
before touching any UI, and change it there rather than deciding per screen.**
shadcn/ui remains the component base. All UI text in Ukrainian.

The strict monochrome rule below is being superseded by that document as Аврора
rolls out: chrome is still neutral, but `--brand` now marks the primary action,
the active tab and nav item, links and one accent figure.

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

- **`--success`** — ok / verified / valid (activation done, «Перевірено», a valid DOI/ISBN)
- **`--warning`** — pending / needs attention (not activated, «не вказано», «Сумісник»)
- **`--error`** — destructive / error (delete, discard)

**Always the token, never a Tailwind palette class.** There were 160 hardcoded
`green-*` / `amber-*` / `red-*` classes before these tokens existed, in a dozen
shades that did not agree. Each status is a PAIR — `--x` for the text and
`--x-surface` for the tint it sits on — and red text on a red tint takes
`text-error-strong`, because `--error` measures 3.98 there, under AA. The whole
palette is rendered with live values at `/admin/style-guide`; the rules are
§3 of `docs/aurora.md`.

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
pnpm test             # Vitest (1298 tests, colocated next to what they cover)

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
# The Характеристика's 2022–2024 backfill travels the same way and for the same
# reason — `import-kharakterystyka-2022-2024.ts` reads edu-reference/, which the
# server does not have. NOT a seed: it touches one table, matches people by
# email, replaces only IMPORT rows and never a MANUAL one.
pnpm data:export-kharakterystyka   # here: writes kharakterystyka.json (gitignored)
pnpm db:import-kharakterystyka     # there: reports; --apply to write
pnpm db:seed:test     # DESTRUCTIVE: wipes people, structure and templates, then builds
                      #   a small complete university you can click every button in.
                      #   Refuses a populated database unless you pass --force.
# The bare command is the safe one on purpose — `prisma db seed` also runs as
# part of `pnpm db:reset`, which people type without thinking.

pnpm db:create-admin  # interactive: the first ADMIN account (db:seed makes none)
pnpm db:reset         # prisma migrate reset --force (wipe + reapply, dev only)
pnpm db:fix-rounding  # one-off repair: re-round RatingEntry totals to 2 decimals
pnpm db:gate-to-check-sum  # one-off: convert retired GATE indicator rows to CHECK_SUM
# The three below all report by default and write only with --apply. Each one
# reaches EVERY template, which `pnpm db:seed` cannot — it upserts 2026 alone,
# and production is never seeded again.
pnpm db:patent-kind   # one-off: give 3.25 its «Вид патенту» select and route
                      #   п.2 by it; lists patents that still name no kind
pnpm db:science-catalogue  # how PRODUCTION gets Додаток III: creates the
                      #   2026/2027 рік and any missing вид роботи, CREATE-ONLY —
                      #   never updates or deletes a row an admin edited. Not the
                      #   seed: db:seed would overwrite the rating indicators.
pnpm db:book-sheets  # one-off: rating 3.7 / 2.2 typed in друкованих аркушах, not
                      #   pages. Converts the field, sets 1,5 minimum on монографія,
                      #   and converts + RE-SCORES the open year's entries (pages ÷ 24
                      #   to 0,1). Closed years untouched. Report first; --apply.
pnpm db:lecturer-gate  # one-off, after migrate deploy: 5.1 «Я лектор» — the new form, no
                      #   points, opens the rest of the rating; its saved entries kept and
                      #   re-scored to 0; every open-year total recomputed (those with no
                      #   5.1 go to 0). Report first (runs and rolls back); --apply.
pnpm db:intl-publication  # one-off: the new 3.10, and 3.10–3.25 → 3.11–3.26 in every open
                      #   year. No entry or score moves. Report first; --apply.
pnpm db:science-sheets-decimals  # one-off: «Кількість друкованих аркушів» takes ONE decimal
                      #   (1,7, never 1,73) in every planning year. Report first;
                      #   --apply writes. Saved works with two decimals are only listed.
pnpm db:science-conference-yearly  # one-off: «Участь у конференціях» ONCE →
                      #   YEARLY (D25). The наказ caps it at 5 per рік, and a
                      #   ONCE key carries no year — so the same annual
                      #   конференція could never be attended twice.
pnpm db:kharakterystyka-cleanup  # one-off: drop imported «evidence» that
                      #   evidences nothing («Так»/«Ні», a bare role) and strip
                      #   the «Оберіть …:» prompts. --bare also drops the
                      #   subjectless fragments. See docs/kharakterystyka.md.
pnpm db:kharakterystyka-drop-moodle  # one-off: rating 5.1 feeds NO Характеристика
                      #   position (owner, 2026-10-19 — linking it to п.4 was a
                      #   mistake). Unlinks 5.1 in every year, the closed 2025 too,
                      #   and hides the imported 2022–2024 «5.1» lines so a
                      #   re-import cannot bring them back. Names who drops out
                      #   of Кнпп. Report first; --apply.
pnpm db:bib-placeholder  # one-off: put the ДСТУ example into every
                      #   «Бібліографічний опис» box; refreshes stale wording
pnpm db:import-students  # one-off: load lib/students/accepted-<year>.json into
                      #   AdmittedStudent. --apply to write, --year for another
                      #   campaign. Adds only, never removes. NOT a seed — this
                      #   is how PRODUCTION gets the реєстр, because the JSON is
                      #   in git and edu-reference/ is not.
pnpm db:clean-student-names  # one-off: take the birth dates out of ПІБ in
                      #   AdmittedStudent. The first import carried the ЄДЕБО
                      #   «Вступник» column («ПІБ 16.05.1985») into 781 rows;
                      #   the parser strips it now, this catches up what went in
                      #   before. Refuses to touch a row a StudentClaim names.
pnpm tsx prisma/check-academic-mirrors.ts  # after the 2026-10-06 academic-info
                      #   migrations: the old academicRank / scientificDegree /
                      #   degreeDefenceDate / adminPosition columns must equal what
                      #   the new fields derive. Expect «розбіжностей: 0».
pnpm db:headship-admin-position  # one-off, on that deploy: rating 1.6 now pays
                      #   a завідувач / декан for being named on the кафедра /
                      #   факультет. Reports who moves (~36 on prod); --apply writes.
                      #   Order: back up → migrate deploy → mirror check → this.
pnpm db:import-aspirants  # the аспіранти list into Aspirant + their керівники
                      #   (matched to НПП by surname ±1 letter AND initials; the
                      #   rest reported, never guessed). Report first; --apply
                      #   writes; --apply --pick ALSO switches п.12 to the select
                      #   (off until a complete list is in). Re-run with every
                      #   new list — upserts, never doubles.
pnpm db:generate      # prisma generate (run after any schema change)
pnpm db:studio        # Prisma Studio at localhost:5555

pnpm staff:build      # rebuild staff-roster.json from edu-reference/ (gitignored output)
pnpm aspirants:build ["<docx>"]  # lib/aspirants/aspirants.json from the
                      #   аспірантура's list (no birth dates); commit it, then
                      #   db:import-aspirants on the server
pnpm students:build   # rebuild lib/students/accepted-2026.json from the ЄДЕБО export
                      #   AND the transcribed contract накази (students_specialties.xlsx)

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
      rating/                     ← rating years: activate / clone / close / reopen
        [year]/                   ← per-section indicator editor
      stakes/                     ← redirects to /stakes (merged 2026-08-12)
        norms/                    ← додаток 5's норматив table + the year's contract coefficient
      science-plan/                ← ADMIN: planning years — create/clone/open/close
        [id]/                     ← the Додаток III catalogue editor for one year
      invites/                    ← bulk «надіслати запрошення» over people with no password
      rating-debug/               ← service page: renders every evidence form (no nav link)
      design/                     ← service page: design concepts (no nav link)
      audit-log/
    staff/                        ← ADMIN + EDITOR (НПП + non-НПП unified list); create
                                    is a dialog on the list, not a route — see faculties/
      [id]/
        edit/
        rating/                   ← the staff member's rating tab
        kharakterystyka/          ← their Характеристика (п.38 licence positions)
        science/                  ← their наукова робота, read-only — ADMIN + «Перевірка науки»
    faculties/                    ← [id]/, [id]/edit/; create is a dialog on the list
                                    (`CreateFacultyDialog`), not a `new/` route — same
                                    move as staff's, 2026-09-21, followed here 2026-09-29
    departments/                  ← same shape; [id]/stakes/ redirects to /stakes/[id]
    divisions/                    ← same shape; create/delete is ADMIN-only. [id]/ is the
                                    division's SETTINGS page (name, switches, entity and
                                    field rights, one Save) — no [id]/edit/, no
                                    admin/permissions/; the old URLs redirect
    profile/                      ← own profile (personal data only)
    achievements/                 ← USER: «Мій рейтинг» + submission forms
      [section]/                  ← add an activity from section 1–5
      students/                   ← «Мої залучені здобувачі» — own StudentClaim list
      kharakterystyka/            ← own Характеристика
    science-plan/                 ← НПП: their own план наукової роботи (Додаток III)
    moderation/                   ← ННВ + ADMIN: discard self-reports, verify publications
    division-data/                ← EDITOR: their division's direct-entry grid
    rating/                       ← ADMIN + EDITOR: university-wide rollup
    science-plans/                ← ADMIN + «Перевірка науки» division: every кафедра's plans
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
- **5.1 comes first and scores nothing** (owner, 2026-10-16). Its form opens
  with «Я лектор»; nothing else is drawn until it is on, and then the вид
  роботи, дисципліна, посилання and at least one матеріал are required
  (`requiredWhen: { field, checked }` — see `FieldCondition`). Saving it
  either way OPENS THE REST OF THE RATING: until an НПП has an entry of every
  `ActivityType.gatesRating` indicator of the year, `createActivity` /
  `deleteActivity` refuse every other indicator, the section pages show
  `RatingGateNote`, and `recomputeRatingEntry` writes their year as 0 —
  division-entered points included (`lib/rating/rating-gate.ts`). Its own rows
  read «✓ Виконано» / «Не заповнено», never a number (`GateMark`), in every
  list, the sidebar, moderation and the Excel form. A closed year's snapshot
  freezes the same rule (`blocked`). Order: the science plan, then 5.1, then
  the rest. The cross-person lists (/rating, dashboard) still show its column
  as 0.
- **A box can be required only in some state of the form** — `requiredWhen` on
  any kind: `{ field, in }` (a select's answer), `{ field, checked }` (a switch;
  the box is also hidden and dropped while it is off) or `{ field, empty }`
  (another box left empty — 3.10's «DOI or ISSN»). `schemaForFields` enforces
  it; on a checkbox it means «at least one of the group». `hide: true` on `in` /
  `empty` also hides the box while unmet and drops its value — 3.10's article
  link is not drawn once a DOI is given (owner, 2026-10-19).
- **A book is typed in друкованих аркушах, not pages** (owner, 2026-10-16). The
  page-based indicators (3.7 монографія, 2.2 видання) ask «Друкованих аркушів»
  (`sheets`, one decimal) and «Кількість співавторів». The person's share is
  `personalSheets` — sheets ÷ co-authors, rounded to 0,1 — and it is what is
  scored and what Характеристика п.3 judges. A монографія's share must reach
  `scoring.minShare` (1,5); 2.2 has no floor. A row saved before carries
  `pages` and is read as pages ÷ 24 until `pnpm db:book-sheets` converts it.
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
which is додаток 2 on screen. **A декан sees neither** (owner, 2026-09-24 — they
used to read every grid of their faculty): both pages gate on `headOf`, and
«Мій факультет» (`/my-faculty`) shows no fund. It DOES show the saved ставки
(owner, 2026-10-02, reversing 2026-09-24): a total per кафедра on «Кафедри» and
the Ставка column on each кафедра's page — read-only, the head's own split.

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
  then spends, so the head is not the one confirming it. A head still READS
  `/my-department/students` — the duplicate list is context for their own ставка
  grid — and `canDecide` there is `isAdmin` alone. **A декан does not see this page**
  (owner, 2026-09-24): it gates on `headOf`. Since 2026-10-02 a декан does see
  the saved ставки on «Мій факультет», read-only.
- **`StakeStatusBonus` is information, never money.** The grid shows what somebody's
  positions and recruited students add up to; the head still types the ставка.
- **A person's Мін/Макс is per кафедра, not per person.** `StaffStakeLimits` carries
  a `departmentId`, and the additional кафедра never inherits the primary one's
  bounds — the lookup is scoped and the fallback is `PART_TIME_LIMITS` (0,10–0,25),
  not `DEFAULT_LIMITS`.
- **A ставка is kept when somebody's «Основне» is flipped** (owner, 2026-10-08,
  reversing 2026-08-26). Turning the switch off, or swapping which кафедра is the
  main one, used to delete the head's ставка and Мін/Макс silently. Now only a
  кафедра the person has LEFT stops paying them; on one whose kind changed the
  stale explicit bounds go and exactly enough of a new Макс is written to cover
  the kept rate (never lower, never more than it needs). It is audited as
  `raisedLimits`.
- **ADMIN may type any ставка, with no upper limit — the Макс moves up to meet
  it** (owner, 2026-10-08). `seedAllocations` no longer refuses one above the
  ceiling: it throws `LimitRaiseNeeded`, the whole save rolls back, and the form
  asks «Підвищити максимум ставки?». Only a re-send with `confirmRaise` raises
  anything — the server decides, the popup is not the guard. The floor is still
  refused and nothing ever lowers a Макс.
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

**Any line can be removed — final — by ADMIN, or by the НПП on their own**
(2026-10-06). An open year's rating line is deleted from the rating too; a
closed year's is only hidden (`KharakterystykaRemovedLine`); an imported one is
hidden (`removedAt`) so a re-import cannot bring it back. The table is
«Removing a line» in `docs/kharakterystyka.md`.

Which indicators satisfy which position is `ActivityType.licencePositions`, a JSON
column and not a list in code — for the same reason `requiresVerification` and
`entityFirstEntry` are columns: a code list silently excludes every indicator an
admin builds themselves, and the вчена рада votes new ones in yearly.

## Планування наукової роботи (built)

Full specification: `docs/superpowers/specs/2026-09-15-science-plan-design.md`.
Наказ №152's Додаток III: an НПП plans **≥500 годин of наукова робота per
ставку per навчальний рік** (pro-rata below a full ставка), split across 18
printed items, each catalogued as a `ScienceWorkType`. **план** (the target
and the rows a person intends) and **факт** — a `ScienceRecord`, what one
person draws from a `ScienceWork`'s pool, with evidence and post-check
moderation — are both built. Only the official export form (D19, no sample
supplied) and the Crossref DOI check (optional, later) are not.

**This is not the rating.** The rating scores achievements in **балах** with
its own coefficients, to rank people. Додаток III prices the same real-world
work in **годинах**, to fill a workload quota — two measuring systems over one
world, D3's fully separate tables, sharing only the scoring engine and
evidence-field machinery lifted out of `lib/rating/`.

Easy to get wrong:

- **Hours are INTEGER HUNDREDTHS OF AN HOUR, never a float** — the same rule
  `lib/stake/units.ts` enforces for ставки, applied to `plannedHundredths`,
  `hoursHundredths` and `totalHundredths` alike. `toHundredths` freezes the
  value at save; editing the наказ later never rewrites a row already saved.
- **The ставка behind a plan's target is the PER-КАФЕДРА one from
  `StakeAllocation`, never `Staff.employmentRate`.** A сумісник on two кафедри
  has two plans, each targeted by its own share. `SciencePlan.rateHundredths`
  refreshes from the кафедра's розподіл while the template is OPEN; `null`
  means **no target shown at all**, not a guessed one (D8). A plan **locks**
  on submission (`lockedAt`) — факт can only be recorded against a locked plan.
- **One `ScienceWork` per identity, `dedupKey` UNIQUE.** `identityFields`
  (doi, link, title, in priority order) build the key — `link` is the RECORD's
  own «Посилання на роботу» (`lib/science/identity.ts`), so a type never asks
  for the same address twice; `ONCE` carries the навчальний рік and `SHARED` no
  person-prefix, so the SAME article can never be entered twice
  university-wide. A second person who tries it is told who has it and to
  agree the hours with them (`ExistingWorkPanel`) — **nobody joins a work by
  themselves** (owner, 2026-09-30, replacing D17's «Приєднатися»).
- **The pool is divided by the AUTHOR, not by whoever types fastest**
  (owner, 2026-09-30). `ScienceWork.totalHundredths` is the whole pool a
  `SHARED` type divides. Whoever enters the work names its co-authors from the
  НПП list and the hours each gets; **the author's own share is what is left
  and is never typed**. `lib/science/coauthor-store.ts` writes it: a co-author
  with a SAVED plan gets a `ScienceRecord`, one without gets a
  `ScienceCoauthorShare` (a reservation that counts against the pool the same
  way) which `lockPlan` turns into a record the moment they save the plan.
  Only the author (or ADMIN) changes the list afterwards, with
  `updateCoauthors` — a co-author cannot move their own share, nor delete
  their record (owner, 2026-10-02): one named by mistake asks the author to
  take them off. `@@unique([staffId, workId])` stops
  the same person holding a work twice. Every SUM over `hoursHundredths`
  filters `status: 'APPROVED'`, and every pool arithmetic counts reservations
  too (D20, ННВ/ADMIN decline a record with a reason, post-check not a gate).
- **D27 — a record needs at least one of link or file, never neither.** The
  link lives on the WORK (one DOI, not one per co-author); a file
  (`ScienceRecordFile`, in R2) is proved by re-sniffing and re-hashing the
  STORED bytes, never the browser's own claim, and its SHA-256 is **UNIQUE
  university-wide** (D28) — the same evidence can back only one work, ever.
- **The file goes up BEFORE the record is saved.** `presignUpload` needs no
  work — `objectKeyFor` names only the навчальний рік — so `saveRecord` takes
  an `{ objectKey, fileName }` it verifies from the stored bytes and attaches
  in the same transaction that creates the work. The old order (key contained
  the workId, so the upload waited for the record) made a file-only record
  impossible and a failed upload unrecoverable. Every refusal after the
  verification drops the object; an abandoned pick is swept by `discardUpload`.
  **The R2 bucket needs a CORS rule or nothing uploads at all** — see
  `docs/deployment.md` §3a and `pnpm r2:cors`.
- **Correcting is an edit, not a delete-and-retype.** `updateWorkEvidence`
  recomputes the pool from the evidence and moves the AUTHOR's draw with it
  (what the co-authors and reservations leave — never the editor's, who may be
  an ADMIN with no record); what it refuses is a pool that leaves the author
  nothing. Measuring against every claim, the author's own included, refused
  the two commonest corrections there are.
- **The author deleting their record deletes the WHOLE WORK** (owner,
  2026-09-30): every co-author's record, every reservation and its files. The
  co-authors' hours were the author's to give and nobody else can move them, and
  the work's `dedupKey` would block the article from ever being entered again;
  `DeleteRecordButton` warns the author, by number, first. **Only the author
  deletes** (owner, 2026-10-02, reversing «a co-author withdraws their own
  record»): a co-author has no bin and `deleteRecord` refuses them with
  `COAUTHOR_CANNOT_DELETE`. (An INDIVIDUAL work goes with its owner for the same reason: D24
  prefixes its key with their `staffId`, so it guards nothing else.)
- **A co-author may count their share in the NEXT навчальний рік** (D55,
  owner 2026-10-02 — the boss's proposal, amending D30's «no splitting across
  years»). Only a co-author, never the author; only on a SHARED work; only
  while its year is open; and only when its date (the стаття's publication
  date, otherwise the day it was entered) falls January–August of the year the
  рік ends in — spring 2027 can go to 2027/2028, autumn 2026 cannot
  (`deferralYear`, `lib/science/count-year.ts`). The share becomes a
  `ScienceCoauthorShare` with `academicYear` set and turns into a record in
  that year when the person saves its plan — so **a record's `templateId` may
  differ from its work's**. Never re-entered next year.
- **…or say it was already counted in the PREVIOUS рік** (owner, 2026-10-07).
  Science began in the app with 2026/2027, but 2025/2026 was reported on paper,
  and an article from January–August 2026 belongs to both. A co-author (never
  the author, SHARED only, year open) may mark their share «Вже зараховано у
  2025/2026» when its date falls January–August of the year the рік STARTS in
  (`earlierYear`, the mirror of `deferralYear`). The share becomes a
  reservation marked with the past рік, which never opens — so it counts
  nowhere, keeps its hours in the pool, and the author's and other
  co-authors' hours do not move. «Повернути» undoes it while the year is open.
- **A decline is of the WORK, not of one record** (owner, 2026-09-30). The proof
  is shared, so when it is wrong nobody counts until it is fixed:
  `removeScienceRecord` switches off EVERY record of the work and stamps
  `ScienceWork.declinedAt` — the same moment it writes into each record's
  `removedAt`, which is how a resubmit or an undo restores exactly those and not
  a record somebody withdrew earlier. The author (or ADMIN) fixes the link or
  file and presses «Надіслати на повторну перевірку» (`resubmitScienceWork`): it
  counts again **at once**, marked «Виправлено» on /moderation, and ННВ may decline
  it again — not an approval step, the app has none for science. What gets fixed
  is whatever the reason names: the link, the file **or the co-authors** (a valid
  one the author left out is a real reason). `updateCoauthors` therefore works
  while a work is declined, and everyone it adds joins switched off under the
  same stamp (`WorkRef.declined` in `coauthor-store.ts`), counting only on the
  resubmit. Co-authors are told whom to ask and cannot fix it. ННВ can never
  remove a record, only decline it; `closeScienceYear` is what drops a work still
  declined when its рік closes, with its files.
- **Oversight is a division switch, «Перевірка науки»**
  (`Division.canOverseeScience`, D43), read by `canOverseeScience()` in
  `lib/science/oversight.ts`; ННВ has it by migration. Never match ННВ by
  `registryKey` for this again. Only ADMIN and that division see
  `/science-plans`, decline records, open other people's files and reopen a
  submitted plan (`unlockPlan`), and read one НПП's plan and records on the
  record tab `/staff/[id]/science` (owner, 2026-10-05). **A завідувач and a
  декан see no science data at all** (D44) — `/my-department/science-plans` was removed.
- **The fact owes `max(план, 500 × ставка)`** (D37, `doneTargetHundredths`);
  the plan itself is still measured against the norm — and **cannot be saved
  below it** (D52, owner 2026-09-24): `lockPlan` refuses, the dialog disables
  «Так, зберегти». A draft under the norm is fine; a submitted one is not.
- **The rating waits for a saved plan** (D56, owner 2026-10-05). «Розділ 1–5»
  show «Спершу збережіть планування…» until EVERY кафедра the НПП is on has a
  `lockedAt` plan in the open навчальний рік, and `createActivity` /
  `deleteActivity` refuse the same way — `planGate` in
  `lib/science/plan-gate.ts`. No open science year means no gate. **No ставка,
  no planning**: «Запланувати роботу» is disabled and `savePlanRow` refuses a
  NEW row (an edit still saves); the header says why (`NO_RATE_DETAIL`). Such a
  person stays blocked from the rating until the завідувач distributes.
- **Link and file are two separate rules per вид роботи** (D47,
  `ScienceWorkType.linkRule` / `fileRule`: REQUIRED / OPTIONAL / NONE, set by
  ADMIN). Only when neither is REQUIRED must one of the two be given; a proof
  on a NONE side proves nothing and is refused on save. **Five types are link
  REQUIRED, file NONE** (owner, 2026-09-30, after reading the наказ's «Форма
  звітності»): the дисертація, both п.3 books and the two п.10 editorial
  types. **The стаття is link OR DOI, at least one** (owner, 2026-10-02): link
  OPTIONAL, file NONE, and a filled DOI counts as a proof (`doiProof` in
  `lib/science/evidence-rule.ts`). The DOI stays its own field and the link
  box REFUSES one (`linkProblem`) — pasted as a link, the same DOI keyed as two
  works and the article went in twice. `pnpm db:science-link-isbn` carries the
  rule to existing databases and moves a DOI already saved in a link box into
  the DOI field. Every other type is link OR file, at least one — a
  certificate, order or review is a document, and a person holds it as a PDF as
  often as a URL. `requiresFile` no longer exists. **Both NONE = no
  proof needed** (D53, owner 2026-09-24): п.12 «Керівництво аспірантами» is
  recorded by the аспірант's ПІБ alone; «never neither» holds everywhere else.
  **That ПІБ is to be CHOSEN, not typed** (owner, 2026-10-07): `pickFrom:
'aspirants'` on the group's first field draws one select of the аспіранти
  the НПП supervises by the аспірантура's list (`listMyAspirants`), and
  `saveRecord` / `updateWorkEvidence` refuse anyone else's
  (`pickedPersonProblem`). **Built but switched OFF** until a complete list
  is in — the first left out the first year; `db:import-aspirants --pick`
  turns it on. The stored answer is the three name fields either way, so a
  record typed before keeps its key and text, and stays editable.
- **A record PROVES the work; it does not track when it was done** (D50,
  owner 2026-09-24). The execution month (D41/D48/D49) is **hidden, not
  removed**: `SHOW_EXECUTION_PERIOD` in `lib/science/execution-month.ts` is
  `false`, so nobody picks a month, «Виконано» is grouped by пункт like «План»,
  and `saveRecord` stamps the month of saving into the NOT NULL
  `executedMonth`. Flip the constant to bring the picker, the month headings,
  the month on /moderation and ⚙ «Останній місяць» back — every stored row
  stays valid. Month maths only through that file, which reads Kyiv time.
- **The стаття's «Опубліковано/Проіндексовано» refuses old publications** (D51).
  `publishedOn` is a `date` evidence field with `rule: 'currentYear'`: from
  1 January of the current CALENDAR year (Kyiv) to today — in 2026 a 2025
  article is refused at once, by the picker and the schema alike
  (`currentYearBounds`). A value already saved is not re-judged on edit. A
  faked date inside the window is ННВ's to catch. Never one of the type's
  `identityFields`, so a typed date cannot make one article look like two.
- **A file is changed by whoever entered the work or uploaded it; a record's
  only proof is swapped with `replaceFile`, never deleted first** —
  `deleteFile` refuses it and names «Замінити». (D46's «every co-author
  changes their own share» is retired: `updateRecordHours` and «Моя частка» no
  longer exist — see the pool bullet above.)
- **A book's ISBN is required only for a монографія / підручник and for a
  перевидання, never for a посібник** (owner, 2026-09-30): the field carries
  `requiredWhen: { field: 'option', in: ['monograph'] }`, which `schemaForFields`
  enforces because the select is in the same object.
- **The record form reads: name → kind → link → details → co-authors** (owner,
  2026-09-30). `splitAtLink` (`lib/science/field-order.ts`) puts the link box
  after the first choice field (the article's category), or after the title when
  there is none — and after a book's ISBN, which identifies it; the file box
  follows it; the rest of the вид роботи's own fields
  (DOI, ISBN, pages, dates) come next and «Співавтори» last. The order of the
  fields themselves is the catalogue's, stored in JSON — so a database made
  earlier is reordered by `pnpm db:science-link-isbn`, not by the seed.
- **Sheets are typed with ONE decimal at most** (owner, 2026-10-16): the three
  «Кількість друкованих аркушів» fields (монографія, перевидання, рецензування)
  carry `decimals: 1`. The box REFUSES a second digit while typing
  (`limitDecimals`, a text box that takes a comma or a point and always SHOWS
  the comma — the Ukrainian separator, owner 2026-10-19; every printed number
  goes through `decimalText` too) and `schemaForFields`
  refuses it again on the server; a value already saved is not re-judged on
  edit. The 1,5-per-співавтор rule stays in the Характеристика п.3 only. The
  catalogue change reaches existing databases through
  `pnpm db:science-sheets-decimals`, not the seed.
- **A failed save must never destroy a form.** Every science dialog runs its
  action through `attempt()` (`lib/science/attempt.ts`): a rejected request
  (a phone losing signal, a server error) would otherwise be re-thrown into
  the page's error boundary, replacing the whole page — dialog and everything
  typed with it. It becomes the same `{ error }` a refusal is, shown inside
  the dialog beside the button to try again.
- **Catalogue changes reach existing databases through a one-off script**, not
  the seed (`pnpm db:science-link-isbn` for the article link, the book ISBN and
  every type's proof rules): the seed overwrites what an admin edited, production is never seeded
  again, and a cloned template is never reseeded. Report first, `--apply` to
  write.

## Підвищення кваліфікації / Стажування (built, owner 2026-10-13)

A plain record list on an НПП's profile: courses and internships, each with the
document that proves it. Tab «Підвищення кваліфікації/Стажування» at
`/profile/qualifications` (your own) and `/staff/[id]/qualifications`; table
`Qualification`; actions in `app/(dashboard)/qualifications/`.

- **It feeds nothing** — not the rating, not the ставки, not the Характеристика.
  No year gate and no `NPP_RATING_OPEN` freeze: it is not rating data.
- **Who may do what** (`qualificationAccessFor`, `lib/qualifications/access.ts`;
  every action asks it through `authoriseQualifications`, the tab flag is not a
  permission): the НПП reads and writes their own; ADMIN reads and writes
  anybody's; an EDITOR whose division carries **`canViewQualifications`**
  («Перегляд підвищення кваліфікації», a switch like `canOverseeScience`, set on
  `/divisions/[id]`) **reads only**, files included. A head and a декан see
  nothing; for them the staff route is `notFound`. **Only an НПП has records** —
  every action refuses an administrative owner, ADMIN included.
- **Серія and номер are both optional, and there is an optional «Посилання»**
  (`url`, owner, 2026-10-14) — some certificates carry no number at all. The link
  is **http(s) only** (`validations/web-link.ts`, the one rule the language
  certificates share), because it is drawn as a clickable link. A document with
  neither серія nor номер prints no «№» (`documentNumber` returns `null`); the
  Excel has a «Посилання» column, last.
- **The topic box is one column.** Its label is «Тема стажування», or
  «Спеціальність» when the document is a диплом; the Підвищення кваліфікації /
  Стажування toggle is `kind` and changes no field.
- **The date on the document is limited to the last five CALENDAR years**
  (owner, 2026-10-14, replacing five навчальних років) — in 2026 nothing before
  01.01.2022, up to today; it moves on 1 січня, Kyiv time. It follows the
  calendar, **not the rating year or the навчальний рік** — these
  records are independent of the rating. `qualificationMinDate()`
  (`lib/qualifications/window.ts`) limits the date picker and the Save button;
  the schema refuses it again on the server. An existing record older than the
  window may be corrected while keeping its own date (`keepDate`), and is still
  listed.
- **Credits are INTEGER HUNDREDTHS** (`creditsHundredths`, 1,5 → 150); the
  schema (`validations/qualification.ts`) keeps `credits` as a number up to two
  decimals and the action converts. Required, ≥ 0.
- **Hours are NEVER typed or stored: 1 кредит = 30 годин**
  (`hoursFromCredits`, `lib/qualifications/format.ts`). The form shows them
  under the credits as the person types; the list and the Excel compute them.
  There is no `hours` column (dropped 2026-10-13) — a second number would only
  have a way to disagree with the first.
- **The scan is optional and one per record**, stored as columns on the row. It
  uploads straight to R2 before the save (same flow and checks as science
  evidence, through `EvidenceFileField` with its own `FileUploader`), under
  `qualifications/<staffId>/<uuid>.<ext>`; `isQualificationKeyOf` stops anyone
  attaching a key from another person's folder. **Its SHA-256 is NOT unique**
  (unlike science's D28): nothing here is claimed hours, and a person may attach
  their own scan again. Deleting a record or replacing its file deletes the
  object; deleting a _person_ does not (the known R2 gap).
- **Excel export** (`GET /api/export/qualifications`, one flat sheet, a row per
  record, filterable): `?staffId=` for one НПП — the «Вивантажити Excel» button on
  their tab — or the same query string `/staff` is on for the whole list — the
  «Вивантажити кваліфікації» button beside «Вивантажити штат» (the old
  «Експорт», renamed; ADMIN only, unchanged). For ADMIN and a division with
  `canViewQualifications` — **not the НПП themself**; the route refuses them
  as the button hides from them.
- Audited as entity `Qualification`; its field labels are
  `ENTITY_FIELD_LABELS.Qualification`.

## Мовні сертифікати in «Освіта» (built, owner 2026-10-14)

Two optional documents in an НПП's «Освіта» card: the English certificate (not
below B2) and the державний сертифікат про володіння українською мовою. Table
`LanguageCertificate`, **one row per person and kind** (`@@unique([staffId, kind])`).
Information only — they feed nothing.

- **They are NOT Staff columns, and not a tab.** They are fields of the Education
  card, saved with the ordinary profile Save through BOTH `updateStaff` (ADMIN,
  granted editors) and `updateOwnProfile` (the НПП). Both call
  `takeCertificates` to lift them out of `updateData` BEFORE `tx.staff.update`, then
  `prepareCertificates` (scans verified before the transaction) and
  `applyCertificates` (rows written inside it) — `lib/staff/language-certificates.ts`.
  **A certificate key left in `updateData` would be written to a Staff column that
  does not exist.** `createStaff` drops them: a scan lives under the person's own
  id, so the create dialog does not draw them (the card gets `certificates` only
  for an existing person).
- **Fields.** Both have an optional **Посилання** (`url`, http(s) only — never
  another scheme, it is drawn as a link). **Номер stays mandatory** (owner,
  2026-10-14: made optional and taken back the same day — only the
  qualifications' number is optional). English: Серія (optional), Номер,
  **Рівень (B2, C1 or C2 — B2, the baseline, is the default)**, Ким виданий,
  Дата видачі. Ukrainian: Серія (optional), Номер, Рівень володіння (**free text**, as the certificate words it,
  required), Дата видачі, and the
  commission's decision as **number + date, both or neither** — one general label
  «Рішення Національної комісії зі стандартів державної мови» over two inputs.
  Each has one optional scan. The English default lives in the popup's DRAFT only:
  the form row stays empty until «Додати», so the default alone never makes a
  certificate «entered». The English level is nullable in the schema (a certificate
  saved before it existed still saves); the popup always sets one.
- **Optional as a whole, strict once begun** (`validations/language-certificate.ts`):
  an empty block stores nothing (and deletes a stored one); the moment anything —
  a scan or a link included — is entered, номер, дата and the kind's own third
  field (рівень / ким виданий) are required. **A schema here must accept its own OUTPUT**: the form passes the
  server what the resolver produced, and an empty block's output is `null`, which
  the action parses again. Refusing it made every save answer «Невірні дані».
- **Who writes** (`authoriseCertificateWrite`, for the upload; the save applies the
  same through the field filters): the НПП their own, ADMIN anybody's, an EDITOR only
  with STAFF UPDATE **and** the grant for that very certificate — `englishCertificate`
  / `ukrainianCertificate` are fields in the division settings' «Освіта» group
  (`ACADEMIC_EDITABLE_FIELDS`). Only an НПП has them.
- **Who opens a scan**: the owner, ADMIN and a division with `canViewQualifications`
  — exactly `authoriseQualifications(…, 'read')`, one rule for both kinds of scan.
  The TEXT is read like the rest of «Освіта»; heads and деканs see it, not the file.
- **Scans**: the qualifications' flow (`ScanField` over `EvidenceFileField`, key
  `language-certificates/<staffId>/<uuid>.<ext>`, SHA-256 not unique). A failed
  save leaves the staged scan alone — the form still holds its key, so the retry
  finds it; a replaced or removed scan's object is deleted AFTER the commit.
  The popup's «Додати» / «Готово» is disabled while a chosen file uploads, so a key
  R2 has not finished writing never reaches the form; a scan staged in a popup visit
  and then abandoned (Скасувати, Esc, ×) is discarded by the slot
  (`visitScan` in `components/staff/certificate-fields.tsx`).
- **UI is a button → card → popup, like the diplomas** (owner, 2026-10-14: «not
  overpopulated for the default user»): the diploma cards, then the certificate
  cards, then **every «Додати …» button at the bottom of «Освіта»** (owner,
  2026-10-14: «Додати освіту» and the two certificate buttons, in that order —
  `CertificateFields` hands the cards and buttons to `EducationCard` separately);
  the popup edits a draft and hands it back with «Готово», the profile's
  «Зберегти» saves.
- Audited as one readable line per certificate on the `Staff` entry
  (`englishCertificate`, `ukrainianCertificate` in `FIELD_LABELS`).

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

**When adding a new editable Staff field**, also add it to `ALLOWED_FIELD_NAMES` and to `FIELD_GROUPS`, both in `lib/divisions/field-grants.ts`, so it appears on the division settings page (`/divisions/[id]`) and can be granted to divisions.

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
