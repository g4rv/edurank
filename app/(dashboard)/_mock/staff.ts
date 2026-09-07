import type { StaffDetail } from '@/lib/queries/get-staff';

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
 * the one the redesign is aimed at — it is what «Не заповнено» was built for.
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
  { department: 'Кафедра вищої математики', hundredths: 50 },
  { department: 'Кафедра інформатики', hundredths: 25 },
];

/** Five section scores with a real shape — strong in 3, empty in 4. */
export const MOCK_SECTIONS = [1240, 860, 3155, 0, 470];
export const MOCK_TOTAL = MOCK_SECTIONS.reduce((a, b) => a + b, 0);
export const MOCK_YEAR = 2026;

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

/** `StakePart` carries a departmentId; the profile view's copy does not need it. */
export const MOCK_STAKE_BREAKDOWN = [
  { departmentId: 'dep-math', department: 'Кафедра вищої математики', hundredths: 50 },
  { departmentId: 'dep-inf', department: 'Кафедра інформатики', hundredths: 25 },
];
