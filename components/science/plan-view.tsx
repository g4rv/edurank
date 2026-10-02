import { LinkTabs } from '@/components/aurora/ui/link-tabs';
import { EmptyState } from '@/components/aurora/ui/card';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';
import { cn } from '@/lib/utils';
import { summarizeEvidence } from '@/lib/rating/evidence-fields';
import { formatHours } from '@/lib/science/hours';
import { groupByItem } from '@/lib/science/group-by-item';
import type { PlanTarget } from '@/lib/science/target';
import type {
  DeferredShareDetail,
  SciencePlanRecordDetail,
  SciencePlanRowDetail,
} from '@/lib/queries/get-science-plan';
import { AddPlanRowDialog, type PlanWorkType } from '@/components/science/add-plan-row-dialog';
import { AddRecordDialog } from '@/components/science/add-record-dialog';
import { DeletePlanRowButton } from '@/components/science/delete-plan-row-button';
import { RecordList } from '@/components/science/record-list';
import { RecordTabs, type PlanTab } from '@/components/science/record-tabs';
import { PlanHeader } from '@/components/science/plan-header';
import type { CoauthorCandidate } from '@/lib/queries/list-coauthor-candidates';
import { LockPlanButton } from '@/components/science/lock-plan-button';
import { ToolbarGroup, ToolbarRow } from '@/components/staff/record-toolbar';

/**
 * The кафедра switcher, the target band, the two tabs and whichever list the
 * tab names — the whole body of `/science-plan` once the guard clauses in
 * `page.tsx` have passed.
 *
 * Kept a server component: the only interactive pieces are the two dialogs and
 * each row's delete button, all of them client components already — the same
 * split `AchievementsList` / `DeleteActivityButton` uses.
 */
/**
 * The plan's columns: the вид роботи takes the slack, the hours read down.
 * Widths add up (§12): 9 + 9 = 18rem declared plus a 14rem floor for the name
 * = 32rem, and 3rem more for the delete while the plan is open.
 */
const PLAN_COLUMNS = [null, '9rem', '9rem'] as const;
const PLAN_MIN_WIDTH = 'calc(14rem + 9rem + 9rem)';

