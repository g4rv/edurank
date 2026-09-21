'use client';

import { CopyButton } from '@/components/ui/copy-button';
import { RowLinkCell } from '@/components/ui/row-link-cell';
import { cn } from '@/lib/utils';
import { ACADEMIC_RANK_LABELS, ROLE_LABELS, SCIENTIFIC_DEGREE_LABELS } from '@/lib/labels';
import { EmptyState } from '@/components/aurora/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/aurora/ui/table';
import type { StaffListItem } from '@/lib/queries/list-staff';
import { formatStakeValue } from '@/lib/stake/units';

function fullName(s: Pick<TableStaffItem, 'lastName' | 'firstName' | 'patronymic'>) {
  return `${s.lastName} ${s.firstName} ${s.patronymic}`;
}

/**
 * One CSS width per column, in the order they are rendered.
 *
 * **`null` is the кафедра**, which absorbs whatever the window has left. It
 * used to be the name, and on a 1920 screen that gave ПІБ 675px to draw a
 * 30-character word while «Кафедра педагогіки, теорії і методики початкової
 * освіти» wrapped to two lines in 272 (owner, 2026-09-21). The slack belongs to
 * the longest text on the row, and кафедра names here run past fifty
 * characters.
 *
 * The name is a declared width now, at roughly half what it was taking: enough
 * for «Артюшенко Андрій Олександрович» and its badge, and no more.
 *
 * Every width is an even number of pixels — §4 of `docs/aurora.md`.
 */
const NAME_COLUMN = '24rem'; // 384px — a long ПІБ plus its НПП badge
const EMAIL_COLUMN = '21rem'; // 336px — every real @uhsp.edu.ua address, unwrapped
const RANK_COLUMN = '10rem';
const ROLE_COLUMN = '9rem';
const STAKE_COLUMN = '6rem'; // «СТАВКА» is what sets this, not «0,00»

/**
 * The narrowest the кафедра column may get before the card scrolls sideways.
 *
 * It is the `null` column, so `table-layout: fixed` hands it what is LEFT — and
 * once the declared widths alone exceed the card, «what is left» is zero and
 * its text paints over the column beside it. `minWidth` on the `Table` is what
 * stops that; this is the floor it is built from.
 */
const DEPARTMENT_FLOOR = '16rem';

const MIN_WIDTH = {
  admin: `calc(${NAME_COLUMN} + ${EMAIL_COLUMN} + ${DEPARTMENT_FLOOR} + ${RANK_COLUMN} + ${ROLE_COLUMN} + ${STAKE_COLUMN})`,
  editor: `calc(${NAME_COLUMN} + ${EMAIL_COLUMN} + ${DEPARTMENT_FLOOR} + ${RANK_COLUMN})`,
} as const;

type TableStaffItem = Omit<StaffListItem, 'employmentRate'> & { employmentRate?: number | null };

type Props = {
  staff: TableStaffItem[];
  /** Built by the page, which owns the sort links — see `SortHead` */
  head: React.ReactNode;
  isAdmin?: boolean;
  /** Pinned under the rows: the pager, so the card is the whole list screen */
  footer?: React.ReactNode;
  /** Scroll rows inside the card instead of growing the page — see Table */
  fill?: boolean;
};

