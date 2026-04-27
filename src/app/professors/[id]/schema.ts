import { z } from 'zod';
import {
  AcademicRank,
  AcademicPosition,
  ScientificDegree,
} from '@/generated/prisma/enums';

// Ukrainian letters, apostrophe, hyphen — no digits, no spaces
export const nameField = z
  .string()
  .min(1, 'Обовʼязкове поле')
  .regex(
    /^[А-ЯҐЄІЇа-яґєіїʼ'\-]+$/,
    'Тільки літери, дефіс або апостроф'
  );

const positiveInt = z.coerce
  .number()
  .int('Тільки цілі числа')
  .min(0, 'Не може бути відʼємним')
  .optional()
  .nullable();

export const professorSchema = z.object({
  lastName: nameField,
  firstName: nameField,
  patronymic: nameField,
  email: z.email('Невірний формат email'),
  departmentId: z.string().min(1, 'Оберіть кафедру'),

  employmentRate: z.coerce
    .number()
    .min(0.1, 'Мінімум 0.1')
    .max(2, 'Максимум 2')
    .optional()
    .nullable(),
  pedagogicalExperience: positiveInt,

  academicRank: z
    .enum(Object.values(AcademicRank) as [AcademicRank, ...AcademicRank[]])
    .optional()
    .nullable(),
  academicPosition: z
    .enum(
      Object.values(AcademicPosition) as [
        AcademicPosition,
        ...AcademicPosition[],
      ]
    )
    .optional()
    .nullable(),
  scientificDegree: z
    .enum(
      Object.values(ScientificDegree) as [
        ScientificDegree,
        ...ScientificDegree[],
      ]
    )
    .optional()
    .nullable(),
  degreeMatchesDepartment: z.boolean().optional().nullable(),

  ratingSheetId: z.string().optional().nullable(),
  certificateId: z.string().optional().nullable(),

  wosURL: z.string().url('Невірний формат URL').optional().or(z.literal('')),
  wosCitationCount: positiveInt,
  scopusURL: z.string().url('Невірний формат URL').optional().or(z.literal('')),
  scopusCitationCount: positiveInt,
  googleScholarURL: z
    .string()
    .url('Невірний формат URL')
    .optional()
    .or(z.literal('')),
  googleScholarCitationCount: positiveInt,
  orcidId: z
    .string()
    .regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, 'Формат: 0000-0000-0000-0000')
    .optional()
    .or(z.literal('')),
});

export type ProfessorFormValues = z.infer<typeof professorSchema>;
