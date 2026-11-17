import { doisIn, isValidDoi, normalizeDoi } from '@/lib/doi';
import { isValidIsbn, normalizeIsbn } from '@/lib/isbn';
import { sameWorkByText } from '@/lib/science/similar-title';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import type { DerivationSource } from './derivation';

/**
 * Personal-rating entries → the WORKS a кафедра holds (owner, 2026-11-16).
 *
 * The report counts works; the rating holds one entry per person, so a book of
 * three co-authors on one кафедра is three entries and one work. Pure — the
 * query feeds it, the tests drive it.
 *
 * One work is shown once, with everybody who entered it (owner, 2026-11-16,
 * after the browser test: every НПП enters the кафедра's own topic, and line 5
 * offered 13 for 3 topics). Entries join when they share:
 *  1. a strong key — ISBN, DOI, link, a registration number — whoever entered
 *     it and in whichever box the DOI sits;
 *  2. the same text once case, quotes and punctuation are ignored;
 *  3. texts `sameWorkByText` calls one work — JOINED but marked `needsCheck`,
 *     with every spelling kept in `variants`, so the head sees what was joined.
 * Text never joins two entries whose strong keys of one kind differ: two DOIs
 * are two articles, whatever the titles say.
 */

export interface WorkEntry {
  staffId: string;
  staffName: string;
  /** Normalised `<kind>:<value>` keys — see `entryKeys` */
  keys: string[];
  /** The text shown for the work and compared in tiers 2 and 3 */
  text: string;
}

export type MatchKind = 'isbn' | 'doi' | 'link' | 'number' | 'title' | 'similar';

export interface GroupedWork {
  title: string;
  /** Each person once, in the order their entries came */
  authors: { staffId: string; name: string }[];
  entryCount: number;
  /** What joined several entries into this work; null for a single entry */
  matchedBy: MatchKind | null;
  /** Joined by similar (not identical) text — a person should look */
  needsCheck: boolean;
  /** The different spellings joined here, when `needsCheck`; else empty */
  variants: string[];
}

/** Does this entry belong to the source — the select answer `when` names? */
export function matchesWhen(source: DerivationSource, evidence: Record<string, unknown>): boolean {
  if (!source.when) return true;
  const value = evidence[source.when.field];
  return typeof value === 'string' && source.when.in.includes(value);
}

/**
 * The entry's strong keys, normalised so two spellings of one identifier meet:
 * a DOI as a link or bare, an ISBN with or without hyphens, ISBN-10 or 13.
 * A value that is not a valid identifier gives no key — a typo must not
 * merge two different works.
 */
