'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { requireAdmin } from '@/lib/permissions';
import { isAcademicYear, nextAcademicYear, stakeYearOf } from '@/lib/science/academic-year';

export type ScienceYearState = { error: string } | { ok: true; message?: string };

function revalidateSciencePlan() {
  revalidatePath('/admin/science-plan');
  revalidatePath('/science-plan');
  revalidatePath('/science-plans');
}

// ─── Create ──────────────────────────────────────────────────────────────────

interface CreateScienceYearInput {
  academicYear: string;
  orderRef: string | null;
  minHoursPerRate: number;
}

// A blank planning year — the escape hatch when there is nothing to clone
// (the very first year the app ever plans), mirroring rating's createTemplate.
export async function createScienceYear(input: CreateScienceYearInput): Promise<ScienceYearState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  if (!isAcademicYear(input.academicYear)) {
    return { error: `Не навчальний рік: «${input.academicYear}». Формат — «2027/2028»` };
  }
  if (!Number.isInteger(input.minHoursPerRate) || input.minHoursPerRate <= 0) {
    return { error: 'Некоректна кількість годин на ставку' };
  }

  const existing = await db.sciencePlanTemplate.findUnique({
    where: { academicYear: input.academicYear },
  });
  if (existing) return { error: `Рік ${input.academicYear} вже існує` };

  const orderRef = input.orderRef?.trim() || null;

  try {
    await db.$transaction(async (tx) => {
      const template = await tx.sciencePlanTemplate.create({
        data: {
          academicYear: input.academicYear,
          orderRef,
          minHoursPerRate: input.minHoursPerRate,
          // Derived from the навчальний рік's first half, never asked of the
          // caller — September 2027 is worked against the 2027 розподіл.
          stakeYear: stakeYearOf(input.academicYear),
          // Created CLOSED (rule 1): nothing becomes live because somebody
          // pressed «створити». Opening is a separate, deliberate act.
          status: 'CLOSED',
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'SciencePlanTemplate',
          entityId: template.id,
          label: `Планування ${input.academicYear}`,
          userId: session.user.id,
          changes: diffChanges(
            {},
            {
              academicYear: input.academicYear,
              orderRef,
              minHoursPerRate: input.minHoursPerRate,
            }
          ),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося створити рік. Зміни не застосовано',
        'science.createScienceYear',
        { userId: session.user.id }
      ),
    };
  }

  revalidateSciencePlan();
  return { ok: true, message: `Створено рік ${input.academicYear}` };
}

// ─── Clone ───────────────────────────────────────────────────────────────────

// Next навчальний рік's catalogue as a copy of an existing one — follows
// `cloneTemplate` in app/(dashboard)/admin/rating/actions.ts. The differences:
// there are no sections to remap, the new year's name comes from
// `nextAcademicYear`, and `stakeYear` is RECOMPUTED with `stakeYearOf` rather
// than copied — 2027/2028 must target the 2027 розподіл, not 2026's.
export async function cloneScienceYear(fromAcademicYear: string): Promise<ScienceYearState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const source = await db.sciencePlanTemplate.findUnique({
    where: { academicYear: fromAcademicYear },
    include: { workTypes: true },
  });
  if (!source) return { error: `Рік ${fromAcademicYear} не знайдено` };

  const toAcademicYear = nextAcademicYear(fromAcademicYear);
  const existing = await db.sciencePlanTemplate.findUnique({
    where: { academicYear: toAcademicYear },
  });
  if (existing) return { error: `Рік ${toAcademicYear} вже існує` };

  try {
    await db.$transaction(
      async (tx) => {
        const template = await tx.sciencePlanTemplate.create({
          data: {
            academicYear: toAcademicYear,
            orderRef: source.orderRef,
            minHoursPerRate: source.minHoursPerRate,
            stakeYear: stakeYearOf(toAcademicYear),
            status: 'CLOSED',
          },
        });

        // A cloned year copies each work type's JSON (rule 4) — so reshaping
        // 2027/2028 can never reach back and change 2026/2027.
        for (const wt of source.workTypes) {
          await tx.scienceWorkType.create({
            data: {
              templateId: template.id,
              order: wt.order,
              code: wt.code,
              itemNumber: wt.itemNumber,
              label: wt.label,
              evidenceFields: wt.evidenceFields as Prisma.InputJsonValue,
              scoring: wt.scoring as Prisma.InputJsonValue,
              coefficient: wt.coefficient,
              unitNote: wt.unitNote,
              reportingForm: wt.reportingForm,
              reuse: wt.reuse,
              sharing: wt.sharing,
              identityFields: wt.identityFields as Prisma.InputJsonValue,
              linkRule: wt.linkRule,
              fileRule: wt.fileRule,
              maxPerYear: wt.maxPerYear,
              isActive: wt.isActive,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            entity: 'SciencePlanTemplate',
            entityId: template.id,
            label: `Планування ${toAcademicYear} (клон ${fromAcademicYear})`,
            userId: session.user.id,
            changes: diffChanges({}, { academicYear: toAcademicYear }),
          },
        });
      },
      // A full Додаток III catalogue's worth of sequential creates, once a
      // year — thinner than it looks, same reasoning as rating's cloneTemplate.
      { timeout: 60_000 }
    );
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося створити копію року. Зміни не застосовано',
        'science.cloneScienceYear',
        { userId: session.user.id }
      ),
    };
  }

  revalidateSciencePlan();
  return { ok: true, message: `Створено рік ${toAcademicYear}` };
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

// Makes one year the OPEN one — the only year `getActiveScienceTemplate` and
// every planning page work against.
export async function openScienceYear(id: string): Promise<ScienceYearState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const template = await db.sciencePlanTemplate.findUnique({ where: { id } });
  if (!template) return { error: 'Рік не знайдено' };

  try {
    await db.$transaction(async (tx) => {
      // Exactly one OPEN template at a time (rule 2) — closing whatever else
      // is open happens in the SAME transaction as opening this one.
      await tx.sciencePlanTemplate.updateMany({
        where: { status: 'OPEN', id: { not: id } },
        data: { status: 'CLOSED' },
      });
      await tx.sciencePlanTemplate.update({ where: { id }, data: { status: 'OPEN' } });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'SciencePlanTemplate',
          entityId: id,
          label: template.academicYear,
          userId: session.user.id,
          changes: diffChanges({ status: template.status }, { status: 'OPEN' }),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося відкрити рік. Зміни не застосовано',
        'science.openScienceYear',
        { userId: session.user.id }
      ),
    };
  }

  revalidateSciencePlan();
  return { ok: true, message: `Рік ${template.academicYear} відкрито` };
}

// Freezes the year against further planning. No purge and no snapshot — a
// science plan is not scored history the way a closed rating year is, it is
// simply not editable any more once its наказ's window has passed.
export async function closeScienceYear(id: string): Promise<ScienceYearState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const template = await db.sciencePlanTemplate.findUnique({ where: { id } });
  if (!template) return { error: 'Рік не знайдено' };
  // No-op, not an error (rule 5) — nobody should get a red message for asking
  // for the state a thing is already in.
  if (template.status === 'CLOSED') return { ok: true };

  try {
    await db.$transaction(async (tx) => {
      await tx.sciencePlanTemplate.update({ where: { id }, data: { status: 'CLOSED' } });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'SciencePlanTemplate',
          entityId: id,
          label: template.academicYear,
          userId: session.user.id,
          changes: diffChanges({ status: 'OPEN' }, { status: 'CLOSED' }),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося закрити рік. Зміни не застосовано',
        'science.closeScienceYear',
        { userId: session.user.id }
      ),
    };
  }

  revalidateSciencePlan();
  return { ok: true, message: `Рік ${template.academicYear} закрито` };
}
