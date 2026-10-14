import { z } from 'zod';

/**
 * An optional link typed into a form (owner, 2026-10-14): blank is «nothing»,
 * anything else must be an http(s) address. **Never another scheme** — it is
 * drawn as a clickable link, and `javascript:` is a valid URL.
 *
 * Shared by the language certificates and the qualifications, so the two can
 * never accept different things.
 */
export const optionalWebLink = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null),
  z
    .string()
    .max(2000, { error: 'Занадто довге значення' })
    .refine((v) => /^https?:\/\//i.test(v) && z.url().safeParse(v).success, {
      error: 'Некоректне посилання',
    })
    .nullable()
);
