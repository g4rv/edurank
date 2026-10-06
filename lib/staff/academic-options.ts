/**
 * The option lists of «Академічна інформація» and «Освіта» (owner, 2026-10-06).
 *
 * A label map like `lib/labels.ts`, kept apart because these lists are longer
 * and change on their own schedule — the university supplies them
 * (`edu-reference/Науковий ступінь.docx`, `edu-reference/Почесне звання.docx`).
 *
 * **The keys are what the database stores, the labels are what people read.**
 * A key is never renamed once saved; a new branch of science is one new line
 * here and no migration, which is why these are text columns and not enums.
 */

export interface AcademicOption {
  value: string;
  label: string;
}

/** The 17 branches of science both degree lists share, in the docx's order */
const BRANCHES = [
  ['biology', 'біологічних наук'],
  ['geography', 'географічних наук'],
  ['economics', 'економічних наук'],
  ['history', 'історичних наук'],
  ['medicine', 'медичних наук'],
  ['arts', 'мистецтвознавства'],
  ['public_admin', 'наук з державного управління'],
  ['sport', 'наук з фізичного виховання і спорту'],
  ['pedagogy', 'педагогічних наук'],
  ['politics', 'політичних наук'],
  ['psychology', 'психологічних наук'],
  ['agriculture', 'сільськогосподарських наук'],
  ['technical', 'технічних наук'],
  ['physmath', 'фізико-математичних наук'],
  ['philology', 'філологічних наук'],
  ['philosophy', 'філософських наук'],
  ['law', 'юридичних наук'],
] as const;

/**
 * A degree carried over from the old single field, which knew the level but
 * not the branch (2026-10-06 migration) — no file the university holds names
 * the branch either, so the person picks it.
 *
 * **Never an option** (owner, 2026-10-06: «there should be no blank option»):
 * not in the lists below, so nobody picks it and no filter offers it. It stays
 * STORED until the exact degree is chosen, because rating 1.3 pays the level
 * and clearing it would take 20–50 points off ~230 people at their next save.
 * Read anywhere as the plain level — `degreeName`.
 */
export const UNSPECIFIED_CANDIDATE = 'candidate_unspecified';
export const UNSPECIFIED_DOCTOR = 'doctor_unspecified';

/** «Кандидат / PhD» slot: «Доктор філософії (PhD)» + 17 «Кандидат … наук» */
export const CANDIDATE_DEGREES: readonly AcademicOption[] = [
  { value: 'phd', label: 'Доктор філософії (PhD)' },
  ...BRANCHES.map(([key, branch]) => ({ value: `cand_${key}`, label: `Кандидат ${branch}` })),
];

/** «Доктор наук» slot: 17 «Доктор … наук» */
export const DOCTOR_DEGREES: readonly AcademicOption[] = [
  ...BRANCHES.map(([key, branch]) => ({ value: `doc_${key}`, label: `Доктор ${branch}` })),
];

/** A stored degree whose branch nobody has chosen yet — see `UNSPECIFIED_CANDIDATE` */
export function isUnspecifiedDegree(value: string | null | undefined): boolean {
  return value === UNSPECIFIED_CANDIDATE || value === UNSPECIFIED_DOCTOR;
}

/**
 * A stored degree as words: its exact name, or the plain level while the
 * branch is not chosen — «Кандидат наук», never «уточніть галузь».
 */
export function degreeName(slot: 'candidate' | 'doctor', value: string): string {
  if (value === UNSPECIFIED_CANDIDATE) return 'Кандидат наук';
  if (value === UNSPECIFIED_DOCTOR) return 'Доктор наук';
  return optionLabel(slot === 'doctor' ? DOCTOR_DEGREES : CANDIDATE_DEGREES, value);
}

/** Почесні звання — information only; rating 1.4 is entered by відділ кадрів */
export const HONORARY_TITLES: readonly AcademicOption[] = [
  { value: 'people_artist', label: 'Народний художник' },
  { value: 'people_teacher', label: 'Народний вчитель' },
  { value: 'merited_arts_figure', label: 'Заслужений діяч мистецтв' },
  { value: 'merited_coach', label: 'Заслужений тренер України' },
  { value: 'merited_artist', label: 'Заслужений художник' },
  { value: 'merited_teacher', label: 'Заслужений вчитель' },
  { value: 'merited_culture_worker', label: 'Заслужений працівник культури' },
  { value: 'merited_master_sport', label: 'Заслужений майстер спорту України' },
  { value: 'merited_education_worker', label: 'Заслужений працівник освіти України' },
  { value: 'merited_folk_master', label: 'Заслужений майстер народної творчості України' },
  {
    value: 'merited_sport_worker',
    label: 'Заслужений працівник фізичної культури і спорту України',
  },
  { value: 'merited_journalist', label: 'Заслужений журналіст' },
];

/** Label of a stored key, or the key itself if the list no longer has it */
export function optionLabel(list: readonly AcademicOption[], value: string): string {
  return list.find((o) => o.value === value)?.label ?? value;
}
