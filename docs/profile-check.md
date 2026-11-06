# Перевірка профілів — where it stands (2026-11-06)

Read this to get the context back. The rules are also in CLAUDE.md under
«Перевірка профілів»; this file is the history, the open problems and how to
test. No secrets here: the Scopus key lives in `.env` and Coolify only.

## What it is

ADMIN-only page `/admin/profile-check`. It checks the ORCID, Web of Science,
Scopus and Google Scholar profile of every active НПП against what the
university requires, and keeps the latest result per person and platform
(`ProfileCheck`) plus a row per run (`ProfileCheckRun`). Ported from the
standalone Python tool `D:\project\npp-profile-scraper` (Selenium → plain HTTP,
Playwright for WoS, Elsevier API for Scopus). Code: `lib/profile-check/`.

## Status per platform

| Platform       | How it is read                        | Works locally                       | Works on prod                                               |
| -------------- | ------------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| ORCID          | public API + `affiliationGroups.json` | yes                                 | yes                                                         |
| Google Scholar | one GET, spaced ~7 s                  | **dev IP was blocked 2026-11-05**   | yes (prod IP was fine)                                      |
| Scopus         | Elsevier Author Retrieval API         | **only on the university network**  | **no** — `401 AUTHORIZATION_ERROR` for every view           |
| Web of Science | Playwright (a real browser)           | yes, needs Chrome/Edge, ~25 min run | **no** — no browser in the image (and WoS may block the IP) |

### Scopus — the finding (2026-11-06)

The free key is valid. The profile views (ENHANCED, STANDARD, LIGHT) answer
`200` only from the university's network (Pereiaslav, 78.137.2.34). From the
Hetzner server and from a phone network they answer
`401 AUTHORIZATION_ERROR - The requestor is not authorized to access the
requested view or fields of the resource`. A wrong key would say «Invalid API
Key» instead. So the access comes from the network, not the key.

