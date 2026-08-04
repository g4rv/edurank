# Work remaining

State as of **2026-08-04**. This is the single list of what is left to build. It
replaces reading four documents at once: `audit-2026-07-29.md` is now a
historical snapshot (accurate for its date, wrong about current code in several
places), `open-questions.md` holds the questions for the boss, `ui-fixes-plan.md`
is done except for one item, `profile-account-merge.md` is finished.

Keep this file current. When something ships, move it out of here — not into
here with a strikethrough.

---

## Where the app is now

Phase 1 (structure, staff, permissions, auth) and Phase 2 (the whole rating
system) are complete and stable: 415 tests, type-check clean, one deliberate lint
warning. The audit of 2026-07-29 is fully closed, and a second pass on 2026-08-03
closed everything it found (9 commits, `cbdbd0c`…`1d1e572`).

**Nothing in the app is known-broken.** Everything below is work not yet started.

---

## The shape of what is left

Two groups, and the difference matters more than the size of either:

- **Blocked on the boss** — the two big features and most of the reports. Big,
  visible, and not startable.
- **Not blocked by anyone** — real data, and everything that decides whether
  people actually use the system. Less visible, and the reason a working
  system still fails.

The second group is the risk. A perfect rating engine that nobody fills in is
worth nothing, and every item in «Adoption» below is unblocked today.

---

## A. Ready to build now

### A1. Staff import — do this first

From `edu-reference/csv/УГСП_Дані - НПП.csv`. The `Staff` model already carries
every column in that file (ставка, стаж, звання, ступінь, email, WoS/Scopus/
Scholar counts and URLs, ORCID).

Shape: admin-only upload page **or** a `tsx` script. Must have a **dry-run report
first** — rows to create / update / skip, with the reason for each — and only
then commit. One audit-log entry per row.

Why first: it is the only item with no unknowns, and it makes everything else
testable against real people instead of 200 invented ones. It also makes the boss
meeting better — real numbers on screen beat a demo.

Watch for: name variants, missing or shared emails, department names that do not
match what is in the database, duplicate people. The code is easy; the data is
where the time goes.

### A2. Error logging — small, high value

Today every server action does `catch (e) → parseDbError(e) → "Помилка при
збереженні"` and **discards the error** (`lib/db-error.ts:31`). The whole app has
three logging calls. When someone reports «I cannot save», there is no stack, no
error code, no timestamp, no user id — nothing to debug from.

Note the audit log records every _successful_ mutation in detail. Failures record
nothing. That asymmetry is the bug.

Decided approach: a `logError(context, err)` helper writing one structured line to
stdout (action, user id, error code, message, stack), wired into `parseDbError`
and the catch sites. Docker/Coolify already collects stdout, so this needs no new
service. ~30 lines.

Later, only if support proves painful: an `ErrorLog` table plus a small `/admin`
page, so an admin can see failures without SSH. Deliberately **not** an external
service — internal university data, and nobody here would maintain it.

### A3. Instructions in Ukrainian

There are none. The only explanatory text in the app is the tooltip set on
rating-relevant profile fields (`components/staff/rating-field-hint.tsx`).

Four audiences:

| Who                | Needs to know                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| ~200 НПП           | the activation email, adding an achievement, what «Зараховано» means, why a score changed, what to do when an entry is discarded |
| Division editors   | the entry grid, the group («entity-first») dialog                                                                                |
| ННВ moderators     | discarding with a reason, what «Перевірено» means and that it does not change points                                             |
| Admin (1–2 people) | year lifecycle (activate / clone / close / reopen), permissions, the template editor                                             |

Plan: a `/help` page split by role, plus contextual text on the 3–4 screens where
people will certainly get stuck. No videos until after the pilot — the pilot users
show which parts actually confuse people, and a video is expensive to redo.

**The wording must be reviewed by the owner.** Getting the register right for
university staff, and using the terms the department already uses, is not
something to accept from a draft unchecked.

### A4. Bulk invite

300 people, and today inviting them is one button per person on each staff page.
Needs: select a department (or a filter), send to everyone in it who has no
password yet, spread over the SMTP daily cap, with a per-person resend for
bounces. The invite mechanics already exist — this is the batch layer over them.

### A5. Reminders / notifications

There is **no notification code in the app at all**. Nothing ever tells an НПП
that submissions are open, that the year closes soon, or that something of theirs
was discarded (they only see the reason if they visit `/achievements`).

This is the single biggest adoption risk. Minimum useful version: an email when
your entry is discarded, and a «year closes on X» reminder an admin can trigger
for everyone who has submitted nothing.

### A6. E2E tests (audit W10)

Unit coverage is strong; the flows that cross pages are untested. Worth a few
Playwright runs over imported data: login → submit → moderate → close year →
reopen, plus the permission matrix (editor vs admin vs НПП).

### A7. Documentation upkeep

- `audit-2026-07-29.md` still describes pre-fix code. Either mark it clearly as
  historical or update the finding statuses (S3 talks about hard-deleting an
  admin, which is now impossible; B3, B5, W4 are closed; the B1 index name does
  not match what shipped).
