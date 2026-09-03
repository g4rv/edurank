import { z } from 'zod';

// One здобувач typed in by hand on /admin/students.
//
// The import is the normal way in; this is for the one person the деканат
// forgot, which otherwise costs everyone a whole new file. It carries a `year`
// because the register is per-campaign — but the ACTION still checks that year
// against the ones the register holds, because a form value is not evidence of
// anything, whatever the control in front of it allows.

export const admittedStudentSchema = z.object({
  /**
   * Trimmed AND with runs of whitespace collapsed.
   *
   * `.trim()` alone only touches the ends, so «Ковальчук   Олена» would be
   * STORED with three spaces while `nameNormalised` collapsed them — the
   * matching would still work, and the ПІБ would read wrong in the table, in
   * the delete dialog and in the audit log for ever after.
   */
  name: z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(
      z.string().min(3, { error: 'Вкажіть ПІБ' }).max(200, { error: 'Занадто довге значення' })
    ),
  specialityId: z.string().trim().min(1, { error: 'Оберіть спеціальність' }),
  degree: z.enum(['BACHELOR', 'MASTER'], { error: 'Оберіть ступінь' }),
  form: z.enum(['FULL_TIME', 'PART_TIME'], { error: 'Оберіть форму навчання' }),
  funding: z.enum(['STATE', 'CONTRACT'], { error: 'Оберіть джерело фінансування' }),
  /** Coerced: it arrives as a string from a form and as a number from the page */
  year: z.coerce
    .number()
    .int({ error: 'Невірний рік' })
    .min(2020, { error: 'Невірний рік' })
    .max(2100, { error: 'Невірний рік' }),
});
export type AdmittedStudentSchema = z.infer<typeof admittedStudentSchema>;
