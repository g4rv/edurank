import { db } from '@/lib/db';
import { KYIV } from '@/lib/kyiv-time';

/**
 * How often one person may be mailed an invite or reset link (owner,
 * 2026-10-12): at least a minute apart, at most three in six hours. If none of
 * three arrived that is the server's fault; a person who cannot find the
 * letter must not spend the Mailjet quota. ADMIN is exempt — the callers skip
 * the check, this module does not know who is asking.
 */
export const MAIL_COOLDOWN_MS = 60 * 1000;
export const MAIL_CAP = 3;
export const MAIL_WINDOW_MS = 6 * 60 * 60 * 1000;

export type MailAllowance = { ok: true } | { ok: false; retryAt: Date };

/**
 * Pure rule. A letter exactly `MAIL_WINDOW_MS` old no longer counts, and one
 * exactly `MAIL_COOLDOWN_MS` old no longer blocks — the answer's `retryAt` is
 * the first instant at which asking again succeeds.
 */
export function evaluateAllowance(sentAt: readonly Date[], now: Date): MailAllowance {
  const at = now.getTime();
  const times = sentAt
    .map((d) => d.getTime())
    .filter((t) => t > at - MAIL_WINDOW_MS)
    .sort((a, b) => a - b);

  let retry = 0;
  const newest = times[times.length - 1];
  if (newest !== undefined && at - newest < MAIL_COOLDOWN_MS) retry = newest + MAIL_COOLDOWN_MS;
  if (times.length >= MAIL_CAP) {
    // Enough of the oldest must age out to leave fewer than MAIL_CAP in the window.
    retry = Math.max(retry, times[times.length - MAIL_CAP] + MAIL_WINDOW_MS);
  }
  return retry ? { ok: false, retryAt: new Date(retry) } : { ok: true };
}

export async function mailAllowance(staffId: string, now = new Date()): Promise<MailAllowance> {
  const rows = await db.mailSend.findMany({
    where: { staffId, sentAt: { gt: new Date(now.getTime() - MAIL_WINDOW_MS) } },
    select: { sentAt: true },
  });
  return evaluateAllowance(
    rows.map((r) => r.sentAt),
    now
  );
}

/** Call ONLY after the mail server accepted the message. */
export async function recordMailSent(
  staffId: string,
  kind: 'invite' | 'reset',
  now = new Date()
): Promise<void> {
  await db.mailSend.create({
    data: { staffId, kind: kind === 'invite' ? 'INVITE' : 'RESET', sentAt: now },
  });
  await db.mailSend.deleteMany({
    where: { staffId, sentAt: { lte: new Date(now.getTime() - MAIL_WINDOW_MS) } },
  });
}

const dayKey = (d: Date) => d.toLocaleDateString('uk-UA', KYIV);

/** «Спробуйте після 14:32», with the date when the wait crosses midnight in Kyiv */
export function retryMessage(retryAt: Date, now = new Date()): string {
  const time = retryAt.toLocaleTimeString('uk-UA', { ...KYIV, hour: '2-digit', minute: '2-digit' });
  if (dayKey(retryAt) === dayKey(now)) return `Лист уже надсилали. Спробуйте після ${time}`;
  const date = retryAt.toLocaleDateString('uk-UA', { ...KYIV, day: '2-digit', month: '2-digit' });
  return `Лист уже надсилали. Спробуйте після ${date}, ${time}`;
}
