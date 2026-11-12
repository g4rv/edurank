import { z } from 'zod';

/** The lines ticked on `/admin/kharakterystyka-check` — a page, never the whole table at once. */
export const yearCheckIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(300),
});

/** What a hide is for: a publication older than the window, or a copy of a rating entry */
export const yearCheckHideSchema = yearCheckIdsSchema.extend({
  kind: z.enum(['year', 'duplicate']),
});

export type YearCheckIdsSchema = z.infer<typeof yearCheckIdsSchema>;
export type YearCheckHideSchema = z.infer<typeof yearCheckHideSchema>;
