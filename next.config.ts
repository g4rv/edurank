import type { NextConfig } from 'next';

// Tunnel hosts, so the app can be shown on a phone over ngrok. Both settings
// widen what Next accepts, and `serverActions.allowedOrigins` is the one that
// matters once this is deployed: it lists the origins allowed to POST a server
// action, so a wildcard for a public tunnel domain would let any page hosted
// there call ours. Development only — production keeps the default, which is
// the app's own origin and nothing else.
const TUNNEL_ORIGINS = ['*.ngrok-free.dev', '*.ngrok-free.app', '*.ngrok.io', '*.ngrok.app'];
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Content-Security-Policy — what the browser is allowed to load and where it
 * may send things.
 *
 * The app loads nothing from anywhere else: no CDN, no analytics, no web font
 * service, no remote images. `default-src 'self'` therefore costs nothing and
 * is the line that actually matters — script injected into a page cannot fetch
 * a payload or beacon anything out, because every origin but ours is refused.
 *
 * Two relaxations, both real and both narrow:
 *
 * - **`'unsafe-inline'` on style-src.** Tailwind is fine; `components/ui/chart.tsx`
 *   is not. shadcn's chart injects a `<style>` element through
 *   `dangerouslySetInnerHTML` to give each series its colour, so every chart on
 *   /dashboard goes monochrome without this. A nonce cannot reach it — the tag
 *   is written by the component, not by the framework.
 * - **`'unsafe-inline'` on script-src.** Next inlines the hydration and RSC
 *   payload scripts. Removing this needs a per-request nonce minted in
 *   `proxy.ts` and threaded through, plus `'strict-dynamic'`. That is the
 *   proper fix and it is worth doing later; it is not worth blocking these
 *   headers on, because the directives below already close the exits.
 *
 * The exits, which do not depend on script-src at all:
 * - `form-action 'self'` — a script cannot repoint a form at a collector.
 * - `frame-ancestors 'none'` — nobody frames this app (clickjacking a payroll
 *   grid is the attack; the same thing X-Frame-Options says, for older browsers).
 * - `base-uri 'self'` — an injected `<base>` cannot re-root every relative URL.
 * - `object-src 'none'` — no Flash/PDF plugin surface.
 *
 * `upgrade-insecure-requests` in production only. In development the app is
 * plain http on localhost and the directive would rewrite its own requests to
 * https, which nothing is listening on.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // blob: because the Excel and PDF exports are handed to the browser as an
  // object URL rather than a link to a file on the server.
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

/**
 * Sent on every response.
 *
 * Traefik in front of this adds none of them — Coolify's defaults terminate TLS
 * and route, and stop there — so if they are not set here they are not set.
 */
const SECURITY_HEADERS = [
  /**
   * REPORT-ONLY, deliberately, until somebody has clicked through the app with
   * devtools open (2026-08-31).
   *
   * A CSP is the one header that can break a working page, and it does it in a
   * way nothing here would catch: `next build`, `tsc` and the whole test suite
   * pass identically whether the policy is right or wrong, because it is only
   * ever enforced by a browser. Shipping it enforced would be guessing with
   * production as the test.
   *
   * Report-Only sends the exact same policy and blocks NOTHING. The browser
   * evaluates it and writes a console warning for anything that would have been
   * refused. So the risk is zero and the information is the same.
   *
   * TO FINISH THIS: open the app, visit /dashboard (charts), /stakes/[id] (the
   * grid), an Excel and a PDF export, and watch the console for
   * «Content-Security-Policy» warnings. None → rename this key to
   * `Content-Security-Policy` and it is enforced. Some → fix the policy first.
   */
  { key: 'Content-Security-Policy-Report-Only', value: CSP },
  // Belt and braces with `frame-ancestors` above, for browsers that predate CSP
  // level 2. Costs one header and removes the doubt.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  /**
   * URLs here name people — `/staff/<id>`, `/stakes/<id>`. `strict-origin-when-
   * cross-origin` sends the full path only to ourselves, and bare
   * `https://edurank.uhsp.edu.ua` to anybody else, so a link somebody follows
   * out of the app does not hand the destination a staff id.
   */
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing here uses a camera, a microphone or a location, so refuse them
  // outright: an injected script cannot prompt for what the page never asks for.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

/**
 * HSTS — NOT SENT YET, on purpose (2026-08-31).
 *
 * After one visit it makes the browser refuse to speak http to this host for the
 * whole `max-age`. That is the point of it, and it is also why it is the one
 * header here that cannot simply be taken back: removing it from the server does
 * nothing for anybody who already has the pin — their browser keeps enforcing it
 * until it expires. A wrong certificate or a domain change then locks people out
 * of the app with no way to click through.
 *
 * The app is served over https by Coolify either way, so what this actually
 * protects against is a downgrade attack on a university intranet app. That is a
 * real but small risk, and it does not justify shipping something irreversible
 * while nobody has time to watch it.
 *
 * TO TURN IT ON LATER, in two steps and not one:
 *   1. `max-age=300` — five minutes. Deploy, confirm nothing broke. Any mistake
 *      expires by itself while you are still looking at it.
 *   2. Raise to `max-age=63072000` (two years) once it has run for a week.
 *
 * Keep it without `includeSubDomains` and without `preload`. Both reach past
 * this app into the university's own domain, and `preload` is baked into browser
 * binaries — slow and awkward to undo, and not this app's decision to make.
 */
const HSTS = {
  key: 'Strict-Transport-Security',
  value: 'max-age=300',
};
void HSTS; // not in SECURITY_HEADERS yet — see the note above

const nextConfig: NextConfig = {
  // Ships a self-contained server in `.next/standalone` — its own minimal
  // node_modules and a `server.js` to run. Without it the production image
  // needs the whole dependency tree and `next start`, which is several hundred
  // megabytes of build tooling nobody runs at runtime.
  //
  // Two things it does NOT copy, which the Dockerfile has to do by hand:
  // `.next/static` and `public`. Miss them and the app boots and serves HTML
  // with no CSS and no fonts — a working site that looks broken.
  output: 'standalone',
  ...(isDev ? { allowedDevOrigins: TUNNEL_ORIGINS } : {}),
  experimental: {
    ...(isDev ? { serverActions: { allowedOrigins: TUNNEL_ORIGINS } } : {}),
    staleTimes: {
      dynamic: 30,
    },
  },

  /**
   * Applied to everything, `/api` included.
   *
   * `/:path*` rather than a list: a header nobody remembered to add to a new
   * route is the ordinary way these stop being true, and there is no route here
   * that wants weaker ones.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        // HSTS is deliberately NOT in this list yet — see its note above.
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
