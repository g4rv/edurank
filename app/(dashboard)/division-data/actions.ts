'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { diffChanges } from '@/lib/audit';
import { isUniqueViolation, parseDbError } from '@/lib/db-error';
import { canActForDivision } from '@/lib/permissions';
import { logError } from '@/lib/log';
import { summarizeEvidence } from '@/lib/rating/evidence-fields';
import { parseTypeSpecs } from '@/validations/activity-type-spec';
import { computeScore } from '@/lib/rating/scoring';
import { recomputeRatingEntries, recomputeRatingEntry } from '@/lib/rating/recompute';

export type UpsertDivisionActivityState = { error: string } | { success: true; score: number };

// A division enters (or corrects) one of its managed values for one NPP in the
// active year. Several rows per (staff, indicator, year) are allowed — one
// person genuinely sits on two editorial boards or runs two НДР — so the row to
// change is named explicitly by `activityId`; without one this creates another.
//
// What is still refused is a row whose evidence repeats one already stored.
// That is the double-click and the resubmitted form, which is what actually
// happens now that the unique index is gone (see the 20260810 migration).
export async function upsertDivisionActivity(
  staffId: string,
  activityTypeId: string,
  evidence: unknown,
  activityId?: string
): Promise<UpsertDivisionActivityState> {
  const session = await auth();
  if (!session) redirect('/login');

  const type = await db.activityType.findUnique({
    where: { id: activityTypeId },
    select: {
      id: true,
      code: true,
      label: true,
      coefficient: true,
      inputSource: true,
      isActive: true,
      verifyingDivisionId: true,
      // «не більше N» is a COLUMN any admin can set from /admin/rating/[year],
      // in the same dialog as «Хто вносить». `createActivity` has always
      // enforced it; this path never read it, so a cap set on a
      // DIVISION_MANAGED indicator did nothing at all (2026-08-27).
      maxPerYear: true,
      evidenceFields: true,
      scoring: true,
      template: { select: { year: true, isActive: true, status: true } },
    },
  });
  if (
    !type ||
    !type.isActive ||
    type.inputSource !== 'DIVISION_MANAGED' ||
    !type.verifyingDivisionId
  ) {
    return { error: 'Цей показник не вноситься відділом' };
  }
  if (!type.template.isActive || type.template.status !== 'OPEN') {
    return { error: 'Рейтинговий рік закрито' };
  }

  if (!(await canActForDivision(session.user, type.verifyingDivisionId))) {
    return { error: 'Недостатньо прав' };
  }

  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { isNpp: true, archivedAt: true, lastName: true, firstName: true, patronymic: true },
  });
  if (!staff?.isNpp) return { error: 'Рейтинг ведеться лише для НПП' };
  // The grid does not offer archived people, so reaching one means a stale page
  if (staff.archivedAt) return { error: 'Запис архівовано' };

  let specs: ReturnType<typeof parseTypeSpecs>;
  try {
    specs = parseTypeSpecs(type);
  } catch (e) {
    // Malformed evidenceFields/scoring JSON on the indicator row — a defect,
    // not a user mistake, and «Невідомий показник» names neither which nor why.
    logError('divisionData.parseSpecs', e, { entityId: type.id, code: type.code });
    return { error: 'Невідомий показник' };
  }

  const parsed = specs.schema.safeParse(evidence);
  if (!parsed.success) return { error: 'Невірні дані форми' };

  const year = type.template.year;
  const { computedValue, score } = computeScore(
    {
      code: type.code,
      coefficient: type.coefficient,
      scoring: specs.scoring,
      evidenceFields: specs.fields,
    },
    parsed.data
  );
  const evidenceSummary = summarizeEvidence(specs.fields, parsed.data);
  const staffLabel = `${staff.lastName} ${staff.firstName} ${staff.patronymic}`;

  const save = () =>
    db.$transaction(async (tx) => {
      const live = await tx.activity.findMany({
        where: { staffId, activityTypeId: type.id, year, status: { not: 'REMOVED' } },
        select: { id: true, score: true, evidence: true },
      });

      // Named row wins; otherwise this is a new record for the same cell
      const existing = activityId ? live.find((a) => a.id === activityId) : undefined;
      if (activityId && !existing) return { gone: true as const };

      // Only a NEW row can cross the cap — editing one named by `activityId`
      // leaves the count where it was. Counted off `live`, which is already
      // read above and already excludes REMOVED rows, so this costs nothing.
      if (!existing && type.maxPerYear && live.length >= type.maxPerYear) {
        return { cap: type.maxPerYear };
      }

      // Compared on the summary rather than the raw JSON: key order and absent
      // vs empty-string differ between a form submit and a stored row, and two
      // entries that read identically to a person are the duplicate we mean.
      const clash = live.some(
        (a) =>
          a.id !== existing?.id && summarizeEvidence(specs.fields, a.evidence) === evidenceSummary
      );
      if (clash) return { duplicate: true as const };

      const data = {
        evidence: parsed.data as Prisma.InputJsonValue,
        computedValue,
        score,
        status: 'APPROVED' as const,
        submittedByRole: 'DIVISION' as const,
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
      };

      if (existing) {
        await tx.activity.update({ where: { id: existing.id }, data });
        await tx.auditLog.create({
          data: {
            action: 'UPDATE',
            entity: 'Activity',
            entityId: existing.id,
            label: `${staffLabel} — ${type.label}`,
            userId: session.user.id,
            changes: diffChanges(
              {
                score: existing.score,
                evidence: summarizeEvidence(specs.fields, existing.evidence),
              },
              { score, evidence: evidenceSummary }
            ),
          },
        });
      } else {
        const created = await tx.activity.create({
          data: { staffId, activityTypeId: type.id, year, ...data },
        });
        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            entity: 'Activity',
            entityId: created.id,
            label: `${staffLabel} — ${type.label}`,
            userId: session.user.id,
            changes: diffChanges(
              {},
              { year, score, status: 'APPROVED', evidence: evidenceSummary }
            ),
          },
        });
      }

      await recomputeRatingEntry(tx, staffId, year);
      return { ok: true as const };
    });

  // The retry-on-unique-violation that used to live here is gone with the index
  // it recovered from — there is no longer a constraint to lose a race against.
  let result;
  try {
    result = await save();
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти дані. Зміни не застосовано',
        'divisionData.upsertDivisionActivity',
        { userId: session.user.id }
      ),
    };
  }

  if ('duplicate' in result) return { error: 'Такий самий запис уже додано' };
  if ('gone' in result) return { error: 'Запис уже видалено. Оновіть сторінку' };
  // Same sentence `createActivity` gives an НПП who hits the cap, so one
  // indicator reads the same whoever is entering it.
  if ('cap' in result) return { error: `Не більше ${result.cap} записів цього показника на рік` };

  revalidatePath('/division-data');
  return { success: true, score };
}

