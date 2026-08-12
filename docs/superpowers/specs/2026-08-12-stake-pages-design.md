# Розподіл ставок — one page, a sandbox, and a bonus that says where it came from

**Date:** 2026-08-12
**Status:** approved, ready to implement
**Supersedes parts of:** `docs/stake-distribution.md` (see §5 — the bonus ceiling)

## Why

Three complaints, one shape.

The pool and the split live on two pages. ADMIN types `Кст` on `/admin/stakes`, then
clicks through to `/departments/[id]/stakes` to see what that `Кст` did, then back
again to change it. The number and its consequence are never on screen together.

ADMIN cannot experiment. Moving `Кст` or a cap to see what happens writes the real
row that a head is working against. So the one person who owns those numbers is the
one person who cannot try them.

The «Бонус» column is a single figure with no provenance. It answers neither
question anybody actually asks of it: ADMIN wants to know how much a person brought
in, a head wants to know **whose** programmes they brought them to.

## 1 — One page

`/stakes` replaces both existing pages.

|                   | ADMIN                             | Head (`Department.headId`) |
| ----------------- | --------------------------------- | -------------------------- |
| Кафедра           | picks any, `?d=<id>`              | own only, no picker        |
| Всі кафедри list  | yes, with `Кст` inline            | no                         |
| `Кст`             | writes it                         | reads it                   |
| Мін / Макс        | writes them                       | reads them                 |
| «Розподілено»     | sandbox only                      | writes it                  |
| Tabs              | `Пісочниця` / `Реальний`, `?tab=` | none                       |
| Налаштування року | yes                               | no                         |

Кафедра and tab live in the URL, so the page stays server-rendered and a link to a
particular кафедра keeps working.

`EDITOR` is still not here, for the reason it never was: a division editor may read
any rating, but deciding who on a кафедра is paid what is the head's job.

### Routes

- **new** `app/(dashboard)/stakes/page.tsx`
- `app/(dashboard)/admin/stakes/page.tsx` → `redirect('/stakes')`. Its кафедри table
  and its узгоджуючий коефіцієнт move onto `/stakes`.
- `app/(dashboard)/departments/[id]/stakes/page.tsx` → `redirect('/stakes?d=<id>')`,
  so the buttons on `/departments/[id]` and `/my-department` keep working untouched.
- `app/(dashboard)/admin/stakes/norms/` stays where it is, linked from `/stakes`.
- Sidebar: `/admin/stakes` → `/stakes`, and the item becomes visible to heads too.

## 2 — The sandbox

**ADMIN can never write a real distribution.** Not «can but shouldn't» — the action
has no path to `StakeAllocation`. What ADMIN still writes for real is what ADMIN
already owned: `Кст`, `Мін`, `Макс` and the year's coefficient, on the real tab.

```prisma
model StakeSandbox {
  id            String   @id @default(cuid())
  userId        String
  user          Staff    @relation(fields: [userId], references: [id], onDelete: Cascade)
  departmentId  String
  department    Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  year          Int

  /// The pool being tried. Null = use the кафедра's real Кст.
  kstHundredths Int?
  /// { staffId: hundredths } — what was typed into «Розподілено»
  values        Json
  /// { staffId: { min, max } } — caps being tried, overriding StaffStakeLimits
  limits        Json

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, departmentId, year])
  @@index([year])
}
```

One row per (admin, кафедра, year), not one per person. The grid already saves the
whole кафедра in one write; a row per person would turn that into N writes for a
scratch pad. Nothing queries inside the JSON, so JSON is honest about that.

Per admin, so two admins trying different pools do not overwrite each other.

Rules:

- The sandbox action writes `StakeSandbox` and nothing else. Enforced in the action.
- No `AuditLog` entry. It is a scratch pad, not a decision.
- «Скинути пісочницю» deletes the row and the tab falls back to the real numbers.
- Visually distinct: dashed border on the grid, a «Пісочниця» badge in the header,
  and no «Заповнив …» line. Nobody should be able to screenshot it and mistake it.
- The sandbox reads the real numbers as its starting point, so opening the tab shows
  the truth until something is typed.

## 3 — Бонус, split by role

`bonusForStaff` stops returning a number:

