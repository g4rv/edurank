'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { requireAdmin } from '@/lib/permissions';
import { scoringSpecSchema, specProblems } from '@/validations/activity-type-spec';
import {
  identityFieldProblem,
  saveWorkTypeSchema,
  type SaveWorkTypeInput,
} from '@/validations/science-work-type';

// The ADMIN editor for one навчальний рік's Додаток III catalogue — the 26
// kinds of scientific work and what each is worth in hours. Follows the shape
// of `app/(dashboard)/admin/science-plan/actions.ts` (Task 12, the year list)
// and mirrors `app/(dashboard)/admin/rating/actions.ts`'s createActivityType /
// updateActivityType, which do the same job for the rating's indicators.

export type ScienceWorkTypeState = { error: string } | { ok: true };

function revalidateWorkTypes() {
  revalidatePath('/admin/science-plan');
  revalidatePath('/science-plan');
  revalidatePath('/science-plans');
}

/**
 * A short, honest description of a spec pair for the audit log. NOT
 * `evidenceFieldsSpecSchema` from `validations/activity-type-spec` — that
 * schema is `z.strictObject` per field kind and refuses the extra keys this
 * screen's builder is free to carry, which would print «некоректні
 * специфікації» for a perfectly good row. Only the scoring kind needs to
 * parse strictly; it has no such extra keys.
 */
function specsFingerprint(evidenceFields: unknown, scoring: unknown): string {
  const parsedScoring = scoringSpecSchema.safeParse(scoring);
  const kind = parsedScoring.success ? parsedScoring.data.kind : 'невідомо';
  const count = Array.isArray(evidenceFields) ? evidenceFields.length : 0;
  return `${kind} · полів: ${count}`;
}

/**
 * Creates or updates one Додаток III row. The four checks run in a fixed
 * order, each one cheaper than the next, so a broken form fails before it
 * ever reaches the database:
 *
 *   1. shape (Zod)
 *   2. the scoring↔fields CONTRACT (`specProblems`, rule 1's belt — the
 *      builder itself is what stops a field being misnamed in the first
 *      place, by never offering a control to rename `option` / `credits` /
 *      `value`)
 *   3. `identityFields` naming fields that actually exist (rule 2)
 *   4. `code` not colliding with another row of the SAME template (rule 5)
 *
 * Changing `reuse` or `sharing` on a row that already has planned rows is
 * ALLOWED (rule 3) — the наказ changes, and nothing here refuses that. It is
 * simply one more field in the audit diff like any other.
 */
