# Division page access — design

Owner request, 2026-11-25. Short design (a small-to-medium change).

## Why

Every EDITOR opens six pages just by having the role: Штат, Кафедри,
Факультети, Дані відділу, Рейтинг НПП, Графіки. The owner put a person into
the aspirantura division so they could enter 3.18, and that person also got
the whole rating table, which was never meant. The goal is: **a division's
people open only the pages ADMIN turned on for that division.**

## Goals

- Five page switches on the division settings page (`/divisions/[id]`), off by
  default: **Штат, Кафедри, Факультети, Рейтинг НПП, Графіки**.
- Each switch closes its pages, the pages under them and their exports **on the
  server**, not only the menu link.
- A division never holds a right it cannot use (see «Rights open pages»).

## Non-goals

- No change to roles. EDITOR stays; ADMIN stays; heads, deans and science
  deputies stay as they are (owner: «skip dramatic changes for now»).
- No change to what a division may DO (entity actions, field grants, the
  existing switches). This is only about what it may SEE.

## Anti-goals

- A switch that hides the menu link while the address still works.
- A head, dean or science deputy losing «Моя кафедра» / «Мій факультет» or their
  own people's records because of this.
- A link on some screen leading to an error page.

## Approaches

1. **Five switches, one per page, as columns on `Division`** — chosen. Same shape
   as the existing switches (`canModerateRating`, `canViewQualifications`…),
   edited and audited in the same Save.
2. Remove the EDITOR role; division membership is the access. Cleaner, but
   rewrites about 25 role checks and two security rules. Owner: not now.
3. One list of rights per division replacing all switches. Tidier, but a
   redesign of the settings page and every check. Owner: not now.

## The design

### What each switch opens

| Switch      | Opens                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Штат        | `/staff` list; each person's record, **Профіль** tab only                                                                      |
| Кафедри     | `/departments` and `/departments/[id]`                                                                                         |
| Факультети  | `/faculties` and `/faculties/[id]`                                                                                             |
| Рейтинг НПП | `/rating`; the **Рейтинг** and **Характеристика** tabs of a person's record; the rating and Характеристика Excel / zip exports |
| Графіки     | `/dashboard`; the charts PDF and the ranking exports behind it                                                                 |

**«Дані відділу» stays automatic, as today**: shown only to a division that
enters some indicator, with only its own columns. It is already minimal, and
without it the division cannot do its job.

A person's **Наукова робота** and **Підвищення кваліфікації** tabs keep their own
rules (`canOverseeScience`, `canViewQualifications`), unchanged.

### Rights open pages (if you may edit, you may look)

A division that may DO something gets the page it is done from, automatically:

- **Штат** — any of: STAFF create / update / delete, any field grant, invites,
  passwords, ending sessions, «Перегляд підвищення кваліфікації», «Перевірка
  науки».
- **Рейтинг НПП** — «Модерація рейтингу» (they check rating entries).
- **Кафедри** / **Факультети** — DEPARTMENT / FACULTY create / update / delete.

On the settings page such a switch shows ticked and locked, with one line saying
which right needs it. The forced value is worked out in code from the rights,
never stored, so removing the right frees the switch again.

### Not affected

ADMIN sees everything. Heads, deans and science deputies keep what their
position gives them («Моя кафедра», «Мій факультет», their people's records,
Рейтинг кафедри). A person always sees their own record.

### Links

Where a viewer cannot open a person (or a кафедра / факультет), the name is
plain text, not a link.

### Start page

`/` sends an editor to their first allowed page (Штат, Рейтинг НПП, Дані
відділу, Модерація, …), or to their own profile if they have none.

### Starting state and rollout

The five columns are added as `false`. So on deploy each division keeps only what
its rights force on. From the prod copy of 2026-11-13: ННВ keeps Штат,
Кафедри, Факультети and Рейтинг НПП (it has those rights) and loses Графіки;
ННЦЗЯО keeps Штат (profiles only); ВМЗ and the aspirantura division keep only
«Дані відділу». **Before deploying, a read-only report on prod lists, per
division and person, what they keep and what they lose**, so the owner can
tell them or tick switches first.

Changes apply on the next click; nobody has to sign in again.

### Bookkeeping

Audited with the division's settings Save, as the other switches are; labels in
`FIELD_LABELS`. Tests for the access rule (each switch, each forcing right, heads
untouched) and for the settings page's locked state.

## Left to the builder

- The exact list of routes and exports each switch guards (the table above is
  the intent; follow every `role === 'EDITOR'` / `canViewAcademicRecord` use).
- Where the shared rule lives (`lib/permissions.ts` beside `accountGrantsFor` is
  the natural place) and its name.
- The wording of the locked-switch line.
