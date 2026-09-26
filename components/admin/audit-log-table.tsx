import { EmptyState } from '@/components/aurora/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/aurora/ui/table';
import { cn } from '@/lib/utils';
import { ENTITY_FIELD_LABELS, FIELD_LABELS } from '@/lib/labels';
import { AUDIT_ENTITY_LABELS, describeAudit, type AuditChanges } from '@/lib/audit/describe';

/**
 * One CSS width per column. **`null` is «Зміни»**, the only column whose
 * content has no bound — a diff can be one field or eight.
 *
 * 12 + 11 + 15 + 14rem declared = 52rem, plus an 18rem floor for the diff =
 * 70rem (1120px). That is over the ~1109px a 1366px window leaves, so this one
 * table is allowed to scroll sideways below that: an audit row is a paragraph
 * of evidence, and squeezing the diff to fit would be the wrong trade — §12
 * asks for the widths to add up so nothing is silently cut, not that every
 * table fit every laptop.
 */
const TIME_COLUMN = '12rem';
const ACTION_COLUMN = '11rem';
const OBJECT_COLUMN = '15rem';
const USER_COLUMN = '14rem';
const CHANGES_FLOOR = '18rem';

/** §3's status trio. «delete» is the one the old page never showed. */
const TONE_CLASSES = {
  create: 'bg-success-surface text-success',
  update: 'bg-brand/10 text-brand-strong',
  delete: 'bg-error-surface text-error-strong',
} as const;

export type AuditEntry = {
  id: string;
  createdAt: Date;
  action: string;
  entity: string;
  entityId: string;
  label: string | null;
  changes: unknown;
  user: { email: string } | null;
};

/**
 * «Журнал аудиту» — every mutation in the app, newest first.
 *
 * The badge says what the entry DID, not which column moved: see
 * `describeAudit`, which is where «Архівовано» stops being «Оновлено».
 */
export function AuditLogTable({
  entries,
  head,
  footer,
  resolveName,
  resolveValue,
}: {
  entries: AuditEntry[];
  /** Built by the page, which owns the sort links — see `SortHead` */
  head: React.ReactNode;
  /** The pager, pinned under the rows */
  footer?: React.ReactNode;
  /** id → a human name, for the entities that have one */
  resolveName: (entity: string, entityId: string) => string | null;
  /** field + raw value → what a person reads */
  resolveValue: (field: string, value: unknown) => string;
}) {
  if (entries.length === 0) {
    return <EmptyState>Записів не знайдено</EmptyState>;
  }

  return (
    <Table
      columns={[TIME_COLUMN, ACTION_COLUMN, OBJECT_COLUMN, null, USER_COLUMN]}
      minWidth={`calc(${TIME_COLUMN} + ${ACTION_COLUMN} + ${OBJECT_COLUMN} + ${CHANGES_FLOOR} + ${USER_COLUMN})`}
      head={head}
      footer={footer}
      // Neutral: that strip holds a pager, not a grand total.
      footerClassName="bg-card"
      fill
    >
      <TableBody>
        {entries.map((entry) => {
          // An EMPTY object counts as no diff. Some actions log the event
          // without a field change — «знято блокування входу» is one — and
          // `{}` fell through the null check to render an empty cell, which
          // reads as a rendering fault rather than as «nothing changed».
          const raw =
            entry.changes && typeof entry.changes === 'object' && !Array.isArray(entry.changes)
              ? (entry.changes as AuditChanges)
              : null;
          const changes = raw && Object.keys(raw).length > 0 ? raw : null;
          const { label: actionLabel, tone } = describeAudit(entry.entity, entry.action, changes);
          const name = resolveName(entry.entity, entry.entityId) ?? entry.label;

          return (
            <TableRow key={entry.id} hoverable>
              <TableCell className="whitespace-nowrap">
                {entry.createdAt.toLocaleString('uk-UA')}
              </TableCell>

              <TableCell>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                    TONE_CLASSES[tone]
                  )}
                >
                  {actionLabel}
                </span>
              </TableCell>

              <TableCell>
                {/* The entity's Ukrainian name — all twenty-four of them now
                    have one, so the `?? entity` fallback that used to print
                    «ScienceRecord» never fires. */}
                <span className="block font-medium">
                  {AUDIT_ENTITY_LABELS[entry.entity] ?? entry.entity}
                </span>
                {name && <span className="mt-0.5 block text-muted-foreground">{name}</span>}
              </TableCell>

              <TableCell>
                {changes ? (
                  <ChangesDisplay changes={changes} entity={entry.entity} resolve={resolveValue} />
                ) : (
                  // «—» is right for a CREATE or a DELETE, where there is no
                  // before-and-after to show.
                  //
                  // An UPDATE is different: the diff is empty because nothing
                  // was WRITTEN into it, which is not the same as nothing
                  // happening. One such row turned out to share its second with
                  // a ставка of 0,25 on a second кафедра (owner, 2026-09-21).
                  // «Не записано» is what the log actually knows; «Без змін»
                  // would be a claim it cannot make.
                  //
                  // Only history reaches this — `updateStaff` records the
                  // seeded rates now and writes no entry when the diff is
                  // genuinely empty.
                  <span className="text-muted-foreground">
                    {entry.action === 'UPDATE' ? 'Не записано' : '—'}
                  </span>
                )}
              </TableCell>

              <TableCell className="break-all">{entry.user?.email ?? '—'}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * The diff, one field per line.
 *
 * **`text-sm` and ink**, like every other cell — this was `text-xs` on
 * `--muted-foreground` with the arrow at `/50`, which put the evidence the page
 * exists to show in the faintest thing on it. The field NAME is what recedes,
 * because it is the label and the values are the data.
 */
function ChangesDisplay({
  changes,
  entity,
  resolve,
}: {
  changes: AuditChanges;
  entity: string;
  resolve: (field: string, value: unknown) => string;
}) {
  const entries = Object.entries(changes);
  if (entries.length === 0) return null;
  const visible = entries.slice(0, 8);
  const rest = entries.length - 8;

  return (
    <dl className="space-y-0.5">
      {visible.map(([key, { from, to }]) => (
        <div key={key} className="flex flex-wrap items-baseline gap-x-1.5">
          <dt className="text-muted-foreground">
            {ENTITY_FIELD_LABELS[entity]?.[key] ?? FIELD_LABELS[key] ?? key}:
          </dt>
          <dd className="flex items-baseline gap-1.5">
            {from !== null && from !== undefined && <span>{resolve(key, from)}</span>}
            {from !== null && from !== undefined && to !== null && to !== undefined && (
              <span className="text-muted-foreground">→</span>
            )}
            {to !== null && to !== undefined && (
              <span className="font-medium">{resolve(key, to)}</span>
            )}
          </dd>
        </div>
      ))}
      {rest > 0 && <div className="text-muted-foreground">+{rest} полів</div>}
    </dl>
  );
}
