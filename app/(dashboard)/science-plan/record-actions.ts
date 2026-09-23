'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { diffChanges } from '@/lib/audit';
import { isUniqueViolation, parseDbError } from '@/lib/db-error';
import { logError } from '@/lib/log';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { rateForPlan } from '@/lib/science/target';
import { workKey } from '@/lib/science/work-key';
import { poolProblem, remainingHundredths } from '@/lib/science/pool';
import { evidenceProblem, FILE_NOT_ALLOWED, LINK_NOT_ALLOWED } from '@/lib/science/evidence-rule';
import { computeScore, type ScoringSpec } from '@/lib/specs/scoring';
import { toHundredths } from '@/lib/stake/units';
import { schemaForFields } from '@/validations/activity-evidence';
import { summarizeEvidence, type EvidenceField } from '@/lib/rating/evidence-fields';
import { formatHours } from '@/lib/science/hours';
import { dateToMonthKey, monthProblem, monthToDate } from '@/lib/science/execution-month';
import { initials } from '@/lib/name';
import {
  DUPLICATE_FILE_MESSAGE,
  isDuplicateFileViolation,
  safeDeleteObject,
  verifyUploadedObject,
  type VerifiedFile,
} from '@/lib/science/file-intake';

// The факт half of планування наукової роботи — Stage 2's write side. Read
// `docs/superpowers/specs/2026-09-15-science-plan-design.md` first: D14–D17
// (the pool and the join), D24 (the key's scope), D27 (link or file) and D28
// are what shape every branch below.
//
// It follows `savePlanRow` in ./actions.ts for its guards, its sentinels and
// its error handling; what is new here is that a save can end in a THIRD way —
// neither ok nor error, but a conflict the person is offered a way out of.

export interface SaveRecordInput {
  departmentId: string;
  workTypeId: string;
  /** The type's WHOLE evidenceFields set — a record is not a plan row (D23). */
  evidence: unknown;
  link?: string;
  planRowId?: string;
  /** Only meaningful for a SHARED type; an INDIVIDUAL one takes its whole pool. */
  hoursHundredths?: number;
  /**
   * An object the browser has ALREADY put in R2 (`presignUpload` → `PUT`).
   * Verified here from the stored bytes and attached inside the same
   * transaction that creates the work — which is what lets a record be proved
   * by a file alone (D27), and what stops a failed upload leaving a saved
   * record with nothing behind it.
   */
  file?: { objectKey: string; fileName: string };
  /** D41: `"YYYY-MM"`, the month the work was done. Checked against D42's
   *  window — the OPEN year's `maxLookbackMonths`, counted from today. */
  executedMonth: string;
}

/** D17 turned into something the screen can act on: who has the work, what it
 *  is, and how much of its pool is still free. */
export interface WorkConflict {
  workId: string;
  createdByName: string;
  summary: string;
  totalHundredths: number;
  remainingHundredths: number;
  /**
   * The навчальний рік the work was entered in, when that is NOT the open one.
   * `null` for a work of the current year, which is the only kind that can be
   * joined.
   *
   * **Why it has to travel to the screen.** A `SHARED` + `ONCE` key carries no
   * year, so the lookup finds an article recorded in ANY past рік. The dialog
   * used to offer «Приєднатися» for one of those, quoting a pool that belonged
   * to a closed рік, and `joinWork` then answered «Роботу не знайдено» — a
   * button that could not work and a sentence that read as if the work had
   * vanished (owner, 2026-09-20).
   */
  fromYear: string | null;
}

export type SaveRecordResult =
  | { ok: true; recordId: string; workId: string }
  | { error: string }
  | { conflict: WorkConflict };

/** Sentinels for checks that must happen INSIDE the transaction — the same
 *  pattern `savePlanRow` and `createActivity` use. */
class CapExceededError extends Error {
  constructor(public readonly cap: number) {
    super('cap exceeded');
  }
}
class PlanRowNotFoundError extends Error {}

/**
 * The four checks every write here repeats: a signed-in НПП, on a кафедра that
 * is really theirs, in the OPEN навчальний рік.
 *
 * Returns the resolved context or the sentence to show. Factored out when
 * `joinWork` became the second caller — §11's rule applied one level down from
 * components: two callers is what makes something shared.
 */
export type ActorContext = {
  userId: string;
  staffId: string;
  role: string;
  staff: { lastName: string; firstName: string; patronymic: string | null };
  template: NonNullable<Awaited<ReturnType<typeof getActiveScienceTemplate>>>;
};

