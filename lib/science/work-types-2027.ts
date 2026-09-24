import type { EvidenceField } from '@/lib/rating/evidence-fields';
import type { ScoringSpec } from '@/lib/specs/scoring';
import type { ActivityKind } from '@/lib/rating/activity-types';

/**
 * Додаток III до наказу №152 від 04.05.2026 — SEED INPUT ONLY.
 *
 * After `pnpm db:seed` the database is the truth and this file is history, the
 * same contract `ACTIVITY_TYPES_2026` has with the rating. An ADMIN edits the
 * catalogue at /admin/science-plan/[year]; nobody edits it here.
 *
 * **Twenty-six types from eighteen printed items.** An item that prices two
 * different units is two types, because one type has one scoring rule: п.6 pays
 * 5 г за сторінку for a доповідь and 6 г за день for attendance, and п.7 pays
 * per друкований аркуш, per дисертація, per проєкт and per рецензія.
 *
 * **The authoritative source is the STANDALONE Додаток 3 file**, not the copy
 * bound into the наказ. They differ: item 3 there reads «монографії,
 * підручника, посібника — 200 г./100 г.» against «монографії, підручника —
 * 200 г.» bound in, and item 16 reads 50 г against 56.
 *
 * **Evidence keys are dictated by the scoring engine, not chosen.**
 * `lib/specs/scoring.ts` reads them by hardcoded name: a SELECT or SELECT_MULT
 * takes its points from a select called **`option`**, a SELECT_MULT multiplies
 * by a number called **`credits`**, and a MULT multiplies by one called
 * **`value`**. That is the convention the whole rating catalogue already uses —
 * `select('option', 'Квартиль', …)`, `select('option', 'Посада', …)` — and a
 * second convention in the same JSON column would be one more pair of copies
 * to drift apart. **The key is plumbing; the Ukrainian LABEL is what a person
 * reads**, so «Видання», «Кількість сторінок» and «Роль у проєкті» all survive
 * intact.
 *
 * **`pageBased` is never set here.** It is the rating's «сторінок / 24 /
 * співавторів» rule. Додаток III prices друковані аркуші directly and divides
 * by no co-authors at all — the hours are a pool the authors share, which is
 * Stage 2's job and a different arithmetic entirely.
 *
 * **`reuse` and `sharing` are first readings of the наказ, not law.** The
 * Примітка column says «щороку» or «на навчальний рік» for five items, and those
 * are YEARLY; everything else is ONCE. SHARED is set where a work genuinely has
 * co-authors. ADMIN can change either on any row, which is the point of their
 * being columns.
 */
export interface ScienceWorkTypeDef {
  code: string;
  /** The printed number in Додаток III — several types may share one. */
  itemNumber: string;
  /**
   * The пункт's own heading, where the наказ prints one over several kinds of
   * work. Set it on EVERY type of that пункт, identically.
   *
   * Left out where the пункт holds a single вид роботи: the seed then copies
   * the label, because a пункт with one type IS that type.
   */
  itemTitle?: string;
  order: number;
  label: string;
  /** What the second picker field shows. Set wherever a пункт has several. */
  shortLabel?: string;
  kind: ActivityKind;
  /** Hours per unit. For SELECT kinds this is 1 and the hours are on the options. */
  coefficient: number;
  /** The Примітка column, verbatim. */
  unitNote?: string;
  /** The Форма звітності column, verbatim. */
  reportingForm?: string;
  reuse: 'ONCE' | 'YEARLY';
  sharing: 'SHARED' | 'INDIVIDUAL';
  /** Field names, in priority order, that build the work's identity in Stage 2. */
  identityFields: readonly string[];
  /** D47 — how the link and the file prove this type. Both default to
   *  OPTIONAL; the eight D39 types are link REQUIRED, file NONE. */
  linkRule?: 'REQUIRED' | 'OPTIONAL' | 'NONE';
  fileRule?: 'REQUIRED' | 'OPTIONAL' | 'NONE';
  maxPerYear?: number;
  fields: readonly EvidenceField[];
}

/** «Назва роботи» — every type has one, and it is the identity of last resort. */
const title: EvidenceField = {
  kind: 'text',
  name: 'title',
  label: 'Назва роботи',
};

/**
 * The number the hours multiply by — сторінки, друковані аркуші, дні, особи.
 *
 * **Its name is dictated by the scoring kind, not by the domain:** the engine
 * reads `credits` for SELECT_MULT and `value` for MULT (see the docstring
 * above). Pass the right one; the LABEL carries the meaning.
 */
