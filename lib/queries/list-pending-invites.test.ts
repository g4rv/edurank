import { describe, expect, it } from 'vitest';
import { emailDomain, inviteDomains } from './list-pending-invites';

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
