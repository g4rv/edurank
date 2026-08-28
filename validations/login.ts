import { z } from 'zod';

export const loginSchema = z.object({
  // Lower-cased so the throttle subject, the lookup and anything logged all
  // see one spelling of the address somebody typed.
  email: z.email({ error: 'Введіть коректний email' }).trim().toLowerCase(),
  password: z.string().min(1, { error: "Пароль обов'язковий" }),
});

export type LoginSchema = z.infer<typeof loginSchema>;
