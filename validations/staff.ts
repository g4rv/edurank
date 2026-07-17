import { z } from 'zod';

const str = (v: unknown) =>
  v === '' || v === undefined || (typeof v === 'string' && !v.trim()) ? null : v;
const num = (v: unknown) =>
  v === '' || v === null || v === undefined ? null : isNaN(Number(v)) ? null : Number(v);
const boolStr = (v: unknown) =>
  v === '' || v === null || v === undefined ? null : v === true || v === 'true' ? true : false;

export const staffUpdateSchema = z
  .object({
    lastName: z.string().trim().min(1, { error: "Обов'язкове поле" }),
    firstName: z.string().trim().min(1, { error: "Обов'язкове поле" }),
    patronymic: z.string().trim().min(1, { error: "Обов'язкове поле" }),
    email: z.email({ error: 'Некоректний email' }).trim(),
    phone: z.preprocess(str, z.string().nullable()),
    isNpp: z.preprocess((v) => v === true || v === 'true', z.boolean()),
    employmentRate: z.preprocess(num, z.number().nonnegative().nullable()),
    pedagogicalExperience: z.preprocess(num, z.number().int().nonnegative().nullable()),
    academicRank: z.preprocess(
      str,
      z.enum(['LECTURER', 'SENIOR_LECTURER', 'DOCENT', 'PROFESSOR']).nullable()
    ),
    scientificDegree: z.preprocess(str, z.enum(['CANDIDATE', 'DOCTOR']).nullable()),
    degreeMatchesDepartment: z.preprocess(boolStr, z.boolean().nullable()),
    adminPosition: z.preprocess(
      str,
      z
        .enum([
          'VICE_RECTOR',
          'DEAN',
          'VICE_DEAN_OR_SECRETARY',
          'DEPARTMENT_OR_UNIT_HEAD',
          'DEPUTY_DEPARTMENT_HEAD',
          'DEPUTY_ADMISSION_SECRETARY',
          'LAB_OR_CENTER_HEAD',
        ])
        .nullable()
    ),
    basicEducationMatch: z.preprocess(boolStr, z.boolean().nullable()),
    basicEducationSpecialty: z.preprocess(str, z.string().nullable()),
    wosUrl: z.preprocess(str, z.string().nullable()),
    wosCitationCount: z.preprocess(num, z.number().int().nonnegative().nullable()),
    scopusUrl: z.preprocess(str, z.string().nullable()),
    scopusCitationCount: z.preprocess(num, z.number().int().nonnegative().nullable()),
    googleScholarUrl: z.preprocess(str, z.string().nullable()),
    googleScholarCitationCount: z.preprocess(num, z.number().int().nonnegative().nullable()),
    orcidId: z.preprocess(str, z.string().nullable()),
    departmentId: z.preprocess(str, z.string().nullable()),
    divisionId: z.preprocess(str, z.string().nullable()),
    partTimeDepartmentIds: z.array(z.string()).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.isNpp && !data.departmentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'НПП повинен мати основну кафедру',
        path: ['departmentId'],
      });
    }
  });

export type StaffUpdateSchema = z.infer<typeof staffUpdateSchema>;

export const staffCreateSchema = staffUpdateSchema;
export type StaffCreateSchema = StaffUpdateSchema;