export async function resolveActor(
  /** Omitted where there is no кафедра to check — a WORK belongs to a year, not
   *  to a кафедра, so correcting or withdrawing one names none. */
  departmentId?: string,
  options?: {
    /**
     * Let an ADMIN through who is not an НПП.
     *
     * **Why this is needed at all.** «Being an НПП is what grants this» is the
     * right rule for planning and recording ONE'S OWN наукова робота, and it
     * guards every such action here. It is the wrong rule for an
     * administrative CORRECTION — and `updateWorkEvidence` and `deleteFile`
     * both carry an `isAdmin` branch the spec asks for («ADMIN may edit
     * anything», «ADMIN deletes a genuinely wrong work») that this check made
     * unreachable: on the real database six of the eight ADMIN accounts are
     * `isNpp: false`, the rector's and `admin@uhsp.edu.ua` among them, so the
     * escape hatch existed in the code and for almost nobody in practice
     * (found 2026-09-20).
     *
     * `fileUrl` already sidesteps `resolveActor` for exactly this reason and
     * says so in its own comment. This is the same decision, made once.
     *
     * It grants NOTHING by itself — every caller still checks ownership, and
     * an ADMIN who is not an НПП has no plan, so the recording paths refuse
     * them anyway.
     */
    allowAdmin?: boolean;
  }
): Promise<{ ok: true; context: ActorContext } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  const staffId = session?.user?.staffId;
  if (!session || !userId || !staffId) return { ok: false, error: 'Недостатньо прав' };

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
  const isAdmin = session.user.role === 'ADMIN';
  if (!staff || (!staff.isNpp && !(options?.allowAdmin && isAdmin))) {
    return { ok: false, error: 'Облік наукової роботи доступний лише для НПП' };
  }

  // Never trust the кафедра that arrived — it must be this person's primary one
  // or an additional (сумісництво) one. A сумісник with no primary at all still
  // works on their additional кафедра (owner, 2026-08-26).
  if (departmentId !== undefined) {
    const worksHere =
      staff.departmentId === departmentId ||
      staff.partTimeDepartments.some((d) => d.departmentId === departmentId);
    if (!worksHere) return { ok: false, error: 'Ви не працюєте на цій кафедрі' };
  }

  // The year is never taken from client input — resolved server-side.
  const template = await getActiveScienceTemplate();
  if (!template || template.status !== 'OPEN') {
    return { ok: false, error: 'Планування на цей рік закрито' };
  }

  return { ok: true, context: { userId, staffId, role: session.user.role, staff, template } };
}

/** The plan is not submitted yet — recording cannot start (owner, 2026-09-17). */
class PlanNotLockedError extends Error {}

/**
 * A fact may be recorded once the plan is SUBMITTED — and against any вид
 * роботи, planned or not (owner, 2026-09-17).
 *
 * The plan states what somebody intends and, through that, **the hours they
 * must reach**. It does not restrict what they may do: an НПП who planned
 * аспіранти and publishes an article still did the article, and Додаток III
 * still prices it. So the only thing checked here is that a plan exists and is
 * final; what counts toward the 500 годин is the FACT's own hours.
 *
 * An earlier build refused a вид роботи absent from the plan. That was
 * retracted the same day: it made unforeseen work worth nothing, which is not
 * what the наказ pays for.
 *
 * Unlike a plan row's own save, this never CREATES a plan: somebody with no
 * plan has nothing to record against, and opening one for them silently would
 * be a plan nobody ever submitted.
 */
async function requireLockedPlan(
  tx: Prisma.TransactionClient,
  input: { staffId: string; departmentId: string; templateId: string }
): Promise<string> {
  const plan = await tx.sciencePlan.findUnique({
    where: {
      staffId_departmentId_templateId: {
        staffId: input.staffId,
        departmentId: input.departmentId,
        templateId: input.templateId,
      },
    },
    select: { id: true, lockedAt: true },
  });

  if (!plan || !plan.lockedAt) throw new PlanNotLockedError();
  return plan.id;
}

/**
 * Submit the plan — after this it is fixed (owner, 2026-09-17).
 *
 * **Not an approval.** D4 still holds: nobody signs a plan off, and this is the
 * НПП's own act. It is a submission, in the sense наказ п.33 means when it
 * sends individual plans to the навчальний відділ by 18 вересня.
 *
 * Why it exists at all: without it, план vs факт means nothing. Somebody can
 * plan nothing, publish one article in May, add the matching row in June, and
 * read as having planned perfectly. A locked plan is what makes September's
 * intention a document rather than a running commentary.
 *
 * **Refused while the кафедра has no розподіл.** On 2026-09-15, 306 of 328 НПП
 * had no ставка anywhere, so the page shows no target at all — and nobody
 * should be made to fix a plan against a number it cannot show them.
 */
