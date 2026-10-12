# Division Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One page per division (`/divisions/[id]`) holds every ADMIN-set right — name, the five yes/no switches, entity actions, field access — saved with one button; the two old permission screens are removed.

**Architecture:** Pure helpers (`lib/divisions/settings.ts`, `lib/divisions/field-grants.ts`) carry the shared state, allowed-field list and group layout. One server action `updateDivisionSettings` replaces `updateDivision`, `setEntityPermission` and `setFieldPermission`: it validates, then replaces both permission sets and writes one audit entry inside one transaction. The page is a server component feeding a client form with a single Save.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Prisma 7, Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-division-settings-page-design.md`

## Global Constraints

- All UI text Ukrainian; labels for shared enums live in `lib/labels.ts`, not in logic files.
- ADMIN only: every action starts with `requireAdmin()`; the page redirects non-admins to `/`. No division right is ever editable by an EDITOR.
- Confidential, account and permission-scoping fields are never grantable: every field name must pass `isEditorWritableField` (`lib/permissions.ts`) AND be in the allowed list. `divisionId` and `employmentRate` are never in it.
- Errors: `parseDbError(e, 'Не вдалося зберегти. Зміни не застосовано', 'division.updateDivisionSettings', { userId })`; never show codes or ids.
- Audit: one `AuditLog` entry per save via `diffChanges` (primitives only — arrays are joined into one string).
- Feedback conventions: success = toast «Збережено»; errors = toast (nothing field-level except the required name).
- Aurora UI (`docs/aurora.md`): reuse `components/aurora/ui/{button,input,switch,checkbox}`; no raw palette classes; sizes on the even ladder.
- No Prisma migration: the tables are unchanged.
- Branch `feat/division-settings-page` (stacked on `feat/account-access-switches`, already created, spec committed). Commits via the `/commit` skill, one per task. Do not push or merge.
- Deviation from the spec: the shared allowed-fields file is `lib/divisions/field-grants.ts` (not `lib/permissions/…`) because `lib/permissions.ts` already exists as a file and a sibling `lib/permissions/` directory would be confusing.

## Review Focus

- A forbidden field name (`employmentRate`, `divisionId`, `passwordHash`, unknown) anywhere in the submitted list refuses the WHOLE save and writes nothing. Pinned in Task 2.
- Saving with an EMPTY entity set / EMPTY field set really clears them (no «delete where NOT in []» trap). Pinned in Task 2.
- A failure halfway through the transaction leaves the old rights intact. Pinned in Task 2.
- Every field shown on the page is actually grantable (no checkbox that the server then refuses). Pinned in Task 1.
- The three old URLs still land somewhere sensible, and no sidebar link points at a removed page. Pinned in Task 4.
- A division with no staff / no rights renders (empty sets). Pinned in Task 3 (helper) and the browser check.

## File Structure

| File                                                                                                                  | Responsibility                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/divisions/field-grants.ts` (new)                                                                                 | `ALLOWED_FIELD_NAMES`, `FIELD_GROUPS`, `ENTITY_ROWS`, `ENTITY_ACTIONS`, `entityKey`                                                       |
| `lib/divisions/settings.ts` (new)                                                                                     | `DivisionSettings` type, `toSettings(row)`, `settingsEqual`, `describeEntities`, `describeFields`                                         |
| `lib/labels.ts`                                                                                                       | `ENTITY_TYPE_LABELS`, `ENTITY_ACTION_LABELS`, audit labels `entityPermissions`, `fieldPermissions`                                        |
| `validations/division.ts`                                                                                             | `divisionSettingsSchema`                                                                                                                  |
| `app/(dashboard)/divisions/actions.ts`                                                                                | `updateDivisionSettings` (replaces `updateDivision`)                                                                                      |
| `app/(dashboard)/divisions/[id]/page.tsx`                                                                             | the settings page (replaces the read-only page)                                                                                           |
| `components/division/division-settings-form.tsx` (new)                                                                | the client form                                                                                                                           |
| `next.config.ts`, `next.config.test.ts` (new)                                                                         | redirects for the three old URLs                                                                                                          |
| deleted                                                                                                               | `app/(dashboard)/admin/permissions/**`, `app/(dashboard)/divisions/[id]/edit/**`, `components/admin/{entity,field}-permission-toggle.tsx` |
| `components/sidebar.tsx`, `CLAUDE.md`, `documentation/project-plan.md`, `components/aurora/ui/checkbox.tsx` (comment) | remove links / update docs                                                                                                                |

---

### Task 1: Shared field grants, labels and settings helpers

**Files:**

- Create: `lib/divisions/field-grants.ts`, `lib/divisions/field-grants.test.ts`
- Create: `lib/divisions/settings.ts`, `lib/divisions/settings.test.ts`
- Modify: `lib/labels.ts`

**Interfaces:**

- Produces:
  - `ALLOWED_FIELD_NAMES: ReadonlySet<string>`
  - `FIELD_GROUPS: readonly { label: string; fields: readonly string[] }[]`
  - `ENTITY_ROWS: readonly ('STAFF' | 'DEPARTMENT' | 'FACULTY')[]`, `ENTITY_ACTIONS: readonly ('CREATE' | 'UPDATE' | 'DELETE')[]`
  - `entityKey(entity: string, action: string): string` → `'STAFF:CREATE'`
  - `interface DivisionSettings { name: string; canModerateRating: boolean; canOverseeScience: boolean; canInviteStaff: boolean; canSetPasswords: boolean; canEndSessions: boolean; entityPermissions: string[]; fieldPermissions: string[] }`
  - `toSettings(row: DivisionRow): DivisionSettings` (sorted arrays)
  - `settingsEqual(a: DivisionSettings, b: DivisionSettings): boolean`
  - `describeEntities(keys: readonly string[]): string`, `describeFields(names: readonly string[]): string` (sorted, joined by `, `, `''` when empty)
  - labels: `ENTITY_TYPE_LABELS`, `ENTITY_ACTION_LABELS` in `lib/labels.ts`

