# Deployment — Coolify

Target: a VPS running Coolify, domain **edurank.uhsp.edu.ua**. Decided
2026-07-22, started 2026-08-13.

This is the runbook. It assumes nothing about the reader except that they can
open Coolify and a terminal.

---

## What ships, and what does not

|                          |                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The image**            | `Dockerfile` at the repo root. Four stages; the last one is Node, the standalone server, and a Prisma CLI for migrations.                                                                         |
| **The database**         | A **Coolify Postgres resource**, not `docker-compose.yml`.                                                                                                                                        |
| **`docker-compose.yml`** | **Dev only. Never deploy it.** It publishes Postgres on `5432` with the password `password`, runs Adminer unauthenticated on `8080`, and runs Mailpit, whose own comment says never to deploy it. |
| **Migrations**           | `docker/entrypoint.sh` runs `prisma migrate deploy` before the server starts. Nothing to do by hand.                                                                                              |
| **Demo data**            | Never. `pnpm db:seed` and `db:seed:core` delete nothing and are safe here; `db:seed:test` invents people and wipes first — and refuses a database that already has accounts.                      |

---

## 1. Postgres

Create a **PostgreSQL 16** resource in Coolify, in the same project as the app.

Take its **internal** connection string — the one on the Docker network, not the
public one. Publishing the database port is the single easiest way to lose this
data, and nothing needs it: the app talks to Postgres over Coolify's own
network.

Turn on Coolify's scheduled backups while you are there. See §7 — a backup you
have never restored is not a backup.

## 2. The application

New resource → **Dockerfile** build pack → this git repository, branch `main`.

- **Port:** `3000`
- **Domain:** `https://edurank.uhsp.edu.ua` — Coolify issues the certificate.
- **Build:** nothing to configure. The Dockerfile does `pnpm install`,
  `prisma generate` and `next build` itself.

## 3. Environment

Set these on the application resource. There is no `.env` file in the image —
`.dockerignore` excludes it precisely so a password cannot end up in a layer.

| Variable                  | Value                                    | Why                                                                                                                     |
| ------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | the internal string from §1              | The entrypoint refuses to start without it.                                                                             |
| `AUTH_SECRET`             | `openssl rand -base64 32`                | Signs the session cookie. Changing it later logs everybody out.                                                         |
| `AUTH_URL`                | `https://edurank.uhsp.edu.ua`            |                                                                                                                         |
| `APP_URL`                 | `https://edurank.uhsp.edu.ua`            | **Every activation and reset link is built from this.** Wrong or missing, invites go out looking fine and open nothing. |
| `SMTP_HOST`               | Mailjet: `in-v3.mailjet.com`             | See §6.                                                                                                                 |
| `SMTP_PORT`               | `587`                                    |                                                                                                                         |
| `SMTP_USER` / `SMTP_PASS` | the Mailjet API key / secret key         |                                                                                                                         |
| `SMTP_FROM`               | `EduRank <no-reply@edurank.uhsp.edu.ua>` | The **subdomain** — see §6. Mailjet refuses a domain it has not authenticated.                                          |
| `INVITE_DELAY_MS`         | leave unset (250)                        | Pause between bulk-invite messages. Raise it if Mailjet starts refusing.                                                |

`AUTH_TRUST_HOST` is **not** needed: `lib/auth.ts` sets `trustHost: true`,
because behind Traefik the app sees `0.0.0.0:3000` and would otherwise refuse
every sign-in in a way that looks like a wrong password.

## 4. First boot

Deploy. The entrypoint applies migrations, then starts. Watch the logs for
`entrypoint: applying migrations…` followed by the ready line.

The database is now correct and completely empty — no indicators, no
specialities, no accounts.

**Not from the app container.** It runs the standalone build: no pnpm, no tsx,
and none of the TypeScript these two scripts are written in. That image is
deliberately just enough to serve the app.

Run them from a **one-off container built from the `builder` stage**, which has
the whole toolchain. On the VPS, in a checkout of this repo:

