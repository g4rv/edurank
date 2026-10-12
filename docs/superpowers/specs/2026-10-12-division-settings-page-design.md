# One settings page per division

Date: 2026-10-12. Status: draft for the owner's review.

## Goal

Everything ADMIN can switch on for a division lives on ONE page:
Адміністрування → Відділи → [відділ] → Налаштування. The two separate screens
«Поля доступу» and «Дії доступу» go away.

## What the owner decided

- One place for all checks: «move all possible checks there, no need for separate
  permissions pages».
- **One «Зберегти» button** for the whole page (not instant per-click saving).

## Today (why it is confusing)

| Where                                   | What                                                   | How it saves |
| --------------------------------------- | ------------------------------------------------------ | ------------ |
| `/divisions/[id]/edit` (`DivisionForm`) | name + 5 yes/no switches                               | one button   |
| `/admin/permissions/field`              | which `Staff` fields editors may edit                  | every click  |
| `/admin/permissions/entity`             | create / edit / delete on Персонал, Кафедра, Факультет | every click  |
| `/divisions/[id]`                       | read-only chips of the two above                       | —            |

The two permission screens also write **no audit entry**.

## Design

### The page

`/divisions/[id]` becomes «Налаштування відділу», ADMIN only (`redirect('/')`
otherwise, like today). It replaces the read-only chip page and the separate
`/edit` page. Sections, top to bottom, in one card-based form:

1. **Назва** (required).
2. **Права відділу** — the five yes/no switches: Модерація рейтингу, Перевірка
   науки, Надсилання запрошень, Встановлення й скидання паролів, Завершення всіх
   сесій (same labels and help text as the form has now).
3. **Дії з сутностями** — the 3×3 table: Персонал / Кафедра / Факультет ×
   Створювати / Редагувати / Видаляти.
4. **Доступ до полів** — checkboxes in the same five groups as today
   (Персональні дані, Академічна інформація, Освіта, Наукові профілі,
   Організаційне).
5. **Видалити відділ** — the existing `DeleteDivisionButton`, unchanged.

Header: the name, the number of співробітників, breadcrumb «Відділи».

One «Зберегти» button and «Скасувати». Save is disabled until something changed.
Leaving without saving discards changes (no auto-save anywhere on this page).

### Saving

New server action `updateDivisionSettings(id, data)` replaces `updateDivision`,
`setEntityPermission` and `setFieldPermission`:

- `requireAdmin()` first.
- Zod schema `divisionSettingsSchema`: `name`, the five booleans,
  `entityPermissions: ('STAFF'|'DEPARTMENT'|'FACULTY' + ':' + 'CREATE'|'UPDATE'|'DELETE')[]`,
  `fieldPermissions: string[]`.
- **Field rules are unchanged and enforced here:** every name must pass
  `isEditorWritableField` (confidential, account and permission-scoping fields —
  `employmentRate`, `passwordHash`, `role`, `tokenVersion`, `divisionId` — are
  never grantable) AND be in the allowed list. An unknown or forbidden name
  refuses the **whole** save with «Невідоме поле» and writes nothing.
- One `db.$transaction`: update the division; make `DivisionEntityPermission`
  equal to the submitted set (delete the rest, create the missing, skip
  duplicates); the same for `DivisionFieldPermission`; write **one** `AuditLog`
  entry via `diffChanges` with before/after of the name, the five switches and the
  two sets. Nothing is written if any step fails.
- Errors follow the project convention: `parseDbError(e, 'Не вдалося зберегти.
Зміни не застосовано', 'division.updateDivisionSettings', { userId })`.
- Ukrainian labels for the audit page: add `entityPermissions` and
  `fieldPermissions` to `FIELD_LABELS` (`lib/labels.ts`).

`createDivision` and `deleteDivision` stay as they are. The «Додати відділ» dialog
keeps asking for name and the five switches; entity and field rights are set on
the settings page afterwards (a new division starts with none, as today).

### The allowed-fields list moves

`ALLOWED_FIELD_NAMES` (now in `admin/permissions/field/actions.ts`) and
`FIELD_GROUPS` (now in that screen's page) move to one shared file,
`lib/permissions/division-fields.ts`, used by the new action AND the form. The
rule in CLAUDE.md «When adding a new editable Staff field» points there.

### Removing the old screens

- Delete `app/(dashboard)/admin/permissions/entity/*` and `.../field/*` (pages,
  actions, loading files, tests) and `components/admin/entity-permission-toggle.tsx`,
  `field-permission-toggle.tsx`.
- Sidebar (`components/sidebar.tsx`): remove «Поля доступу» and «Дії доступу».
- Old URLs keep working for bookmarks: `/admin/permissions/field`,
  `/admin/permissions/entity` and `/divisions/[id]/edit` redirect (to `/divisions`
  and `/divisions/[id]`) through `redirects()` in `next.config`.
- `revalidateDivisions` in `divisions/actions.ts` stops revalidating the removed
  routes.
- Division list rows open the settings page (they already link to `/divisions/[id]`).

### Unchanged

Data model (no migration). What every right MEANS, and who is checked where
(`canManageEntity`, `getDivisionFieldGrants`, `accountGrantsFor` …). Only ADMIN
may create, change or delete a division.

## Out of scope

Showing an editor their own division's rights; per-field help text; bulk copy of
rights between divisions; changing which rights exist.

## Tests (colocated)

- `divisionSettingsSchema`: rejects empty name, malformed entity key, accepts an
  empty set.
- `updateDivisionSettings`: refuses non-admin; refuses `employmentRate`,
  `divisionId`, `passwordHash`, an unknown name — and writes nothing; replaces both
  sets exactly (removes ungranted, adds new, keeps unchanged); one audit entry
  with the diff; a failure inside the transaction rolls everything back.
- The ported cases from the old `field/actions.test.ts` and
  `entity/actions.test.ts` (nothing about field safety may be lost).
- Redirect config for the three old URLs.
- A pure helper that turns a division row into the form state and back (so the
  «changed?» logic is unit-testable).
- Browser check (owner): the page shows the saved state; one Save applies all;
  Cancel/leaving discards; the audit log shows one entry; the sidebar no longer
  has the two links; the old URLs land on the new page.

## Rollout

No migration. Existing rights are read from the same tables, so every division
shows exactly what it had.
