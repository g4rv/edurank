import { SCOPUS_OR_WOS_HOSTS } from '@/lib/link-hosts';

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
// - moodle_course has a select `mode` + six scored checkboxes (MOODLE_MATERIALS)

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
  // `hosts` narrows a URL to a service (see lib/link-hosts.ts); without it any
  // valid URL is accepted, which is right for open links like a video lecture
  | {
      kind: 'url';
      name: string;
      label: string;
      optional?: boolean;
      hosts?: readonly string[];
      hostsError?: string;
    }
  | { kind: 'date'; name: string; label: string; optional?: boolean }
  // Check-digit validated; see lib/isbn.ts for what that does and does not prove
  | { kind: 'isbn'; name: string; label: string; optional?: boolean }
  // Syntax-checked only — a DOI has no check digit; see lib/doi.ts
  | { kind: 'doi'; name: string; label: string; optional?: boolean }
  // `mustBeTrue` makes the box a condition of submitting, not just a flag;
  // `requiredError` explains why, since a generic «Потрібно підтвердити» does
  // not tell an НПП that the item is all-or-nothing
  | {
      kind: 'checkbox';
      name: string;
      label: string;
      mustBeTrue?: boolean;
      requiredError?: string;
      /**
       * CHECK_SUM only: what ticking this box is worth, keyed by the chosen
       * value of the rule's `mode` select. Per-mode rather than a single
       * number because the shares are not proportional — Moodle's «конспекти
       * лекцій» is 50 of 150 when developing a course but 10 of 50 when
       * updating one, so no single multiplier reproduces both columns.
       */
      points?: Record<string, number>;
      /**
       * Renders consecutive boxes sharing this title as one block, under a
       * heading and above a single shared error. For a set that stands or falls
       * together, repeating the same message per box is noise.
       */
      group?: string;
    }
  // `points` feeds the scoring engine when the type's scoring rule reads this
  // select (the `option`/`mode` conventions) — and the form shows it as a
  // « — N балів» suffix. Absent on purely descriptive selects.
  | {
      kind: 'select';
      name: string;
      label: string;
      options: readonly { value: string; label: string; points?: number }[];
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

const url = (
  name: string,
  label: string,
  opts?: { optional?: boolean; hosts?: readonly string[]; hostsError?: string }
): EvidenceField => ({
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

const checkbox = (
  name: string,
  label: string,
  opts?: {
    mustBeTrue?: boolean;
    requiredError?: string;
    points?: Record<string, number>;
    group?: string;
  }
): EvidenceField => ({
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

/**
 * Short human-readable line for lists and audit views,
 * e.g. «Квартиль Q1 · Nature 2026 · https://doi.org/…».
 */
export function summarizeEvidence(fields: readonly EvidenceField[], evidence: unknown): string {
  if (typeof evidence !== 'object' || evidence === null) return '';
  const e = evidence as Record<string, unknown>;

  // A grouped checkbox set becomes one part — «<group>: a, b, c» — rather than
  // one part per ticked box. As separate parts, item 5.1's six materials ran
  // into the 5-part cap below and only two ever showed, so a course with five
  // materials read the same as one with two while the score differed by 100.
  // Comma-separated inside the group, since ` · ` already separates parts.
  const groups = new Map<string, string[]>();
  for (const f of fields) {
    if (f.kind !== 'checkbox' || !f.group) continue;
    const ticked = groups.get(f.group) ?? [];
    if (e[f.name] === true) ticked.push(f.label);
    groups.set(f.group, ticked);
  }
  const summarised = new Set<string>();

  const parts: string[] = [];
  for (const f of fields) {
    // Emitted once, in the position of the group's first box
    if (f.kind === 'checkbox' && f.group) {
      if (summarised.has(f.group)) continue;
      summarised.add(f.group);
      const ticked = groups.get(f.group);
      if (ticked && ticked.length > 0) parts.push(`${f.group}: ${ticked.join(', ')}`);
      continue;
    }

    const v = e[f.name];
    if (v === undefined || v === null || v === '') continue;
    switch (f.kind) {
      case 'select':
        parts.push(f.options.find((o) => o.value === v)?.label ?? String(v));
        break;
      case 'checkbox':
        if (v === true) parts.push(f.label);
        break;
      case 'number':
        parts.push(`${f.label}: ${v}`);
        break;
      case 'isbn':
        parts.push(`ISBN ${v}`);
        break;
      case 'doi':
        parts.push(`DOI ${v}`);
        break;
      case 'text':
      case 'url':
      case 'date':
        parts.push(String(v));
        break;
    }
  }
  return parts.slice(0, 5).join(' · ');
}

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
    // The form asks for «посилання Scopus або WOS», so this stays a link rather
    // than becoming a DOI field — but it must actually BE one of those two.
    // The DOI sits beside it, optional; it is what the future
    // Crossref/OpenAlex checker will query.
    url('link', 'Посилання Scopus / WoS', {
      hosts: SCOPUS_OR_WOS_HOSTS,
      hostsError: 'Очікується посилання на Scopus або Web of Science',
    }),
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
  // The mention link (3.16–3.18, decided 2026-08-07): the public page of the
  // council / editorial board that names this person. Proof of the role that
  // does not depend on anyone's word, and cheap to check.
  specialized_council: [
    select('option', ROLE_OPTION, [
      opt('head', 'голова'),
      opt('deputy_or_secretary', 'заступник / відповідальний секретар / вчений секретар'),
      opt('member', 'член ради'),
    ]),
    text('council', 'Назва / шифр ради'),
    url('mentionLink', 'Посилання на склад ради'),
    // Informational only — same points as a permanent council (decision 2026-07-07)
    checkbox('oneTime', 'Разова рада (одноразовий захист)'),
  ],
  journal_editorial_a: [
    select('option', ROLE_OPTION, EDITORIAL_OPTIONS),
    text('journal', 'Назва видання'),
    url('mentionLink', 'Посилання на редколегію'),
  ],
  journal_editorial_b: [
    select('option', ROLE_OPTION, EDITORIAL_OPTIONS),
    text('journal', 'Назва видання'),
    url('mentionLink', 'Посилання на редколегію'),
  ],
  // Same checkable-link field, but this indicator is about maintaining the site
  // rather than being named on it, so the label asks for what actually applies.
  journal_website_support: [
    text('journal', 'Назва видання'),
    url('mentionLink', 'Посилання на сайт збірника'),
  ],
  org_consulting: [
    text('organization', 'Назва установи / організації'),
    text('basis', 'Договір / підстава', { optional: true }),
    url('mentionLink', 'Посилання на підтвердження'),
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
  // Item 5.1 pays per material present. Each box carries its own share of the
  // mode's maximum (150 розроблення / 50 оновлення) and only ticked boxes count,
  // so a course missing one material scores the other five rather than zero.
  // The columns come from docs/rating-2026-catalogue.md and each sums to its
  // mode's maximum — `specProblems` enforces that, so a typo cannot go unnoticed.
  moodle_course: [
    select('mode', 'Вид роботи', [opt('development', 'Розроблення'), opt('update', 'Оновлення')]),
    text('discipline', 'Дисципліна (освітній компонент)'),
    url('link', 'Посилання на курс'),
    ...(
      [
        ['workProgram', 'Робоча програма', 15, 5],
        ['syllabus', 'Силабус', 5, 5],
        ['tests', 'Тестові завдання (питання до тестів)', 20, 10],
        ['lectureNotes', 'Конспекти лекцій', 50, 10],
        ['presentations', 'Презентації', 30, 10],
        ['methodicalMaterials', 'Методичні матеріали для практичних робіт', 30, 10],
      ] as const
    ).map(([name, label, development, update]) =>
      checkbox(name, label, {
        points: { development, update },
        group: 'Матеріали курсу',
      })
    ),
  ],
};
