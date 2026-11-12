'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { logError } from '@/lib/log';
import { requireAdmin } from '@/lib/permissions';
import { activeYear } from '@/lib/queries/get-active-template';
import {
  getKharakterystyka,
  getKharakterystykaWithoutEntries,
} from '@/lib/queries/get-kharakterystyka';
import { windowFor } from '@/lib/kharakterystyka/positions';
import {
  CHECKED_POSITIONS,
  DUPLICATE_OF_RATING,
  HIDE_REASONS,
  YEAR_OUT_OF_WINDOW,
  yearProblem,
} from '@/lib/kharakterystyka/year-check';
import { findRatingDuplicates } from '@/lib/queries/list-kharakterystyka-duplicates';
import { fullStaffName } from '@/lib/staff-name';
import { yearCheckHideSchema, yearCheckIdsSchema } from '@/validations/kharakterystyka-check';

/**
 * `/admin/kharakterystyka-check` (owner, 2026-11-12) — hides the lines whose
 * bibliographic description names a publication from before the five-year
 * window, or that are a typed copy of an entry in the person's rating, and
 * brings them back.
 *
 * **Hidden, never deleted.** The line keeps its text, who hid it and when, so
 * the answer to «why is my article gone» is on the page; and it can come back
 * if the guess was wrong. It rides on the same `removedAt` the document already
 * hides imported lines by, so the page and the Excel need no change — and
 * `removedReason` is what makes THIS removal the one kind that can be undone.
 *
 * ADMIN only, and the freeze does not apply (it never does to ADMIN). The
 * server re-judges every id: the browser says which rows were ticked, never
 * whether they are wrong.
 */

export type YearCheckState = { error: string } | { success: true; count: number };

export interface YearCheckPreviewPerson {
  staffId: string;
  name: string;
  lines: number;
  metBefore: number;
  metAfter: number;
  total: number;
  qualifiesBefore: boolean;
  qualifiesAfter: boolean;
  /** «п.1 Публікації…» — positions that stop being met */
  lostPositions: number[];
}

export type YearCheckPreview = { error: string } | { people: YearCheckPreviewPerson[] };

const SELECT = {
  id: true,
  staffId: true,
  position: true,
  year: true,
  text: true,
  source: true,
  removedAt: true,
  removedReason: true,
  staff: { select: { lastName: true, firstName: true, patronymic: true } },
} as const;

function revalidate(staffIds: readonly string[]) {
  revalidatePath('/admin/kharakterystyka-check');
  for (const id of staffIds) revalidatePath(`/staff/${id}/kharakterystyka`);
  revalidatePath('/profile/kharakterystyka');
  // Кнпп of a кафедра is counted from the documents
  revalidatePath('/my-department');
  revalidatePath('/stakes');
}

type Kind = 'year' | 'duplicate';

/**
 * The lines that are still wrong today and still in the document — what may be
 * hidden. «Wrong» is the kind asked for: a publication from before the window,
 * or a TYPED line that copies an entry of the same person's rating.
 */
async function hideableLines(ids: readonly string[], lastYear: number, kind: Kind) {
  const rows = await db.kharakterystykaEntry.findMany({
    where: { id: { in: [...ids] } },
    select: SELECT,
  });
  const window = windowFor(lastYear);
  const inDocument = rows.filter(
    (r) =>
      (CHECKED_POSITIONS as readonly number[]).includes(r.position) &&
      r.removedAt === null &&
      r.year >= window.from &&
      r.year <= window.to
  );
  if (kind === 'year') return inDocument.filter((r) => yearProblem(r.text, window) !== null);

  const typed = inDocument.filter((r) => r.source === 'MANUAL');
  const twins = await findRatingDuplicates(typed, lastYear);
  return typed.filter((r) => twins.has(r.id));
}

/**
 * What hiding these lines would do to each person's document — «N з 20» before
 * and after, and any position that stops being met. The dialog shows it before
 * the button, from the same builder the document uses.
 */
