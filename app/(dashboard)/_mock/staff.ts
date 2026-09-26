import type { StaffDetail } from '@/lib/queries/get-staff';
import type { StaffAccount } from '@/lib/queries/get-staff-account';
import type { AchievementGroup, AchievementRow } from '@/components/rating/achievements-list';
import {
  ACTIVITY_TYPES_2026,
  RATING_DIVISION_SHORT,
  SECTION_TITLES,
} from '@/lib/rating/activity-types';
import { dbSpecs } from '@/lib/rating/db-specs';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import { buildKharakterystyka } from '@/lib/kharakterystyka/build';

/**
 * Invented people, shared by the design rehearsals at `/profile-mock` and
 * `/staff-mock`.
 *
 * In `app/(dashboard)/_mock/` — the leading underscore makes it a PRIVATE
 * folder in the App Router, so nothing under it is ever routable. It goes when
 * the rehearsal pages do.
 *
 * The page used to render the signed-in reader's own record, which on a dev
 * database is mostly empty — so half the cards never appeared and the sections
 * could not actually be judged. These fill every field instead.
 *
 * **Nothing here touches the database.** They are plain objects shaped like
 * `StaffDetail`, so TypeScript still checks them against the real query's
 * return type: if a column is added to `getStaff`, this file fails to compile
 * rather than quietly falling behind.
 *
 * The names are deliberately not real people from the roster.
 */

/** Everything filled — every card populated, every badge earned. */
export const FULL_STAFF: StaffDetail = {
  id: 'mock-full',
  lastName: 'Ковальчук',
  firstName: 'Наталія',
  patronymic: 'Петрівна',
  email: 'n.kovalchuk@uhsp.edu.ua',
  phone: '+380441234567',
  isNpp: true,
  role: 'USER',
  archivedAt: null,
  archiveReason: null,
  employmentRate: 0.75,
  pedagogicalExperience: 18,
  academicRank: 'PROFESSOR',
  scientificDegree: 'DOCTOR',
  degreeMatchesDepartment: true,
  degreeDefenceDate: new Date('2011-04-19T00:00:00.000Z'),
  adminPosition: 'DEPARTMENT_OR_UNIT_HEAD',
  basicEducationMatch: true,
  basicEducationSpecialty: 'Математика та інформатика',
  wosUrl: 'https://www.webofscience.com/wos/author/record/1234567',
  wosCitationCount: 148,
  scopusUrl: 'https://www.scopus.com/authid/detail.uri?authorId=7654321',
  scopusCitationCount: 203,
  googleScholarUrl: 'https://scholar.google.com/citations?user=AbCdEfGhIjK',
  googleScholarCitationCount: 512,
  orcidId: '0000-0002-1825-0097',
  department: {
    id: 'dep-math',
    name: 'Кафедра вищої математики',
    faculty: { id: 'fac-physmath', name: 'Фізико-математичний факультет' },
  },
  division: { id: 'div-nnv', name: 'ННВ' },
  // A сумісник is paid by BOTH кафедри, so the second one is not decoration —
  // it is what «Місця роботи» exists to show.
  partTimeDepartments: [
    {
      department: {
        id: 'dep-inf',
        name: 'Кафедра інформатики',
        faculty: { id: 'fac-digital', name: 'Факультет цифрових технологій' },
      },
    },
  ],
  headOfDepartment: { id: 'dep-math', name: 'Кафедра вищої математики' },
  deanOfFaculty: null,
};

/**
 * A brand-new НПП: an account, a кафедра, and nothing else.
 *
 * The state ~200 people will actually be in on the day the rating opens, and
 * the one the redesign is aimed at: every card at its full height, every row
 * present, every value a «—».
 */
export const EMPTY_STAFF: StaffDetail = {
  ...FULL_STAFF,
  id: 'mock-empty',
  lastName: 'Мельник',
  firstName: 'Андрій',
  patronymic: 'Юрійович',
  email: 'a.melnyk@uhsp.edu.ua',
  phone: null,
  employmentRate: null,
  pedagogicalExperience: null,
  academicRank: null,
  scientificDegree: null,
  degreeMatchesDepartment: null,
  degreeDefenceDate: null,
  adminPosition: null,
  basicEducationMatch: null,
  basicEducationSpecialty: null,
  wosUrl: null,
  wosCitationCount: null,
  scopusUrl: null,
  scopusCitationCount: null,
  googleScholarUrl: null,
  googleScholarCitationCount: null,
  orcidId: null,
  division: null,
  partTimeDepartments: [],
  headOfDepartment: null,
  deanOfFaculty: null,
};

