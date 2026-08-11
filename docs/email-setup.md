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

## Choosing a provider

The real question is not the provider — it is **what address the letter comes
from**, because that decides whether ~300 people see it or their spam folder
does.

| Option                    | Daily cap    | What it needs                        | From: address                       |
| ------------------------- | ------------ | ------------------------------------ | ----------------------------------- |
| **University SMTP relay** | usually none | one request to IT                    | the university's own                |
| **Brevo**                 | 300 free     | click a link in a confirmation email | any address you can receive mail at |
| **SendGrid**              | 100 free     | same                                 | same                                |
| **Gmail / Workspace**     | 500 / 2000   | an app password                      | a gmail address                     |

**The university relay is the right answer** if IT will give it to you. Mail from
the university domain to university mailboxes does not get filtered, there is no
daily cap to spread a send across, and there is no third party holding the
address list.

### The catch with any third party

You can put a university address in `SMTP_FROM` after verifying it by email —
but the letters are then physically sent by Brevo's machines _claiming_ to be
your domain. Receiving servers notice. Depending on the university's DNS you get
mail marked spam, shown as **"via brevo.com"**, or rejected outright if the
domain publishes a strict DMARC policy.

Fixing that properly means adding **SPF and DKIM records to the university's
DNS** — which needs the same people who could have given you the relay. So:

> If you need the letters to come from the university's address, you need IT
> either way. Asking for the relay is less work for them and the better outcome.

Brevo with a personal or departmental address works and needs nobody's help. It
just does not look official.

## Sending to everyone

`/admin/invites` (ADMIN only) lists everyone with no account and writes to them
in batches of 20, with `INVITE_DELAY_MS` between messages — free tiers throttle
**bursts** much harder than daily totals. The run shows progress, can be stopped
halfway, and ends with a per-person result so failures can be retried on their
own.

At 300 people: fine in one sitting on the university relay or Gmail; **two days
on Brevo** (300/day) and **three on SendGrid** (100/day). Worth knowing before
the day you plan to send.

## Testing without sending anything

`docker compose up -d` runs **Mailpit**, which accepts every message and
delivers none. Read them at <http://localhost:8025>. The defaults in
`.env.example` already point there, so a fresh checkout cannot email a real
person by accident.