export type ClearDivisionActivityState = { error: string } | { success: true };

// A division clears a value it entered by mistake (e.g. wrong staff row in the
// grid). Hard delete + audit: division entries need no discard trail — the
// division is the source of truth for them, unlike moderated NPP self-reports.
export async function clearDivisionActivity(
  activityId: string
): Promise<ClearDivisionActivityState> {
  const session = await auth();
  if (!session) redirect('/login');

  const activity = await db.activity.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      staffId: true,
      year: true,
      score: true,
      status: true,
      submittedByRole: true,
      activityType: {
        select: {
          label: true,
          verifyingDivisionId: true,
          template: { select: { status: true } },
        },
      },
    },
  });

  if (!activity) return { error: 'Запис не знайдено' };
  if (activity.submittedByRole !== 'DIVISION' || !activity.activityType.verifyingDivisionId) {
    return { error: 'Цей запис не вноситься відділом' };
  }
  if (activity.activityType.template.status !== 'OPEN') {
    return { error: 'Рейтинговий рік закрито' };
  }
  if (!(await canActForDivision(session.user, activity.activityType.verifyingDivisionId))) {
    return { error: 'Недостатньо прав' };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.activity.delete({ where: { id: activity.id } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'Activity',
          entityId: activity.id,
          label: activity.activityType.label,
          userId: session.user.id,
          changes: diffChanges({ score: activity.score, status: activity.status }, {}),
        },
      });
      await recomputeRatingEntry(tx, activity.staffId, activity.year);
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося видалити. Зміни не застосовано',
        'divisionData.clearDivisionActivity',
        {
          userId: session.user.id,
        }
      ),
    };
  }

  revalidatePath('/division-data');
  return { success: true };
}

