import { describe, expect, it } from 'vitest';
import { readAsToday } from './legacy';
import type { Check } from './types';

const c = (field: string, status: Check['status'], message: string | null = null): Check => ({
  field,
  current: null,
  shouldBe: '',
  status,
  message,
});

describe('readAsToday', () => {
  it('drops the retired category check, and an error that only it caused goes away', () => {
    const out = readAsToday('error', [c('orcid', 'ok'), c('subject_categories', 'error', 'x')]);
    expect(out.checks.map((k) => k.field)).toEqual(['orcid']);
    expect(out.status).toBe('ok');
  });

  it('keeps an error another check still causes', () => {
    const out = readAsToday('error', [c('orcid', 'error'), c('subject_categories', 'error')]);
    expect(out.status).toBe('error');
  });

  it('turns an old latest-publication error into advice, and the platform follows', () => {
    const out = readAsToday('error', [c('name', 'ok'), c('most_recent_work', 'error', 'old')]);
    expect(out.checks[1]).toMatchObject({ status: 'info' });
    expect(out.checks[1].message).toContain('додайте їх до списку');
    expect(out.status).toBe('ok');
  });

  it('leaves a result alone when nothing in it changed, and never touches failed or no_link', () => {
    const same = [c('name', 'error')];
    expect(readAsToday('error', same)).toEqual({ status: 'error', checks: same });
    expect(readAsToday('failed', [])).toEqual({ status: 'failed', checks: [] });
    expect(readAsToday('failed', [c('subject_categories', 'error')]).status).toBe('failed');
  });
});
