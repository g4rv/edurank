// 2026 rating catalogue — generated from docs/rating-2026-catalogue.md
// (extracted from edu-reference/Проєкт рейтинг 2026.xlsx, Sheet 1).
// Ukrainian strings here are seed DATA (stored in DB), not UI text.

/**
 * Short division keys used by the catalogue. The key itself lives on the row as
 * `Division.registryKey`; the name here is only what the seed CREATES the
 * division with. An admin may rename it afterwards, so nothing at runtime may
 * look a division up by name.
 */
export const RATING_DIVISIONS = {
  KADRY: 'Відділ кадрів',
  NAVCH: 'Навчальний відділ',
  NNV: 'Навчально-науковий відділ',
  NNCZYAO: 'Навчально-науковий центр забезпечення якості освіти',
  VMZ: "Відділ міжнародних зв'язків",
  VA: 'Відділ аспірантури',
} as const;

export type RatingDivisionKey = keyof typeof RATING_DIVISIONS;

/**
 * How a division is named where space is short — the rating table's «хто
 * вносить» hint and the export's «Дані внесені» column.
 *
 * Keyed by `registryKey`, never by name: the name is what an admin edits on
 * /divisions, and matching on it has already broken two things once.
 * A division an admin created themselves has no key and keeps its full name.
 */
export const RATING_DIVISION_SHORT: Record<RatingDivisionKey, string> = {
  KADRY: 'Відділ кадрів',
  NAVCH: 'Навч. відділ',
  NNV: 'ННВ',
  NNCZYAO: 'ННЦЗЯО',
  VMZ: 'ВМЗ',
  VA: 'ВА',
};

/** Short name for a division row, falling back to its own name */
export function shortDivisionName(division: { name: string; registryKey: string | null }): string {
  const key = division.registryKey as RatingDivisionKey | null;
  return (key && RATING_DIVISION_SHORT[key]) || division.name;
}

export const SECTION_TITLES: Record<number, string> = {
  1: 'Показники професійного розвитку',
  2: 'Показники навчальної діяльності',
  3: 'Показники науково-інноваційної діяльності',
  4: 'Показники організаційної діяльності',
  5: 'Навчально-методичне забезпечення навчальних дисциплін на платформі Moodle',
};

/**
 * How the score is computed (drives the scoring engine and evidence forms):
 * - FIXED       score = coefficient × count (count is 1 or number of repeatable entries)
 * - MULT        score = coefficient × numeric value (years, h-index, авт. аркуші…)
 * - SELECT      score = points of the chosen option (coefficient stays 1)
 * - SELECT_MULT score = option points × numeric value (credits, авт. аркуші…)
 * - CHECK_SUM   sum of the ticked checkboxes' own points, read from the column
 *               the chosen `mode` selects; the mode's points are the maximum
 */
export type ActivityKind = 'FIXED' | 'MULT' | 'SELECT' | 'SELECT_MULT' | 'CHECK_SUM';

export type ActivityInputSource = 'NPP_SUBMISSION' | 'DIVISION_MANAGED' | 'PROFILE_DERIVED';

export interface ActivityTypeDef {
  /** Stable semantic key — survives yearly renumbering; unique per template */
  code: string;
  section: 1 | 2 | 3 | 4 | 5;
  order: number;
  /** Printed item number in the 2026 sheet (display only) */
  itemNumber: string;
  label: string;
  kind: ActivityKind;
  /** FIXED/MULT: points per unit. SELECT/SELECT_MULT/CHECK_SUM: 1 (option points live in the field specs) */
  coefficient: number;
  /** The «Критерії» column: option points, units, conditions */
  coefficientNote?: string;
  inputSource: ActivityInputSource;
  /**
   * Only for DIVISION_MANAGED: the division whose own panel enters this row.
   * NPP_SUBMISSION rows have none — submissions are auto-approved (post-moderation:
   * ННВ editors or ADMIN can discard with a reason).
   */
  verifyingDivision?: RatingDivisionKey;
  /** «не більше N» caps from the sheet — enforced in the submit action per staff/year */
  maxPerYear?: number;
  /**
   * Offers the manual «Перевірено» check on /moderation — ННВ confirming the
   * publication is really indexed. Never affects the score.
   */
  requiresVerification?: boolean;
  /**
   * Offers the bulk entity-first dialog on /division-data: the object (проєкт,
   * рада, освітня програма) is entered once and fanned out to everyone involved,
   * instead of filling the same evidence in one grid cell at a time.
   */
  entityFirstEntry?: boolean;
}