- [ ] **Step 1: Write the failing tests**

`lib/divisions/field-grants.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));

import { isEditorWritableField } from '@/lib/permissions';
import {
  ALLOWED_FIELD_NAMES,
  ENTITY_ACTIONS,
  ENTITY_ROWS,
  FIELD_GROUPS,
  entityKey,
} from './field-grants';

describe('field grants', () => {
  it('shows only fields the server will accept', () => {
    // A checkbox the server then refuses would make the whole Save fail.
    for (const group of FIELD_GROUPS) {
      for (const field of group.fields) {
        expect(ALLOWED_FIELD_NAMES.has(field), field).toBe(true);
        expect(isEditorWritableField(field) || field === 'partTimeDepartmentIds', field).toBe(true);
      }
    }
  });

  it('never allows a confidential, account or scoping field', () => {
    for (const name of ['employmentRate', 'divisionId', 'passwordHash', 'role', 'tokenVersion']) {
      expect(ALLOWED_FIELD_NAMES.has(name), name).toBe(false);
    }
  });

  it('has no field in two groups', () => {
    const all = FIELD_GROUPS.flatMap((g) => [...g.fields]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keys an entity action', () => {
    expect(entityKey('STAFF', 'CREATE')).toBe('STAFF:CREATE');
    expect(ENTITY_ROWS).toEqual(['STAFF', 'DEPARTMENT', 'FACULTY']);
    expect(ENTITY_ACTIONS).toEqual(['CREATE', 'UPDATE', 'DELETE']);
  });
});
```

`lib/divisions/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  describeEntities,
  describeFields,
  settingsEqual,
  toSettings,
  type DivisionSettings,
} from './settings';

const row = {
  name: 'ННВ',
  canModerateRating: true,
  canOverseeScience: false,
  canInviteStaff: false,
  canSetPasswords: true,
  canEndSessions: false,
  entityPermissions: [
    { entity: 'STAFF' as const, action: 'UPDATE' as const },
    { entity: 'DEPARTMENT' as const, action: 'CREATE' as const },
  ],
  fieldPermissions: [{ fieldName: 'phone' }, { fieldName: 'email' }],
};

describe('toSettings', () => {
  it('turns a division row into form state with sorted sets', () => {
    expect(toSettings(row)).toEqual({
      name: 'ННВ',
      canModerateRating: true,
      canOverseeScience: false,
      canInviteStaff: false,
      canSetPasswords: true,
      canEndSessions: false,
      entityPermissions: ['DEPARTMENT:CREATE', 'STAFF:UPDATE'],
      fieldPermissions: ['email', 'phone'],
    });
  });

  it('copes with a division that has no rights at all', () => {
    const s = toSettings({ ...row, entityPermissions: [], fieldPermissions: [] });
    expect(s.entityPermissions).toEqual([]);
    expect(s.fieldPermissions).toEqual([]);
  });
});

describe('settingsEqual', () => {
  const base: DivisionSettings = toSettings(row);

  it('ignores the order of the sets', () => {
    expect(settingsEqual(base, { ...base, fieldPermissions: ['phone', 'email'] })).toBe(true);
  });

  it('sees every kind of change', () => {
    expect(settingsEqual(base, { ...base, name: 'Інший' })).toBe(false);
    expect(settingsEqual(base, { ...base, canEndSessions: true })).toBe(false);
    expect(settingsEqual(base, { ...base, entityPermissions: [] })).toBe(false);
    expect(settingsEqual(base, { ...base, fieldPermissions: ['email'] })).toBe(false);
  });

  it('does not count surrounding spaces in the name as a change', () => {
    expect(settingsEqual(base, { ...base, name: '  ННВ ' })).toBe(true);
  });
});

describe('audit descriptions', () => {
  it('names entity actions and fields in Ukrainian, sorted', () => {
    expect(describeEntities(['STAFF:UPDATE', 'DEPARTMENT:CREATE'])).toBe(
      'Кафедра — Створення, Персонал — Редагування'
    );
    expect(describeFields(['phone', 'email'])).toContain(', ');
    expect(describeEntities([])).toBe('');
    expect(describeFields([])).toBe('');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run lib/divisions`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`lib/labels.ts` — next to the other division labels (after `canEndSessions: …`) add to `FIELD_LABELS`:

```ts
  entityPermissions: 'Дії з сутностями',
  fieldPermissions: 'Доступ до полів',
```

and as separate exports at the end of the file (check that no `ENTITY_TYPE_LABELS` already exists: `grep -n "ENTITY_" lib/labels.ts`):

```ts
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  STAFF: 'Персонал',
  DEPARTMENT: 'Кафедра',
  FACULTY: 'Факультет',
};

export const ENTITY_ACTION_LABELS: Record<string, string> = {
  CREATE: 'Створення',
  UPDATE: 'Редагування',
  DELETE: 'Видалення',
};
```

`lib/divisions/field-grants.ts`:

