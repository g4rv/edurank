import { z } from 'zod';

// What an НПП picks when they add a recruited student.
//
// The speciality list is the WHOLE university's, never filtered to the
// recruiter's own кафедра: an НПП may bring a student onto any programme, and
// the bonus follows the recruiter (confirmed 2026-08-10).
//
// Every field is now a choice from `lib/students/accepted.ts` rather than
// something typed. This schema only checks the SHAPE of what arrived; the four
// criteria plus the ПІБ are then looked up in the register, and the claim is
// saved from what the register says — see `addStudentClaim`. A form value is
// never evidence of anything, whatever the picker in front of it allows.

export const studentClaimSchema = z.object({
  /** Chosen from the register's candidates, so it is a ПІБ that exists there */
  studentName: z
    .string()
    .trim()
    .min(3, { error: 'Оберіть здобувача' })
    .max(200, { error: 'Занадто довге значення' }),
  speciality: z.string().trim().min(1, { error: 'Оберіть спеціальність' }),
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
