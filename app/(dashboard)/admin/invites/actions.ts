'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';
import { ON_ROSTER } from '@/lib/queries/roster';
import { issueAndEmailLink, staffFullName } from '@/lib/mail/invite';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { logWarning } from '@/lib/log';
import { INVITE_BATCH_SIZE, hasNoEmail, type InviteBatchState, type InviteOutcome } from './shared';

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

    // A placeholder address cannot receive anything, and a bulk send would
    // otherwise fail thirty-four times over with «Лист не надіслано», which
    // says nothing about what to do.
    if (hasNoEmail(person.email)) {
      results.push({
        id,
        fullName,
        email: person.email,
        ok: false,
        error: 'Немає адреси — вкажіть її на сторінці працівника',
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

export type RevertInviteState = { error: string } | { success: true };

/**
 * «Позначити як ненадіслане» — forget that a letter ever went to this person.
 *
 * The `ActivationToken` row IS the record that an invitation was sent: there is
 * no `invitedAt` column, `/admin/invites` prints the row's `createdAt` as
 * «Останнє запрошення», and the `invited` filter splits the list on whether one
 * exists. So the way to put somebody back into «не надсилалося» — and therefore
 * back into the next bulk batch — is to delete it.
 *
 * The case it exists for: a letter that was recorded as sent and never arrived.
 * `storeActivationToken` only writes after the mail server has ACCEPTED the
 * message, so the row means «accepted», not «delivered», and a provider can
 * still bounce it afterwards. Without this an admin had to resend to the whole
 * list to reach those people, which rewrites everybody else's link too.
 *
 * **It destroys the link in their mailbox.** The token is the link, so a letter
 * that did arrive stops working. That is the intended trade — for the person
 * this is used on, the link was never usable — but it is why the button asks
 * first.
 *
 * **It also destroys the only trace of that send**, which nothing else in the
 * invite flow does — invites deliberately write no audit entry, because the
 * token row is the trace. So this one writes one, or «to whom did we write, and
 * when» stops being answerable the moment somebody presses it.
 */
export async function revertInviteSent(id: string): Promise<RevertInviteState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const staff = await db.staff.findUnique({
    where: { id },
    select: {
      lastName: true,
      firstName: true,
      patronymic: true,
      passwordHash: true,
      activationToken: { select: { createdAt: true } },
    },
  });
  if (!staff) return { error: 'Запис не знайдено' };
  // Nothing to revert, and the token is irrelevant once a password exists —
  // saying so beats silently succeeding and leaving the list unchanged.
  if (staff.passwordHash) return { error: 'Обліковий запис вже активовано' };
  if (!staff.activationToken) return { error: 'Запрошення цій людині не надсилалося' };

  const sentAt = staff.activationToken.createdAt;

  try {
    await db.$transaction(async (tx) => {
      await tx.activationToken.deleteMany({ where: { staffId: id } });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Staff',
          entityId: id,
          label: staffFullName(staff),
          userId: session.user.id,
          changes: diffChanges({ invitedAt: sentAt }, { invitedAt: null }),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося скинути статус. Зміни не застосовано',
        'invites.revertInviteSent',
        { userId: session.user.id, entityId: id }
      ),
    };
  }

  revalidatePath('/admin/invites');
  revalidatePath(`/staff/${id}`);
  return { success: true };
}

export type RevertManyState = { error: string } | { success: true; count: number };

/**
 * The same thing over everyone currently on screen.
 *
 * The page's filters are URL params and the list is already exactly what they
 * select, so «скинути» acts on the кафедра, the kind and the domain that are
 * chosen — the client sends the ids it is showing and nothing wider.
 *
 * One database round trip, not one per person: there is no mail here, so none
 * of `inviteBatch`'s batching applies. What that batching exists for is a
 * minute-long run somebody has to watch; this is two queries.
 *
 * **An audit row per person, unlike `saveDistribution`, which writes one for a
 * whole кафедра.** The difference is what the entry has to answer later. A
 * розподіл is a single decision about one кафедра; this is bookkeeping about
 * individuals, and «did we write to Франко, and when» cannot be answered by a
 * summary saying twenty people were reset.
 */
export async function revertInviteSentMany(ids: string[]): Promise<RevertManyState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };
  if (ids.length === 0) return { error: 'Нікого не вибрано' };

  // Re-read rather than trusting what the page was rendered with, exactly as
  // `inviteBatch` does: somebody may have activated or been archived since it
  // loaded, and clearing their token then would erase a real send for nothing.
  const people = await db.staff.findMany({
    where: {
      id: { in: ids },
      ...ON_ROSTER,
      passwordHash: null,
      activationToken: { isNot: null },
    },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      activationToken: { select: { createdAt: true } },
    },
  });

  if (people.length === 0) return { error: 'Немає кому скидати статус' };

  try {
    await db.$transaction(async (tx) => {
      await tx.activationToken.deleteMany({
        where: { staffId: { in: people.map((p) => p.id) } },
      });
      await tx.auditLog.createMany({
        data: people.map((p) => ({
          action: 'UPDATE',
          entity: 'Staff',
          entityId: p.id,
          label: staffFullName(p),
          userId: session.user.id,
          changes: diffChanges(
            { invitedAt: p.activationToken?.createdAt ?? null },
            { invitedAt: null }
          ),
        })),
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося скинути статус. Зміни не застосовано',
        'invites.revertInviteSentMany',
        { userId: session.user.id }
      ),
    };
  }

  revalidatePath('/admin/invites');
  return { success: true, count: people.length };
}
