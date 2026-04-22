import type {
  AcademicRank,
  AcademicPosition,
  ScientificDegree,
} from '@/generated/prisma/enums';

export const RANK_LABELS: Record<AcademicRank, string> = {
  DOCENT: 'Доцент (вчене звання)',
  PROFESSOR: 'Професор (вчене звання)',
  SENIOR_RESEARCHER: 'Старший науковий співробітник',
};

export const POSITION_LABELS: Record<AcademicPosition, string> = {
  ASSISTANT: 'Асистент',
  LECTURER: 'Викладач',
  SENIOR_LECTURER: 'Старший викладач',
  DOCENT: 'Доцент (посада)',
  PROFESSOR: 'Професор (посада)',
};

export const DEGREE_LABELS: Record<ScientificDegree, string> = {
  CANDIDATE: 'Кандидат наук / Доктор філософії',
  DOCTOR: 'Доктор наук',
};
