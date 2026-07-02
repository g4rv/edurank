import type { AcademicRank, ScientificDegree } from '@/lib/generated/prisma/client';

export const ACADEMIC_RANK_LABELS: Record<AcademicRank, string> = {
  LECTURER: 'Викладач',
  SENIOR_LECTURER: 'Старший викладач',
  DOCENT: 'Доцент',
  PROFESSOR: 'Професор',
};

export const SCIENTIFIC_DEGREE_LABELS: Record<ScientificDegree, string> = {
  CANDIDATE: 'Кандидат наук',
  DOCTOR: 'Доктор наук',
};

export const FIELD_LABELS: Record<string, string> = {
  // Staff
  lastName: 'Прізвище',
  firstName: "Ім'я",
  patronymic: 'По батькові',
  email: 'Email',
  phone: 'Телефон',
  isNpp: 'Тип (НПП / Адм.)',
  employmentRate: 'Ставка',
  pedagogicalExperience: 'Педагогічний стаж',
  academicRank: 'Вчене звання',
  scientificDegree: 'Науковий ступінь',
  degreeMatchesDepartment: 'Відповідність ступеня кафедрі',
  wosUrl: 'WoS профіль',
  wosCitationCount: 'WoS цитувань',
  scopusUrl: 'Scopus профіль',
  scopusCitationCount: 'Scopus цитувань',
  googleScholarUrl: 'Google Scholar профіль',
  googleScholarCitationCount: 'Google Scholar цитувань',
  orcidId: 'ORCID',
  departmentId: 'Кафедра (основна)',
  divisionId: 'Відділ',
  // Faculty / Department / Division / User
  name: 'Назва',
  deanId: 'Декан',
  facultyId: 'Факультет',
  headId: 'Завідувач',
  role: 'Роль',
  staffId: 'Співробітник',
  password: 'Пароль',
  // Rating (Phase 2): Activity
  activityTypeId: 'Тип досягнення',
  year: 'Рік',
  evidence: 'Дані досягнення',
  computedValue: 'Обчислене значення',
  score: 'Бали',
  status: 'Статус',
  submittedByRole: 'Подано',
  approvedAt: 'Підтверджено',
  removedAt: 'Відхилено',
  removeReason: 'Причина відхилення',
  // Rating (Phase 2): ActivityType / RatingTemplate
  label: 'Показник',
  coefficient: 'Коефіцієнт',
  coefficientNote: 'Критерії',
  inputSource: 'Джерело внесення',
  verifyingDivisionId: 'Відповідальний відділ',
  isActive: 'Активний',
  closedAt: 'Рік закрито',
};