/** Archived, and a сумісник — no primary кафедра, which IS the marker. */
export const ARCHIVED_STAFF: StaffDetail = {
  ...FULL_STAFF,
  id: 'mock-archived',
  lastName: 'Шевченко',
  firstName: 'Ірина',
  patronymic: 'Миколаївна',
  email: 'i.shevchenko@uhsp.edu.ua',
  archivedAt: new Date('2026-02-01T00:00:00.000Z'),
  archiveReason: 'декретна відпустка',
  academicRank: 'DOCENT',
  scientificDegree: 'CANDIDATE',
  adminPosition: null,
  department: null,
  headOfDepartment: null,
};

/** What a spread кафедра has allocated. Integer hundredths, never a float. */
export const MOCK_STAKE_PARTS = [
  { departmentId: 'dep-math', department: 'Кафедра вищої математики', hundredths: 50 },
  { departmentId: 'dep-inf', department: 'Кафедра інформатики', hundredths: 25 },
];

/** Five section scores with a real shape — strong in 3, empty in 4. */
export const MOCK_YEAR = 2026;
/** More than one, or `YearSelect` renders plain text instead of a control. */
export const MOCK_YEARS = [2026, 2025, 2024];

/** Everyone above, by id — `/staff-mock/[id]` resolves the param through this. */
export const MOCK_STAFF: Record<string, StaffDetail> = {
  [FULL_STAFF.id]: FULL_STAFF,
  [EMPTY_STAFF.id]: EMPTY_STAFF,
  [ARCHIVED_STAFF.id]: ARCHIVED_STAFF,
};

/** Options the edit form needs for its кафедра and відділ selects. */
export const MOCK_DEPARTMENT_OPTIONS = [
  {
    id: 'dep-math',
    name: 'Кафедра вищої математики',
    facultyId: 'fac-physmath',
    faculty: { name: 'Фізико-математичний факультет' },
  },
  {
    id: 'dep-inf',
    name: 'Кафедра інформатики',
    facultyId: 'fac-digital',
    faculty: { name: 'Факультет цифрових технологій' },
  },
];

export const MOCK_DIVISION_OPTIONS = [
  { id: 'div-nnv', name: 'ННВ' },
  { id: 'div-nnczyao', name: 'ННЦЗЯО' },
];

/**
 * What ADMIN sees that nobody else does — one account per mock person, and
 * three different states between them, so the card can be judged in all of
 * them without editing this file.
 *
 * Shaped as `StaffAccount`, the real query's return type, so a column added
 * there fails the build here rather than silently going unrendered in the
 * rehearsal.
 */
export const MOCK_ACCOUNTS: Record<string, StaffAccount> = {
  // Signed in and working — the ordinary case.
  [FULL_STAFF.id]: { role: 'USER', isActivated: true, invite: null, lockedUntil: null },
  // Invited four days ago and has never set a password. The amber «не
  // активовано» state, which is most of the roster in the first week.
  [EMPTY_STAFF.id]: {
    role: 'USER',
    isActivated: false,
    invite: { sentAt: new Date('2026-09-03T09:12:00Z'), expired: false },
    lockedUntil: null,
  },
  // An editor who is also locked out by failed logins — «я не можу зайти»,
  // which is the reason the lockout is on this card at all.
  [ARCHIVED_STAFF.id]: {
    role: 'EDITOR',
    isActivated: true,
    invite: null,
    lockedUntil: new Date('2099-01-01T00:00:00Z'),
  },
};

/** `StakePart` carries a departmentId; the profile view's copy does not need it. */
export const MOCK_STAKE_BREAKDOWN = [
  { departmentId: 'dep-math', department: 'Кафедра вищої математики', hundredths: 50 },
  { departmentId: 'dep-inf', department: 'Кафедра інформатики', hundredths: 25 },
];

