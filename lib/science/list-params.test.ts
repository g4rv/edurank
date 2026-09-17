import { describe, expect, it } from 'vitest';
import { parsePlanListParams, planListHref } from './list-params';

describe('parsePlanListParams', () => {
  it('defaults to no filter and the app-chosen order', () => {
    const params = parsePlanListParams({});
    expect(params).toMatchObject({ q: undefined, state: undefined, sort: undefined, page: 1 });
  });

  it('refuses a sort field and a state it does not know', () => {
    const params = parsePlanListParams({ sort: 'salary', state: 'fired' });
    expect(params.sort).toBeUndefined();
    expect(params.state).toBeUndefined();
  });

  it('reads URLSearchParams as well as a page.searchParams object', () => {
    const params = parsePlanListParams(new URLSearchParams('q=Іван&state=short&page=3'));
    expect(params).toMatchObject({ q: 'Іван', state: 'short', page: 3 });
  });

  it('never lets a page below one through', () => {
    expect(parsePlanListParams({ page: '0' }).page).toBe(1);
    expect(parsePlanListParams({ page: '-4' }).page).toBe(1);
    expect(parsePlanListParams({ page: 'край' }).page).toBe(1);
  });
});

describe('planListHref', () => {
  const base = parsePlanListParams({ q: 'Іван', state: 'short', page: '4' });

  it('keeps the default view free of params', () => {
    expect(planListHref('/science-plans', parsePlanListParams({}))).toBe('/science-plans');
  });

  it('carries the other filters across a change', () => {
    const href = planListHref('/science-plans', base, { state: 'plan' });
    expect(href).toContain('q=%D0%86%D0%B2%D0%B0%D0%BD');
    expect(href).toContain('state=plan');
  });

  it('RESETS to page one when a filter changes', () => {
    expect(planListHref('/science-plans', base, { state: 'plan' })).not.toContain('page=');
  });

  it('keeps the page when only the page changes', () => {
    expect(planListHref('/science-plans', base, { page: '2' })).toContain('page=2');
  });

  it('drops `dir` unless a column is sorted — the default carries no param', () => {
    const sorted = parsePlanListParams({ sort: 'planned', dir: 'asc' });
    expect(planListHref('/x', sorted)).toContain('dir=asc');
    const unsorted = parsePlanListParams({ dir: 'asc' });
    expect(planListHref('/x', unsorted)).toBe('/x');
  });
});
