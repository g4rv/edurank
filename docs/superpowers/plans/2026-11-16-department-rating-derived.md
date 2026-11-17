# Рейтинг кафедри — derived values: implementation plan

Spec: `docs/superpowers/specs/2026-11-16-department-rating-derived-values-design.md`.
Branch: `feat/department-rating-derived`, stacked on `feat/vice-head-read-department`.

## The mapping is data: `DepartmentIndicator.derivation`

A nullable JSON column. `null` = the line is typed by hand, as today.

```ts
interface Derivation {
  coverage: 'FULL' | 'PARTIAL';
  from: {
    code: string; // ActivityType.code — stable across years, identity only
    when?: { field: string; in: string[] }; // e.g. option in ['q1', 'q2']
    keys: string[]; // evidence fields that identify the work, strongest first
    text: string; // the evidence field compared for «можливий дубль»
  }[];
}
```

2026 lines (`lib/department-rating/catalogue-2026.ts`):

| Line | Coverage | From                                                                     | keys                 | text           |
| ---- | -------- | ------------------------------------------------------------------------ | -------------------- | -------------- |
| 5    | FULL     | `initiative_topic`                                                       | —                    | `title`        |
| 6.1  | PARTIAL  | `monograph_ua`                                                           | `isbn`               | `bibliography` |
| 6.2  | PARTIAL  | `monograph_eu`                                                           | `isbn`               | `bibliography` |
| 7.1  | FULL     | `publication_cat_a`, option `q1`/`q2`                                    | `doi`, `link`        | `bibliography` |
| 7.2  | PARTIAL  | `publication_cat_a`, option `q3_4_or_none`                               | `doi`, `link`        | `bibliography` |
| 9    | FULL     | `edition_publication`, option `textbook`/`study_guide`                   | —                    | `bibliography` |
| 12.1 | PARTIAL  | `intl_conf_organization`; `cultural_sport_events` option `international` | —                    | `title`        |
| 12.2 | PARTIAL  | `ukr_conf_organization`; `cultural_sport_events` option `national`       | —                    | `title`        |
| 13.1 | FULL     | `copyright_registration`                                                 | `certificateNumber`  | `title`        |
| 13.2 | FULL     | `patent_granted`                                                         | `registrationNumber` | `title`        |

## Tasks

1. **Schema + migration.** `derivation Json?` on `DepartmentIndicator`; migration
   `20261116120000_department_indicator_derivation` (one `ADD COLUMN`), rollback in
   `docs/rollbacks/`. `pnpm db:generate`.
2. **Types + reader.** `lib/department-rating/derivation.ts`: the `Derivation` type,
   a Zod `readDerivation(json) → Derivation | null` (bad JSON = null, logged once).
   Tests.
3. **Catalogue.** `derivation` on the 2026 defs, written by `departmentIndicatorRows`
   and copied by `cloneTemplate`. Test: every `from.code` exists in
   `ACTIVITY_TYPES_2026`, every `keys`/`text`/`when.field` is a field of that code,
   every `when.in` an option of it.
4. **Grouping, pure.** `lib/department-rating/group-works.ts`:
   - entries → works with union-find on normalised keys (`normalizeDoi`,
     `normalizeIsbn`, a URL without scheme / `www.` / trailing slash, a number with
     only letters and digits kept). A key is `<kind>:<value>`, so a DOI matches a DOI
     whichever field holds it.
   - works with no shared key compared by `sameWorkByText` on `text` → «можливий
     дубль» pairs, **never merged**.
   - count = number of works.
     Tests: each key kind, two co-authors → one work, no key → separate + flagged,
     different texts → no flag, `when` filters options.
5. **Query.** `lib/queries/get-department-derived.ts`,
   `getDepartmentDerived(departmentId, year)`:
   - people: `departmentId` = this кафедра, `ON_ROSTER`, `RATED` (no сумісники, no
     external part-timers);
   - entries: that year, `APPROVED`, indicator `isActive`, code in the year's
     derivations;
   - «внесли власні досягнення: X з Y НПП»: X = of those people, how many have at
     least one APPROVED entry of an `NPP_SUBMISSION` indicator that does not gate
     the rating (5.1 is everybody's);
   - returns a plain object keyed by indicator id (passed to a client component).
     Tests with a mocked `db`.
6. **Report page + form.** The page computes it only while the year is OPEN.
   Per line in `report-form.tsx`, under the К-сть box:
   - FULL: «З рейтингу НПП: N» · «Прийняти» (writes N into the box and saves, as
     a blur does; not drawn when N = 0 or the box already holds N, or for a
     read-only viewer) · «Переглянути».
   - PARTIAL: «У рейтингу НПП знайдено: N (можливо, більше) — потребує ручної
     перевірки» · «Переглянути».
     «Переглянути» opens a dialog: header «N робіт, з них K можливих дублів · внесли
     власні досягнення: X з Y НПП», one row per work — title, authors (links to
     `/staff/[id]`), why grouped, «можливий дубль з № …». Read-only.
7. **Production script.** `prisma/department-rating-derivation.ts`,
   `pnpm db:department-rating-derivation`: for every year's lines whose
   `derivation` is null and whose number is in the catalogue map, sets it.
   Never overwrites one already set. Report first, `--apply` to write.
8. **Docs.** CLAUDE.md (a short «Рейтинг кафедри» note + the command), spec status.

## Not in this plan

Merge / split buttons, the grant programme field, Scopus / open-access ticks,
«сумісник on this кафедра only», an admin editor for `derivation`.
