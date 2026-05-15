import { z } from 'zod';

const str = (v: unknown) => (v === '' || v === undefined ? null : v);

export const userFormSchema = z
  .object({
    email: z.email({ error: 'Некоректний email' }).trim(),
    password: z.preprocess(str, z.string().min(8, { error: 'Мінімум 8 символів' }).nullable()),
    confirmPassword: z.preprocess(str, z.string().nullable()),
    role: z.enum(['ADMIN', 'EDITOR', 'USER']),
    staffId: z.preprocess(str, z.string().nullable()),
  })
  .superRefine((data, ctx) => {
    if (data.password !== null && data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Паролі не збігаються',
        path: ['confirmPassword'],
      });
    }
  });

export type UserFormSchema = z.infer<typeof userFormSchema>;
