import { z } from 'zod';

const str = (v: unknown) => (v === '' || v === undefined ? null : v);

export const departmentSchema = z.object({
  name: z.string().trim().min(1, { error: "Обов'язкове поле" }),
  facultyId: z.string().min(1, { error: "Обов'язкове поле" }),
  headId: z.preprocess(str, z.string().nullable()),
});

export type DepartmentSchema = z.infer<typeof departmentSchema>;
