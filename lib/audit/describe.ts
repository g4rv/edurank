/**
 * What an audit entry actually SAYS — the Ukrainian name of the thing it
 * touched, and what was really done to it.
 *
 * Two faults this exists to fix, both reported by the owner on 2026-09-21.
 *
 * ## 1. Sixteen entities had no Ukrainian name
 *
 * `/admin/audit-log` labelled eight entities and fell back to
 * `?? log.entity` for the rest, so «ScienceRecord», «StakeDistribution» and
 * fourteen others printed their English class name in a Ukrainian interface.
 * They were missing from the entity FILTER for the same reason, so there was no
 * way to ask for them either.
 *
 * The list is every `entity:` literal written by an `auditLog.create` call —
 * kept here rather than in the page so one place answers «what can be logged»
 * for both the label and the filter.
 *
 * ## 2. «Оновлено» on things that were deletions
 *
 * Archiving a person, discarding an achievement, declining a наукова робота
 * and rejecting a student claim are all `UPDATE` in the database, because each
 * one writes a column rather than removing a row — and the app is right to
 * store them that way. `CLAUDE.md`: «A person is never deleted — they are
 * archived», and a discarded activity keeps its row so the reason survives.
 *
 * But the READER does not care which column moved. Archiving is how a person
 * leaves the app, and «Оновлено» over it is the log describing its own
 * implementation instead of the event. `describeAudit` reads the diff and
 * names what happened.
 *
 * **For everything but archiving it refines the display only.** Nothing stored
 * is rewritten, so history already in the table is described correctly the
 * moment this ships, and `where: { action }` still filters on what is indexed.
 *
 * Archiving is the exception, and it had to be: the display could call it
 * «Архівовано» in red all it liked while `where: { action: 'DELETE' }` went on
 * missing it, so asking the log for deletions returned everything except the
 * one that matters most. `archiveStaff` writes `DELETE` now and `restoreStaff`
 * writes `CREATE`. This still reads the older `UPDATE` rows — the diff is
 * identical either way — so no migration is needed.
 */

/** Every entity an `auditLog.create` call names, with its Ukrainian label. */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  Activity: 'Досягнення',
  ActivityType: 'Показник рейтингу',
  AdmittedStudent: 'Здобувач (реєстр)',
  Department: 'Кафедра',
  DepartmentStake: 'Ставки кафедри',
  Division: 'Відділ',
  Faculty: 'Факультет',
  KharakterystykaEntry: 'Запис характеристики',
  RatingTemplate: 'Рейтинговий рік',
  SciencePlan: 'План наукової роботи',
  SciencePlanRow: 'Рядок плану науки',
  SciencePlanTemplate: 'Рік планування науки',
  ScienceRecord: 'Виконана наукова робота',
  ScienceRecordFile: 'Файл наукової роботи',
  ScienceWork: 'Наукова робота',
  ScienceWorkType: 'Вид наукової роботи',
  SpecialityDepartment: 'Спеціальність кафедри',
  SpecialityNorm: 'Норматив спеціальності',
  Staff: 'Персонал',
  StaffStakeLimits: 'Межі ставки НПП',
  StakeDistribution: 'Розподіл ставок',
  StakeStatusBonus: 'Бонус за посаду',
  StakeYearSettings: 'Налаштування ставок року',
  StudentClaim: 'Заявка на здобувача',
};

/**
 * The filter's options, ordered by their Ukrainian label rather than by the
 * English class name — «Відділ» belongs beside «Досягнення», not under D.
 */
export const AUDIT_ENTITIES = Object.keys(AUDIT_ENTITY_LABELS).sort((a, b) =>
  AUDIT_ENTITY_LABELS[a]!.localeCompare(AUDIT_ENTITY_LABELS[b]!, 'uk')
);

export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * How the badge is painted. Three, matching §3's status trio — and «delete» is
 * the one that matters here, because it is what an archive or a discard was
 * being denied.
 */
export type AuditTone = 'create' | 'update' | 'delete';

export const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Створено',
  UPDATE: 'Оновлено',
  DELETE: 'Видалено',
};

type ChangeEntry = { from?: unknown; to?: unknown };
export type AuditChanges = Record<string, ChangeEntry>;

const moved = (c: AuditChanges, field: string, from: unknown, to: unknown) =>
  c[field] !== undefined && c[field]!.from === from && c[field]!.to === to;

const became = (c: AuditChanges, field: string, to: unknown) =>
  c[field] !== undefined && c[field]!.to === to;

