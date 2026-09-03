import {
  baseCode,
  SPECIALITY_CODES,
  specialityCodeSortKey,
  subjectOf,
} from '@/lib/specialities/codes';
import type { Funding, StudentDegree, StudyForm } from '@/lib/stake/norms';

// Shaping the register for the claim picker. NO DATA and NO DATABASE.
//
// It read `accepted-2026.json` until 2026-09-03 and described itself as
// "reference data, not a table". It is a table now — see
// docs/students-register.md — and every read lives in
// lib/queries/list-admitted-students.ts. What is left here is the part that was
// always pure: turning a flat list of admissions into the cascade the picker
// walks. Rows come in as an argument, which is also why the tests can still
// feed it the real 1046 out of the JSON.
//
// The register is still the reason the claim form has no free-text field.
// Before it, the name was typed, and «Ковальчук О.» / «Ковальчук Олена
// Ігорівна» were two different students to every duplicate check in
// lib/stake/claims.ts — the one place the whole feature has to be exact,
// because a duplicate is what the ADMIN rules on.

/** One admission, as everything here needs it. The row's id is nobody's business. */
export interface RegisterRow {
  /** ПІБ as the наказ spells it */
  name: string;
  /** Speciality name as `SPECIALITY_NORMS_2026` spells it */
  speciality: string;
  degree: StudentDegree;
  form: StudyForm;
  funding: Funding;
}

/**
 * One combination that has students behind it.
 *
 * Ступінь joined форма and фінансування once the магістр накази landed. It was
 * outside the tree while every admitted person was a бакалавр — it distinguished
 * nothing — and that is exactly why the claim form could not offer it until the
 * candidates had loaded. In here, all three are answerable the moment a
 * спеціальність is chosen.
 */
export interface RegisterVariant {
  degree: StudentDegree;
  form: StudyForm;
  funding: Funding;
}

/**
 * One спеціалізація of a спеціальність — «Географія» under «Середня освіта».
 *
 * The split is derived from our own speciality name rather than stored, because
 * додаток 5 already writes it that way: «Середня освіта (географія)» is the
 * спеціальність and the спеціалізація in one string, and the ЄДЕБО export
 * agrees with it column for column (A4 + A4.07). Deriving keeps ONE set of
 * names in the app — a picker labelled with the law's wording and a claims
 * table labelled with додаток 5's would be two names for one programme.
 *
 * A спеціальність with no спеціалізація has a single branch with `name: null`,
 * and the picker skips the step rather than showing a select of one.
 */
export interface RegisterBranch {
  /** «Географія», or null where the спеціальність has no спеціалізації */
  name: string | null;
  /** The full name — «Середня освіта (географія)» — as the norms and the claim spell it */
  speciality: string;
  /** From SPECIALITY_CODES, or null for a speciality the codes list has no entry for */
  code: string | null;
  /**
   * Випускові кафедри, for display beside the speciality. Derived rather than
   * stored: the ЄДЕБО export has no кафедра column at all, and six specialities
   * are taught by two of them — a single value would be a guess on a third of
   * the register.
   */
  departments: readonly string[];
  variants: readonly RegisterVariant[];
}

export interface RegisterSpeciality {
  /** «Середня освіта» — the спеціальність alone, without its спеціалізація */
  name: string;
  /** The спеціальність's own code, «A4» */
  code: string | null;
  branches: readonly RegisterBranch[];
}

/**
 * The picker's cascade, carrying only combinations that have students.
 *
 * Every level is built from the register itself, so a спеціалізація, a form or
 * a funding that nobody was admitted under is never offered. An empty select is
 * a dead end the person cannot diagnose; an absent option is one they never
 * walk into.
 *
 * **Not grouped by факультет** (changed 2026-08-13). It was a step that narrowed
 * nothing the claim records: a claim stores the speciality, never the факультет,
 * and the bonus follows the RECRUITER wherever the student studies. Worse, it
 * split «Психологія» in two — 36 on СП and 39 on ММПП are one speciality with
 * one норматив, and an НПП who picked the wrong факультет found their student
 * missing from a list that looked complete.
 */
export function registerOptions(
  students: readonly RegisterRow[],
  ownerNames: ReadonlyMap<string, readonly string[]>
): RegisterSpeciality[] {
  // спеціальність → повна назва спеціальності → форма|фінансування
  const bySpeciality = new Map<string, Map<string, Set<string>>>();

  for (const student of students) {
    const parent = specialityOf(student.speciality);
    let branches = bySpeciality.get(parent);
    if (!branches) bySpeciality.set(parent, (branches = new Map()));

    let variants = branches.get(student.speciality);
    if (!variants) branches.set(student.speciality, (variants = new Set()));

    variants.add(`${student.degree}|${student.form}|${student.funding}`);
  }

  return [...bySpeciality]
    .map(([name, branches]) => ({
      name,
      code: codeOf(branches),
      branches: [...branches]
        .sort(([a], [b]) => specialityCodeSortKey(a).localeCompare(specialityCodeSortKey(b), 'uk'))
        .map(([speciality, variants]) => ({
          name: subjectOf(speciality),
          speciality,
          code: SPECIALITY_CODES[speciality]?.code ?? null,
          departments: ownerNames.get(speciality) ?? [],
          variants: [...variants].sort().map((key) => {
            const [degree, form, funding] = key.split('|');
            return {
              degree: degree as StudentDegree,
              form: form as StudyForm,
              funding: funding as Funding,
            };
          }),
        })),
    }))
    .sort((a, b) => sortKeyOf(a).localeCompare(sortKeyOf(b), 'uk'));
}

/** «Середня освіта (географія)» → «Середня освіта»; «Психологія» → «Психологія» */
function specialityOf(name: string): string {
  return name.replace(/\s*\([^)]+\)\s*$/, '');
}

/** «A4.07» and «A4.03» both sit under «A4»; null where no branch has a code */
function codeOf(branches: Map<string, unknown>): string | null {
  for (const speciality of branches.keys()) {
    const code = SPECIALITY_CODES[speciality]?.code;
    if (code) return baseCode(code);
  }
  return null;
}

/** Спеціальності sort by code, like every other speciality list in the app */
function sortKeyOf(speciality: { branches: readonly RegisterBranch[] }): string {
  return specialityCodeSortKey(speciality.branches[0]?.speciality ?? '');
}

/**
 * What the picker narrows the register down by — every field required.
 *
 * `faculty` is deliberately absent: a claim does not record one, and a
 * speciality taught on two факультети is still one speciality. The register
 * does not carry a факультет at all any more — nothing ever filtered on it.
 *
 * Consumed by lib/queries/list-admitted-students.ts, which turns these three
 * into a where clause.
 */
export interface RegisterCriteria {
  speciality: string;
  form: StudyForm;
  funding: Funding;
}
