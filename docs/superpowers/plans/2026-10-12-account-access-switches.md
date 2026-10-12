# Account Access Switches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show activation state to editors, heads and деканs; let ADMIN grant editors three account actions per division; limit emailed links to one per 60 s and three per 6 h per person.

**Architecture:** Three booleans on `Division` (the `canModerateRating` / `canOverseeScience` pattern) feed one guard, `canManageAccount`, in `lib/permissions.ts`. A new `MailSend` table records every letter that the mail server accepted; `lib/mail/allowance.ts` answers «may a letter go now?». Activation is exposed through a new `includeActivation` flag on `listStaff`, separate from the ADMIN-only `includeAccount`.

**Tech Stack:** Next.js 16 server actions, Prisma 7 (PostgreSQL), Zod 4, Vitest, React 19.

**Spec:** `docs/superpowers/specs/2026-10-12-account-access-switches-design.md`

## Global Constraints

- All UI text in Ukrainian; no hardcoded Ukrainian strings in logic files except existing action-return sentences (the project returns Ukrainian `error` strings from actions — keep that style).
- Every server action re-checks permission server-side; a component never decides.
- `passwordHash` never leaves the query layer — only a boolean.
- New Division/Staff fields need a `FIELD_LABELS` entry in `lib/labels.ts`.
- Errors: `logError(scope, e, context)`; never swallow one (CLAUDE.md «Errors: never swallow one»).
- Commits go through the `/commit` skill (project rule), one per task. Do not push, do not merge.
- Tests colocated, `*.test.ts(x)`. Run a single file with `pnpm vitest run <path>`.
- Aurora UI rules (`docs/aurora.md`) apply to any new markup; reuse `Badge` from `components/aurora/ui/badge`.
- Prisma 7: after editing `schema.prisma` run `pnpm db:generate`. Creating a migration needs Postgres running (`pnpm db:migrate --name <x>`); the owner starts Docker/dev themselves — if the DB is not up, stop and ask.
- Branch: `feat/account-access-switches` (already created, spec committed).
- Unchanged and ADMIN-only: `unlockLogin`, `changeRole`, `inviteBatch`, the «send invite» checkbox in `createStaff`, the `?activated=` filter, the staff Excel export. Archive stays on `STAFF DELETE`.
- Deviation from the spec: it said `forceLogout` on yourself «stays refused». It was only hidden in the UI. This plan does not add a server rule for ADMIN (unchanged); an EDITOR can never target themselves because only `USER` records are reachable.

## Review Focus

- An EDITOR holding «set pass» targeting an ADMIN or another EDITOR record → refused (account takeover). Pinned in Task 2 and Task 4.
- A letter whose send FAILED → must not count toward the 3-in-6-hours cap. Pinned in Task 3 (Step 6b).
- `/forgot-password` for a blocked address → answer identical to a known/unknown address (no enumeration). Pinned in Task 5.
- Row exactly 60 s / exactly 6 h old → counts as aged out (allowed). Pinned in Task 3.
- A non-admin must never receive `role` or `employmentRate` just because activation became visible. Pinned in Task 6.
- Editor with only «send invite» sees no «Скинути пароль» / «Завершити всі сесії» buttons. Pinned in Task 7.

## File Structure

| File                                                                                                                                                                        | Responsibility                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `prisma/schema.prisma` + 2 migrations                                                                                                                                       | `Division` flags; `MailSend` table + `MailKind` enum                           |
| `validations/division.ts`, `app/(dashboard)/divisions/actions.ts`, `components/division/division-form.tsx`, `app/(dashboard)/divisions/[id]/edit/page.tsx`, `lib/labels.ts` | the three switches on the division form                                        |
| `prisma/core-data.ts`, `core-import.ts`, `core-export.ts`                                                                                                                   | carry the switches through the core seed                                       |
| `lib/permissions.ts`                                                                                                                                                        | `AccountAction`, `accountGrantsFor`, `canManageAccount`                        |
| `lib/mail/allowance.ts` (new)                                                                                                                                               | pure `evaluateAllowance`, DB `mailAllowance`, `recordMailSent`, `retryMessage` |
| `lib/mail/invite.ts`                                                                                                                                                        | records a `MailSend` after a successful send                                   |
| `app/(dashboard)/staff/[id]/actions.ts`                                                                                                                                     | gate the four actions with the guard + allowance                               |
| `app/(auth)/forgot-password/actions.ts`, `page.tsx`                                                                                                                         | allowance replaces the local cooldown; rule stated in the text                 |
| `lib/queries/list-staff.ts`, `lib/staff/list-params.ts`                                                                                                                     | `includeActivation`                                                            |
| `components/staff/staff-table.tsx`, `app/(dashboard)/my-faculty/page.tsx`, `lib/queries/list-my-department.ts`, `app/(dashboard)/my-department/page.tsx`                    | activation pill for editors, деканs, heads                                     |
| `components/staff/profile/record-header.tsx`                                                                                                                                | band badge for every viewer                                                    |
| `components/staff/account-card.tsx`, `app/(dashboard)/staff/[id]/(record)/(profile)/page.tsx`                                                                               | per-grant controls for editors                                                 |
| `CLAUDE.md`                                                                                                                                                                 | document the switches and the limit                                            |

---

### Task 1: Division switches (schema, form, audit, core seed)

**Files:**

- Modify: `prisma/schema.prisma` (model `Division`, after `canOverseeScience`)
- Create: `prisma/migrations/20261012100000_division_account_switches/migration.sql` (by `pnpm db:migrate`)
- Modify: `validations/division.ts`
- Modify: `app/(dashboard)/divisions/actions.ts`
- Modify: `app/(dashboard)/divisions/actions.test.ts`
- Modify: `components/division/division-form.tsx`
- Modify: `app/(dashboard)/divisions/[id]/edit/page.tsx`
- Modify: `lib/labels.ts:144-145`
- Modify: `prisma/core-data.ts`, `prisma/core-import.ts`, `prisma/core-export.ts`

**Interfaces:**

- Produces: `Division.canInviteStaff`, `Division.canSetPasswords`, `Division.canEndSessions` (all `Boolean @default(false)`); `divisionSchema` fields of the same names. Task 2 reads these columns.

- [ ] **Step 1: Write the failing test** — in `app/(dashboard)/divisions/actions.test.ts`, find the existing test that asserts `canOverseeScience: true` is written (≈ line 120-141) and add beside it:

```ts
it('writes and audits the three account switches', async () => {
  const tx = mockTransactionWith({
    name: 'ННВ',
    canModerateRating: false,
    canOverseeScience: false,
  });
  await updateDivision('div-1', {
    name: 'ННВ',
    canModerateRating: false,
    canOverseeScience: false,
    canInviteStaff: true,
    canSetPasswords: true,
    canEndSessions: false,
  });
  expect(tx.division.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        canInviteStaff: true,
        canSetPasswords: true,
        canEndSessions: false,
      }),
    })
  );
  const { changes } = tx.auditLog.create.mock.calls[0][0].data;
  expect(changes).toHaveProperty('canInviteStaff');
  expect(changes).toHaveProperty('canSetPasswords');
});
```