export function StaffTable({ staff, head, isAdmin, footer, fill }: Props) {
  const columns = isAdmin
    ? [NAME_COLUMN, EMAIL_COLUMN, null, RANK_COLUMN, ROLE_COLUMN, STAKE_COLUMN]
    : [NAME_COLUMN, EMAIL_COLUMN, null, RANK_COLUMN];

  if (staff.length === 0) {
    return <EmptyState>Записів не знайдено</EmptyState>;
  }

  return (
    <Table
      columns={columns}
      minWidth={isAdmin ? MIN_WIDTH.admin : MIN_WIDTH.editor}
      head={head}
      footer={footer}
      // Neutral, not the default `bg-brand/10`: that tint is for a grand total,
      // the number a page exists to show. This strip holds a pager.
      footerClassName="bg-card"
      fill={fill}
    >
      <TableBody>
        {staff.map((member) => {
          // Both кафедри on their own LINE (owner, 2026-09-21). They used to run
          // along one with a «+» between them, which reads as an afterthought
          // stuck onto the first name rather than as a second post — and at 31
          // кафедри whose names average forty characters, the pair wrapped
          // anyway, so the «+» ended up in the middle of a paragraph.
          //
          // A person with NO primary кафедра shows the сумісництво line ALONE.
          // The «—» that stood in for the missing one said «this record is
          // unfinished», and it is not: a null `departmentId` IS the сумісник
          // marker, so the empty half is the fact rather than a gap in it.
          const primary = member.department?.name ?? member.division?.name ?? null;
          const partTime = member.partTimeDepartments.map((pd) => pd.department.name);

          return (
            // **Every cell on the row's own centre line.** `Table` aligns to
            // the top by default, which is right where a cell is a label with a
            // summary under it; here the tall cells are кафедра and звання, and
            // the short ones — name, роль, ставка — were left sitting at the
            // top of a row those two had made 60px high (owner, 2026-09-21).
            // Two columns were middle-aligned and the rest were not, so the row
            // read as two rows that did not quite agree.
            <TableRow key={member.id} className="[&>td]:align-middle" hoverable>
              <RowLinkCell
                href={`/staff/${member.id}`}
                className="py-2.5"
                // In `after`, so the row-hover underline stops running beneath
                // them: a badge is not a second place the link goes.
                after={
                  <>
                    {/* Was its own «Тип» column, which spent 64px to print the
                        same three letters down every row (owner, 2026-09-21).
                        On the name it is an attribute of the person, which is
                        what it always was. */}
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        member.isNpp
                          ? 'bg-brand/10 text-brand-strong'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {member.isNpp ? 'НПП' : 'Адм.'}
                    </span>
                    {/* Only ever shown in the archive view, where every row
                        carries it — but the name is where a reader looks first,
                        and «архів» is the one thing that changes how the rest
                        of the row reads. */}
                    {member.archivedAt && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Архів
                      </span>
                    )}
                  </>
                }
              >
                {fullName(member)}
              </RowLinkCell>

              <TableCell>
                {/* `items-center`, not `items-start`. The copy button is taller
                    than the line it sits beside, so top-aligned the two shared
                    an upper edge and the icon rode above the address (owner,
                    2026-09-21) — the eye lines up centres, not tops.

                    Ink, like every other cell: §4 of `docs/aurora.md` gives
                    `--muted-foreground` to meta that is glanced at, and an
                    address is data somebody reads and copies. */}
                <span className="inline-flex items-center gap-0.5">
                  <span className="break-all">{member.email}</span>
                  <CopyButton value={member.email} what="email" />
                </span>
              </TableCell>

              <TableCell>
                {/* **Both lines are the same size**, and that is the point
                    (owner, 2026-09-21). The сумісництво line was `text-xs`,
                    which says «this one matters less» — it does not: it is a
                    second post the person actually holds, on a кафедра that
                    actually pays them. What separates the two is COLOUR, which
                    says what each one is, not size, which would rank them.

                    Amber, like the «Сумісник» pill and for the same reason:
                    that post is paid out of a second кафедра's pool and does
                    not count toward this one's Кнпп. */}
                <div className="flex flex-col gap-0.5 font-medium *:not-last:after:content-[',']">
                  {primary && <span>{primary}</span>}
                  {partTime.map((name) => (
                    <span key={name} className="text-warning">
                      {name}
                    </span>
                  ))}
                  {!primary && partTime.length === 0 && (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </TableCell>

              <TableCell>
                {/* Звання over ступінь, not «Доцент, Кандидат наук» on one
                    line: they are two different facts about a person and the
                    comma made them read as one long title.

                    **Two lines, one size.** The ступінь was `text-xs` and the
                    звання above it `text-sm`, which drew a hierarchy that does
                    not exist — «Доцент» does not outrank «Кандидат наук», they
                    answer different questions. §4 of `docs/aurora.md`: a table
                    cell is a value, and values are ink at `text-sm`. */}
                <div className="flex flex-col gap-0.5">
                  {member.academicRank ? (
                    <span>{ACADEMIC_RANK_LABELS[member.academicRank]}</span>
                  ) : null}
                  {member.scientificDegree ? (
                    <span>{SCIENTIFIC_DEGREE_LABELS[member.scientificDegree]}</span>
                  ) : null}
                  {!member.academicRank && !member.scientificDegree && (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </TableCell>

              {isAdmin && (
                <TableCell align="center">
                  <div className="flex flex-col items-center gap-1">
                    <span>{member.role ? ROLE_LABELS[member.role] : '—'}</span>
                    {member.isActivated === false && (
                      <span className="inline-flex items-center rounded-full bg-warning-surface px-2 py-0.5 text-xs font-medium text-warning">
                        Не активований
                      </span>
                    )}
                  </div>
                </TableCell>
              )}

              {isAdmin && (
                // `px-2`, so four characters and a two-word heading fit a
                // column narrow enough to be worth narrowing.
                <TableCell align="center" numeric className="px-2">
                  {/* «—» like every other empty cell. An amber pill here fires
                      on every staff member without a ставка, which is most of
                      them — at that density it reads as decoration, not as a
                      warning. */}
                  {'employmentRate' in member && member.employmentRate != null
                    ? formatStakeValue(member.employmentRate)
                    : '—'}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
