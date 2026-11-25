import { describe, expect, it } from 'vitest';
import { ALL_PAGES, NO_PAGES } from './page-access';
import { startPageFor, type StartPageInput } from './start-page';

// Where `/` and the login send somebody, and where a closed page sends them
// back to (owner, 2026-11-25): the first page they may open, else their profile.

const nothing: StartPageInput = {
  role: 'EDITOR',
  access: NO_PAGES,
  canEnterData: false,
  canModerate: false,
  canOverseeScience: false,
  headsDepartment: false,
  isDean: false,
};

describe('startPageFor', () => {
  it('sends a USER with no headship to their profile', () => {
    expect(startPageFor({ ...nothing, role: 'USER' })).toBe('/profile');
  });

  it('sends ADMIN to the staff list', () => {
    expect(startPageFor({ ...nothing, role: 'ADMIN', access: ALL_PAGES })).toBe('/staff');
  });

  it('sends an editor with «Штат» to the staff list', () => {
    expect(startPageFor({ ...nothing, access: { ...NO_PAGES, staff: true } })).toBe('/staff');
  });

  it('sends an editor with only «Рейтинг НПП» to the rating', () => {
    expect(startPageFor({ ...nothing, access: { ...NO_PAGES, rating: true } })).toBe('/rating');
  });

  it('sends an editor who only enters data to «Дані відділу»', () => {
    expect(startPageFor({ ...nothing, canEnterData: true })).toBe('/division-data');
  });

  it('prefers the rating over data entry, and data entry over moderation', () => {
    expect(
      startPageFor({
        ...nothing,
        access: { ...NO_PAGES, rating: true },
        canEnterData: true,
        canModerate: true,
      })
    ).toBe('/rating');
    expect(startPageFor({ ...nothing, canEnterData: true, canModerate: true })).toBe(
      '/division-data'
    );
  });

  it('sends a science overseer with nothing else to «Плани наукової роботи»', () => {
    expect(startPageFor({ ...nothing, canOverseeScience: true })).toBe('/science-plans');
  });

  it('falls back to кафедри, факультети, then графіки', () => {
    expect(startPageFor({ ...nothing, access: { ...NO_PAGES, departments: true } })).toBe(
      '/departments'
    );
    expect(startPageFor({ ...nothing, access: { ...NO_PAGES, faculties: true } })).toBe(
      '/faculties'
    );
    expect(startPageFor({ ...nothing, access: { ...NO_PAGES, charts: true } })).toBe('/dashboard');
  });

  it('sends a head with nothing else to «Моя кафедра», a декан to «Мій факультет»', () => {
    expect(startPageFor({ ...nothing, headsDepartment: true })).toBe('/my-department');
    expect(startPageFor({ ...nothing, isDean: true })).toBe('/my-faculty');
    // A USER head keeps landing on their profile, as before
    expect(startPageFor({ ...nothing, role: 'USER', headsDepartment: true })).toBe('/profile');
  });

  it('sends an editor with nothing at all to their profile', () => {
    expect(startPageFor(nothing)).toBe('/profile');
  });
});
