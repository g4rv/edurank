/**
 * How a person's name is written.
 *
 * Two forms, because a dense table cannot afford the full one. «Прізвище І. П.»
 * is what Ukrainian paperwork uses in a column and what the university's own
 * forms print, so shortening is not a compromise here — it is the normal way to
 * name somebody in a list. The full name always travels with it as a tooltip.
 *
 * Built from the three fields rather than by splitting a joined string: a
 * patronymic can be missing and a surname can be double-barrelled, and both
 * cases turn a split on spaces into the wrong initials.
 */

export interface NameParts {
  lastName: string;
  firstName: string;
  patronymic: string;
}

export function fullStaffName({ lastName, firstName, patronymic }: NameParts): string {
  return [lastName, firstName, patronymic].filter(Boolean).join(' ');
}

/** «Бойко Катерина Володимирівна» → «Бойко К. В.» */
export function shortStaffName({ lastName, firstName, patronymic }: NameParts): string {
  const initials = [firstName, patronymic]
    .filter(Boolean)
    .map((part) => `${part.trim()[0].toUpperCase()}.`)
    .join(' ');
  return initials ? `${lastName} ${initials}` : lastName;
}
