# Refactor — Merge User into Staff (one "profile" per person)

**Status:** built 2026-07-14 (steps 1–8; unit tests green). Awaiting user browser smoke test:
create → invite email (Mailpit at localhost:8025) → activate → log in → role gates → reset.

**Precondition:** not in production, no real data. `db:reset` + reseed is the migration — no data
migration script needed. Run the current-code browser test of `/moderation` and `/division-data`
FIRST, so any breakage is known to predate this refactor.

---

## Why

Today a person is two rows: a `Staff` (the profile) and an optional `User` (the login), joined by
`User.staffId`. Creating a login means a second page and manually re-typing the email — it feels like
the two are linked "by email" even though they are linked by a real FK. Decision: **collapse them into
one `Staff` row**. Every person has a login; email is one value; role lives on the person.

## Target schema

Delete `model User`. On `Staff` add:

```prisma
passwordHash String?   // null = account not activated yet (see login flow)
role         Role      @default(USER)
tokenVersion Int       @default(0)
```

`Staff.email` is already `@unique` — it becomes the login email. No separate account email.

**Repoint every FK that referenced `User` → `Staff`:**

| Relation       | Field              | Was → Now    |
| -------------- | ------------------ | ------------ |
| AuditLog       | `userId`           | User → Staff |
| Activity       | `approvedByUserId` | User → Staff |
| Activity       | `removedByUserId`  | User → Staff |
| RatingTemplate | `closedByUserId`   | User → Staff |

(Keep the column names or rename to `…StaffId` — renaming is cleaner but touches more code. Decide at
build time; leaning keep-names to shrink the diff.)

## Login & activation flow — email invite link (LOCKED 2026-07-09)

The core problem: `passwordHash == null` means "not activated", but if activation were just
"type this email + choose a password", **whoever logs in first steals the account**. This was the
user's main worry (and the reason the Moodle-password idea came up). Solution: **activation happens
through a one-time link emailed to `Staff.email`** — clicking it proves the person controls that
mailbox, so no one can pre-claim someone else's account. The invite link _is_ the email verification;
there is no separate "verify email" step.

**Flow:**

1. Admin creates the person (from the roster) — **no password**, `passwordHash = null`.
2. App generates a one-time activation token and emails a "set your password" link to `Staff.email`.
3. Person clicks → set-password screen → hash stored, `passwordHash` now set, token consumed → signed in.
4. **Activated** afterwards: normal email + password check (`lib/auth.ts` `authorize`).
5. **Password reset / re-invite** (ADMIN): clear `passwordHash`, issue a fresh token, resend the link.
   Bump `tokenVersion` to kill live sessions.

**Activation token** — new model (or fields on Staff): `token` (random, hashed at rest), `expiresAt`
(default ~30 days so batched sending over days is fine), single-use. Manual fallback: admin can set a
password directly for a bounced mailbox, so a broken email never blocks onboarding.

**Email sending — provider-agnostic SMTP, built for strict free-tier limits:**

- Configured via env vars (SMTP host/user/pass/from). Swap providers without touching app code.
- **Batched, never a 300-at-once blast:** «Надіслати запрошення» per person, or select a department and
  invite only them. Spreads onboarding under the daily cap.
- **Resend** button per person for bounces / expired links.
- Long-lived tokens (~30 days) so staggering over several days never expires a pending invite.

No `lastLoginAt` — activation state is derived from `passwordHash` alone (user decision): a person with
`passwordHash == null` has never activated, which doubles as the adoption signal (see badge below).

**Adds two build steps to the plan:** a mailer (SMTP client + a couple of email templates) and the
activation-token model/expiry. This is the piece that makes "everyone logs in" actually safe.

## Session shape — the important compatibility call

Today code reads two things off the session: `session.user.id` (the User id) and
`session.user.staffId` (the linked Staff id, `null` for staff-less admins). After the merge they are
the **same id**, and every logged-in person IS staff, so `staffId` is never null.

