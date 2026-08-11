'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';
import { ON_ROSTER } from '@/lib/queries/roster';
import { issueAndEmailLink, staffFullName } from '@/lib/mail/invite';
import { logWarning } from '@/lib/log';
import { INVITE_BATCH_SIZE, type InviteBatchState, type InviteOutcome } from './shared';

/**
 * Bulk invite, sent a batch at a time.
 *
 * 300 messages cannot go out in one request — a mail server that takes 300 ms a
 * message would hold the action open for a minute and a half, and any failure
 * partway would leave nobody able to say who had been written to. So the client
 * drives the loop: it asks for a batch, shows what happened to each person, and
 * asks for the next. Progress is visible, a stall is obvious, and stopping
 * halfway costs nothing.
 *
 * There is no queue and no worker on purpose. One button pressed once a year by
 * one admin does not justify a background service, and the app has no
 * infrastructure for one.
 */

/**
 * Pause between messages. Free tiers rate-limit per second far more tightly
 * than per day — Brevo and SendGrid both throttle bursts — and one refused
 * message here is a person who never learns the system exists.
 *
 * Read per call, not once at module scope: a module-level `process.env` read is
 * evaluated at import, so it can be baked in at build time and cannot be
 * changed without a redeploy — nor overridden by a test.
 */
function delayMs() {
  const parsed = Number(process.env.INVITE_DELAY_MS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 250;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function inviteBatch(ids: string[]): Promise<InviteBatchState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  if (ids.length === 0) return { results: [] };
  if (ids.length > INVITE_BATCH_SIZE) return { error: 'Забагато адресатів за один раз' };

  // Re-read rather than trusting the ids the page was rendered with: somebody
  // may have activated, been archived, or been deleted since it loaded.
  const people = await db.staff.findMany({
    where: { id: { in: ids }, ...ON_ROSTER },
    select: {
      id: true,
      email: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      passwordHash: true,
    },
  });
  const byId = new Map(people.map((p) => [p.id, p]));

  const results: InviteOutcome[] = [];
  const pause = delayMs();

  for (const id of ids) {
    const person = byId.get(id);
    if (!person) {
      results.push({ id, fullName: '—', email: '—', ok: false, error: 'Запис не знайдено' });
      continue;
    }

    const fullName = staffFullName(person);
    if (person.passwordHash) {
      results.push({
        id,
        fullName,
        email: person.email,
        ok: false,
        error: 'Обліковий запис вже активовано',
      });
      continue;
    }

    try {
      await issueAndEmailLink(person, 'invite');
      results.push({ id, fullName, email: person.email, ok: true });
    } catch (e) {
      // One refused address must not end the run. It is a warning, not an
      // error: nobody is blocked, and the admin can send to that person again.
      logWarning('staff.inviteBatch', 'Не вдалося надіслати запрошення', {
        userId: session.user.id,
        entityId: id,
        error: e instanceof Error ? e.message : String(e),
      });
      results.push({
        id,
        fullName,
        email: person.email,
        ok: false,
        error: 'Лист не надіслано',
      });
    }

    if (pause > 0) await wait(pause);
  }

  revalidatePath('/admin/invites');
  return { results };
}
