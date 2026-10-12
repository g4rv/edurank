# Account access: who sees activation, who may act, and a limit on letters

Date: 2026-10-12. Status: draft for the owner's review.

## Goal

1. Editors, завідувачі and деканs can **see** whether a person is activated.
2. ADMIN can **share** account actions with a division's editors, one switch at a
   time, instead of keeping them all for ADMIN.
3. A person cannot use up the Mailjet quota by asking for letters again and again.

## What the owner decided

- Visibility is read-only and needs no permission switch.
- Three new switches per division, set by ADMIN:
  - **Send invite**
  - **Set pass** — this includes «Скинути пароль» (if you may set it, you may reset it)
  - **End all sessions**
- **No new «archive» switch.** `STAFF DELETE` already means «archive» (CLAUDE.md,
  `archiveStaff` / `restoreStaff`). It stays as it is.
- **ADMIN only, unchanged:** `unlockLogin` (somebody who typed a wrong password
  too often should wait), bulk invite at `/admin/invites` (`inviteBatch`), and the
  «send invite» checkbox in `createStaff`. Bulk is the easy way to spam; one by one
  is slow.
- **Letter limit:** at least 60 seconds between two letters to one person, and at
  most **3 letters in 6 hours**. If none arrive, that is the server's problem; a
  person who cannot find the letter must not use the quota freely.
- **ADMIN is exempt** from the limit when sending from a person's page.

## Part 1 — Seeing activation

Activation is `passwordHash !== null`. Only the boolean leaves the query layer.

| Who       | Where                                                          |
| --------- | -------------------------------------------------------------- |
| ADMIN     | everywhere, as today                                           |
| EDITOR    | `/staff` list (pill + column) and the record band              |
| Завідувач | `/my-department` (badge by the name) and the record band       |
| Декан     | `/my-faculty` staff tab, `/my-department`, and the record band |

Changes:

- `toStaffFilters`: `includeAccount` no longer depends on `isAdmin`. It widens the
  SELECT only, never the WHERE.
- `RecordHeader`: load `getStaffAccount` for every viewer who got past
  `canViewAcademicRecord`, not for ADMIN alone.
- `StaffTable`: the activation pill is drawn for any viewer given
  `isActivated`. **Role and ставка stay ADMIN-only** — `role` is selected under
  `includeAccount` today, so it must be split from the activation flag.
- `listMyDepartments` returns `isActivated`; `/my-department`'s own `StaffTable`
  shows a badge beside the name.
- Stays ADMIN-only: the `?activated=` filter and the Excel export.

## Part 2 — The three switches

### Data

`Division` gets three booleans, default `false`, like `canModerateRating` and
`canOverseeScience`: `canInviteStaff`, `canSetPasswords`, `canEndSessions`.
Migration adds the columns and grants nothing. Add them to `FIELD_LABELS`,
`validations/division.ts`, `divisions/actions.ts` and `division-form.tsx`
(audited by `diffChanges` like the other two).

`prisma/core-import.ts`, `core-export.ts` and `core-data.ts` carry the existing
switches; they carry these too.

### Guard

`canManageAccount(caller, target, 'invite' | 'password' | 'sessions')` in
`lib/permissions.ts`:

- ADMIN — always.
- EDITOR — only when their division holds that switch **and**
  `canMutateStaffRecord` allows the target (a `USER` record). Otherwise «set pass»
  would be an account takeover of an admin or another editor.
- Anyone else — never. Heads and деканs get no actions.
- An EDITOR can never act on themselves (only USER records are reachable); ADMIN is unchanged. Last-admin rules unchanged.
- **Archived target: no grants for anyone, ADMIN included** (owner, 2026-10-12). `accountGrantsFor` takes `archivedAt`; an archived account cannot sign in, so a letter or password for it is useless.

### Actions (`app/(dashboard)/staff/[id]/actions.ts`)

| Action                                 | Gate             |
| -------------------------------------- | ---------------- |
| `sendInvite`                           | `invite`         |
| `setPasswordManually`, `resetPassword` | `password`       |
| `forceLogout`                          | `sessions`       |
| `unlockLogin`, `changeRole`            | ADMIN, unchanged |

