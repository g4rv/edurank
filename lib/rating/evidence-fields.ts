// Evidence field specs — the single source for BOTH the Zod schemas
// (validations/activity-evidence.ts) and the generic evidence form (M2).
// Ukrainian strings here are field labels rendered by form components
// (same precedent as lib/labels.ts).
//
// Contract with the scoring engine (lib/rating/scoring.ts):
// - SELECT / SELECT_MULT types have a select named `option` whose values are
//   exactly the keys of SELECT_OPTION_POINTS[code]
// - MULT types have a number `value`, or `pages` + `coAuthors` for page-based codes
// - SELECT_MULT internships add a number `credits`
// - moodle_course has a select `mode` + six flat checkboxes named as MOODLE_MATERIALS

export type EvidenceField =
  | { kind: 'text'; name: string; label: string; multiline?: boolean; optional?: boolean }
  | {
      kind: 'number';
      name: string;
      label: string;
      min?: number;
      int?: boolean;
      optional?: boolean;
    }
  | { kind: 'url'; name: string; label: string; optional?: boolean }
  | { kind: 'date'; name: string; label: string; optional?: boolean }
  // Check-digit validated; see lib/isbn.ts for what that does and does not prove
  | { kind: 'isbn'; name: string; label: string; optional?: boolean }
  // Syntax-checked only — a DOI has no check digit; see lib/doi.ts
  | { kind: 'doi'; name: string; label: string; optional?: boolean }
  | { kind: 'checkbox'; name: string; label: string; mustBeTrue?: boolean }
  | {
      kind: 'select';
      name: string;
      label: string;
      options: readonly { value: string; label: string }[];
    };

const text = (
  name: string,
  label: string,
  opts?: { multiline?: boolean; optional?: boolean }
): EvidenceField => ({ kind: 'text', name, label, ...opts });

const number = (
  name: string,
  label: string,
  opts?: { min?: number; int?: boolean; optional?: boolean }
): EvidenceField => ({ kind: 'number', name, label, ...opts });

const url = (name: string, label: string, opts?: { optional?: boolean }): EvidenceField => ({
  kind: 'url',
  name,
  label,
  ...opts,
});

const date = (name: string, label: string, opts?: { optional?: boolean }): EvidenceField => ({
  kind: 'date',
  name,
  label,
  ...opts,
});

const isbn = (name: string, label: string, opts?: { optional?: boolean }): EvidenceField => ({
  kind: 'isbn',
  name,
  label,
  ...opts,
});

const doi = (name: string, label: string, opts?: { optional?: boolean }): EvidenceField => ({
  kind: 'doi',
  name,
  label,
  ...opts,
});

const checkbox = (name: string, label: string, opts?: { mustBeTrue?: boolean }): EvidenceField => ({
  kind: 'checkbox',
  name,
  label,
  ...opts,
});

const select = (
  name: string,
  label: string,
  options: readonly { value: string; label: string }[]
): EvidenceField => ({ kind: 'select', name, label, options });

const opt = (value: string, label: string) => ({ value, label });

// Shared option-label sets (values MUST match SELECT_OPTION_POINTS keys)
const ROLE_OPTION = 'Роль';
const PLACE_OPTIONS = [
  opt('first_place', '1 місце'),
  opt('second_place', '2 місце'),
  opt('third_place', '3 місце'),
];
const CONF_ORG_OPTIONS = [
  opt('head', 'голова оргкомітету'),
  opt('deputy_or_secretary', 'заступник (відповідальний секретар)'),
  opt('member', 'член оргкомітету'),
];
const EDITORIAL_OPTIONS = [
  opt('chief_editor', 'головний редактор'),
  opt('deputy_editor', 'заступник (відповідальний секретар)'),
  opt('board_member', 'член редакційної колегії'),
  opt('technical_secretary', 'технічний секретар'),
];
const INTERNSHIP_FORM_OPTIONS = [opt('in_person', 'очно'), opt('remote', 'дистанційно')];
const GUARANTOR_PERIOD_OPTIONS = [
  opt('current_year', 'на поточний навчальний рік (за умови реалізації ОП)'),
  opt('accreditation_year', 'на рік акредитації'),
];

