import { z } from 'zod';

export const professorSchema = z.object({
  lastName: z.string().min(1, 'Обовʼязкове поле'),
  firstName: z.string().min(1, 'Обовʼязкове поле'),
  patronymic: z.string().optional(),
  email: z.string().email('Невірний формат email').optional().or(z.literal('')),

  employmentRate: z.coerce.number().min(0.1).max(2).optional().nullable(),
  pedagogicalExperience: z.coerce.number().int().min(0).optional().nullable(),

  academicRank: z
    .enum(['DOCENT', 'PROFESSOR', 'SENIOR_RESEARCHER'])
    .optional()
    .nullable(),
  academicPosition: z
    .enum(['ASSISTANT', 'LECTURER', 'SENIOR_LECTURER', 'DOCENT', 'PROFESSOR'])
    .optional()
    .nullable(),
  scientificDegree: z.enum(['CANDIDATE', 'DOCTOR']).optional().nullable(),
  degreeMatchesDepartment: z.boolean().optional().nullable(),

  ratingSheetId: z.string().optional().nullable(),
  certificateId: z.string().optional().nullable(),

  wosURL: z.string().url('Невірний URL').optional().or(z.literal('')),
  wosCitationCount: z.coerce.number().int().min(0).optional().nullable(),
  scopusURL: z.string().url('Невірний URL').optional().or(z.literal('')),
  scopusCitationCount: z.coerce.number().int().min(0).optional().nullable(),
  googleScholarURL: z.string().url('Невірний URL').optional().or(z.literal('')),
  googleScholarCitationCount: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .nullable(),
  orcidId: z
    .string()
    .regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, 'Формат: 0000-0000-0000-0000')
    .optional()
    .or(z.literal('')),
});

export type ProfessorFormValues = z.infer<typeof professorSchema>;
