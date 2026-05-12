import { z } from 'zod';

export const divisionSchema = z.object({
  name: z.string().trim().min(1, { error: "Обов'язкове поле" }),
});

export type DivisionSchema = z.infer<typeof divisionSchema>;
