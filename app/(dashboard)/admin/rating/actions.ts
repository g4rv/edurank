'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { requireAdmin } from '@/lib/permissions';
import { ACTIVITY_TYPES_2026, RATING_DIVISIONS, SECTION_TITLES } from '@/lib/rating/activity-types';
import { dbSpecs } from '@/lib/rating/db-specs';
import { ACTIVITY_STATUS_LABELS } from '@/lib/rating/labels';
import { summarizeEvidence, activityTypeMeta } from '@/lib/rating/registry';
import { recomputeRatingEntries } from '@/lib/rating/recompute';
import {
  updateActivityTypeSchema,
  type UpdateActivityTypeSchema,
} from '@/validations/rating-admin';
import { backfillProfileDerived } from '@/lib/rating/profile-derived';

export type RatingAdminState = { error: string } | { success: true; message?: string };

function revalidateRating() {
  revalidatePath('/admin/rating');
  revalidatePath('/rating');
  revalidatePath('/achievements');
  revalidatePath('/division-data');
}

// ─── Templates ───────────────────────────────────────────────────────────────

// Next year's template as a copy of an existing one (sections + all types)
export async function cloneTemplate(fromYear: number): Promise<RatingAdminState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const source = await db.ratingTemplate.findUnique({
    where: { year: fromYear },
    include: {
      sections: { orderBy: { number: 'asc' } },
      activityTypes: true,
    },
  });
  if (!source) return { error: 'Шаблон не знайдено' };

  const toYear = fromYear + 1;
  const existing = await db.ratingTemplate.findUnique({ where: { year: toYear } });
  if (existing) return { error: `Рік ${toYear} вже існує` };

  try {
    await db.$transaction(async (tx) => {
      const template = await tx.ratingTemplate.create({
        data: { year: toYear, name: `Рейтинг НПП ${toYear}`, isActive: false },
      });

      const sectionIdMap = new Map<string, string>();
      for (const section of source.sections) {
        const created = await tx.ratingSection.create({
          data: { templateId: template.id, number: section.number, title: section.title },
        });
        sectionIdMap.set(section.id, created.id);
      }

      for (const type of source.activityTypes) {
        await tx.activityType.create({
          data: {
            templateId: template.id,
            sectionId: sectionIdMap.get(type.sectionId)!,
            order: type.order,
            code: type.code,
            label: type.label,
            itemNumber: type.itemNumber,
            maxPerYear: type.maxPerYear,
            evidenceFields: type.evidenceFields as Prisma.InputJsonValue,
            scoring: type.scoring as Prisma.InputJsonValue,
            coefficient: type.coefficient,
            coefficientNote: type.coefficientNote,
            inputSource: type.inputSource,
            verifyingDivisionId: type.verifyingDivisionId,
            isActive: type.isActive,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'RatingTemplate',
          entityId: template.id,
          label: `Рейтинг НПП ${toYear} (клон ${fromYear})`,
          userId: session.user.id,
          changes: diffChanges({}, { year: toYear, name: `Рейтинг НПП ${toYear}` }),
        },
      });
    });
  } catch (e) {
    return { error: parseDbError(e, 'Помилка при клонуванні') };
  }

  revalidateRating();
  return { success: true, message: `Створено рік ${toYear}` };
}

// Blank template (no indicators) — the escape hatch when there is nothing to clone
export async function createTemplate(year: number): Promise<RatingAdminState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return { error: 'Некоректний рік' };
  }
  const existing = await db.ratingTemplate.findUnique({ where: { year } });
  if (existing) return { error: `Рік ${year} вже існує` };

  try {
    await db.$transaction(async (tx) => {
      const template = await tx.ratingTemplate.create({
        data: { year, name: `Рейтинг НПП ${year}`, isActive: false },
      });
      for (const [number, title] of Object.entries(SECTION_TITLES)) {
        await tx.ratingSection.create({
          data: { templateId: template.id, number: Number(number), title },
        });
      }
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'RatingTemplate',
          entityId: template.id,
          label: `Рейтинг НПП ${year}`,
          userId: session.user.id,
          changes: diffChanges({}, { year, name: `Рейтинг НПП ${year}` }),
        },
      });
    });
  } catch (e) {
    return { error: parseDbError(e, 'Помилка при створенні') };
  }

  revalidateRating();
  return { success: true, message: `Створено рік ${year}` };
}

// Makes one year the active one (all forms and pages work with the active year)
export async function activateTemplate(year: number): Promise<RatingAdminState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const template = await db.ratingTemplate.findUnique({ where: { year } });
  if (!template) return { error: 'Шаблон не знайдено' };
  if (template.isActive) return { success: true };

  try {
    await db.$transaction(async (tx) => {
      await tx.ratingTemplate.updateMany({ where: { isActive: true }, data: { isActive: false } });
      await tx.ratingTemplate.update({ where: { id: template.id }, data: { isActive: true } });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'RatingTemplate',
          entityId: template.id,
          label: template.name,
          userId: session.user.id,
          changes: diffChanges({ isActive: false }, { isActive: true }),
        },
      });
    });
  } catch (e) {
    return { error: parseDbError(e, 'Помилка при активації') };
  }

  // The newly active year must reflect current profiles (стаж, звання, посада…)
  const synced = await backfillProfileDerived();

  revalidateRating();
  return {
    success: true,
    message:
      synced > 0 ? `Рік ${year} активовано. Заповнено: ${synced} НПП` : `Рік ${year} активовано`,
  };
}

