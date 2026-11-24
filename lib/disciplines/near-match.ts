import { disciplineKey } from './assigned';

/**
 * Pairing a discipline a person was assigned but has no entry for with one of
 * their entries that is NOT on the list — the same course typed with a slip
 * («органзація», «німмецької», a Latin «i», a group code in front). Used by
 * `db:discipline-fix-names`, which renames such an entry to the assigned name so
 * the 5.1 rule sees it (owner, 2026-11-24).
 *
 * It only ever PROPOSES one-to-one pairs it is sure of: a pair with a close
 * rival on either side is left alone and reported as ambiguous.
 */

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** 1 = the same once case, spaces and quotes are ignored; 0 = nothing in common */
export function nameSimilarity(a: string, b: string): number {
  const x = disciplineKey(a);
  const y = disciplineKey(b);
  return 1 - distance(x, y) / Math.max(x.length, y.length, 1);
}

export interface MissingName {
  name: string;
}
export interface ExtraEntry {
  id: string;
  name: string;
}
export interface NearPair {
  missing: string;
  entryId: string;
  entryName: string;
  similarity: number;
}
export interface HeldPair extends NearPair {
  /** rival: another candidate is nearly as close · extends: one name is the other plus words */
  reason: 'rival' | 'extends';
}
export interface NearResult {
  pairs: NearPair[];
  /** Close enough, but not safe to rename by itself — a person decides */
  ambiguous: HeldPair[];
}

/**
 * One name is the other with words added or taken away («… мови» and «… мови
 * д.ф.», «… (вибіркова)», a group code in front). Those are often a different
 * group or form of the same course, not a slip — never renamed by a script.
 */
function extendsOther(a: string, b: string): boolean {
  const x = disciplineKey(a).split(' ');
  const y = disciplineKey(b).split(' ');
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length === long.length) return false;
  // Whole words only: «підприємств» is not inside «підприємства»
  for (let i = 0; i + short.length <= long.length; i++) {
    if (short.every((w, k) => long[i + k] === w)) return true;
  }
  return false;
}

/** How much closer a pair must be than any rival to be taken */
const RIVAL_MARGIN = 0.05;

export function pairNearMatches(
  missing: readonly MissingName[],
  extras: readonly ExtraEntry[],
  min: number
): NearResult {
  const all: NearPair[] = [];
  // Two entries typed with exactly the same text are one candidate: the first
  // is taken, the twin stays as it is (an extra, which counts nowhere)
  const seenText = new Set<string>();
  const distinct = extras.filter((e) => {
    const k = disciplineKey(e.name);
    if (seenText.has(k)) return false;
    seenText.add(k);
    return true;
  });
  for (const m of missing) {
    for (const e of distinct) {
      const similarity = nameSimilarity(m.name, e.name);
      if (similarity >= min) {
        all.push({ missing: m.name, entryId: e.id, entryName: e.name, similarity });
      }
    }
  }
  const rival = (p: NearPair) =>
    all.some(
      (q) =>
        q !== p &&
        ((q.missing === p.missing && q.entryId !== p.entryId) ||
          (q.entryId === p.entryId && q.missing !== p.missing)) &&
        q.similarity > p.similarity - RIVAL_MARGIN
    );
  const pairs: NearPair[] = [];
  const ambiguous: HeldPair[] = [];
  for (const p of [...all].sort((a, b) => b.similarity - a.similarity)) {
    if (extendsOther(p.missing, p.entryName)) ambiguous.push({ ...p, reason: 'extends' });
    else if (rival(p)) ambiguous.push({ ...p, reason: 'rival' });
    else pairs.push(p);
  }
  return { pairs, ambiguous };
}
