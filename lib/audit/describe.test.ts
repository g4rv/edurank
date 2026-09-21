import { describe, expect, it } from 'vitest';
import { AUDIT_ENTITIES, AUDIT_ENTITY_LABELS, describeAudit, type AuditChanges } from './describe';

const change = (field: string, from: unknown, to: unknown): AuditChanges => ({
  [field]: { from, to },
});

describe('AUDIT_ENTITY_LABELS', () => {
  // The fault this module exists for: sixteen of the twenty-four entities the
  // app logs had no Ukrainian name and printed their English class name.
  it('names every entity an auditLog.create call writes', () => {
    const written = [
      'Activity',
      'ActivityType',
      'AdmittedStudent',
      'Department',
      'DepartmentStake',
      'Division',
      'Faculty',
      'KharakterystykaEntry',
      'RatingTemplate',
      'SciencePlan',
      'SciencePlanRow',
      'SciencePlanTemplate',
      'ScienceRecord',
      'ScienceRecordFile',
      'ScienceWork',
      'ScienceWorkType',
      'SpecialityDepartment',
      'SpecialityNorm',
      'Staff',
      'StaffStakeLimits',
      'StakeDistribution',
      'StakeStatusBonus',
      'StakeYearSettings',
      'StudentClaim',
    ];
    for (const entity of written) {
      expect(AUDIT_ENTITY_LABELS[entity], entity).toBeTruthy();
    }
  });

  it('carries no English label through', () => {
    for (const [entity, label] of Object.entries(AUDIT_ENTITY_LABELS)) {
      expect(label, entity).not.toBe(entity);
      expect(label, entity).toMatch(/[а-яіїєґА-ЯІЇЄҐ]/);
    }
  });

  it('offers the filter its options in Ukrainian alphabetical order', () => {
    const labels = AUDIT_ENTITIES.map((e) => AUDIT_ENTITY_LABELS[e]!);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'uk')));
    expect(AUDIT_ENTITIES).toHaveLength(Object.keys(AUDIT_ENTITY_LABELS).length);
  });
});