```sh
docker build --target builder -t edurank-tools .

# The same Docker network as the Postgres resource — Coolify shows its name on
# the resource page. Without it the container cannot see the database at all.
# Everything: the catalogue, the university, the people, the ratings.
docker run --rm -i --network <coolify-network> \
  -v /root/prod-core.json:/app/prod-core.json:ro \
  -e DATABASE_URL='<the internal string from §1>' \
  edurank-tools pnpm db:seed:core

# A password for the first administrator.
docker run --rm -it --network <coolify-network> \
  -e DATABASE_URL='<the internal string from §1>' \
  -e ADMIN_FORCE=1 \
  edurank-tools pnpm db:create-admin
```

### Where `prod-core.json` comes from

**The server cannot build the university itself.** `db:seed:staff` reads
`staff-roster.json` and the 2025 import chain reads `edu-reference/ФАКУЛЬТЕТИ` —
142 MB of the university's own workbooks. Both are gitignored, so a container
built from this repo has neither. The numbers are assembled and checked on a
maintainer's machine and carried over as one file:

```sh
# On the maintainer's machine, where edu-reference/ exists:
pnpm data:export                 # writes prod-core.json (~14 MB)
scp prod-core.json root@<vps>:/root/prod-core.json
```

`db:seed:core` then runs the catalogue first and the file on top of it: 6
відділи, 8 факультети, 31 кафедра with their завідувачі, every person with their
profile, both rating templates with all their indicators, and every activity and
total behind them.

It is **idempotent** — every row is matched on a natural key (an email, a
кафедра's name, an indicator's `code`), so running it again after a correction
updates what it wrote instead of doubling it. Activities are the one exception
and are replaced wholesale, because `Activity` deliberately has no unique key to
upsert against; the delete is scoped to the people and years the file actually
carries.

It imports **no passwords**, and re-running it does not touch `passwordHash` or
`tokenVersion`. Somebody who has already been invited and set a password keeps
it when the rating numbers are re-imported. Nor does it touch what the live
system owns: StudentClaim, the ставка pools and grids, the audit log.

`db:create-admin` asks for email, ПІБ and a password, so it needs `-it`. It
refuses to run where an administrator already exists — `ADMIN_FORCE=1` is needed
after `db:seed:core`, because the seed's own service account is already there.
For a non-interactive run, set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_NAME`
instead. Everybody else gets an invitation from `/admin/invites` and sets their
own.

`db:seed` with no flag is the catalogue plus the 8 факультети and 31 кафедри and
nothing else — no people, no ratings, no passwords. `db:seed:core` runs it for
you, so you only need it on its own to refresh the catalogue after an upgrade.

**The bare commands are the safe ones on purpose.** `pnpm db:seed:test` invents
people and **wipes** whatever is there first — never run it against production.
It refuses a database that already has accounts and prints what it was about to
destroy, so a slip costs a message rather than the administrator account, the
structure and the audit log; `--force` overrides that for a dev database.

Delete the `edurank-tools` image afterwards if you want the disk back; it is
only needed when the data changes.

Then sign in at `https://edurank.uhsp.edu.ua/login`.

## 5. Before anybody else gets the URL

- Confirm HTTPS, and that a wrong password says «невірні дані» rather than
  hanging.
- Check a page that reads the database — `/staff` — actually renders.
- **Prove the throttle is alive.** Get a password wrong half a dozen times and
  confirm the lockout arrives. This is worth doing by hand because failure here
  is silent by design: every throttle query falls back to allowing the attempt,
  so a missing `LoginThrottle` table looks exactly like a working login page.
  The only other symptom is an `auth.recordFailure` warning in the logs.

## 6. Mail

Nothing in the code names a provider; it is plain SMTP. **Mailjet**, sending as
**`edurank.uhsp.edu.ua`** — the subdomain, not the university's root domain.

**Why the subdomain** (decided 2026-08-13). The root domain already carries

```
v=spf1 include:spf.protection.outlook.com -all
```

for Microsoft 365, and a domain may hold only **one** SPF record. Authorising
Mailjet there means editing the live record every university mailbox depends on:
a typo, or a dropped `include:spf.protection.outlook.com`, and staff mail starts
failing SPF that afternoon. A subdomain needs no edit at all — it gets its own
records, and it also keeps EduRank's sending reputation separate from the
university's.