export async function previewYearCheckHide(payload: unknown): Promise<YearCheckPreview> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };
  const parsed = yearCheckHideSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Невірні дані' };

  const lastYear = await activeYear();
  if (lastYear === null) return { error: 'Рейтинговий рік ще не налаштовано' };

  const lines = await hideableLines(parsed.data.ids, lastYear, parsed.data.kind);
  const byPerson = new Map<string, typeof lines>();
  for (const l of lines) byPerson.set(l.staffId, [...(byPerson.get(l.staffId) ?? []), l]);

  const people: YearCheckPreviewPerson[] = [];
  for (const [staffId, own] of byPerson) {
    const [before, after] = await Promise.all([
      getKharakterystyka(staffId, lastYear),
      getKharakterystykaWithoutEntries(
        staffId,
        lastYear,
        own.map((l) => l.id)
      ),
    ]);
    if (!before || !after) continue;
    const lost = before.positions
      .filter((p) => p.met && !after.positions.find((q) => q.number === p.number)?.met)
      .map((p) => p.number);
    people.push({
      staffId,
      name: fullStaffName(own[0].staff),
      lines: own.length,
      metBefore: before.metCount,
      metAfter: after.metCount,
      total: after.positions.length,
      qualifiesBefore: before.qualifies,
      qualifiesAfter: after.qualifies,
      lostPositions: lost,
    });
  }
  people.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  return { people };
}

/** Hides the ticked lines that are still wrong today. */
export async function hideYearCheckEntries(payload: unknown): Promise<YearCheckState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };
  const parsed = yearCheckHideSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Невірні дані' };

  const lastYear = await activeYear();
  if (lastYear === null) return { error: 'Рейтинговий рік ще не налаштовано' };

  const reason = parsed.data.kind === 'year' ? YEAR_OUT_OF_WINDOW : DUPLICATE_OF_RATING;
  const why =
    parsed.data.kind === 'year' ? 'рік публікації поза вікном' : 'дублікат запису з рейтингу';
  const lines = await hideableLines(parsed.data.ids, lastYear, parsed.data.kind);
  if (lines.length === 0) return { error: 'Немає записів, які можна приховати' };

  const now = new Date();
  try {
    await db.$transaction(async (tx) => {
      for (const line of lines) {
        await tx.kharakterystykaEntry.update({
          where: { id: line.id },
          data: { removedAt: now, removedBy: session.user.id, removedReason: reason },
        });
        await tx.auditLog.create({
          data: {
            action: 'UPDATE',
            entity: 'KharakterystykaEntry',
            entityId: line.id,
            label: `${fullStaffName(line.staff)} — п.${line.position} (приховано: ${why})`,
            userId: session.user.id,
            changes: diffChanges(
              { removedAt: null, removedReason: null },
              { removedAt: now, removedReason: reason }
            ),
          },
        });
      }
    });
  } catch (e) {
    logError('kharakterystykaCheck.hide', e, { userId: session.user.id });
    return { error: 'Не вдалося приховати записи. Нічого не змінено' };
  }

  revalidate([...new Set(lines.map((l) => l.staffId))]);
  return { success: true, count: lines.length };
}

/** Brings back lines this page hid — and only those. */
export async function restoreYearCheckEntries(payload: unknown): Promise<YearCheckState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };
  const parsed = yearCheckIdsSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Невірні дані' };

  const rows = await db.kharakterystykaEntry.findMany({
    where: { id: { in: parsed.data.ids }, removedReason: { in: [...HIDE_REASONS] } },
    select: SELECT,
  });
  const lines = rows.filter((r) => r.removedAt !== null);
  if (lines.length === 0) return { error: 'Немає записів, які можна повернути' };

  try {
    await db.$transaction(async (tx) => {
      for (const line of lines) {
        await tx.kharakterystykaEntry.update({
          where: { id: line.id },
          data: { removedAt: null, removedBy: null, removedReason: null },
        });
        await tx.auditLog.create({
          data: {
            action: 'UPDATE',
            entity: 'KharakterystykaEntry',
            entityId: line.id,
            label: `${fullStaffName(line.staff)} — п.${line.position} (повернено в характеристику)`,
            userId: session.user.id,
            changes: diffChanges(
              { removedAt: line.removedAt, removedReason: line.removedReason },
              { removedAt: null, removedReason: null }
            ),
          },
        });
      }
    });
  } catch (e) {
    logError('kharakterystykaCheck.restore', e, { userId: session.user.id });
    return { error: 'Не вдалося повернути записи. Нічого не змінено' };
  }

  revalidate([...new Set(lines.map((l) => l.staffId))]);
  return { success: true, count: lines.length };
}