describe('describeAudit', () => {
  it('leaves a create and a delete alone — they already say what they did', () => {
    expect(describeAudit('Staff', 'CREATE', null)).toEqual({ label: 'Створено', tone: 'create' });
    expect(describeAudit('Faculty', 'DELETE', null)).toEqual({ label: 'Видалено', tone: 'delete' });
  });

  it('falls back to «Оновлено» for an edit that is only an edit', () => {
    expect(describeAudit('Staff', 'UPDATE', change('email', 'a@b.c', 'd@e.f'))).toEqual({
      label: 'Оновлено',
      tone: 'update',
    });
  });

  // An empty diff means the change was not RECORDED, not that none happened —
  // the row that prompted this shared its second with a 0,25 ставка on a second
  // кафедра. The log may say «I do not know»; it may not say «nothing».
  it('does not claim «no changes» when the diff is merely empty', () => {
    expect(describeAudit('Staff', 'UPDATE', {})).toEqual({ label: 'Оновлено', tone: 'update' });
    expect(describeAudit('Staff', 'UPDATE', null)).toEqual({ label: 'Оновлено', tone: 'update' });
  });

  // «A person is never deleted — they are archived» (CLAUDE.md). Archiving IS
  // the deletion, and the log called it «Оновлено».
  it('calls archiving a deletion, and restoring a creation', () => {
    expect(
      describeAudit('Staff', 'UPDATE', change('archivedAt', null, '2026-09-21T10:00:00.000Z'))
    ).toEqual({ label: 'Архівовано', tone: 'delete' });

    expect(
      describeAudit('Staff', 'UPDATE', change('archivedAt', '2026-09-21T10:00:00.000Z', null))
    ).toEqual({ label: 'Відновлено', tone: 'create' });
  });

  // Since 2026-09-21 archiving is STORED as a delete so the action filter finds
  // it. Rows written before that say UPDATE, and both must read the same.
  it('reads archiving under either stored action, old rows and new', () => {
    const archived = change('archivedAt', null, '2026-09-21T10:00:00.000Z');
    const restored = change('archivedAt', '2026-09-21T10:00:00.000Z', null);

    for (const stored of ['DELETE', 'UPDATE']) {
      expect(describeAudit('Staff', stored, archived), stored).toEqual({
        label: 'Архівовано',
        tone: 'delete',
      });
    }
    for (const stored of ['CREATE', 'UPDATE']) {
      expect(describeAudit('Staff', stored, restored), stored).toEqual({
        label: 'Відновлено',
        tone: 'create',
      });
    }
  });

  it('leaves a real delete of something else alone', () => {
    expect(describeAudit('Staff', 'DELETE', change('email', 'a@b.c', null))).toEqual({
      label: 'Видалено',
      tone: 'delete',
    });
  });

  it('names a password reset, and never carries a hash', () => {
    expect(describeAudit('Staff', 'UPDATE', change('passwordHash', '***', null))).toEqual({
      label: 'Скинуто пароль',
      tone: 'delete',
    });
    expect(describeAudit('Staff', 'UPDATE', change('passwordHash', null, '***'))).toEqual({
      label: 'Встановлено пароль',
      tone: 'create',
    });
  });

  it('calls a discarded achievement and a declined science record a rejection', () => {
    expect(describeAudit('Activity', 'UPDATE', change('status', 'APPROVED', 'REMOVED'))).toEqual({
      label: 'Відхилено',
      tone: 'delete',
    });
    expect(
      describeAudit('ScienceRecord', 'UPDATE', change('status', 'APPROVED', 'REMOVED'))
    ).toEqual({ label: 'Відхилено', tone: 'delete' });
  });

  it('reads both sides of a student claim decision', () => {
    expect(
      describeAudit('StudentClaim', 'UPDATE', change('status', 'PENDING', 'REJECTED'))
    ).toEqual({ label: 'Відхилено', tone: 'delete' });
    expect(
      describeAudit('StudentClaim', 'UPDATE', change('status', 'PENDING', 'CONFIRMED'))
    ).toEqual({ label: 'Підтверджено', tone: 'create' });
  });

  // Toggling `isActive` off stops an indicator scoring — see COUNTED in
  // lib/rating/recompute.ts. That is a withdrawal, not an edit.
  it('calls deactivating an indicator a withdrawal', () => {
    expect(describeAudit('ActivityType', 'UPDATE', change('isActive', true, false))).toEqual({
      label: 'Вимкнено',
      tone: 'delete',
    });
    expect(describeAudit('ActivityType', 'UPDATE', change('isActive', false, true))).toEqual({
      label: 'Увімкнено',
      tone: 'create',
    });
  });

  it('reads a rating year closing and reopening', () => {
    expect(describeAudit('RatingTemplate', 'UPDATE', change('status', 'ACTIVE', 'CLOSED'))).toEqual(
      { label: 'Рік закрито', tone: 'delete' }
    );
    expect(describeAudit('RatingTemplate', 'UPDATE', change('status', 'CLOSED', 'ACTIVE'))).toEqual(
      { label: 'Рік відкрито', tone: 'create' }
    );
  });

  it('reads the «Перевірено» flag, which is separate from the score', () => {
    expect(describeAudit('Activity', 'UPDATE', change('verified', false, true))).toEqual({
      label: 'Перевірено',
      tone: 'create',
    });
    expect(describeAudit('Activity', 'UPDATE', change('verified', true, false))).toEqual({
      label: 'Знято перевірку',
      tone: 'delete',
    });
  });

  it('does not mistake an unrelated field that merely mentions a status', () => {
    // `archiveReason` moving on its own is an edit to the reason, not an archive.
    expect(
      describeAudit('Staff', 'UPDATE', change('archiveReason', 'звільнення', 'декрет'))
    ).toEqual({ label: 'Оновлено', tone: 'update' });
  });
});