export async function lockPlan(departmentId: string): Promise<{ ok: true } | { error: string }> {
  const actor = await resolveActor(departmentId);
  if (!actor.ok) return { error: actor.error };
  const { userId, staffId, staff, template } = actor.context;

  const plan = await db.sciencePlan.findUnique({
    where: {
      staffId_departmentId_templateId: { staffId, departmentId, templateId: template.id },
    },
    select: { id: true, lockedAt: true, rows: { select: { id: true } } },
  });
  if (!plan) return { error: 'Спочатку додайте хоча б одну роботу до плану' };
  if (plan.lockedAt) return { error: 'План уже збережено' };
  if (plan.rows.length === 0) return { error: 'Спочатку додайте хоча б одну роботу до плану' };

  // The LIVE ставка, not the snapshot on the plan: the розподіл may have landed
  // since this plan was opened, and that is the common case.
  const rateHundredths = await rateForPlan(db, {
    staffId,
    departmentId,
    stakeYear: template.stakeYear,
  });
  if (rateHundredths === null) {
    return { error: 'Ставку на цій кафедрі ще не визначено — план можна буде зберегти пізніше' };
  }

  try {
    await db.$transaction(async (tx) => {
      // Guarded on `lockedAt: null` so two tabs cannot both lock, and the
      // second one is told rather than silently overwriting the first time.
      const locked = await tx.sciencePlan.updateMany({
        where: { id: plan.id, lockedAt: null },
        data: { lockedAt: new Date(), rateHundredths },
      });
      if (locked.count === 0) throw new AlreadyLockedError();

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'SciencePlan',
          entityId: plan.id,
          label: `${staff.lastName} ${staff.firstName} ${staff.patronymic ?? ''}`.trim(),
          userId,
          changes: diffChanges({ lockedAt: null }, { lockedAt: new Date().toISOString() }),
        },
      });
    });
  } catch (e) {
    if (e instanceof AlreadyLockedError) return { error: 'План уже збережено' };
    return {
      error: parseDbError(e, 'Не вдалося зберегти план. Зміни не застосовано', 'science.lockPlan', {
        userId,
      }),
    };
  }

  revalidatePath('/science-plan');
  return { ok: true };
}

class AlreadyLockedError extends Error {}

/**
 * Record one work an НПП actually did, for the OPEN навчальний рік.
 *
 * **Being an НПП is what grants this, never the USER role** — a проректор or a
 * division editor who also teaches records their наукова робота like anybody
 * else, the same rule `createActivity` and `savePlanRow` follow.
 */
