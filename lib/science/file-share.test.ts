import { describe, expect, it, vi } from 'vitest';
import { dropOrphanFiles, fileShareProblem, type LinkedWork } from './file-share';

const linked = (over: Partial<LinkedWork> = {}): LinkedWork => ({
  createdById: 'colleague',
  workTypeId: 'paper',
  sharedFile: true,
  ...over,
});

const ask = (over: Partial<Parameters<typeof fileShareProblem>[0]> = {}) =>
  fileShareProblem({
    targetSharedFile: true,
    targetWorkTypeId: 'paper',
    authorId: 'me',
    linked: [linked()],
    ...over,
  });

describe('fileShareProblem — may THIS person connect to a file that already exists?', () => {
  it('lets a colleague connect to a conference programme another colleague stored', () => {
    expect(ask()).toBeNull();
  });

  it('lets a third colleague too — the file may have many works', () => {
    expect(ask({ linked: [linked(), linked({ createdById: 'third' })] })).toBeNull();
  });

  it('refuses for a вид роботи whose file is not shared (D28, as always)', () => {
    expect(ask({ targetSharedFile: false })).toBe('NOT_SHARED');
  });

  it('refuses a file that belongs to a вид роботи which is not shared — a certificate', () => {
    // Otherwise a conference record could borrow somebody's personal сертифікат.
    expect(ask({ linked: [linked({ sharedFile: false, workTypeId: 'article' })] })).toBe(
      'NOT_SHARABLE'
    );
  });

  it('refuses if ANY of the file’s works is not shared', () => {
    expect(ask({ linked: [linked(), linked({ sharedFile: false })] })).toBe('NOT_SHARABLE');
  });

  it('refuses the SAME person a second work of the same вид on one file', () => {
    // The case D28 exists for: «the same сертифікат on five конференції».
    expect(ask({ linked: [linked({ createdById: 'me' })] })).toBe('SAME_PERSON');
  });

  it('lets one person use one programme for a report AND for attending', () => {
    expect(
      ask({
        targetWorkTypeId: 'attendance',
        linked: [linked({ createdById: 'me', workTypeId: 'paper' })],
      })
    ).toBeNull();
  });

  it('refuses a file with no works at all — nothing to share, it is an orphan', () => {
    expect(ask({ linked: [] })).toBe('NOT_SHARABLE');
  });
});

describe('dropOrphanFiles — a file goes only when NO work holds it', () => {
  const makeTx = (orphans: { id: string; objectKey: string }[]) => {
    const findMany = vi.fn().mockResolvedValue(orphans);
    const deleteMany = vi.fn().mockResolvedValue({ count: orphans.length });
    return { tx: { scienceRecordFile: { findMany, deleteMany } } as never, findMany, deleteMany };
  };

  it('asks only for candidates that have no work left, and deletes exactly those', async () => {
    const { tx, findMany, deleteMany } = makeTx([{ id: 'f1', objectKey: 'evidence/a.pdf' }]);
    const keys = await dropOrphanFiles(tx, ['f1', 'f2']);
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: ['f1', 'f2'] }, works: { none: {} } },
      select: { id: true, objectKey: true },
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['f1'] } } });
    // f2 is still held by another work: not listed, not deleted, no object to drop.
    expect(keys).toEqual(['evidence/a.pdf']);
  });

  it('deletes nothing and returns no keys while every file is still shared', async () => {
    const { tx, deleteMany } = makeTx([]);
    expect(await dropOrphanFiles(tx, ['f1'])).toEqual([]);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('does not even query when there is nothing to check', async () => {
    const { tx, findMany } = makeTx([]);
    expect(await dropOrphanFiles(tx, [])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
