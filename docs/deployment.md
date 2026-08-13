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
| **Demo data**            | Never. `pnpm db:seed` writes an invented university and five accounts with published passwords.                                                                                                   |

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
docker run --rm -it --network <coolify-network> \
  -e DATABASE_URL='<the internal string from §1>' \
  edurank-tools pnpm db:seed-production

docker run --rm -it --network <coolify-network> \
  -e DATABASE_URL='<the internal string from §1>' \
  edurank-tools pnpm db:create-admin
```

`db:create-admin` asks for email, ПІБ and a password, so it needs `-it`. It
refuses to run where an administrator already exists — pass `ADMIN_FORCE=1` if
that is genuinely what you want. For a non-interactive run, set `ADMIN_EMAIL`,
`ADMIN_PASSWORD` and `ADMIN_NAME` instead.

`db:seed-production` is safe to run again after any upgrade — every write is an
upsert on a stable key, and a value an admin has since edited is left alone.

**Do not run `pnpm db:seed`.** That is the demo university.

Delete the `edurank-tools` image afterwards if you want the disk back; it is
only needed when the catalogue changes.

Then sign in at `https://edurank.uhsp.edu.ua/login` and build the structure:
факультети → кафедри → відділи → people, or wait for the staff import.

## 5. Before anybody else gets the URL

- **Login throttling is not built yet.** The audit called it a deployment
  blocker and it is right: a public host with an unthrottled password form.
  Until it lands, do not circulate the address.
- Confirm HTTPS, and that a wrong password says «невірні дані» rather than
  hanging.
- Check a page that reads the database — `/staff` — actually renders.

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

**Two records, both new, on `edurank.uhsp.edu.ua`:**

| Type | Host                         | Value                                                 |
| ---- | ---------------------------- | ----------------------------------------------------- |
| TXT  | `edurank`                    | `v=spf1 include:spf.mailjet.com -all`                 |
| TXT  | `mailjet._domainkey.edurank` | the `k=rsa; p=…` Mailjet shows **for this subdomain** |

The DKIM key is per domain — the one generated for the root domain will not
work here. The same name also carries the **A record** pointing at the VPS; A
and TXT coexist and you need both.

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

**Then restore one.** Take a dump, restore it into a scratch database, point a
local app at it and sign in. Until that has been done once, the backup is a
hope. This is the single item on this page most likely to be skipped and most
expensive to have skipped.

The repo's `backup` service in `docker-compose.yml` writes plain `pg_dump`
files to `BACKUP_PATH` and was written with a NAS in mind. If the NAS is still
the plan, either mount it and point Coolify's backup there, or run that one
service against the Coolify database. Do not deploy the rest of that file.

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

Honest list, as of 2026-08-13.

| Gap                        | Status                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Login throttling           | **Not built.** Blocks circulating the URL.                                                           |
| Mailjet DNS                | Account registered 2026-08-13. SPF + DKIM for the subdomain are with IT; unverified until published. |
| Staff import (~300 people) | Not built. Deploy empty was the decision; import follows.                                            |
| Instructions in Ukrainian  | None. Four audiences who have never seen the app.                                                    |
| Reminders / notifications  | No notification code exists at all.                                                                  |
| Restore drill              | Never performed.                                                                                     |
| Support owner              | Nobody has been named. Decide who answers when an НПП cannot sign in.                                |