**Three records on `edurank.uhsp.edu.ua`. All published and verified 2026-08-14:**

| Type | Host                         | Value                                                 |
| ---- | ---------------------------- | ----------------------------------------------------- |
| TXT  | `mailjet._<code>.edurank`    | the ownership string Mailjet issues                   |
| TXT  | `edurank`                    | `v=spf1 include:spf.mailjet.com ?all`                 |
| TXT  | `mailjet._domainkey.edurank` | the `k=rsa; p=…` Mailjet shows **for this subdomain** |

The DKIM key is per domain — the one generated for the root domain will not
work here. The same name also carries the **A record** pointing at the VPS; A
and TXT coexist and you need both.

**DNS lives at thehost.com.ua**, and the registry confirms it: `.edu.ua`
delegates `uhsp.edu.ua` to `ns1`–`ns4.thehost.com.ua` and nowhere else. A
Cloudflare pair appears inside the zone as a broken leftover — it serves
nothing, and records added there are invisible.

**Their panel appends the zone to whatever you type in the Host field.** So the
host is `mailjet._domainkey.edurank`, never the full name — typing that gives
`…edurank.uhsp.edu.ua.uhsp.edu.ua`. Both mistakes were made on the way here: the
ownership record first landed on the root because the name was trimmed too far.
The zone still holds a `uhsp.edu.ua.uhsp.edu.ua` record from an older attempt.

The SPF ends in `?all` (neutral), not the `-all` originally planned. Mailjet
suggests it and it validates fine. Tightening to `-all` is worth doing once real
invites have arrived — but not on the same day, or a delivery failure has two
possible causes instead of one.

Then set `SMTP_FROM="EduRank <no-reply@edurank.uhsp.edu.ua>"`. An address on a
domain Mailjet has not authenticated is refused outright.

Optional: `_dmarc.edurank` → `v=DMARC1; p=none;` reports without enforcing.
Scoped to the subdomain, so it cannot affect university mail.

Until mail works the app runs fine and only the first admin can sign in —
invites and password resets both need it. See
[`email-setup.md`](./email-setup.md).

**A pre-existing thing, so it is not blamed on this change:** the root domain's
MX lists `mail.uhsp.edu.ua` beside Microsoft, and the root SPF does not
authorise it. Anything sending from that host is already failing SPF today.

## 7. Backups

Coolify's scheduled backups of the Postgres resource are the baseline. Set a
retention you can live with and a destination that is not the same disk.

**Then restore one.** Until that has been done once, the backup is a hope. This
is the single item on this page most likely to be skipped and most expensive to
have skipped.

The repo's `backup` service in `docker-compose.yml` writes plain `pg_dump`
files to `BACKUP_PATH` and was written with a NAS in mind. If the NAS is still
the plan, either mount it and point Coolify's backup there, or run that one
service against the Coolify database. Do not deploy the rest of that file.

### The restore drill

Run this on a quiet day, not during an incident — the point is that you have
done it before you need it. It touches nothing but a throwaway database, so it
is safe to repeat any time. Performed on dev 2026-08-22; every step below is
the one that actually ran.

