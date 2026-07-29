import type {
  AcademicRank,
  AdminPosition,
  Role,
  ScientificDegree,
} from '@/lib/generated/prisma/client';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Адміністратор',
  EDITOR: 'Редактор',
  USER: 'Користувач',
};

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

export const ADMIN_POSITION_LABELS: Record<AdminPosition, string> = {
  VICE_RECTOR: 'Проректор',
  DEAN: 'Декан',
  VICE_DEAN_OR_SECRETARY: 'Заступник декана / вчений секретар / відп. секретар прийм. комісії',
  DEPARTMENT_OR_UNIT_HEAD: 'Завідувач кафедри / керівник відділу',
  DEPUTY_DEPARTMENT_HEAD: 'Заступник завідувача кафедри',
  DEPUTY_ADMISSION_SECRETARY: 'Заступник відповідального секретаря приймальної комісії',
  LAB_OR_CENTER_HEAD: 'Завідувач лабораторії / керівник центру',
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
  adminPosition: 'Адміністративна посада',
  basicEducationMatch: 'Базова освіта за спеціальністю кафедри',
  basicEducationSpecialty: 'Спеціальність за дипломом',
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
  canModerateRating: 'Модерація рейтингу',
  staffId: 'Співробітник',
  password: 'Пароль',
  passwordHash: 'Пароль',
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
  verified: 'Перевірено',
  verifiedAt: 'Перевірено',
  // Rating (Phase 2): ActivityType / RatingTemplate
  label: 'Показник',
  coefficient: 'Коефіцієнт',
  coefficientNote: 'Критерії',
  inputSource: 'Джерело внесення',
  verifyingDivisionId: 'Відповідальний відділ',
  isActive: 'Активний',
  closedAt: 'Рік закрито',
  code: 'Код показника',
};