To avoid editing all 34 files that read `staffId`, **keep `session.user.staffId` as an alias that
always equals `session.user.id`**. Existing guards like `if (!staffId) return null` still compile and
simply never trigger now. We can delete the alias later in a cosmetic pass. This keeps the auth change
small and mechanical.

`getEditorDivisionId(staffId)` and friends keep working unchanged.

## Personnel page changes

- The current НПП/Адміністративний/Всі **tab bar becomes a single dropdown select**, filtering by
  **role only** (LOCKED 2026-07-09 — the useful views are role combinations, one axis, no surprises).
  Presets:
  - **НПП** (default) — `role = USER`
  - **Редактори** — `role = EDITOR`
  - **Адміністратори** — `role = ADMIN`
  - **Редактори та НПП** — everyone except admins (the "who fills in data" view)
  - **Всі** — no role filter
- **`isNpp` stays in the schema** — it still drives real rules (НПП must have a department; only НПП
  get a rating) — but it gets **no filter control**. If a true "academic staff only" view is wanted
  later, add `isNpp` back as a filter then.
- Filter state lives in the URL query (`?view=npp`) like the existing staff filters, so it is
  shareable and survives refresh.
- ADMIN sees a small **«Не активований»** badge on any row where `!passwordHash`.
- ADMIN sees/edits the `role` field (new column). Confidential columns unchanged.

## Deletions / moves

- Delete `/admin/users` (page, actions, form, edit/new routes).
- Move to an ADMIN-only card on the staff detail page: set/reset password (= clear hash),
  force logout, change role.
- Remove the "division change auto-switches role + force logout" magic in `updateStaff` — role is now
  an explicit admin-edited field.

## Guardrails

- Add `passwordHash`, `role`, `tokenVersion` to the **non-grantable** set so no division field
  permission can ever expose or edit them (same mechanism as `CONFIDENTIAL_STAFF_FIELDS` in
  `lib/permissions.ts`). `passwordHash` must also never appear in any query `select` that reaches UI.
- The staff field-permission whitelist (`ALLOWED_FIELD_NAMES`) must NOT include the three auth columns.

## Seed admin — already exists, reuse it

The current seed (`prisma/seed.ts`) already creates real logins: `admin@edurank.local` / `admin123`
(ADMIN), plus an editor / `editor123` and a user / `user1234`. After the merge these become **Staff
rows already activated** (real `passwordHash`, `role`), not `User` rows — the admin stays pre-activated
so `db:reset` never locks anyone out. No new credentials needed from the user.

## Ordered build steps (each a commit, tests green between)

1. **Schema** — add `passwordHash`/`role`/`tokenVersion` + activation-token model to Staff, repoint
   4 FKs, delete `User`; `db:migrate` (or reset), `db:generate`.
2. **Seed** — admin/editor/user become activated Staff rows (reuse existing creds); `db:reset` clean.
3. **Auth** — `lib/auth.ts` reads Staff; JWT/session keep `staffId` alias = id; activation branch.
4. **Mailer** — SMTP client (env-configured) + invite/reset email templates; provider-agnostic.
5. **Activation** — set-password screen driven by the emailed token; invite + resend + reset actions
   on staff detail; manual password-set fallback.
6. **Delete `/admin/users`**, move account actions (invite, reset, force-logout, change role) to the
   staff detail card.
7. **Personnel page** — role dropdown filter + «Не активований» badge + role field.
8. **Guardrails + tests** — whitelist exclusions; update all action/permission tests; full smoke test
   (create → invite email → activate → log in → role gates → reset).

## Risk notes

- Biggest surface is the session read in ~34 files — mitigated by the `staffId` alias (step 3).
- `passwordHash` leaking into a UI query is the one security-sensitive mistake to watch; grep every
  `select` touching Staff after step 1.
- Estimate: one focused session; smoke-test login/roles carefully at the end because auth touches
  everything.
