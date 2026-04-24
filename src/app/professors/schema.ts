import { z } from 'zod';
import { professorSchema } from './[id]/schema';

export const createProfessorSchema = professorSchema.extend({
  departmentId: z.string().min(1, 'Оберіть кафедру'),
});

export type CreateProfessorValues = z.infer<typeof createProfessorSchema>;