export async function saveRecord(input: SaveRecordInput): Promise<SaveRecordResult> {
  const actor = await resolveActor(input.departmentId);
  if (!actor.ok) return { error: actor.error };
  const { userId, staffId, staff, template } = actor.context;

  // By id AND templateId AND isActive, so a type from another year, or one an
  // ADMIN has deactivated, cannot be recorded against.
  const type = await db.scienceWorkType.findFirst({
    where: { id: input.workTypeId, templateId: template.id, isActive: true },
  });
  if (!type) return { error: 'Цей вид роботи недоступний' };

  const fields = type.evidenceFields as unknown as EvidenceField[];
  const scoring = type.scoring as unknown as ScoringSpec;

  // A RECORD parses the type's WHOLE field set, unlike a plan row, which takes
  // only what the scoring rule reads (D23). By now the work exists, so it has a
  // назва, a DOI and a page count to give.
  const parsed = schemaForFields(fields, scoring).safeParse(input.evidence);
  if (!parsed.success) return { error: 'Невірні дані форми' };

  const link = input.link?.trim() || null;

  // The file is already in R2 — verify it from the STORED bytes before the
  // evidence rule reads its count, so «файл без посилання» is a record that
  // can exist (D27) rather than one refused for having no link. Everything
  // after this point that fails must drop the object: `dropFile()`.
  let verifiedFile: VerifiedFile | null = null;
  if (input.file) {
    const verified = await verifyUploadedObject({
      objectKey: input.file.objectKey,
      fileName: input.file.fileName,
      scope: 'science.saveRecord',
      context: { userId },
    });
    if ('error' in verified) return { error: verified.error };
    verifiedFile = verified.file;
  }
  const dropFile = async () => {
    if (input.file) await safeDeleteObject('science.saveRecord', input.file.objectKey, { userId });
  };

  // D47: a proof on a side this вид роботи does not use is refused, not
  // silently kept — the form never offers it, so only a hand-made request
  // gets here, and a stored link or file nobody can see would be a surprise
  // to ННВ later.
  if (input.file && type.fileRule === 'NONE') {
    await dropFile();
    return { error: FILE_NOT_ALLOWED };
  }
  if (link && type.linkRule === 'NONE') {
    await dropFile();
    return { error: LINK_NOT_ALLOWED };
  }

  // D42: no older than the year's window allows, and never in the future.
  const monthFault = monthProblem({
    month: input.executedMonth,
    now: new Date(),
    lookbackMonths: template.maxLookbackMonths,
  });
  if (monthFault) {
    await dropFile();
    return { error: monthFault };
  }

  const evidenceFault = evidenceProblem({
    linkRule: type.linkRule,
    fileRule: type.fileRule,
    link,
    fileCount: verifiedFile ? 1 : 0,
  });
  if (evidenceFault) {
    await dropFile();
    return { error: evidenceFault };
  }

  const key = workKey({
    identityFields: Array.isArray(type.identityFields) ? (type.identityFields as string[]) : [],
    evidenceFields: fields,
    reuse: type.reuse,
    sharing: type.sharing,
    evidence: parsed.data,
    academicYear: template.academicYear,
    staffId,
  });
  if (!key) {
    await dropFile();
    return { error: 'Вкажіть назву або посилання, щоб роботу можна було розпізнати' };
  }

  // `score` is whole HOURS here, not бали — the science plan reuses the
  // rating's engine for a different unit. A malformed catalogue row is a
  // defect, not a user mistake, so it is logged rather than shown.
  let score: number;
  try {
    ({ score } = computeScore(
      { code: type.code, coefficient: type.coefficient, scoring, evidenceFields: fields },
      parsed.data
    ));
  } catch (e) {
    logError('science.saveRecord', e, { userId, entityId: type.id });
    await dropFile();
    return { error: 'Невідомий вид роботи' };
  }
  const totalHundredths = toHundredths(score);

  const conflict = await findConflict(key, staffId, fields, type.label, template);
  // Not this person's work to prove: the offer is to JOIN the existing one,
  // and its evidence belongs to whoever entered it. The object goes, or every
  // refused duplicate leaves one in the bucket.
  if (conflict) {
    await dropFile();
    return conflict;
  }

  // D16 — «first come, takes what they need». A SHARED work's creator may
  // leave hours for co-authors; an INDIVIDUAL one has no pool to divide, so
  // the control is never shown and a figure sent anyway is ignored.
  const requested =
    type.sharing === 'INDIVIDUAL' ? totalHundredths : (input.hoursHundredths ?? totalHundredths);
  const poolFault = poolProblem({ totalHundredths, drawnByOthers: 0, requested });
  if (poolFault) {
    await dropFile();
    return { error: poolFault };
  }

  const auditLabel =
    `${staff.lastName} ${staff.firstName} ${staff.patronymic ?? ''} — ${type.label}`.trim();

  try {
    const { recordId, workId } = await db.$transaction(async (tx) => {
      const planId = await requireLockedPlan(tx, {
        staffId,
        departmentId: input.departmentId,
        templateId: template.id,
      });

      if (input.planRowId) {
        const row = await tx.sciencePlanRow.findUnique({
          where: { id: input.planRowId },
          select: { planId: true, workTypeId: true },
        });
        // Somebody else's row, or a row of a different вид роботи — neither is
        // an intention this record can fulfil.
        if (!row || row.planId !== planId || row.workTypeId !== type.id) {
          throw new PlanRowNotFoundError();
        }
      }

      if (type.maxPerYear) {
        // APPROVED only: a declined record must not keep a slot somebody
        // cannot use.
        const count = await tx.scienceRecord.count({
          where: {
            staffId,
            templateId: template.id,
            status: 'APPROVED',
            work: { workTypeId: type.id },
          },
        });
        if (count >= type.maxPerYear) throw new CapExceededError(type.maxPerYear);
      }

      const work = await tx.scienceWork.create({
        data: {
          templateId: template.id,
          workTypeId: type.id,
          evidence: parsed.data as Prisma.InputJsonValue,
          computedValue: score,
          executedMonth: monthToDate(input.executedMonth),
          link,
          totalHundredths,
          createdById: staffId,
          dedupKey: key,
        },
        select: { id: true },
      });

      const record = await tx.scienceRecord.create({
        data: {
          staffId,
          workId: work.id,
          templateId: template.id,
          planId,
          planRowId: input.planRowId ?? null,
          hoursHundredths: requested,
        },
        select: { id: true },
      });

      // Same transaction as the work it proves: a record that was allowed to
      // exist BECAUSE of its file must never end up without it.
      if (verifiedFile) {
        await tx.scienceRecordFile.create({
          data: { ...verifiedFile, workId: work.id, uploadedById: staffId },
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'ScienceRecord',
          entityId: record.id,
          label: auditLabel,
          userId,
          changes: diffChanges(
            {},
            {
              workType: type.label,
              hoursHundredths: requested,
              totalHundredths,
              link,
              executedMonth: input.executedMonth,
              ...(verifiedFile ? { fileName: verifiedFile.fileName } : {}),
            }
          ),
        },
      });

      return { recordId: record.id, workId: work.id };
    });

    revalidatePath('/science-plan');
    return { ok: true, recordId, workId };
  } catch (e) {
    // The transaction rolled back, so nothing points at the object any more.
    await dropFile();

    if (e instanceof CapExceededError) {
      return { error: `Не більше ${e.cap} записів цього виду роботи на рік` };
    }
    if (e instanceof PlanRowNotFoundError) return { error: 'Рядок плану не знайдено' };
    if (e instanceof PlanNotLockedError) {
      return { error: 'Спочатку збережіть план — після цього можна вносити виконане' };
    }

    // The dedupKey race: the read above saw nothing and somebody else's insert
    // landed first. The unique index is what actually decides, so read the
    // winner and return D17's offer rather than an error nobody can act on.
    if (
      isUniqueViolation(e) &&
      String((e as { meta?: { target?: unknown } }).meta?.target).includes('dedupKey')
    ) {
      const raced = await findConflict(key, staffId, fields, type.label, template);
      if (raced) return raced;
    }

    // The sha256 race the pre-check only narrows: two uploads of the same
    // bytes, both verified, the index deciding between them.
    if (isUniqueViolation(e) && isDuplicateFileViolation(e)) {
      return { error: DUPLICATE_FILE_MESSAGE };
    }

    return {
      error: parseDbError(e, 'Не вдалося зберегти. Зміни не застосовано', 'science.saveRecord', {
        userId,
      }),
    };
  }
}

