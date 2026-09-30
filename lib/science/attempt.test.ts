import { afterEach, describe, expect, it, vi } from 'vitest';
import { attempt, CONNECTION_PROBLEM } from './attempt';

afterEach(() => vi.restoreAllMocks());

describe('attempt', () => {
  it('hands back what the action returned, untouched', async () => {
    await expect(attempt(async () => ({ ok: true as const }))).resolves.toEqual({ ok: true });
    await expect(attempt(async () => ({ error: 'Вкажіть назву' }))).resolves.toEqual({
      error: 'Вкажіть назву',
    });
  });

  it('turns a thrown request into an error the dialog can show — instead of crashing the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await attempt(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(result).toEqual({ error: CONNECTION_PROBLEM });
  });

  it('says what happened to the person’s work, without a code or a stack', () => {
    expect(CONNECTION_PROBLEM).toMatch(/зв’язку/);
    expect(CONNECTION_PROBLEM).toMatch(/залишилися|залишились/);
    expect(CONNECTION_PROBLEM).not.toMatch(/fetch|digest|\d{4,}/i);
  });
});