```ts
import { ACADEMIC_EDITABLE_FIELDS } from '@/lib/staff/editable-fields';

/**
 * Which Staff fields ADMIN may grant to a division — one list for the form that
 * shows them and the action that accepts them, so a checkbox can never be drawn
 * that the server then refuses. (It lived in `admin/permissions/field/actions.ts`
 * until the permission screens were folded into the division settings page.)
 *
 * NOT divisionId — it decides an editor's own permission scope, see
 * PERMISSION_SCOPING_STAFF_FIELDS. NOT employmentRate, passwordHash, role or
 * tokenVersion either; the action also runs every name through
 * `isEditorWritableField`, so this list drifting cannot open them.
 */
export const ALLOWED_FIELD_NAMES: ReadonlySet<string> = new Set([
  'lastName',
  'firstName',
  'patronymic',
  'email',
  'phone',
  'isNpp',
  // «Академічна інформація» and «Освіта» (2026-10-06). The old academicRank /
  // scientificDegree / degreeDefenceDate / adminPosition are derived mirrors now
  // and nobody's to grant.
  ...ACADEMIC_EDITABLE_FIELDS,
  'wosUrl',
  'wosCitationCount',
  'scopusUrl',
  'scopusCitationCount',
  'googleScholarUrl',
  'googleScholarCitationCount',
  'orcidId',
  'departmentId',
  // Сумісництво (owner, 2026-08-26): a join table, checked separately by
  // `updateStaff`. Placing somebody on a second кафедра is structure.
  'partTimeDepartmentIds',
]);

/** The groups the page draws, in order. */
export const FIELD_GROUPS = [
  {
    label: 'Персональні дані',
    fields: ['lastName', 'firstName', 'patronymic', 'email', 'phone', 'isNpp'],
  },
  {
    label: 'Академічна інформація',
    fields: [
      'position',
      'academicTitle',
      'honoraryTitles',
      'adminPositions',
      'pedagogicalExperience',
    ],
  },
  {
    label: 'Освіта',
    fields: ['degrees', 'basicEducationMatch', 'basicEducationSpecialty'],
  },
  {
    label: 'Наукові профілі',
    fields: [
      'wosUrl',
      'wosCitationCount',
      'scopusUrl',
      'scopusCitationCount',
      'googleScholarUrl',
      'googleScholarCitationCount',
      'orcidId',
    ],
  },
  {
    label: 'Організаційне',
    fields: ['departmentId', 'partTimeDepartmentIds'],
  },
] as const;

export const ENTITY_ROWS = ['STAFF', 'DEPARTMENT', 'FACULTY'] as const;
export const ENTITY_ACTIONS = ['CREATE', 'UPDATE', 'DELETE'] as const;

export function entityKey(entity: string, action: string): string {
  return `${entity}:${action}`;
}
```

`lib/divisions/settings.ts`:

```ts
import { ENTITY_ACTION_LABELS, ENTITY_TYPE_LABELS, FIELD_LABELS } from '@/lib/labels';
import { entityKey } from './field-grants';

/** Everything the settings page edits, as plain data. */
export interface DivisionSettings {
  name: string;
  canModerateRating: boolean;
  canOverseeScience: boolean;
  canInviteStaff: boolean;
  canSetPasswords: boolean;
  canEndSessions: boolean;
  /** «STAFF:CREATE» … sorted */
  entityPermissions: string[];
  /** Staff field names, sorted */
  fieldPermissions: string[];
}

export interface DivisionRow {
  name: string;
  canModerateRating: boolean;
  canOverseeScience: boolean;
  canInviteStaff: boolean;
  canSetPasswords: boolean;
  canEndSessions: boolean;
  entityPermissions: { entity: string; action: string }[];
  fieldPermissions: { fieldName: string }[];
}

export function toSettings(row: DivisionRow): DivisionSettings {
  return {
    name: row.name,
    canModerateRating: row.canModerateRating,
    canOverseeScience: row.canOverseeScience,
    canInviteStaff: row.canInviteStaff,
    canSetPasswords: row.canSetPasswords,
    canEndSessions: row.canEndSessions,
    entityPermissions: row.entityPermissions.map((p) => entityKey(p.entity, p.action)).sort(),
    fieldPermissions: row.fieldPermissions.map((p) => p.fieldName).sort(),
  };
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/** «Did anything change?» — what enables the Save button. */
export function settingsEqual(a: DivisionSettings, b: DivisionSettings): boolean {
  return (
    a.name.trim() === b.name.trim() &&
    a.canModerateRating === b.canModerateRating &&
    a.canOverseeScience === b.canOverseeScience &&
    a.canInviteStaff === b.canInviteStaff &&
    a.canSetPasswords === b.canSetPasswords &&
    a.canEndSessions === b.canEndSessions &&
    sameSet(a.entityPermissions, b.entityPermissions) &&
    sameSet(a.fieldPermissions, b.fieldPermissions)
  );
}

/** One readable string for the audit log — `diffChanges` compares primitives. */
export function describeEntities(keys: readonly string[]): string {
  return keys
    .map((key) => {
      const [entity, action] = key.split(':');
      return `${ENTITY_TYPE_LABELS[entity] ?? entity} — ${ENTITY_ACTION_LABELS[action] ?? action}`;
    })
    .sort((x, y) => x.localeCompare(y, 'uk'))
    .join(', ');
}

export function describeFields(names: readonly string[]): string {
  return names
    .map((n) => FIELD_LABELS[n] ?? n)
    .sort((x, y) => x.localeCompare(y, 'uk'))
    .join(', ');
}
```

- [ ] **Step 4: Run to see them pass**

Run: `pnpm vitest run lib/divisions && pnpm type-check`
Expected: PASS. (If `isEditorWritableField('partTimeDepartmentIds')` is false in the first test, that is why the test also allows that one name — keep it.)

- [ ] **Step 5: Commit** — `/commit` (`feat(division): shared field grants and settings helpers`).

---

### Task 2: `updateDivisionSettings` action

**Files:**

- Modify: `validations/division.ts`
- Modify: `app/(dashboard)/divisions/actions.ts` (add `updateDivisionSettings`; remove `updateDivision`; keep `createDivision`/`deleteDivision`)
- Modify: `app/(dashboard)/divisions/actions.test.ts`

**Interfaces:**

- Consumes: Task 1 (`ALLOWED_FIELD_NAMES`, `ENTITY_ROWS`, `ENTITY_ACTIONS`, `describeEntities`, `describeFields`).
- Produces: `divisionSettingsSchema`, `type DivisionSettingsSchema`, `updateDivisionSettings(id: string, data: DivisionSettingsSchema): Promise<DivisionActionState>` returning `{ redirectTo: '/divisions/<id>' }` on success.

