import { describe, expect, it } from 'vitest';
import { emailDomain, inviteDomains, narrowInvites } from './list-pending-invites';
import type { PendingInvite } from './list-pending-invites';

describe('emailDomain', () => {
  it('takes the part after the «@», lower-cased', () => {
    expect(emailDomain('Oksana.Perchuk@UHSP.edu.ua')).toBe('uhsp.edu.ua');
  });

  it('trims what an import may have left on the end', () => {
    expect(emailDomain('a@uhsp.edu.ua  ')).toBe('uhsp.edu.ua');
  });

  // `Staff.email` is required and unique, so a placeholder is a real address as
  // far as the column is concerned — it just cannot receive anything.
  it('reads a placeholder like any other address', () => {
    expect(emailDomain('kotsur.vitalii@no-email.invalid')).toBe('no-email.invalid');
  });

  it('is empty when there is no «@» at all', () => {
    expect(emailDomain('not-an-address')).toBe('');
    expect(emailDomain('')).toBe('');
  });
});

describe('inviteDomains', () => {
  it('counts each domain and puts the commonest first', () => {
    const domains = inviteDomains([
      'a@uhsp.edu.ua',
      'b@uhsp.edu.ua',
      'c@gmail.com',
      'd@uhsp.edu.ua',
    ]);

    expect(domains).toEqual([
      { domain: 'uhsp.edu.ua', count: 3, undeliverable: false },
      { domain: 'gmail.com', count: 1, undeliverable: false },
    ]);
  });

  // Last however many people are on it: nobody chooses that group in order to
  // send to it, so it must never sit at the top of the picker.
  it('puts the undeliverable placeholders last even when they are the biggest group', () => {
    const domains = inviteDomains([
      'a@no-email.invalid',
      'b@no-email.invalid',
      'c@no-email.invalid',
      'd@uhsp.edu.ua',
    ]);

    expect(domains.map((d) => d.domain)).toEqual(['uhsp.edu.ua', 'no-email.invalid']);
    expect(domains[1]).toEqual({ domain: 'no-email.invalid', count: 3, undeliverable: true });
  });

  it('breaks a tie on the name, so the order does not wander between reads', () => {
    expect(inviteDomains(['a@zzz.ua', 'b@aaa.ua']).map((d) => d.domain)).toEqual([
      'aaa.ua',
      'zzz.ua',
    ]);
  });

  it('groups addresses that differ only in case', () => {
    const domains = inviteDomains(['a@UHSP.edu.ua', 'b@uhsp.EDU.ua']);
    expect(domains).toEqual([{ domain: 'uhsp.edu.ua', count: 2, undeliverable: false }]);
  });

  it('is empty for no addresses', () => {
    expect(inviteDomains([])).toEqual([]);
  });
});

describe('narrowInvites', () => {
  const person = (name: string, email: string, invitedAt: Date | null): PendingInvite => ({
    id: name,
    fullName: name,
    email,
    isNpp: true,
    departmentName: null,
    invitedAt,
  });

  const sentAt = new Date('2026-08-25T09:00:00Z');
  const all = [
    person('Перчук', 'a@uhsp.edu.ua', sentAt),
    person('Коваль', 'b@uhsp.edu.ua', null),
    person('Мельник', 'c@gmail.com', null),
  ];

  it('keeps everybody when nothing is asked for', () => {
    expect(narrowInvites(all).people).toHaveLength(3);
  });

  // The whole point: a run interrupted halfway has to be finishable without
  // writing to the people who already hold a link.
  it('«не надсилалося» is the people with no token at all', () => {
    const { people } = narrowInvites(all, { invited: false });
    expect(people.map((p) => p.fullName)).toEqual(['Коваль', 'Мельник']);
  });

  it('«вже надсилалося» is the other half', () => {
    const { people } = narrowInvites(all, { invited: true });
    expect(people.map((p) => p.fullName)).toEqual(['Перчук']);
  });

  // It asks whether a letter went out, never whether the person opened it —
  // `listPendingInvites` already dropped everyone who has a password.
  it('does not care how old the invitation is', () => {
    const stale = [person('Давній', 'd@uhsp.edu.ua', new Date('2026-01-01T00:00:00Z'))];
    expect(narrowInvites(stale, { invited: false }).people).toEqual([]);
    expect(narrowInvites(stale, { invited: true }).people).toHaveLength(1);
  });

  it('counts the domains of what «invited» left, not of everybody', () => {
    const { domains } = narrowInvites(all, { invited: false });
    expect(domains).toEqual([
      { domain: 'uhsp.edu.ua', count: 1, undeliverable: false },
      { domain: 'gmail.com', count: 1, undeliverable: false },
    ]);
  });

  // `DomainFilter` renders only above one domain, so narrowing the option list
  // to the tab took the whole email filter off the page — and with it any way
  // back to the other domains.
  it('keeps every domain in the list even when the tab holds none of them', () => {
    const { domains } = narrowInvites(all, { invited: true });
    expect(domains).toEqual([
      { domain: 'uhsp.edu.ua', count: 1, undeliverable: false },
      { domain: 'gmail.com', count: 0, undeliverable: false },
    ]);
  });

  // The order comes from the whole selection, so the picker does not reshuffle
  // itself under the cursor when somebody switches tab.
  it('does not reorder the picker between tabs', () => {
    const order = (invited?: boolean) =>
      narrowInvites(all, { invited }).domains.map((d) => d.domain);
    expect(order(true)).toEqual(order(undefined));
    expect(order(false)).toEqual(order(undefined));
  });

  // Otherwise picking one domain would leave the picker holding only that
  // domain and no way back to the others.
  it('still lists every domain after one of them is picked', () => {
    const { people, domains } = narrowInvites(all, { invited: false, domain: 'uhsp.edu.ua' });
    expect(people.map((p) => p.fullName)).toEqual(['Коваль']);
    expect(domains.map((d) => d.domain)).toEqual(['uhsp.edu.ua', 'gmail.com']);
  });

  it('does not hand back the caller array to be mutated', () => {
    expect(narrowInvites(all).people).not.toBe(all);
  });
});
