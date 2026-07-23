# UI/UX fixes — plan for discussion

## Decisions locked (2026-07-23)

- **#1 charts:** composed distribution (bars + smooth curve), tighter bars, stays
  monochrome. **Curve = line + faint fill.**
- **#2 rounding:** fix at source in `sumBySection`; recompute open/active years
  **and clean closed-year snapshots too** (no long decimals anywhere).
- **#3 report preview:** native Recharts chart, PDF stays download-only.
  _Chosen data strategy: **A — preload everything** (tiny dataset)._
- **#4 table actions:** **rows minimal; edit/actions live on the detail page.**
  Remove inline pencil/delete from divisions, faculties, departments.
- **#5 tables:** **zebra rows + subtle column dividers**, shared table component.
- **#6 sidebar:** reorder per the exact list in §6 below; rename «Огляд» → «Графіки».
- **#7 moderation:** **sortable table default + «групувати за НПП» toggle**, plus
  status («потребують уваги») and department filters.
- **#8 verify button:** rename the unverified label from state «Не перевірено» to
  action **«Перевірити»** (keep «Перевірено» once verified).
- **#9 sorting:** add column sorting to **all big tables** that lack it — the
  rating rollup (`/rating`) and the new moderation table especially.

---

Status: **discussion done; decisions above.** One section per issue you raised. Each has:
what's there now, the problem, a proposed approach, and **open questions** where I
need your call before building.

A cross-cutting note up front: the app's theme is **deliberately monochrome** —
every colour token is `oklch(L 0 0)` (pure gray), only `--destructive` has a hue.
That is a documented brand rule (CLAUDE.md). Points 1 and 5 brush against it, so
each says explicitly where it stays inside the rule and where it would bend it.

---

## 1. Dashboard charts — unorganized, boring; distribution needs a curve; bars too far apart

**Now**

- `components/dashboard/score-distribution.tsx` — bar chart, thin bars
  (`maxBarSize={24}`) with wide gaps, a vertical **median line** ("pointer").
- `section-totals.tsx`, `department-scores.tsx` — horizontal bars, same gray.
- All single-series gray (`--chart-3`), by brand rule.

**Problem**

- Bars are islands in whitespace → looks sparse and sterile.
- The distribution shows _where the crowd sits_ but nothing draws the **shape**
  (the "level"/curve) you asked for.
- Three cards, three slightly different paddings/heights → feels unorganized.

**Proposal**

1. **Distribution → composed chart.** Keep the bars, overlay a smooth
   `monotone` line (or faint area) tracing the counts — the "curve that shows
   level". Median "pointer" line stays. Colour stays monochrome: bars
   `--chart-3`, curve `--foreground`/`--chart-5`. This is inside the brand rule
   (still one dataset, no categorical hue).
2. **Tighten bars.** Drop `maxBarSize`, shrink `barCategoryGap` so bars nearly
   touch — the "more organic" look. Rounded tops kept.
3. **Consistent card rhythm.** One shared chart-card height/padding scale across
   the three so the row reads as a set, not three strangers.

**Open questions**

- Curve as a **line** (crisp) or a **soft filled area** under it (softer, more
  "organic")? I lean line + very faint fill.
- Do you want the same curve treatment on section/department charts, or is the
  curve only meaningful on the distribution? (It's only meaningful on the
  distribution — the others are rankings, not a continuum.)

---

## 2. Rating numbers — round to 2 decimals, fix the stored value not the display

**Now**

- `lib/rating/scoring.ts` already rounds each `Activity.score` to 2 decimals
  (`round2`). That part is fine.
- **The bug is in the rollup.** `lib/rating/recompute.ts → sumBySection` adds the
  rounded scores with `+=` and stores the raw sum in `RatingEntry`
  (section1..5 + total). Floating-point addition of clean 2-decimal numbers still
  produces artifacts like `3155.0000000000005`. Those long values are **written to
  the DB** and shown as-is in the rating table, the rollup, the profile tab, and
  the dashboard.

**Proposal (fix at the source, not the display)**

1. `round2` **every section bucket and the grand total** inside `sumBySection`,
   so `RatingEntry` only ever stores clean 2-decimal values.
2. **One-time recompute** of all existing `RatingEntry` rows to overwrite the
   artifact values already in the DB (a small script using the existing
   `recomputeRatingEntries`).
3. Add a unit test that `0.1 + 0.2`-style sums come back clean.

**Open questions**

