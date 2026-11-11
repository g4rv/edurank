import { z } from 'zod';

/** The four switches of `/admin/freeze` — see `lib/freeze/rules.ts`. */
export const freezeSettingsSchema = z.object({
  allFrozen: z.boolean(),
  kharakterystykaFrozen: z.boolean(),
  linkedRatingFrozen: z.boolean(),
  profileFrozen: z.boolean(),
});

export type FreezeSettingsSchema = z.infer<typeof freezeSettingsSchema>;

/** One person for the whitelist. */
export const freezeExemptionSchema = z.object({
  staffId: z.string().min(1),
});