```ts
export interface StaffBonus {
  /** Ставки, full precision — round at the edge */
  total: number;
  /** How many CONFIRMED claims paid into it */
  students: number;
  bySpeciality: {
    speciality: string;
    code: string | null; // «A4.01», null for the merged 015 rows
    count: number;
    value: number;
  }[];
}
```

`bySpeciality` is sorted by `specialityCodeSortKey`, so a кафедра's own codes cluster
and uncoded rows fall to the end.

| Viewer        | Cell                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| НПП, own page | unchanged — possible outcome and confirmed value                                                                                |
| ADMIN         | `0,142` and, muted beneath, `6 здобувачів`                                                                                      |
| Head          | `0,142` then chips: `A4.01 ×1` `A5.38 ×5`, wrapping. Above four, the rest collapse into `+N` with the full list in the tooltip. |

The split follows what each one is looking for. ADMIN is judging how much a person
brings in; a head is judging **where** they bring it — recruiting onto another
кафедра's programme is not the same work as recruiting onto their own.

## 4 — Green, amber, gray

New `lib/specialities/departments.ts`: a hardcoded map, speciality → випускові
кафедри, transcribed from `edu-reference/uhsp-specialnosti-kafedry.html`. Six
specialities have two or three, so the value is an array.

Keys must stay byte-identical to `SPECIALITY_NORMS_2026` — including the typographic
apostrophe in «здоров’я», which the HTML source writes as a plain quote. A test pins
the map against the norm table in both directions.

**Display only.** It does not restrict what an НПП may claim: an НПП may recruit onto
any programme in the university and the bonus follows the recruiter
(`docs/stake-distribution.md`, confirmed 2026-08-10). This is why `Speciality` still
carries no `departmentId` and still must not gain one.

Matching is on a normalised кафедра name — trimmed, lower-cased, spaces collapsed,
apostrophe variants folded. Three outcomes, not two:

- **green** — this кафедра is a випускова кафедра for that speciality
- **amber** — it is somebody else's
- **gray** — this кафедра's name is not in the довідник at all

Gray is not a nicety. The demo кафедри are invented — Кафедра кібербезпеки, Кафедра
вищої математики — so on demo data nothing matches and every chip would go amber,
which reads as «he recruited for strangers» when the truth is «we do not know».
Gray says the second thing, and a one-line note under the table says why.

## 5 — «Разом» has a ceiling

```
Разом = min(розподілено + бонус, Макс)
```

The part that does not fit shows beside it, muted: **1,00** `+0,14 понад межу`. The
кафедра totals sum the capped values.

This contradicts `docs/stake-distribution.md`, which today says term 2 is paid on top
of `Кст` with no ceiling, and both are updated in the same change. The reason,
from the owner (2026-08-12): a person already at their максимум from the pool gets
nothing more from recruitment, however many students they brought. Somebody who
thinks they deserve more asks the проректор, who tells the head to raise that one
person. So in practice the bonus is closer to an extra rating score than to an extra
ставка — and a column that promises money it will not pay is worse than no column.

`Кст` still bounds the pool share alone. A кафедра total may still exceed `Кст`, by
whatever part of the bonuses fits under the caps.

Tooltips `bonus` and `total` are reworded to say the ceiling out loud.

## 6 — The two small fixes

- The ▲▼ stepper comes out of the «Розподілено» cell into `StakeStepper` and is used
  by Мін and Макс as well.
- `min`, `max` and `formulaTotal` tooltip entries (already in the working tree) fix
  both reported bugs: Макс had no explanation at all, and «Формула пропонує» in the
  totals bar reused the «За формулою» column's text word for word.

## 7 — Tests

- `lib/specialities/departments.test.ts` — every key is a seeded speciality, every
  seeded speciality is a key, no кафедра name appears under two spellings.
- `lib/stake/total.test.ts` — the ceiling: under, exactly on, over, and a zero bonus.
- the sandbox action leaves `StakeAllocation`, `StakeDistribution` and
  `StaffStakeLimits` untouched.

## Not doing

- No кафедра↔спеціальність editing UI. It is a constant; a wrong row is a one-line
  patch, and a table nobody maintains would go stale silently.
- No sandbox for heads. A head has one кафедра and one real answer to give.
- No «promote sandbox to real». That is exactly the write ADMIN must not have.
