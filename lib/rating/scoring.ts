// 2026 scoring engine — pure functions, no DB, no UI.
// score = computedValue × ActivityType.coefficient (user-confirmed model).
// For SELECT/SELECT_MULT/GATE kinds the coefficient is 1 in 2026, so the
// option points below ARE the score; admin can still scale a whole item later
// by editing its coefficient.
//
// One Activity row = one item: repeatable achievements (each award, each
// curated group, each conference…) are submitted one at a time. Caps like
// «не більше 5» are enforced in the submit action by counting existing rows.

import { ACTIVITY_TYPES_2026, type ActivityKind } from './activity-types';

export interface ScoreResult {
  computedValue: number;
  score: number;
}

/**
 * Points per option for SELECT and SELECT_MULT types (2026 sheet, «Критерії» column).
 * Option keys are the contract shared with the evidence Zod schemas and form
 * components (M2) — a form select must submit exactly these keys.
 */
export const SELECT_OPTION_POINTS = {
  // Розділ 1
  academic_rank: { professor: 50, docent: 30, senior_lecturer: 15, lecturer: 10 },
  scientific_degree: { doctor_dept_match: 50, doctor: 40, phd_dept_match: 30, phd: 20 },
  honors_awards: {
    merited_worker: 50,
    education_excellence: 30,
    state_departmental_award: 30,
    regional_university_award: 10,
  },
  mon_nazyavo_councils: {
    mon_nazyavo_commission_member: 80,
    nfdu_state_commission_member: 50,
    expert_group_participant: 50,
  },
  admin_position: {
    vice_rector: 100,
    dean: 80,
    vice_dean_or_secretary: 50,
    department_or_unit_head: 60,
    deputy_department_head: 40,
    deputy_admission_secretary: 30,
    lab_or_center_head: 30,
  },
  program_guarantor: { current_year: 100, accreditation_year: 1000 },
  program_group_member: { current_year: 60, accreditation_year: 500 },
  university_councils: { head: 100, secretary: 80, member: 50 },
  // Розділ 2
  subject_committee: { head: 50, member: 30 },
  // Розділ 3
  intl_grant_won: {
    project_leader: 450,
    manager_or_group_lead: 350,
    academic_group_participant: 150,
    technical_staff: 100,
  },
  intl_program_participation: {
    leader_coordinator: 450,
    manager: 350,
    executor: 150,
    participant: 100,
  },
  ndr_execution: { leader: 300, executor: 200 },
  initiative_topic: { leader: 15, executor: 10 },
  publication_cat_a: { q1: 600, q2: 500, q3_4_or_none: 400 },
  publication_cat_b: { solo: 300, coauthored: 150 },
  defense_supervision: { doctor: 500, phd: 300 },
  scientific_supervision: {
    doctoral_candidate: 100,
    phd_student: 50,
    master_student: 20,
    bachelor_student: 10,
  },
  intl_olympiad_winners: { first_place: 100, second_place: 80, third_place: 60 },
  ukr_olympiad_winners: { first_place: 80, second_place: 60, third_place: 40 },
  specialized_council: { head: 150, deputy_or_secretary: 100, member: 50 },
  journal_editorial_a: {
    chief_editor: 250,
    deputy_editor: 200,
    board_member: 150,
    technical_secretary: 140,
  },
  journal_editorial_b: {
    chief_editor: 200,
    deputy_editor: 160,
    board_member: 150,
    technical_secretary: 120,
  },
  conf_abroad: { in_person: 50, remote: 20 },
  dissertation_opponent: { doctor: 200, phd: 100 },
  // Розділ 4
  intl_conf_organization: { head: 100, deputy_or_secretary: 80, member: 50 },
  ukr_conf_organization: { head: 50, deputy_or_secretary: 40, member: 20 },
  cultural_sport_events: {
    international: 100,
    national: 50,
    regional: 25,
    university: 10,
    faculty: 5,
    one_day_competition: 4,
  },
  educational_events: { university_wide: 10, faculty: 5 },
  // SELECT_MULT — points per unit (credit / author sheet)
  intl_internship: { in_person: 100, remote: 20 },
  ukr_internship: { in_person: 50, remote: 10 },
  edition_publication: {
    textbook: 200,
    study_guide: 150,
    methodical_guide: 100,
    recommendations: 80,
  },
} as const satisfies Record<string, Record<string, number>>;