export async function saveWorkType(input: SaveWorkTypeInput): Promise<ScienceWorkTypeState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = saveWorkTypeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Некоректні дані' };
  }
  const data = parsed.data;

  const problems = specProblems(data.evidenceFields as never, data.scoring);
  if (problems.length > 0) return { error: problems[0] };

  const identityProblem = identityFieldProblem(data.identityFields, data.evidenceFields as never);
  if (identityProblem) return { error: identityProblem };

  const dupe = await db.scienceWorkType.findFirst({
    where: {
      templateId: data.templateId,
      code: data.code,
      ...(data.id ? { NOT: { id: data.id } } : {}),
    },
  });
  if (dupe) return { error: `Код «${data.code}» вже використовується в цьому році` };

  const evidenceFields = data.evidenceFields as unknown as Prisma.InputJsonValue;
  const scoring = data.scoring as unknown as Prisma.InputJsonValue;
  const identityFields = data.identityFields as unknown as Prisma.InputJsonValue;
  // The preprocessor maps an empty input to `undefined`; the column is `null`.
  const maxPerYear = data.maxPerYear ?? null;

  try {
    if (data.id) {
      // A fresh binding, not `data.id` re-read: TypeScript does not carry the
      // `if` narrowing of an object PROPERTY across the closure below.
      const workTypeId = data.id;
      const existing = await db.scienceWorkType.findUnique({ where: { id: workTypeId } });
      if (!existing) return { error: 'Вид роботи не знайдено' };

      // Informational only (rule 3) — the change is allowed either way, this
      // just lets the admin see it is not touching an empty row by accident.
      const rowCount = await db.sciencePlanRow.count({ where: { workTypeId } });

      await db.$transaction(async (tx) => {
        await tx.scienceWorkType.update({
          where: { id: workTypeId },
          data: {
            code: data.code,
            itemNumber: data.itemNumber,
            itemTitle: data.itemTitle,
            shortLabel: data.shortLabel,
            label: data.label,
            coefficient: data.coefficient,
            unitNote: data.unitNote,
            reportingForm: data.reportingForm,
            reuse: data.reuse,
            sharing: data.sharing,
            identityFields,
            requiresFile: data.requiresFile,
            maxPerYear,
            evidenceFields,
            scoring,
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'UPDATE',
            entity: 'ScienceWorkType',
            entityId: workTypeId,
            label: data.label,
            userId: session.user.id,
            changes: diffChanges(
              {
                code: existing.code,
                itemNumber: existing.itemNumber,
                itemTitle: existing.itemTitle,
                shortLabel: existing.shortLabel,
                label: existing.label,
                coefficient: existing.coefficient,
                unitNote: existing.unitNote,
                reportingForm: existing.reportingForm,
                reuse: existing.reuse,
                sharing: existing.sharing,
                identityFields: JSON.stringify(existing.identityFields ?? []),
                requiresFile: existing.requiresFile,
                maxPerYear: existing.maxPerYear,
                specs: specsFingerprint(existing.evidenceFields, existing.scoring),
                plannedRows: rowCount,
              },
              {
                code: data.code,
                itemNumber: data.itemNumber,
                itemTitle: data.itemTitle,
                shortLabel: data.shortLabel,
                label: data.label,
                coefficient: data.coefficient,
                unitNote: data.unitNote,
                reportingForm: data.reportingForm,
                reuse: data.reuse,
                sharing: data.sharing,
                identityFields: JSON.stringify(data.identityFields),
                requiresFile: data.requiresFile,
                maxPerYear,
                specs: specsFingerprint(data.evidenceFields, data.scoring),
                plannedRows: rowCount,
              }
            ),
          },
        });
      });
    } else {
      // Appended after whatever this template already has — `order` only
      // decides ties for display, same as the rating's activityTypes.order.
      const existingCount = await db.scienceWorkType.count({
        where: { templateId: data.templateId },
      });

      await db.$transaction(async (tx) => {
        const created = await tx.scienceWorkType.create({
          data: {
            templateId: data.templateId,
            order: existingCount + 1,
            code: data.code,
            itemNumber: data.itemNumber,
            label: data.label,
            coefficient: data.coefficient,
            unitNote: data.unitNote,
            reportingForm: data.reportingForm,
            reuse: data.reuse,
            sharing: data.sharing,
            identityFields,
            requiresFile: data.requiresFile,
            maxPerYear,
            evidenceFields,
            scoring,
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            entity: 'ScienceWorkType',
            entityId: created.id,
            label: data.label,
            userId: session.user.id,
            changes: diffChanges(
              {},
              {
                code: data.code,
                itemNumber: data.itemNumber,
                label: data.label,
                coefficient: data.coefficient,
                specs: specsFingerprint(data.evidenceFields, data.scoring),
              }
            ),
          },
        });
      });
    }
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося зберегти. Зміни не застосовано', 'science.saveWorkType', {
        userId: session.user.id,
      }),
    };
  }

  revalidateWorkTypes();
  return { ok: true };
}

/**
 * «Активний» / «Вимкнений» — the only thing this ever touches (rule 4).
 * Deactivating hides the row from the planning picker and NOTHING else:
 * `SciencePlanRow`s already planned against it stay exactly as they are,
 * which is what makes flipping this safe to do mid-year.
 */
export async function toggleWorkTypeActive(id: string): Promise<ScienceWorkTypeState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const existing = await db.scienceWorkType.findUnique({ where: { id } });
  if (!existing) return { error: 'Вид роботи не знайдено' };

  const nextActive = !existing.isActive;

  try {
    await db.$transaction(async (tx) => {
      await tx.scienceWorkType.update({ where: { id }, data: { isActive: nextActive } });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'ScienceWorkType',
          entityId: id,
          label: existing.label ?? existing.code ?? id,
          userId: session.user.id,
          changes: diffChanges({ isActive: existing.isActive }, { isActive: nextActive }),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося змінити стан. Зміни не застосовано',
        'science.toggleWorkTypeActive',
        { userId: session.user.id }
      ),
    };
  }

  revalidateWorkTypes();
  return { ok: true };
}

/**
 * Persists a new display order for one template's work types — the picker's
 * «Пункт N» grouping and the admin's own list both read `order`. Takes the
 * WHOLE list in its new order rather than one moved id and a delta, so the
 * client can reorder freely (drag, up/down) and settle on one write.
 */
export async function reorderWorkTypes(ids: readonly string[]): Promise<ScienceWorkTypeState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };
  if (ids.length === 0) return { ok: true };

  try {
    await db.$transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.scienceWorkType.update({ where: { id }, data: { order: index + 1 } });
      }
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося змінити порядок. Зміни не застосовано',
        'science.reorderWorkTypes',
        { userId: session.user.id }
      ),
    };
  }

  revalidateWorkTypes();
  return { ok: true };
}
