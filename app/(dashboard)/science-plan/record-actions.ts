'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { diffChanges } from '@/lib/audit';
import { isUniqueViolation, parseDbError } from '@/lib/db-error';
import { logError } from '@/lib/log';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { planTarget, rateForPlan } from '@/lib/science/target';
import { workKey } from '@/lib/science/work-key';
import {
  attachReservations,
  CoauthorError,
  deferShare,
  grantShare,
  replaceCoauthors,
  undeferShare,
  type WorkRef,
} from '@/lib/science/coauthor-store';
import { deferralYear, earlierYear } from '@/lib/science/count-year';
import {
  authorShare,
  COAUTHOR_CANNOT_DELETE,
  coauthorsProblem,
  type CoauthorShare,
} from '@/lib/science/coauthors';
import {
  doiProof,
  evidenceProblem,
  FILE_NOT_ALLOWED,
  LINK_NOT_ALLOWED,
  linkProblem,
} from '@/lib/science/evidence-rule';
import { computeScore, type ScoringSpec } from '@/lib/specs/scoring';
import { toHundredths } from '@/lib/stake/units';
import { schemaForFields } from '@/validations/activity-evidence';
import { pickedPersonProblem } from '@/lib/queries/list-my-aspirants';
import { summarizeEvidence, type EvidenceField } from '@/lib/rating/evidence-fields';
import { formatHours } from '@/lib/science/hours';
import {
  currentMonthKey,
  dateToMonthKey,
  monthProblem,
  monthToDate,
  startedMonthProblem,
} from '@/lib/science/execution-month';
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
  /**
   * The people the author shares the work with, and the hours each one gets
   * (owner, 2026-09-30). Only for a SHARED type. **The author's own share is
   * never typed: it is what is left.** Nobody else can add themselves later —
   * they are told to agree the hours with the author, who edits this list.
   */
  coauthors?: CoauthorShare[];
  /**
   * An object the browser has ALREADY put in R2 (`presignUpload` → `PUT`).
   * Verified here from the stored bytes and attached inside the same
   * transaction that creates the work — which is what lets a record be proved
   * by a file alone (D27), and what stops a failed upload leaving a saved
   * record with nothing behind it.
   */
  file?: { objectKey: string; fileName: string };
  /** D41/D48: `"YYYY-MM"`, the month the work was done — within the OPEN
   *  навчальний рік, never in the future. Where the work took several months,
   *  the month it was FINISHED — its hours all count here.
   *
   *  Omitted while `SHOW_EXECUTION_PERIOD` is off: the month the record is
   *  saved is stored instead, unchecked. */
  executedMonth?: string;
  /** «Робота тривала кілька місяців»: the month it started. A recorded fact,
   *  never used to split hours. Omitted for a one-month work. */
  startedMonth?: string;
}

/** D17 turned into something the screen can act on: who has the work and what
 *  it is. **There is nothing to take** — a colleague is told to agree the hours
 *  with whoever entered it, and that person changes the co-author list. */
