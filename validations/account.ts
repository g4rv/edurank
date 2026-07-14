import { z } from 'zod';

export const setPasswordSchema = z
  .object({
    password: z.string().min(8, { error: 'Мінімум 8 символів' }),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
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
