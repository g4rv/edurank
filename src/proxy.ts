// Next.js 16: proxy files always run on Node.js runtime (no config needed).
// This is perfect for us since auth.ts imports Prisma, which requires Node.js.
import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes anyone can visit without being logged in.
// Everything else requires a valid session.
const PUBLIC_ROUTES = ['/login'];

export async function proxy(request: NextRequest) {
  const session = await auth();
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_ROUTES.includes(pathname);

  // No session + protected route → send to login
  if (!session && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Already logged in + visiting login → send to the right home for their role
  if (session && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // USER role can only access their own profile page.
  // Block access to any other route and redirect to their profile.
  if (session?.user.role === 'USER') {
    const professorId = session.user.professorId;

    // If somehow a USER has no linked professor, send to login (broken account)
    if (!professorId) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const profilePath = `/professors/${professorId}`;
    const isOwnProfile = pathname === profilePath;

    if (!isOwnProfile) {
      return NextResponse.redirect(new URL(profilePath, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except Next.js internals and the Auth.js API route.
  // If api/auth was not excluded, the login POST itself would be intercepted
  // before Auth.js could handle it — creating an infinite redirect loop.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