const count = (name: 'credits' | 'value', label: string): EvidenceField => ({
  kind: 'number',
  name,
  label,
  min: 1,
});

/**
 * A person's ПІБ in three boxes under one label — Прізвище / Ім'я / По батькові
 * (owner, 2026-09-23), the same joined set the Характеристика's п.15 uses for a
 * школяр. `cyrillicName` keeps «asd» out; the по батькові is optional, since
 * not everybody has one.
 *
 * The three share `join`, and an `identityFields` entry naming that join means
 * the WHOLE name (`workKey`) — its key is the one a single box typed «Прізвище
 * Ім'я По батькові» gave, so nothing already saved changes identity.
 */
const personName = (join: string, label: string): EvidenceField[] => [
  {
    kind: 'text',
    name: `${join}Last`,
    label: 'Прізвище',
    join,
    joinLabel: label,
    rule: 'cyrillicName',
  },
  { kind: 'text', name: `${join}First`, label: 'Ім’я', join, rule: 'cyrillicName' },
  {
    kind: 'text',
    name: `${join}Middle`,
    label: 'По батькові',
    join,
    rule: 'cyrillicName',
    optional: true,
  },
];

/** A plain descriptive text field — a topic, a committee, a title. */
const text = (name: string, label: string, optional?: boolean): EvidenceField => ({
  kind: 'text',
  name,
  label,
  ...(optional ? { optional: true } : {}),
});

/**
 * The one select every SELECT / SELECT_MULT type has. **Always named
 * `option`** — see the docstring above; the LABEL is what a person reads.
 */
const option = (
  label: string,
  options: readonly { value: string; label: string; points: number }[]
): EvidenceField => ({ kind: 'select', name: 'option', label, options });

const url = (name: string, label: string, optional?: boolean): EvidenceField => ({
  kind: 'url',
  name,
  label,
  ...(optional ? { optional: true } : {}),
});

/**
 * A calendar date. D48: the стаття's «Дата публікації» — shown to ННВ to check
 * against the linked page, never refused automatically, and NEVER one of a
 * type's identityFields, so a typed date cannot make one article look like two.
 */
const date = (name: string, label: string): EvidenceField => ({ kind: 'date', name, label });

const doi = (name: string, label: string, optional?: boolean): EvidenceField => ({
  kind: 'doi',
  name,
  label,
  ...(optional ? { optional: true } : {}),
});

