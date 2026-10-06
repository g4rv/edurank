/**
 * Reading the «Науковий керівник» cell of the аспірантура's list and finding
 * the НПП it names (owner, 2026-10-07).
 *
 * The cell is typed by hand and says the same thing a dozen ways:
 * «д.пед.н., проф. Ю.П. Шапран», «Пангелова Н.Є», «проф.М.І.Карпа»,
 * «Пархоменко-Куцевіл» with no initials, two керівники in one cell, and typos
 * — «Калівошка» / «Калівошко», «Гомич» for «Хомич». So the rule is forgiving
 * about the surname and strict about everything else:
 *
 * - degrees and titles are dropped — they are lower-case abbreviations, and a
 *   surname is the only capitalised word;
 * - the surname may differ by ONE letter;
 * - initials, where the cell gives them, must both agree;
 * - exactly one НПП must fit. Two Шапран (Ольга, Юрій) are told apart by the
 *   initials; anything still ambiguous or unfound is NOT matched and is
 *   reported, never guessed — a wrong match would let one person record
 *   another's аспірант.
 */

export interface SupervisorMention {
  surname: string;
  /** «ЮП» — first-name and patronymic initials; empty when the cell gives none */
  initials: string;
}

export interface StaffCandidate {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string;
}

const UPPER = 'А-ЯІЇЄҐ';
const LOWER = "а-яіїєґ'’ʼ";
/** «Шапран», and a double one — «Пархоменко-Куцевіл» — as ONE surname */
const SURNAME = `[${UPPER}][${LOWER}]+(?:-[${UPPER}][${LOWER}]+)?`;

/** Every керівник the cell names, in order, at most as written */
export function parseSupervisors(cell: string): SupervisorMention[] {
  const text = cell.replace(/ /g, ' ');
  const found: { at: number; mention: SupervisorMention }[] = [];
  const taken: [number, number][] = [];
  const overlaps = (a: number, b: number) => taken.some(([x, y]) => a < y && b > x);

  // «Ю.П. Шапран», «М.І.Карпа»
  const initialsFirst = new RegExp(`([${UPPER}])\\.\\s?([${UPPER}])\\.?\\s*(${SURNAME})`, 'g');
  // «Шапран Ю.П.», «Пангелова Н.Є»
  const surnameFirst = new RegExp(`(${SURNAME})\\s+([${UPPER}])\\.\\s?([${UPPER}])\\.?`, 'g');

  for (const m of text.matchAll(initialsFirst)) {
    found.push({ at: m.index!, mention: { surname: m[3], initials: m[1] + m[2] } });
    taken.push([m.index!, m.index! + m[0].length]);
  }
  for (const m of text.matchAll(surnameFirst)) {
    if (overlaps(m.index!, m.index! + m[0].length)) continue;
    found.push({ at: m.index!, mention: { surname: m[1], initials: m[2] + m[3] } });
    taken.push([m.index!, m.index! + m[0].length]);
  }
  // «Пархоменко-Куцевіл» — a surname with no initials at all
  for (const m of text.matchAll(new RegExp(SURNAME, 'g'))) {
    if (overlaps(m.index!, m.index! + m[0].length) || m[0].length < 4) continue;
    found.push({ at: m.index!, mention: { surname: m[0], initials: '' } });
    taken.push([m.index!, m.index! + m[0].length]);
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.mention);
}

/** Lower-case, apostrophes of every kind folded to one */
export function foldName(value: string): string {
  return value.toLowerCase().replace(/[’ʼ`]/g, "'").replace(/\s+/g, ' ').trim();
}

/** At most one letter added, removed or changed */
function withinOneLetter(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** The one НПП a mention names, or null when none or several fit */
export function matchSupervisor(
  mention: SupervisorMention,
  staff: readonly StaffCandidate[]
): StaffCandidate | null {
  const surname = foldName(mention.surname);
  const fits = staff.filter((s) => {
    if (!withinOneLetter(foldName(s.lastName), surname)) return false;
    if (!mention.initials) return true;
    const own = (s.firstName[0] ?? '') + (s.patronymic[0] ?? '');
    return own.toUpperCase() === mention.initials.toUpperCase();
  });
  return fits.length === 1 ? fits[0] : null;
}
