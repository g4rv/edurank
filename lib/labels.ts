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
  degreeDefenceDate: 'Дата захисту дисертації',
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
  // Had no label at all, so every сумісництво change ever recorded rendered in
  // the audit log as a raw field name (2026-08-24).
  partTimeDepartmentIds: 'Додаткова кафедра',
  department: 'Випускова кафедра',
  divisionId: 'Відділ',
  archivedAt: 'Архівовано',
  archiveReason: 'Причина архівування',
  // Faculty / Department / Division / User
  name: 'Назва',
  deanId: 'Декан',
  facultyId: 'Факультет',
  headId: 'Завідувач',
  role: 'Роль',
  canModerateRating: 'Модерація рейтингу',
  registryKey: 'Ключ у довіднику',
  staffId: 'Співробітник',
  password: 'Пароль',
  passwordHash: 'Пароль',
  invitedAt: 'Запрошення надіслано',
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
  requiresVerification: 'Потребує перевірки',
  entityFirstEntry: 'Внесення групою',
  closedAt: 'Рік закрито',
  code: 'Код показника',
  licencePositions: 'Позиції ліцензійних умов',
  // Характеристика — evidence typed by hand or carried in from the pre-2025
  // files. `text` and `count` are deliberately plain: the audit log prints them
  // verbatim, and this is the one place the document's content is editable.
  position: 'Позиція ліцензійних умов',
  text: 'Дані підтвердження',
  count: 'Кількість одиниць',
  // Розподіл ставок. All of these are stored as integer hundredths. The label
  // used to say «(сотих)» and print the raw 135; the audit log now formats the
  // VALUE instead — «1,35» — because a reader should not have to divide by a
  // hundred in their head to check a ставка (2026-08-24). See `resolve` in
  // app/(dashboard)/admin/audit-log/page.tsx; adding a field here means adding
  // it there too.
  kstHundredths: 'Кст',
  minHundredths: 'Мінімальна ставка',
  maxHundredths: 'Максимальна ставка',
  bonusPoolHundredths: 'Бонусний пул',
  valueHundredths: 'Надбавка за посаду',
  base: 'Норматив (бакалавр, денна)',
  contractCoefficient: 'Узгоджуючий коефіцієнт',
};