/** The pool refused the draw. Raised inside the transaction, because the sum it
 *  is measured against has to be read there. */
class PoolError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

/**
 * Take a share of a work somebody else already recorded — D17's refusal turned
 * into an offer.
 *
 * The person saw «цей запис уже додав Іваненко І. І. — залишилось 50 з 200
 * год», typed what they take, and pressed «Приєднатися». No approval, no
 * automatic equal split: first come, takes what they need (D16). The co-author
 * list the first author may fill in is a convenience, never a gate — nobody
 * depends on being remembered.
 *
 * The WORK is never touched here. Its evidence and its pool belong to whoever
 * entered it, and only they or ADMIN may correct it; two authors disagreeing
 * about a page count has no tiebreak otherwise (spec, «Correcting a work»).
 */
export async function joinWork(input: {
  workId: string;
  departmentId: string;
  hoursHundredths: number;
  planRowId?: string;
}): Promise<SaveRecordResult> {
  const actor = await resolveActor(input.departmentId);
  if (!actor.ok) return { error: actor.error };
  const { userId, staffId, staff, template } = actor.context;

  const work = await db.scienceWork.findUnique({
    where: { id: input.workId },
    select: {
      id: true,
      templateId: true,
      totalHundredths: true,
      template: { select: { academicYear: true } },
      workType: { select: { id: true, label: true, sharing: true, maxPerYear: true } },
    },
  });
  if (!work) return { error: 'Роботу не знайдено' };

  // **A work from another рік NAMES that рік.** This used to answer «Роботу не
  // знайдено», on the reasoning that such a work «is not on their screen
  // either way» — which stopped being true the moment the conflict panel
  // started showing it. A `SHARED` + `ONCE` key carries no year, so the search
  // finds an article from any past рік and offered to join it; pressing the
  // button then said the work did not exist (owner, 2026-09-20). The dialog no
  // longer offers it, and this says what is actually so for anything that
  // reaches the action another way.
  if (work.templateId !== template.id) {
    return {
      error: `Цю роботу внесено у ${work.template.academicYear} н.р. — години за неї нараховуються в тому році`,
    };
  }

  if (work.workType.sharing === 'INDIVIDUAL') {
    // D24: an INDIVIDUAL type's key is already prefixed per person, so nobody
    // should ever REACH this work — but a hand-made request could, and an
    // individual work has no pool to divide.
    return { error: 'Ця робота індивідуальна — до неї не можна приєднатися' };
  }

  const auditLabel =
    `${staff.lastName} ${staff.firstName} ${staff.patronymic ?? ''} — ${work.workType.label}`.trim();

  try {
    const recordId = await db.$transaction(async (tx) => {
      const planId = await requireLockedPlan(tx, {
        staffId,
        departmentId: input.departmentId,
        templateId: template.id,
      });

      if (input.planRowId) {
        const row = await tx.sciencePlanRow.findUnique({
          where: { id: input.planRowId },
          select: { planId: true, workTypeId: true },
        });
        if (!row || row.planId !== planId || row.workTypeId !== work.workType.id) {
          throw new PlanRowNotFoundError();
        }
      }

      if (work.workType.maxPerYear) {
        const count = await tx.scienceRecord.count({
          where: {
            staffId,
            templateId: template.id,
            status: 'APPROVED',
            work: { workTypeId: work.workType.id },
          },
        });
        if (count >= work.workType.maxPerYear) throw new CapExceededError(work.workType.maxPerYear);
      }

      // Re-read INSIDE the transaction, never from a figure the client sent.
      // Two co-authors saving in the same second must not both see 50 free
      // hours and both take them — the rule `saveDistribution` follows for a
      // кафедра's pool, for the same reason.
      //
      // APPROVED only, and never the caller's own row: a declined draw holds no
      // hours, and an edit to one's own share must be measured against everybody
      // else's, not against itself.
      const drawn = await tx.scienceRecord.aggregate({
        where: { workId: work.id, status: 'APPROVED', staffId: { not: staffId } },
        _sum: { hoursHundredths: true },
      });
      const fault = poolProblem({
        totalHundredths: work.totalHundredths,
        drawnByOthers: drawn._sum.hoursHundredths ?? 0,
        requested: input.hoursHundredths,
      });
      if (fault) throw new PoolError(fault);

      const record = await tx.scienceRecord.create({
        data: {
          staffId,
          workId: work.id,
          templateId: template.id,
          planId,
          planRowId: input.planRowId ?? null,
          hoursHundredths: input.hoursHundredths,
        },
        select: { id: true },
      });

      // Joining is open, so who attached themselves to which work, and for how
      // many hours, has to stay answerable (spec, «Joining a work»).
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'ScienceRecord',
          entityId: record.id,
          label: auditLabel,
          userId,
          changes: diffChanges(
            {},
            {
              workType: work.workType.label,
              hoursHundredths: input.hoursHundredths,
              totalHundredths: work.totalHundredths,
            }
          ),
        },
      });

      return record.id;
    });

    revalidatePath('/science-plan');
    // `workId` is already the caller's own input — `joinWork`'s caller
    // (`JoinWorkPanel`) never needs it back out of the result, unlike
    // `saveRecord`'s, which has no other way to learn the work it just
    // created. Included only to satisfy the shared `SaveRecordResult` shape.
    return { ok: true, recordId, workId: work.id };
  } catch (e) {
    if (e instanceof PoolError) return { error: e.reason };
    if (e instanceof CapExceededError) {
      return { error: `Не більше ${e.cap} записів цього виду роботи на рік` };
    }
    if (e instanceof PlanRowNotFoundError) return { error: 'Рядок плану не знайдено' };
    if (e instanceof PlanNotLockedError) {
      return { error: 'Спочатку збережіть план — після цього можна вносити виконане' };
    }

    // `@@unique([staffId, workId])` — the person pressed «Приєднатися» twice,
    // or had the page open in two tabs. The index is what decides.
    if (isUniqueViolation(e)) return { error: 'Ви вже додали цю роботу' };

    return {
      error: parseDbError(e, 'Не вдалося зберегти. Зміни не застосовано', 'science.joinWork', {
        userId,
      }),
    };
  }
}