```bash
# 1. A scratch database beside the real one. Never restore over the live DB.
docker compose exec -T postgres psql -U postgres   -c "DROP DATABASE IF EXISTS edurank_restore_test;"   -c "CREATE DATABASE edurank_restore_test;"

# 2. Restore the newest backup. THE TWO BACKUP WRITERS USE DIFFERENT FORMATS,
#    and the wrong command fails in a way that looks like a corrupt file:
#
#      dev, the compose `backup` service → plain SQL, gzipped → psql
#      production, Coolify               → pg_dump custom (PGDMP) → pg_restore
#
#    Check before you start, because during an incident you will not want to:
#      head -c 5 <file>   →  "PGDMP" = custom,  "--"/"SET" = plain SQL

# dev (plain SQL):
gunzip -c backups/daily/edurank-latest.sql.gz   | docker compose exec -T postgres psql -U postgres -d edurank_restore_test -q

# production (custom format). Coolify writes to
# /data/coolify/backups/databases/<team>/<resource>/pg-dump-<db>-<epoch>.dmp
# and its database is named `postgres`, not `edurank`.
docker exec -i <postgres-container> pg_restore -U postgres   -d edurank_restore_test --no-owner --no-privileges   < pg-dump-postgres-<epoch>.dmp

# 3. Is the data there?
docker compose exec -T postgres psql -U postgres -d edurank_restore_test -t -c "
  select 'Staff', count(*) from \"Staff\"
  union all select 'Activity', count(*) from \"Activity\"
  union all select 'RatingEntry', count(*) from \"RatingEntry\"
  union all select 'migrations', count(*) from _prisma_migrations
    where finished_at is not null;"

# 4. Can somebody sign in? Point the app's own code at it — a row count does
#    not prove a login works, and a login is what people will be doing.
#    On the server, run the app container with DATABASE_URL pointing here.
#    Locally, Next 16 refuses a second dev server in the same folder, so
#    exercise the real query layer instead:
DATABASE_URL="<the same URL, ending /edurank_restore_test>" npx tsx <<'TS'
import 'dotenv/config';
import { compare } from 'bcryptjs';
import { db } from './lib/db';
const email = 'admin@uhsp.edu.ua';
const s = await db.staff.findUnique({
  where: { email },
  select: { role: true, passwordHash: true, archivedAt: true },
});
const ok = !!s?.passwordHash && !s.archivedAt
  && (await compare(process.env.ADMIN_PASSWORD ?? '', s.passwordHash));
console.log(`login ${email}: ${ok ? 'WORKS' : 'FAILS'} · ${s?.role}`);
console.log('people:', await db.staff.count({ where: { isSystem: false } }));
await db.$disconnect();
TS

# 5. Throw it away.
docker compose exec -T postgres psql -U postgres   -c "DROP DATABASE edurank_restore_test;"
```

Three things these drills turned up, none fatal:

- **Production backups are `pg_dump` custom format, not plain SQL** (confirmed
  against the real file on 2026-08-22). `psql` cannot read one: it reports
  something that looks like corruption, on a backup that is perfectly good. Use
  `pg_restore`. This is the whole reason step 2 above has two commands.

- **`ERROR: unrecognized configuration parameter "transaction_timeout"`** on
  restore is expected and harmless. The backup image's `pg_dump` is newer than
  the `postgres:16` server, so the dump opens with a `SET` that 16 does not
  know. It fails, the restore continues, and the data is complete. Pin the
  backup image to a 16 build if you want the noise gone.
- **The backup is daily.** Restoring loses everything since the last run — up
  to 24 hours. Decide whether that is acceptable once real data is in, and
  raise the frequency in Coolify if it is not.

## 8. Upgrades

Push to `main`; Coolify rebuilds and redeploys. The entrypoint applies any new
migrations before the new container serves anything, so a schema change and the
code that needs it land together.

Two things to know:

- **A failed migration stops the deploy** rather than starting a server against
  a schema it does not match. That is deliberate — the alternative fails per
  page, at random, for whoever is using it.
- **`prisma migrate deploy` never generates or drops anything.** It applies
  committed migrations and nothing else, which is why it is safe on every boot.

---

## Known gaps

Honest list, as of 2026-08-14.

| Gap                        | Status                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Login throttling           | **Built** — escalating lockout, `LoginThrottle`. Never yet exercised against the deployed app; §5.   |
| Mailjet DNS                | **Live, verified 2026-08-14.** Ownership, SPF and DKIM all resolve on `edurank.uhsp.edu.ua`. See §6. |
| Staff import (~300 people) | **Built.** `pnpm data:export` here, `pnpm db:seed:core` there — see §4.                              |
| Instructions in Ukrainian  | None. Four audiences who have never seen the app.                                                    |
| Reminders / notifications  | No notification code exists at all.                                                                  |
| Restore drill              | **Done 2026-08-22** on dev, from the `backup` service's own file. See §7.                            |
| Support owner              | Nobody has been named. Decide who answers when an НПП cannot sign in.                                |

