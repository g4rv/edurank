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
import { summarizeEvidence, type EvidenceField } from '@/lib/rating/evidence-fields';
import { evidenceFieldsSpecSchema, scoringSpecSchema } from '@/validations/activity-type-spec';
import { recomputeRatingEntries } from '@/lib/rating/recompute';
import {
  createActivityTypeSchema,
  updateActivityTypeSchema,
  type CreateActivityTypeSchema,
  type UpdateActivityTypeSchema,
} from '@/validations/rating-admin';
import { backfillProfileDerived } from '@/lib/rating/profile-derived';

export type RatingAdminState = { error: string } | { success: true; message?: string };

/**
 * The profile backfill always runs after its transaction has committed, so a
 * failure here must never read as «the year was not activated» — it was. One
 * indicator with malformed spec JSON is enough for parseTypeSpecs to throw
 * inside it, and the admin would otherwise get an unhandled server error on an
 * action that had in fact succeeded.
 *
 * Callers append `warning` to their own message instead: the lifecycle change
 * stands, the derived indicators are simply not refilled yet, and re-running
 * the action once the broken indicator is fixed will refill them.
 */
async function syncDerivedOrWarn(): Promise<{ synced: number; warning: string | null }> {
  try {
    return { synced: await backfillProfileDerived(), warning: null };
  } catch (e) {
    console.error('backfillProfileDerived failed', e);
    return {
      synced: 0,
      warning: 'показники з профілю не оновлено — перевірте налаштування показників',
    };
  }
}

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
            requiresVerification: type.requiresVerification,
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
  const { synced, warning } = await syncDerivedOrWarn();

  revalidateRating();
  return {
    success: true,
    message: warning
      ? `Рік ${year} активовано, але ${warning}`
      : synced > 0
        ? `Рік ${year} активовано. Заповнено: ${synced} НПП`
        : `Рік ${year} активовано`,
  };
}

// ─── Activity types ──────────────────────────────────────────────────────────

/**
 * A one-line stand-in for the two JSON spec columns in the audit log. The full
 * form definition is too big to diff usefully, but «SELECT · 4 поля» changing
 * to «SELECT · 5 полів» tells a reader the form was edited and how.
 */
function specsFingerprint(row: { evidenceFields: unknown; scoring: unknown }): string {
  const fields = evidenceFieldsSpecSchema.safeParse(row.evidenceFields);
  const scoring = scoringSpecSchema.safeParse(row.scoring);
  if (!fields.success || !scoring.success) return 'некоректні специфікації';
  const pageBased = scoring.data.pageBased ? ' · друковані аркуші' : '';
  return `${scoring.data.kind}${pageBased} · полів: ${fields.data.length}`;
}