/**
 * Correct the evidence of a work — its title, its DOI, its page count.
 *
 * The evidence belongs to the WORK and the pool is computed from it, so an edit
 * moves everybody's ceiling. Hence the two rules:
 *
 * - **Only `createdBy` or ADMIN.** Nobody else, including a co-author who has
 *   joined. They report it instead — the alternative is two authors disagreeing
 *   about a page count with no tiebreak.
 * - **Never below what is already drawn.** An edit that would put the pool under
 *   the sum of its claims is refused, naming the shortfall, because the
 *   alternative is co-authors silently holding hours the work no longer has.
 */
export async function updateWorkEvidence(input: {
  workId: string;
  evidence: unknown;
  link?: string;
  /** D41. Omitted means «keep the stored month». */
  executedMonth?: string;
}): Promise<{ ok: true } | { error: string }> {
  // No кафедра to check: a work belongs to nobody's кафедра, only to its year.
  // `allowAdmin` because the ADMIN branch below is the spec's escape hatch for
  // a wrong work, and most ADMIN accounts are not НПП.
  const actor = await resolveActor(undefined, { allowAdmin: true });
  if (!actor.ok) return { error: actor.error };
  const { userId, staffId, template } = actor.context;
  const isAdmin = actor.context.role === 'ADMIN';

  const work = await db.scienceWork.findUnique({
    where: { id: input.workId },
    select: {
      id: true,
      templateId: true,
      totalHundredths: true,
      evidence: true,
      link: true,
      executedMonth: true,
      createdById: true,
      workType: true,
      // The REAL count, not the zero this used to assume. A work proved by a
      // file alone (D27) would otherwise be refused the moment its author
      // corrected a page number, because the rule would read it as having no
      // evidence at all.
      _count: { select: { files: true } },
    },
  });
  if (!work || work.templateId !== template.id) return { error: 'Роботу не знайдено' };
  if (work.createdById !== staffId && !isAdmin) {
    return { error: 'Редагувати роботу може лише той, хто її додав' };
  }

  const type = work.workType;
  const fields = type.evidenceFields as unknown as EvidenceField[];
  const scoring = type.scoring as unknown as ScoringSpec;

  const parsed = schemaForFields(fields, scoring).safeParse(input.evidence);
  if (!parsed.success) return { error: 'Невірні дані форми' };

  const link = input.link?.trim() || null;
  if (link && type.linkRule === 'NONE') return { error: LINK_NOT_ALLOWED };

  // D42 applies to a CHANGE of month only. A work saved in time keeps its
  // month when its author later fixes a typo in the title, even if the window
  // has moved past it since.
  const storedMonth = dateToMonthKey(work.executedMonth);
  const nextMonth = input.executedMonth ?? storedMonth;
  if (nextMonth !== storedMonth) {
    const monthFault = monthProblem({
      month: nextMonth,
      now: new Date(),
      lookbackMonths: template.maxLookbackMonths,
    });
    if (monthFault) return { error: monthFault };
  }
  const evidenceFault = evidenceProblem({
    linkRule: type.linkRule,
    fileRule: type.fileRule,
    link,
    fileCount: work._count.files,
  });
  if (evidenceFault) return { error: evidenceFault };

  const key = workKey({
    identityFields: Array.isArray(type.identityFields) ? (type.identityFields as string[]) : [],
    evidenceFields: fields,
    reuse: type.reuse,
    sharing: type.sharing,
    evidence: parsed.data,
    academicYear: template.academicYear,
    // The key's person-prefix stays the ORIGINAL author's, not the editor's —
    // an ADMIN correcting somebody's work must not move it into their own key
    // space and free the original identity for a duplicate.
    staffId: work.createdById,
  });
  if (!key) return { error: 'Вкажіть назву або посилання, щоб роботу можна було розпізнати' };

  let score: number;
  try {
    ({ score } = computeScore(
      { code: type.code, coefficient: type.coefficient, scoring, evidenceFields: fields },
      parsed.data
    ));
  } catch (e) {
    logError('science.updateWorkEvidence', e, { userId, entityId: type.id });
    return { error: 'Невідомий вид роботи' };
  }
  const totalHundredths = toHundredths(score);

  // **What an edit may not do is take hours away from SOMEBODY ELSE.**
  //
  // The rule used to be «never below the sum of every claim», which counted
  // the editor's own draw against them and refused the ordinary correction
  // this action exists for. Two people hit it:
  //
  //   * a конференція entered as 5 days instead of 3 — an INDIVIDUAL work
  //     whose single claim IS the pool, told «робота вже поділена на 30 год»
  //     about a division of one;
  //   * the sole author of an article correcting a page count downwards, which
  //     is most articles.
  //
  // So the measure is what OTHERS hold. Their numbers are theirs; the editor's
  // own follows the pool, because they are the one moving it.
  const drawn = await db.scienceRecord.aggregate({
    where: { workId: work.id, status: 'APPROVED', staffId: { not: staffId } },
    _sum: { hoursHundredths: true },
  });
  const drawnByOthers = drawn._sum.hoursHundredths ?? 0;
  if (totalHundredths < drawnByOthers) {
    return {
      error: `Співавтори вже взяли ${formatHours(drawnByOthers)} год — менше цього зробити не можна`,
    };
  }

  const individual = type.sharing === 'INDIVIDUAL';
  // An INDIVIDUAL work's claim always EQUALS its pool, up or down. A SHARED
  // one's is only ever pulled DOWN, and only as far as it has to go: an author
  // who left room for co-authors keeps having left it.
  const ownHours = individual ? totalHundredths : Math.max(0, totalHundredths - drawnByOthers);

  try {
    await db.$transaction(async (tx) => {
      await tx.scienceWork.update({
        where: { id: work.id },
        data: {
          evidence: parsed.data as Prisma.InputJsonValue,
          computedValue: score,
          // Only written when it moved — «omitted» never rewrites the column.
          executedMonth: nextMonth !== storedMonth ? monthToDate(nextMonth) : undefined,
          link,
          totalHundredths,
          dedupKey: key,
        },
      });

      // The editor's OWN draw follows the pool they just moved. Without this
      // the work says 18 год while their «Виконано» goes on counting 30.
      // Scoped to `staffId`, so a co-author's agreed share is never rewritten
      // by somebody else's edit.
      await tx.scienceRecord.updateMany({
        where: {
          workId: work.id,
          staffId: individual ? undefined : staffId,
          // Only ever pulled down for a SHARED work; raising somebody's claim
          // because the pool grew is their decision, not this action's.
          ...(individual ? {} : { hoursHundredths: { gt: ownHours } }),
        },
        data: { hoursHundredths: ownHours },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'ScienceWork',
          entityId: work.id,
          label: type.label,
          userId,
          changes: diffChanges(
            {
              totalHundredths: work.totalHundredths,
              link: work.link,
              executedMonth: storedMonth,
              dedupKey: undefined,
            },
            { totalHundredths, link, executedMonth: nextMonth, dedupKey: key }
          ),
        },
      });
    });
  } catch (e) {
    // The new identity is another work's. Says «вже існує» rather than naming
    // it: the other work may be somebody else's on another кафедра.
    if (isUniqueViolation(e)) return { error: 'Робота з такими даними вже існує' };
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти. Зміни не застосовано',
        'science.updateWorkEvidence',
        { userId }
      ),
    };
  }

  revalidatePath('/science-plan');
  return { ok: true };
}

