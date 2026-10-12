import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));

import { isEditorWritableField } from '@/lib/permissions';
import {
  ALLOWED_FIELD_NAMES,
  ENTITY_ACTIONS,
  ENTITY_ROWS,
  FIELD_GROUPS,
  entityKey,
} from './field-grants';

describe('field grants', () => {
  it('shows only fields the server will accept', () => {
    // A checkbox the server then refuses would make the whole Save fail.
    for (const group of FIELD_GROUPS) {
      for (const field of group.fields) {
        expect(ALLOWED_FIELD_NAMES.has(field), field).toBe(true);
        expect(isEditorWritableField(field), field).toBe(true);
      }
    }
  });

  it('never allows a confidential, account or scoping field', () => {
    for (const name of ['employmentRate', 'divisionId', 'passwordHash', 'role', 'tokenVersion']) {
      expect(ALLOWED_FIELD_NAMES.has(name), name).toBe(false);
    }
  });

  it('has no field in two groups', () => {
    const all = FIELD_GROUPS.flatMap((g) => [...g.fields]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keys an entity action', () => {
    expect(entityKey('STAFF', 'CREATE')).toBe('STAFF:CREATE');
    expect(ENTITY_ROWS).toEqual(['STAFF', 'DEPARTMENT', 'FACULTY']);
    expect(ENTITY_ACTIONS).toEqual(['CREATE', 'UPDATE', 'DELETE']);
  });
});
