import { describe, expect, it } from 'vitest';
import { typedErrors } from './typed-errors';

const err = (message: string) => ({ type: 'custom', message });

describe('typedErrors', () => {
  it('keeps the error of a field that holds something wrong', () => {
    expect(
      typedErrors({ first: err('Лише українські літери') }, { first: 'sadasd' })
    ).toHaveProperty('first');
  });

  it('drops the error of an empty field — the disabled button says enough', () => {
    expect(typedErrors({ first: err("Обов'язкове поле") }, { first: '   ' })).toEqual({});
  });

  it('drops the error of a field never touched', () => {
    expect(typedErrors({ credits: err('Мінімальне значення — 1') }, {})).toEqual({});
  });

  it('keeps a typed number that breaks its bound', () => {
    expect(typedErrors({ credits: err('Мінімальне значення — 1') }, { credits: 0 })).toHaveProperty(
      'credits'
    );
  });
});