/**
 * Withdraw the caller's own draw.
 *
 * **Deletes the record, never the work.** A work with no claims is kept,
 * because its `dedupKey` is what stops it being re-entered and a co-author may
 * still draw on it. ADMIN deletes a genuinely wrong work, which cascades.
 */
export async function deleteRecord(recordId: string): Promise<{ ok: true } | { error: string }> {
  const actor = await resolveActor();
  if (!actor.ok) return { error: actor.error };
  const { userId, staffId, template } = actor.context;

  const record = await db.scienceRecord.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      staffId: true,
      templateId: true,
      hoursHundredths: true,
      work: {
        select: {
          id: true,
          workType: { select: { label: true, sharing: true } },
          files: { select: { objectKey: true } },
        },
      },
    },
  });
  // Ownership is the check, and a row left over on a template that is no longer
  // the OPEN one is not this year's to delete.
  if (!record || record.staffId !== staffId) return { error: 'Запис не знайдено' };
  if (record.templateId !== template.id) return { error: 'Запис не знайдено' };

  // Objects to clear once the rows are gone — collected BEFORE the delete,
  // because the cascade takes the rows that name them (see below).
  let orphanedObjectKeys: string[] = [];

  try {
    await db.$transaction(async (tx) => {
      await tx.scienceRecord.delete({ where: { id: recordId } });

      // **An INDIVIDUAL work with no claims left goes with it.**
      //
      // A work normally survives its last claim, because its `dedupKey` is
      // what stops the same article being entered twice and a co-author may
      // still draw on it. Neither reason holds for an INDIVIDUAL type: D24
      // prefixes its key with the owner's `staffId`, so no other person could
      // ever collide with it, and there are no co-authors to keep it for.
      //
      // Left standing it protected nothing and blocked one person — the one
      // who owned it. Deleting a конференція record to fix «3 дні» into «5»
      // and adding it again hit «цю роботу вже додав …», naming the person to
      // themselves, and `joinWork` refuses an INDIVIDUAL work, so that
      // конференція could never be recorded again (owner, 2026-09-20).
      if (record.work.workType.sharing === 'INDIVIDUAL') {
        const left = await tx.scienceRecord.count({ where: { workId: record.work.id } });
        if (left === 0) {
          orphanedObjectKeys = record.work.files.map((f) => f.objectKey);
          // Cascades its files' rows; their R2 objects are dropped after the
          // transaction commits.
          await tx.scienceWork.delete({ where: { id: record.work.id } });
        }
      }

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'ScienceRecord',
          entityId: recordId,
          label: record.work.workType.label,
          userId,
          changes: diffChanges(
            {
              workType: record.work.workType.label,
              hoursHundredths: record.hoursHundredths,
            },
            {}
          ),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося видалити. Зміни не застосовано', 'science.deleteRecord', {
        userId,
      }),
    };
  }

  // After the commit, never inside it: a failed R2 delete must not roll back a
  // deletion the person already saw succeed.
  for (const objectKey of orphanedObjectKeys) {
    await safeDeleteObject('science.deleteRecord', objectKey, { userId, entityId: recordId });
  }

  revalidatePath('/science-plan');
  return { ok: true };
}