export async function updateActivityType(
  id: string,
  data: UpdateActivityTypeSchema
): Promise<RatingAdminState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = updateActivityTypeSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Некоректні дані' };
  }

  const type = await db.activityType.findUnique({
    where: { id },
    select: {
      id: true,
      label: true,
      itemNumber: true,
      maxPerYear: true,
      coefficient: true,
      coefficientNote: true,
      evidenceFields: true,
      scoring: true,
      verifyingDivisionId: true,
      isActive: true,
      inputSource: true,
      section: { select: { number: true } },
      template: {
        select: {
          status: true,
          year: true,
          sections: { select: { id: true, number: true } },
        },
      },
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

  const { evidenceFields, scoring, maxPerYear, section: sectionNumber, ...plain } = parsed.data;

  // Moving between розділи is allowed — it is how a misfiled indicator gets
  // corrected. The section must belong to this same year.
  const section = type.template.sections.find((s) => s.number === sectionNumber);
  if (!section) return { error: 'Розділ не знайдено' };

  // Toggling «Показник активний» moves every rating that holds this indicator:
  // deactivated rows stay for history but stop scoring (see COUNTED in recompute.ts).
  const activeChanged = parsed.data.isActive !== type.isActive;
  let affected = 0;

  try {
    await db.$transaction(
      async (tx) => {
        await tx.activityType.update({
          where: { id },
          data: {
            ...plain,
            sectionId: section.id,
            maxPerYear: maxPerYear ?? null,
            evidenceFields: evidenceFields as unknown as Prisma.InputJsonValue,
            scoring: scoring as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.auditLog.create({
          data: {
            action: 'UPDATE',
            entity: 'ActivityType',
            entityId: id,
            label: type.label,
            userId: session.user.id,
            // The specs are JSON, which diffChanges does not take — they are
            // logged as «змінено» so the entry still shows the form was edited.
            changes: diffChanges(
              {
                label: type.label,
                itemNumber: type.itemNumber,
                section: type.section.number,
                maxPerYear: type.maxPerYear,
                coefficient: type.coefficient,
                coefficientNote: type.coefficientNote,
                verifyingDivisionId: type.verifyingDivisionId,
                isActive: type.isActive,
                specs: specsFingerprint(type),
              },
              {
                ...plain,
                section: sectionNumber,
                maxPerYear: maxPerYear ?? null,
                specs: specsFingerprint({ evidenceFields, scoring }),
              }
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
  const derived =
    type.inputSource === 'PROFILE_DERIVED' ? await syncDerivedOrWarn() : { warning: null };

  revalidateRating();
  return {
    success: true,
    message: derived.warning
      ? `Збережено, але ${derived.warning}`
      : affected > 0
        ? `Збережено. Оновлено рейтинг: ${affected} НПП`
        : 'Збережено',
  };
}

// A brand-new indicator, defined entirely by the admin — its form fields and
// scoring rule come from the builder, not from the code catalogue. This is what
// makes a yearly rating change possible without a developer.
export async function createActivityType(
  templateId: string,
  data: CreateActivityTypeSchema
): Promise<RatingAdminState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = createActivityTypeSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Некоректні дані' };
  }
  const {
    code,
    section: sectionNumber,
    evidenceFields,
    scoring,
    maxPerYear,
    ...plain
  } = parsed.data;

  const template = await db.ratingTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      status: true,
      sections: { select: { id: true, number: true } },
      activityTypes: {
        select: { code: true, order: true, sectionId: true },
      },
    },
  });
  if (!template) return { error: 'Шаблон не знайдено' };
  if (template.status !== 'OPEN') return { error: 'Рейтинговий рік закрито' };
  if (template.activityTypes.some((t) => t.code === code)) {
    return { error: 'Показник з таким кодом вже є в цьому році' };
  }

  const section = template.sections.find((s) => s.number === sectionNumber);
  if (!section) return { error: 'Розділ не знайдено' };

  if (plain.inputSource === 'DIVISION_MANAGED' && !plain.verifyingDivisionId) {
    return { error: 'Для показника відділу потрібно вказати відділ' };
  }
  if (plain.verifyingDivisionId) {
    const division = await db.division.findUnique({ where: { id: plain.verifyingDivisionId } });
    if (!division) return { error: 'Відділ не знайдено' };
  }
  // Derived indicators read a Staff profile field, and that mapping lives in
  // code — an admin cannot invent one, only edit the ones that exist.
  if (plain.inputSource === 'PROFILE_DERIVED') {
    return { error: 'Показники з профілю не створюються вручну' };
  }

  // Append within the section; `order` only decides ties inside one section
  const lastOrder = Math.max(
    0,
    ...template.activityTypes.filter((t) => t.sectionId === section.id).map((t) => t.order)
  );

  try {
    await db.$transaction(async (tx) => {
      const created = await tx.activityType.create({
        data: {
          ...plain,
          templateId: template.id,
          sectionId: section.id,
          order: lastOrder + 1,
          code,
          maxPerYear: maxPerYear ?? null,
          evidenceFields: evidenceFields as unknown as Prisma.InputJsonValue,
          scoring: scoring as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'ActivityType',
          entityId: created.id,
          label: plain.label,
          userId: session.user.id,
          changes: diffChanges(
            {},
            {
              code,
              itemNumber: plain.itemNumber,
              label: plain.label,
              coefficient: plain.coefficient,
              specs: specsFingerprint({ evidenceFields, scoring }),
            }
          ),
        },
      });
    });
  } catch (e) {
    return { error: parseDbError(e, 'Помилка при створенні') };
  }

  revalidateRating();
  return { success: true, message: 'Показник створено' };
}

// Removes an indicator outright. Only possible while nothing has been submitted
// under it — once it holds data, «вимкнути» is the honest option: the rows stay
// for history and stop scoring.
export async function deleteActivityType(id: string): Promise<RatingAdminState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const type = await db.activityType.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      label: true,
      template: { select: { status: true } },
      _count: { select: { activities: true } },
    },
  });
  if (!type) return { error: 'Показник не знайдено' };
  if (type.template.status !== 'OPEN') return { error: 'Рейтинговий рік закрито' };
  if (type._count.activities > 0) {
    return {
      error: `За показником вже є записи (${type._count.activities}). Його можна лише вимкнути.`,
    };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.activityType.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'ActivityType',
          entityId: id,
          label: type.label,
          userId: session.user.id,
          changes: diffChanges({ code: type.code, label: type.label }, {}),
        },
      });
    });
  } catch (e) {
    return { error: parseDbError(e, 'Помилка при видаленні') };
  }

  revalidateRating();
  return { success: true, message: 'Показник видалено' };
}

