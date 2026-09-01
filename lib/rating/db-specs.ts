// Converts a 2026 catalogue def into the per-row JSON specs stored on
// `ActivityType` (`evidenceFields` + `scoring` columns, plus `itemNumber` and
// `maxPerYear`). Seed-side only: at runtime the DB row is the source of truth,
// the catalogue constants exist to (re)build it.
//
// The merge embeds option points into the select fields, so the DB spec is
// self-contained: SELECT_OPTION_POINTS / MOODLE_MODE_POINTS never need to be
// consulted for a row that came through here.

import { ACTIVITY_TYPES_2026, type ActivityTypeDef } from './activity-types';
import { EVIDENCE_FIELDS, type EvidenceField } from './evidence-fields';
import type { ScorableType, ScoringSpec } from './scoring';
import type { LicencePositionLink } from '@/lib/kharakterystyka/positions';
import { schemaForFields } from '@/validations/activity-evidence';

/**
 * Points per option for SELECT and SELECT_MULT types (2026 sheet, «Критерії»
 * column). Merged into the select field specs by `dbSpecs` — at runtime the
 * ActivityType row's own options carry the points.
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

/** Moodle gate (розділ 5): full mode points only when ALL six materials are present */
export const MOODLE_MODE_POINTS = { development: 150, update: 50 } as const;

/** MULT/SELECT_MULT codes whose value = друковані аркуші: (pages / 24) / coAuthors */
export const PAGE_BASED_CODES = new Set(['monograph_ua', 'monograph_eu', 'edition_publication']);

/**
 * Which п.38 positions of the Характеристика each indicator's entries satisfy
 * (the positions themselves: `lib/kharakterystyka/positions.ts`).
 *
 * Seed input only, exactly like SELECT_OPTION_POINTS above. At runtime the
 * `ActivityType.licencePositions` column decides — so an admin can point a
 * newly voted indicator at a position in /admin/rating/[year] without a deploy,
 * which is the whole reason it is a column and not this map.
 *
 * A code absent from the map satisfies no position. That is right for most of
 * the ~67 indicators, and it is the DELIBERATE answer for two of them:
 *
 *   patent_application     — a submitted application is not a patent
 *   intl_grant_application — an unwon proposal is not a project
 *
 * Both still score in the rating, because the rating rewards the effort. They
 * just close no licence position, because the licence asks for a finished thing
 * (decided 2026-08-07). Do not "complete" the map by adding them.
 */
export const LICENCE_POSITION_LINKS: Record<string, LicencePositionLink[]> = {
  // п.1 — не менше п'яти публікацій у фахових виданнях / Scopus / WoS
  publication_cat_a: [{ position: 1 }],
  publication_cat_b: [{ position: 1 }],

  // п.2 — один патент АБО п'ять свідоцтв авторського права. Two different bars,
  // so two groups; the position is met when either alternative is reached.
  // «П'ять деклараційних патентів» is the law's third route and has no
  // indicator of its own — add a third group the day one exists.
  // One патент на винахід meets позиція 2; деклараційних it wants five. The
  // indicator covers both, so its own «Вид патенту» decides which bar the row
  // counts against — the same routing 2.2 uses between п.3 and п.4.
  patent_granted: [
    { position: 2, group: 'patent', when: { field: 'patentKind', in: ['invention'] } },
    { position: 2, group: 'declarative', when: { field: 'patentKind', in: ['declarative'] } },
  ],
  copyright_registration: [{ position: 2, group: 'copyright' }],

  // п.3 — підручник / навчальний посібник / монографія, ≥5 авт. аркушів
  // п.4 — навчально-методичні праці, три найменування
  //
  // 2.2 is ONE indicator feeding BOTH, split by the option chosen on the form.
  // This is the case the `when` condition exists for: without it the same
  // методичка would count towards a підручник requirement.
  monograph_ua: [{ position: 3 }],
  monograph_eu: [{ position: 3 }],
  edition_publication: [
    { position: 3, when: { field: 'option', in: ['textbook', 'study_guide'] } },
    { position: 4, when: { field: 'option', in: ['methodical_guide', 'recommendations'] } },
  ],
  // «електронних курсів на освітніх платформах ліцензіатів» — Moodle is exactly that
  moodle_course: [{ position: 4 }],

  // п.5 is the defence date on the profile, not an indicator — see PositionFill.

  // п.6 — наукове керівництво здобувачем, який захистився
  defense_supervision: [{ position: 6 }],

  // п.7 — офіційний опонент або член спеціалізованої вченої ради
  specialized_council: [{ position: 7 }],
  dissertation_opponent: [{ position: 7 }],

  // п.8 — керівник/виконавець наукової теми, або редколегія фахового видання
  ndr_execution: [{ position: 8 }],
  initiative_topic: [{ position: 8 }],
  journal_editorial_a: [{ position: 8 }],
  journal_editorial_b: [{ position: 8 }],

  // п.9 — експертна рада МОН / галузева експертна рада НАЗЯВО
  mon_nazyavo_councils: [{ position: 9 }],
  mon_textbook_expertise: [{ position: 9 }],

  // п.10 — міжнародні проєкти, міжнародна експертиза
  intl_grant_won: [{ position: 10 }],
  intl_program_participation: [{ position: 10 }],
  intl_open_lectures: [{ position: 10 }],

  // п.11 — наукове консультування установ ≥3 років. 3.18 carries the three-year
  // condition inside itself, so an entry existing means the condition held.
  org_consulting: [{ position: 11 }],

  // п.12 — не менше п'яти апробаційних / науково-популярних публікацій
  conf_abroad: [{ position: 12 }],
  conf_ukraine: [{ position: 12 }],

  // п.13 — заняття іноземною мовою. The rating's own bar is 30 hours where the
  // licence asks 50, so a row is necessary but not sufficient — the position
  // carries a note telling the reader to check the hours.
  foreign_language_teaching: [{ position: 13 }],

  // п.14 — призер студентської олімпіади, журі, або науковий гурток
  intl_olympiad_winners: [{ position: 14 }],
  ukr_olympiad_winners: [{ position: 14 }],
  olympiad_jury: [{ position: 14 }],
  scientific_school: [{ position: 14 }],

  // п.15 (школярі) and п.20 (практичний досвід) are typed by hand — no indicator
  // exists and none is being added: the catalogue moves only by a вчена рада
  // vote. п.16–18 are military and never apply here.

  // п.19 — участь у професійних та громадських об'єднаннях
  prof_associations: [{ position: 19 }],
};

