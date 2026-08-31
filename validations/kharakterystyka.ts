import { z } from 'zod';
import { LICENCE_POSITIONS } from '@/lib/kharakterystyka/positions';

const POSITION_NUMBERS = LICENCE_POSITIONS.map((p) => p.number);

/**
 * A row of evidence typed by hand for one п.38 position.
 *
 * The window check is NOT here: it needs the active rating year, which is a
 * database read, and a Zod schema that hits the database cannot be shared with
 * the form. `addKharakterystykaEntry` does it, next to the other checks that
 * need the same query.
 */
export const kharakterystykaEntrySchema = z.object({
  staffId: z.string().min(1),

  position: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z
      .number({ error: 'Оберіть позицію' })
      .int()
      .refine((n) => POSITION_NUMBERS.includes(n), { error: 'Такої позиції немає' })
  ),

  year: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number({ error: 'Вкажіть рік' }).int().min(2000).max(2100)
  ),

  // The printed «Дані підтвердження показника». Long, because a publication
  // reference with a DOI runs to several lines and the document prints it whole.
  text: z
    .string()
    .trim()
    .min(3, { error: 'Опишіть, що саме підтверджує показник' })
    .max(4000, { error: 'Занадто довгий текст' }),

  /**
   * How many items this one row stands for.
   *
   * Capped at the largest threshold in п.38 — five. Anything above it can only
   * be a typing slip, and the difference between «5» and «50» is a position
   * closed on a claim nobody checked.
   */
  count: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? 1 : Number(v)),
    z.number({ error: 'Вкажіть кількість' }).int().min(1).max(5)
  ),
});

export type KharakterystykaEntrySchema = z.infer<typeof kharakterystykaEntrySchema>;