- [ ] **Step 1: Write the failing tests** — in `actions.test.ts`:

Change the import to `import { createDivision, deleteDivision, updateDivisionSettings } from './actions';`, extend the `db` mock with nothing new (the action runs inside `$transaction`), and extend `mockTx` so its `division.findUnique` also returns empty `entityPermissions` / `fieldPermissions` and the tx has the two permission tables:

```ts
      findUnique: vi.fn().mockResolvedValue({
        name: 'ННВ',
        canModerateRating: true,
        canOverseeScience: false,
        canInviteStaff: false,
        canSetPasswords: false,
        canEndSessions: false,
        entityPermissions: [],
        fieldPermissions: [],
      }),
```

and, beside `auditLog`:

```ts
    divisionEntityPermission: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    divisionFieldPermission: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
```

Delete every existing test that calls `updateDivision` and **port** its assertions into this block (switches written + audited, as the Task 1 of the earlier feature did):

```ts
const full = {
  name: 'ННВ',
  canModerateRating: true,
  canOverseeScience: false,
  canInviteStaff: false,
  canSetPasswords: false,
  canEndSessions: false,
  entityPermissions: [] as string[],
  fieldPermissions: [] as string[],
};

describe('updateDivisionSettings', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
  });

  it('rejects EDITOR and USER, and touches nothing', async () => {
    for (const role of ['EDITOR', 'USER']) {
      mockAuth.mockResolvedValue({ user: { id: 'x', role, staffId: 's1' } });
      expect(await updateDivisionSettings('div-1', full)).toEqual({ error: 'Недостатньо прав' });
    }
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('writes the name and all five switches, and audits the change', async () => {
    const tx = mockTx();
    const result = await updateDivisionSettings('div-1', {
      ...full,
      canOverseeScience: true,
      canInviteStaff: true,
    });
    expect(result).toEqual({ redirectTo: '/divisions/div-1' });
    expect(tx.division.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'div-1' },
        data: expect.objectContaining({
          name: 'ННВ',
          canOverseeScience: true,
          canInviteStaff: true,
          canSetPasswords: false,
        }),
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const { changes } = tx.auditLog.create.mock.calls[0][0].data;
    expect(changes).toHaveProperty('canOverseeScience');
    expect(changes).toHaveProperty('canInviteStaff');
    expect(changes).not.toHaveProperty('canEndSessions');
  });

  it('replaces both permission sets exactly', async () => {
    const tx = mockTx();
    await updateDivisionSettings('div-1', {
      ...full,
      entityPermissions: ['STAFF:UPDATE', 'DEPARTMENT:CREATE'],
      fieldPermissions: ['phone', 'email'],
    });
    expect(tx.divisionEntityPermission.deleteMany).toHaveBeenCalledWith({
      where: { divisionId: 'div-1' },
    });
    expect(tx.divisionEntityPermission.createMany).toHaveBeenCalledWith({
      data: [
        { divisionId: 'div-1', entity: 'STAFF', action: 'UPDATE' },
        { divisionId: 'div-1', entity: 'DEPARTMENT', action: 'CREATE' },
      ],
    });
    expect(tx.divisionFieldPermission.deleteMany).toHaveBeenCalledWith({
      where: { divisionId: 'div-1' },
    });
    expect(tx.divisionFieldPermission.createMany).toHaveBeenCalledWith({
      data: [
        { divisionId: 'div-1', fieldName: 'phone' },
        { divisionId: 'div-1', fieldName: 'email' },
      ],
    });
  });

  // `deleteMany where NOT in []` would be a trap; clearing is delete-all + create-none.
  it('clears both sets when none are submitted', async () => {
    const tx = mockTx();
    mockDivisionRowWith(tx, {
      entityPermissions: [{ entity: 'STAFF', action: 'UPDATE' }],
      fieldPermissions: [{ fieldName: 'phone' }],
    });
    await updateDivisionSettings('div-1', full);
    expect(tx.divisionEntityPermission.deleteMany).toHaveBeenCalledWith({
      where: { divisionId: 'div-1' },
    });
    expect(tx.divisionFieldPermission.deleteMany).toHaveBeenCalledWith({
      where: { divisionId: 'div-1' },
    });
    expect(tx.divisionEntityPermission.createMany).not.toHaveBeenCalled();
    expect(tx.divisionFieldPermission.createMany).not.toHaveBeenCalled();
    const { changes } = tx.auditLog.create.mock.calls[0][0].data;
    expect(changes).toHaveProperty('entityPermissions');
    expect(changes).toHaveProperty('fieldPermissions');
  });

  it.each(['employmentRate', 'divisionId', 'passwordHash', 'role', 'notAField'])(
    'refuses %s anywhere in the list and writes nothing at all',
    async (name) => {
      const tx = mockTx();
      expect(
        await updateDivisionSettings('div-1', {
          ...full,
          canEndSessions: true,
          fieldPermissions: ['phone', name],
        })
      ).toEqual({ error: 'Невідоме поле' });
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(tx.division.update).not.toHaveBeenCalled();
    }
  );

  it('refuses a malformed entity key', async () => {
    expect(
      await updateDivisionSettings('div-1', { ...full, entityPermissions: ['STAFF:EXPLODE'] })
    ).toEqual({
      error: 'Невірні дані',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses an empty name', async () => {
    expect(await updateDivisionSettings('div-1', { ...full, name: '   ' })).toEqual({
      error: 'Невірні дані',
    });
  });

  it('answers «не знайдено» for a division that is gone', async () => {
    const tx = mockTx();
    tx.division.findUnique.mockResolvedValue(null);
    expect(await updateDivisionSettings('nope', full)).toEqual({ error: 'Відділ не знайдено' });
    expect(tx.division.update).not.toHaveBeenCalled();
  });

  it('writes nothing when a step inside the transaction fails', async () => {
    const tx = mockTx();
    tx.divisionFieldPermission.createMany.mockRejectedValue(new Error('db down'));
    const result = await updateDivisionSettings('div-1', { ...full, fieldPermissions: ['phone'] });
    expect(result).toEqual({ error: 'Не вдалося зберегти. Зміни не застосовано' });
  });
});
```

