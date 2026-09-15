'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { logError } from '@/lib/log';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { rateForPlan } from '@/lib/science/target';
import { computeScore, type ScoringSpec } from '@/lib/specs/scoring';
import { toHundredths } from '@/lib/stake/units';
import { schemaForFields } from '@/validations/activity-evidence';
import type { EvidenceField } from '@/lib/rating/evidence-fields';

// One teacher's row of наукова робота for the OPEN academic year — Stage 1's
// write side. Read `app/(dashboard)/achievements/actions.ts` first: this
// follows the same shape (cap check inside the transaction, parseDbError on
// write failure, diffChanges on every mutation).

export type SavePlanRowResult = { ok: true } | { error: string };
export type DeletePlanRowResult = { ok: true } | { error: string };

export interface SavePlanRowInput {
  departmentId: string;
  rowId?: string;
  workTypeId: string;
  details: unknown;
  note?: string;
}

/** Sentinel for the in-transaction «не більше N» cap check — same pattern as
 *  achievements/actions.ts's CapExceededError. */
class CapExceededError extends Error {
  constructor(public readonly cap: number) {
    super('cap exceeded');
  }
}

/** A row that arrived is not this caller's — deleted or reused id, or another
 *  plan's row. Turned into the same «not found» message either way. */
class RowNotFoundError extends Error {}

/**
 * Add, or edit, one row of a teacher's plan for the OPEN academic year.
 *
 * **Being an НПП is what grants this, never the USER role** — a проректор or a
 * division editor who also teaches plans a year like anybody else (the same
 * rule `createActivity` follows for self-reports).
 */
export async function savePlanRow(input: SavePlanRowInput): Promise<SavePlanRowResult> {
  const session = await auth();
  const userId = session?.user?.id;
  const staffId = session?.user?.staffId;
  if (!session || !userId || !staffId) return { error: 'Недостатньо прав' };

  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: {
      lastName: true,
      firstName: true,
      patronymic: true,
      isNpp: true,
      departmentId: true,
      partTimeDepartments: { select: { departmentId: true } },
    },
  });
  if (!staff?.isNpp) return { error: 'Планування наукової роботи доступне лише для НПП' };

  // Never trust the кафедра that arrived — it must be this person's primary
  // one, or an additional (сумісництво) one via StaffDepartment. A сумісник's
  // additional кафедра is legitimate; anything else is refused.
  const worksHere =
    staff.departmentId === input.departmentId ||
    staff.partTimeDepartments.some((d) => d.departmentId === input.departmentId);
  if (!worksHere) return { error: 'Ви не працюєте на цій кафедрі' };

  // The year is never taken from client input — resolved server-side. A
  // CLOSED or absent template refuses outright.
  const template = await getActiveScienceTemplate();
  if (!template || template.status !== 'OPEN') {
    return { error: 'Планування на цей рік закрито' };
  }

  // Loaded by id AND templateId AND isActive, so a type from another year, or
  // a deactivated one, cannot be planned.
  const type = await db.scienceWorkType.findFirst({
    where: { id: input.workTypeId, templateId: template.id, isActive: true },
  });
  if (!type) return { error: 'Цей вид роботи недоступний для планування' };

  // The same Zod generator the rating uses, built straight from the type's own
  // evidenceFields — reused, never hand-rolled.
  const fields = type.evidenceFields as unknown as EvidenceField[];
  const scoring = type.scoring as unknown as ScoringSpec;
  const parsed = schemaForFields(fields, scoring).safeParse(input.details);
  if (!parsed.success) return { error: 'Невірні дані форми' };

  // computeScore's `score` is whole HOURS here, not бали — the science plan
  // reuses the rating's scoring engine for a different unit. A malformed
  // catalogue row (not a user mistake) is logged, not shown as a form error.
  let score: number;
  try {
    ({ score } = computeScore(
      { code: type.code, coefficient: type.coefficient, scoring, evidenceFields: fields },
      parsed.data
    ));
  } catch (e) {
    logError('science.savePlanRow', e, { userId, entityId: type.id });
    return { error: 'Невідомий вид роботи' };
  }
  // INTEGER HUNDREDTHS OF AN HOUR, frozen at save — never the float
  // (lib/stake/units.ts is the rule this exists for).
  const plannedHundredths = toHundredths(score);
  const note = input.note?.trim() || null;
  const auditLabel = `${staff.lastName} ${staff.firstName} ${staff.patronymic} — ${type.label}`;

  try {
    await db.$transaction(async (tx) => {
      const existingPlan = await tx.sciencePlan.findUnique({
        where: {
          staffId_departmentId_templateId: {
            staffId,
            departmentId: input.departmentId,
            templateId: template.id,
          },
        },
      });

      // Refreshed from the кафедра's розподіл on EVERY save while the
      // template is OPEN, so a розподіл saved in November reaches a plan
      // typed in September without anybody touching it.
      const rateHundredths = await rateForPlan(tx, {
        staffId,
        departmentId: input.departmentId,
        stakeYear: template.stakeYear,
      });

      let planId: string;
      if (existingPlan) {
        planId = existingPlan.id;
        await tx.sciencePlan.update({ where: { id: existingPlan.id }, data: { rateHundredths } });
      } else {
        const created = await tx.sciencePlan.create({
          data: {
            staffId,
            departmentId: input.departmentId,
            templateId: template.id,
            rateHundredths,
          },
        });
        planId = created.id;
      }

      // maxPerYear counts existing rows of THIS type on THIS plan — excluding
      // the row itself when editing, so a save that does not add a new item
      // is never refused by its own presence.
      if (type.maxPerYear) {
        const existing = await tx.sciencePlanRow.count({
          where: {
            planId,
            workTypeId: type.id,
            ...(input.rowId ? { id: { not: input.rowId } } : {}),
          },
        });
        if (existing >= type.maxPerYear) throw new CapExceededError(type.maxPerYear);
      }

      if (input.rowId) {
        const existingRow = await tx.sciencePlanRow.findUnique({
          where: { id: input.rowId },
          select: {
            plannedHundredths: true,
            note: true,
            plan: { select: { id: true } },
            workType: { select: { label: true } },
          },
        });
        if (!existingRow || existingRow.plan.id !== planId) throw new RowNotFoundError();

        await tx.sciencePlanRow.update({
          where: { id: input.rowId },
          data: {
            workTypeId: type.id,
            details: parsed.data as Prisma.InputJsonValue,
            plannedHundredths,
            note,
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'UPDATE',
            entity: 'SciencePlanRow',
            entityId: input.rowId,
            label: auditLabel,
            userId,
            changes: diffChanges(
              {
                workType: existingRow.workType.label,
                plannedHundredths: existingRow.plannedHundredths,
                note: existingRow.note,
              },
              { workType: type.label, plannedHundredths, note }
            ),
          },
        });
      } else {
        // Next position on the plan, across every work type — the order the
        // page lists rows in, not the cap's own count.
        const order = await tx.sciencePlanRow.count({ where: { planId } });
        const createdRow = await tx.sciencePlanRow.create({
          data: {
            planId,
            workTypeId: type.id,
            order,
            details: parsed.data as Prisma.InputJsonValue,
            plannedHundredths,
            note,
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            entity: 'SciencePlanRow',
            entityId: createdRow.id,
            label: auditLabel,
            userId,
            changes: diffChanges({}, { workType: type.label, plannedHundredths, note }),
          },
        });
      }
    });
  } catch (e) {
    if (e instanceof CapExceededError) {
      return { error: `Не більше ${e.cap} позицій цього виду роботи на рік` };
    }
    if (e instanceof RowNotFoundError) return { error: 'Рядок плану не знайдено' };
    return {
      error: parseDbError(e, 'Не вдалося зберегти. Зміни не застосовано', 'science.savePlanRow', {
        userId,
      }),
    };
  }

  revalidatePath('/science-plan');
  return { ok: true };
}