export function PlanView({
  academicYear,
  lastExecutionMonth,
  orderRef,
  departments,
  currentDepartmentId,
  tab,
  rows,
  records,
  deferred,
  target,
  workTypes,
  lockedAt,
  coauthorCandidates,
}: {
  academicYear: string;
  /** D48 — the year's last month (1–8) for the month pickers. */
  lastExecutionMonth: number;
  orderRef: string | null;
  departments: { id: string; name: string }[];
  currentDepartmentId: string;
  tab: PlanTab;
  rows: SciencePlanRowDetail[];
  records: SciencePlanRecordDetail[];
  /** Shares this person moved to the next навчальний рік. */
  deferred: DeferredShareDetail[];
  target: PlanTarget;
  workTypes: PlanWorkType[];
  /** Submitted — the plan is fixed and recording has opened. */
  lockedAt: Date | null;
  /** Everybody an author may name as a co-author (empty off the «Виконано» tab). */
  coauthorCandidates: CoauthorCandidate[];
}) {
  const workTypeById = new Map(workTypes.map((t) => [t.id, t]));

  // What a record may say it fulfils. Built from the plan rows so the picker
  // can only ever offer this person's own intentions — the server checks it
  // again, because a list is not a permission.
  const locked = lockedAt !== null;

  // План and факт are compared as HOURS, broken down by пункт (owner,
  // 2026-09-17) — no record is tied to a plan line, so the пункт number is what
  // relates the two. APPROVED only: a declined record stops counting at once.
  const doneByItem = new Map<string, number>();
  for (const record of records) {
    if (record.status !== 'APPROVED') continue;
    doneByItem.set(
      record.itemNumber,
      (doneByItem.get(record.itemNumber) ?? 0) + record.hoursHundredths
    );
  }

  const groups = groupByItem(rows);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <PlanHeader academicYear={academicYear} orderRef={orderRef} target={target} locked={locked} />

      {departments.length > 1 && (
        <DepartmentSwitcher
          departments={departments}
          currentDepartmentId={currentDepartmentId}
          tab={tab}
        />
      )}

      {/* The tab bar left, the actions in a bar of their own right — the
          record pages' toolbar (`ToolbarRow` + `ToolbarGroup`), so a button
          keeps its normal size and the strip around it matches the tab bar's
          height (owner, 2026-09-24). */}
      <ToolbarRow>
        <RecordTabs
          active={tab}
          departmentId={currentDepartmentId}
          planCount={rows.length}
          doneCount={records.length}
          doneLocked={!locked}
        />
        <ToolbarGroup>
          {tab === 'plan' ? (
            locked ? (
              // Nothing to press: a submitted plan has no add button and no
              // delete on its rows.
              <p className="px-2 text-sm text-foreground-soft">
                План збережено {lockedAt.toLocaleDateString('uk-UA')}
              </p>
            ) : (
              <>
                <LockPlanButton
                  departmentId={currentDepartmentId}
                  rows={rows.map((row) => ({
                    id: row.id,
                    label: row.note?.trim()
                      ? `${row.workTypeLabel} — ${row.note.trim()}`
                      : row.workTypeLabel,
                    hoursHundredths: row.plannedHundredths,
                  }))}
                  totalHundredths={target.plannedHundredths}
                  targetHundredths={target.targetHundredths}
                  hasRate={target.rateHundredths !== null}
                />
                <AddPlanRowDialog departmentId={currentDepartmentId} workTypes={workTypes} />
              </>
            )
          ) : (
            <AddRecordDialog
              departmentId={currentDepartmentId}
              workTypes={workTypes}
              academicYear={academicYear}
              lastExecutionMonth={lastExecutionMonth}
              coauthorCandidates={coauthorCandidates}
            />
          )}
        </ToolbarGroup>
      </ToolbarRow>

      {tab === 'done' ? (
        <RecordList
          records={records}
          deferred={deferred}
          workTypes={workTypes}
          academicYear={academicYear}
          lastExecutionMonth={lastExecutionMonth}
          coauthorCandidates={coauthorCandidates}
        />
      ) : rows.length === 0 ? (
        <EmptyState>Ще немає запланованих робіт.</EmptyState>
      ) : (
        // Аврора's `Table` (owner, 2026-09-24): the grey пункт rows of «Мій
        // рейтинг», the figures in their own columns so they read DOWN the
        // plan, and a total at the bottom. The hand-drawn list squeezed the
        // пункт name into a sliver beside its figures on a phone; the table
        // scrolls sideways inside its card there instead (`minWidth`).
        <Table
          columns={locked ? PLAN_COLUMNS : [...PLAN_COLUMNS, '3rem']}
          minWidth={locked ? PLAN_MIN_WIDTH : `calc(${PLAN_MIN_WIDTH} + 3rem)`}
          fill
          head={
            <TableRow>
              <TableHead>Вид роботи</TableHead>
              <TableHead align="center">Заплановано</TableHead>
              <TableHead align="center">Виконано</TableHead>
              {!locked && <TableHead />}
            </TableRow>
          }
          footer={
            <TableRow variant="total">
              <TableCell>Разом</TableCell>
              <TableCell numeric align="center">
                {formatHours(target.plannedHundredths)} год
              </TableCell>
              <TableCell numeric align="center">
                {formatHours(target.doneHundredths)} год
              </TableCell>
              {!locked && <TableCell />}
            </TableRow>
          }
        >
          {groups.map((group) => {
            const planned = group.rows.reduce((sum, r) => sum + r.plannedHundredths, 0);
            const done = doneByItem.get(group.itemNumber) ?? 0;
            // The пункт's own heading now that the catalogue carries one —
            // «Рецензування, експертна оцінка, опонування» rather than the
            // full sentence of whichever вид роботи happened to be first.
            const firstType = workTypeById.get(group.rows[0].workTypeId);
            const heading = firstType?.itemTitle || group.rows[0].workTypeLabel;
            return (
              // One <tbody> per пункт, so its heading sticks while its rows
              // scroll (see `Table`, note 5).
              <TableBody key={group.itemNumber}>
                <TableRow variant="group">
                  <TableCell>
                    Пункт {group.itemNumber} · {heading}
                  </TableCell>
                  <TableCell numeric align="center">
                    {formatHours(planned)}
                  </TableCell>
                  {/* План and факт are compared as HOURS per пункт (owner,
                      2026-09-17) — no record is tied to a plan line, so the
                      «done» figure belongs to the пункт, never to one row. */}
                  <TableCell
                    numeric
                    align="center"
                    className={cn(done >= planned && done > 0 && 'text-success')}
                  >
                    {formatHours(done)}
                  </TableCell>
                  {!locked && <TableCell />}
                </TableRow>
                {group.rows.map((row) => {
                  const type = workTypeById.get(row.workTypeId);
                  const summary = summarizeEvidence(type?.fields ?? [], row.details);
                  const detail = type?.shortLabel || row.workTypeLabel;
                  return (
                    <TableRow key={row.id} className="[&>td]:align-middle">
                      <TableCell>
                        {/* `||`, not `??`. A FIXED вид роботи (гурток,
                            лабораторія) declares no evidence fields, so
                            `summarizeEvidence` returns an empty string — and
                            the row then names its вид роботи, even where that
                            repeats the пункт heading: in a table a lone «—»
                            reads as a missing value (owner, 2026-09-24). */}
                        {summary || detail}
                        {row.note && <span className="text-foreground-soft"> — {row.note}</span>}
                      </TableCell>
                      <TableCell numeric align="center">
                        {formatHours(row.plannedHundredths)}
                      </TableCell>
                      <TableCell />
                      {!locked && (
                        <TableCell align="center">
                          <DeletePlanRowButton rowId={row.id} label={row.workTypeLabel} />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            );
          })}
        </Table>
      )}
    </div>
  );
}

/**
 * A tab bar of links, not a dropdown — there are at most two кафедри a person
 * plans on (D6), so this is a choice between two, not a list.
 *
 * **Labelled, and the other кафедра outlined** (owner, 2026-10-02). With no
 * label and a borderless inactive tab, the second кафедра's long name read as
 * plain text beside a blue one — nobody could tell it was the other plan.
 */
function DepartmentSwitcher({
  departments,
  currentDepartmentId,
  tab,
}: {
  departments: { id: string; name: string }[];
  currentDepartmentId: string;
  tab: PlanTab;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-foreground-soft">Оберіть кафедру:</span>
      <LinkTabs
        outlined
        tabs={departments.map((d) => ({
          // The tab is carried across, or switching кафедра from «Виконано»
          // would silently drop somebody back onto «План».
          href: `/science-plan?dept=${d.id}${tab === 'done' ? '&tab=done' : ''}`,
          label: d.name,
          active: d.id === currentDepartmentId,
        }))}
      />
    </div>
  );
}