---

## Health check

`GET /api/health` answers `{"status":"ok"}` with **200** when the container can
reach Postgres, and `{"status":"error"}` with **503** when it cannot. Public and
unauthenticated on purpose — the caller is a process, not a person. It says
nothing else: this is the one URL anybody on the internet can call, and a
database error repeated verbatim gives away host and role names.

The check lives in the **`Dockerfile`**, so it travels with the image.

### Two things about Coolify, both verified

1. **A Dockerfile `HEALTHCHECK` beats the UI.** Coolify's own docs say so, and
   [issue #10974](https://github.com/coollabsio/coolify/issues/10974) reports the
   UI cannot override it even where it claims it will. So the Dockerfile is what
   actually runs, whatever the UI shows.
2. **Coolify's «HTTP request» check type needs `curl` or `wget` INSIDE the
   container** — and this image has neither. It is `node:22-slim` plus `openssl`
   and `ca-certificates`, nothing more. Switching that check type on without
   reading this marks a perfectly healthy container unhealthy, on every interval,
   forever.

Hence `node -e` with a global `fetch`: Node is already in the image and cannot
drift from it. If you ever configure the check in the UI as well, use **CMD** type
with this exact command, never HTTP:

```sh
node -e "if(process.env.HEALTHCHECK_OFF)process.exit(0);fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

### Enabling it safely — do NOT skip the order

While the healthcheck is disabled in Coolify, **Traefik routes traffic
regardless of health**. Enabling it therefore changes routing: a wrong check
takes the site down. So prove it first, on a deploy that cannot hurt you.

1. **Push.** Leave Coolify's healthcheck **disabled**. Traffic is unaffected —
   the Dockerfile check runs and reports, but nothing acts on it yet.
2. **Watch it.** `docker ps` → wait for STATUS `(healthy)`. This is the free test.
   - `(health: starting)` → still inside the start period. Wait.
   - `(unhealthy)` → **stop. Do not enable.** Diagnose below.
3. **Only then** enable it in Coolify.

### Timings, and why start-period is 180s

```
--interval=10s --timeout=5s --start-period=180s --retries=3
```

`entrypoint.sh` applies migrations **before** the server listens, so early
failures are the app working, not the app broken. Inside the start period a
failure is not counted: the container reads `health: starting`, never
`unhealthy`.

**A long start period is free.** Docker marks the container healthy the moment
the FIRST check passes — an app that boots in twenty seconds is healthy at twenty
seconds whatever this says. All it buys is forgiveness for a migration that
rewrites a big table.

What it trades: a genuinely broken container is called unhealthy after ~210s
instead of ~90s. Slower to notice a real failure, much harder to kill a deploy
that was fine. Raise it if a migration ever gets near it.

---

## When the healthcheck is the problem

The failure everybody fears: the check is wrong, Traefik stops routing, the site
is down, and the check is baked into an image so «just turn it off» means waiting
for a full rebuild. It does not, because of the escape hatch.

### 1. Get the site back up — 30 seconds, no rebuild

**Coolify → Environment Variables → add `HEALTHCHECK_OFF=1` → Restart.**

The check then passes unconditionally. The app is back to exactly how it behaved
before any of this existed: Traefik routes to it regardless of health. No
rebuild, no revert, no waiting on a build.

It is deliberately blunt. It does not fix anything — it stops the healthcheck
being the thing that is wrong, so you can diagnose without the site down. Remove
the variable and restart once the real problem is understood.

Note an empty value does **not** disable it (`HEALTHCHECK_OFF=` still checks), so
a half-typed variable cannot silently switch the check off.

### 2. Work out what actually happened

```sh
docker ps -a                                                  # find the container
docker inspect --format '{{json .State.Health}}' <id> | jq    # last 5 probe results + output
docker logs --tail 100 <id>                                   # what the app itself said
```

`State.Health.Log` holds the exit code and output of each recent probe. That
distinguishes the three cases:

| What you see                                          | What it means                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| `entrypoint: applying migrations…` and nothing after  | A migration is still running — **not** a healthcheck problem   |
| App logs normal, probe exits 1                        | The app is up but `/api/health` says no → Postgres unreachable |
| `Cannot find module` / node error in the probe output | The check command itself is broken                             |

**Is a migration simply slow?** Ask Postgres directly, from the database container:

```sh
psql -U postgres -d edurank -c \
  "SELECT pid, state, wait_event_type, left(query,80) AS query, now()-query_start AS running \
   FROM pg_stat_activity WHERE state <> 'idle' ORDER BY query_start;"
```

A long-running `ALTER TABLE` / `CREATE INDEX` is the migration working. **Let it
finish** — killing a migration halfway is far worse than a few minutes of
downtime, because Prisma then records the migration as failed and the next
deploy refuses to start until somebody resolves it by hand.

If it genuinely needs longer than the start period, raise `--start-period` in the
`Dockerfile` and redeploy. Do not lower `retries` to «make it pass».

### 3. Roll back the deploy

If the new build itself is bad rather than just the check:

**Coolify → Deployments → pick the last successful one → Redeploy.** That
redeploys a known-good image without touching git.

Git route, if the bad code is already on `main`:

```sh
git revert <sha>      # a new commit undoing it — never force-push main
git push
```

### 4. Last resort — run the container with no healthcheck at all

Only if Coolify itself is unreachable and you are on the server:

```sh
docker run --no-healthcheck ...   # same flags Coolify used, see `docker inspect`
```

Prefer `HEALTHCHECK_OFF=1` — a hand-run container is outside Coolify's knowledge
and the next redeploy silently replaces it.

## Rolling back does NOT undo a migration

Worth being exact about, because the instinct is wrong and the mistake is
expensive (raised by the owner, 2026-08-31).

**Prisma has no down-migrations.** Not «we do not use them» — they do not exist.
Check `prisma migrate --help` on this repo's own version: `deploy`, `status`,
`resolve`, `diff`, and nothing that goes backwards.

Two facts follow, and together they mean a rollback is almost never the answer:

1. **The database is a separate Coolify resource.** Redeploying swaps the app
   container and never touches Postgres. A migration that ran has still run.
2. **An older image carries an older `prisma/migrations` folder**, while
   `_prisma_migrations` in the database still records the newer one. The two
   disagree, and `migrate deploy` says so on the next boot:

   > The following migration(s) are applied to the database but missing from the
   > local migrations directory

   (That message is emitted by the `deploy` code path. Whether it merely warns or
   fails the deploy has **not** been tested here — do not plan around it.)

### Read the state first — this command writes nothing

```sh
npx prisma migrate status
```

Safe on production, any time. It reports what the database believes against what
the folder contains. Run it before doing anything else.

### What actually decides whether you are fine

Not the rollback — **what the migration did.**

| The migration                              | Roll the image back? | Why                                            |
| ------------------------------------------ | -------------------- | ---------------------------------------------- |
| Added a nullable column, a table, an index | ✅ fine              | Old code ignores what it does not know about   |
| Added a **required** column                | ⚠️ breaks            | Old code never sets it, so inserts fail        |
| Dropped a column or table                  | ❌ data is gone      | Only a backup brings it back                   |
| Renamed, or changed a type                 | ❌ breaks            | Old code reads a shape that is no longer there |

So the recovery for a bad migration is one of two things, and «redeploy the old
image» is neither:

1. **Roll forward.** Write a NEW migration that undoes the change. This is the
   normal path and covers almost every case.
2. **Restore the backup (§7).** Only when data was actually destroyed.

### A half-applied migration blocks every future deploy

If a migration fails partway, Prisma records it as failed and `migrate deploy`
**refuses to run at all** until a person resolves it:

```sh
npx prisma migrate resolve --rolled-back <migration_name>   # it did not apply — let me retry
npx prisma migrate resolve --applied     <migration_name>   # I repaired the DB by hand — move on
```

This is the whole reason for «do not kill a running migration» above. A slow one
costs minutes. A killed one costs an evening, and nothing deploys until it is
cleared by hand.