/**
 * A whole year's rating — the REAL catalogue, with invented figures on it.
 *
 * The first version of this listed indicators I had written myself («Монографія»,
 * «Патент», a Розділ 4 of four invented lines). That is the one thing a mock
 * must not do: the rating table's whole job is to show the complete додаток, so
 * rehearsing it against a catalogue that is not the catalogue rehearses the
 * wrong screen. Twenty-six invented rows also hid the real problem, which is
 * that there are **65** of them (owner, 2026-09-08).
 *
 * So the structure is taken from `ACTIVITY_TYPES_2026` — the same definitions
 * `pnpm db:seed` writes into the template — and only the VALUES are hard-coded.
 * Labels, item numbers, sections, who fills each one and which відділ owns it
 * are therefore right by construction, and stay right when the catalogue is
 * edited. Nothing here reads the database: `_mock/` has to work on a machine
 * with no data in it.
 *
 * Keyed by `code`, never by `itemNumber`. The printed numbers repeat — 1.7
 * twice, 1.11 four times, 2.4 three times — because one sheet line can have
 * several scoring variants, so an itemNumber map would silently score the wrong
 * variant. `code` is the stable key, which is exactly why the app has one.
 */
/**
 * A hand-written summary for the rows where the TEXT matters to the rehearsal —
 * a long title, a DOI with no spaces in it, a real-sounding посібник. Every
 * other row gets a summary derived alongside its score.
 *
 * Scores are NOT here. They come out of the catalogue's own scoring rules; see
 * `derivedScore` below.
 */
const MOCK_SUMMARIES: Record<string, string> = {
  pedagogical_experience: '18 років',
  admin_position: 'Завідувач кафедри',
  program_guarantor: '014 Середня освіта (Математика)',
  teaching_load: '600 годин',
  edition_publication: 'Вища математика для інженерів: навчальний посібник — 13,2 авт. арк.',
  intl_grant_won: 'Horizon Europe, учасник академічної групи',
  // No spaces in a DOI — this row is why the label column carries
  // `wrap-anywhere` rather than `break-words`.
  publication_cat_a:
    'On the stability of finite-difference schemes for parabolic problems · https://doi.org/10.1016/j.cam.2026.115847',
  moodle_course: '2 дисципліни, повний комплект',
};

/**
 * The one rejected row, so the table's only status pill is on screen. Its score
 * is struck through and does not count — which is the whole point of showing it.
 */
const MOCK_REMOVED = {
  code: 'intl_internship',
  score: 350,
  summary: 'Uniwersytet Jagielloński, 2 тижні',
  reason: 'Стажування коротше за один місяць — не відповідає умові показника',
};

/** Same code, same number, every render — a mock that shuffles is unreadable. */
function seed(code: string): number {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return h;
}

/**
 * A REAL score for an indicator, computed from the catalogue's own rule rather
 * than typed in beside it.
 *
 * Sixty-seven invented numbers would be sixty-seven chances to write something
 * the engine could never produce — a SELECT scoring 137 when its options only
 * award 50, 30, 15 or 10. Reading the rule instead means every figure on the
 * rehearsal is one the real thing could actually award, and it stays true when
 * the вчена рада changes a coefficient.
 *
 * Which option or how many units is deterministic per code, so the page does not
 * reshuffle itself between renders.
 */
/**
 * The four indicators the app fills from the Staff record, answered from
 * `FULL_STAFF` instead of picked at random.
 *
 * Without this the rehearsal contradicted itself: the profile tab said
 * «Професор, доктор наук», the rating tab two clicks away said «доцент,
 * кандидат наук». They are the same person and, in the real app, literally the
 * same column — `PROFILE_DERIVED` rows are synced from the profile by
 * `lib/rating/profile-derived.ts`, so a mock where they disagree is showing
 * something the app cannot produce.
 *
 * The enum lower-cases straight onto the option value, which is the convention
 * the catalogue already follows; the ступінь is the one that also depends on
 * whether it matches the кафедра.
 */
function profileOption(code: string): string | undefined {
  switch (code) {
    case 'academic_rank':
      return FULL_STAFF.academicRank?.toLowerCase();
    case 'admin_position':
      return FULL_STAFF.adminPosition?.toLowerCase();
    case 'scientific_degree': {
      const base = FULL_STAFF.scientificDegree === 'DOCTOR' ? 'doctor' : 'phd';
      return FULL_STAFF.degreeMatchesDepartment ? `${base}_dept_match` : base;
    }
    default:
      return undefined;
  }
}

