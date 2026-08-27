/**
 * Where to send somebody after they sign in, from an untrusted `?callbackUrl=`.
 *
 * The proxy records the page an anonymous visitor asked for so that logging in
 * takes them THERE rather than to a fixed landing page: an emailed link to
 * `/stakes/<id>` used to end at `/staff`, and the кафедра they were sent to
 * look at was simply forgotten (2026-08-27).
 *
 * **Everything here is about not becoming an open redirect.** The value arrives
 * in a query string, so anybody can put anything in it, and a login form that
 * forwards to `https://evil.example/` after a successful sign-in is a
 * ready-made phishing step. Only a path on this same site is ever returned:
 *
 * - it must start with a single `/` — `//evil.example` is protocol-relative and
 *   browsers treat it as another origin, which is the classic way past a naive
 *   «starts with /» check;
 * - `\` is rejected with it, because some browsers normalise `/\evil.example`
 *   the same way;
 * - anything else — an absolute URL, a `javascript:` value, an empty string —
 *   falls back to `null`, and the caller sends them to their own home page.
 */
export function safeCallbackPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  // `/login` itself would bounce somebody straight back to the form they just
  // completed, which reads as a failed sign-in.
  if (value === '/login' || value.startsWith('/login?')) return null;
  return value;
}
