import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { requiredFieldNames } from './required-fields';
import { loginSchema } from '@/validations/login';
import { staffCreateSchema } from '@/validations/staff';

describe('requiredFieldNames', () => {
  it('names the fields that refuse to be absent', () => {
    const schema = z.object({
      name: z.string().min(1),
      note: z.string().optional(),
      count: z.number(),
    });
    expect([...requiredFieldNames(schema)].sort()).toEqual(['count', 'name']);
  });

  it('marks nothing when every field is required', () => {
    // The rule the owner set (2026-09-04): a star against all of them
    // distinguishes nothing. This is what keeps /login and /forgot-password
    // clean with no special case in either of them.
    const schema = z.object({ email: z.string(), password: z.string() });
    expect(requiredFieldNames(schema).size).toBe(0);
  });

  it('marks nothing when every field is optional', () => {
    const schema = z.object({ a: z.string().optional(), b: z.number().optional() });
    expect(requiredFieldNames(schema).size).toBe(0);
  });

  it('treats a field with a default as not required', () => {
    const schema = z.object({ name: z.string(), kind: z.string().default('x') });
    expect([...requiredFieldNames(schema)]).toEqual(['name']);
  });

  it('sees through .refine() — several real schemas are wrapped', () => {
    const schema = z
      .object({ password: z.string(), confirm: z.string(), hint: z.string().optional() })
      .refine((v) => v.password === v.confirm, { message: 'no' });
    expect([...requiredFieldNames(schema)].sort()).toEqual(['confirm', 'password']);
  });

  it('marks nothing rather than throwing on something that is not an object schema', () => {
    expect(requiredFieldNames(z.string()).size).toBe(0);
    expect(requiredFieldNames(null).size).toBe(0);
    expect(requiredFieldNames(undefined).size).toBe(0);
    expect(requiredFieldNames({ nonsense: true }).size).toBe(0);
  });

  describe('against the app’s own schemas', () => {
    it('leaves the login form unmarked — both fields are required', () => {
      expect(requiredFieldNames(loginSchema).size).toBe(0);
    });

    it('marks only the four obligatory columns on staff creation', () => {
      const names = requiredFieldNames(staffCreateSchema);
      expect([...names].sort()).toEqual(['email', 'firstName', 'lastName', 'patronymic']);
      // and not the many optional ones beside them
      expect(names.has('phone')).toBe(false);
      expect(names.has('employmentRate')).toBe(false);
      expect(names.has('academicRank')).toBe(false);
    });
  });
});
