import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { logWarning } from '@/lib/log';
import { afterFailure, isLocked, type ThrottleState } from './throttle-policy';

// Failed sign-in counting, the half that talks to the database.
//
// Two subjects are counted for every attempt — the email typed and the client
// IP — and either being locked refuses the attempt. See the `LoginThrottle`
// model for why both.
//
// Enforcement lives in `authorize()`, not in the login server action: NextAuth
// also exposes /api/auth/callback/credentials, and a check that only the form
// performs is a check somebody can POST straight past. The action reads this
// state afterwards purely to say something useful on screen.

export function emailSubject(email: string): string {
  return `email:${email.trim().toLowerCase()}`;
}

export function ipSubject(ip: string): string {
  return `ip:${ip}`;
}

/**
 * The client's address, as far as it can be trusted.
 *
 * Behind Coolify's Traefik every request arrives from the proxy, so without
 * this the IP counter would see one address for the whole university and lock
 * everybody out together on the fifth wrong password anywhere.
 *
 * `x-real-ip` first, because Traefik sets it to the actual peer. The rightmost
 * `x-forwarded-for` entry second, and rightmost rather than leftmost on
 * purpose: a client may send its own X-Forwarded-For and the proxy appends to
 * it, so the leftmost value is whatever the caller invented and the last is
 * what the proxy observed.
 *
 * Null in development, where there is no proxy and no header. The caller then
 * counts the email alone — a single shared «unknown» bucket would lock every
 * developer out of a local database at once.
 */
export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const real = h.get('x-real-ip')?.trim();
    if (real) return real;

    const forwarded = h.get('x-forwarded-for');
    if (!forwarded) return null;
    const parts = forwarded
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.at(-1) ?? null;
  } catch {
    // `headers()` throws outside a request scope. Nothing to throttle on.
    return null;
  }
}

/** Both subjects for one attempt — the email always, the IP when we have one */
export async function subjectsFor(email: string): Promise<string[]> {
  const ip = await clientIp();
  return ip ? [emailSubject(email), ipSubject(ip)] : [emailSubject(email)];
}

/**
 * When the earliest of these subjects becomes usable again, or null if none is
 * locked.
 */
export async function lockedUntil(subjects: readonly string[]): Promise<Date | null> {
  if (subjects.length === 0) return null;

  const now = new Date();
  const rows = await db.loginThrottle.findMany({
    where: { subject: { in: [...subjects] }, lockedUntil: { gt: now } },
    select: { lockedUntil: true },
    orderBy: { lockedUntil: 'desc' },
  });

  // The LATEST of the locks, not the earliest: a subject is usable only once
  // every lock covering it has expired, and telling somebody to come back in
  // one minute when their email is locked for sixty is a lie they will discover.
  return rows[0]?.lockedUntil ?? null;
}

/**
 * Count one failure against every subject.
 *
 * Runs for an unknown email too. Skipping it would make «no such account»
 * answer faster and cheaper than «wrong password», which hands over a way to
 * test whether somebody works here.
 *
 * Never throws: a failed login must still return a clean «невірні дані» if the
 * counter cannot be written, rather than a stack trace on the login form.
 */
export async function recordFailure(subjects: readonly string[]): Promise<void> {
  const now = new Date();
  for (const subject of subjects) {
    try {
      const existing = await db.loginThrottle.findUnique({
        where: { subject },
        select: { failures: true, lockLevel: true, lockedUntil: true },
      });
      const next = afterFailure(existing ?? blank(), now);

      await db.loginThrottle.upsert({
        where: { subject },
        update: next,
        create: { subject, ...next },
      });
    } catch (e) {
      logWarning('auth.recordFailure', 'could not record a failed login', { subject, error: e });
    }
  }
}

/**
 * A correct password clears the counters.
 *
 * The lock LEVEL goes too. Somebody who forgot their password on Monday and
 * signs in fine all week should not start Friday one failure away from an
 * hour's lockout.
 */
export async function clearFailures(subjects: readonly string[]): Promise<void> {
  if (subjects.length === 0) return;
  try {
    await db.loginThrottle.deleteMany({ where: { subject: { in: [...subjects] } } });
  } catch (e) {
    logWarning('auth.clearFailures', 'could not clear login counters', { error: e });
  }
}

/** ADMIN's «Зняти блокування» — drops whatever this email has accumulated */
export async function unlockEmail(email: string): Promise<void> {
  await db.loginThrottle.deleteMany({ where: { subject: emailSubject(email) } });
}

/** What the staff page shows: is this account locked, and until when */
export async function emailLockedUntil(email: string): Promise<Date | null> {
  const row = await db.loginThrottle.findUnique({
    where: { subject: emailSubject(email) },
    select: { failures: true, lockLevel: true, lockedUntil: true },
  });
  if (!row) return null;
  return isLocked(row, new Date()) ? row.lockedUntil : null;
}

function blank(): ThrottleState {
  return { failures: 0, lockLevel: 0, lockedUntil: null };
}
