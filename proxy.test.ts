import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import proxy from './proxy';

/** Minimal NextRequest stand-in: the proxy only reads nextUrl, url and cookies */
function request(pathname: string, cookies: string[] = []): NextRequest {
  const url = `http://localhost:3000${pathname}`;
  return {
    nextUrl: new URL(url),
    url,
    cookies: { has: (name: string) => cookies.includes(name) },
  } as unknown as NextRequest;
}

const SESSION = 'authjs.session-token';
const SECURE_SESSION = '__Secure-authjs.session-token';

/** Where a response sends the user, or null when it passes through */
function redirectTarget(res: Response): string | null {
  const location = res.headers.get('location');
  return location ? new URL(location).pathname : null;
}

describe('proxy', () => {
  it('sends an anonymous visitor to /login', () => {
    expect(redirectTarget(proxy(request('/staff')))).toBe('/login');
    expect(redirectTarget(proxy(request('/rating')))).toBe('/login');
    expect(redirectTarget(proxy(request('/admin/rating')))).toBe('/login');
  });

  it('lets a request with a session cookie through', () => {
    expect(redirectTarget(proxy(request('/staff', [SESSION])))).toBeNull();
  });

  it('accepts the __Secure- cookie used over HTTPS', () => {
    expect(redirectTarget(proxy(request('/staff', [SECURE_SESSION])))).toBeNull();
  });

  it('ignores unrelated cookies', () => {
    expect(redirectTarget(proxy(request('/staff', ['authjs.callback-url'])))).toBe('/login');
  });

  // The loop this guards against: a stale cookie bounces /login → /staff, the
  // page finds no real session and sends the user back to /login, forever.
  it('never redirects away from /login, even with a session cookie', () => {
    expect(redirectTarget(proxy(request('/login', [SESSION])))).toBeNull();
    expect(redirectTarget(proxy(request('/login')))).toBeNull();
  });

  it('leaves the public recovery routes open', () => {
    expect(redirectTarget(proxy(request('/forgot-password')))).toBeNull();
    expect(redirectTarget(proxy(request('/activate/abc123')))).toBeNull();
  });

  it('still gates a path that merely starts like a public one', () => {
    expect(redirectTarget(proxy(request('/activate')))).toBe('/login');
    expect(redirectTarget(proxy(request('/forgot-password-x')))).toBe('/login');
  });
});