- **Closed years** render from a frozen `RatingEntry.snapshot` (JSON) that also
  holds artifact values. Recompute those too, or leave frozen history untouched?
  (I'd fix open/active years now; leave closed snapshots alone unless you want
  them cleaned — they're meant to be immutable.)
- Confirm **2 decimals** is the right precision everywhere (some scores are
  `pages/24` — genuinely fractional). 2 is my assumption from your message.

---

## 3. Dashboard "Звіти PDF" preview — replace the embedded PDF with a UI chart

**Now**

- `components/dashboard/reports-view.tsx` renders an **`<iframe>` pointing at the
  PDF route** (`/api/export/rating-chart?...&inline=1`). The preview _is_ the
  generated PDF file, debounced on filter change.

**Problem**

- A PDF in an iframe is heavy, can't be themed, ignores dark mode, and doesn't
  match the rest of the dashboard.

**Proposal**

- Build a **native Recharts component** (like the other dashboard charts) fed by
  the _same data_ the PDF uses (`getDepartmentChart` / `getDepartmentStaffChart`
  in `lib/queries/get-rating-chart.ts`). The two filters (кафедра / показник)
  drive it live.
- **Keep the PDF as a download only** — the "Завантажити" button stays. The PDF
  is the university's circulated house-style format (its colours are intentional);
  the on-screen version is the app's monochrome self. They diverge on purpose.

**Open questions — data fetching (this is the real decision):**

- **A. Preload everything.** Server passes all departments' + all staff's numbers
  to the client once; switching filters is instant, no network. Simple, but ships
  more data (~300 staff × 6 metrics — still small). **My recommendation.**
- **B. Fetch on change.** A small JSON route/server-action returns the selected
  slice per filter change. Less upfront data, more moving parts + spinners.

I recommend **A** — the dataset is tiny at your scale.

---

## 4. Inconsistent ways to reach/edit entities across tables

**Now — genuinely inconsistent:**

| Table           | Row click     | Edit                             | Delete               |
| --------------- | ------------- | -------------------------------- | -------------------- |
| **Staff**       | → detail page | none in table (edit from detail) | none in table        |
| **Divisions**   | → detail      | inline ✏️ pencil button          | inline delete button |
| **Faculties**   | → detail      | inline ✏️                        | inline delete        |
| **Departments** | → detail      | inline ✏️                        | inline delete        |

So Staff makes you open the record to do anything; the other three put edit/delete
right in the row. The inline buttons also need `z-10` hacks to sit above the
full-row link overlay — fragile.

**Proposal — pick ONE pattern for all four:**

- **Option A (recommend): row → detail; edit/delete live on the detail page.**
  Removes the "Дії" column from divisions/faculties/departments, matches Staff,
  kills the z-index overlay hack, cleaner rows.
- **Option B: inline actions everywhere.** Add ✏️/delete to the Staff row too.
  More one-click power, busier tables, keeps the overlay hack.
- **Option C: a "kebab" (⋯) menu** per row with View / Edit / Delete — one
  consistent affordance, scales if actions grow.

**DECIDED — Option A.** Rows stay as minimal as possible. Any element with a
dedicated page gets its edit/delete/actions **on that page**, not in the row.
Remove the inline pencil + delete (and the `z-10` overlay hack) from divisions,
faculties, and departments; make sure their detail pages carry those actions.

---

## 5. Tables hard to read — monochrome, no column/row separation

**Now**

- Every table is **hand-rolled** with repeated Tailwind classes (no shared
  `Table` component). Rows separated only by a faint bottom border; no zebra, no
  column dividers. At a glance one row bleeds into the next.

**Proposal**

- Introduce **one shared table primitive** (shadcn `table.tsx`) and refactor all
  tables onto it. It carries:
  - **zebra striping** (alternating `bg-muted/30`) — the biggest readability win,
  - stronger header separation,
  - optional **subtle vertical column dividers**,
  - consistent hover + padding.
- **Brand check:** zebra + gray dividers are _neutral_ (gray, no hue), so this
  does **not** break the monochrome rule — it's legibility, not categorical
  colour. (Colour-coding rows by status/value _would_ break it; not proposing
  that.)
- Bonus: consolidating also makes points 4 and 6 consistent for free.

**DECIDED — zebra rows + subtle vertical column dividers.** Both, on a shared
table component, kept in neutral gray so the monochrome rule holds. Header gets a
stronger rule too. Status pills stay on `--primary` / `--destructive` as-is.

---

## 6. Sidebar order is weird — reorder (discuss)

**Now (top to bottom):**

```
Огляд · Персонал · Факультети · Кафедри · Відділи · Рейтинг НПП
[Мій профіль] [Модерація рейтингу] [Дані відділу]
── Адміністрування ──
Рейтингові роки · Поля доступу · Дії доступу · Журнал аудиту
```

**Problem**

- **Rating is the app's core job** (Phase 2), yet «Рейтинг НПП» sits last in the
  main group, below the whole org structure.
- Moderation / division-data (also rating work) float loosely below profile.
- Structure entities (Факультети/Кафедри/Відділи) and people (Персонал) are
  interleaved without grouping.

**DECIDED — exact order (ADMIN/EDITOR view), separated by simple divider lines:**

```
Мій профіль
Персонал
Кафедри
Факультети
Відділи
── (line) ──
Дані відділу
── (line) ──
Рейтинг НПП
Модерація рейтингу
Графіки            ← «Огляд» / dashboard, RENAMED to «Графіки», moved here

── Адміністрування ──  (unchanged, stays at the very bottom)
```

Notes for implementation:

- «Огляд» becomes **«Графіки»** (route `/dashboard` unchanged, icon `ChartColumn`
  fits). It moves from the top to the bottom of the rating group.
- Dividers are plain lines (like the existing «Адміністрування» rule), no group
  labels.
- Visibility rules are unchanged — «Мій профіль» still only when `staffId`,
  «Дані відділу» only when `canEnterData`, «Модерація» only when `canModerate`,
  «Графіки» still ADMIN/EDITOR only. The order is what changes.
- The USER (НПП) nav (Мій рейтинг / Додати активність) is separate and untouched.

---

## 7. Rating moderation is "smooshed together" — needs an easy-to-follow system

**Now**

- `/moderation` is a **flat `<ul>`**, one `<li>` per activity across _all_ НПП,
  with a name search + section filter. With hundreds of submissions it's one long
  undifferentiated scroll — exactly the "smooshed" feeling.

**Problem**

- No structure: you can't see _whose_ entries these are at a glance, can't sort,
  can't isolate "needs attention", can't see per-person or per-section totals.

**Proposal — pick a structure:**

- **Option A: group by НПП (collapsible cards).** One card per person → their
  submissions inside, with a running total and a count. You moderate
  person-by-person, which is how appeals/complaints actually arrive.
- **Option B: proper sortable table.** Columns: ПІБ · Кафедра · Розділ ·
  Показник · Бали · Статус · Дата · Дії. Sort by any, filter by section /
  department / status. Scannable and dense.
- **Option C: hybrid.** Table (B) as default, plus a **"згрупувати за НПП"**
  toggle (A).

**Plus, regardless of layout:**

- A **status/verification filter** ("тільки потребують уваги", "непідтверджені
  публікації") — moderation is about _finding_ the wrong entry, so let the list
  narrow to candidates.
- A **department filter** (moderators often own one кафедра).

**DECIDED — Option C (recommended).** A proper **sortable table by default**
(ПІБ · Кафедра · Розділ · Показник · Бали · Статус · Дата · Дії) with a
**«групувати за НПП»** toggle that collapses submissions under each person with a
running total. Plus a **status filter** («потребують уваги» / непідтверджені
публікації) and a **department filter**. Keeps the existing section filter + name
search.

---

## 8. Moderation — rename the verify button to a call-to-action

**Now** `components/rating/verify-activity-button.tsx` shows the flag's _state_:
«Перевірено» when set, **«Не перевірено»** when not. The unverified label reads as
a status, not something you can click.

**DECIDED** Unverified → **«Перевірити»** (verb, the action to take). Verified stays
**«Перевірено»** (state achieved). Icons/toasts unchanged. Small, ships with #7.

---

## 9. Add column sorting to all big tables

**Now** Staff, Faculties, Departments, Divisions already sort via `SortTh`. The
**rating rollup** (`/rating`) and **moderation** lists do **not** — they're static.

**DECIDED** Add sorting to every large table that lacks it:

- `/rating` — sort by ПІБ, кафедра, each розділ Р1–Р5, and Разом.
- `/moderation` (new table from #7) — sortable columns built in from the start.
- Audit anything else large (division-data grid) for the same.

Reuse the existing `SortTh` + `?sort=&dir=` URL pattern so it matches the other
tables. Fits naturally on the shared table component from #5.

---

## Suggested build order (once decided)

1. **#2 rounding** — pure bug, small, unblocks correct numbers everywhere.
2. **#5 shared table (zebra + dividers)** — foundation that #4, #7, #9 sit on.
3. **#4 access pattern** — rides on the shared table.
4. **#9 sorting** — extends the shared table to `/rating` (moderation gets it in #7).
5. **#6 sidebar** — tiny, do anytime.
6. **#1 charts** + **#3 native report chart** — the dashboard pass, together.
7. **#7 moderation** + **#8 verify rename** — biggest UX build, last.
