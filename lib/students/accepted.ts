import {
  baseCode,
  SPECIALITY_CODES,
  specialityCodeSortKey,
  subjectOf,
} from '@/lib/specialities/codes';
import type { Funding, StudentDegree, StudyForm } from '@/lib/stake/norms';
import accepted2026 from './accepted-2026.json';

// The register of admitted students — who an НПП is allowed to claim.
//
// Reference data, not a table. It is written by `pnpm students:build` from the
// ЄДЕБО export and the later contract накази, never edited in the app, and read
// by nobody but the claim form; a model plus a migration plus an import UI
// would be three moving parts maintaining a list that changes on a handful of
// days in August.
//
// SERVER ONLY. The file is ~340 KB and no page needs all of it in a browser:
// `registerOptions()` ships the picker's tree (a few KB) and the names arrive a
// combination at a time. Importing this from a `'use client'` module would put
// all 1038 into the bundle, so don't.
//
// It is also the reason the claim form has no free-text field. Before it, the
// name was typed, and «Ковальчук О.» / «Ковальчук Олена Ігорівна» were two
// different students to every duplicate check in lib/stake/claims.ts — the one
// place the whole feature has to be exact, because a duplicate is what the
// завідувач rules on.

export interface AcceptedStudent {
  /** ПІБ exactly as the ЄДЕБО export spells it, without the birth date */
  name: string;
  /** Факультет name as the database spells it */
  faculty: string;
  /** Speciality name as `SPECIALITY_NORMS_2026` spells it */
  speciality: string;
  degree: StudentDegree;
  form: StudyForm;
  funding: Funding;
}

/** The admission campaign the register covers */
export const REGISTER_YEAR = 2026;

export const ACCEPTED_STUDENTS: readonly AcceptedStudent[] = accepted2026 as AcceptedStudent[];

/** One combination of form and funding that has students behind it */
export interface RegisterVariant {
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
  ownerNames: ReadonlyMap<string, readonly string[]>
): RegisterSpeciality[] {
  // спеціальність → повна назва спеціальності → форма|фінансування
  const bySpeciality = new Map<string, Map<string, Set<string>>>();

  for (const student of ACCEPTED_STUDENTS) {
    const parent = specialityOf(student.speciality);
    let branches = bySpeciality.get(parent);
    if (!branches) bySpeciality.set(parent, (branches = new Map()));

    let variants = branches.get(student.speciality);
    if (!variants) branches.set(student.speciality, (variants = new Set()));

    variants.add(`${student.form}|${student.funding}`);
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
            const [form, funding] = key.split('|');
            return { form: form as StudyForm, funding: funding as Funding };
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
 * keeps the факультет per student as information; nothing filters on it.
 */
export interface RegisterCriteria {
  speciality: string;
  form: StudyForm;
  funding: Funding;
}

function matches(student: AcceptedStudent, criteria: RegisterCriteria): boolean {
  return (
    student.speciality === criteria.speciality &&
    student.form === criteria.form &&
    student.funding === criteria.funding
  );
}

/**
 * The students admitted under one combination, in Ukrainian alphabetical order.
 *
 * A linear scan of 1038 rows, deliberately. An index would be built on every
 * cold start of every server instance to save under a millisecond on a list
 * somebody opens a handful of times a year.
 */
export function studentsMatching(criteria: RegisterCriteria): AcceptedStudent[] {
  return ACCEPTED_STUDENTS.filter((student) => matches(student, criteria));
}

/**
 * The one register row a claim names, or null.
 *
 * The server calls this before saving and takes the claim's speciality, form,
 * funding and degree from what it returns — never from the form. A picker is a
 * convenience for the person, not a guarantee to the server: the four fields
 * arrive as ordinary form values and anybody can post whichever four they like.
 *
 * ПІБ is the key WITH the criteria, not on its own. Eighteen people are
 * admitted onto two programmes at once — Немеш Вікторія Іванівна is on Фінанси
 * and on Середня освіта (історія) — so a ПІБ alone names two register rows and
 * two different claims. The four together are unique, and a test fails the
 * moment a future list makes that untrue.
 */
export function findAcceptedStudent(
  name: string,
  criteria: RegisterCriteria
): AcceptedStudent | null {
  const wanted = normaliseName(name);
  return (
    ACCEPTED_STUDENTS.find(
      (student) => normaliseName(student.name) === wanted && matches(student, criteria)
    ) ?? null
  );
}

/** Trimmed, lower-cased, spaces collapsed — how two spellings of one ПІБ are compared */
function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