/**
 * Is this work already recorded, and if so, what does the person need to know?
 *
 * Returns `null` when the work is new, an `error` when the caller already drew
 * on it this рік, and a `conflict` when somebody else holds it. Called twice:
 * once before the insert for the ordinary case, once after a P2002 for the
 * race.
 *
 * **The lookup is deliberately not scoped to the open рік**, and cannot be: a
 * `SHARED` + `ONCE` key carries no year precisely so one article exists in the
 * university once, for ever. So this can find a work from a рік that is
 * already closed, and it has to SAY which — see `WorkConflict.fromYear`.
 */
async function findConflict(
  key: string,
  staffId: string,
  fields: EvidenceField[],
  fallbackLabel: string,
  /** The OPEN рік, to tell «somebody else holds this» from «this belongs to a
   *  рік nobody can write to any more». */
  template: { id: string; academicYear: string }
): Promise<SaveRecordResult | null> {
  const existing = await db.scienceWork.findUnique({
    where: { dedupKey: key },
    select: {
      id: true,
      templateId: true,
      totalHundredths: true,
      evidence: true,
      template: { select: { academicYear: true } },
      createdBy: { select: { lastName: true, firstName: true, patronymic: true } },
      // APPROVED only: a declined draw holds no hours, and its share of the
      // pool is free for somebody else to take.
      records: { where: { status: 'APPROVED' }, select: { staffId: true, hoursHundredths: true } },
    },
  });
  if (!existing) return null;

  const base = {
    workId: existing.id,
    createdByName: initials(existing.createdBy),
    // `||`, not `??`: an empty summary is what a вид роботи with no evidence
    // fields returns, and `??` let it through — the conflict panel then
    // offered to join a work with no name on it.
    summary: summarizeEvidence(fields, existing.evidence) || fallbackLabel,
    totalHundredths: existing.totalHundredths,
  };

  // **A work from another рік, checked FIRST.** Its pool belongs to that рік
  // and nothing can be drawn from it now, whether or not this person already
  // has a claim on it — so naming the рік is the useful answer either way, and
  // more useful than «Ви вже додали цю роботу», which reads as if it meant
  // this рік.
  if (existing.templateId !== template.id) {
    return {
      conflict: {
        ...base,
        // Nothing is on offer, so no remainder is quoted: the figure would be
        // a closed рік's arithmetic shown against this рік's plan.
        remainingHundredths: 0,
        fromYear: existing.template.academicYear,
      },
    };
  }

  if (existing.records.some((r) => r.staffId === staffId)) {
    return { error: 'Ви вже додали цю роботу' };
  }

  const drawn = existing.records.reduce((sum, r) => sum + r.hoursHundredths, 0);
  return {
    conflict: {
      ...base,
      remainingHundredths: remainingHundredths(existing.totalHundredths, drawn),
      fromYear: null,
    },
  };
}