/** Moodle gate (розділ 5): full mode points only when ALL six materials are present, else 0 */
export const MOODLE_MODE_POINTS = { development: 150, update: 50 } as const;
export type MoodleMode = keyof typeof MOODLE_MODE_POINTS;

export const MOODLE_MATERIALS = [
  'workProgram', // робоча програма
  'syllabus', // силабус
  'tests', // тестові завдання
  'lectureNotes', // конспекти лекцій
  'presentations', // презентації
  'methodicalMaterials', // основні методичні матеріали
] as const;
export type MoodleMaterial = (typeof MOODLE_MATERIALS)[number];

/** MULT/SELECT_MULT codes whose value = друковані аркуші: (pages / 24) / coAuthors */
const PAGE_BASED_CODES = new Set(['monograph_ua', 'monograph_eu', 'edition_publication']);

const KIND_BY_CODE = new Map<string, ActivityKind>(
  ACTIVITY_TYPES_2026.map((t) => [t.code, t.kind])
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function asRecord(evidence: unknown, code: string): Record<string, unknown> {
  if (typeof evidence !== 'object' || evidence === null || Array.isArray(evidence)) {
    throw new Error(`${code}: evidence must be an object`);
  }
  return evidence as Record<string, unknown>;
}

function requireNumber(
  value: unknown,
  field: string,
  code: string,
  { min }: { min: number }
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
    throw new Error(`${code}: "${field}" must be a number >= ${min}`);
  }
  return value;
}

function optionPoints(code: string, evidence: unknown): number {
  const map = (SELECT_OPTION_POINTS as Record<string, Record<string, number>>)[code];
  if (!map) throw new Error(`${code}: no option points defined`);
  const option = asRecord(evidence, code).option;
  if (typeof option !== 'string' || !(option in map)) {
    throw new Error(`${code}: unknown option "${String(option)}"`);
  }
  return map[option];
}

/** Друковані аркуші: pages / 24, split between co-authors (default 1 = sole author) */
function authorSheets(evidence: unknown, code: string): number {
  const e = asRecord(evidence, code);
  const pages = requireNumber(e.pages, 'pages', code, { min: 1 });
  const coAuthors = e.coAuthors === undefined ? 1 : e.coAuthors;
  if (typeof coAuthors !== 'number' || !Number.isInteger(coAuthors) || coAuthors < 1) {
    throw new Error(`${code}: "coAuthors" must be an integer >= 1`);
  }
  return pages / 24 / coAuthors;
}

// Evidence is flat: the six material booleans live at the top level next to `mode`
function moodleValue(evidence: unknown, code: string): number {
  const e = asRecord(evidence, code);
  const mode = e.mode;
  if (mode !== 'development' && mode !== 'update') {
    throw new Error(`${code}: "mode" must be "development" or "update"`);
  }
  const allPresent = MOODLE_MATERIALS.every((m) => e[m] === true);
  return allPresent ? MOODLE_MODE_POINTS[mode] : 0;
}

function computeValue(code: string, kind: ActivityKind, evidence: unknown): number {
  switch (kind) {
    case 'FIXED':
      return 1;
    case 'MULT':
      return PAGE_BASED_CODES.has(code)
        ? authorSheets(evidence, code)
        : requireNumber(asRecord(evidence, code).value, 'value', code, { min: 0 });
    case 'SELECT':
      return optionPoints(code, evidence);
    case 'SELECT_MULT': {
      const points = optionPoints(code, evidence);
      const units = PAGE_BASED_CODES.has(code)
        ? authorSheets(evidence, code)
        : requireNumber(asRecord(evidence, code).credits, 'credits', code, { min: 1 });
      return points * units;
    }
    case 'GATE':
      return moodleValue(evidence, code);
  }
}

/**
 * Turn evidence into `{ computedValue, score }` for the given activity type.
 * `coefficient` comes from the ActivityType row. Throws on unknown code or
 * malformed evidence — callers validate user input with the Zod schemas first.
 */
export function computeScore(code: string, evidence: unknown, coefficient: number): ScoreResult {
  const kind = KIND_BY_CODE.get(code);
  if (!kind) throw new Error(`Unknown activity type code: ${code}`);
  if (typeof coefficient !== 'number' || !Number.isFinite(coefficient) || coefficient < 0) {
    throw new Error(`${code}: coefficient must be a non-negative number`);
  }
  const raw = computeValue(code, kind, evidence);
  return { computedValue: round2(raw), score: round2(raw * coefficient) };
}
