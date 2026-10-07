import { db } from '@/lib/db';
import { planTarget, rateForPlan, type PlanTarget } from '@/lib/science/target';
import { initials } from '@/lib/name';
import { summarizeEvidence, type EvidenceField } from '@/lib/rating/evidence-fields';
import type { ScienceRecordStatus, ScienceSharing } from '@/lib/generated/prisma/client';
import { dateToMonthKey } from '@/lib/science/execution-month';
import { deferralYear, earlierYear } from '@/lib/science/count-year';

/**
 * Every кафедра a person needs a plan on: their primary one (if they have
 * one) plus every additional кафедра through `StaffDepartment`.
 *
 * **An НПП with no primary кафедра still gets their additional one** (owner,
 * 2026-08-26) — `departmentId` being null must never mean «no plan anywhere»,
 * only «no primary». Deduplicated (a person cannot hold the same кафедра
 * twice) and sorted by name for the switcher.
 */
export async function planDepartmentsFor(
  staffId: string
): Promise<Array<{ id: string; name: string }>> {
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: {
      department: { select: { id: true, name: true } },
      partTimeDepartments: { select: { department: { select: { id: true, name: true } } } },
    },
  });
  if (!staff) return [];

  const seen = new Map<string, { id: string; name: string }>();
  if (staff.department) seen.set(staff.department.id, staff.department);
  for (const p of staff.partTimeDepartments) {
    if (!seen.has(p.department.id)) seen.set(p.department.id, p.department);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}

export interface SciencePlanRowDetail {
  id: string;
  order: number;
  workTypeId: string;
  workTypeLabel: string;
  itemNumber: string;
  unitNote: string | null;
  details: unknown;
  plannedHundredths: number;
  note: string | null;
  /**
   * What has been RECORDED against this intention — the «Виконано» marker
   * inside the «План» tab (D29). Zero is ordinary all year: a plan is an
   * intention and September is a long way from June.
   */
  doneHundredths: number;
}

export interface SciencePlanRecordDetail {
  id: string;
  workId: string;
  workTypeId: string;
  workTypeLabel: string;
  itemNumber: string;
  /** What the evidence says this is, in one line — «Scopus · 10 стор.». */
  summary: string;
  link: string | null;
  /** This person's own draw. */
  hoursHundredths: number;
  /** The whole work's pool — differs from the draw the moment it is shared. */
  totalHundredths: number;
  planRowId: string | null;
  /** D41 — the month the work was done, `"YYYY-MM"`. The WORK's, so every
   *  co-author sees the same one. */
  executedMonth: string;
  /** When the work took several months, the month it started — shown as a
   *  range, never used to split hours. Null for a one-month work. */
  startedMonth: string | null;
  status: ScienceRecordStatus;
  removedReason: string | null;
  /**
   * ННВ declined the WHOLE WORK (owner, 2026-09-30) — every co-author's record
   * is switched off until the author fixes the proof and sends it back. Not the
   * same as `status`, which is this one person's row: a work declined before
   * that rule shows only one record REMOVED and this false.
   */
  workDeclined: boolean;
  /** The author sent a declined work back and ННВ has not looked again. */
  resubmitted: boolean;
  /**
   * The work's own data, for the «Редагувати» form to open already filled in.
   * It belongs to the WORK, not to this draw — a co-author sees the same
   * values and may not change them (see `canEdit`).
   */
  evidence: unknown;
  /**
   * May THIS person correct the work — its title, its DOI, its page count?
   *
   * Only whoever entered it, mirroring `updateWorkEvidence`'s own guard. A
   * co-author who joined for a share of the hours reports a mistake instead;
   * two authors disagreeing about a page count has no tiebreak. The server
   * checks this again — a flag on a row is not a permission.
   */
  canEdit: boolean;
  /**
   * Whether the work has a pool to divide. The author may name co-authors on a
   * SHARED one — including one nobody shares yet — from «Співавтори»; an
   * INDIVIDUAL work has no pool, and no such button.
   */
  sharing: ScienceSharing;
  /** Every file attached to this work — its own row per file, not a count, so
   *  the «Виконано» tab can offer a «Переглянути» per file and show a PDF's
   *  page count (item 4 prices per page, and that is the number a reviewer
   *  compares). */
  files: {
    id: string;
    fileName: string;
    sizeBytes: number;
    pageCount: number | null;
    /** May this person delete or replace this file — whoever entered the
     *  work or uploaded the file (D46). `mayChangeFile` on the server says
     *  the same, and decides. */
    canChange: boolean;
  }[];
  /**
   * Everybody else the work is shared with — their records AND the hours
   * reserved for people who have not saved a plan yet (`pending`). The only
   * place a person sees that their 50 год came out of a 200 год pool, and who
   * has the rest; and the list the author's «Співавтори» form opens filled in
   * with. `staffId` is what that form's picker selects by.
   */
  coAuthors: {
    staffId: string;
    name: string;
    hoursHundredths: number;
    pending: boolean;
    /** The co-author moved their share to this later навчальний рік. */
    deferredTo: string | null;
  }[];
  /** Whoever entered the work — named to a co-author, who must agree any change
   *  to their hours with this person. */
  authorName: string;
  /**
   * The next навчальний рік this CO-AUTHOR may move their share to, or null
   * (owner, 2026-10-02; `lib/science/count-year.ts`). Never offered to the
   * author, on a closed year, or on a row that is not counting.
   */
  deferrable: string | null;
  /**
   * The previous навчальний рік, when this co-author may say their share was
   * already counted there (`earlierYear`, owner 2026-10-07) — same conditions
   * as `deferrable`, the mirror window.
   */
  countedEarlier: string | null;
}