/**
 * Remove one row from the caller's own plan. Ownership is the check — the row
 * must belong to a plan whose `staffId` is theirs — and the template must
 * still be OPEN, same as `savePlanRow`.
 */
export async function deletePlanRow(rowId: string): Promise<DeletePlanRowResult> {
  const session = await auth();
  const userId = session?.user?.id;
  const staffId = session?.user?.staffId;
  if (!session || !userId || !staffId) return { error: 'Недостатньо прав' };

  const template = await getActiveScienceTemplate();
  if (!template || template.status !== 'OPEN') {
    return { error: 'Планування на цей рік закрито' };
  }

  const row = await db.sciencePlanRow.findUnique({
    where: { id: rowId },
    select: {
      plannedHundredths: true,
      note: true,
      workType: { select: { label: true } },
      plan: { select: { id: true, staffId: true, templateId: true } },
    },
  });
  if (!row || row.plan.staffId !== staffId) return { error: 'Рядок плану не знайдено' };
  // Belt and braces: a row left over on a template that is no longer the OPEN
  // one is not this year's to delete.
  if (row.plan.templateId !== template.id) return { error: 'Рядок плану не знайдено' };

  try {
    await db.$transaction(async (tx) => {
      await tx.sciencePlanRow.delete({ where: { id: rowId } });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'SciencePlanRow',
          entityId: rowId,
          label: row.workType.label,
          userId,
          changes: diffChanges(
            {
              workType: row.workType.label,
              plannedHundredths: row.plannedHundredths,
              note: row.note,
            },
            {}
          ),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося видалити. Зміни не застосовано', 'science.deletePlanRow', {
        userId,
      }),
    };
  }

  revalidatePath('/science-plan');
  return { ok: true };
}