export function entryKeys(
  source: DerivationSource,
  fields: readonly EvidenceField[],
  evidence: Record<string, unknown>
): string[] {
  const keys: string[] = [];
  for (const name of source.keys) {
    const raw = evidence[name];
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    const kind = fields.find((f) => f.name === name)?.kind;
    const key = keyOf(kind, raw);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

function keyOf(kind: string | undefined, raw: string): string | null {
  if (kind === 'isbn') {
    const isbn = isbn13(raw);
    return isbn ? `isbn:${isbn}` : null;
  }
  if (kind === 'doi') {
    return isValidDoi(raw) ? `doi:${normalizeDoi(raw).toLowerCase()}` : null;
  }
  if (kind === 'url') {
    // A link that IS a DOI (https://doi.org/…) is that DOI
    const [doi] = doisIn(raw);
    if (doi && isValidDoi(doi)) return `doi:${normalizeDoi(doi).toLowerCase()}`;
    const link = raw
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/#.*$/, '')
      .replace(/\/+$/, '');
    return link ? `link:${link}` : null;
  }
  // A registration / certificate number: letters and digits only, so «№ 123-45»
  // and «12345» are one number
  const number = raw.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
  return number ? `number:${number}` : null;
}

/** An ISBN as its 13-digit form, or null when it is not a valid ISBN */
function isbn13(raw: string): string | null {
  if (!isValidIsbn(raw)) return null;
  const digits = normalizeIsbn(raw);
  if (digits.length === 13) return digits;
  const body = `978${digits.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

/** The text as words only: «"Назва."» and «назва» are one */
function plainText(raw: string): string {
  return (raw.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');
}

/** Key kinds that name ONE work — two different values are two works. A link does not: one work has many addresses. */
const IDENTIFYING = ['isbn', 'doi', 'number'] as const;

/** Do two sets of keys name different works? */
function keysConflict(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return IDENTIFYING.some((kind) => {
    const ofA = [...a].filter((k) => k.startsWith(`${kind}:`));
    const ofB = [...b].filter((k) => k.startsWith(`${kind}:`));
    return ofA.length > 0 && ofB.length > 0 && !ofA.some((k) => b.has(k));
  });
}

export function groupWorks(entries: readonly WorkEntry[]): GroupedWork[] {
  const parent = entries.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const keysOf = new Map(entries.map((e, i) => [i, new Set(e.keys)]));
  const union = (i: number, j: number) => {
    const a = find(i);
    const b = find(j);
    if (a === b) return;
    parent[b] = a;
    for (const k of keysOf.get(b)!) keysOf.get(a)!.add(k);
  };

  // Tier 1: a shared strong key
  const owner = new Map<string, number>();
  entries.forEach((entry, i) => {
    for (const key of entry.keys) {
      const seen = owner.get(key);
      if (seen === undefined) owner.set(key, i);
      else union(seen, i);
    }
  });

  // Tiers 2 and 3: the same text, then a similar one — never across differing keys
  const plain = entries.map((e) => plainText(e.text));
  const textPairs: { i: number; j: number; similar: boolean }[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (plain[i] === '') continue;
    for (let j = i + 1; j < entries.length; j++) {
      if (plain[j] === '' || find(i) === find(j)) continue;
      const same = plain[i] === plain[j];
      if (!same && !sameWorkByText(entries[i].text, entries[j].text)) continue;
      if (keysConflict(keysOf.get(find(i))!, keysOf.get(find(j))!)) continue;
      union(i, j);
      textPairs.push({ i, j, similar: !same });
    }
  }

  const groups = new Map<number, number[]>();
  entries.forEach((_, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), i]);
  });

  return [...groups.values()].map((indexes) => {
    const members = indexes.map((i) => entries[i]);
    const authors: GroupedWork['authors'] = [];
    for (const m of members) {
      if (!authors.some((a) => a.staffId === m.staffId)) {
        authors.push({ staffId: m.staffId, name: m.staffName });
      }
    }
    const inGroup = new Set(indexes);
    const pairs = textPairs.filter((p) => inGroup.has(p.i));
    const needsCheck = pairs.some((p) => p.similar);

    // One spelling per plain text, in the order they came
    const variants: string[] = [];
    const seenPlain = new Set<string>();
    for (const i of indexes) {
      const text = entries[i].text.trim();
      if (text === '' || seenPlain.has(plain[i])) continue;
      seenPlain.add(plain[i]);
      variants.push(text);
    }

    let matchedBy: MatchKind | null = null;
    if (members.length > 1) {
      matchedBy =
        sharedKeyKind(members) ??
        (pairs.some((p) => !p.similar) ? 'title' : needsCheck ? 'similar' : null);
    }
    return {
      title: variants[0] ?? '—',
      authors,
      entryCount: members.length,
      matchedBy,
      needsCheck,
      variants: needsCheck ? variants : [],
    };
  });
}

/** The strongest kind of key two members of a group share */
function sharedKeyKind(members: readonly WorkEntry[]): MatchKind | null {
  const count = new Map<string, number>();
  for (const m of members) for (const k of m.keys) count.set(k, (count.get(k) ?? 0) + 1);
  const shared = new Set(
    [...count.entries()].filter(([, n]) => n > 1).map(([k]) => k.split(':')[0])
  );
  for (const kind of ['isbn', 'doi', 'number', 'link'] as const) {
    if (shared.has(kind)) return kind;
  }
  return null;
}

/** How many works of the list were joined by similar text and need a look */
export function needsCheckCount(works: readonly GroupedWork[]): number {
  return works.filter((w) => w.needsCheck).length;
}

/** How many different people entered the works of the list */
export function authorCount(works: readonly GroupedWork[]): number {
  return new Set(works.flatMap((w) => w.authors.map((a) => a.staffId))).size;
}