Add the small helper used above, next to `mockTx`:

```ts
function mockDivisionRowWith(
  tx: ReturnType<typeof mockTx>,
  extra: {
    entityPermissions?: { entity: string; action: string }[];
    fieldPermissions?: { fieldName: string }[];
  }
) {
  tx.division.findUnique.mockResolvedValue({
    name: 'ННВ',
    canModerateRating: true,
    canOverseeScience: false,
    canInviteStaff: false,
    canSetPasswords: false,
    canEndSessions: false,
    entityPermissions: [],
    fieldPermissions: [],
    ...extra,
  });
}
```

(The «rolls back» test relies on Prisma's transaction semantics in production; with the mocked `$transaction` it asserts the action turns the thrown error into the sentence and returns, which is what the caller sees.)

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run "app/(dashboard)/divisions/actions.test.ts"`
Expected: FAIL (`updateDivisionSettings` is not exported).

- [ ] **Step 3: Implement**

`validations/division.ts` — append:

```ts
export const divisionSettingsSchema = z.object({
  name: z.string().trim().min(1, { error: "Обов'язкове поле" }),
  canModerateRating: z.boolean(),
  canOverseeScience: z.boolean(),
  canInviteStaff: z.boolean(),
  canSetPasswords: z.boolean(),
  canEndSessions: z.boolean(),
  /** «STAFF:CREATE» … */
  entityPermissions: z.array(
    z.string().regex(/^(STAFF|DEPARTMENT|FACULTY):(CREATE|UPDATE|DELETE)$/)
  ),
  fieldPermissions: z.array(z.string()),
});

export type DivisionSettingsSchema = z.infer<typeof divisionSettingsSchema>;
```

`app/(dashboard)/divisions/actions.ts` — imports: add `divisionSettingsSchema, type DivisionSettingsSchema` to the validations import; `import { requireAdmin, isEditorWritableField } from '@/lib/permissions';` (replace the existing `requireAdmin`-only import); `import { ALLOWED_FIELD_NAMES } from '@/lib/divisions/field-grants';`; `import { describeEntities, describeFields } from '@/lib/divisions/settings';`.

Replace the whole `updateDivision` function with:

```ts
export async function updateDivisionSettings(
  id: string,
  data: DivisionSettingsSchema
): Promise<DivisionActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = divisionSettingsSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  // Whole-save refusal: one bad name anywhere and nothing is written. Neither
  // the form nor a hand-made request may grant a confidential, account or
  // permission-scoping field, however the allowed list drifts.
  const fields = [...new Set(parsed.data.fieldPermissions)];
  if (fields.some((f) => !isEditorWritableField(f) || !ALLOWED_FIELD_NAMES.has(f))) {
    return { error: 'Невідоме поле' };
  }
  const entities = [...new Set(parsed.data.entityPermissions)];

  let dbError: string | null = null;
  let missing = false;

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.division.findUnique({
        where: { id },
        select: {
          name: true,
          canModerateRating: true,
          canOverseeScience: true,
          canInviteStaff: true,
          canSetPasswords: true,
          canEndSessions: true,
          entityPermissions: { select: { entity: true, action: true } },
          fieldPermissions: { select: { fieldName: true } },
        },
      });
      if (!existing) {
        missing = true;
        return;
      }

      // One audit entry for the whole save. `diffChanges` compares primitives,
      // so each set becomes one readable string.
      const changes = diffChanges(
        {
          ...switchesOf(existing),
          name: existing.name,
          entityPermissions:
            describeEntities(existing.entityPermissions.map((p) => `${p.entity}:${p.action}`)) ||
            null,
          fieldPermissions:
            describeFields(existing.fieldPermissions.map((p) => p.fieldName)) || null,
        },
        {
          ...switchesOf(parsed.data),
          name: parsed.data.name,
          entityPermissions: describeEntities(entities) || null,
          fieldPermissions: describeFields(fields) || null,
        }
      );

      await tx.division.update({
        where: { id },
        data: {
          name: parsed.data.name,
          canModerateRating: parsed.data.canModerateRating,
          canOverseeScience: parsed.data.canOverseeScience,
          canInviteStaff: parsed.data.canInviteStaff,
          canSetPasswords: parsed.data.canSetPasswords,
          canEndSessions: parsed.data.canEndSessions,
        },
      });

      // Replace, never diff: delete the division's rows and write the submitted
      // ones. Clearing is delete-all with nothing created — no «NOT IN []» case.
      await tx.divisionEntityPermission.deleteMany({ where: { divisionId: id } });
      if (entities.length > 0) {
        await tx.divisionEntityPermission.createMany({
          data: entities.map((key) => {
            const [entity, action] = key.split(':') as [
              'STAFF' | 'DEPARTMENT' | 'FACULTY',
              'CREATE' | 'UPDATE' | 'DELETE',
            ];
            return { divisionId: id, entity, action };
          }),
        });
      }
      await tx.divisionFieldPermission.deleteMany({ where: { divisionId: id } });
      if (fields.length > 0) {
        await tx.divisionFieldPermission.createMany({
          data: fields.map((fieldName) => ({ divisionId: id, fieldName })),
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Division',
          entityId: id,
          label: parsed.data.name,
          userId: session.user.id,
          changes,
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(
      e,
      'Не вдалося зберегти. Зміни не застосовано',
      'division.updateDivisionSettings',
      { userId: session.user.id }
    );
  }

  if (missing) return { error: 'Відділ не знайдено' };
  if (dbError) return { error: dbError };
  revalidateDivisions(id);
  return { redirectTo: `/divisions/${id}` };
}
```

`switchesOf` already exists in this file (Task 1 of the previous feature; it maps the five `SWITCHES` keys). If its parameter type rejects `existing` / `parsed.data`, widen it to `Partial<Record<(typeof SWITCHES)[number], boolean | null | undefined>>`.

Leave `revalidateDivisions` as it is for now (Task 4 prunes it). `createDivision` and `deleteDivision` are untouched.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm vitest run "app/(dashboard)/divisions/actions.test.ts" && pnpm type-check`
Expected: PASS. (`type-check` will fail in `divisions/[id]/edit/page.tsx`, which still imports `updateDivision` — fix by Task 3; to keep this commit green, change that single import line and the `action={…}` of the edit page to a temporary stub? No: instead keep `updateDivision` exported until Task 3 deletes the edit page. **So in this task do NOT delete `updateDivision`; delete it in Task 3.** Keep its old tests too until then; only ADD the new ones.)

- [ ] **Step 5: Commit** — `/commit` (`feat(division): one action saves a division's whole settings`).

---

### Task 3: The settings page and form

**Files:**

- Modify (replace): `app/(dashboard)/divisions/[id]/page.tsx`
- Create: `components/division/division-settings-form.tsx`
- Delete: `app/(dashboard)/divisions/[id]/edit/page.tsx` (and its folder)
- Modify: `app/(dashboard)/divisions/actions.ts` (delete `updateDivision`), `app/(dashboard)/divisions/actions.test.ts` (delete the old `updateDivision` tests)
- Modify: `components/division/create-division-dialog.tsx` (comment only: `DivisionForm` now has one caller)

**Interfaces:**

- Consumes: `updateDivisionSettings`, `toSettings`, `settingsEqual`, `DivisionSettings`, `FIELD_GROUPS`, `ENTITY_ROWS`, `ENTITY_ACTIONS`, `entityKey`, `ENTITY_TYPE_LABELS`.
- Produces: `DivisionSettingsForm({ divisionId, initial })`.

- [ ] **Step 1: The form** — `components/division/division-settings-form.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/aurora/ui/button';
import { Checkbox } from '@/components/aurora/ui/checkbox';
import { Input } from '@/components/aurora/ui/input';
import { Switch } from '@/components/aurora/ui/switch';
import { updateDivisionSettings } from '@/app/(dashboard)/divisions/actions';
import { ENTITY_ACTIONS, ENTITY_ROWS, FIELD_GROUPS, entityKey } from '@/lib/divisions/field-grants';
import { settingsEqual, type DivisionSettings } from '@/lib/divisions/settings';
import { ENTITY_TYPE_LABELS, FIELD_LABELS } from '@/lib/labels';

/** Column headings of the entity table — verbs, unlike the audit wording. */
const ACTION_HEADINGS = { CREATE: 'Створювати', UPDATE: 'Редагувати', DELETE: 'Видаляти' } as const;

const SWITCHES: {
  key: keyof Pick<
    DivisionSettings,
    | 'canModerateRating'
    | 'canOverseeScience'
    | 'canInviteStaff'
    | 'canSetPasswords'
    | 'canEndSessions'
  >;
  label: string;
  help: string;
}[] = [
  {
    key: 'canModerateRating',
    label: 'Модерація рейтингу',
    help: 'Редактори цього відділу зможуть відхиляти подання НПП із зазначенням причини та позначати публікації як перевірені',
  },
  {
    key: 'canOverseeScience',
    label: 'Перевірка науки',
    help: 'Редактори цього відділу бачитимуть плани й виконання наукової роботи всіх НПП, відкриватимуть файли підтвердження та зможуть відхиляти записи',
  },
  {
    key: 'canInviteStaff',
    label: 'Надсилання запрошень',
    help: 'Редактори цього відділу зможуть надіслати запрошення людині, яка ще не активувала обліковий запис',
  },
  {
    key: 'canSetPasswords',
    label: 'Встановлення й скидання паролів',
    help: 'Редактори зможуть задати пароль вручну (лише тому, хто ще не активував обліковий запис) або скинути його (пароль видаляється, а на пошту йде посилання)',
  },
  {
    key: 'canEndSessions',
    label: 'Завершення всіх сесій',
    help: 'Редактори зможуть вийти за людину з усіх пристроїв',
  },
];

function toggle(list: string[], value: string, on: boolean): string[] {
  const without = list.filter((v) => v !== value);
  return on ? [...without, value] : without;
}

export function DivisionSettingsForm({
  divisionId,
  initial,
}: {
  divisionId: string;
  initial: DivisionSettings;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState<DivisionSettings>(initial);

  const changed = !settingsEqual(value, initial);
  const nameMissing = value.name.trim() === '';

  function save() {
    startTransition(async () => {
      try {
        const result = await updateDivisionSettings(divisionId, value);
        if ('error' in result) {
          toast.error(result.error);
          return;
        }
        toast.success('Збережено');
        router.refresh();
      } catch {
        toast.error('Не вдалося зберегти. Зміни не застосовано');
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-5 rounded-xl border bg-card p-5">
        <div className="space-y-2">
          <label htmlFor="division-name" className="text-sm font-medium">
            Назва *
          </label>
          <Input
            id="division-name"
            value={value.name}
            disabled={isPending}
            aria-invalid={nameMissing}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
          {nameMissing && <p className="text-sm text-error">Обов&apos;язкове поле</p>}
        </div>
      </section>

      <section className="space-y-5 rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Права відділу</h2>
        {SWITCHES.map((s) => (
          <label key={s.key} className="flex cursor-pointer items-start gap-3">
            <Switch
              checked={value[s.key]}
              disabled={isPending}
              onCheckedChange={(on) => setValue({ ...value, [s.key]: on })}
            />
            <span className="text-sm">
              {s.label}
              <span className="block text-xs text-muted-foreground">{s.help}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-muted-foreground">
          Керування обліковими записами — лише для звичайних співробітників. Облікові записи
          адміністраторів і редакторів змінює тільки адміністратор.
        </p>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-5 py-3">
          <h2 className="text-sm font-semibold tracking-wide uppercase">Дії з сутностями</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">Сутність</th>
              {ENTITY_ACTIONS.map((a) => (
                <th key={a} className="px-4 py-3 text-center font-medium text-muted-foreground">
                  {ACTION_HEADINGS[a]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ENTITY_ROWS.map((entity) => (
              <tr key={entity} className="border-b last:border-0">
                <td className="px-5 py-3 font-medium">{ENTITY_TYPE_LABELS[entity]}</td>
                {ENTITY_ACTIONS.map((action) => {
                  const key = entityKey(entity, action);
                  return (
                    <td key={action} className="px-4 py-3 text-center">
                      <Checkbox
                        aria-label={`${ENTITY_TYPE_LABELS[entity]}: ${ACTION_HEADINGS[action]}`}
                        checked={value.entityPermissions.includes(key)}
                        disabled={isPending}
                        onCheckedChange={(on) =>
                          setValue({
                            ...value,
                            entityPermissions: toggle(value.entityPermissions, key, on === true),
                          })
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Доступ до полів</h2>
        <p className="text-sm text-foreground-soft">
          Які поля персоналу редактори цього відділу можуть змінювати
        </p>
        {FIELD_GROUPS.map((group) => (
          <div key={group.label} className="rounded-xl border bg-card">
            <div className="border-b px-5 py-3">
              <p className="text-sm font-medium">{group.label}</p>
            </div>
            <div className="divide-y">
              {group.fields.map((field) => (
                <label
                  key={field}
                  className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-muted/30"
                >
                  <Checkbox
                    checked={value.fieldPermissions.includes(field)}
                    disabled={isPending}
                    onCheckedChange={(on) =>
                      setValue({
                        ...value,
                        fieldPermissions: toggle(value.fieldPermissions, field, on === true),
                      })
                    }
                  />
                  <span className="text-sm">{FIELD_LABELS[field] ?? field}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <Button disabled={isPending || !changed || nameMissing} onClick={save}>
          {isPending ? 'Збереження...' : 'Зберегти'}
        </Button>
        <Button
          variant="outline"
          disabled={isPending || !changed}
          onClick={() => setValue(initial)}
        >
          Скасувати зміни
        </Button>
      </div>
    </div>
  );
}
```

Check the real prop names of the aurora `Switch`, `Checkbox`, `Input` and `Button` (`components/aurora/ui/*.tsx`) before relying on `onCheckedChange` / `variant`; they follow Radix and shadcn, which `division-form.tsx` and `account-card.tsx` already use the same way.

- [ ] **Step 2: The page** — replace `app/(dashboard)/divisions/[id]/page.tsx` with:

```tsx
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { DeleteDivisionButton } from '@/components/division/delete-button';
import { DivisionSettingsForm } from '@/components/division/division-settings-form';
import { toSettings } from '@/lib/divisions/settings';

/**
 * «Налаштування відділу» — every right ADMIN gives a division, on one page and
 * saved with one button (owner, 2026-10-12). It replaces the read-only chip page,
 * the separate edit form and the two permission screens «Поля доступу» and
 * «Дії доступу».
 *
 * ADMIN only, like the list: this page edits the permission system itself.
 */
export default async function DivisionSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const division = await db.division.findUnique({
    where: { id },
    select: {
      name: true,
      canModerateRating: true,
      canOverseeScience: true,
      canInviteStaff: true,
      canSetPasswords: true,
      canEndSessions: true,
      _count: { select: { staff: true } },
      entityPermissions: { select: { entity: true, action: true } },
      fieldPermissions: { select: { fieldName: true } },
    },
  });
  if (!division) notFound();

  const initial = toSettings(division);

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/divisions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Відділи
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{division.name}</h1>
          <p className="mt-0.5 text-sm text-foreground-soft">
            Налаштування · {division._count.staff} співробітників
          </p>
        </div>
        <DeleteDivisionButton divisionId={id} divisionName={division.name} />
      </div>

      {/* Keyed by the saved state: after a save the page re-renders with fresh
          props and the form starts again from them, so «changed?» resets. */}
      <DivisionSettingsForm key={JSON.stringify(initial)} divisionId={id} initial={initial} />
    </div>
  );
}
```

- [ ] **Step 3: Remove the old edit route and the superseded action**

Delete `app/(dashboard)/divisions/[id]/edit/` (page and any loading file). In `divisions/actions.ts` delete `updateDivision` entirely and the `updateDivision` tests in `actions.test.ts` (their assertions were ported in Task 2). In `create-division-dialog.tsx` change the doc comment sentence «it still has one other caller, `/divisions/[id]/edit`» to say the dialog is now its only caller.

- [ ] **Step 4: Verify**

Run: `pnpm type-check && pnpm lint && pnpm vitest run "app/(dashboard)/divisions"`
Expected: PASS. Then `pnpm test` fully.

- [ ] **Step 5: Commit** — `/commit` (`feat(division): one settings page per division`).

---

### Task 4: Remove the old screens and redirect their URLs

**Files:**

- Delete: `app/(dashboard)/admin/permissions/` (field and entity: pages, actions, tests, loading files), `components/admin/entity-permission-toggle.tsx`, `components/admin/field-permission-toggle.tsx`
- Modify: `components/sidebar.tsx`, `next.config.ts`, `app/(dashboard)/divisions/actions.ts` (`revalidateDivisions`)
- Create: `next.config.test.ts`

**Interfaces:** Consumes Task 3 (the new page). Produces redirects for `/admin/permissions/field`, `/admin/permissions/entity`, `/divisions/:id/edit`.

- [ ] **Step 1: Write the failing test** — `next.config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

describe('redirects for the removed permission screens', () => {
  it('sends the three old URLs to the division pages', async () => {
    const redirects = await nextConfig.redirects!();
    const to = (source: string) => redirects.find((r) => r.source === source)?.destination;
    expect(to('/admin/permissions/field')).toBe('/divisions');
    expect(to('/admin/permissions/entity')).toBe('/divisions');
    expect(to('/divisions/:id/edit')).toBe('/divisions/:id');
    expect(redirects.every((r) => r.permanent === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it** — `pnpm vitest run next.config.test.ts` → FAIL (`redirects` undefined).

- [ ] **Step 3: Implement**

`next.config.ts`, inside `nextConfig` after `headers()`:

```ts
  /**
   * The permission screens were folded into the division settings page
   * (2026-10-12). Their URLs may be bookmarked; not permanent, so a browser does
   * not remember them if a screen ever returns.
   */
  async redirects() {
    return [
      { source: '/admin/permissions/field', destination: '/divisions', permanent: false },
      { source: '/admin/permissions/entity', destination: '/divisions', permanent: false },
      { source: '/divisions/:id/edit', destination: '/divisions/:id', permanent: false },
    ];
  },
```

Delete the old files listed above. `components/sidebar.tsx`: remove the two `ADMINISTRATION_NAV` entries `/admin/permissions/field` and `/admin/permissions/entity`, and drop the then-unused `KeyRound` / `ShieldCheck` imports. `revalidateDivisions` in `divisions/actions.ts`: delete the two `revalidatePath('/admin/permissions/...')` lines.

Update the docstring above `ADMINISTRATION_NAV` only if it mentions who may edit what screens (it says «who may edit what» — change to «what a відділ may do» is optional; keep it accurate).

- [ ] **Step 4: Verify**

Run: `pnpm vitest run next.config.test.ts && pnpm type-check && pnpm lint && pnpm test`
Expected: all PASS. Also `grep -rn "admin/permissions" app components lib --include=*.ts --include=*.tsx` must list only the redirect config and comments you update in Task 5.

- [ ] **Step 5: Commit** — `/commit` (`refactor(permissions): fold permission screens into division settings`).

---

### Task 5: Docs and final verification

**Files:** Modify `CLAUDE.md`, `documentation/project-plan.md`, `components/aurora/ui/checkbox.tsx` (comment only), `docs/superpowers/specs/2026-10-12-division-settings-page-design.md` (file location line).

- [ ] **Step 1: CLAUDE.md** — update (a) the folder tree: remove `permissions/ field/ entity/` under `admin/` and say division rights live on `divisions/[id]` (settings page); (b) the sentence «When adding a new editable Staff field, also add it to `ALLOWED_FIELD_NAMES` in `app/(dashboard)/admin/permissions/field/actions.ts` and to `FIELD_GROUPS` in `…/field/page.tsx`» → both now live in `lib/divisions/field-grants.ts`; (c) in «Permission model» add one sentence: all division rights (name, switches, entity actions, field access) are edited on `/divisions/[id]` with one Save, ADMIN only, audited as one entry (owner, 2026-10-12).
- [ ] **Step 2: Other docs** — `documentation/project-plan.md` (the two «permissions» sections around lines 141-148): point them at the settings page. `components/aurora/ui/checkbox.tsx`: in the doc comment, change «`/admin/permissions/field` and `/admin/permissions/entity` use a bare input» to past tense «used … until they were folded into the division settings page». Spec: change the shared-file path to `lib/divisions/field-grants.ts`.
- [ ] **Step 3: Verify** — `pnpm lint && pnpm type-check && pnpm test` all green; report real numbers.
- [ ] **Step 4: Browser check (owner)** — as ADMIN: `/divisions` → open a division → one page with name, five switches, 3×3 table, grouped fields; Save disabled until a change; change a switch, a table box and a field, press Зберегти → toast, state persists after reload; Скасувати зміни reverts; the audit log shows ONE entry listing every change; sidebar has no «Поля доступу»/«Дії доступу»; `/admin/permissions/field`, `/admin/permissions/entity` and `/divisions/<id>/edit` land on `/divisions` or the new page; an EDITOR cannot open `/divisions/<id>`.
- [ ] **Step 5: Commit** — `/commit` (`docs(division): document the settings page`).

---

## Self-Review

- **Spec coverage:** one page and its five sections → Task 3; one Save with changed/disabled logic → Tasks 1 (`settingsEqual`) and 3; `updateDivisionSettings` (admin, schema, whole-save field refusal, one transaction, replace sets, one audit entry, `parseDbError`) → Task 2; allowed fields shared → Task 1; audit labels → Task 1; removal of screens, sidebar, redirects, `revalidateDivisions` → Task 4; create dialog unchanged → untouched (comment only in Task 3); docs → Task 5; tests list → Tasks 1-4; browser check → Task 5. The spec's path `lib/permissions/division-fields.ts` is replaced by `lib/divisions/field-grants.ts` (declared in Global Constraints).
- **Placeholders:** the one deliberate «read the real prop names» (Task 3, Step 1) is a verification instruction with the expected shape given; `switchesOf`'s exact parameter type is named with the widening to apply (Task 2).
- **Type consistency:** `DivisionSettings` (Task 1) is exactly what `updateDivisionSettings` accepts as `DivisionSettingsSchema` (Task 2) — both are `{ name; five booleans; entityPermissions: string[]; fieldPermissions: string[] }`, so the form passes `value` straight in; `entityKey` is `ENTITY:ACTION` everywhere (Tasks 1-3); `toSettings`/`settingsEqual` names match their uses.
- **Review Focus:** each line has a pinning test — forbidden names (Task 2 `it.each`), empty sets (Task 2 «clears both sets»), rollback (Task 2 failure test), grantable-only checkboxes (Task 1), redirects/sidebar (Task 4), empty-rights division (Task 1 `toSettings`).
- **Order dependency:** `updateDivision` stays exported through Task 2 so the old edit page keeps compiling; Task 3 deletes both together.
