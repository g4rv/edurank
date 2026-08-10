import { z } from 'zod';

// What an НПП types when they add a recruited student.
//
// The speciality list is the WHOLE university's, never filtered to the
// recruiter's own кафедра: an НПП may bring a student onto any programme, and
// the bonus follows the recruiter (confirmed 2026-08-10).

export const studentClaimSchema = z.object({
  /**
   * Free text, as the наказ has it. Not matched against a roster of students,
   * because there is no such roster in the app — the наказ arrives as paper.
   * Duplicate detection normalises this rather than constraining it.
   */
  studentName: z
    .string()
    .trim()
    .min(3, { error: 'Вкажіть ПІБ здобувача' })
    .max(200, { error: 'Занадто довге значення' }),
  specialityId: z.string().min(1, { error: 'Оберіть спеціальність' }),
  degree: z.enum(['BACHELOR', 'MASTER'], { error: 'Оберіть освітній рівень' }),
  form: z.enum(['FULL_TIME', 'PART_TIME'], { error: 'Оберіть форму навчання' }),
  funding: z.enum(['STATE', 'CONTRACT'], { error: 'Оберіть джерело фінансування' }),
});
export type StudentClaimSchema = z.infer<typeof studentClaimSchema>;

/**
 * The head's decision on one claim.
 *
 * A rejection carries a reason, because the НПП sees it — the same rule as a
 * discarded rating entry. A confirmation carries nothing: there is no verdict
 * to explain when the answer is «yes».
 */
export const claimDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ claimId: z.string().min(1), decision: z.literal('CONFIRMED') }),
  z.object({
    claimId: z.string().min(1),
    decision: z.literal('REJECTED'),
    reason: z
      .string()
      .trim()
      .min(3, { error: 'Вкажіть причину — її побачить НПП' })
      .max(1000, { error: 'Занадто довге значення' }),
  }),
]);
export type ClaimDecisionSchema = z.infer<typeof claimDecisionSchema>;
