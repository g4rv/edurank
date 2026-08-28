import { describe, expect, it } from 'vitest';
import { diffChanges } from './audit';

// Every mutation in the app writes its audit trail through this one function,
// and for activities discarded before a year close it is the ONLY surviving
// record — closeYear hard-deletes REMOVED rows on purpose. So the shape it
// produces is a contract, not an implementation detail.

describe('diffChanges', () => {
  it('records a changed field as from → to', () => {
    expect(diffChanges({ academicRank: 'DOCENT' }, { academicRank: 'PROFESSOR' })).toEqual({
      academicRank: { from: 'DOCENT', to: 'PROFESSOR' },
    });
  });

  it('omits fields that did not change', () => {
    expect(diffChanges({ a: 1, b: 'same' }, { a: 2, b: 'same' })).toEqual({
      a: { from: 1, to: 2 },
    });
  });

  // updateStaff now skips writing the audit row when the diff is empty, so
  // "no change → {}" is load-bearing behaviour, not a nicety.
  it('returns an empty object when nothing changed', () => {
    expect(diffChanges({ a: 1, b: false, c: null }, { a: 1, b: false, c: null })).toEqual({});
  });

  // The regression this guards: `??` preserves false, `||` would turn it into
  // null and silently corrupt every boolean field in the log.
  it('treats false as a real value, not as empty', () => {
    expect(diffChanges({ isNpp: true }, { isNpp: false })).toEqual({
      isNpp: { from: true, to: false },
    });
    expect(diffChanges({ isNpp: false }, { isNpp: true })).toEqual({
      isNpp: { from: false, to: true },
    });
    expect(diffChanges({ isNpp: false }, { isNpp: false })).toEqual({});
  });

  it('treats 0 and empty string as real values too', () => {
    expect(diffChanges({ wosCitationCount: 5 }, { wosCitationCount: 0 })).toEqual({
      wosCitationCount: { from: 5, to: 0 },
    });
    expect(diffChanges({ phone: '+380' }, { phone: '' })).toEqual({
      phone: { from: '+380', to: '' },
    });
  });

  it('normalises undefined to null so a missing key reads as empty', () => {
    expect(diffChanges({ phone: undefined }, { phone: '+380501112233' })).toEqual({
      phone: { from: null, to: '+380501112233' },
    });
    expect(diffChanges({ phone: null }, { phone: undefined })).toEqual({});
  });

  it('covers keys present on only one side', () => {
    expect(diffChanges({ removed: 'x' }, { added: 'y' })).toEqual({
      removed: { from: 'x', to: null },
      added: { from: null, to: 'y' },
    });
  });

  // The two conventions documented on AuditLog.changes in schema.prisma
  it('CREATE is an empty before: every field reads from null', () => {
    expect(diffChanges({}, { year: 2026, score: 300, status: 'APPROVED' })).toEqual({
      year: { from: null, to: 2026 },
      score: { from: null, to: 300 },
      status: { from: null, to: 'APPROVED' },
    });
  });

  it('DELETE is an empty after: every field reads to null', () => {
    expect(diffChanges({ score: 300, status: 'APPROVED' }, {})).toEqual({
      score: { from: 300, to: null },
      status: { from: 'APPROVED', to: null },
    });
  });

  it('handles two empty sides', () => {
    expect(diffChanges({}, {})).toEqual({});
  });

  it('does not confuse a number with its string form', () => {
    expect(diffChanges({ score: 300 }, { score: '300' as unknown as number })).toEqual({
      score: { from: 300, to: '300' },
    });
  });

  // Dates arrive from two directions — Prisma returns one for every date
  // column, Zod builds one for every date field — and `!==` compares object
  // identity, so an untouched `degreeDefenceDate` reported a change on every
  // single save (2026-08-28).
  describe('dates', () => {
    it('sees no change between two Dates holding the same instant', () => {
      expect(
        diffChanges(
          { degreeDefenceDate: new Date('2019-05-12T00:00:00.000Z') },
          { degreeDefenceDate: new Date('2019-05-12T00:00:00.000Z') }
        )
      ).toEqual({});
    });

    it('records a real date change as ISO strings', () => {
      expect(
        diffChanges(
          { degreeDefenceDate: new Date('2019-05-12T00:00:00.000Z') },
          { degreeDefenceDate: new Date('2021-11-03T00:00:00.000Z') }
        )
      ).toEqual({
        degreeDefenceDate: {
          from: '2019-05-12T00:00:00.000Z',
          to: '2021-11-03T00:00:00.000Z',
        },
      });
    });

    // The half that logged NOTHING before the fix: the before-value was read as
    // null, so clearing a date was null → null and left no trace at all.
    it('records clearing a date', () => {
      expect(
        diffChanges(
          { degreeDefenceDate: new Date('2019-05-12T00:00:00.000Z') },
          {
            degreeDefenceDate: null,
          }
        )
      ).toEqual({
        degreeDefenceDate: { from: '2019-05-12T00:00:00.000Z', to: null },
      });
    });

    it('records setting a date that was empty', () => {
      expect(
        diffChanges(
          { degreeDefenceDate: null },
          { degreeDefenceDate: new Date('2019-05-12T00:00:00.000Z') }
        )
      ).toEqual({
        degreeDefenceDate: { from: null, to: '2019-05-12T00:00:00.000Z' },
      });
    });

    // Callers that already stringify (archiveStaff does) must keep working.
    it('matches a Date against the same instant already stringified', () => {
      expect(
        diffChanges(
          { archivedAt: new Date('2026-08-28T09:00:00.000Z') },
          { archivedAt: '2026-08-28T09:00:00.000Z' }
        )
      ).toEqual({});
    });
  });
});
