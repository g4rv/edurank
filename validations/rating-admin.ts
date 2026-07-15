import { z } from 'zod';

export const updateActivityTypeSchema = z.object({
  label: z.string().trim().min(1, { error: "Обов'язкове поле" }).max(500),
  coefficient: z.coerce
    .number({ error: 'Має бути числом' })
    .positive({ error: 'Має бути більше нуля' }),
  coefficientNote: z
    .string()
    .trim()
    .max(1000, { error: 'Занадто довге значення' })
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  verifyingDivisionId: z
    .string()
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  isActive: z.boolean(),
});

export type UpdateActivityTypeSchema = z.infer<typeof updateActivityTypeSchema>;
