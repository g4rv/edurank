import type { RegisterSpeciality, RegisterVariant } from './accepted';

/**
 * The claim form's cascade, as pure functions.
 *
 * Спеціальність → [спеціалізація] → ступінь · форма · фінансування. Every step
 * offers only values the register still has students under, so a choice can
 * never leave the form on a combination with nobody behind it.
 *
 * **Extracted from `my-claims.tsx` on 2026-09-10**, where it sat between two
 * React components and had no tests. None of it touches the DOM, a session or
 * the database — it is a set of questions about one JSON tree — so it belongs
 * beside the tree rather than inside the form that happens to ask them.
 */

/**
 * What the selects hold.
 *
 * `branch` is the FULL speciality name — «Середня освіта (географія)» — because
 * that is what a claim records and what додаток 5 prices. `speciality` is the
 * stem it was split from, and exists only to drive the first select.
 */
export interface Selection {
  speciality: string;
  branch: string;
  degree: string;
  form: string;
  funding: string;
}

export const EMPTY_SELECTION: Selection = {
  speciality: '',
  branch: '',
  degree: '',
  form: '',
  funding: '',
};

/** The three that describe the admission itself, as opposed to the programme */
export const TERMS = ['degree', 'form', 'funding'] as const;
export type Term = (typeof TERMS)[number];

const unique = <T>(values: T[]): T[] => [...new Set(values)];

export function branchesOf(register: RegisterSpeciality[], speciality: string) {
  return register.find((s) => s.name === speciality)?.branches ?? [];
}

export function variantsOf(
  register: RegisterSpeciality[],
  speciality: string,
  branch: string
): readonly RegisterVariant[] {
  return branchesOf(register, speciality).find((b) => b.speciality === branch)?.variants ?? [];
}

/** Does this variant agree with everything chosen so far, ignoring one term? */
function fits(variant: RegisterVariant, selection: Selection, except: Term): boolean {
  return TERMS.every((t) => t === except || !selection[t] || variant[t] === selection[t]);
}

/**
 * What one term can still be, given the other two.
 *
 * Ступінь, форма and фінансування are three views of the same set of variants,
 * not a chain — so each offers whatever is still reachable and every one of
 * them is answerable the moment a спеціальність is chosen. Before that they
 * have nothing to offer, which is the only reason they are ever closed.
 *
 * The term being ASKED about is excluded from the filter, so a value already
 * chosen never hides its own siblings — otherwise picking «Бюджет» would leave
 * «Бюджет» as the only funding on offer and the choice could not be undone.
 */
export function optionsFor(
  variants: readonly RegisterVariant[],
  selection: Selection,
  term: Term
): string[] {
  return unique(variants.filter((v) => fits(v, selection, term)).map((v) => v[term]));
}

/**
 * Fills in every term that has only one possible answer.
 *
 * A select with one option is a click that decides nothing, and it hides the
 * real question behind it — «Філологія» has exactly one спеціалізація, and
 * plenty of programmes were only offered денна, or only on контракт.
 *
 * Nothing is ever taken away here: `optionsFor` only ever offers a value that
 * agrees with the other two, so a choice cannot leave the form on a combination
 * with nobody behind it. Settling one term CAN leave another with a single
 * answer though — «Образотворче мистецтво · Заочна» has one ступінь and one
 * фінансування — so it runs until nothing more settles.
 */
export function resolve(register: RegisterSpeciality[], selection: Selection): Selection {
  const branches = branchesOf(register, selection.speciality);
  const branch = selection.branch || (branches.length === 1 ? branches[0]!.speciality : '');
  if (!branch) return { ...EMPTY_SELECTION, speciality: selection.speciality };

  const variants = variantsOf(register, selection.speciality, branch);
  let next: Selection = { ...selection, branch };

  for (let pass = 0; pass < TERMS.length; pass++) {
    let settled = false;
    for (const term of TERMS) {
      if (next[term]) continue;
      const options = optionsFor(variants, next, term);
      if (options.length === 1) {
        next = { ...next, [term]: options[0]! };
        settled = true;
      }
    }
    if (!settled) break;
  }

  return next;
}