An EDITOR may use `setPasswordManually` only for a never-activated person
(`passwordHash` is null; owner, 2026-10-12) — for an activated one they use
`resetPassword`, which mails a link. ADMIN may set a password for anyone.

Every credential action (these five, `unlockLogin` too) is refused on an archived person, ADMIN included (owner, 2026-10-12): rights are checked first, so a caller without rights still hears «Недостатньо прав», then «Обліковий запис архівованої людини змінювати не можна. Спершу відновіть її». The public `/forgot-password` sends nothing for an archived address and answers as for any other.

All keep their audit entries; the actor is the editor. Errors keep the existing
`logError` / Ukrainian-sentence convention.

### Controls

`AccountControls` renders for ADMIN and for an EDITOR holding at least one switch,
and shows only the buttons that editor holds. Role select, unlock and the lockout
note stay ADMIN-only. The page decides this (a component has no session).

### Admin screen

Three toggles on the division edit form (`divisions/[id]/edit`), beside the two
existing switches, with one line of help each.

## Part 3 — Letter limit

Found: `requestPasswordReset` already has `RESEND_COOLDOWN_MS = 60s`, read from
`ActivationToken.createdAt`. There is no count, and no history to count:
`ActivationToken` is one row per person, replaced on every send.

### Data

New table `MailSend`: `id`, `staffId` (cascade), `kind` (`invite` | `reset`),
`sentAt`, `@@index([staffId, sentAt])`. Old rows are pruned like
`pruneLoginThrottles`.

### Write point

`issueAndEmailLink` (`lib/mail/invite.ts`) writes a row **after** `sendMail`
succeeds, in the same step that stores the token. A refused message therefore
never uses up one of the three — this is the rule the file already follows for the
token.

### Check

One function, `mailAllowance(staffId)`, returns `{ ok: true }` or
`{ ok: false, retryAt }`:

- newest row younger than 60 s → not ok, `retryAt` = that + 60 s;
- 3 or more rows in the last 6 h → not ok, `retryAt` = the oldest of them + 6 h.

Numbers live as constants in one file. Invites and resets count together, so
«invite, then forgot-password, then invite» cannot get around the cap.

### Who is checked

- **Public `/forgot-password`:** checked, replacing the local cooldown. The answer
  stays «success» for every well-formed address, so existence is not observable.
  The text states the rule for everybody: «Якщо адреса є в системі, лист
  надіслано. Повторно — через хвилину, не більше 3 листів за 6 годин. Перевірте
  «Спам».» A blocked request is logged with `logWarning`.
- **Editor with a switch** (`sendInvite`, `resetPassword`): checked, and answered
  openly: «Зачекайте до 14:32».
- **ADMIN from a person's page:** exempt from both the cooldown and the cap; the
  send still writes a row, so the history is complete.
- **`inviteBatch`:** ADMIN, has its own pacing; unchanged. It writes rows.

## Out of scope

Per-IP limit on `/forgot-password`; a UI showing the history; letting editors use
bulk invite; the `lower(email)` unique index.

## Tests (colocated)

- `canManageAccount`: ADMIN, EDITOR with / without the switch, target `USER` vs
  `ADMIN` vs `EDITOR`, self.
- Each of the four actions: refused without the switch, refused on an admin's
  record, allowed with it.
- `mailAllowance`: 59 s vs 61 s; the 3rd vs 4th letter; the oldest row ageing out;
  a failed send counts nothing; invite and reset share the count.
- `requestPasswordReset`: identical answer for a known, unknown and blocked
  address.
- `toStaffFilters` / `listStaff`: `isActivated` filled for an EDITOR, `role` not;
  `passwordHash` never in the result.
- `/my-department` and `/my-faculty` rows carry the flag.

## Rollout

Back up, `migrate deploy`; nothing is granted until ADMIN ticks a switch on a
division, so behaviour is unchanged until then.
