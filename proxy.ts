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
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