- `ui-fixes-plan.md` item **#4** was decided and never built: inline pencil and
  delete are still in the rows of divisions, faculties and departments with the
  `z-10` overlay hack. Since then the row-link work went a different way (one
  cell is the link), so **re-confirm the decision before building it**.

---

## B. Blocked on the boss

**Updated 2026-08-04 — the meeting happened and most of this section is unblocked.**
Q1, Q3, Q5, Q11 and Q14 are answered; Q4 turned out to be the wrong question. The
Розподіл ставок design is now a written spec: [`stake-distribution.md`](./stake-distribution.md).

| Work                          | State                                                                                                                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Розподіл ставок**           | ✅ **unblocked.** Ставка is computed by the university's formula, not divided by hand. Head proposes → комісія approves. Needs two pieces of _data_, not decisions: the norms table (35 numbers) and this year's узгоджуючий коефіцієнт. |
| **Head / dean scope**         | ✅ **unblocked.** A head sees their own кафедра fully; a dean the same across their faculty. Derived from `Department.headId` / `Faculty.deanId`, not a new Role.                                                                        |
| **Характеристика_РНПАВ**      | ⚠️ **promoted.** It is п.38 of the Ліцензійні умови, and it is where `Кнпп` comes from — a dependency of the formula, not a later report. Still needs Q2 (which indicator fills which position) and Q9 (the five-year window).           |
| Student recruitment           | ✅ no longer a separate feature — it is the formula's second term. Open: who enters the students (додаток 3 is co-signed by the приймальна комісія).                                                                                     |
| Публікації report             | Q7 — columns already known; can be built and adjusted.                                                                                                                                                                                   |
| Підвищення кваліфікації form  | Q8 — smallest, standalone.                                                                                                                                                                                                               |
| «Повідомити» without deleting | Q6 — overlaps A5 (reminders).                                                                                                                                                                                                            |
| Historical import 2021–2025   | Q9 — now doubly needed: the Характеристика window is five years.                                                                                                                                                                         |

## C. Before deployment

Decided: Hetzner VPS + Coolify.

- Production Dockerfile (standalone Next build)
- Real SMTP, `AUTH_SECRET` and `APP_URL` set
- **Login throttling** (audit S4) — acceptable on a university network, not on a
  public VPS. Per-IP/per-email counter, even in memory.
- Backup path on the NAS, **and a restore drill**. A backup nobody has restored is
  a hope, not a backup.
- Pilot with 2–3 real users before the department-wide rollout.
- Nobody currently owns support. Decide who answers when an НПП cannot log in.

---

## D. Decisions still owed by the owner

- **W6** — any EDITOR can download every НПП's full rating workbook and chart,
  including divisions with no rating role. Intended?
- Everything in section B.
- `ui-fixes-plan.md` #4 (see A7) — still wanted, given the row-link rework?

---

## E. Settled — do not re-open

Recorded so nobody spends a second day on them.

**Owner decisions:**

- Editors keep the ability to edit emails. Residual risk accepted: an editor can
  take over a **USER** account via an email change plus the public reset. The
  ADMIN version of that path is closed. Notifying the old address would remove
  the risk and was deliberately not built.
- Editors may only edit records where `role = USER`, plus their own.
- A person is **never deleted** — only archived. See CLAUDE.md for the full rule.
- Hard delete of a person no longer exists anywhere in the app.

**Measured, not guessed — three things that are NOT problems:**

- `closeYear` on the default 5 s transaction timeout: **274 ms** for 204 staff and
  4498 activities. No explicit timeout needed.
- `batchUpsertDivisionActivity` worst case (100 rows): **590 ms**. Also nowhere
  near the limit. (The batched recompute was still worth doing — 590 → 257 ms —
  but for cost, not for the timeout.)
- `prisma migrate dev` does **not** drop the partial unique index it cannot
  express. Verified with `prisma migrate diff --from-config-datasource
--to-schema` against the live database that holds it.

**Known and accepted:**

- One lint warning in `activity-type-dialog.tsx` — `watch()` is a subscription;
  replacing it stops the form reacting. It is a fact about react-hook-form.
- `ActivityStatus.PENDING` is never written. There is no approval queue and none
  should be added.
- `/staff` slices for paging after fetching all rows. Fine at ~300 people.
- Demo data holds two junk indicators, «asd» (2.10) and «іва» (6.21). Both have
  activities, so they can only be deactivated, not deleted.

---

## Suggested order

1. **A1 staff import** — unblocks judgement on everything else.
2. **A2 error logging** — small, and you will want it the first time real users hit a bug.
3. **Характеристика / п.38** — the report they already produce by hand, and the source
   of `Кнпп`. Build it before the formula needs it.
4. **Розподіл ставок** — [`stake-distribution.md`](./stake-distribution.md).
5. **A3 instructions** + **A4 bulk invite** + **A5 reminders** — the adoption set.
6. **C deployment**, with the pilot before the rollout.

The critical path is now: **staff import → Характеристика (it carries `Кнпп`) →
Розподіл ставок.** Q1 and Q5 are answered, so nothing on that path waits on
anybody. Everything else in section B can be reordered freely.
