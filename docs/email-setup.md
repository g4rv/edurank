# Email setup

The app sends two letters: the **invite** (activate your account, set a password)
and the **password reset**. Both go through `lib/mail/mailer.ts`, which is plain
nodemailer over SMTP.

**No provider is named anywhere in the code.** Switching between Mailjet, Brevo,
SendGrid, Gmail or the university's own relay is five environment variables and
a restart. Nothing to rewrite, nothing to redeploy differently.

```bash
SMTP_HOST=""            # e.g. smtp-relay.brevo.com
SMTP_PORT=587           # 465 turns on implicit TLS; anything else uses STARTTLS
SMTP_USER=""            # empty = no authentication (dev only)
SMTP_PASS=""
SMTP_FROM="EduRank <no-reply@example.edu.ua>"
```

## Two things that will silently break the whole thing

**`APP_URL` must be set in production.** Every activation link is built from it
and the fallback is `http://localhost:3000`. Miss it and 300 invites go out
looking perfectly normal, with a link nobody on earth can open.

**`SMTP_FROM` must match the address the provider has verified.** Providers
reject, or silently drop, a `From:` they have not been shown you control.

## The provider: Mailjet (decided 2026-08-13)

```bash
SMTP_HOST=in-v3.mailjet.com
SMTP_PORT=587                    # 465 also works, and is worth trying if 587 is blocked
SMTP_USER=<API key>              # NOT your account email
SMTP_PASS=<Secret key>           # both at app.mailjet.com/account/apikeys
SMTP_FROM="EduRank <no-reply@edurank.uhsp.edu.ua>"
```

**The letters come from a SUBDOMAIN, `edurank.uhsp.edu.ua`, not the university's
root domain.** The root already publishes a strict `-all` SPF for Microsoft 365,
and editing a live record that every university mailbox depends on is a risk
this app has no business taking. The subdomain gets its own SPF and DKIM and
cannot affect the main one.

That choice is the whole reason a third party is workable here. Normally the
catch with any external sender is that its machines send mail _claiming_ to be
your domain, and receiving servers notice — mail lands in spam, shows as
«via mailjet.com», or is rejected outright where DMARC is strict. Authenticating
a subdomain in Mailjet answers that properly, without touching the record the
rest of the university runs on.

### Watch the daily cap before an invite run

Mailjet's free tier was **6 000 letters a month and 200 a day** when this was
written — confirm it, tiers move. At ~300 НПП that is **two days** for a full
invite run, which is worth knowing before the morning you plan to send. See
«Sending to everyone» below.

### The alternative, if it is ever offered

**The university's own SMTP relay** remains the better outcome: no cap, no third
party holding the address list, and mail from the university domain to
university mailboxes is not filtered. It needs IT — but so does the DNS for the
subdomain, so if you are talking to them anyway, ask for the relay first.
Switching is five environment variables and a restart; nothing in the code names
a provider.

## Sending to everyone

`/admin/invites` (ADMIN only) lists everyone with no account and writes to them
in batches of 20, with `INVITE_DELAY_MS` between messages — free tiers throttle
**bursts** much harder than daily totals. The run shows progress, can be stopped
halfway, and ends with a per-person result so failures can be retried on their
own.

At 300 people: **two days on Mailjet** at 200/day, and one sitting on the
university relay. Worth knowing before the day you plan to send.

## Is it actually configured?

```bash
pnpm mail:test                    # connect and authenticate only — sends nothing
pnpm mail:test you@example.com    # …then send one real letter
```

It prints what the app will use, then does the two things that fail for
different reasons: **connecting and authenticating**, which is about the keys,
and **delivering**, which is about whether the provider will send as your
`SMTP_FROM`. A failure names the setting to change rather than the exception —
wrong host, blocked port, wrong key, unverified sender and a swapped TLS port
each read differently.

It runs through the same transport the app sends on, so it cannot pass while
the app fails.

«Accepted» means the provider took the letter, not that it arrived. Check the
inbox, the spam folder, and Mailjet's own event log.

## Testing without sending anything

`docker compose up -d` runs **Mailpit**, which accepts every message and
delivers none. Read them at <http://localhost:8025>. The defaults in
`.env.example` already point there, so a fresh checkout cannot email a real
person by accident.
