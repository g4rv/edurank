import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRESIGN_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
  cancelSaving,
  dropPending,
  hasPending,
  registerPending,
  releaseKey,
  saveWithUploads,
  savePhase,
  type FileUploader,
  type PresignResult,
} from './pending-upload';

const pdf = (name = 'a.pdf') => new File(['x'], name, { type: 'application/pdf' });

function uploader(presign: (f: File) => Promise<PresignResult>) {
  const discard = vi.fn<(objectKey: string) => void>();
  return { presign, discard } satisfies FileUploader;
}

const okPresign = (key: string): Promise<PresignResult> =>
  Promise.resolve({ ok: true, url: `https://r2/${key}`, objectKey: key });

describe('saveWithUploads', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('passes a payload with no waiting file straight through, with no overlay', async () => {
    const send = vi.fn(async () => ({ ok: true }));
    await saveWithUploads({ file: { objectKey: 'real/key', fileName: 'a.pdf' } }, send);
    expect(send).toHaveBeenCalledWith({ file: { objectKey: 'real/key', fileName: 'a.pdf' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads at save time and sends the real key', async () => {
    const up = uploader(() => okPresign('science/2026/abc.pdf'));
    const placeholder = registerPending(pdf(), () => up);
    expect(placeholder.objectKey.startsWith('pending:')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled(); // picking uploads nothing

    const send = vi.fn(async () => ({ ok: true }));
    await saveWithUploads({ other: 1, file: placeholder }, send);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      other: 1,
      file: { objectKey: 'science/2026/abc.pdf', fileName: 'a.pdf' },
    });
    expect(up.discard).not.toHaveBeenCalled();
    expect(savePhase()).toBe('idle');
  });

  it('keeps the other keys when the payload spreads the file itself', async () => {
    const up = uploader(() => okPresign('k/1.pdf'));
    const placeholder = registerPending(pdf(), () => up);
    const send = vi.fn(async () => ({ ok: true }));
    await saveWithUploads({ ...placeholder, workId: 'w1' }, send);
    expect(send).toHaveBeenCalledWith({ objectKey: 'k/1.pdf', fileName: 'a.pdf', workId: 'w1' });
  });

  it('finds files nested in lists, uploading one after another', async () => {
    let n = 0;
    const up = uploader(() => okPresign(`k/${++n}.pdf`));
    const a = registerPending(pdf('a.pdf'), () => up);
    const b = registerPending(pdf('b.pdf'), () => up);
    const send = vi.fn(async () => ({ ok: true }));
    await saveWithUploads({ rows: [{ file: a }, { file: null }, { file: b }] }, send);
    expect(send).toHaveBeenCalledWith({
      rows: [
        { file: { objectKey: 'k/1.pdf', fileName: 'a.pdf' } },
        { file: null },
        { file: { objectKey: 'k/2.pdf', fileName: 'b.pdf' } },
      ],
    });
  });

  it('connects a file the server already holds instead of uploading it', async () => {
    const up = uploader(async () => ({ ok: true, reuse: { fileId: 'f9', fileName: 'prog.pdf' } }));
    const placeholder = registerPending(pdf(), () => up);
    const send = vi.fn(async () => ({ ok: true }));
    await saveWithUploads({ file: placeholder }, send);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({ file: { existingFileId: 'f9', fileName: 'prog.pdf' } });
  });

  it("returns the server's refusal as the person's message and saves nothing", async () => {
    const up = uploader(async () => ({ error: 'Цей файл уже використано в іншому записі' }));
    const placeholder = registerPending(pdf(), () => up);
    const send = vi.fn(async () => ({ ok: true }));
    const result = await saveWithUploads({ file: placeholder }, send);
    expect(result).toEqual({ error: 'Цей файл уже використано в іншому записі' });
    expect(send).not.toHaveBeenCalled();
  });

  it('deletes what already went up when a later file fails', async () => {
    const up = uploader(async (f) =>
      f.name === 'b.pdf' ? { error: 'Файл зіпсовано' } : okPresign('k/first.pdf')
    );
    const a = registerPending(pdf('a.pdf'), () => up);
    const b = registerPending(pdf('b.pdf'), () => up);
    const send = vi.fn(async () => ({ ok: true }));
    const result = await saveWithUploads({ files: [a, b] }, send);
    expect('error' in result).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(up.discard).toHaveBeenCalledWith('k/first.pdf');
  });

  it('says nothing was saved when the storage refuses the PUT, and cleans up', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    const up = uploader(() => okPresign('k/x.pdf'));
    const placeholder = registerPending(pdf(), () => up);
    const send = vi.fn(async () => ({ ok: true }));
    const result = (await saveWithUploads({ file: placeholder }, send)) as { error: string };
    expect(result.error).toContain('Нічого не збережено');
    expect(result.error).not.toMatch(/403|PUT/); // never a code
    expect(send).not.toHaveBeenCalled();
  });

  it('deletes the uploads when the save itself is refused', async () => {
    const up = uploader(() => okPresign('k/y.pdf'));
    const placeholder = registerPending(pdf(), () => up);
    const result = await saveWithUploads({ file: placeholder }, async () => ({
      error: 'Робота вже існує',
    }));
    expect(result).toEqual({ error: 'Робота вже існує' });
    expect(up.discard).toHaveBeenCalledWith('k/y.pdf');
  });

  it('does not upload the same file again when the form is saved a second time', async () => {
    const up = uploader(() => okPresign('k/once.pdf'));
    const placeholder = registerPending(pdf(), () => up);
    await saveWithUploads({ file: placeholder }, async () => ({ ok: true }));
    const send = vi.fn(async () => ({ ok: true }));
    await saveWithUploads({ file: placeholder }, send);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ file: { objectKey: 'k/once.pdf', fileName: 'a.pdf' } });
  });

  it('uploads again after a FAILED save, because that upload was deleted', async () => {
    let n = 0;
    const up = uploader(() => okPresign('k/try' + ++n + '.pdf'));
    const placeholder = registerPending(pdf(), () => up);
    await saveWithUploads({ file: placeholder }, async () => ({ error: 'x' }));
    expect(up.discard).toHaveBeenCalledWith('k/try1.pdf');
    const send = vi.fn(async () => ({ ok: true }));
    await saveWithUploads({ file: placeholder }, send);
    expect(send).toHaveBeenCalledWith({ file: { objectKey: 'k/try2.pdf', fileName: 'a.pdf' } });
  });

  it('keeps the uploads when the save succeeds', async () => {
    const up = uploader(() => okPresign('k/z.pdf'));
    const placeholder = registerPending(pdf(), () => up);
    await saveWithUploads({ file: placeholder }, async () => ({ ok: true }));
    expect(up.discard).not.toHaveBeenCalled();
  });

  it('deletes the uploads and rethrows when the request itself fails', async () => {
    const up = uploader(() => okPresign('k/w.pdf'));
    const placeholder = registerPending(pdf(), () => up);
    await expect(
      saveWithUploads({ file: placeholder }, async () => {
        throw new Error('network');
      })
    ).rejects.toThrow('network');
    expect(up.discard).toHaveBeenCalledWith('k/w.pdf');
    expect(savePhase()).toBe('idle');
  });

  it('gives up on a server that never answers', async () => {
    vi.useFakeTimers();
    const up = uploader(() => new Promise<PresignResult>(() => {}));
    const placeholder = registerPending(pdf(), () => up);
    const send = vi.fn(async () => ({ ok: true }));
    const pending = saveWithUploads({ file: placeholder }, send);
    await vi.advanceTimersByTimeAsync(PRESIGN_TIMEOUT_MS + 1);
    const result = (await pending) as { error: string };
    expect(result.error).toContain('надто довго');
    expect(send).not.toHaveBeenCalled();
    expect(savePhase()).toBe('idle');
  });

  it('aborts an upload that hangs', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
        })
    );
    const up = uploader(() => okPresign('k/slow.pdf'));
    const placeholder = registerPending(pdf(), () => up);
    const pending = saveWithUploads({ file: placeholder }, async () => ({ ok: true }));
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS + 1);
    const result = (await pending) as { error: string };
    expect(result.error).toContain('надто довго');
  });

  it('stops on Cancel and saves nothing', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
        })
    );
    const up = uploader(() => okPresign('k/c.pdf'));
    const placeholder = registerPending(pdf(), () => up);
    const send = vi.fn(async () => ({ ok: true }));
    const pending = saveWithUploads({ file: placeholder }, send);
    await vi.waitFor(() => expect(savePhase()).toBe('uploading'));
    await Promise.resolve();
    cancelSaving();
    const result = (await pending) as { error: string };
    expect(result.error).toContain('скасовано');
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a placeholder whose file was forgotten', async () => {
    const up = uploader(() => okPresign('k/q.pdf'));
    const placeholder = registerPending(pdf(), () => up);
    dropPending(placeholder.objectKey);
    const send = vi.fn(async () => ({ ok: true }));
    const result = (await saveWithUploads({ file: placeholder }, send)) as { error: string };
    expect(result.error).toContain('оберіть його ще раз');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('placeholders', () => {
  it('are found anywhere in a payload, and only there', () => {
    const up = uploader(() => okPresign('k'));
    const p = registerPending(pdf(), () => up);
    expect(hasPending({ a: [{ b: p }] })).toBe(true);
    expect(hasPending({ a: { objectKey: 'diplomas/s1/a.jpg', fileName: 'a.jpg' } })).toBe(false);
    expect(hasPending(null)).toBe(false);
  });

  it('are forgotten, not deleted in storage, when released', () => {
    const up = uploader(() => okPresign('k'));
    const p = registerPending(pdf(), () => up);
    releaseKey(up, p.objectKey);
    expect(up.discard).not.toHaveBeenCalled();
    releaseKey(up, 'diplomas/s1/a.jpg');
    expect(up.discard).toHaveBeenCalledWith('diplomas/s1/a.jpg');
  });
});