const set = (c: AuditChanges, field: string) =>
  c[field] !== undefined && c[field]!.from === null && c[field]!.to !== null;

const cleared = (c: AuditChanges, field: string) =>
  c[field] !== undefined && c[field]!.from !== null && c[field]!.to === null;

/**
 * The event, as a reader would describe it.
 *
 * Only `UPDATE` is ever refined: a `CREATE` and a `DELETE` already say what
 * they did. The rules are matched in order and the first one wins, so the
 * specific cases sit above the general ones.
 */
export function describeAudit(
  entity: string,
  action: string,
  changes: AuditChanges | null
): { label: string; tone: AuditTone } {
  const c = changes ?? {};

  // **Archiving is read first, under whatever action it was stored with.**
  // Since 2026-09-21 `archiveStaff` writes `DELETE` and `restoreStaff` writes
  // `CREATE`, so the log's action FILTER finds them — «Видалено» used to return
  // every deletion in the app except the one that matters most. Entries written
  // before that say `UPDATE`, and this reads both: the diff is the same either
  // way, so history needs no migration.
  if (entity === 'Staff') {
    if (set(c, 'archivedAt')) return { label: 'Архівовано', tone: 'delete' };
    if (cleared(c, 'archivedAt')) return { label: 'Відновлено', tone: 'create' };
  }

  if (action === 'CREATE') return { label: ACTION_LABELS.CREATE!, tone: 'create' };
  if (action === 'DELETE') return { label: ACTION_LABELS.DELETE!, tone: 'delete' };
  if (action !== 'UPDATE') return { label: action, tone: 'update' };

  if (entity === 'Staff') {
    // `'***'` is the placeholder the actions write instead of a hash — the log
    // must never carry the real one.
    if (moved(c, 'passwordHash', '***', null)) {
      return { label: 'Скинуто пароль', tone: 'delete' };
    }
    if (moved(c, 'passwordHash', null, '***')) {
      return { label: 'Встановлено пароль', tone: 'create' };
    }
    if (c.role) return { label: 'Змінено роль', tone: 'update' };
  }

  // Post-moderation. A discarded achievement and a declined наукова робота keep
  // their rows so the reason survives — but what happened is a removal.
  if (became(c, 'status', 'REMOVED')) return { label: 'Відхилено', tone: 'delete' };
  if (became(c, 'status', 'REJECTED')) return { label: 'Відхилено', tone: 'delete' };
  if (became(c, 'status', 'CONFIRMED')) return { label: 'Підтверджено', tone: 'create' };
  if (became(c, 'status', 'APPROVED')) return { label: 'Зараховано', tone: 'create' };

  // An indicator switched off scores nothing from that moment — see `COUNTED`
  // in `lib/rating/recompute.ts`. That is a withdrawal, not an edit.
  if (moved(c, 'isActive', true, false)) return { label: 'Вимкнено', tone: 'delete' };
  if (moved(c, 'isActive', false, true)) return { label: 'Увімкнено', tone: 'create' };

  // A rating year closing freezes it; reopening is the appeals path.
  if (entity === 'RatingTemplate') {
    if (became(c, 'status', 'CLOSED')) return { label: 'Рік закрито', tone: 'delete' };
    if (became(c, 'status', 'ACTIVE') && c.status!.from === 'CLOSED') {
      return { label: 'Рік відкрито', tone: 'create' };
    }
  }

  if (became(c, 'verified', true)) return { label: 'Перевірено', tone: 'create' };
  if (became(c, 'verified', false)) return { label: 'Знято перевірку', tone: 'delete' };

  /**
   * An UPDATE with an empty diff means the change was NOT RECORDED — not that
   * nothing changed.
   *
   * This was briefly labelled «Збережено без змін», and that was a false claim
   * (2026-09-21). The row that prompted it turned out to sit on the same second
   * as a `StakeAllocation` of 0,25 on a second кафедра: something real was
   * created and the diff simply did not carry it, because `seedAllocations`
   * wrote no changes of its own and `partTimeDepartmentIds` is only diffed for
   * somebody allowed to write it.
   *
   * So the badge stays «Оновлено» and the blank is explained in the diff column
   * instead — see `audit-log-table.tsx`. An audit log may say «I do not know»;
   * it may not say «nothing happened» when something did.
   *
   * New entries no longer reach this: `updateStaff` records the seeded rates
   * and returns before logging when the diff really is empty.
   */
  return { label: ACTION_LABELS.UPDATE!, tone: 'update' };
}