function derivedScore(def: (typeof ACTIVITY_TYPES_2026)[number]): {
  score: number;
  summary: string;
} {
  const { evidenceFields, scoring } = dbSpecs(def);
  const n = seed(def.code);

  const select = evidenceFields.find(
    (f): f is Extract<EvidenceField, { kind: 'select' }> => f.kind === 'select'
  );

  // The person's own value where the app would take one from their profile.
  const fromProfile = profileOption(def.code);

  switch (scoring.kind) {
    case 'SELECT':
    case 'SELECT_MULT': {
      const options = select?.options.filter((o) => o.points !== undefined) ?? [];
      if (options.length === 0) return { score: def.coefficient, summary: '' };
      const chosen = options.find((o) => o.value === fromProfile) ?? options[n % options.length];
      const count = scoring.kind === 'SELECT_MULT' ? 1 + (n % 3) : 1;
      return {
        score: (chosen.points ?? 0) * count,
        summary: count > 1 ? `${chosen.label} × ${count}` : chosen.label,
      };
    }

    case 'MULT': {
      // Стаж is on the profile too, and the same argument applies to it.
      const value =
        def.code === 'pedagogical_experience'
          ? (FULL_STAFF.pedagogicalExperience ?? 0)
          : 2 + (n % 18);
      return { score: def.coefficient * value, summary: String(value) };
    }

    case 'CHECK_SUM': {
      // Mode points plus the parts that mode awards — the same addition the
      // engine does, not a number that resembles one.
      const mode = select?.options[n % Math.max(select.options.length, 1)];
      const parts = evidenceFields.filter(
        (f): f is Extract<EvidenceField, { kind: 'checkbox' }> => f.kind === 'checkbox'
      );
      const extra = parts.reduce((sum, f) => sum + (f.points?.[mode?.value ?? ''] ?? 0), 0);
      return {
        score: (mode?.points ?? 0) + extra,
        summary: `${mode?.label ?? ''}, ${parts.length} складників`,
      };
    }

    default: {
      // FIXED — the coefficient, once or a few times over.
      const count = 1 + (n % 3);
      return {
        score: def.coefficient * count,
        summary: count > 1 ? `${count} записи` : '',
      };
    }
  }
}

/**
 * Indicators this person has nothing under, even in the «filled» rating.
 *
 * A rehearsal where every one of the 67 is scored is a load test, not a rating:
 * nobody holds a patent AND a monograph AND a наукова школа AND a place on a
 * спеціалізована вчена рада. Fifteen of the rarer ones stay blank so the table
 * shows what it actually shows — and so the «Показувати незаповнені» switch has
 * a real number beside it.
 */
const MOCK_UNFILLED = new Set([
  'initiative_topic',
  'intl_open_lectures',
  'monograph_eu',
  'scientific_school',
  'specialized_council',
  'journal_editorial_a',
  'journal_website_support',
  'org_consulting',
  'edu_exhibitions',
  'dissertation_opponent',
  'mon_textbook_expertise',
  'patent_granted',
  'patent_application',
  'copyright_registration',
  'intl_olympiad_winners',
]);

function mockRow(def: (typeof ACTIVITY_TYPES_2026)[number], filled: boolean): AchievementRow {
  const base = {
    id: `mock-${def.code}`,
    itemNumber: def.itemNumber,
    label: def.label,
    date: '2026-03-14',
    canDelete: false,
    removeReason: null,
    inputSource: def.inputSource,
    division: def.verifyingDivision ? RATING_DIVISION_SHORT[def.verifyingDivision] : null,
  };

  if (!filled || MOCK_UNFILLED.has(def.code)) {
    return {
      ...base,
      summary: '',
      score: 0,
      status: 'APPROVED' as const,
      statusLabel: '',
      isEmpty: true,
    };
  }

  if (def.code === MOCK_REMOVED.code) {
    return {
      ...base,
      summary: MOCK_REMOVED.summary,
      score: MOCK_REMOVED.score,
      status: 'REMOVED' as const,
      statusLabel: 'Відхилено',
      removeReason: MOCK_REMOVED.reason,
    };
  }

  const derived = derivedScore(def);
  return {
    ...base,
    summary: MOCK_SUMMARIES[def.code] ?? derived.summary,
    score: derived.score,
    status: 'APPROVED' as const,
    statusLabel: 'Зараховано',
  };
}

