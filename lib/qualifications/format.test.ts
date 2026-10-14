import { describe, expect, it } from 'vitest';
import {
  creditsLabel,
  documentNumber,
  formatCredits,
  formatFileSize,
  formatIssuedOn,
  hoursFromCredits,
  hoursLabel,
} from './format';

describe('formatCredits', () => {
  it('drops needless zeros and uses a comma', () => {
    expect(formatCredits(150)).toBe('1,5');
    expect(formatCredits(300)).toBe('3');
    expect(formatCredits(25)).toBe('0,25');
    expect(formatCredits(0)).toBe('0');
  });
});

describe('creditsLabel', () => {
  it('declines a whole number', () => {
    expect(creditsLabel(100)).toBe('1 кредит');
    expect(creditsLabel(200)).toBe('2 кредити');
    expect(creditsLabel(500)).toBe('5 кредитів');
    expect(creditsLabel(1100)).toBe('11 кредитів');
    expect(creditsLabel(0)).toBe('0 кредитів');
  });

  it('puts a fraction in the genitive singular', () => {
    expect(creditsLabel(150)).toBe('1,5 кредита');
    expect(creditsLabel(25)).toBe('0,25 кредита');
  });
});

describe('hoursLabel', () => {
  it('declines the three forms', () => {
    expect(hoursLabel(1)).toBe('1 година');
    expect(hoursLabel(3)).toBe('3 години');
    expect(hoursLabel(45)).toBe('45 годин');
    expect(hoursLabel(11)).toBe('11 годин');
    expect(hoursLabel(0)).toBe('0 годин');
  });

  it('puts a fraction in the genitive singular', () => {
    expect(hoursLabel(7.5)).toBe('7,5 години');
  });
});

describe('hoursFromCredits', () => {
  it('is credits × 30 (1 кредит = 30 годин)', () => {
    expect(hoursFromCredits(100)).toBe(30);
    expect(hoursFromCredits(150)).toBe(45);
    expect(hoursFromCredits(300)).toBe(90);
    expect(hoursFromCredits(0)).toBe(0);
  });

  it('keeps a fraction clean, never 0.30000000000000004', () => {
    expect(hoursFromCredits(25)).toBe(7.5);
    expect(hoursFromCredits(1)).toBe(0.3);
    expect(hoursFromCredits(33)).toBe(9.9);
  });
});

describe('formatIssuedOn', () => {
  it('reads the stored date as written — no timezone shift', () => {
    expect(formatIssuedOn('2025-05-20')).toBe('20.05.2025');
    expect(formatIssuedOn('2026-01-01')).toBe('01.01.2026');
  });
});

describe('documentNumber', () => {
  it('prints the series only when there is one', () => {
    expect(documentNumber('ПК', '12345')).toBe('ПК № 12345');
    expect(documentNumber(null, '12345')).toBe('№ 12345');
  });

  it('copes with a document that has no number, or neither', () => {
    expect(documentNumber('ПК', null)).toBe('ПК');
    expect(documentNumber(null, null)).toBeNull();
    expect(documentNumber('', '')).toBeNull();
  });
});

describe('formatFileSize', () => {
  it('picks the unit', () => {
    expect(formatFileSize(512)).toBe('512 Б');
    expect(formatFileSize(2048)).toBe('2,0 КБ');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5,0 МБ');
  });
});
