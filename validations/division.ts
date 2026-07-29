import { z } from 'zod';

export const divisionSchema = z.object({
  name: z.string().trim().min(1, { error: "Обов'язкове поле" }),
  // Grants this division's editors rating moderation. ADMIN-only to set, like
  // everything else about a division — see lib/rating/moderation.ts.
  canModerateRating: z.boolean().default(false),
});

export type DivisionSchema = z.infer<typeof divisionSchema>;