function groupsFor(filled: boolean): AchievementGroup[] {
  return [1, 2, 3, 4, 5].map((number) => ({
    number,
    title: SECTION_TITLES[number],
    items: ACTIVITY_TYPES_2026.filter((d) => d.section === number)
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((d) => mockRow(d, filled)),
  }));
}

/** Every indicator scored — the table under full load. */
export const MOCK_RATING_GROUPS: AchievementGroup[] = groupsFor(true);

/** Nothing filled in — what a new НПП opens, and 67 rows for the switch to hide. */
export const MOCK_RATING_GROUPS_EMPTY: AchievementGroup[] = groupsFor(false);

/**
 * The five section scores and their sum, DERIVED from the rows above rather
 * than typed out beside them.
 *
 * `RatingBars` on `/profile-mock` reads these while the table reads the rows,
 * and the two were separate literals that happened to agree — until a row moved
 * and they quietly stopped, which is a rehearsal showing a summary that
 * contradicts the thing under it. Only APPROVED counts, matching
 * `sectionTotal()` in the real table.
 */
export const MOCK_SECTIONS = MOCK_RATING_GROUPS.map((g) =>
  g.items.filter((i) => i.status === 'APPROVED').reduce((sum, i) => sum + i.score, 0)
);
export const MOCK_TOTAL = MOCK_SECTIONS.reduce((a, b) => a + b, 0);

/**
 * The Характеристика, built by the REAL builder from invented rating rows.
 *
 * `buildKharakterystyka` is a pure function over plain data, so the rehearsal
 * runs the same thresholds, alternatives and «N з 5» counters the app does —
 * rather than a hand-written guess at what they would say. A mock that computes
 * its own answer proves nothing about the screen that ships.
 *
 * **The activities are drawn only from codes the rating tab actually scores.**
 * The document is a VIEW of the rating; if it cited a патент while the rating
 * tab showed п.3.25 empty, the two tabs of one person would contradict each
 * other — the same failure the `PROFILE_DERIVED` rows had. `MOCK_UNFILLED` is
 * the list to check against.
 *
 * The window is five years, so the entries are spread across them: a document
 * whose evidence all lands in one year never exercises the «(рік)» suffix or
 * the ordering.
 */
type MockActivity = { code: string; year: number; evidence: Record<string, unknown> };

