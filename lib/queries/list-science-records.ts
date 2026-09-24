import { db } from '@/lib/db';
import { fullStaffName } from '@/lib/staff-name';
import { summarizeEvidence, type EvidenceField } from '@/lib/rating/evidence-fields';
import { PLAN_PAGE_SIZE } from '@/lib/science/list-params';
import { dateToMonthKey } from '@/lib/science/execution-month';
import type { ScienceRecordStatus } from '@/lib/generated/prisma/client';

export interface ScienceRecordFeedRow {
  id: string;
  staffId: string;
  staffName: string;
  departmentName: string;
  workId: string;
  workTypeLabel: string;
  itemNumber: string;
  summary: string;
  link: string | null;
  /** This person's own draw. */
  hoursHundredths: number;
  /** The whole work's pool — differs the moment it is shared. */
  totalHundredths: number;
  /**
   * D41/D48 — the month the work was done, `"YYYY-MM"`, within its
   * навчальний рік. An article's PUBLICATION date is a separate evidence field,
   * shown in the summary — that is what ННВ compares with the linked page.
   */
  executedMonth: string;
  /** The start of a several-month work, or null. */
  startedMonth: string | null;
  /** Each attached file, not a count: ННВ has to be able to OPEN the evidence
   *  it is deciding about, and `fileUrl` already entitles them to. */
  files: { id: string; fileName: string; pageCount: number | null }[];
  /**
   * D28's flag — the reason ННВ has to look twice at a file. A work whose
   * evidence file(s) somebody attached is ALSO drawn on by more than one
   * still-APPROVED record: declining or reading that file is not a decision
   * about one person's claim alone.
   */
  sharedFiles: boolean;
  status: ScienceRecordStatus;
  removedReason: string | null;
  createdAt: Date;
}

export interface ScienceRecordFeedPage {
  rows: ScienceRecordFeedRow[];
  total: number;
  totalPages: number;
}

/**
 * The post-check feed ННВ (or ADMIN) reads on `/moderation` — every
 * ScienceRecord university-wide, newest first, D20's post-check rather than a
 * gate. Paged at `PLAN_PAGE_SIZE`, the same fifty the plan lists use: there is
 * no reason a post-check screen should hold more DOM at once than any other
 * list in the app already caps at.
 *
 * **No year or кафедра scope, unlike the plan lists.** A decline is a property
 * of the RECORD itself (D20), and ННВ's oversight is university-wide by
 * наказ — narrowing this to one рік or one кафедра would be a filter nobody
 * asked for, not a correctness rule.
 */
export async function listScienceRecords(page: number): Promise<ScienceRecordFeedPage> {
  const pageSize = PLAN_PAGE_SIZE;
  const safePage = Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1;

  const [total, records] = await Promise.all([
    db.scienceRecord.count(),
    db.scienceRecord.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        hoursHundredths: true,
        status: true,
        removedReason: true,
        createdAt: true,
        staff: { select: { id: true, lastName: true, firstName: true, patronymic: true } },
        plan: { select: { department: { select: { name: true } } } },
        work: {
          select: {
            id: true,
            link: true,
            evidence: true,
            executedMonth: true,
            startedMonth: true,
            totalHundredths: true,
            workType: { select: { label: true, itemNumber: true, evidenceFields: true } },
            files: { select: { id: true, fileName: true, pageCount: true } },
            // D28 — every still-APPROVED draw on the same work, to tell a file
            // used by one person from one shared by several.
            records: { where: { status: 'APPROVED' }, select: { id: true } },
          },
        },
      },
    }),
  ]);

  const rows: ScienceRecordFeedRow[] = records.map((r) => {
    const fields = r.work.workType.evidenceFields as unknown as EvidenceField[];
    return {
      id: r.id,
      staffId: r.staff.id,
      staffName: fullStaffName(r.staff),
      departmentName: r.plan.department.name,
      workId: r.work.id,
      workTypeLabel: r.work.workType.label,
      itemNumber: r.work.workType.itemNumber,
      summary:
        summarizeEvidence(fields, r.work.evidence, undefined, { uaDates: true }) ||
        r.work.workType.label,
      link: r.work.link,
      hoursHundredths: r.hoursHundredths,
      totalHundredths: r.work.totalHundredths,
      executedMonth: dateToMonthKey(r.work.executedMonth),
      startedMonth: r.work.startedMonth ? dateToMonthKey(r.work.startedMonth) : null,
      files: r.work.files,
      sharedFiles: r.work.files.length > 0 && r.work.records.length > 1,
      status: r.status,
      removedReason: r.removedReason,
      createdAt: r.createdAt,
    };
  });

  return { rows, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
