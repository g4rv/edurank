import { describe, expect, it } from 'vitest';
import { certificateFacts } from './facts';

describe('certificateFacts', () => {
  it('reads an English certificate as number, issuer and date', () => {
    expect(
      certificateFacts('ENGLISH', {
        series: 'EN',
        number: '123',
        issuedBy: 'British Council',
        issuedOn: '2024-03-15',
      })
    ).toEqual(['EN № 123', 'Ким виданий: British Council', 'Дата видачі: 15.03.2024']);
  });

  it('puts the English level (B2 and up) after the number', () => {
    expect(
      certificateFacts('ENGLISH', {
        number: '123',
        level: 'C1',
        issuedBy: 'British Council',
        issuedOn: '2024-03-15',
      })
    ).toEqual(['№ 123', 'Рівень: C1', 'Ким виданий: British Council', 'Дата видачі: 15.03.2024']);
  });

  it('reads a Ukrainian one with its level and the commission decision', () => {
    expect(
      certificateFacts('UKRAINIAN', {
        number: '777',
        level: 'B2',
        decisionNumber: '12/3',
        decisionDate: '2023-06-01',
        issuedOn: '2023-07-10',
      })
    ).toEqual([
      '№ 777',
      'Рівень: B2',
      'Рішення НК: № 12/3 від 01.06.2023',
      'Дата видачі: 10.07.2023',
    ]);
  });

  it('leaves out what is blank — a form’s empty strings count as nothing', () => {
    expect(
      certificateFacts('ENGLISH', {
        series: '',
        number: '1',
        issuedBy: '',
        issuedOn: '2024-03-15',
      })
    ).toEqual(['№ 1', 'Дата видачі: 15.03.2024']);
  });

  it('prints a commission decision only when it is complete', () => {
    expect(
      certificateFacts('UKRAINIAN', {
        number: '777',
        level: 'B2',
        decisionNumber: '12/3',
        decisionDate: '',
        issuedOn: '2023-07-10',
      })
    ).not.toContain('Рішення НК: № 12/3 від ');
  });

  it('never prints the English issuer on a Ukrainian certificate', () => {
    expect(
      certificateFacts('UKRAINIAN', {
        number: '1',
        issuedBy: 'Somebody',
        issuedOn: '2023-07-10',
      }).join(' ')
    ).not.toContain('Somebody');
  });
});
