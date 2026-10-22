import { z } from 'zod';

const str = (v: unknown) => (v === '' || v === undefined ? null : v);

export const departmentSchema = z.object({
  name: z.string().trim().min(1, { error: "Обов'язкове поле" }),
  facultyId: z.string().min(1, { error: "Обов'язкове поле" }),
  headId: z.preprocess(str, z.string().nullable()),
  /**
   * Заступник з наукової роботи (2026-10-21). Only the edit page draws it, so
   * ABSENT means «leave it as it is» and must stay distinct from null: `str`
   * would turn undefined into null and wipe the post on every create.
   */
  scienceDeputyId: z.preprocess((v) => (v === '' ? null : v), z.string().nullable().optional()),
});

export type DepartmentSchema = z.infer<typeof departmentSchema>;
