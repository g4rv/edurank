import { z } from 'zod';

const str = (v: unknown) => (v === '' || v === undefined ? null : v);

export const facultySchema = z.object({
  name: z.string().trim().min(1, { error: "Обов'язкове поле" }),
  deanId: z.preprocess(str, z.string().nullable()),
});

export type FacultySchema = z.infer<typeof facultySchema>;