/** Empty form default values for a field set (RHF-friendly) */
export function evidenceDefaults(fields: readonly EvidenceField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    out[f.name] = f.kind === 'checkbox' ? false : '';
  }
  return out;
}

export const EVIDENCE_FIELDS: Record<string, readonly EvidenceField[]> = {
  // ── Розділ 1 ────────────────────────────────────────────────────────────────
  pedagogical_experience: [number('value', 'Стаж (років)', { min: 0, int: true })],
  academic_rank: [
    select('option', 'Вчене звання', [
      opt('professor', 'професор'),
      opt('docent', 'доцент'),
      opt('senior_lecturer', 'старший викладач'),
      opt('lecturer', 'викладач'),
    ]),
  ],
  scientific_degree: [
    select('option', 'Науковий ступінь', [
      opt('doctor_dept_match', 'доктор наук за спеціальністю кафедри'),
      opt('doctor', 'доктор наук'),
      opt('phd_dept_match', 'кандидат наук (PhD) за спеціальністю кафедри'),
      opt('phd', 'кандидат наук (PhD)'),
    ]),
  ],
  honors_awards: [
    select('option', 'Тип відзнаки', [
      opt('merited_worker', 'Заслужений працівник'),
      opt('education_excellence', 'Відмінник освіти України'),
      opt('state_departmental_award', 'Інші державні та відомчі нагороди (за звітний рік)'),
      opt(
        'regional_university_award',
        'Відзнаки обласного, регіонального та університетського рівня (за звітний рік)'
      ),
    ]),
    text('title', 'Назва відзнаки'),
  ],
  mon_nazyavo_councils: [
    select('option', 'Вид участі', [
      opt(
        'mon_nazyavo_commission_member',
        'Член комісій МОН України / галузевих експертних рад НАЗЯВО'
      ),
      opt('nfdu_state_commission_member', 'Член комісій НФДУ та інших державних комісій'),
      opt('expert_group_participant', 'Участь у складі експертних груп та комісій'),
    ]),
    text('basis', 'Наказ / підстава'),
  ],
  admin_position: [
    select('option', 'Посада', [
      opt('vice_rector', 'проректор'),
      opt('dean', 'декан'),
      opt(
        'vice_dean_or_secretary',
        'заступник декана / вчений секретар / відп. секретар приймальної комісії'
      ),
      opt('department_or_unit_head', 'завідувач кафедри / керівник відділу'),
      opt('deputy_department_head', 'заступник завідувача кафедри'),
      opt('deputy_admission_secretary', 'заступник відповідального секретаря приймальної комісії'),
      opt('lab_or_center_head', 'завідувач лабораторії / керівник центру'),
    ]),
  ],
  program_guarantor: [
    select('option', 'Період', GUARANTOR_PERIOD_OPTIONS),
    text('program', 'Освітня програма'),
  ],
  program_group_member: [
    select('option', 'Період', GUARANTOR_PERIOD_OPTIONS),
    text('program', 'Освітня програма'),
  ],
  university_councils: [
    select('option', ROLE_OPTION, [
      opt('head', 'голова'),
      opt('secretary', 'секретар'),
      opt('member', 'член ради'),
    ]),
    text('council', 'Назва ради / комісії'),
  ],
  basic_education_match: [
    checkbox('confirmed', 'Базова освіта відповідає спеціальності кафедри', { mustBeTrue: true }),
    text('specialty', 'Спеціальність за дипломом'),
  ],
  prof_associations: [text('title', "Назва об'єднання")],
  second_higher_education: [text('specialty', 'Спеціальність / заклад освіти')],
  intl_internship: [
    select('option', 'Форма', INTERNSHIP_FORM_OPTIONS),
    number('credits', 'Кількість кредитів', { min: 1 }),
    text('title', 'Назва стажування / заклад'),
  ],
  ukr_internship: [
    select('option', 'Форма', INTERNSHIP_FORM_OPTIONS),
    number('credits', 'Кількість кредитів', { min: 1 }),
    text('title', 'Назва стажування / заклад'),
  ],
  qualification_mentoring: [text('title', 'ПІБ працівника та заклад освіти')],

  // ── Розділ 2 ────────────────────────────────────────────────────────────────
  teaching_load: [number('value', 'Бали за навантаження', { min: 0 })],
  edition_publication: [
    select('option', 'Тип видання', [
      opt('textbook', 'підручник'),
      opt('study_guide', 'навчальний посібник'),
      opt('methodical_guide', 'навчально-методичний посібник'),
      opt('recommendations', 'методичні рекомендації (словник, довідник)'),
    ]),
    number('pages', 'Кількість сторінок', { min: 1, int: true }),
    number('coAuthors', 'Кількість співавторів', { min: 1, int: true, optional: true }),
    text('bibliography', 'Бібліографічний опис', { multiline: true }),
  ],
  foreign_language_teaching: [
    text('program', 'Освітня програма'),
    text('discipline', 'Дисципліна'),
  ],
  accreditation_self_analysis: [text('program', 'Освітня програма')],
  edu_program_development: [text('program', 'Освітня програма')],
  edu_program_update: [text('program', 'Освітня програма')],
  accreditation_expert_meeting: [
    text('program', 'Освітня програма'),
    date('date', 'Дата зустрічі', { optional: true }),
  ],
  curriculum_development: [text('specialty', 'Спеціальність')],
  curriculum_update: [text('specialty', 'Спеціальність')],
  subject_committee: [
    select('option', ROLE_OPTION, [opt('head', 'голова'), opt('member', 'член комісії')]),
    text('committee', 'Назва комісії'),
  ],
  group_curator: [text('group', 'Індекс групи')],
  video_lectures: [text('discipline', 'Дисципліна'), url('link', 'Посилання на відеолекцію')],
  unit_website_responsible: [text('unit', 'Структурний підрозділ')],
  unit_social_media_responsible: [text('unit', 'Структурний підрозділ')],

  // ── Розділ 3 ────────────────────────────────────────────────────────────────
  intl_grant_won: [
    select('option', ROLE_OPTION, [
      opt('project_leader', 'керівник / координатор проєкту'),
      opt('manager_or_group_lead', 'менеджер, керівник академічної (робочої) групи'),
      opt('academic_group_participant', 'учасник академічної групи / виконавець (тренер)'),
      opt('technical_staff', 'виконавець (технічний та адміністративний персонал)'),
    ]),
    text('title', 'Назва проєкту / гранту'),
  ],
  intl_program_participation: [
    select('option', ROLE_OPTION, [
      opt('leader_coordinator', 'керівник / координатор'),
      opt('manager', 'менеджер'),
      opt('executor', 'виконавець'),
      opt('participant', 'учасник'),
    ]),
    text('title', 'Назва програми / проєкту'),
  ],
  intl_grant_application: [text('title', 'Назва конкурсу / програми')],
  ukr_grant_application: [text('title', 'Назва конкурсу / програми')],
  ndr_execution: [
    select('option', ROLE_OPTION, [opt('leader', 'керівник'), opt('executor', 'виконавець')]),
    text('title', 'Тема НДР'),
  ],
  initiative_topic: [
    select('option', ROLE_OPTION, [opt('leader', 'керівник'), opt('executor', 'виконавець')]),
    text('title', 'Назва тематики'),
  ],
  intl_open_lectures: [
    text('title', 'Тема лекції'),
    date('date', 'Дата', { optional: true }),
    url('link', 'Посилання', { optional: true }),
  ],
  monograph_ua: [
    number('pages', 'Кількість сторінок', { min: 1, int: true }),
    number('coAuthors', 'Кількість співавторів', { min: 1, int: true, optional: true }),
    // Required: the 2026 form marks this item «обов'язково ISBN»
    isbn('isbn', 'ISBN'),
    text('bibliography', 'Бібліографічний опис', { multiline: true }),
  ],
  monograph_eu: [
    number('pages', 'Кількість сторінок', { min: 1, int: true }),
    number('coAuthors', 'Кількість співавторів', { min: 1, int: true, optional: true }),
    // Optional: the form does not demand it here, so a missing ISBN must not
    // block a genuine submission — but it is still checked when filled in
    isbn('isbn', 'ISBN', { optional: true }),
    text('bibliography', 'Бібліографічний опис', { multiline: true }),
  ],
  publication_cat_a: [
    select('option', 'Квартиль', [
      opt('q1', 'Квартиль Q1'),
      opt('q2', 'Квартиль Q2'),
      opt('q3_4_or_none', 'Квартиль Q3-4 / відсутній'),
    ]),
    text('bibliography', 'Бібліографічний опис', { multiline: true }),
    // The form asks for «посилання Scopus або WOS», so `link` stays a plain URL
    // and must keep accepting them. The DOI sits beside it, optional — it is
    // what the future Crossref/OpenAlex checker will query.
    url('link', 'Посилання Scopus / WoS'),
    doi('doi', 'DOI', { optional: true }),
  ],
  publication_cat_b: [
    select('option', 'Авторство', [opt('solo', 'одноосібно'), opt('coauthored', 'співавторство')]),
    text('bibliography', 'Бібліографічний опис', { multiline: true }),
    url('link', 'Посилання', { optional: true }),
    doi('doi', 'DOI', { optional: true }),
  ],
  defense_supervision: [
    select('option', 'Ступінь', [opt('doctor', 'доктор наук'), opt('phd', 'кандидат наук (PhD)')]),
    text('candidate', 'ПІБ здобувача'),
    text('topic', 'Тема дисертації'),
    date('date', 'Дата захисту', { optional: true }),
  ],
  scientific_supervision: [
    select('option', 'Вид', [
      opt('doctoral_candidate', 'докторант'),
      opt('phd_student', 'аспірант / здобувач'),
      opt('master_student', 'здобувач другого (магістерського) рівня'),
      opt('bachelor_student', 'здобувач першого (бакалаврського) рівня'),
    ]),
    text('candidate', 'ПІБ'),
  ],
  intl_olympiad_winners: [
    select('option', 'Місце', PLACE_OPTIONS),
    text('candidate', 'ПІБ здобувача'),
    text('event', 'Назва заходу'),
    date('date', 'Дата', { optional: true }),
  ],
  ukr_olympiad_winners: [
    select('option', 'Місце', PLACE_OPTIONS),
    text('candidate', 'ПІБ здобувача'),
    text('event', 'Назва заходу'),
    date('date', 'Дата', { optional: true }),
  ],
  olympiad_jury: [text('event', 'Назва заходу'), text('basis', 'Номер наказу', { optional: true })],
  scientific_school: [text('title', 'Назва наукової школи')],
  specialized_council: [
    select('option', ROLE_OPTION, [
      opt('head', 'голова'),
      opt('deputy_or_secretary', 'заступник / відповідальний секретар / вчений секретар'),
      opt('member', 'член ради'),
    ]),
    text('council', 'Назва / шифр ради'),
    // Informational only — same points as a permanent council (decision 2026-07-07)
    checkbox('oneTime', 'Разова рада (одноразовий захист)'),
  ],
  journal_editorial_a: [
    select('option', ROLE_OPTION, EDITORIAL_OPTIONS),
    text('journal', 'Назва видання'),
  ],
  journal_editorial_b: [
    select('option', ROLE_OPTION, EDITORIAL_OPTIONS),
    text('journal', 'Назва видання'),
  ],
  journal_website_support: [text('journal', 'Назва видання')],
  org_consulting: [
    text('organization', 'Назва установи / організації'),
    text('basis', 'Договір / підстава', { optional: true }),
  ],
  conf_abroad: [
    select('option', 'Форма участі', [
      opt('in_person', 'очна'),
      opt('remote', 'заочна (дистанційна)'),
    ]),
    text('title', 'Назва конференції'),
    text('location', 'Країна / місто', { optional: true }),
    url('link', 'Посилання', { optional: true }),
  ],
  conf_ukraine: [text('title', 'Назва конференції'), url('link', 'Посилання', { optional: true })],
  edu_exhibitions: [text('title', 'Назва виставки')],
  dissertation_opponent: [
    select('option', 'Ступінь', [
      opt('doctor', 'доктора наук'),
      opt('phd', 'кандидата наук (PhD)'),
    ]),
    text('candidate', 'ПІБ здобувача'),
    text('topic', 'Тема дисертації'),
    date('date', 'Дата', { optional: true }),
  ],
  mon_textbook_expertise: [text('title', 'Назва підручника')],
  citations_wos: [number('value', 'h-індекс (WoS)', { min: 0, int: true })],
  citations_scopus: [number('value', 'h-індекс (Scopus)', { min: 0, int: true })],
  citations_scholar: [number('value', 'h-індекс (Google Scholar)', { min: 0, int: true })],
  patent_granted: [
    date('date', 'Дата реєстрації'),
    text('registrationNumber', 'Реєстраційний номер'),
    text('title', 'Назва'),
  ],
  patent_application: [
    text('title', 'Назва заявки'),
    date('date', 'Дата подання', { optional: true }),
  ],
  copyright_registration: [
    text('certificateNumber', 'Номер свідоцтва'),
    text('title', 'Назва'),
    date('date', 'Дата реєстрації', { optional: true }),
  ],

  // ── Розділ 4 ────────────────────────────────────────────────────────────────
  intl_conf_organization: [
    select('option', ROLE_OPTION, CONF_ORG_OPTIONS),
    text('title', 'Назва заходу'),
    text('basis', 'Номер наказу', { optional: true }),
    date('date', 'Дата', { optional: true }),
  ],
  ukr_conf_organization: [
    select('option', ROLE_OPTION, CONF_ORG_OPTIONS),
    text('title', 'Назва заходу'),
    text('basis', 'Номер наказу', { optional: true }),
    date('date', 'Дата', { optional: true }),
  ],
  cultural_sport_events: [
    select('option', 'Рівень заходу', [
      opt('international', 'міжнародний рівень'),
      opt('national', 'всеукраїнський рівень'),
      opt('regional', 'регіональний рівень'),
      opt('university', 'університетський рівень'),
      opt('faculty', 'факультетський рівень'),
      opt('one_day_competition', 'одноденні змагання'),
    ]),
    text('title', 'Назва заходу'),
    text('basis', 'Номер наказу', { optional: true }),
    date('date', 'Дата', { optional: true }),
  ],
  educational_events: [
    select('option', 'Рівень заходу', [
      opt('university_wide', 'загальноуніверситетський'),
      opt('faculty', 'факультетський'),
    ]),
    text('title', 'Назва заходу'),
    date('date', 'Дата', { optional: true }),
  ],

  // ── Розділ 5 ────────────────────────────────────────────────────────────────
  moodle_course: [
    select('mode', 'Вид роботи', [opt('development', 'Розроблення'), opt('update', 'Оновлення')]),
    text('discipline', 'Дисципліна (освітній компонент)'),
    url('link', 'Посилання на курс'),
    checkbox('workProgram', 'Робоча програма'),
    checkbox('syllabus', 'Силабус'),
    checkbox('tests', 'Тестові завдання'),
    checkbox('lectureNotes', 'Конспекти лекцій'),
    checkbox('presentations', 'Презентації'),
    checkbox('methodicalMaterials', 'Основні методичні матеріали'),
  ],
};