/**
 * A co-author's share of one of this year's works that they moved to the next
 * навчальний рік — not counted here, listed so they can see it and bring it
 * back while this year is open.
 */
export interface DeferredShareDetail {
  workId: string;
  workTypeLabel: string;
  itemNumber: string;
  summary: string;
  link: string | null;
  hoursHundredths: number;
  totalHundredths: number;
  /** Where it will count, «2027/2028». */
  academicYear: string;
  authorName: string;
}

export interface SciencePlanDetail {
  // No `rateHundredths` here on purpose: it would be a second, stored copy of
  // the number `target.rateHundredths` already gives live while the template
  // is OPEN, and the obvious-looking field would be the stale one. The ставка
  // has exactly one place to be read from — `target`.
  plan: { id: string; lockedAt: Date | null } | null;
  rows: SciencePlanRowDetail[];
  records: SciencePlanRecordDetail[];
  /** Shares moved to the next year — shown on ONE of the person's plans, never counted. */
  deferred: DeferredShareDetail[];
  target: PlanTarget;
  /**
   * Which пункти of Додаток III this person committed to.
   *
   * A fact may be recorded against any вид роботи that is IN THE PLAN, whatever
   * the actual work turns out to be (owner, 2026-09-17): the plan is
   * approximate — it names the пункт and roughly how much, never the article.
   * So a Scopus article published in May counts against a September plan that
   * said «п.4, 10 сторінок», even though it is a different article of a
   * different length; what counts is the FACT's own hours, not the plan's.
   */
  plannedWorkTypeIds: string[];
}

const EMPTY_TARGET: PlanTarget = {
  rateHundredths: null,
  targetHundredths: null,
  plannedHundredths: 0,
  shortfallHundredths: null,
  doneHundredths: 0,
  doneTargetHundredths: null,
  doneShortfallHundredths: null,
};

/**
 * One person's plan on one кафедра: what they intended, what they recorded, and
 * both against the same ціль.
 *
 * **A declined record is returned but never counted.** The person has to be
 * able to read why it was declined (D20), and its hours have to be back in the
 * work's pool for a co-author to take — so `status` travels with the row while
 * every sum filters on APPROVED.
 */