**The fix is an institutional token (`insttoken`)** from the university
library or Elsevier support. The app already sends it as `X-ELS-Insttoken`
when `SCOPUS_INSTTOKEN` is set (not tested against a real token — if a valid
token still gives 401, check the header name in Elsevier's docs). **Contacting
Elsevier waits for the boss's confirmation** (owner, 2026-11-06); the
responsible person at the university is ill.

Test from a console, key typed so it is not saved:

```
read -rsp "Key: " KEY; echo
curl -s -D - -o /dev/null -H "X-ELS-APIKey: $KEY" -H "Accept: application/json" \
  "https://api.elsevier.com/content/author/author_id/57219915893?view=ENHANCED" \
  | grep -i "^HTTP\|x-els-status"
```

### Web of Science on prod

Two separate problems. (1) `browsers.json` was missing from the standalone
build, giving a raw «Cannot find module» error — **fixed** (`next.config.ts`
`outputFileTracingIncludes`, and a driver that will not load is now reported as
«Браузер недоступний»). (2) The production image has **no browser** — still
open. Options, none chosen: a separate Playwright container
(`mcr.microsoft.com/playwright:v1.64.1-noble`, run-server, port never
published, ~1 GB memory limit, `PROFILE_BROWSER_WS=ws://<name>:3000/`), or a
headless Chromium inside the app image (~+1 GB image). Either needs a deploy;
the last deploy froze prod for ~10 minutes (a lockfile change made the server
build for long), so deploy on a quiet day.

## What was built (and why it is the way it is)

- **One run per platform**, four buttons; a popup offers «ще не перевіряли» /
  «всіх» / «Скасувати». A run is a background job in the server process; the page
  polls. A deploy or restart kills a running check (it shows failed; saved
  results stay).
- **A failed attempt never replaces a real result.** Google refused one re-run
  and 294 saved results were overwritten before this rule. `saveResult` keeps
  the stored answer when the new status is `failed`.
- **A minute between two runs of one platform** (`cooldown.ts`).
- **Every run counts its requests** (`usage.ts`), and keeps Elsevier's
  `X-RateLimit-*` quota. Known limits: ORCID anonymous 12/s, 40 burst, 25,000
  reads/day/IP; Elsevier 5,000/week, 3/s per key; Google and WoS publish none.
- **Scholar** is spaced ~7 s (+jitter) and, after a block, fails everything for
  10 minutes. **WoS** is spaced ~8 s and a 429 closes the door for 10 minutes.
  Do not hammer either while testing.
- **The list shows every active НПП** (2026-11-06), scanned or not. No result =
  «Не перевіряли» (has a link) or «Немає посилання» (none; same word as a stored
  `no_link` result). Neither counts as a «problem». The Excel export has the
  same rows. «Перевірити знову» is disabled for someone with no links.
- **A started run is NOT audited** any more (2026-11-06), and the audit-log page
  hides the old `ProfileCheckRun` entries (they stay in the table).
- Scopus without a key falls back to reading only the author id from the link.

## Rule changes of 2026-11-06

- **WoS and Scopus: «Предметні категорії» removed** — not a requirement any more.
  No check, no scraping, no export column.
- **Google Scholar:** the latest publication is now advice («if you have
  up-to-date publications, please add them»), never an error. **New checks:**
  the verified email is at `uhsp.edu.ua`, the homepage link is the person's
  `uhsp.edu.ua/personnel/…` page (both required), and keywords (advice).
  The markup selectors (`gsc_prf_ivh`, `gsc_prf_int`, `gsc_prf_inta`) come from
  memory of Scholar's page and a test fixture, **not from a live page** — the
  dev IP is blocked. Verify on the first real run, on prod or the university
  network.
- Old saved results are read as today's rules (`legacy.ts`), so the page does not
  show the retired check or the old error until a re-run.

## Not decided / not built

- A long **saved pause after a Google or WoS block** (~6 h for Google), stored
  in the database, with the button disabled until a time. Optionally runs in
  **packs** (~25 people, ~10 min apart) with back-off and a stop button.
- A browser for WoS on prod (above).
- The institutional token (above).
- Whether to make the popup name network errors (ENOTFOUND, ETIMEDOUT).
- Nothing was checked about what the Scholar row says on prod («Запитів за 7
  днів», failures) — it would show whether a full run at ~7 s passes unblocked.

## Running it for a deadline without prod (the plan for Monday 2026-11-09)

1. At the university network, take a fresh prod dump and restore it:
   `docker cp <dmp> edurank-postgres-1:/tmp/x.dmp` (PowerShell), `createdb`,
   `pg_restore --no-owner --no-privileges`. The 2026-11-06 copy is
   `edurank_prod_20261106`, already a commented line in `.env`.
2. Point `DATABASE_URL` at it, restart `pnpm dev` (stale Prisma client otherwise).
   The dev logins exist only on `edurank`; use a real admin from the copy.
3. Run in this order: ORCID, Scopus (university network only), Web of Science,
   Google Scholar last. If Scholar blocks, stop; take Scholar from prod.
4. Export Excel from the page. A local run writes to the local database, not
   prod — the results reach prod only if someone copies them.

## State of the code

Branch `fix/profile-check-scopus-and-lists` (pushed, not merged), six commits:
the `browsers.json` fix, Scopus logging + `SCOPUS_INSTTOKEN`, the staff-list
check fix, the full list, the **temporary unfreeze** (the Характеристика, its
linked rating entries and the profile — three constants set to `false`, to be
switched on again later; tests of the frozen state run only while on), and the
audit-log removal. No migrations, no package changes.

## Earlier fixes worth remembering

- The staff-list check (`pnpm db:check-staff-list`) skipped people with only a
  сумісник row (Бокшиц 13 vs 14). It now reads their first row; 20 people were
  missed, five of them going DOWN (Губенко 15→4, Кряжич 13→4, Гагаріна, Опольська,
  Сентіщев). Do not `--apply` on prod without reading those five.
- A scripted edit through a shell heredoc repeatedly lost backslashes in
  regexes: use the Edit tool for code with `\`.
- A progress update on a stale Prisma client killed runs after the first
  person; the progress and usage writes are now best-effort and guarded.
