import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email({ error: 'Введіть коректний email' }).trim(),
  password: z.string().min(1, { error: "Пароль обов'язковий" }),
});

export type LoginSchema = z.infer<typeof loginSchema>;