Open the file first and reuse **its own** transaction-mock helper and `existing` row shape (the name `mockTransactionWith` above is a placeholder for whatever helper the neighbouring test at ≈ line 120 uses — copy that test, do not invent a helper). Also add the three keys (all `false`) to every `divisionSchema` payload and every `existing` select mock in this file so the older tests still type-check.

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run "app/(dashboard)/divisions/actions.test.ts"`
Expected: FAIL (`canInviteStaff` unknown / not written).

- [ ] **Step 3: Schema + validation + actions**

`prisma/schema.prisma`, inside `model Division`, after `canOverseeScience Boolean @default(false)`:

```prisma
  // Account actions ADMIN shares with this division's editors. Each applies to
  // USER records only (canMutateStaffRecord) and is read by
  // `accountGrantsFor` in lib/permissions.ts. Unlocking a login, changing a
  // role and bulk invites stay ADMIN-only.
  canInviteStaff  Boolean @default(false) // send / re-send an invitation
  canSetPasswords Boolean @default(false) // set a password, and reset one
  canEndSessions  Boolean @default(false) // «Завершити всі сесії»
```

Run: `pnpm db:generate`, then (Postgres up) `pnpm db:migrate --name division_account_switches`. Check the generated SQL contains three `ALTER TABLE "Division" ADD COLUMN ... BOOLEAN NOT NULL DEFAULT false` and nothing else; rename the folder to `20261012100000_division_account_switches` if the timestamp differs and the DB has not applied it yet — otherwise leave it.

`validations/division.ts` — append inside `z.object`:

```ts
  // Account actions shared with this division's editors (ADMIN-only to set).
  canInviteStaff: z.boolean().default(false),
  canSetPasswords: z.boolean().default(false),
  canEndSessions: z.boolean().default(false),
```

`app/(dashboard)/divisions/actions.ts` — add the three keys wherever `canOverseeScience` appears (create data, create audit object, update `select`, both `diffChanges` objects — `existing?.canInviteStaff ?? null` style — and `tx.division.update` data). Use a small local constant to avoid six copies:

```ts
const SWITCHES = [
  'canModerateRating',
  'canOverseeScience',
  'canInviteStaff',
  'canSetPasswords',
  'canEndSessions',
] as const;
function switchesOf(source: Record<(typeof SWITCHES)[number], boolean | null | undefined>) {
  return Object.fromEntries(SWITCHES.map((k) => [k, source[k] ?? null])) as Record<
    (typeof SWITCHES)[number],
    boolean | null
  >;
}
```

Use `switchesOf(parsed.data)` in the three data/audit spots and `switchesOf(existing ?? {})` for the «before» side. For `data:` in create/update, pass `Object.fromEntries(SWITCHES.map((k) => [k, parsed.data[k]]))`-equivalent explicit keys if the typed Prisma input complains — explicit keys are acceptable.

`lib/labels.ts` after `canOverseeScience`:

```ts
  canInviteStaff: 'Надсилання запрошень',
  canSetPasswords: 'Встановлення й скидання паролів',
  canEndSessions: 'Завершення всіх сесій',
```

- [ ] **Step 4: Form + edit page**

`components/division/division-form.tsx`: add the three names to `defaultValues` (`false`), and after the «Перевірка науки» label add a heading and three switches built exactly like the existing ones (copy the `<label className="flex cursor-pointer items-start gap-3">` block):

```tsx
<p className="text-sm font-medium">Керування обліковими записами</p>
```

with labels/help:

- `canInviteStaff` — «Надсилання запрошень» / «Редактори цього відділу зможуть надіслати запрошення людині, яка ще не активувала обліковий запис»
- `canSetPasswords` — «Встановлення й скидання паролів» / «Редактори зможуть задати пароль вручну або скинути його (пароль видаляється, а на пошту йде посилання)»
- `canEndSessions` — «Завершення всіх сесій» / «Редактори зможуть вийти за людину з усіх пристроїв»

Add one sentence under the heading: «Лише для звичайних співробітників. Облікові записи адміністраторів і редакторів змінює тільки адміністратор.»

`divisions/[id]/edit/page.tsx`: add the three columns to `select` and to `defaultValues`.

- [ ] **Step 5: Core seed**

`prisma/core-data.ts` `CoreDivision`: add optional `canInviteStaff?: boolean; canSetPasswords?: boolean; canEndSessions?: boolean;` (comment: optional — a file written before 2026-10-12 has none).
`core-import.ts`: in both `create` and `update`: `canInviteStaff: d.canInviteStaff ?? false, canSetPasswords: d.canSetPasswords ?? false, canEndSessions: d.canEndSessions ?? false`.
`core-export.ts`: add the three fields to the `divisions.map`.

- [ ] **Step 6: Verify**

Run: `pnpm vitest run "app/(dashboard)/divisions/actions.test.ts" && pnpm type-check`
Expected: PASS, no type errors (core-export/import tests, if present, still pass: `pnpm vitest run prisma`).

- [ ] **Step 7: Commit** — `/commit` (`db(schema): add division account switches`).

---

### Task 2: The account guard

**Files:**

- Modify: `lib/permissions.ts` (append after `canMutateStaffRecord`)
- Create: `lib/permissions-account.test.ts`

**Interfaces:**

- Consumes: `canMutateStaffRecord` (same file); `Division.canInviteStaff|canSetPasswords|canEndSessions` (Task 1).
- Produces:
  - `type AccountAction = 'invite' | 'password' | 'sessions'`
  - `type AccountGrants = Record<AccountAction, boolean>`
  - `accountGrantsFor(caller: { role: Role; staffId?: string | null }, target: { id: string; role: Role }): Promise<AccountGrants>`
  - `canManageAccount(caller, target, action: AccountAction): Promise<boolean>`

- [ ] **Step 1: Write the failing test** — `lib/permissions-account.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { staff: { findUnique: vi.fn() } } }));

import { db } from '@/lib/db';
import { accountGrantsFor, canManageAccount } from './permissions';

const mockStaffFind = db.staff.findUnique as unknown as Mock;

const editor = { role: 'EDITOR' as const, staffId: 'editor-1' };
const userTarget = { id: 'staff-1', role: 'USER' as const };
const none = { invite: false, password: false, sessions: false };