export async function getSciencePlan(
  staffId: string,
  departmentId: string,
  templateId: string
): Promise<SciencePlanDetail> {
  const template = await db.sciencePlanTemplate.findUnique({
    where: { id: templateId },
    select: { minHoursPerRate: true, stakeYear: true, status: true, academicYear: true },
  });
  if (!template) {
    // Nothing to compute a target against — a caller passing a bad templateId
    // gets an empty, targetless result rather than a throw.
    return {
      plan: null,
      rows: [],
      records: [],
      deferred: [],
      target: EMPTY_TARGET,
      plannedWorkTypeIds: [],
    };
  }

  const plan = await db.sciencePlan.findUnique({
    where: { staffId_departmentId_templateId: { staffId, departmentId, templateId } },
    select: {
      id: true,
      rateHundredths: true,
      lockedAt: true,
      rows: {
        select: {
          id: true,
          order: true,
          workTypeId: true,
          workType: { select: { label: true, itemNumber: true, unitNote: true } },
          details: true,
          plannedHundredths: true,
          note: true,
        },
        orderBy: { order: 'asc' },
      },
      records: {
        select: {
          id: true,
          hoursHundredths: true,
          status: true,
          removedReason: true,
          planRowId: true,
          work: {
            select: {
              id: true,
              templateId: true,
              createdAt: true,
              link: true,
              evidence: true,
              executedMonth: true,
              startedMonth: true,
              totalHundredths: true,
              workTypeId: true,
              createdById: true,
              declinedAt: true,
              resubmittedAt: true,
              createdBy: { select: { lastName: true, firstName: true, patronymic: true } },
              workType: {
                select: { label: true, itemNumber: true, evidenceFields: true, sharing: true },
              },
              // Hours set aside for people with no saved plan yet — part of
              // the split even though they are not a record (yet).
              coauthorShares: {
                select: {
                  staffId: true,
                  hoursHundredths: true,
                  academicYear: true,
                  staff: { select: { lastName: true, firstName: true, patronymic: true } },
                },
              },
              // Everybody's draw on this work, including this person's own —
              // filtered out below, where the name is already in hand. Not
              // filtered on APPROVED here: a DECLINED work has every record
              // switched off and its co-authors must still be listed, so the
              // filter needs the work's `declinedAt` and lives below.
              records: {
                select: {
                  status: true,
                  removedAt: true,
                  staffId: true,
                  hoursHundredths: true,
                  staff: { select: { lastName: true, firstName: true, patronymic: true } },
                },
              },
              files: {
                select: {
                  id: true,
                  fileName: true,
                  sizeBytes: true,
                  pageCount: true,
                  uploadedById: true,
                },
              },
            },
          },
        },
        // Newest first: the «Виконано» tab is a log of what happened, and the
        // thing somebody just added is the thing they are looking for.
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  // The ставка is written by the завідувач, months after a plan is typed —
  // `SciencePlan.rateHundredths` is only a snapshot taken at save time. While
  // the template is OPEN we re-read the live розподіл every time, whether or
  // not a plan row exists yet, so a розподіл saved in November reaches a plan
  // made in September without the person having to touch their row again.
  // Once the template is CLOSED that live read must stop: the year is frozen
  // history and has to keep showing the number it was decided on, even if a
  // later, unrelated розподіл change would otherwise move it.
  const rateHundredths =
    template.status === 'OPEN'
      ? await rateForPlan(db, { staffId, departmentId, stakeYear: template.stakeYear })
      : (plan?.rateHundredths ?? null);

  if (!plan) {
    return {
      plan: null,
      rows: [],
      records: [],
      deferred: [],
      plannedWorkTypeIds: [],
      target: planTarget({
        minHoursPerRate: template.minHoursPerRate,
        rateHundredths,
        plannedHundredths: 0,
        doneHundredths: 0,
      }),
    };
  }

  const records: SciencePlanRecordDetail[] = plan.records.map((r) => {
    const fields = r.work.workType.evidenceFields as unknown as EvidenceField[];
    const declinedAt = r.work.declinedAt ?? null;
    return {
      id: r.id,
      workId: r.work.id,
      workTypeId: r.work.workTypeId,
      workTypeLabel: r.work.workType.label,
      itemNumber: r.work.workType.itemNumber,
      // `||`, never `??`: `summarizeEvidence` returns an empty STRING for a
      // вид роботи with no evidence fields (a FIXED one — гурток,
      // лабораторія), and `??` let that empty string through, drawing a row
      // with no label at all.
      summary:
        summarizeEvidence(fields, r.work.evidence, undefined, { uaDates: true }) ||
        r.work.workType.label,
      link: r.work.link,
      hoursHundredths: r.hoursHundredths,
      totalHundredths: r.work.totalHundredths,
      planRowId: r.planRowId,
      executedMonth: dateToMonthKey(r.work.executedMonth),
      startedMonth: r.work.startedMonth ? dateToMonthKey(r.work.startedMonth) : null,
      status: r.status,
      removedReason: r.removedReason,
      workDeclined: declinedAt !== null,
      resubmitted: declinedAt === null && (r.work.resubmittedAt ?? null) !== null,
      evidence: r.work.evidence,
      canEdit: r.work.createdById === staffId,
      sharing: r.work.workType.sharing,
      files: r.work.files.map(({ uploadedById, ...file }) => ({
        ...file,
        canChange: r.work.createdById === staffId || uploadedById === staffId,
      })),
      coAuthors: [
        ...r.work.records
          .filter(
            (other) =>
              // Counting, or switched off by the very decline that stopped this
              // work — a person withdrawn earlier is not a co-author.
              other.status === 'APPROVED' ||
              (declinedAt !== null && other.removedAt?.getTime() === declinedAt.getTime())
          )
          .filter((other) => other.staffId !== staffId)
          .map((other) => ({
            staffId: other.staffId,
            name: initials(other.staff),
            hoursHundredths: other.hoursHundredths,
            pending: false,
            deferredTo: null,
          })),
        ...r.work.coauthorShares
          .filter((other) => other.staffId !== staffId)
          .map((other) => ({
            staffId: other.staffId,
            name: initials(other.staff),
            hoursHundredths: other.hoursHundredths,
            pending: true,
            deferredTo: other.academicYear,
          })),
      ],
      authorName: initials(r.work.createdBy),
      ...shareYearChoices(
        template.status === 'OPEN' &&
          r.work.templateId === templateId &&
          r.work.createdById !== staffId &&
          r.status === 'APPROVED',
        {
          academicYear: template.academicYear,
          sharing: r.work.workType.sharing,
          fields,
          evidence: r.work.evidence,
          createdAt: r.work.createdAt,
        }
      ),
    };
  });

  const deferred = await deferredSharesFor(staffId, departmentId, templateId);

  const counted = records.filter((r) => r.status === 'APPROVED');
  const doneHundredths = counted.reduce((sum, r) => sum + r.hoursHundredths, 0);

  // Per ROW, so the «План» tab can mark an intention as fulfilled without
  // nesting the records under it (D29).
  const donePerRow = new Map<string, number>();
  for (const r of counted) {
    if (!r.planRowId) continue;
    donePerRow.set(r.planRowId, (donePerRow.get(r.planRowId) ?? 0) + r.hoursHundredths);
  }

  const plannedHundredths = plan.rows.reduce((sum, r) => sum + r.plannedHundredths, 0);
  return {
    plan: { id: plan.id, lockedAt: plan.lockedAt },
    plannedWorkTypeIds: [...new Set(plan.rows.map((r) => r.workTypeId))],
    rows: plan.rows.map((r) => ({
      id: r.id,
      order: r.order,
      workTypeId: r.workTypeId,
      workTypeLabel: r.workType.label,
      itemNumber: r.workType.itemNumber,
      unitNote: r.workType.unitNote,
      details: r.details,
      plannedHundredths: r.plannedHundredths,
      note: r.note,
      doneHundredths: donePerRow.get(r.id) ?? 0,
    })),
    records,
    deferred,
    target: planTarget({
      minHoursPerRate: template.minHoursPerRate,
      rateHundredths,
      plannedHundredths,
      doneHundredths,
    }),
  };
}

/**
 * This year's works whose share this person moved to a later year. A share
 * hangs off no plan, so it is listed on the plan that would have held its
 * record — the primary кафедра's, or the first one — never on both of a
 * сумісник's plans.
 */
/** Where a co-author may move their share — later, or «already counted» earlier */
function shareYearChoices(
  allowed: boolean,
  window: Parameters<typeof deferralYear>[0]
): { deferrable: string | null; countedEarlier: string | null } {
  if (!allowed) return { deferrable: null, countedEarlier: null };
  return { deferrable: deferralYear(window), countedEarlier: earlierYear(window) };
}

async function deferredSharesFor(
  staffId: string,
  departmentId: string,
  templateId: string
): Promise<DeferredShareDetail[]> {
  const [staff, plans] = await Promise.all([
    db.staff.findUnique({ where: { id: staffId }, select: { departmentId: true } }),
    db.sciencePlan.findMany({
      where: { staffId, templateId },
      select: { departmentId: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const home =
    plans.find((p) => p.departmentId === staff?.departmentId)?.departmentId ??
    plans[0]?.departmentId;
  if (home !== departmentId) return [];

  const shares = await db.scienceCoauthorShare.findMany({
    where: { staffId, academicYear: { not: null }, work: { templateId } },
    select: {
      hoursHundredths: true,
      academicYear: true,
      work: {
        select: {
          id: true,
          link: true,
          evidence: true,
          totalHundredths: true,
          createdBy: { select: { lastName: true, firstName: true, patronymic: true } },
          workType: { select: { label: true, itemNumber: true, evidenceFields: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return shares.map((share) => {
    const fields = share.work.workType.evidenceFields as unknown as EvidenceField[];
    return {
      workId: share.work.id,
      workTypeLabel: share.work.workType.label,
      itemNumber: share.work.workType.itemNumber,
      summary:
        summarizeEvidence(fields, share.work.evidence, undefined, { uaDates: true }) ||
        share.work.workType.label,
      link: share.work.link,
      hoursHundredths: share.hoursHundredths,
      totalHundredths: share.work.totalHundredths,
      academicYear: share.academicYear!,
      authorName: initials(share.work.createdBy),
    };
  });
}