// ─── Activity types ──────────────────────────────────────────────────────────

export async function updateActivityType(
  id: string,
  data: UpdateActivityTypeSchema
): Promise<RatingAdminState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = updateActivityTypeSchema.safeParse(data);
  if (!parsed.success) return { error: 'Некоректні дані' };

  const type = await db.activityType.findUnique({
    where: { id },
    select: {
      id: true,
      label: true,
      coefficient: true,
      coefficientNote: true,
      verifyingDivisionId: true,
      isActive: true,
      inputSource: true,
      template: { select: { status: true, year: true } },
    },
  });
  if (!type) return { error: 'Показник не знайдено' };
  if (type.template.status !== 'OPEN') return { error: 'Рейтинговий рік закрито' };

  if (type.inputSource === 'DIVISION_MANAGED' && !parsed.data.verifyingDivisionId) {
    return { error: 'Для показника відділу потрібно вказати відділ' };
  }
  if (parsed.data.verifyingDivisionId) {
    const division = await db.division.findUnique({
      where: { id: parsed.data.verifyingDivisionId },
    });
    if (!division) return { error: 'Відділ не знайдено' };
  }

  // Toggling «Показник активний» moves every rating that holds this indicator:
  // deactivated rows stay for history but stop scoring (see COUNTED in recompute.ts).
  const activeChanged = parsed.data.isActive !== type.isActive;
  let affected = 0;

  try {
    await db.$transaction(
      async (tx) => {
        await tx.activityType.update({ where: { id }, data: parsed.data });
        await tx.auditLog.create({
          data: {
            action: 'UPDATE',
            entity: 'ActivityType',
            entityId: id,
            label: type.label,
            userId: session.user.id,
            changes: diffChanges(
              {
                label: type.label,
                coefficient: type.coefficient,
                coefficientNote: type.coefficientNote,
                verifyingDivisionId: type.verifyingDivisionId,
                isActive: type.isActive,
              },
              parsed.data as Record<string, string | number | boolean | null>
            ),
          },
        });

        if (activeChanged) {
          const holders = await tx.activity.findMany({
            where: { activityTypeId: id, year: type.template.year },
            select: { staffId: true },
            distinct: ['staffId'],
          });
          affected = holders.length;
          await recomputeRatingEntries(
            tx,
            holders.map((h) => h.staffId),
            type.template.year
          );
        }
      },
      // A university-wide indicator can touch all ~300 НПП in one go
      { timeout: 60_000 }
    );
  } catch (e) {
    return { error: parseDbError(e, 'Помилка при збереженні') };
  }

  // Derived rows carry a frozen score — re-sync so a coefficient edit or a
  // re-activation refills them from the current profiles.
  if (type.inputSource === 'PROFILE_DERIVED') await backfillProfileDerived();

  revalidateRating();
  return {
    success: true,
    message: affected > 0 ? `Збережено. Оновлено рейтинг: ${affected} НПП` : 'Збережено',
  };
}

// Re-adds a catalogue indicator that is missing from this template. Only codes
// known to the registry are allowed — forms and scoring are keyed by code.
export async function addActivityType(templateId: string, code: string): Promise<RatingAdminState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const def = ACTIVITY_TYPES_2026.find((d) => d.code === code);
  if (!def) return { error: 'Невідомий показник' };

  const template = await db.ratingTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      status: true,
      sections: { select: { id: true, number: true } },
      activityTypes: { where: { code }, select: { id: true } },
    },
  });
  if (!template) return { error: 'Шаблон не знайдено' };
  if (template.status !== 'OPEN') return { error: 'Рейтинговий рік закрито' };
  if (template.activityTypes.length > 0) return { error: 'Показник вже є в шаблоні' };

  const section = template.sections.find((s) => s.number === def.section);
  if (!section) return { error: 'Розділ не знайдено' };

  const division = def.verifyingDivision
    ? await db.division.findUnique({ where: { name: RATING_DIVISIONS[def.verifyingDivision] } })
    : null;

  const specs = dbSpecs(def);

  try {
    await db.$transaction(async (tx) => {
      const created = await tx.activityType.create({
        data: {
          templateId: template.id,
          sectionId: section.id,
          order: def.order,
          code: def.code,
          label: def.label,
          itemNumber: specs.itemNumber,
          maxPerYear: specs.maxPerYear,
          evidenceFields: specs.evidenceFields as unknown as Prisma.InputJsonValue,
          scoring: specs.scoring as unknown as Prisma.InputJsonValue,
          coefficient: def.coefficient,
          coefficientNote: def.coefficientNote ?? null,
          inputSource: def.inputSource,
          verifyingDivisionId: division?.id ?? null,
          isActive: true,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'ActivityType',
          entityId: created.id,
          label: def.label,
          userId: session.user.id,
          changes: diffChanges({}, { code: def.code, label: def.label }),
        },
      });
    });
  } catch (e) {
    return { error: parseDbError(e, 'Помилка при додаванні') };
  }

  if (def.inputSource === 'PROFILE_DERIVED') await backfillProfileDerived();

  revalidateRating();
  return { success: true, message: 'Показник додано' };
}