export const SCIENCE_WORK_TYPES_2027: readonly ScienceWorkTypeDef[] = [
  {
    code: 'intl_grant_program',
    itemNumber: '1',
    itemTitle: 'Участь у міжнародних програмах і проєктах',
    shortLabel: 'Програма на проведення досліджень в університеті (грант)',
    order: 1,
    label:
      'Участь у міжнародних програмах на проведення в університеті наукових досліджень з отримання гранту',
    kind: 'FIXED',
    coefficient: 400,
    unitNote: 'За одну програму',
    reportingForm: 'Звіт — грант',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    linkRule: 'REQUIRED',
    fileRule: 'NONE',
    identityFields: ['title'],
    fields: [title],
  },
  {
    code: 'intl_project',
    itemNumber: '1',
    itemTitle: 'Участь у міжнародних програмах і проєктах',
    shortLabel: 'Міжнародний проєкт',
    order: 2,
    label: 'Участь у міжнародних проєктах',
    kind: 'SELECT',
    coefficient: 1,
    reportingForm: 'Звіт-проєкт',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    linkRule: 'REQUIRED',
    fileRule: 'NONE',
    identityFields: ['title'],
    fields: [
      title,
      option('Роль у проєкті', [
        { value: 'lead', label: 'Керівник проєктної групи', points: 300 },
        { value: 'member', label: 'Член проєктної групи', points: 100 },
      ]),
    ],
  },
  {
    code: 'dissertation',
    itemNumber: '2',
    order: 3,
    label: 'Дисертація',
    kind: 'SELECT',
    coefficient: 1,
    unitNote:
      'Всього протягом 2/4 років. За 1 навчальний рік, без навчання в докторантурі / аспірантурі',
    reportingForm:
      'Звіт на кафедрі: не менше 1 розділу та 4 статей у фахових виданнях (доктор наук) або 2 статей (доктор філософії)',
    reuse: 'YEARLY',
    sharing: 'INDIVIDUAL',
    identityFields: ['candidate', 'title'],
    fields: [
      ...personName('candidate', 'ПІБ здобувача'),
      title,
      option('Науковий ступінь здобувача', [
        { value: 'doctor', label: 'Доктора наук', points: 500 },
        { value: 'phd', label: 'Доктора філософії', points: 300 },
      ]),
    ],
  },
  {
    code: 'monograph',
    itemNumber: '3',
    itemTitle: 'Видання та перевидання монографій, підручників, посібників',
    shortLabel: 'Видання за рекомендацією вченої ради',
    order: 4,
    label: 'Видання монографії, підручника, посібника за рекомендацією вченої ради',
    kind: 'SELECT_MULT',
    coefficient: 1,
    unitNote: 'За 1 друкований аркуш',
    reportingForm: 'Екземпляр видання / ISBN (зараховується після виходу в світ)',
    reuse: 'ONCE',
    sharing: 'SHARED',
    linkRule: 'REQUIRED',
    fileRule: 'NONE',
    identityFields: ['title'],
    fields: [
      title,
      option('Вид видання', [
        { value: 'monograph', label: 'Монографія, підручник', points: 200 },
        { value: 'manual', label: 'Посібник', points: 100 },
      ]),
      count('credits', 'Кількість друкованих аркушів'),
    ],
  },
  {
    code: 'monograph_reissue',
    itemNumber: '3',
    itemTitle: 'Видання та перевидання монографій, підручників, посібників',
    shortLabel: 'Перевидання',
    order: 5,
    label: 'Перевидання монографій, підручників',
    kind: 'MULT',
    coefficient: 50,
    unitNote: 'За 1 друкований аркуш',
    reportingForm: 'Екземпляр видання / ISBN (зараховується після виходу в світ)',
    reuse: 'ONCE',
    sharing: 'SHARED',
    linkRule: 'REQUIRED',
    fileRule: 'NONE',
    identityFields: ['title'],
    fields: [title, count('value', 'Кількість друкованих аркушів')],
  },
  {
    code: 'article',
    itemNumber: '4',
    order: 6,
    label: 'Наукова стаття',
    kind: 'SELECT_MULT',
    coefficient: 1,
    unitNote: 'За 1 сторінку (відповідно до вимог ДАК), за умови незастосування п.27 наказу',
    reportingForm: 'Екземпляр видання (зараховується після виходу в світ)',
    reuse: 'ONCE',
    sharing: 'SHARED',
    linkRule: 'REQUIRED',
    fileRule: 'NONE',
    identityFields: ['doi', 'url', 'title'],
    fields: [
      title,
      doi('doi', 'DOI', true),
      url('url', 'Посилання на статтю', true),
      option('Категорія видання', [
        {
          value: 'scopus',
          label: 'У міжнародних виданнях, що входять до Scopus, Web of Science Core Collection',
          points: 50,
        },
        {
          value: 'fahove_b',
          label: 'У наукових фахових виданнях України категорії «Б»',
          points: 30,
        },
        { value: 'foreign', label: 'У зарубіжних виданнях', points: 20 },
        { value: 'journal', label: 'У журналах', points: 15 },
        { value: 'proceedings', label: 'У збірниках наукових праць', points: 10 },
        { value: 'other', label: 'В інших виданнях', points: 5 },
      ]),
      count('credits', 'Кількість сторінок'),
      date('publishedOn', 'Дата публікації'),
    ],
  },
  {
    code: 'ip_application',
    itemNumber: '5',
    order: 7,
    label: "Підготовка та подача заявки на об'єкт права інтелектуальної власності",
    kind: 'SELECT',
    coefficient: 1,
    unitNote: 'За 1 свідоцтво',
    reportingForm: 'Свідоцтво. Патент або підтвердження поданої заявки',
    reuse: 'ONCE',
    sharing: 'SHARED',
    identityFields: ['title'],
    fields: [
      title,
      option('Вид заявки', [
        { value: 'invention', label: 'Отримання патенту на винахід', points: 100 },
        { value: 'utility_model', label: 'Отримання патенту на корисну модель', points: 40 },
        {
          value: 'copyright',
          label:
            "Оформлення та реєстрація авторського права на об'єкт інтелектуальної власності (свідоцтво)",
          points: 30,
        },
      ]),
    ],
  },
  {
    code: 'conference_paper',
    itemNumber: '6',
    itemTitle: 'Конференції, симпозіуми, семінари',
    shortLabel: 'Доповідь',
    order: 8,
    label: 'Доповіді на конференціях, симпозіумах, семінарах',
    kind: 'SELECT_MULT',
    coefficient: 1,
    unitNote: 'За 1 сторінку',
    reportingForm: 'Програма, матеріали конференції (зараховується після виходу в світ)',
    reuse: 'ONCE',
    sharing: 'SHARED',
    linkRule: 'REQUIRED',
    fileRule: 'NONE',
    identityFields: ['title'],
    fields: [
      title,
      option('Рівень конференції', [
        { value: 'international', label: 'Міжнародна', points: 5 },
        { value: 'national', label: 'Всеукраїнська', points: 3 },
        { value: 'other', label: 'Інша', points: 2 },
      ]),
      count('credits', 'Кількість сторінок доповіді'),
    ],
  },
  {
    code: 'conference_attendance',
    itemNumber: '6',
    itemTitle: 'Конференції, симпозіуми, семінари',
    shortLabel: 'Участь',
    order: 9,
    label: 'Участь у конференціях',
    kind: 'MULT',
    coefficient: 6,
    unitNote: 'За 1 день роботи, не більше 5',
    reportingForm: 'Програма, матеріали конференції',
    // YEARLY, not ONCE (owner, 2026-09-17 — D25). The наказ caps this at five
    // per рік, and a cap that restarts every year only makes sense if the
    // counting does. With a ONCE key the навчальний рік never enters
    // `workKey`, so an annual конференція attended in 2026/2027 could never be
    // attended again in any later year.
    reuse: 'YEARLY',
    sharing: 'INDIVIDUAL',
    maxPerYear: 5,
    identityFields: ['title'],
    // Not the shared `title` constant: «Назва роботи» makes no sense for
    // merely attending — there is no робота, only a conference to name.
    fields: [
      { kind: 'text', name: 'title', label: 'Назва конференції' },
      count('value', 'Кількість днів участі'),
    ],
  },
  {
    code: 'review_publication',
    itemNumber: '7',
    itemTitle: 'Рецензування, експертна оцінка, опонування',
    shortLabel: 'Монографії, підручники, посібники, словники, довідники, дипломні роботи',
    order: 10,
    label:
      'Рецензування, експертна оцінка, опонування монографій, підручників, навчальних посібників, словників, довідників, дипломних робіт',
    kind: 'MULT',
    coefficient: 10,
    unitNote: 'За 1 друкований аркуш видання',
    reportingForm: 'Тексти рецензій (зараховується після видання рецензованих робіт)',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    identityFields: ['title'],
    fields: [title, count('value', 'Кількість друкованих аркушів')],
  },
  {
    code: 'review_dissertation',
    itemNumber: '7',
    itemTitle: 'Рецензування, експертна оцінка, опонування',
    shortLabel: 'Дисертації',
    order: 11,
    label: 'Рецензування, експертна оцінка, опонування дисертацій',
    kind: 'FIXED',
    coefficient: 50,
    unitNote: 'За 1 дисертацію',
    reportingForm: 'Тексти рецензій (зараховується після видання рецензованих робіт)',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    identityFields: ['candidate'],
    fields: personName('candidate', 'ПІБ здобувача'),
  },
  {
    code: 'review_intl_project',
    itemNumber: '7',
    itemTitle: 'Рецензування, експертна оцінка, опонування',
    shortLabel: 'Міжнародні проєкти',
    order: 12,
    label: 'Рецензування міжнародних проєктів',
    kind: 'FIXED',
    coefficient: 30,
    unitNote: 'За 1 проєкт',
    reportingForm: 'Тексти рецензій',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    identityFields: ['title'],
    fields: [title],
  },
  {
    code: 'review_article',
    itemNumber: '7',
    itemTitle: 'Рецензування, експертна оцінка, опонування',
    shortLabel: 'Статті для журналів Scopus / Web of Science',
    order: 13,
    label: 'Рецензування статей для міжнародних журналів, що входять до Scopus / Web of Science',
    kind: 'FIXED',
    coefficient: 10,
    unitNote: 'За 1 рецензію',
    reportingForm: 'Тексти рецензій',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    identityFields: ['title'],
    fields: [title],
  },
  {
    code: 'state_competition_entry',
    itemNumber: '8',
    itemTitle: 'Конкурс проєктів та науково-технічних розробок за кошти державного бюджету',
    shortLabel: 'Підготовка роботи на конкурс',
    order: 14,
    label:
      'Участь у конкурсі проєктів та науково-технічних розробок, які фінансуються за рахунок коштів державного бюджету — підготовка роботи на конкурс',
    kind: 'SELECT',
    coefficient: 1,
    reportingForm: 'Наказ',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    identityFields: ['title'],
    fields: [
      title,
      option('Роль у підготовці', [
        { value: 'lead', label: 'Керівник', points: 50 },
        { value: 'secretary', label: 'Відповідальний секретар', points: 40 },
        { value: 'member', label: 'Учасник проєкту', points: 30 },
      ]),
    ],
  },
  {
    code: 'state_competition_win',
    itemNumber: '8',
    itemTitle: 'Конкурс проєктів та науково-технічних розробок за кошти державного бюджету',
    shortLabel: 'Перемога у конкурсі',
    order: 15,
    label:
      'Перемога у конкурсі проєктів та науково-технічних розробок, які фінансуються за рахунок коштів державного бюджету',
    kind: 'FIXED',
    coefficient: 100,
    reportingForm: 'Наказ',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    identityFields: ['title'],
    fields: [title],
  },
  {
    code: 'contract_research',
    itemNumber: '9',
    order: 16,
    label: 'Участь у госпдоговірному дослідженні',
    kind: 'FIXED',
    coefficient: 100,
    reportingForm: 'Наказ',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    identityFields: ['title'],
    fields: [title],
  },
  {
    code: 'editorial_board',
    itemNumber: '10',
    itemTitle: 'Видавнича робота у фахових виданнях',
    shortLabel: 'Редакційна колегія університету',
    order: 17,
    label: 'Робота по виданню наукових збірників — редакційна колегія університету',
    kind: 'SELECT',
    coefficient: 1,
    reportingForm: 'Екземпляр видання',
    reuse: 'YEARLY',
    sharing: 'INDIVIDUAL',
    linkRule: 'REQUIRED',
    fileRule: 'NONE',
    identityFields: ['title'],
    fields: [
      title,
      option('Посада в редколегії', [
        { value: 'editor_in_chief', label: 'Головний редактор (заступник)', points: 100 },
        { value: 'managing_editor', label: 'Відповідальний редактор', points: 100 },
        { value: 'secretary', label: 'Відповідальний секретар', points: 100 },
        { value: 'member', label: 'Член редколегії', points: 50 },
      ]),
    ],
  },
  {
    code: 'english_support',
    itemNumber: '10',
    itemTitle: 'Видавнича робота у фахових виданнях',
    shortLabel: 'Англомовний супровід',
    order: 18,
    label: 'Англомовний супровід фахових видань',
    kind: 'MULT',
    coefficient: 5,
    unitNote: 'За 1 сторінку тексту редактору англомовної верстки',
    reportingForm: 'Екземпляр видання',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    linkRule: 'REQUIRED',
    fileRule: 'NONE',
    identityFields: ['title'],
    fields: [title, count('value', 'Кількість сторінок')],
  },
  {
    code: 'art_achievement',
    itemNumber: '11',
    order: 19,
    label:
      'Авторський доробок науково-педагогічних працівників у галузі знань 02 Культура і мистецтво, спеціальність 014 Середня освіта (Музичне мистецтво, Образотворче мистецтво)',
    kind: 'SELECT',
    coefficient: 1,
    unitNote: 'За один конкурс, фестиваль, концерт, виставку або за одну особу',
    reportingForm: 'Диплом лауреата. Програма концерту, виставки. Посвідчення',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    identityFields: ['title'],
    fields: [
      title,
      option('Вид доробку', [
        {
          value: 'laureate_intl',
          label: 'Лауреат конкурсу, фестивалю міжнародного рівня',
          points: 100,
        },
        {
          value: 'laureate_national',
          label: 'Лауреат конкурсу, фестивалю всеукраїнського рівня',
          points: 50,
        },
        {
          value: 'personal_show',
          label: 'Організація та проведення персональних виставок, концертів',
          points: 100,
        },
        {
          value: 'honoured_person',
          label: 'Особисто підготовлено особу, удостоєну Почесного звання України',
          points: 100,
        },
        {
          value: 'prepared_laureate_intl',
          label: 'Особисто підготовлено лауреата міжнародного рівня',
          points: 50,
        },
        {
          value: 'prepared_laureate_national',
          label: 'Особисто підготовлено лауреата всеукраїнського рівня',
          points: 30,
        },
      ]),
    ],
  },
  {
    code: 'phd_supervision',
    itemNumber: '12',
    order: 20,
    label: 'Керівництво аспірантами',
    kind: 'FIXED',
    coefficient: 50,
    unitNote: 'Щороку на одного аспіранта',
    reportingForm: 'Наказ по аспірантурі',
    reuse: 'YEARLY',
    sharing: 'INDIVIDUAL',
    identityFields: ['student'],
    fields: personName('student', 'ПІБ аспіранта (здобувача)'),
  },
  {
    code: 'expert_review',
    itemNumber: '13',
    order: 21,
    label:
      'Експерт із експертизи проєктів наукових досліджень і науково-технічних (експериментальних) розробок, що подаються для участі в конкурсах МОН України та НФД України',
    kind: 'FIXED',
    coefficient: 50,
    unitNote: 'За 1 експертизу',
    reportingForm: 'Експертний висновок',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    identityFields: ['title'],
    fields: [title],
  },
  {
    code: 'student_group',
    itemNumber: '14',
    order: 22,
    label: 'Керівництво студентським науковим гуртком, проблемною групою',
    kind: 'FIXED',
    coefficient: 50,
    unitNote: 'На навчальний рік',
    reportingForm: 'План роботи гуртка, групи та його виконання',
    reuse: 'YEARLY',
    sharing: 'INDIVIDUAL',
    identityFields: ['circle'],
    fields: [text('circle', 'Назва гуртка (проблемної групи)')],
  },
  {
    code: 'lab_leadership',
    itemNumber: '15',
    order: 23,
    label:
      'Керівництво навчально-методичною лабораторією та науковим центром на громадських засадах',
    kind: 'FIXED',
    coefficient: 100,
    unitNote: 'На навчальний рік',
    reportingForm: 'Положення про лабораторію, науковий центр, план роботи, звіти',
    reuse: 'YEARLY',
    sharing: 'INDIVIDUAL',
    identityFields: ['title'],
    fields: [title],
  },
  {
    code: 'art_publication',
    itemNumber: '16',
    order: 24,
    label: 'Видання творів мистецтва',
    kind: 'FIXED',
    coefficient: 50,
    unitNote: 'За один твір',
    reportingForm: 'Екземпляр видання, оформлене відповідно до вимог за процедурою',
    reuse: 'ONCE',
    sharing: 'SHARED',
    identityFields: ['title'],
    fields: [title],
  },
  {
    code: 'academic_mobility',
    itemNumber: '17',
    order: 25,
    label:
      'Участь у міжнародних програмах академічного обміну з науковим призначенням (Fulbright, Erasmus+, EURIAS тощо)',
    kind: 'FIXED',
    coefficient: 100,
    unitNote: 'За одну програму',
    reportingForm: 'Сертифікат / довідка від установи',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    identityFields: ['title'],
    fields: [title],
  },
  {
    code: 'student_research_win',
    itemNumber: '18',
    order: 26,
    label:
      'Керівництво науковою роботою здобувачів, які стали переможцями Всеукраїнського конкурсу студентських наукових робіт або призерами міжнародної олімпіади',
    kind: 'SELECT',
    coefficient: 1,
    unitNote: 'За одного переможця / призера',
    reportingForm: 'Диплом, наказ МОН',
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    // The student, not the title, is the identity: two НПП can each claim the
    // same competition for two different students, and without a name field
    // the second claim reads as a duplicate of the first (Stage 2).
    identityFields: ['student', 'title'],
    fields: [
      ...personName('student', 'ПІБ здобувача'),
      title,
      option('Місце', [
        { value: 'winner', label: 'Переможець Всеукраїнського конкурсу', points: 30 },
        { value: 'runner_up', label: 'Призер міжнародної олімпіади', points: 20 },
      ]),
    ],
  },
] as const;

/**
 * A catalogue def → the columns a ScienceWorkType row carries. Mirrors
 * `dbSpecs` in lib/rating/db-specs.ts, which does the same job for the rating.
 */
export function scienceDbSpecs(def: ScienceWorkTypeDef): {
  evidenceFields: EvidenceField[];
  scoring: ScoringSpec;
  coefficient: number;
} {
  return {
    evidenceFields: [...def.fields],
    // `pageBased` is the rating's «сторінок / 24 / співавторів» rule and is
    // NOT used here: Додаток III prices друковані аркуші directly, and it does
    // not divide by co-authors at all — the hours are a pool the authors share
    // (Stage 2), which is a different arithmetic entirely.
    scoring: { kind: def.kind },
    coefficient: def.coefficient,
  };
}

export const SCIENCE_TEMPLATE_2027 = {
  academicYear: '2026/2027',
  orderRef: '№152 від 04.05.2026',
  minHoursPerRate: 500,
} as const;