const MOCK_KH_ACTIVITIES: MockActivity[] = [
  // п.1 — five publications. Three of each category, so the alternative that
  // adds them together is what carries it rather than either one alone.
  {
    code: 'publication_cat_a',
    year: 2026,
    evidence: {
      option: 'q1',
      bibliography:
        'Kovalchuk N. On the stability of finite-difference schemes. Journal of Computational and Applied Mathematics, 2026',
    },
  },
  {
    code: 'publication_cat_a',
    year: 2025,
    evidence: {
      option: 'q2',
      bibliography:
        'Kovalchuk N. Adaptive meshes for parabolic problems. Applied Numerical Mathematics, 2025',
    },
  },
  {
    code: 'publication_cat_a',
    year: 2023,
    evidence: {
      option: 'q3_4_or_none',
      bibliography:
        'Kovalchuk N. A note on convergence rates. Ukrainian Mathematical Journal, 2023',
    },
  },
  {
    code: 'publication_cat_b',
    year: 2026,
    evidence: {
      bibliography:
        'Ковальчук Н. П. Методи скінченних різниць у задачах теплопровідності. Наукові записки, 2026',
    },
  },
  {
    code: 'publication_cat_b',
    year: 2024,
    evidence: {
      bibliography: 'Ковальчук Н. П. Про стійкість різницевих схем. Математичний вісник, 2024',
    },
  },
  {
    code: 'publication_cat_b',
    year: 2022,
    evidence: { bibliography: 'Ковальчук Н. П. Чисельне моделювання дифузії. Вісник УДУ, 2022' },
  },

  // п.3 — a monograph, and a textbook of five друковані аркуші or more. `pages`
  // and `coAuthors` are what the threshold is computed from, so they are real
  // numbers rather than decoration.
  {
    code: 'monograph_ua',
    year: 2024,
    evidence: { title: 'Різницеві методи в задачах математичної фізики', pages: 240, coAuthors: 1 },
  },
  {
    code: 'edition_publication',
    year: 2025,
    evidence: {
      option: 'textbook',
      title: 'Вища математика для інженерів',
      pages: 316,
      coAuthors: 1,
    },
  },

  // п.4 — Moodle, and a методичка (the SAME indicator as above, told apart by
  // its own `option`; see the note on 2.2 in positions.ts).
  {
    code: 'moodle_course',
    year: 2026,
    evidence: {
      mode: 'development',
      discipline: 'Вища математика',
      link: 'https://moodle.uhsp.edu.ua/course/view.php?id=412',
    },
  },
  {
    code: 'edition_publication',
    year: 2023,
    evidence: {
      option: 'methodical_recommendations',
      title: 'Методичні рекомендації до практичних занять',
      pages: 96,
      coAuthors: 2,
    },
  },

  // п.6, п.8, п.10, п.14 — one entry each is enough for these.
  {
    code: 'defense_supervision',
    year: 2024,
    evidence: { student: '蘭 Петренко І. М.', topic: 'Чисельні методи розвʼязання крайових задач' },
  },
  {
    code: 'ndr_execution',
    year: 2025,
    evidence: { topic: 'Математичне моделювання процесів теплопровідності', role: 'керівник' },
  },
  {
    code: 'journal_editorial_b',
    year: 2026,
    evidence: { journal: 'Науковий вісник УДУ. Серія: фізико-математичні науки' },
  },
  {
    code: 'intl_grant_won',
    year: 2025,
    evidence: { option: 'academic_group_member', project: 'Horizon Europe — MATH4EDU' },
  },
  {
    code: 'ukr_olympiad_winners',
    year: 2024,
    evidence: { student: 'Шевченко О. В.', place: 'ІІ місце' },
  },

  // п.12 — five approbation publications, again across the window.
  {
    code: 'conf_abroad',
    year: 2026,
    evidence: { conference: 'ICNAAM 2026, Rhodes', title: 'Stability of implicit schemes' },
  },
  {
    code: 'conf_abroad',
    year: 2024,
    evidence: { conference: 'ECMI 2024, Wrocław', title: 'Adaptive meshes' },
  },
  {
    code: 'conf_ukraine',
    year: 2026,
    evidence: { conference: 'Сучасні проблеми математичного моделювання, Київ' },
  },
  {
    code: 'conf_ukraine',
    year: 2025,
    evidence: { conference: 'Прикладна математика та інформатика, Львів' },
  },
  { code: 'conf_ukraine', year: 2023, evidence: { conference: 'Математика в освіті, Умань' } },

  // п.19
  {
    code: 'prof_associations',
    year: 2026,
    evidence: { association: 'Українське математичне товариство' },
  },
];

/** The window's last year — the same one the rating tab shows. */
export const MOCK_KHARAKTERYSTYKA = buildKharakterystyka(
  MOCK_KH_ACTIVITIES.map((a) => {
    const def = ACTIVITY_TYPES_2026.find((d) => d.code === a.code);
    if (!def) throw new Error(`Unknown code in MOCK_KH_ACTIVITIES: ${a.code}`);
    const specs = dbSpecs(def);
    return {
      year: a.year,
      status: 'APPROVED' as const,
      evidence: a.evidence,
      activityType: {
        itemNumber: def.itemNumber,
        label: def.label,
        isActive: true,
        licencePositions: specs.licencePositions,
        evidenceFields: specs.evidenceFields,
      },
    };
  }),
  // п.5 reads the profile, so it reads THIS person's — the same values the
  // profile tab prints.
  {
    scientificDegree: FULL_STAFF.scientificDegree,
    degreeDefenceDate: FULL_STAFF.degreeDefenceDate,
  },
  MOCK_YEAR
);

/** Which indicators feed each position — what the real page loads from the DB. */
export const MOCK_LICENCE_SOURCES: Record<number, { itemNumber: string; label: string }[]> =
  (() => {
    const byPosition: Record<number, { itemNumber: string; label: string }[]> = {};
    for (const def of ACTIVITY_TYPES_2026) {
      for (const link of dbSpecs(def).licencePositions) {
        (byPosition[link.position] ??= []).push({ itemNumber: def.itemNumber, label: def.label });
      }
    }
    return byPosition;
  })();