// ─── Year lifecycle ──────────────────────────────────────────────────────────

interface SnapshotItem {
  id: string;
  itemNumber: string;
  label: string;
  summary: string;
  score: number;
  status: 'APPROVED';
  statusLabel: string;
}

function itemNumberFor(code: string): string {
  try {
    return activityTypeMeta(code).def.itemNumber;
  } catch {
    return '';
  }
}

// Freezes the year: purges discarded rows (audit log keeps their trail),
// writes an as-of-close snapshot into every RatingEntry, then sets CLOSED —
// the single flag every submit/entry/moderation guard reads.
export async function closeYear(year: number): Promise<RatingAdminState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const template = await db.ratingTemplate.findUnique({
    where: { year },
    select: { id: true, name: true, status: true },
  });
  if (!template) return { error: 'Шаблон не знайдено' };
  if (template.status !== 'OPEN') return { error: 'Рік вже закрито' };

  try {
    await db.$transaction(async (tx) => {
      // 1. Purge discarded rows (decision 2026-07-07)
      await tx.activity.deleteMany({ where: { year, status: 'REMOVED' } });

      // 2. Snapshot per staff: approved items with labels/scores as of close.
      // Deactivated indicators score nothing, so they stay out of the snapshot too.
      const activities = await tx.activity.findMany({
        where: { year, status: 'APPROVED', activityType: { isActive: true } },
        select: {
          id: true,
          staffId: true,
          score: true,
          evidence: true,
          activityType: {
            select: { code: true, label: true, section: { select: { number: true, title: true } } },
          },
        },
      });

      const byStaff = new Map<string, typeof activities>();
      for (const a of activities) {
        const list = byStaff.get(a.staffId) ?? [];
        list.push(a);
        byStaff.set(a.staffId, list);
      }

      for (const [staffId, rows] of byStaff) {
        const sections = [1, 2, 3, 4, 5].map((number) => {
          const items: SnapshotItem[] = rows
            .filter((r) => r.activityType.section.number === number)
            .map((r) => ({
              id: r.id,
              itemNumber: itemNumberFor(r.activityType.code),
              label: r.activityType.label,
              summary: summarizeEvidence(r.activityType.code, r.evidence),
              score: r.score,
              status: 'APPROVED' as const,
              statusLabel: ACTIVITY_STATUS_LABELS.APPROVED,
            }));
          return {
            number,
            title: SECTION_TITLES[number] ?? '',
            subtotal: items.reduce((sum, i) => sum + i.score, 0),
            items,
          };
        });
        const total = sections.reduce((sum, s) => sum + s.subtotal, 0);

        const snapshot = { closedAt: new Date().toISOString(), total, sections };
        await tx.ratingEntry.updateMany({
          where: { staffId, year },
          data: { snapshot: snapshot as unknown as Prisma.InputJsonValue },
        });
      }

      // 3. Flip the authoritative flag
      await tx.ratingTemplate.update({
        where: { id: template.id },
        data: { status: 'CLOSED', closedAt: new Date(), closedByUserId: session.user.id },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'RatingTemplate',
          entityId: template.id,
          label: template.name,
          userId: session.user.id,
          changes: diffChanges({ status: 'OPEN' }, { status: 'CLOSED' }),
        },
      });
    });
  } catch (e) {
    return { error: parseDbError(e, 'Помилка при закритті року') };
  }

  revalidateRating();
  return { success: true, message: `Рік ${year} закрито` };
}

// Appeals path: reopen → correct the data → close again (snapshot is rebuilt)
export async function reopenYear(year: number): Promise<RatingAdminState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const template = await db.ratingTemplate.findUnique({
    where: { year },
    select: { id: true, name: true, status: true },
  });
  if (!template) return { error: 'Шаблон не знайдено' };
  if (template.status !== 'CLOSED') return { error: 'Рік не закрито' };

  try {
    await db.$transaction(async (tx) => {
      await tx.ratingTemplate.update({
        where: { id: template.id },
        data: { status: 'OPEN', closedAt: null, closedByUserId: null },
      });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'RatingTemplate',
          entityId: template.id,
          label: template.name,
          userId: session.user.id,
          changes: diffChanges({ status: 'CLOSED' }, { status: 'OPEN' }),
        },
      });
    });
  } catch (e) {
    return { error: parseDbError(e, 'Помилка при відкритті року') };
  }

  // Profiles may have changed while the year was closed — bring derived rows up to date
  const synced = await backfillProfileDerived();

  revalidateRating();
  return {
    success: true,
    message:
      synced > 0
        ? `Рік ${year} знову відкрито. Оновлено: ${synced} НПП`
        : `Рік ${year} знову відкрито`,
  };
}
