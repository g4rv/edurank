'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { reportAccessFor } from '@/lib/department-rating/access';
import { auditSnapshot } from '@/lib/department-rating/audit-snapshot';
import { reportTotal, valuesProblem } from '@/lib/department-rating/score';
import { listDepartmentIndicators, readValues } from '@/lib/queries/get-department-report';
import { closedYearProblem } from '@/lib/stake/writable-year';
import { departmentReportSchema, readNarrative } from '@/validations/department-report';
import type { Prisma } from '@/lib/generated/prisma/client';

export type DepartmentReportState =
  | { error: string }
  | { success: true; totalScore: number }
  | null;

/**
 * Saves one кафедра's Рейтинг кафедри for the active year — the whole report at
 * once, scored here from the year's own lines; the form's live total is a hint.
 *
 * The завідувач of that кафедра, or ADMIN. A декан reads it and is refused here
 * (`reportAccessFor`). The year is compared against the active one, never
 * substituted, and a CLOSED year is read-only like the personal rating's —
 * `closeYear` leaves the template active, so the status is checked as well.
 */
export async function saveDepartmentReport(payload: unknown): Promise<DepartmentReportState> {
  const session = await auth();
  if (!session) redirect('/login');

  const parsed = departmentReportSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Невірні дані форми' };
  const { departmentId, year, values, narrative } = parsed.data;

  const access = await reportAccessFor(session.user, departmentId);
  if (!access.canEdit)
    return { error: 'Звіт кафедри заповнює завідувач або заступник з наукової роботи' };

  const closed = await closedYearProblem(year);
  if (closed) return { error: closed };
  const template = await db.ratingTemplate.findFirst({
    where: { isActive: true },
    select: { status: true },
  });
  if (template?.status === 'CLOSED') {
    return { error: 'Рейтинговий рік закрито. Звіт не редагується' };
  }

  const [department, indicators, previous] = await Promise.all([
    db.department.findUnique({ where: { id: departmentId }, select: { id: true, name: true } }),
    listDepartmentIndicators(year),
    db.departmentReport.findUnique({
      where: { departmentId_year: { departmentId, year } },
      select: { values: true, narrative: true, totalScore: true },
    }),
  ]);
  if (!department) return { error: 'Кафедру не знайдено' };

  const problem = valuesProblem(indicators, values);
  if (problem) return { error: problem };

  const totalScore = reportTotal(indicators, values);
  const data = {
    values: values as Prisma.InputJsonValue,
    narrative: narrative as Prisma.InputJsonValue,
    totalScore,
    updatedById: session.user.staffId ?? null,
  };

  try {
    await db.$transaction(async (tx) => {
      const report = await tx.departmentReport.upsert({
        where: { departmentId_year: { departmentId, year } },
        create: { departmentId, year, ...data },
        update: data,
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          action: previous ? 'UPDATE' : 'CREATE',
          entity: 'DepartmentReport',
          entityId: report.id,
          label: `${department.name} — рейтинг кафедри ${year}`,
          userId: session.user.id,
          changes: diffChanges(
            previous
              ? auditSnapshot(
                  indicators,
                  readValues(previous.values),
                  readNarrative(previous.narrative),
                  previous.totalScore
                )
              : {},
            auditSnapshot(indicators, values, narrative, totalScore)
          ),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти звіт кафедри. Зміни не застосовано',
        'departmentRating.saveDepartmentReport',
        { userId: session.user.id }
      ),
    };
  }

  revalidatePath('/department-rating');
  revalidatePath(`/department-rating/${departmentId}`);
  return { success: true, totalScore };
}
