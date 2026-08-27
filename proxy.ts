import { NextResponse, type NextRequest } from 'next/server';

// Optimistic gate only — deliberately no auth() call and no database read.
//
// Proxy runs on EVERY route, including prefetched ones, and lib/auth.ts re-reads
// the Staff row on each auth() call to pick up role changes and tokenVersion.
// Resolving the session here therefore cost one query per prefetched link.
// Next's own guidance: "it's important to only read the session from the cookie
// (optimistic checks), and avoid database checks to prevent performance issues".
//
// Whether a session is genuine is decided downstream, close to the data: every
// dashboard page, every server action and the export route call auth(), which
// verifies the JWT signature and the tokenVersion kill-switch. A forged or
// expired cookie gets past this gate and is redirected by the page instead —
// same destination, one extra hop, and forceLogout still takes effect at once.

// @auth/core adds the __Secure- prefix when the site is served over HTTPS
const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token'];

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => req.cookies.has(name));
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /login is NOT gated on the cookie: a stale one would bounce to /staff, whose
  // page finds no real session and sends the user back here — forever. The login
  // page checks the verified session itself and redirects only if it is real.
  if (pathname === '/login') return NextResponse.next();

  // Public account-recovery routes: reachable without a session by design
  // (activation links arrive by email; forgot-password is for the logged-out)
  if (pathname === '/forgot-password' || pathname.startsWith('/activate/')) {
    return NextResponse.next();
  }

  if (!hasSessionCookie(req)) {
    // Remember the page they asked for, so signing in takes them there rather
    // than to a fixed landing page. An emailed link to `/stakes/<id>` used to
    // end at `/staff` with the кафедра forgotten (2026-08-27).
    //
    // Path + query only, never a whole URL: `safeCallbackPath` refuses
    // anything that is not a same-site path, and this is where the value it
    // later has to trust is produced.
    const login = new URL('/login', req.url);
    const wanted = `${pathname}${req.nextUrl.search}`;
    if (pathname !== '/') login.searchParams.set('callbackUrl', wanted);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