// Re-adds a 2026 catalogue indicator missing from this template — the shortcut
// for «I deleted it by mistake», distinct from building one from scratch.
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
          requiresVerification: specs.requiresVerification,
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

  const derived =
    def.inputSource === 'PROFILE_DERIVED' ? await syncDerivedOrWarn() : { warning: null };

  revalidateRating();
  return {
    success: true,
    message: derived.warning ? `Показник додано, але ${derived.warning}` : 'Показник додано',
  };
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

/** Keep summed scores to 2 decimals — see the note in lib/rating/recompute.ts */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Field specs off the row's JSON; a malformed row degrades to an empty summary */
function fieldsOf(activityType: { evidenceFields: unknown }): readonly EvidenceField[] {
  const parsed = evidenceFieldsSpecSchema.safeParse(activityType.evidenceFields);
  return parsed.success ? parsed.data : [];
}

// Freezes the year: purges discarded rows (audit log keeps their trail),
// writes an as-of-close snapshot into every RatingEntry, then sets CLOSED —
// the single flag every submit/entry/moderation guard reads.
export async function closeYear(year: number): Promise<RatingAdminState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const template = await db.ratingTemplate.findUnique({
    where: { year },
    select: {
      id: true,
      name: true,
      status: true,
      // The snapshot is what a closed year renders from forever, so its headings
      // come from this year's own sections rather than the 2026 constants in
      // code. They agree today; a template whose sections were ever retitled
      // would otherwise be frozen under the wrong ones.
      sections: { select: { number: true, title: true } },
    },
  });
  if (!template) return { error: 'Шаблон не знайдено' };
  if (template.status !== 'OPEN') return { error: 'Рік вже закрито' };

  const titleByNumber = new Map(template.sections.map((s) => [s.number, s.title]));

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
            select: {
              code: true,
              label: true,
              itemNumber: true,
              evidenceFields: true,
              section: { select: { number: true, title: true } },
            },
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
              itemNumber: r.activityType.itemNumber,
              label: r.activityType.label,
              summary: summarizeEvidence(fieldsOf(r.activityType), r.evidence),
              score: r.score,
              status: 'APPROVED' as const,
              statusLabel: ACTIVITY_STATUS_LABELS.APPROVED,
            }));
          return {
            number,
            title: titleByNumber.get(number) ?? SECTION_TITLES[number] ?? '',
            // round2: summing 2-decimal scores with + reintroduces float dust
            // (0.1 + 0.2 = 0.30000000000000004); the snapshot is frozen, so keep it clean.
            subtotal: round2(items.reduce((sum, i) => sum + i.score, 0)),
            items,
          };
        });
        const total = round2(sections.reduce((sum, s) => sum + s.subtotal, 0));

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
  const { synced, warning } = await syncDerivedOrWarn();

  revalidateRating();
  return {
    success: true,
    message: warning
      ? `Рік ${year} знову відкрито, але ${warning}`
      : synced > 0
        ? `Рік ${year} знову відкрито. Оновлено: ${synced} НПП`
        : `Рік ${year} знову відкрито`,
  };
}