export type BatchUpsertDivisionActivityState = { error: string } | { success: true; saved: number };

// Entity-first bulk entry: one object (project / council / program) fanned out
// to several NPP in a single transaction. Each row gets the same shared
// evidence plus its own role, and becomes a normal per-staff Activity —
// identical to what upsertDivisionActivity would create one at a time.
export async function batchUpsertDivisionActivity(
  activityTypeId: string,
  rows: { staffId: string; evidence: unknown }[]
): Promise<BatchUpsertDivisionActivityState> {
  const session = await auth();
  if (!session) redirect('/login');

  if (rows.length === 0) return { error: 'Додайте хоча б одного НПП' };
  if (rows.length > 100) return { error: 'Забагато записів за один раз' };

  const staffIds = rows.map((r) => r.staffId);
  if (new Set(staffIds).size !== staffIds.length) {
    return { error: 'Один НПП вказано декілька разів' };
  }

  const type = await db.activityType.findUnique({
    where: { id: activityTypeId },
    select: {
      id: true,
      code: true,
      label: true,
      coefficient: true,
      inputSource: true,
      isActive: true,
      verifyingDivisionId: true,
      evidenceFields: true,
      scoring: true,
      template: { select: { year: true, isActive: true, status: true } },
    },
  });
  if (
    !type ||
    !type.isActive ||
    type.inputSource !== 'DIVISION_MANAGED' ||
    !type.verifyingDivisionId
  ) {
    return { error: 'Цей показник не вноситься відділом' };
  }
  if (!type.template.isActive || type.template.status !== 'OPEN') {
    return { error: 'Рейтинговий рік закрито' };
  }

  if (!(await canActForDivision(session.user, type.verifyingDivisionId))) {
    return { error: 'Недостатньо прав' };
  }

  const staffList = await db.staff.findMany({
    where: { id: { in: staffIds } },
    select: {
      id: true,
      isNpp: true,
      archivedAt: true,
      lastName: true,
      firstName: true,
      patronymic: true,
    },
  });
  const staffById = new Map(staffList.map((s) => [s.id, s]));
  for (const id of staffIds) {
    const s = staffById.get(id);
    if (!s) return { error: 'НПП не знайдено' };
    if (!s.isNpp) {
      return { error: `${s.lastName} ${s.firstName} ${s.patronymic} — не НПП` };
    }
    if (s.archivedAt) {
      return { error: `${s.lastName} ${s.firstName} ${s.patronymic} — запис архівовано` };
    }
  }

  let specs: ReturnType<typeof parseTypeSpecs>;
  try {
    specs = parseTypeSpecs(type);
  } catch (e) {
    logError('divisionData.parseSpecsBatch', e, { entityId: type.id, code: type.code });
    return { error: 'Невідомий показник' };
  }
  const scorable = {
    code: type.code,
    coefficient: type.coefficient,
    scoring: specs.scoring,
    evidenceFields: specs.fields,
  };

  // Validate everything up front — the transaction is all-or-nothing
  const prepared: {
    staffId: string;
    staffLabel: string;
    evidence: Prisma.InputJsonValue;
    computedValue: number;
    score: number;
    summary: string;
  }[] = [];
  for (const row of rows) {
    const parsed = specs.schema.safeParse(row.evidence);
    if (!parsed.success) return { error: 'Невірні дані форми' };
    const { computedValue, score } = computeScore(scorable, parsed.data);
    const s = staffById.get(row.staffId)!;
    prepared.push({
      staffId: row.staffId,
      staffLabel: `${s.lastName} ${s.firstName} ${s.patronymic}`,
      evidence: parsed.data as Prisma.InputJsonValue,
      computedValue,
      score,
      summary: summarizeEvidence(specs.fields, parsed.data),
    });
  }

  const year = type.template.year;

  // Entity-first is the path where multiples arise: one журнал or one НДР is
  // entered once and fanned out, and a person may already hold a different one
  // under the same indicator. So a row is matched on its evidence, not on the
  // person — matching on the person would silently replace their other project.
  const saveAll = () =>
    db.$transaction(async (tx) => {
      for (const row of prepared) {
        const live = await tx.activity.findMany({
          where: {
            staffId: row.staffId,
            activityTypeId: type.id,
            year,
            status: { not: 'REMOVED' },
          },
          select: { id: true, score: true, evidence: true },
        });
        // Re-running the same batch corrects its own rows rather than doubling
        // them; a different project for the same person becomes a new row.
        const existing = live.find(
          (a) => summarizeEvidence(specs.fields, a.evidence) === row.summary
        );

        const data = {
          evidence: row.evidence,
          computedValue: row.computedValue,
          score: row.score,
          status: 'APPROVED' as const,
          submittedByRole: 'DIVISION' as const,
          approvedByUserId: session.user.id,
          approvedAt: new Date(),
        };

        if (existing) {
          await tx.activity.update({ where: { id: existing.id }, data });
          await tx.auditLog.create({
            data: {
              action: 'UPDATE',
              entity: 'Activity',
              entityId: existing.id,
              label: `${row.staffLabel} — ${type.label}`,
              userId: session.user.id,
              changes: diffChanges(
                {
                  score: existing.score,
                  evidence: summarizeEvidence(specs.fields, existing.evidence),
                },
                { score: row.score, evidence: row.summary }
              ),
            },
          });
        } else {
          const created = await tx.activity.create({
            data: { staffId: row.staffId, activityTypeId: type.id, year, ...data },
          });
          await tx.auditLog.create({
            data: {
              action: 'CREATE',
              entity: 'Activity',
              entityId: created.id,
              label: `${row.staffLabel} — ${type.label}`,
              userId: session.user.id,
              changes: diffChanges(
                {},
                { year, score: row.score, status: 'APPROVED', evidence: row.summary }
              ),
            },
          });
        }
      }

      // One rollup for the whole batch instead of one per person: the batched
      // helper reads every participant's activities in a single query, which is
      // where the time went — a 100-row save measured 590 ms per-row against
      // 257 ms batched.
      await recomputeRatingEntries(
        tx,
        prepared.map((row) => row.staffId),
        year
      );
    });

  try {
    await saveAll();
  } catch (e) {
    if (!isUniqueViolation(e)) {
      return {
        error: parseDbError(
          e,
          'Не вдалося зберегти дані. Зміни не застосовано',
          'divisionData.batchUpsertDivisionActivity',
          { userId: session.user.id }
        ),
      };
    }
    try {
      await saveAll();
    } catch (retryError) {
      return {
        error: parseDbError(
          retryError,
          'Не вдалося зберегти дані. Зміни не застосовано',
          'divisionData.batchUpsertDivisionActivity',
          { userId: session.user.id }
        ),
      };
    }
  }

  revalidatePath('/division-data');
  return { success: true, saved: prepared.length };
}