export interface ActivityTypeSpecs {
  itemNumber: string;
  maxPerYear: number | null;
  requiresVerification: boolean;
  entityFirstEntry: boolean;
  evidenceFields: EvidenceField[];
  scoring: ScoringSpec;
  licencePositions: LicencePositionLink[];
}

function withPoints(
  field: Extract<EvidenceField, { kind: 'select' }>,
  points: Record<string, number>,
  code: string
): EvidenceField {
  return {
    ...field,
    options: field.options.map((o) => {
      const p = points[o.value];
      if (p === undefined) throw new Error(`${code}: no points for option "${o.value}"`);
      return { ...o, points: p };
    }),
  };
}

/** The DB column values for one catalogue def; throws on catalogue drift */
export function dbSpecs(def: ActivityTypeDef): ActivityTypeSpecs {
  const fields = EVIDENCE_FIELDS[def.code];
  if (!fields) throw new Error(`${def.code}: no evidence fields defined`);

  const scoresBySelect =
    def.kind === 'SELECT' || def.kind === 'SELECT_MULT'
      ? {
          name: 'option',
          points: SELECT_OPTION_POINTS[def.code as keyof typeof SELECT_OPTION_POINTS],
        }
      : def.kind === 'CHECK_SUM'
        ? { name: 'mode', points: MOODLE_MODE_POINTS }
        : null;
  if (scoresBySelect && !scoresBySelect.points) {
    throw new Error(`${def.code}: no option points defined`);
  }

  const evidenceFields = fields.map((f) =>
    scoresBySelect && f.kind === 'select' && f.name === scoresBySelect.name
      ? withPoints(f, scoresBySelect.points as Record<string, number>, def.code)
      : f
  );

  return {
    itemNumber: def.itemNumber,
    maxPerYear: def.maxPerYear ?? null,
    requiresVerification: def.requiresVerification ?? false,
    entityFirstEntry: def.entityFirstEntry ?? false,
    evidenceFields,
    scoring: {
      kind: def.kind,
      ...(PAGE_BASED_CODES.has(def.code) ? { pageBased: true } : {}),
    },
    // Absent = satisfies no licence position, which is the common and correct
    // case. See LICENCE_POSITION_LINKS for the two codes where it is deliberate.
    licencePositions: LICENCE_POSITION_LINKS[def.code] ?? [],
  };
}

export interface CatalogueType extends ScorableType {
  def: ActivityTypeDef;
  specs: ActivityTypeSpecs;
  schema: ReturnType<typeof schemaForFields>;
}

/**
 * One catalogue code as a scorable type — def, DB specs and evidence schema in
 * the shape the engine takes. This is what the app builds from an ActivityType
 * row at runtime; here it is built from the constants instead, so catalogue
 * tests exercise the same path. Throws on an unknown code.
 */
export function catalogueType(code: string): CatalogueType {
  const def = ACTIVITY_TYPES_2026.find((d) => d.code === code);
  if (!def) throw new Error(`Unknown activity type code: ${code}`);
  const specs = dbSpecs(def);
  return {
    def,
    specs,
    code: def.code,
    coefficient: def.coefficient,
    scoring: specs.scoring,
    evidenceFields: specs.evidenceFields,
    schema: schemaForFields(specs.evidenceFields, specs.scoring),
  };
}
