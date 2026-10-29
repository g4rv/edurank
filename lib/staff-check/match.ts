import type { AcademicTitle, StaffPosition } from '@/lib/generated/prisma/client';

/**
 * How the staff list's words meet the database's — names, кафедри, ступені,
 * посади (owner, 2026-10-28). Everything is compared on LETTERS: case, spaces,
 * apostrophes (’ ' ʼ) and the word «кафедра» never decide a match, because the
 * list and the database spell them differently and both are hand-typed.
 */

/** Letters only, lower case — the form two spellings are compared in */
export function letters(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/кафедра/g, '')
    .replace(/[’'`ʼ]/g, '')
    .replace(/[^a-zа-яіїєґ]/g, '');
}

/** Edit distance — how many letters apart two spellings are */
export function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length];
}

/**
 * The кафедра a list name stands for: the closest by letters, if it is close
 * enough to be the same name with a typo («педагогки», «документо знавства»).
 * `null` when nothing is — such a name is reported, never guessed.
 */
export function matchDepartment<T extends { name: string }>(
  name: string,
  departments: readonly T[]
): T | null {
  const want = letters(name);
  let best: { d: T; dist: number } | null = null;
  for (const d of departments) {
    const dist = distance(want, letters(d.name));
    if (!best || dist < best.dist) best = { d, dist };
  }
  return best && best.dist <= Math.max(3, Math.round(want.length * 0.08)) ? best.d : null;
}

export interface NamedPerson {
  lastName: string;
  firstName: string;
  patronymic: string | null;
}

export type NameMatch = 'exact' | 'noPatronymic' | 'typo';

/**
 * Who in `people` a list name is, and how sure. Never by surname alone — two
 * Троценко, two Костик and two accounts of one Перчук are real (see memory
 * «Перчук: one person, two accounts»):
 *
 * - `exact` — the full ПІБ, letters only;
 * - `noPatronymic` — surname and ім'я exact, по батькові missing on one side
 *   («Скибіцька Діана»);
 * - `typo` — the full ПІБ within 2 letters («Панатолій» / «Анатолій»), and only
 *   when exactly one person is that close.
 */
export function matchPeople<T extends NamedPerson>(
  lastName: string,
  names: string | null,
  people: readonly T[]
): { people: T[]; how: NameMatch } | null {
  const want = letters(`${lastName}${names ?? ''}`);
  const full = (p: T) => letters(`${p.lastName}${p.firstName}${p.patronymic ?? ''}`);

  const exact = people.filter((p) => full(p) === want);
  if (exact.length) return { people: exact, how: 'exact' };

  const [firstName, patronymic] = (names ?? '').split(' ');
  const partial = people.filter(
    (p) =>
      letters(p.lastName) === letters(lastName) &&
      letters(p.firstName) === letters(firstName) &&
      (!p.patronymic || !patronymic)
  );
  if (partial.length) return { people: partial, how: 'noPatronymic' };

  // Surname and ім'я exact, по батькові up to 3 letters off («Ананійович» /
  // «Анатолійович»); or the whole ПІБ within 2 («Панатолій» / «Анатолій»).
  const close = people.filter(
    (p) =>
      (letters(p.lastName) === letters(lastName) &&
        letters(p.firstName) === letters(firstName) &&
        distance(letters(p.patronymic), letters(patronymic)) <= 3) ||
      (letters(p.lastName)[0] === letters(lastName)[0] && distance(full(p), want) <= 2)
  );
  return close.length === 1 ? { people: close, how: 'typo' } : null;
}

/** The list's посада → the profile's; «завідувач» is a headship, not a посада */
export const POSITION_FROM_LIST: Readonly<Record<string, StaffPosition>> = {
  викладач: 'LECTURER',
  'старший викладач': 'SENIOR_LECTURER',
  доцент: 'DOCENT',
  професор: 'PROFESSOR',
};

/** The list's вчене звання → the profile's */
export const TITLE_FROM_LIST: Readonly<Record<string, AcademicTitle>> = {
  доцент: 'DOCENT',
  професор: 'PROFESSOR',
  'старший дослідник': 'SENIOR_RESEARCHER',
};

const BRANCHES: readonly (readonly [string, RegExp])[] = [
  // Order matters: the specific ones before the words they contain
  ['public_admin', /державн|жавногоуправ|наукздер/],
  ['sport', /фізичноговихов|наукзфізич/],
  ['physmath', /фізикоматем|фізико|математичн/],
  ['agriculture', /сільськ|господарськ/],
  ['pedagogy', /педаг/],
  ['history', /історичн/],
  ['psychology', /психолог/],
  ['economics', /економ/],
  ['philology', /філолог/],
  ['philosophy', /філософськ/],
  ['technical', /технічн/],
  ['medicine', /медичн/],
  ['politics', /політичн/],
  ['geography', /географ/],
  ['law', /юридичн/],
  ['biology', /біологічн/],
  ['arts', /мистецтвознав/],
];

/**
 * The list's ступінь as the profile's degree key: «кандидат» + «педагогічних
 * наук» → `cand_pedagogy`, «доктор філософії» → `phd`. A level with no branch
 * the list makes legible («доктор наук», alone) is `cand_?` / `doc_?` — the
 * level is known, the branch is not. `null` when the list says nothing.
 */
export function degreeFromList(level: string | null, field: string | null): string | null {
  if (!level) return null;
  const head = letters(level);
  if (head.startsWith('докторфілософ')) return 'phd';
  const prefix = head.startsWith('кандидат') ? 'cand' : head.startsWith('доктор') ? 'doc' : null;
  if (!prefix) return null;
  const all = letters(`${level}${field ?? ''}`);
  const branch = BRANCHES.find(([, re]) => re.test(all))?.[0];
  return `${prefix}_${branch ?? '?'}`;
}