function divisionHolds(
  flags: Partial<Record<'canInviteStaff' | 'canSetPasswords' | 'canEndSessions', boolean>>
) {
  mockStaffFind.mockResolvedValue({
    division: { canInviteStaff: false, canSetPasswords: false, canEndSessions: false, ...flags },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('accountGrantsFor', () => {
  it('gives ADMIN everything without reading the database', async () => {
    const grants = await accountGrantsFor(
      { role: 'ADMIN', staffId: 'a' },
      { id: 'x', role: 'ADMIN' }
    );
    expect(grants).toEqual({ invite: true, password: true, sessions: true });
    expect(mockStaffFind).not.toHaveBeenCalled();
  });

  it('gives a USER nothing', async () => {
    expect(await accountGrantsFor({ role: 'USER', staffId: 'u' }, userTarget)).toEqual(none);
  });

  it('gives an EDITOR exactly the switches their division holds', async () => {
    divisionHolds({ canInviteStaff: true, canEndSessions: true });
    expect(await accountGrantsFor(editor, userTarget)).toEqual({
      invite: true,
      password: false,
      sessions: true,
    });
  });

  it('gives an EDITOR nothing when their division holds nothing', async () => {
    divisionHolds({});
    expect(await accountGrantsFor(editor, userTarget)).toEqual(none);
  });

  it('gives an EDITOR with no division nothing', async () => {
    mockStaffFind.mockResolvedValue({ division: null });
    expect(await accountGrantsFor(editor, userTarget)).toEqual(none);
  });

  // The takeover: «set pass» on an admin's record, then sign in as them.
  it('refuses every switch on an ADMIN or EDITOR record, however many are held', async () => {
    divisionHolds({ canInviteStaff: true, canSetPasswords: true, canEndSessions: true });
    expect(await accountGrantsFor(editor, { id: 'a', role: 'ADMIN' })).toEqual(none);
    expect(await accountGrantsFor(editor, { id: 'e2', role: 'EDITOR' })).toEqual(none);
  });

  it('refuses an EDITOR on their own record', async () => {
    divisionHolds({ canInviteStaff: true, canSetPasswords: true, canEndSessions: true });
    expect(await accountGrantsFor(editor, { id: 'editor-1', role: 'EDITOR' })).toEqual(none);
  });
});

describe('canManageAccount', () => {
  it('answers for one action', async () => {
    divisionHolds({ canSetPasswords: true });
    expect(await canManageAccount(editor, userTarget, 'password')).toBe(true);
    expect(await canManageAccount(editor, userTarget, 'sessions')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run lib/permissions-account.test.ts`
Expected: FAIL (`accountGrantsFor` is not exported).

- [ ] **Step 3: Implement** — append to `lib/permissions.ts`:

```ts
/**
 * The account actions ADMIN can share with a division's editors, one switch
 * each (owner, 2026-10-12). `password` covers setting a password AND resetting
 * one: whoever may set may reset. Unlocking a login, changing a role and bulk
 * invites are NOT here — they stay ADMIN's.
 */
export type AccountAction = 'invite' | 'password' | 'sessions';
export type AccountGrants = Record<AccountAction, boolean>;

const ALL_ACCOUNT_ACTIONS: AccountGrants = { invite: true, password: true, sessions: true };
const NO_ACCOUNT_ACTIONS: AccountGrants = { invite: false, password: false, sessions: false };

/**
 * Which account actions may this caller take on THIS person?
 *
 * ADMIN — all. EDITOR — the switches their division holds, and only on a USER
 * record: the same «whose record» rule as `canMutateStaffRecord`. Without it,
 * «set pass» would let an editor set an admin's password and sign in as them.
 * Everyone else — none; a завідувач or декан sees activation but acts on
 * nothing.
 *
 * One function for the pages (which button to draw) and the actions (which to
 * allow), so the two cannot disagree.
 */
export async function accountGrantsFor(
  caller: { role: Role; staffId?: string | null },
  target: { id: string; role: Role }
): Promise<AccountGrants> {
  if (caller.role === 'ADMIN') return ALL_ACCOUNT_ACTIONS;
  if (caller.role !== 'EDITOR' || !caller.staffId) return NO_ACCOUNT_ACTIONS;
  if (!canMutateStaffRecord(caller, target, { allowSelf: false })) return NO_ACCOUNT_ACTIONS;

  const row = await db.staff.findUnique({
    where: { id: caller.staffId },
    select: {
      division: {
        select: { canInviteStaff: true, canSetPasswords: true, canEndSessions: true },
      },
    },
  });
  const division = row?.division;
  return {
    invite: division?.canInviteStaff === true,
    password: division?.canSetPasswords === true,
    sessions: division?.canEndSessions === true,
  };
}

export async function canManageAccount(
  caller: { role: Role; staffId?: string | null },
  target: { id: string; role: Role },
  action: AccountAction
): Promise<boolean> {
  return (await accountGrantsFor(caller, target))[action];
}
```

- [ ] **Step 4: Run to see it pass**

Run: `pnpm vitest run lib/permissions-account.test.ts lib/permissions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — `/commit` (`feat(permissions): account guard for editors`).

---

### Task 3: Letter allowance (MailSend + 60 s / 3 per 6 h)

**Files:**

- Modify: `prisma/schema.prisma` (new enum + model; back-relation on `Staff`)
- Create: migration `…_mail_send` (by `pnpm db:migrate`)
- Create: `lib/mail/allowance.ts`, `lib/mail/allowance.test.ts`
- Modify: `lib/mail/invite.ts`
- Modify (mocks only, as needed): every test file that reaches the real `issueAndEmailLink` — see Step 7

**Interfaces:**

- Produces:
  - `MAIL_COOLDOWN_MS = 60_000`, `MAIL_CAP = 3`, `MAIL_WINDOW_MS = 21_600_000`
  - `type MailAllowance = { ok: true } | { ok: false; retryAt: Date }`
  - `evaluateAllowance(sentAt: readonly Date[], now: Date): MailAllowance` (pure)
  - `mailAllowance(staffId: string, now?: Date): Promise<MailAllowance>`
  - `recordMailSent(staffId: string, kind: 'invite' | 'reset', now?: Date): Promise<void>`
  - `retryMessage(retryAt: Date, now?: Date): string`

- [ ] **Step 1: Write the failing test** — `lib/mail/allowance.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { mailSend: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() } },
}));

import { db } from '@/lib/db';
import {
  MAIL_COOLDOWN_MS,
  MAIL_WINDOW_MS,
  evaluateAllowance,
  mailAllowance,
  recordMailSent,
  retryMessage,
} from './allowance';

const now = new Date('2026-10-12T10:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('evaluateAllowance', () => {
  it('allows the first letter', () => {
    expect(evaluateAllowance([], now)).toEqual({ ok: true });
  });

  it('blocks a second letter within a minute and says when', () => {
    const last = ago(59_000);
    expect(evaluateAllowance([last], now)).toEqual({
      ok: false,
      retryAt: new Date(last.getTime() + MAIL_COOLDOWN_MS),
    });
  });

  it('allows it at exactly a minute', () => {
    expect(evaluateAllowance([ago(MAIL_COOLDOWN_MS)], now)).toEqual({ ok: true });
  });

  it('allows a third letter', () => {
    expect(evaluateAllowance([ago(5 * HOUR), ago(3 * HOUR)], now)).toEqual({ ok: true });
  });

  it('blocks a fourth letter within six hours, until the oldest ages out', () => {
    const oldest = ago(5 * HOUR);
    const result = evaluateAllowance([oldest, ago(3 * HOUR), ago(2 * HOUR)], now);
    expect(result).toEqual({ ok: false, retryAt: new Date(oldest.getTime() + MAIL_WINDOW_MS) });
  });

  it('counts a letter exactly six hours old as aged out', () => {
    expect(evaluateAllowance([ago(MAIL_WINDOW_MS), ago(3 * HOUR), ago(2 * HOUR)], now)).toEqual({
      ok: true,
    });
  });

  it('with four letters in the window, waits for the SECOND oldest to age out', () => {
    const t = [ago(5.5 * HOUR), ago(5 * HOUR), ago(2 * HOUR), ago(1 * HOUR)];
    expect(evaluateAllowance(t, now)).toEqual({
      ok: false,
      retryAt: new Date(t[1].getTime() + MAIL_WINDOW_MS),
    });
  });

  it('reports the later of the two waits when both rules block', () => {
    const oldest = ago(5 * HOUR);
    const result = evaluateAllowance([oldest, ago(2 * HOUR), ago(10_000)], now);
    expect(result).toEqual({ ok: false, retryAt: new Date(oldest.getTime() + MAIL_WINDOW_MS) });
  });

  it('ignores order and letters outside the window', () => {
    expect(
      evaluateAllowance([ago(2 * HOUR), ago(7 * HOUR), ago(8 * HOUR), ago(9 * HOUR)], now)
    ).toEqual({
      ok: true,
    });
  });
});

describe('mailAllowance / recordMailSent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads only the window for that person', async () => {
    (db.mailSend.findMany as unknown as Mock).mockResolvedValue([]);
    expect(await mailAllowance('s1', now)).toEqual({ ok: true });
    expect(db.mailSend.findMany).toHaveBeenCalledWith({
      where: { staffId: 's1', sentAt: { gt: new Date(now.getTime() - MAIL_WINDOW_MS) } },
      select: { sentAt: true },
    });
  });

  it('writes the row and drops that person’s rows older than the window', async () => {
    await recordMailSent('s1', 'reset', now);
    expect(db.mailSend.create).toHaveBeenCalledWith({
      data: { staffId: 's1', kind: 'RESET', sentAt: now },
    });
    expect(db.mailSend.deleteMany).toHaveBeenCalledWith({
      where: { staffId: 's1', sentAt: { lte: new Date(now.getTime() - MAIL_WINDOW_MS) } },
    });
  });
});

describe('retryMessage', () => {
  it('names a clock time the same day (Kyiv)', () => {
    // 10:00Z is 13:00 in Kyiv in October
    expect(retryMessage(new Date('2026-10-12T11:32:00Z'), now)).toBe(
      'Лист уже надсилали. Спробуйте після 14:32'
    );
  });

  it('adds the date when the wait crosses midnight (Kyiv)', () => {
    expect(retryMessage(new Date('2026-10-12T22:30:00Z'), now)).toBe(
      'Лист уже надсилали. Спробуйте після 13.10, 01:30'
    );
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run lib/mail/allowance.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Schema + migration**

In `prisma/schema.prisma`, near `ActivationToken`:

```prisma
enum MailKind {
  INVITE
  RESET
}

/// One row per letter the mail server ACCEPTED (invite or reset link). Written
/// after the send, so a refused message never uses up one of the three letters
/// a person gets per six hours — see `lib/mail/allowance.ts`. Rows older than
/// the window are deleted whenever the same person is written again.
model MailSend {
  id      String   @id @default(cuid())
  staffId String
  staff   Staff    @relation(fields: [staffId], references: [id], onDelete: Cascade)
  kind    MailKind
  sentAt  DateTime @default(now())

  @@index([staffId, sentAt])
}
```

In `model Staff`, under `activationToken ActivationToken?` add `mailSends MailSend[]`.

Run `pnpm db:generate` then `pnpm db:migrate --name mail_send`. Expected SQL: `CREATE TYPE "MailKind"`, `CREATE TABLE "MailSend"`, an index, a FK with `ON DELETE CASCADE`.

- [ ] **Step 4: Implement** — `lib/mail/allowance.ts`:

```ts
import { db } from '@/lib/db';
import { KYIV } from '@/lib/kyiv-time';

/**
 * How often one person may be mailed an invite or reset link (owner,
 * 2026-10-12): at least a minute apart, at most three in six hours. If none of
 * three arrived that is the server's fault; a person who cannot find the
 * letter must not spend the Mailjet quota. ADMIN is exempt — the callers skip
 * the check, this module does not know who is asking.
 */
export const MAIL_COOLDOWN_MS = 60 * 1000;
export const MAIL_CAP = 3;
export const MAIL_WINDOW_MS = 6 * 60 * 60 * 1000;

export type MailAllowance = { ok: true } | { ok: false; retryAt: Date };

/**
 * Pure rule. A letter exactly `MAIL_WINDOW_MS` old no longer counts, and one
 * exactly `MAIL_COOLDOWN_MS` old no longer blocks — the answer's `retryAt` is
 * the first instant at which asking again succeeds.
 */
export function evaluateAllowance(sentAt: readonly Date[], now: Date): MailAllowance {
  const at = now.getTime();
  const times = sentAt
    .map((d) => d.getTime())
    .filter((t) => t > at - MAIL_WINDOW_MS)
    .sort((a, b) => a - b);

  let retry = 0;
  const newest = times[times.length - 1];
  if (newest !== undefined && at - newest < MAIL_COOLDOWN_MS) retry = newest + MAIL_COOLDOWN_MS;
  if (times.length >= MAIL_CAP) {
    // Enough of the oldest must age out to leave fewer than MAIL_CAP in the window.
    retry = Math.max(retry, times[times.length - MAIL_CAP] + MAIL_WINDOW_MS);
  }
  return retry ? { ok: false, retryAt: new Date(retry) } : { ok: true };
}

export async function mailAllowance(staffId: string, now = new Date()): Promise<MailAllowance> {
  const rows = await db.mailSend.findMany({
    where: { staffId, sentAt: { gt: new Date(now.getTime() - MAIL_WINDOW_MS) } },
    select: { sentAt: true },
  });
  return evaluateAllowance(
    rows.map((r) => r.sentAt),
    now
  );
}

/** Call ONLY after the mail server accepted the message. */
export async function recordMailSent(
  staffId: string,
  kind: 'invite' | 'reset',
  now = new Date()
): Promise<void> {
  await db.mailSend.create({
    data: { staffId, kind: kind === 'invite' ? 'INVITE' : 'RESET', sentAt: now },
  });
  await db.mailSend.deleteMany({
    where: { staffId, sentAt: { lte: new Date(now.getTime() - MAIL_WINDOW_MS) } },
  });
}

const dayKey = (d: Date) => d.toLocaleDateString('uk-UA', KYIV);

/** «Спробуйте після 14:32», with the date when the wait crosses midnight in Kyiv */
export function retryMessage(retryAt: Date, now = new Date()): string {
  const time = retryAt.toLocaleTimeString('uk-UA', { ...KYIV, hour: '2-digit', minute: '2-digit' });
  if (dayKey(retryAt) === dayKey(now)) return `Лист уже надсилали. Спробуйте після ${time}`;
  const date = retryAt.toLocaleDateString('uk-UA', { ...KYIV, day: '2-digit', month: '2-digit' });
  return `Лист уже надсилали. Спробуйте після ${date}, ${time}`;
}
```

If the date test fails because of ICU formatting (`13.10` vs `13.10.`), adjust the **test expectation** to what `toLocaleDateString('uk-UA', {day:'2-digit', month:'2-digit'})` actually prints on this machine, not the formatter.

- [ ] **Step 5: Run to see it pass**

Run: `pnpm vitest run lib/mail/allowance.test.ts`
Expected: PASS.

- [ ] **Step 6: Record on send** — `lib/mail/invite.ts`: `import { recordMailSent } from '@/lib/mail/allowance';` and after `await storeActivationToken(staff.id, minted);` add:

```ts
// Counted only once the message is away — a refused one must not use up
// one of the three letters (see lib/mail/allowance.ts).
await recordMailSent(staff.id, kind);
```

- [ ] **Step 6b: Pin «a failed send counts nothing»** — create `lib/mail/invite.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/activation', () => ({
  INVITE_TOKEN_HOURS: 720,
  RESET_TOKEN_HOURS: 2,
  mintActivationToken: vi.fn(() => ({ token: 't', tokenHash: 'h', expiresAt: new Date() })),
  storeActivationToken: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/mail/mailer', () => ({ sendMail: vi.fn() }));
vi.mock('@/lib/mail/allowance', () => ({ recordMailSent: vi.fn().mockResolvedValue(undefined) }));

import { sendMail } from '@/lib/mail/mailer';
import { recordMailSent } from '@/lib/mail/allowance';
import { issueAndEmailLink } from './invite';

const person = { id: 's1', email: 'a@u.ua', lastName: 'А', firstName: 'Б', patronymic: 'В' };

beforeEach(() => vi.clearAllMocks());

describe('issueAndEmailLink', () => {
  it('records the letter only after the mail server accepted it', async () => {
    (sendMail as unknown as Mock).mockResolvedValue(undefined);
    await issueAndEmailLink(person, 'reset');
    expect(recordMailSent).toHaveBeenCalledWith('s1', 'reset');
  });

  it('records nothing when the send fails, so a refused letter never uses one of the three', async () => {
    (sendMail as unknown as Mock).mockRejectedValue(new Error('SMTP down'));
    await expect(issueAndEmailLink(person, 'invite')).rejects.toThrow('SMTP down');
    expect(recordMailSent).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm vitest run lib/mail/invite.test.ts` — Expected: PASS (if a `lib/mail/invite.test.ts` already exists, add the two tests to it instead).

- [ ] **Step 7: Repair mocks of existing tests** — run `pnpm test`. Every file that failed with `Cannot read properties of undefined (reading 'create')` (their `db` mock has no `mailSend`) gets this block beside its other `vi.mock` calls (expected: `app/(dashboard)/staff/[id]/actions.test.ts`, `app/(auth)/forgot-password/actions.test.ts`, `app/(dashboard)/admin/invites/actions.test.ts`, `app/(dashboard)/staff/actions.test.ts`; fix only the ones that actually fail):

```ts
vi.mock('@/lib/mail/allowance', () => ({
  mailAllowance: vi.fn().mockResolvedValue({ ok: true }),
  recordMailSent: vi.fn().mockResolvedValue(undefined),
  retryMessage: vi.fn(() => 'Лист уже надсилали. Спробуйте після 14:32'),
}));
```

Run: `pnpm test` — Expected: whole suite PASS.

- [ ] **Step 8: Commit** — `/commit` (`feat(auth): limit emailed links to 3 per 6 hours`; includes the migration).

---

### Task 4: Gate the four account actions

**Files:**

- Modify: `app/(dashboard)/staff/[id]/actions.ts` (`sendInvite`, `resetPassword`, `setPasswordManually`, `forceLogout`; imports)
- Modify: `app/(dashboard)/staff/[id]/actions.test.ts`

**Interfaces:**

- Consumes: `canManageAccount`, `AccountAction` (Task 2); `mailAllowance`, `retryMessage` (Task 3).
- Produces: local helper `authorizeAccountAction(id, action)` (not exported — a `'use server'` file may only export async server actions).

- [ ] **Step 1: Write the failing tests** — in `actions.test.ts`, add a new block after the `setPasswordManually` describe. Reuse that file's `editorSession`, `adminSession`, `person`, `mockTx`, `mockAuth`, `mockStaffFind`. The `vi.mock('@/lib/mail/allowance', …)` from Task 3 already exists; import `mailAllowance` from it and add `const mockAllowance = mailAllowance as unknown as Mock;`.

```ts
/**
 * The target's role, the caller's division switches, and the person's own data
 * all come through db.staff.findUnique — dispatch on `select` so a test does
 * not depend on call order.
 */
function mockAccountLookups({
  targetRole = 'USER',
  flags = {} as Partial<Record<'canInviteStaff' | 'canSetPasswords' | 'canEndSessions', boolean>>,
  passwordHash = null as string | null,
} = {}) {
  mockStaffFind.mockImplementation(async (args: { select?: Record<string, unknown> }) => {
    const select = args?.select ?? {};
    if ('division' in select) {
      return {
        division: {
          canInviteStaff: false,
          canSetPasswords: false,
          canEndSessions: false,
          ...flags,
        },
      };
    }
    return { ...person, role: targetRole, passwordHash };
  });
}

describe('account actions for an EDITOR with division switches', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(editorSession);
    mockAllowance.mockResolvedValue({ ok: true });
  });

  it('sendInvite: refused without the switch', async () => {
    mockAccountLookups({ flags: {} });
    expect(await sendInvite('staff-1')).toEqual({ error: 'Недостатньо прав' });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('sendInvite: allowed with the switch, and checks the allowance', async () => {
    mockAccountLookups({ flags: { canInviteStaff: true } });
    expect(await sendInvite('staff-1')).toEqual({ success: true, message: 'Запрошення надіслано' });
    expect(mockAllowance).toHaveBeenCalledWith('staff-1');
  });

  it('sendInvite: says when to try again if the allowance is spent', async () => {
    mockAccountLookups({ flags: { canInviteStaff: true } });
    mockAllowance.mockResolvedValue({ ok: false, retryAt: new Date('2026-10-12T11:32:00Z') });
    expect(await sendInvite('staff-1')).toEqual({
      error: 'Лист уже надсилали. Спробуйте після 14:32',
    });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('sendInvite: ADMIN is never limited', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAccountLookups({});
    await sendInvite('staff-1');
    expect(mockAllowance).not.toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalled();
  });

  it('resetPassword and setPasswordManually are one switch: «set pass»', async () => {
    mockAccountLookups({ flags: { canSetPasswords: true }, passwordHash: 'hash' });
    mockTx();
    expect((await resetPassword('staff-1')) as object).toHaveProperty('success', true);
    expect(
      (await setPasswordManually('staff-1', {
        password: 'Parol123!',
        confirmPassword: 'Parol123!',
      })) as object
    ).toHaveProperty('success', true);

    mockAccountLookups({ flags: { canInviteStaff: true, canEndSessions: true } });
    expect(await resetPassword('staff-1')).toEqual({ error: 'Недостатньо прав' });
    expect(
      await setPasswordManually('staff-1', { password: 'Parol123!', confirmPassword: 'Parol123!' })
    ).toEqual({ error: 'Недостатньо прав' });
  });

  it('resetPassword: sends nothing and clears nothing when the allowance is spent', async () => {
    mockAccountLookups({ flags: { canSetPasswords: true }, passwordHash: 'hash' });
    mockAllowance.mockResolvedValue({ ok: false, retryAt: new Date('2026-10-12T11:32:00Z') });
    const tx = mockTx();
    expect(await resetPassword('staff-1')).toEqual({
      error: 'Лист уже надсилали. Спробуйте після 14:32',
    });
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(tx.staff.update).not.toHaveBeenCalled();
  });

  it('forceLogout: needs «end sessions»', async () => {
    mockAccountLookups({ flags: { canSetPasswords: true } });
    expect(await forceLogout('staff-1')).toEqual({ error: 'Недостатньо прав' });

    mockAccountLookups({ flags: { canEndSessions: true } });
    (db.staff.update as unknown as Mock).mockResolvedValue({});
    expect(await forceLogout('staff-1')).toEqual({ success: true, message: 'Всі сесії завершено' });
  });

  // The takeover. All three switches held, target is an admin or another editor.
  it.each(['ADMIN', 'EDITOR'] as const)(
    'refuses every action on a %s record',
    async (targetRole) => {
      mockAccountLookups({
        targetRole,
        flags: { canInviteStaff: true, canSetPasswords: true, canEndSessions: true },
      });
      const refused = { error: 'Недостатньо прав' };
      expect(await sendInvite('staff-1')).toEqual(refused);
      expect(await resetPassword('staff-1')).toEqual(refused);
      expect(
        await setPasswordManually('staff-1', {
          password: 'Parol123!',
          confirmPassword: 'Parol123!',
        })
      ).toEqual(refused);
      expect(await forceLogout('staff-1')).toEqual(refused);
      expect(mockSendMail).not.toHaveBeenCalled();
    }
  );

  it('a USER caller is refused', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'u1' } });
    mockAccountLookups({});
    expect(await forceLogout('staff-1')).toEqual({ error: 'Недостатньо прав' });
  });
});
```

Add `forceLogout` to the file's import from `./actions` and `mailAllowance` to the import from `@/lib/mail/allowance`. The pre-existing «rejects non-admin» tests (plain `editorSession`, no division mock) must keep passing as they are: `mockStaffFind` returns `undefined`, so the helper below answers `Недостатньо прав` for a non-admin when the target is missing.

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run "app/(dashboard)/staff/[id]/actions.test.ts" -t "account actions"`
Expected: FAIL (editor is rejected by `requireAdmin`).

- [ ] **Step 3: Implement** — in `actions.ts`:

imports: add `canManageAccount, type AccountAction` to the `@/lib/permissions` import (keep `requireAdmin` — `changeRole` and `unlockLogin` still use it) and `import { mailAllowance, retryMessage } from '@/lib/mail/allowance';`.

Add above `sendInvite` (a plain function, not exported):

```ts
/**
 * ADMIN, or an EDITOR whose division holds the switch for this action AND who
 * is acting on a USER record (`canManageAccount`). A missing person answers
 * «Недостатньо прав» to a non-admin so the answer does not reveal whether the
 * id exists.
 */
async function authorizeAccountAction(id: string, action: AccountAction) {
  const session = await auth();
  if (!session) redirect('/login');

  const target = await db.staff.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) {
    return {
      error: session.user.role === 'ADMIN' ? 'Запис не знайдено' : 'Недостатньо прав',
    } as const;
  }
  if (!(await canManageAccount(session.user, target, action))) {
    return { error: 'Недостатньо прав' } as const;
  }
  return { session } as const;
}

/** ADMIN sends freely; everyone else is held to the per-person allowance. */
async function mailBlocked(
  session: { user: { role: string } },
  id: string
): Promise<string | null> {
  if (session.user.role === 'ADMIN') return null;
  const allowance = await mailAllowance(id);
  return allowance.ok ? null : retryMessage(allowance.retryAt);
}
```

Then in each action replace the two-line `requireAdmin` guard:

```ts
const gate = await authorizeAccountAction(id, 'invite'); // 'password' for resetPassword & setPasswordManually, 'sessions' for forceLogout
if ('error' in gate) return { error: gate.error };
const { session } = gate;
```

`sendInvite`: after the `if (staff.passwordHash)` check and before the `try`, add
`const blocked = await mailBlocked(session, id); if (blocked) return { error: blocked };`.
`resetPassword`: after the `if (!staff)` check and before the `try`, add the same two lines.
`setPasswordManually` keeps `setPasswordSchema` parsing **after** the gate (move the gate to the top, before `safeParse`, as today's `requireAdmin` was).
`forceLogout`: gate only.

`changeRole` and `unlockLogin` are untouched.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm vitest run "app/(dashboard)/staff/[id]/actions.test.ts"`
Expected: PASS, including the older admin tests.

- [ ] **Step 5: Commit** — `/commit` (`feat(staff): editors may run account actions their division holds`).

---

### Task 5: `/forgot-password` uses the allowance

**Files:**

- Modify: `app/(auth)/forgot-password/actions.ts`
- Modify: `app/(auth)/forgot-password/actions.test.ts`
- Modify: `app/(auth)/forgot-password/page.tsx:52-58`

**Interfaces:** Consumes `mailAllowance` (Task 3).

- [ ] **Step 1: Write the failing tests** — in `actions.test.ts`: import `mailAllowance` from `@/lib/mail/allowance` (`const mockAllowance = mailAllowance as unknown as Mock;`), add `mockAllowance.mockResolvedValue({ ok: true });` to `beforeEach`, and **replace** the test `'skips sending during the cooldown but still answers success'` with:

```ts
it('sends nothing when the allowance is spent, and the answer is the same', async () => {
  found(staff);
  mockAllowance.mockResolvedValue({ ok: false, retryAt: new Date(Date.now() + 60_000) });
  const blocked = await requestPasswordReset({ email: staff.email });
  expect(mockSendMail).not.toHaveBeenCalled();

  // Identical to the answer for a known address that was sent to, and to an unknown one
  nobody();
  expect(blocked).toEqual(await requestPasswordReset({ email: 'nobody@university.edu.ua' }));
  expect(blocked).toEqual({ success: true });
});

it('asks the allowance about THIS person', async () => {
  found(staff);
  await requestPasswordReset({ email: staff.email });
  expect(mockAllowance).toHaveBeenCalledWith('staff-1');
});
```

Also delete `activationToken: null` usage only if it no longer type-checks (the field stays harmless in the fixture).

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run "app/(auth)/forgot-password/actions.test.ts"`
Expected: FAIL (still using the token cooldown).

- [ ] **Step 3: Implement** — `actions.ts`: remove `RESEND_COOLDOWN_MS` and its comment, remove `activationToken: { select: { createdAt: true } }` from the `select`, add `import { mailAllowance } from '@/lib/mail/allowance';`, and replace the `recentlySent` block with:

```ts
  // At least a minute apart and at most three letters in six hours per person
  // (lib/mail/allowance.ts). The caller still hears «success» either way — a
  // different answer would reveal that the address exists.
  let allowed = false;
  if (staff) {
    allowed = (await mailAllowance(staff.id)).ok;
    if (!allowed) logWarning('auth.requestPasswordReset', 'letter limit reached', { entityId: staff.id });
  }

  if (staff && allowed) {
```

(the rest of the existing `if (staff && !recentlySent) {` body is unchanged).

`page.tsx` second paragraph (line ≈ 56-58) becomes:

```tsx
<p className="text-sm text-muted-foreground">
  Перевірте пошту (і папку «Спам»). Діє останнє надіслане посилання. Повторно можна надіслати через
  хвилину, не більше 3 листів за 6 годин.
</p>
```

- [ ] **Step 4: Run to see it pass**

Run: `pnpm vitest run "app/(auth)/forgot-password/actions.test.ts" && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit** — `/commit` (`feat(auth): apply the letter limit to forgot-password`).

---

### Task 6: Activation visible to editors, heads and деканs

**Files:**

- Modify: `lib/queries/list-staff.ts` (`StaffFilters`, `select`, mapping)
- Modify: `lib/queries/list-staff.test.ts`
- Modify: `lib/staff/list-params.ts` (`toStaffFilters`), `lib/staff/list-params.test.ts`
- Modify: `components/staff/staff-table.tsx`
- Modify: `lib/queries/list-my-department.ts`, `app/(dashboard)/my-department/page.tsx`
- Modify: `components/staff/profile/record-header.tsx`
- Modify: `components/staff/profile/identity-band.tsx` (comment only)

**Interfaces:**

- Produces: `StaffFilters.includeActivation?: boolean`; `listStaff` fills `isActivated` when `includeActivation || includeAccount`, and fills `role` only under `includeAccount`. `MyDepartmentStaff.isActivated: boolean`.

- [ ] **Step 1: Write the failing tests**

`lib/queries/list-staff.test.ts`, inside `describe('filtering by activation')`:

```ts
it('reports activation under includeActivation without selecting the role', async () => {
  mockStaff.mockResolvedValue([
    {
      id: 's1',
      lastName: 'Гість',
      firstName: 'І',
      patronymic: 'П',
      email: 'g@u.ua',
      isNpp: true,
      archivedAt: null,
      position: null,
      academicTitle: null,
      candidateDegree: null,
      doctorDegree: null,
      passwordHash: null,
      department: null,
      division: null,
      partTimeDepartments: [],
    },
  ]);
  const rows = await listStaff({ includeActivation: true });
  const select = mockStaff.mock.calls[0][0].select;
  expect(select.passwordHash).toBe(true);
  expect(select).not.toHaveProperty('role');
  expect(rows[0].isActivated).toBe(false);
  expect(rows[0]).not.toHaveProperty('passwordHash');
});

it('leaves isActivated undefined when neither flag is set', async () => {
  mockStaff.mockResolvedValue([
    {
      id: 's1',
      lastName: 'Г',
      firstName: 'І',
      patronymic: 'П',
      email: 'g@u.ua',
      isNpp: true,
      archivedAt: null,
      position: null,
      academicTitle: null,
      candidateDegree: null,
      doctorDegree: null,
      department: null,
      division: null,
      partTimeDepartments: [],
    },
  ]);
  const rows = await listStaff({});
  expect(mockStaff.mock.calls[0][0].select).not.toHaveProperty('passwordHash');
  expect(rows[0].isActivated).toBeUndefined();
});
```

`lib/staff/list-params.test.ts`, inside `describe('toStaffFilters')`:

```ts
it('shows activation to everyone but account details only to ADMIN', () => {
  const p = parseStaffListParams({}, editor);
  expect(toStaffFilters(p, editor)).toMatchObject({
    includeActivation: true,
    includeAccount: false,
    includeConfidential: false,
  });
  expect(toStaffFilters(p, admin)).toMatchObject({ includeActivation: true, includeAccount: true });
});
```

and change the existing `'changes nothing about WHICH people match'` test to also strip `includeActivation` from both sides (`includeActivation: _e` / `_f`).

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run lib/queries/list-staff.test.ts lib/staff/list-params.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the query side**

`list-staff.ts`: in `StaffFilters` (next to `includeAccount`, line ≈ 28) add

```ts
  /**
   * Whether each person has set a password — the boolean only. Safe for every
   * viewer who may see the list (owner, 2026-10-12). `includeAccount` is the
   * ADMIN-only superset: it adds the role.
   */
  includeActivation?: boolean;
```

Replace the select line `...(filters?.includeAccount ? { role: true, passwordHash: true } : {}),` with

```ts
      ...(filters?.includeAccount ? { role: true } : {}),
      ...(filters?.includeAccount || filters?.includeActivation ? { passwordHash: true } : {}),
```

and the mapping with

```ts
const withActivation = Boolean(filters?.includeAccount || filters?.includeActivation);
return rows.map(({ passwordHash, ...rest }) => ({
  ...rest,
  isActivated: withActivation ? typeof passwordHash === 'string' : undefined,
}));
```

`list-params.ts` `toStaffFilters`: add `includeActivation: true,` above `includeAccount: isAdmin,` and update the doc comment: «`includeActivation` is for everyone who can see the list».

- [ ] **Step 4: Implement the tables**

`staff-table.tsx`: the pill moves to the name cell for every viewer. In the `after` fragment of the name `RowLinkCell`, after the «Архів» span add:

```tsx
{
  member.isActivated === false && (
    <span className="inline-flex shrink-0 items-center rounded-full bg-warning-surface px-2 py-0.5 text-xs font-medium text-warning">
      Не активований
    </span>
  );
}
```

and in the ADMIN «role» cell delete the old pill block (keep `<span>{member.role ? ROLE_LABELS[member.role] : '—'}</span>`), simplifying the wrapper `div` to just that span. Do not touch widths; `NAME_COLUMN` (24rem) already holds a long name plus two badges — if a name + НПП + pill wraps in the browser check (Task 8), widen `NAME_COLUMN` to `26rem` (even px).

`my-faculty/page.tsx` needs no change: `toStaffFilters` already supplies `includeActivation`.

`list-my-department.ts`: add `passwordHash: true` to the `db.staff.findMany` select, `isActivated: s.passwordHash !== null,` to `person`, and `isActivated: boolean` to the `MyDepartmentStaff` type (find it at the top of the file). `my-department/page.tsx`: in the name `RowLinkCell`'s `after`, render both:

```tsx
              after={
                <>
                  {person.isPartTime && <Badge tone="warn">Сумісник</Badge>}
                  {!person.isActivated && <Badge tone="warn">Не активований</Badge>}
                </>
              }
```

`record-header.tsx`: replace `const account = isAdmin ? await getStaffAccount(id) : null;` and its comment with

```ts
// «Активовано» is a fact about the person, like «Архівований» beside it, and
// every viewer who may read this record may know it (owner, 2026-10-12;
// ADMIN-only before). Only the boolean is drawn here.
const account = await getStaffAccount(id);
```

In `identity-band.tsx`, change the `ActivationBadge` / `badges` doc comments that say «ADMIN-only» to say «shown to everyone who can read the record».

- [ ] **Step 5: Run to see them pass**

Run: `pnpm vitest run lib/queries lib/staff && pnpm type-check && pnpm lint`
Expected: PASS. (If `list-my-department` has a test that builds `db.staff.findMany` rows, add `passwordHash: null`/`'h'` to its fixtures.)

- [ ] **Step 6: Commit** — `/commit` (`feat(staff): show activation to editors, heads and deans`).

---

### Task 7: Account controls for editors

**Files:**

- Modify: `components/staff/account-card.tsx` (`AccountControls`, `AccountCard`)
- Modify: `app/(dashboard)/staff/[id]/(record)/(profile)/page.tsx`

**Interfaces:**

- Consumes: `accountGrantsFor`, `AccountGrants` (Task 2).
- Produces: `AccountControls` / `AccountCard` props `grants: AccountGrants` and `isAdmin: boolean`.

- [ ] **Step 1: Controls** — in `account-card.tsx` add `import type { AccountGrants } from '@/lib/permissions';` — that module imports `lib/auth` (server), so import **the type only** (`import type` is erased; fine in a client file). Extend the props:

```ts
interface AccountCardProps {
  staffId: string;
  account: StaffAccount;
  isSelf: boolean;
  /** ADMIN sees the role select, unlock and the lockout note; an editor sees none of them */
  isAdmin: boolean;
  /** Which of the three shared actions this viewer may take on this person */
  grants: AccountGrants;
}
```

In `AccountControls` destructure `isAdmin, grants` and:

- wrap the whole «Роль» `<div>` in `{isAdmin && (…)}`;
- the unlock button: `{isAdmin && account.lockedUntil && (…)}`;
- send invite: `{grants.invite && !account.isActivated && (…)}`;
- reset: `{grants.password && account.isActivated && (…)}`;
- `<ManualPasswordDialog … />`: `{grants.password && (…)}`;
- end sessions: `{grants.sessions && account.isActivated && !isSelf && (…)}`;
- notes block condition → `((isAdmin && isSelf) || (grants.invite && !account.isActivated && account.invite) || (isAdmin && account.lockedUntil))`; inside, guard each note the same way (`isAdmin && isSelf`, `grants.invite && …`, `isAdmin && account.lockedUntil`).

`AccountCard` just forwards `isAdmin`/`grants` (find where it spreads `props` into `AccountControls`; it already passes `props.account` to `AccountBadge`).

- [ ] **Step 2: Page** — in `(profile)/page.tsx`: import `accountGrantsFor`; after `const staff = await getStaff(...)`/`notFound()` add

```ts
// ADMIN everything; an EDITOR the switches their division holds, on a USER
// record only. A head or декан gets none — they see the badge, not buttons.
const grants = await accountGrantsFor(session.user, { id, role: staff.role });
const showAccountBar = isAdmin || Object.values(grants).some(Boolean);
```

Replace `{isAdmin && (` around the `Suspense` with `{showAccountBar && (` and pass the new props:

```tsx
<AccountBar staffId={id} isSelf={session.user.staffId === id} isAdmin={isAdmin} grants={grants} />
```

`AccountBar` takes `isAdmin`, `grants` and renders `<AccountControls … isAdmin={isAdmin} grants={grants} variant="bar" />`; for a non-admin it must not hand the client the lockout timestamp:

```tsx
const shown = isAdmin ? account : { ...account, lockedUntil: null };
```

Update the comments on the page and on `AccountBar` («ADMIN-only, and the PAGE checks…») to say «ADMIN or an editor with a switch».

- [ ] **Step 3: Verify**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: PASS. If another file renders `AccountCard`/`AccountControls`, grep `AccountCard|AccountControls` and pass `isAdmin` and `grants` (ADMIN-only callers pass `isAdmin` and `{invite:true,password:true,sessions:true}`).

- [ ] **Step 4: Commit** — `/commit` (`feat(staff): per-switch account controls for editors`).

---

### Task 8: Documentation and manual check

**Files:**

- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-10-12-account-access-switches-design.md` (the `forceLogout` self line)

- [ ] **Step 1: CLAUDE.md** — in «Permission model», after the Layer 2 rules, add a short block (follow the file's voice, dated 2026-10-12): the three `Division` switches and that `password` covers reset; editors only on `USER` records via `accountGrantsFor`; unlock/role/bulk invite stay ADMIN; archive stays `STAFF DELETE`. In «Auth», add: letters are limited to one per 60 s and three per 6 h per person via `MailSend` / `lib/mail/allowance.ts`, ADMIN exempt, written only after the mail server accepted. Update the `Layer 1` / `Roles` text that says activation is ADMIN-only if present.
- [ ] **Step 2: Spec** — change «`forceLogout` on yourself stays refused» to «An EDITOR can never act on themselves (only USER records are reachable); ADMIN is unchanged.»
- [ ] **Step 3: Full verification**

Run: `pnpm lint && pnpm type-check && pnpm test`
Expected: all green.

- [ ] **Step 4: Browser check** — ask the owner to start `pnpm dev` (they run services themselves) and check, as listed:
  1. `/divisions/<id>/edit` shows the three switches; saving writes an audit entry.
  2. As an EDITOR in a division with only «Надсилання запрошень»: `/staff` shows «Не активований» pills; a not-activated USER's record shows only «Надіслати запрошення»; an admin's record shows no account controls.
  3. As a завідувач: `/my-department` and the record band show the badge; no buttons.
  4. As a декан: `/my-faculty` and `/my-department` show the badge.
  5. `/forgot-password` twice within a minute sends one letter; a fourth in six hours is silently skipped (check `MailSend` in Adminer / logs) and the page text states the rule.
  6. The name column does not wrap badly with «НПП» + «Не активований» (widen `NAME_COLUMN` to `26rem` if it does).
- [ ] **Step 5: Commit** — `/commit` (`docs(permissions): document account switches and letter limit`).

---

## Self-Review

- **Spec coverage:** visibility table → Task 6; three switches + form + audit + core seed → Task 1; guard incl. USER-only rule → Task 2; action table → Task 4 (`unlockLogin`/`changeRole` unchanged); controls → Task 7; `MailSend`, write point, check, who-is-checked (forgot-password, editors, ADMIN exempt, `inviteBatch` writes rows via `issueAndEmailLink`) → Tasks 3-5; out-of-scope items untouched; tests list → each task; rollout note (nothing granted until ticked) → default `false`. The spec's «`lib/permissions.ts`» is honoured. The spec's «forceLogout self» line is corrected in Task 8.
- **Placeholders:** the only deliberate «look at the neighbouring test» is Task 1 Step 1, because that file's transaction helper was not read while planning; it says exactly what to copy.
- **Types:** `AccountAction` / `AccountGrants` / `accountGrantsFor` / `canManageAccount` (Task 2) are used verbatim in Tasks 4 and 7; `mailAllowance`, `recordMailSent`, `retryMessage`, `MailAllowance` (Task 3) in Tasks 4-5; `includeActivation` (Task 6) is the same name in query, params and tests.
- **Review Focus** each has a pinning test: takeover (Tasks 2, 4), failed send not counted (Task 3 Step 6b — `recordMailSent` runs only after `sendMail` resolves), no enumeration (Task 5), boundary rows (Task 3), no `role` leak (Task 6), per-switch buttons (Task 7, verified in the browser check).
