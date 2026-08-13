import { z } from 'zod';
import { passwordProblem } from '@/lib/auth/password-rules';

/**
 * A new password, wherever one is set — activation, self-service reset, and
 * ADMIN setting one by hand.
 *
 * The rules live in `lib/auth/password-rules.ts` because the form renders them
 * as a live checklist from the same list that validates them. Two copies would
 * eventually disagree, and the form would refuse a password whose checklist was
 * fully ticked.
 */
export const setPasswordSchema = z
  .object({
    password: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    const problem = passwordProblem(data.password);
    if (problem) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem, path: ['password'] });
    }
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Паролі не збігаються',
        path: ['confirmPassword'],
      });
    }
  });

export type SetPasswordSchema = z.infer<typeof setPasswordSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email({ error: 'Некоректний email' }).trim(),
});

export type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;

export const changeRoleSchema = z.object({
  role: z.enum(['ADMIN', 'EDITOR', 'USER']),
});

export type ChangeRoleSchema = z.infer<typeof changeRoleSchema>;