export const ACTIVITY_TYPES_2026: ActivityTypeDef[] = [
  // ── Розділ 1 — Показники професійного розвитку ──────────────────────────────
  {
    code: 'pedagogical_experience',
    section: 1,
    order: 1,
    itemNumber: '1.1',
    label: 'Науково-педагогічний стаж',
    kind: 'MULT',
    coefficient: 1,
    coefficientNote: '1 бал за рік',
    inputSource: 'PROFILE_DERIVED',
  },
  {
    code: 'academic_rank',
    section: 1,
    order: 2,
    itemNumber: '1.2',
    label: 'Вчене звання',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote: 'професор — 50, доцент — 30, старший викладач — 15, викладач — 10',
    inputSource: 'PROFILE_DERIVED',
  },
  {
    code: 'scientific_degree',
    section: 1,
    order: 3,
    itemNumber: '1.3',
    label: 'Науковий ступінь',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'доктор наук за спеціальністю кафедри — 50, доктор наук — 40, кандидат наук (PhD) за спеціальністю кафедри — 30, кандидат наук (PhD) — 20',
    inputSource: 'PROFILE_DERIVED',
  },
  {
    code: 'honors_awards',
    section: 1,
    order: 4,
    itemNumber: '1.4',
    label: 'Інші звання і відзнаки',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'Заслужений працівник — 50, Відмінник освіти України — 30, інші державні та відомчі нагороди (за звітний рік) — 30, відзнаки обласного рівня, регіональні та університетські (за звітний рік) — 10',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'KADRY',
  },
  {
    code: 'mon_nazyavo_councils',
    section: 1,
    order: 5,
    itemNumber: '1.5',
    label: "Участь у радах, робочих групах та інших об'єднаннях МОН та НАЗЯВО",
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'член експертних та науково-методичних комісій МОН України, галузевих експертних рад НАЗЯВО — 80, член експертних комісій НФДУ та інших державних комісій — 50, участь у складі експертних груп та комісій — 50',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'admin_position',
    section: 1,
    order: 6,
    itemNumber: '1.6',
    label: 'Займана адміністративна посада',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'проректор — 100, декан — 80, заступник декана / вчений секретар університету / відповідальний секретар приймальної комісії — 50, завідувач кафедри / керівник відділу — 60, заступник завідувача кафедри — 40, заступник відповідального секретаря приймальної комісії — 30, завідувач лабораторії / керівник центру — 30',
    inputSource: 'PROFILE_DERIVED',
  },
  {
    code: 'program_guarantor',
    section: 1,
    order: 7,
    itemNumber: '1.7',
    label: 'Гарант освітньої програми',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'на поточний навчальний рік (за умови реалізації ОП) — 100, на рік акредитації — 1000',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNCZYAO',
  },
  {
    code: 'program_group_member',
    section: 1,
    order: 8,
    itemNumber: '1.7',
    label: 'Член групи НПП, які відповідають за реалізацію освітньої програми',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'на поточний навчальний рік (за умови реалізації ОП) — 60, на рік акредитації — 500',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNCZYAO',
  },
  {
    code: 'university_councils',
    section: 1,
    order: 9,
    itemNumber: '1.8',
    label:
      'Робота у науково-методичній та навчально-методичній радах, раді з якості освіти університету та інших комісіях університету',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote: 'голова — 100, секретар — 80, член ради — 50',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNCZYAO',
    entityFirstEntry: true,
  },
  {
    code: 'basic_education_match',
    section: 1,
    order: 10,
    itemNumber: '1.9',
    label: 'Базова освіта за спеціальністю кафедри',
    kind: 'FIXED',
    coefficient: 50,
    inputSource: 'PROFILE_DERIVED',
  },
  {
    code: 'prof_associations',
    section: 1,
    order: 11,
    itemNumber: '1.10',
    label: "Участь у професійних об'єднаннях за спеціальністю",
    kind: 'FIXED',
    coefficient: 10,
    coefficientNote: "10 балів за об'єднання",
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'second_higher_education',
    section: 1,
    order: 12,
    itemNumber: '1.11',
    label: 'Підвищення кваліфікації у поточному році шляхом здобуття другої вищої освіти',
    kind: 'FIXED',
    coefficient: 100,
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NAVCH',
  },
  {
    code: 'intl_internship',
    section: 1,
    order: 13,
    itemNumber: '1.11',
    label: 'Міжнародні стажування у поточному році (не менше 1 місяця)',
    kind: 'SELECT_MULT',
    coefficient: 1,
    coefficientNote: 'очно — 100 балів за кредит, дистанційно — 20 балів за кредит',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NAVCH',
  },
  {
    code: 'ukr_internship',
    section: 1,
    order: 14,
    itemNumber: '1.11',
    label: 'Стажування в Україні у поточному році (не менше 1 місяця)',
    kind: 'SELECT_MULT',
    coefficient: 1,
    coefficientNote: 'очно — 50 балів за кредит, дистанційно — 10 балів за кредит',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NAVCH',
  },
  {
    code: 'qualification_mentoring',
    section: 1,
    order: 15,
    itemNumber: '1.11',
    label: 'Керівництво підвищенням кваліфікації працівника іншого закладу освіти',
    kind: 'FIXED',
    coefficient: 10,
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NAVCH',
  },

  // ── Розділ 2 — Показники навчальної діяльності ──────────────────────────────
  {
    code: 'teaching_load',
    section: 2,
    order: 1,
    itemNumber: '2.1',
    label: 'Виконання навчального навантаження',
    kind: 'MULT',
    coefficient: 1,
    coefficientNote: 'одиниця виміру уточнюється (див. каталог, ⚠️#2)',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NAVCH',
  },
  {
    code: 'edition_publication',
    section: 2,
    order: 2,
    itemNumber: '2.2',
    label: 'Видання, затверджені вченою радою університету',
    kind: 'SELECT_MULT',
    coefficient: 1,
    coefficientNote:
      'підручник — 200, навчальний посібник — 150, навчально-методичний посібник — 100, методичні рекомендації (словник, довідник) — 80; балів × друковані аркуші / співавтори (др. арк. = сторінок / 24)',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'foreign_language_teaching',
    section: 2,
    order: 3,
    itemNumber: '2.3',
    label:
      'Проведення навчальних занять іноземною мовою (крім мовних дисциплін) не менше 30 аудиторних годин',
    kind: 'FIXED',
    coefficient: 30,
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'accreditation_self_analysis',
    section: 2,
    order: 4,
    itemNumber: '2.4',
    label: 'Підготовка матеріалів акредитаційного самоаналізу',
    kind: 'FIXED',
    coefficient: 400,
    coefficientNote: 'балів / авторський колектив',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNCZYAO',
    entityFirstEntry: true,
  },
  {
    code: 'edu_program_development',
    section: 2,
    order: 5,
    itemNumber: '2.4',
    label: 'Розробка та оформлення освітніх програм зі спеціальності',
    kind: 'FIXED',
    coefficient: 200,
    coefficientNote: 'балів / група розробників',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNCZYAO',
    entityFirstEntry: true,
  },
  {
    code: 'edu_program_update',
    section: 2,
    order: 6,
    itemNumber: '2.4',
    label: 'Оновлення освітніх програм зі спеціальності',
    kind: 'FIXED',
    coefficient: 60,
    coefficientNote: 'балів / група розробників',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNCZYAO',
    entityFirstEntry: true,
  },
  {
    code: 'accreditation_expert_meeting',
    section: 2,
    order: 7,
    itemNumber: '2.5',
    label: 'Участь у зустрічі з експертною групою під час акредитації освітньої програми',
    kind: 'FIXED',
    coefficient: 20,
    coefficientNote: 'за 1 зустріч',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNCZYAO',
    entityFirstEntry: true,
  },
  {
    code: 'curriculum_development',
    section: 2,
    order: 8,
    itemNumber: '2.6',
    label: 'Розробка та оформлення нового навчального плану',
    kind: 'FIXED',
    coefficient: 80,
    coefficientNote: 'балів / група розробників',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNCZYAO',
    entityFirstEntry: true,
  },
  {
    code: 'curriculum_update',
    section: 2,
    order: 9,
    itemNumber: '2.6',
    label: 'Оновлення навчального плану',
    kind: 'FIXED',
    coefficient: 50,
    coefficientNote: 'балів / група розробників',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNCZYAO',
    entityFirstEntry: true,
  },
  {
    code: 'subject_committee',
    section: 2,
    order: 10,
    itemNumber: '2.7',
    label: 'Виконання обов’язків у предметній комісії',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote: 'голова — 50, член — 30',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNCZYAO',
    entityFirstEntry: true,
  },
  {
    code: 'group_curator',
    section: 2,
    order: 11,
    itemNumber: '2.8',
    label: 'Кураторство академгрупою',
    kind: 'FIXED',
    coefficient: 40,
    coefficientNote: '40 балів за групу',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'video_lectures',
    section: 2,
    order: 12,
    // у «Проєкт рейтинг 2026» цей рядок має той самий номер 2.8, що й кураторство
    itemNumber: '2.8',
    label: 'Розробка відеолекцій лекційних курсів на стрімінгових платформах',
    kind: 'FIXED',
    coefficient: 100,
    coefficientNote: 'за кожну лекцію',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'unit_website_responsible',
    section: 2,
    order: 13,
    itemNumber: '2.9',
    label: 'Відповідальний за інформаційне наповнення сайту структурного підрозділу',
    kind: 'FIXED',
    coefficient: 50,
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNCZYAO',
  },
  {
    code: 'unit_social_media_responsible',
    section: 2,
    order: 14,
    itemNumber: '2.9',
    label: 'Відповідальний за наповнення сторінки структурного підрозділу в соціальних мережах',
    kind: 'FIXED',
    coefficient: 10,
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNCZYAO',
  },

  // ── Розділ 3 — Показники науково-інноваційної діяльності ────────────────────
  {
    code: 'intl_grant_won',
    section: 3,
    order: 1,
    itemNumber: '3.1',
    label:
      'Участь у виконанні міжнародних наукових та освітніх програм і проєктів, за якими виграно грант',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'керівник/координатор проєкту — 450, менеджер, керівник академічної (робочої) групи — 350, учасник академічної групи / виконавець (тренер) — 150, виконавець (технічний та адміністративний персонал) — 100',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'VMZ',
    entityFirstEntry: true,
  },
  {
    code: 'intl_program_participation',
    section: 3,
    order: 2,
    itemNumber: '3.2',
    label: 'Участь у реалізації міжнародних програм та проєктів',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote: 'керівник/координатор — 450, менеджер — 350, виконавець — 150, учасник — 100',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'VMZ',
    entityFirstEntry: true,
  },
  {
    code: 'intl_grant_application',
    section: 3,
    order: 3,
    itemNumber: '3.3',
    label: 'Підготовка та подання на конкурс міжнародних грантових програм та проєктів',
    kind: 'FIXED',
    coefficient: 100,
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'VMZ',
    entityFirstEntry: true,
  },
  {
    code: 'ukr_grant_application',
    section: 3,
    order: 4,
    itemNumber: '3.3',
    label: 'Підготовка та подання на конкурс всеукраїнських грантових програм та проєктів',
    kind: 'FIXED',
    coefficient: 70,
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNV',
    entityFirstEntry: true,
  },
  {
    code: 'ndr_execution',
    section: 3,
    order: 5,
    itemNumber: '3.4',
    label: 'Виконання науково-дослідних робіт НДР (державне, госпдоговірне фінансування)',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote: 'керівник — 300, виконавець — 200',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNV',
    entityFirstEntry: true,
  },
  {
    code: 'initiative_topic',
    section: 3,
    order: 6,
    itemNumber: '3.5',
    label: 'Реалізація ініціативної тематики кафедри (за умови реєстрації в УкрІНТЕІ)',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote: 'керівник — 15, виконавець — 10',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'intl_open_lectures',
    section: 3,
    order: 7,
    itemNumber: '3.6',
    label:
      'Проведення відкритих лекцій в рамках реалізації міжнародних проєктів та угод (у тому числі на онлайн-платформах)',
    kind: 'FIXED',
    coefficient: 50,
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'VMZ',
  },
  {
    code: 'monograph_ua',
    section: 3,
    order: 8,
    itemNumber: '3.7',
    label: 'Видання монографії (українською мовою)',
    kind: 'MULT',
    coefficient: 200,
    coefficientNote: "балів × друковані аркуші / співавтори; обов'язково ISBN",
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'monograph_eu',
    section: 3,
    order: 9,
    itemNumber: '3.7',
    label: 'Видання монографії (мовою країн Європейського союзу)',
    kind: 'MULT',
    coefficient: 300,
    coefficientNote: 'балів × друковані аркуші / співавтори',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'publication_cat_a',
    section: 3,
    order: 10,
    itemNumber: '3.8',
    label:
      'Публікації у виданнях, що входять до наукометричних баз даних Scopus, WoS та категорії «А»',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'квартиль Q1 — 600, квартиль Q2 — 500, квартиль Q3-4 / відсутній — 400; посилання Scopus або WoS',
    inputSource: 'NPP_SUBMISSION',
    requiresVerification: true,
  },
  {
    code: 'publication_cat_b',
    section: 3,
    order: 11,
    itemNumber: '3.9',
    label: 'Публікації у фахових наукових виданнях України категорії «Б»',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote: 'одноосібно — 300, співавторство — 150',
    inputSource: 'NPP_SUBMISSION',
    requiresVerification: true,
  },
  {
    code: 'defense_supervision',
    section: 3,
    order: 12,
    itemNumber: '3.10',
    label: 'Захист під керівництвом науково-педагогічного працівника',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'дисертація на здобуття наукового ступеня доктора наук — 500, дисертація на здобуття наукового ступеня кандидата наук (PhD) — 300',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'scientific_supervision',
    section: 3,
    order: 13,
    itemNumber: '3.11',
    label: 'Наукове консультування або керівництво',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'докторант — 100, аспірант/здобувач — 50, здобувач другого (магістерського) рівня — 20, здобувач першого (бакалаврського) рівня — 10',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'intl_olympiad_winners',
    section: 3,
    order: 14,
    itemNumber: '3.12',
    label:
      'Підготовка здобувачів вищої освіти, що стали призерами міжнародних студентських олімпіад та конкурсів наукових робіт, мистецьких та спортивних заходів',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote: '1 місце — 100, 2 місце — 80, 3 місце — 60',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'ukr_olympiad_winners',
    section: 3,
    order: 15,
    itemNumber: '3.13',
    label:
      'Підготовка здобувачів вищої освіти, що стали призерами всеукраїнських студентських олімпіад та конкурсів наукових робіт, мистецьких та спортивних заходів',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote: '1 місце — 80, 2 місце — 60, 3 місце — 40',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'olympiad_jury',
    section: 3,
    order: 16,
    itemNumber: '3.14',
    label:
      'Робота у складі оргкомітету/журі ІІ туру студентських олімпіад та конкурсів, конкурсів наукових робіт МАН',
    kind: 'FIXED',
    coefficient: 30,
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'scientific_school',
    section: 3,
    order: 17,
    itemNumber: '3.15',
    label: 'Керівництво науковою школою',
    kind: 'FIXED',
    coefficient: 500,
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNV',
  },
  {
    code: 'specialized_council',
    section: 3,
    order: 18,
    itemNumber: '3.16',
    label: 'Робота у спеціалізованих вчених радах',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'голова — 150, заступник, відповідальний секретар, вчений секретар — 100, член ради — 50',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'VA',
    entityFirstEntry: true,
  },
  {
    code: 'journal_editorial_a',
    section: 3,
    order: 19,
    itemNumber: '3.17',
    label: 'Робота по виданню фахових наукових збірників, журналів категорії «А»',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'головний редактор — 250, заступник (відповідальний секретар) — 200, член редакційної колегії — 150, технічний секретар — 140; при наявності підтвердження у системі URIS',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNV',
    entityFirstEntry: true,
  },
  {
    code: 'journal_editorial_b',
    section: 3,
    order: 20,
    itemNumber: '3.17',
    label: 'Робота по виданню фахових наукових збірників, журналів категорії «Б»',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'головний редактор — 200, заступник (відповідальний секретар) — 160, член редакційної колегії — 150, технічний секретар — 120; при наявності підтвердження у системі URIS',
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNV',
    entityFirstEntry: true,
  },
  {
    code: 'journal_website_support',
    section: 3,
    order: 21,
    itemNumber: '3.17',
    label: 'Внесення даних та супровід сайту наукового збірника',
    kind: 'FIXED',
    coefficient: 100,
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNV',
  },
  {
    code: 'org_consulting',
    section: 3,
    order: 22,
    itemNumber: '3.18',
    label: 'Наукове консультування установ, організацій (не менше 3-ох років)',
    kind: 'FIXED',
    coefficient: 50,
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'conf_abroad',
    section: 3,
    order: 23,
    itemNumber: '3.19',
    label:
      'Участь у міжнародних наукових конференціях, симпозіумах, семінарах, круглих столах за кордоном (не більше 5)',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote: 'очна — 50, заочна (дистанційна) — 20',
    inputSource: 'NPP_SUBMISSION',
    maxPerYear: 5,
  },
  {
    code: 'conf_ukraine',
    section: 3,
    order: 24,
    itemNumber: '3.20',
    label:
      'Участь у міжнародних (всеукраїнських) наукових конференціях, симпозіумах, семінарах, круглих столах в Україні (не більше 5)',
    kind: 'FIXED',
    coefficient: 10,
    inputSource: 'NPP_SUBMISSION',
    maxPerYear: 5,
  },
  {
    code: 'edu_exhibitions',
    section: 3,
    order: 25,
    itemNumber: '3.21',
    label: 'Участь в освітянських виставках міжнародного рівня',
    kind: 'FIXED',
    coefficient: 30,
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNV',
  },
  {
    code: 'dissertation_opponent',
    section: 3,
    order: 26,
    itemNumber: '3.22',
    label: 'Опонування та експертиза дисертацій',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote: 'доктора наук — 200, кандидата наук (PhD) — 100',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'mon_textbook_expertise',
    section: 3,
    order: 27,
    itemNumber: '3.23',
    label: 'Експертиза підручників у складі груп МОН України',
    kind: 'FIXED',
    coefficient: 30,
    inputSource: 'DIVISION_MANAGED',
    verifyingDivision: 'NNV',
  },
  {
    code: 'citations_wos',
    section: 3,
    order: 28,
    itemNumber: '3.24',
    label: 'Показники цитувань наукових статей — WoS',
    kind: 'MULT',
    coefficient: 100,
    coefficientNote: '100 × h-індекс',
    inputSource: 'PROFILE_DERIVED',
  },
  {
    code: 'citations_scopus',
    section: 3,
    order: 29,
    itemNumber: '3.24',
    label: 'Показники цитувань наукових статей — Scopus',
    kind: 'MULT',
    coefficient: 100,
    coefficientNote: '100 × h-індекс',
    inputSource: 'PROFILE_DERIVED',
  },
  {
    code: 'citations_scholar',
    section: 3,
    order: 30,
    itemNumber: '3.24',
    label: 'Показники цитувань наукових статей — Google Scholar',
    kind: 'MULT',
    coefficient: 10,
    coefficientNote: '10 × h-індекс',
    inputSource: 'PROFILE_DERIVED',
  },
  {
    code: 'patent_granted',
    section: 3,
    order: 31,
    itemNumber: '3.25',
    label: 'Отримання патенту на винахід / патенту на корисну модель',
    kind: 'FIXED',
    coefficient: 50,
    coefficientNote: 'за 1 патент',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'patent_application',
    section: 3,
    order: 32,
    itemNumber: '3.25',
    label: 'Підготовка та подача заявки на винахід / на корисну модель',
    kind: 'FIXED',
    coefficient: 25,
    coefficientNote: 'за 1 заявку',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'copyright_registration',
    section: 3,
    order: 33,
    itemNumber: '3.25',
    label:
      'Оформлення та реєстрація авторського права на об’єкт інтелектуальної власності (свідоцтво)',
    kind: 'FIXED',
    coefficient: 25,
    coefficientNote: 'за 1 свідоцтво',
    inputSource: 'NPP_SUBMISSION',
  },

  // ── Розділ 4 — Показники організаційної діяльності ──────────────────────────
  {
    code: 'intl_conf_organization',
    section: 4,
    order: 1,
    itemNumber: '4.1',
    label:
      'Організація та проведення міжнародних наукових конференцій, симпозіумів, семінарів, круглих столів, олімпіад та конкурсів наукових робіт',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'голова оргкомітету — 100, заступник (відповідальний секретар) — 80, член оргкомітету — 50',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'ukr_conf_organization',
    section: 4,
    order: 2,
    itemNumber: '4.1',
    label:
      'Організація та проведення всеукраїнських наукових конференцій, симпозіумів, семінарів, круглих столів, олімпіад та конкурсів наукових робіт',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'голова оргкомітету — 50, заступник (відповідальний секретар) — 40, член оргкомітету — 20',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'cultural_sport_events',
    section: 4,
    order: 3,
    itemNumber: '4.2',
    label: 'Організація та участь у проведенні культурно-мистецьких та спортивних заходів',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote:
      'міжнародного рівня — 100, всеукраїнського рівня — 50, регіонального рівня — 25, університетського рівня — 10, факультетського рівня — 5, одноденні змагання — 4',
    inputSource: 'NPP_SUBMISSION',
  },
  {
    code: 'educational_events',
    section: 4,
    order: 4,
    itemNumber: '4.3',
    label: 'Організація масових виховних заходів',
    kind: 'SELECT',
    coefficient: 1,
    coefficientNote: 'загальноуніверситетський — 10, факультетський — 5',
    inputSource: 'NPP_SUBMISSION',
  },

  // ── Розділ 5 — Навчально-методичне забезпечення (Moodle) ────────────────────
  {
    code: 'moodle_course',
    section: 5,
    order: 1,
    itemNumber: '5.1',
    label:
      'Навчально-методичне забезпечення навчальних дисциплін (освітніх компонентів) на платформі Moodle',
    kind: 'CHECK_SUM',
    coefficient: 1,
    coefficientNote:
      'Максимум: Розроблення — 150, Оновлення — 50. Кожен матеріал має власну вартість (розроблення/оновлення): робоча програма 15/5, силабус 5/5, тестові завдання (питання до тестів) 20/10, конспекти лекцій 50/10, презентації 30/10, методичні матеріали для практичних робіт 30/10. Бали нараховуються за позначені матеріали — заповнювати всі не обов’язково',
    inputSource: 'NPP_SUBMISSION',
  },
];
