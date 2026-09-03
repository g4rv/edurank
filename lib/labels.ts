import type {
  AcademicRank,
  AdminPosition,
  Role,
  ScientificDegree,
  StudentDegree,
  StudentFunding,
  StudyForm,
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

/**
 * The three student enums, in the words the claim screens have used since
 * August. Lifted out of components/stake/{claims-review,my-claims}.tsx, which
 * each carried their own copy — /admin/students would have made a third.
 */
export const STUDENT_DEGREE_LABELS: Record<StudentDegree, string> = {
  BACHELOR: 'Бакалавр',
  MASTER: 'Магістр',
};

export const STUDY_FORM_LABELS: Record<StudyForm, string> = {
  FULL_TIME: 'Денна',
  PART_TIME: 'Заочна',
};

export const STUDENT_FUNDING_LABELS: Record<StudentFunding, string> = {
  STATE: 'Бюджет',
  CONTRACT: 'Контракт',
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
  // files. `text` is deliberately plain: the audit log prints it verbatim, and
  // this is the one place the document's content is editable.
  position: 'Позиція ліцензійних умов',
  text: 'Дані підтвердження',
  // Which alternative of the position — п.2 alone has more than one. The stored
  // value is the machine name («patent»), which is what the audit log shows; the
  // form is where the reader gets the sentence.
  group: 'Альтернатива позиції',
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
  // Реєстр зарахованих (AdmittedStudent). `name` and `year` are shared with
  // other entities above, so their wording for a здобувач lives in
  // ENTITY_FIELD_LABELS below — the audit log printed «Назва: Ковальчук Олена
  // Ігорівна» until it did.
  //
  // `nameNormalised` is deliberately absent: it is derived from `name`, so
  // logging it would show every change twice, the second time in a spelling
  // nobody typed.
  specialityId: 'Спеціальність',
  degree: 'Ступінь',
  form: 'Форма навчання',
  funding: 'Фінансування',
  /** Not a column — the claims a deleted здобувач took down with them */
  claims: 'Заявки НПП',
  /** Not columns either — what one import RUN did, logged as a single entry */
  added: 'Додано',
  skipped: 'Вже було в списку',
  file: 'Файл',
};

/**
 * Labels that apply to ONE entity, consulted before `FIELD_LABELS`.
 *
 * `FIELD_LABELS` is keyed by column name across every model, so a name shared
 * by two of them can only have one wording. «Назва» is right for a кафедра and
 * wrong for a person: the audit log printed «Назва: Ковальчук Олена Ігорівна».
 * Rather than rename the column or reword it for everybody, an entity may
 * override the few keys that mean something different to it.
 */
export const ENTITY_FIELD_LABELS: Record<string, Record<string, string>> = {
  AdmittedStudent: {
    name: 'ПІБ',
    year: 'Рік вступу',
  },
};