export interface WorkConflict {
  workId: string;
  createdByName: string;
  summary: string;
  totalHundredths: number;
  /**
   * The навчальний рік the work was entered in, when that is NOT the open one.
   * `null` for a work of the current year.
   *
   * A `SHARED` + `ONCE` key carries no year, so the lookup finds an article
   * recorded in ANY past рік, and the panel has to say which — «цю роботу
   * внесено у 2025/2026», not «зверніться до автора», for a work nobody can
   * change any more (owner, 2026-09-20).
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
 * a second action became its caller — §11's rule applied one level down from
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
 *
 * **Refused below 500 × ставка** (owner, 2026-09-24): an underplanned year is
 * not saved at all, rather than saved with a warning ННВ may or may not read.
 */
export async function lockPlan(departmentId: string): Promise<{ ok: true } | { error: string }> {
  const actor = await resolveActor(departmentId);
  if (!actor.ok) return { error: actor.error };
  const { userId, staffId, staff, template } = actor.context;

  const plan = await db.sciencePlan.findUnique({
    where: {
      staffId_departmentId_templateId: { staffId, departmentId, templateId: template.id },
    },
    select: { id: true, lockedAt: true, rows: { select: { id: true, plannedHundredths: true } } },
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

  // **No saving below the norm** (owner, 2026-09-24, reversing D9's «shown,
  // never blocked» for the SUBMISSION). A plan may still be drafted under it —
  // rows are added one at a time — but it cannot be fixed as the year's plan
  // until it reaches 500 × ставка. Re-read from the rows here, never taken from
  // the screen.
  const { plannedHundredths, targetHundredths, shortfallHundredths } = planTarget({
    minHoursPerRate: template.minHoursPerRate,
    rateHundredths,
    plannedHundredths: plan.rows.reduce((sum, row) => sum + row.plannedHundredths, 0),
    doneHundredths: 0,
  });
  if (shortfallHundredths) {
    return {
      error: `План нижче норми: заплановано ${formatHours(plannedHundredths)} год з ${formatHours(
        targetHundredths!
      )} потрібних. Додайте ще ${formatHours(shortfallHundredths)} год.`,
    };
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

      // Hours the authors of shared works set aside for this person while they
      // had no plan to hold them: they land here, on the plan just submitted.
      await attachReservations(tx, {
        staffId,
        planId: plan.id,
        templateId: template.id,
        academicYear: template.academicYear,
        userId,
      });

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

  // п.12: the аспірант is one of this person's own (owner, 2026-10-07) — the
  // form offers nothing else; a hand-made request is told the same.
  const pickFault = await pickedPersonProblem(fields, parsed.data, staffId);
  if (pickFault) return { error: pickFault };

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

  // D48: within the навчальний рік, and never in the future — judged only when
  // somebody picked a month. With the picker hidden (2026-09-24) nobody does,
  // and the save month is stored as it is: there is no choice to refuse.
  const now = new Date();
  const window = {
    now,
    academicYear: template.academicYear,
    lastMonth: template.lastExecutionMonth,
  };
  const executedMonth = input.executedMonth ?? currentMonthKey(now);
  // A start means nothing without a finish somebody picked.
  const startedMonth = input.executedMonth ? input.startedMonth : undefined;
  const monthFault = input.executedMonth
    ? (monthProblem({ month: input.executedMonth, ...window }) ??
      (startedMonth
        ? startedMonthProblem({
            started: startedMonth,
            finished: input.executedMonth,
            ...window,
          })
        : null))
    : null;
  if (monthFault) {
    await dropFile();
    return { error: monthFault };
  }

  // The стаття's DOI is a proof of its own, and never belongs in the link
  // box (owner, 2026-10-02) — see `doiProof` / `linkProblem`.
  const doi = doiProof(fields, parsed.data);
  const evidenceFault =
    linkProblem(link, doi !== undefined) ??
    evidenceProblem({
      linkRule: type.linkRule,
      fileRule: type.fileRule,
      link,
      fileCount: verifiedFile ? 1 : 0,
      doi,
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
    link,
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

  // The author names the co-authors and what each one gets (owner,
  // 2026-09-30); their OWN share is what is left, never a figure they type. An
  // INDIVIDUAL work has no pool to divide, so it takes none.
  const coauthors = input.coauthors ?? [];
  if (coauthors.length > 0 && type.sharing === 'INDIVIDUAL') {
    await dropFile();
    return { error: 'У цієї роботи не може бути співавторів' };
  }
  if (totalHundredths <= 0) {
    await dropFile();
    return { error: 'Вкажіть кількість годин більше нуля' };
  }
  const coauthorFault = coauthorsProblem({
    totalHundredths,
    authorStaffId: staffId,
    shares: coauthors,
  });
  if (coauthorFault) {
    await dropFile();
    return { error: coauthorFault };
  }
  const requested = authorShare(totalHundredths, coauthors);

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
          executedMonth: monthToDate(executedMonth),
          startedMonth: startedMonth ? monthToDate(startedMonth) : null,
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

      // The co-authors' shares, in the SAME transaction: a refused one rolls the
      // whole work back, so nothing is ever half-shared.
      const ref: WorkRef = {
        id: work.id,
        templateId: template.id,
        workTypeId: type.id,
        totalHundredths,
        typeLabel: type.label,
        maxPerYear: type.maxPerYear,
      };
      for (const c of coauthors) {
        await grantShare(tx, {
          work: ref,
          staffId: c.staffId,
          hoursHundredths: c.hoursHundredths,
          userId,
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
              coauthors: coauthors.length,
              link,
              executedMonth,
              startedMonth: startedMonth ?? null,
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
    if (e instanceof CoauthorError) return { error: e.reason };
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
  /** The start of a several-month work. Omitted keeps it; `null` clears it —
   *  «one month after all». */
  startedMonth?: string | null;
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
      startedMonth: true,
      createdById: true,
      declinedAt: true,
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

  const stored =
    work.evidence && typeof work.evidence === 'object'
      ? (work.evidence as Record<string, unknown>)
      : undefined;
  const parsed = schemaForFields(fields, scoring, { stored }).safeParse(input.evidence);
  if (!parsed.success) return { error: 'Невірні дані форми' };

  // п.12, judged against the work's OWNER (an ADMIN may be the one editing);
  // a name already stored passes unchanged — see `pickedPersonProblem`.
  const pickFault = await pickedPersonProblem(fields, parsed.data, work.createdById, stored);
  if (pickFault) return { error: pickFault };

  const link = input.link?.trim() || null;
  if (link && type.linkRule === 'NONE') return { error: LINK_NOT_ALLOWED };

  // D48 applies to a CHANGE of month only: an unchanged month is never
  // re-judged, so fixing a typo in the title cannot be refused over it.
  const window = {
    now: new Date(),
    academicYear: template.academicYear,
    lastMonth: template.lastExecutionMonth,
  };
  const storedMonth = dateToMonthKey(work.executedMonth);
  const nextMonth = input.executedMonth ?? storedMonth;
  const storedStart = work.startedMonth ? dateToMonthKey(work.startedMonth) : null;
  const nextStart = input.startedMonth === undefined ? storedStart : input.startedMonth;
  if (nextMonth !== storedMonth) {
    const monthFault = monthProblem({ month: nextMonth, ...window });
    if (monthFault) return { error: monthFault };
  }
  // The start is judged whenever either end of the range moved.
  if (nextStart !== null && (nextStart !== storedStart || nextMonth !== storedMonth)) {
    const startFault = startedMonthProblem({ started: nextStart, finished: nextMonth, ...window });
    if (startFault) return { error: startFault };
  }
  const doi = doiProof(fields, parsed.data);
  const evidenceFault =
    linkProblem(link, doi !== undefined) ??
    evidenceProblem({
      linkRule: type.linkRule,
      fileRule: type.fileRule,
      link,
      fileCount: work._count.files,
      doi,
    });
  if (evidenceFault) return { error: evidenceFault };

  const key = workKey({
    identityFields: Array.isArray(type.identityFields) ? (type.identityFields as string[]) : [],
    evidenceFields: fields,
    reuse: type.reuse,
    sharing: type.sharing,
    evidence: parsed.data,
    link,
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
  // So the measure is what the CO-AUTHORS hold — their records AND the hours
  // reserved for people who have not saved a plan yet. Their numbers are
  // theirs; the AUTHOR's own share is what is left, so it follows the pool.
  const individual = type.sharing === 'INDIVIDUAL';
  const drawn = await db.scienceRecord.aggregate({
    where: {
      workId: work.id,
      staffId: { not: work.createdById },
      // A declined work has every record switched off, but they all come back
      // together — so their hours still bound the pool (see `declinedAt`).
      ...(work.declinedAt
        ? { OR: [{ status: 'APPROVED' as const }, { removedAt: work.declinedAt }] }
        : { status: 'APPROVED' as const }),
    },
    _sum: { hoursHundredths: true },
  });
  const reserved = await db.scienceCoauthorShare.aggregate({
    where: { workId: work.id },
    _sum: { hoursHundredths: true },
  });
  const drawnByOthers = (drawn._sum.hoursHundredths ?? 0) + (reserved._sum.hoursHundredths ?? 0);
  if (!individual && totalHundredths <= drawnByOthers) {
    return {
      error: `Співавторам віддано ${formatHours(drawnByOthers)} год — робота має коштувати більше, щоб вам щось залишилось`,
    };
  }

  // An INDIVIDUAL work's claim always EQUALS its pool. A SHARED one's is what
  // the co-authors leave, up or down: they were given fixed hours, so a bigger
  // pool is the author's and a smaller one comes out of theirs alone.
  const ownHours = individual ? totalHundredths : totalHundredths - drawnByOthers;

  try {
    await db.$transaction(async (tx) => {
      await tx.scienceWork.update({
        where: { id: work.id },
        data: {
          evidence: parsed.data as Prisma.InputJsonValue,
          computedValue: score,
          // Only written when it moved — «omitted» never rewrites the column.
          executedMonth: nextMonth !== storedMonth ? monthToDate(nextMonth) : undefined,
          startedMonth:
            nextStart === storedStart
              ? undefined
              : nextStart === null
                ? null
                : monthToDate(nextStart),
          link,
          totalHundredths,
          dedupKey: key,
        },
      });

      // The AUTHOR's draw follows the pool that just moved. Without this the
      // work says 18 год while their «Виконано» goes on counting 30. Scoped to
      // the work's author — never the editor, who may be an ADMIN with no
      // record — so a co-author's agreed share is never rewritten.
      await tx.scienceRecord.updateMany({
        where: {
          workId: work.id,
          staffId: individual ? undefined : work.createdById,
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
              startedMonth: storedStart,
              dedupKey: undefined,
            },
            {
              totalHundredths,
              link,
              executedMonth: nextMonth,
              startedMonth: nextStart,
              dedupKey: key,
            }
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
 * Delete a work — **only its author can, and the whole work goes**: its
 * co-authors' records, their reservations and its files (owner, 2026-09-30).
 * The co-authors hold hours the author gave them from a pool the author's proof
 * stands behind; with the author's record gone nobody can change those hours,
 * and the work's `dedupKey` would block the article from ever being entered
 * again. The screen warns the author, by number, before this runs.
 *
 * **A co-author cannot delete at all** (owner, 2026-10-02, reversing
 * 2026-09-30's «a co-author withdraws their own record»). One named by mistake
 * asks the author to take them off in «Співавтори». ADMIN deletes a genuinely
 * wrong work elsewhere.
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
          createdById: true,
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

  if (record.work.createdById !== staffId) return { error: COAUTHOR_CANNOT_DELETE };

  // Objects to clear once the rows are gone — collected BEFORE the delete,
  // because the cascade takes the rows that name them.
  let orphanedObjectKeys: string[] = [];

  try {
    await db.$transaction(async (tx) => {
      // Cascades every record, reservation and file row of the work; the R2
      // objects are dropped after the transaction commits.
      orphanedObjectKeys = record.work.files.map((f) => f.objectKey);
      await tx.scienceWork.delete({ where: { id: record.work.id } });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'ScienceWork',
          entityId: record.work.id,
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
 * The author sends a DECLINED work back for review (owner, 2026-09-30).
 *
 * ННВ declined it because its proof was wrong — a mistyped link, the wrong
 * document. The author fixes it (`updateWorkEvidence`, the file actions) and
 * calls this: every record the decline switched off counts again **at once**,
 * like anything else saved here, and the work carries `resubmittedAt` so ННВ
 * sees it as «виправлено» and can decline it again. It is not an approval step —
 * the app has none for science records.
 *
 * Refused while the proof is still missing (the same `evidenceProblem` a save
 * runs), so the button cannot bring back a work with nothing behind it. Only the
 * author or ADMIN — co-authors ask the author.
 */
export async function resubmitScienceWork(
  workId: string
): Promise<{ ok: true } | { error: string }> {
  const actor = await resolveActor(undefined, { allowAdmin: true });
  if (!actor.ok) return { error: actor.error };
  const { userId, staffId, template } = actor.context;
  const isAdmin = actor.context.role === 'ADMIN';

  const work = await db.scienceWork.findUnique({
    where: { id: workId },
    select: {
      id: true,
      templateId: true,
      createdById: true,
      declinedAt: true,
      link: true,
      evidence: true,
      workType: { select: { label: true, linkRule: true, fileRule: true, evidenceFields: true } },
      _count: { select: { files: true } },
    },
  });
  if (!work || work.templateId !== template.id) return { error: 'Роботу не знайдено' };
  if (work.createdById !== staffId && !isAdmin) {
    return { error: 'Надіслати роботу повторно може лише той, хто її додав' };
  }
  if (!work.declinedAt) return { error: 'Цю роботу не відхилено' };

  const fault = evidenceProblem({
    linkRule: work.workType.linkRule,
    fileRule: work.workType.fileRule,
    link: work.link,
    fileCount: work._count.files,
    doi: doiProof(work.workType.evidenceFields as unknown as EvidenceField[], work.evidence),
  });
  if (fault) return { error: fault };

  try {
    await db.$transaction(async (tx) => {
      await tx.scienceRecord.updateMany({
        where: { workId: work.id, status: 'REMOVED', removedAt: work.declinedAt },
        data: { status: 'APPROVED', removedByUserId: null, removedAt: null, removedReason: null },
      });
      await tx.scienceWork.update({
        where: { id: work.id },
        data: {
          declinedAt: null,
          declineReason: null,
          declinedById: null,
          resubmittedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'ScienceWork',
          entityId: work.id,
          label: work.workType.label,
          userId,
          changes: diffChanges({ declined: true }, { declined: false }),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося надіслати. Зміни не застосовано',
        'science.resubmitScienceWork',
        { userId }
      ),
    };
  }

  revalidatePath('/science-plan');
  revalidatePath('/moderation');
  revalidatePath('/science-plans');
  return { ok: true };
}

/**
 * Change who a work is shared with and how many hours each person gets — the ONE
 * way a co-author is added, removed or given a different share once the work is
 * saved (owner, 2026-09-30).
 *
 * **Only whoever entered the work, or ADMIN.** A colleague who was not named is
 * told to agree the hours with them, and this is where that agreement is
 * written down. Co-authors cannot change their own share — with two people able
 * to move the same pool, «who has how much» has no answer.
 *
 * The author's own share is not an input: it is what remains.
 */
export async function updateCoauthors(input: {
  workId: string;
  coauthors: CoauthorShare[];
}): Promise<{ ok: true } | { error: string }> {
  // `allowAdmin`: an ADMIN may correct any work, and most ADMIN accounts are not
  // НПП (see `updateWorkEvidence`).
  const actor = await resolveActor(undefined, { allowAdmin: true });
  if (!actor.ok) return { error: actor.error };
  const { userId, staffId, template } = actor.context;
  const isAdmin = actor.context.role === 'ADMIN';

  if (
    !Array.isArray(input.coauthors) ||
    input.coauthors.some(
      (c) => typeof c?.staffId !== 'string' || typeof c?.hoursHundredths !== 'number'
    )
  ) {
    return { error: 'Невірні дані співавторів' };
  }

  const work = await db.scienceWork.findUnique({
    where: { id: input.workId },
    select: {
      id: true,
      templateId: true,
      totalHundredths: true,
      createdById: true,
      declinedAt: true,
      declineReason: true,
      declinedById: true,
      workType: { select: { id: true, label: true, sharing: true, maxPerYear: true } },
    },
  });
  if (!work || work.templateId !== template.id) return { error: 'Роботу не знайдено' };
  if (work.createdById !== staffId && !isAdmin) {
    return { error: 'Змінювати співавторів може лише той, хто додав роботу' };
  }
  if (work.workType.sharing === 'INDIVIDUAL') {
    return { error: 'У цієї роботи не може бути співавторів' };
  }

  try {
    await db.$transaction(async (tx) => {
      await replaceCoauthors(tx, {
        work: {
          id: work.id,
          templateId: work.templateId,
          workTypeId: work.workType.id,
          totalHundredths: work.totalHundredths,
          typeLabel: work.workType.label,
          maxPerYear: work.workType.maxPerYear,
          // Adding somebody to a DECLINED work is often the very fix ННВ asked
          // for (a valid co-author the author left out). They join switched
          // off, with the work, and count when it is sent back.
          declined: work.declinedAt
            ? {
                at: work.declinedAt,
                reason: work.declineReason,
                byUserId: work.declinedById,
              }
            : null,
        },
        authorStaffId: work.createdById,
        desired: input.coauthors,
        userId,
      });
    });
  } catch (e) {
    if (e instanceof CoauthorError) return { error: e.reason };
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти. Зміни не застосовано',
        'science.updateCoauthors',
        { userId }
      ),
    };
  }

  revalidatePath('/science-plan');
  return { ok: true };
}

/**
 * A CO-AUTHOR chooses the навчальний рік their share counts in — the work's own,
 * or the next one (owner, 2026-10-02; the window is `deferralYear`), or says it
 * was already counted in the previous one (owner, 2026-10-07; `earlierYear`) —
 * a reservation marked with a рік that never opens again, so it counts
 * nowhere and nobody else's hours move.
 *
 * **Never the author.** Whoever adds a work is meant to count it in the year
 * they add it; an author who wants the next year enters it in September. And
 * only while the work's own year is OPEN — once it closes, the choice is fixed.
 */
export async function setShareYear(input: {
  workId: string;
  academicYear: string;
}): Promise<{ ok: true } | { error: string }> {
  const actor = await resolveActor(undefined);
  if (!actor.ok) return { error: actor.error };
  const { userId, staffId, template } = actor.context;

  const work = await db.scienceWork.findUnique({
    where: { id: input.workId },
    select: {
      id: true,
      templateId: true,
      totalHundredths: true,
      createdById: true,
      createdAt: true,
      evidence: true,
      declinedAt: true,
      declineReason: true,
      declinedById: true,
      workType: {
        select: { id: true, label: true, sharing: true, maxPerYear: true, evidenceFields: true },
      },
    },
  });
  if (!work) return { error: 'Роботу не знайдено' };
  if (work.templateId !== template.id) {
    return { error: 'Рік цієї роботи вже закрито — рік зарахування змінити не можна' };
  }
  if (work.createdById === staffId) {
    return { error: 'Автор зараховує роботу в той рік, коли її додав' };
  }

  const window = {
    academicYear: template.academicYear,
    sharing: work.workType.sharing,
    fields: work.workType.evidenceFields as unknown as EvidenceField[],
    evidence: work.evidence,
    createdAt: work.createdAt,
  };
  const next = deferralYear(window);
  const earlier = earlierYear(window);
  const allowed = [template.academicYear, next, earlier].filter((y): y is string => !!y);
  if (!allowed.includes(input.academicYear)) {
    return { error: `Цю роботу можна зарахувати лише в ${allowed.join(' або ')}` };
  }

  const ref: WorkRef = {
    id: work.id,
    templateId: work.templateId,
    workTypeId: work.workType.id,
    totalHundredths: work.totalHundredths,
    typeLabel: work.workType.label,
    maxPerYear: work.workType.maxPerYear,
    declined: work.declinedAt
      ? { at: work.declinedAt, reason: work.declineReason, byUserId: work.declinedById }
      : null,
  };

  try {
    await db.$transaction(async (tx) => {
      if (input.academicYear === template.academicYear) {
        await undeferShare(tx, { work: ref, staffId, userId });
      } else {
        await deferShare(tx, { work: ref, staffId, academicYear: input.academicYear, userId });
      }
    });
  } catch (e) {
    if (e instanceof CoauthorError) return { error: e.reason };
    return {
      error: parseDbError(e, 'Не вдалося зберегти. Зміни не застосовано', 'science.setShareYear', {
        userId,
      }),
    };
  }

  revalidatePath('/science-plan');
  return { ok: true };
}

/**
 * Is this work already recorded, and if so, what does the person need to know?
 *
 * Returns `null` when the work is new. Otherwise it says what the person is to
 * DO, because since 2026-09-30 nobody can add themselves to somebody else's
 * work: an `error` where they are already on it (recorded or reserved), and a
 * `conflict` where they are not — which tells them to agree the hours with
 * whoever entered it. Called twice: once before the insert for the ordinary
 * case, once after a P2002 for the race.
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
      createdById: true,
      template: { select: { academicYear: true } },
      createdBy: { select: { lastName: true, firstName: true, patronymic: true } },
      // Who is already on the work: a declined record still occupies its
      // person's one row, so it is read too, and the reservations are the
      // people named before they had a plan to hold hours in.
      records: { select: { staffId: true } },
      coauthorShares: { select: { staffId: true } },
    },
  });
  if (!existing) return null;

  const base = {
    workId: existing.id,
    createdByName: initials(existing.createdBy),
    // `||`, not `??`: an empty summary is what a вид роботи with no evidence
    // fields returns, and `??` let it through — the panel then showed a work
    // with no name on it.
    summary:
      summarizeEvidence(fields, existing.evidence, undefined, { uaDates: true }) || fallbackLabel,
    totalHundredths: existing.totalHundredths,
  };

  // **A work from another рік, checked FIRST.** Nothing about it can change now,
  // whether or not this person is on it — so naming the рік is the useful answer
  // either way, and more useful than «Ви вже додали цю роботу», which reads as
  // if it meant this рік.
  if (existing.templateId !== template.id) {
    return { conflict: { ...base, fromYear: existing.template.academicYear } };
  }

  if (existing.records.some((r) => r.staffId === staffId)) {
    // Said differently for the person who was NAMED by the author: «you added
    // it» would be untrue, and they are the one most likely to hit this.
    return {
      error:
        existing.createdById === staffId
          ? 'Ви вже додали цю роботу'
          : 'Вас уже вказано співавтором цієї роботи — вона у вашому «Виконанні»',
    };
  }
  if (existing.coauthorShares.some((c) => c.staffId === staffId)) {
    return {
      error:
        'Вас уже вказано співавтором цієї роботи. Вона з’явиться у «Виконанні», щойно ви збережете план наукової роботи',
    };
  }

  return { conflict: { ...base, fromYear: null } };
}
