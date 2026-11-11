import { cache } from 'react';
import { db } from '@/lib/db';
import { effectiveFreeze, NOTHING_FROZEN, type Freeze, type FreezeSettings } from './rules';

/**
 * The freeze switches as stored, and what they come to for one viewer — the
 * half of `lib/freeze` that talks to the database. The rules themselves are in
 * `./rules.ts`, with no database in them.
 */

/** The one settings row. `id` is always this. */
export const FREEZE_SETTINGS_ID = 'default';

/**
 * The four switches as the ADMIN left them. **Deduped per request** (React
 * `cache`): a page and its layout both ask, and so may three checks inside one
 * action. A missing row — never the case after the migration — reads as
 * nothing frozen, the same answer the constants gave for most of the app's
 * life.
 */
export const loadFreezeSettings = cache(async (): Promise<FreezeSettings> => {
  const row = await db.freezeSettings.findUnique({
    where: { id: FREEZE_SETTINGS_ID },
    select: {
      allFrozen: true,
      kharakterystykaFrozen: true,
      linkedRatingFrozen: true,
      profileFrozen: true,
    },
  });
  return row ?? NOTHING_FROZEN;
});

/** Is this person on the ADMIN's whitelist? */
export const isFreezeExempt = cache(
  async (staffId: string | null | undefined): Promise<boolean> => {
    if (!staffId) return false;
    const row = await db.freezeExemption.findUnique({
      where: { staffId },
      select: { staffId: true },
    });
    return row !== null;
  }
);

/**
 * What is closed to THIS viewer — the one question every page and action asks.
 *
 * ADMIN costs no query at all. For everybody else the switches are read first
 * and the whitelist only when something is actually on: with every switch off
 * the answer cannot depend on it.
 */
export async function freezeFor(viewer: {
  role: string | undefined;
  staffId?: string | null;
}): Promise<Freeze> {
  if (viewer.role === 'ADMIN')
    return effectiveFreeze(NOTHING_FROZEN, { role: 'ADMIN', exempt: false });
  const settings = await loadFreezeSettings();
  const anyOn =
    settings.allFrozen ||
    settings.kharakterystykaFrozen ||
    settings.linkedRatingFrozen ||
    settings.profileFrozen;
  const exempt = anyOn ? await isFreezeExempt(viewer.staffId) : false;
  return effectiveFreeze(settings, { role: viewer.role, exempt });
}
