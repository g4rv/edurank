import type { EvidenceField } from '@/lib/rating/evidence-fields';

/**
 * Disciplines assigned to an НПП for rating 5.1 (owner, 2026-11-19). No
 * database in this file, so a client component can import it.
 *
 * A person who has any must answer 5.1 once for EACH of them. The form draws the
 * discipline as a select over exactly their list, and the year closes at 0
 * while one is missing (`rating-gate.ts`). A person with none keeps the old
 * rule — one free-text entry.
 */

/** What «the same discipline» compares: case, spaces, quotes and a trailing dot ignored */
export function disciplineKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’ʼ`‘´]/g, "'")
    .replace(/[«»“”"]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.]+$/, '')
    .trim();
}

export interface AssignedName {
  name: string;
  nameNormalised: string;
  /**
   * A moderator counted it WITHOUT an entry behind it (owner, 2026-11-24). It then
   * reads as answered everywhere, and shows as such.
   */
  accepted?: boolean;
}

/**
 * A person's topics as the file gives them: blanks dropped, and a name given
 * twice (the same course for several groups) kept once. The first spelling wins.
 */
export function uniqueDisciplines(names: readonly string[]): AssignedName[] {
  const seen = new Map<string, AssignedName>();
  for (const raw of names) {
    const name = raw.replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const key = disciplineKey(name);
    if (key && !seen.has(key)) seen.set(key, { name, nameNormalised: key });
  }
  return [...seen.values()];
}

/** The discipline an entry's evidence names, as a key; null when it names none */
export function evidenceDisciplineKey(evidence: unknown): string | null {
  if (!evidence || typeof evidence !== 'object') return null;
  const v = (evidence as Record<string, unknown>).discipline;
  return typeof v === 'string' && v.trim() ? disciplineKey(v) : null;
}

/**
 * Is `b` the very same entry as `a` — the same discipline, the same answer to
 * «Я лектор» and the same link? A discipline may hold SEVERAL entries (owner,
 * 2026-11-24: the department gave one name for every group, so each group is an
 * entry of its own); only an exact repeat is refused.
 */
export function isRepeatEntry(a: unknown, b: unknown): boolean {
  const key = evidenceDisciplineKey(a);
  if (!key || key !== evidenceDisciplineKey(b)) return false;
  const get = (e: unknown, f: string) => (e as Record<string, unknown> | null)?.[f];
  const link = (e: unknown) =>
    String(get(e, 'link') ?? '')
      .trim()
      .toLowerCase();
  return (get(a, 'isLecturer') === true) === (get(b, 'isLecturer') === true) && link(a) === link(b);
}

/** Which of `assigned` neither an entry of `evidences` nor a moderator covers yet, in the given order */
export function missingDisciplines(
  assigned: readonly AssignedName[],
  evidences: readonly unknown[]
): AssignedName[] {
  const done = new Set<string>();
  for (const e of evidences) {
    const key = evidenceDisciplineKey(e);
    if (key) done.add(key);
  }
  return assigned.filter((a) => !a.accepted && !done.has(a.nameNormalised));
}

/** An entry that names none of the assigned disciplines — what a moderator may count */
export interface UnmatchedEntry {
  activityId: string;
  /** The discipline as the person typed it */
  name: string;
  link: string;
}

/**
 * The entries whose discipline is not on `assigned` (a slip in the name, an
 * abbreviation, a course the list left out), in the order given. A moderator may
 * count one of them for a discipline the person is missing («Зарахувати»).
 */
export function unmatchedEntries(
  assigned: readonly AssignedName[],
  entries: readonly { id: string; evidence: unknown }[]
): UnmatchedEntry[] {
  const keys = new Set(assigned.map((a) => a.nameNormalised));
  return entries.flatMap((e) => {
    const key = evidenceDisciplineKey(e.evidence);
    if (!key || keys.has(key)) return [];
    const ev = e.evidence as Record<string, unknown>;
    return [
      {
        activityId: e.id,
        name: String(ev.discipline).replace(/\s+/g, ' ').trim(),
        link: typeof ev.link === 'string' ? ev.link : '',
      },
    ];
  });
}

/** Does the form spec ask for a discipline that can be chosen from a list? */
export function hasDisciplineField(fields: readonly EvidenceField[]): boolean {
  return fields.some((f) => f.kind === 'text' && f.fromDisciplines);
}

/**
 * The form for a person who HAS assigned disciplines: the discipline box
 * becomes a select over the given names, and it is always drawn and always
 * required — «Я лектор» stays a per-entry answer and decides only whether the
 * link and the материали are asked. A select's value must be one of its
 * options, so the schema also refuses a discipline that is not theirs.
 *
 * With no names the spec comes back as it is (free text, the old rule).
 */
export function withAssignedDisciplines(
  fields: readonly EvidenceField[],
  names: readonly string[],
  /** Names that already have an entry: still offered (another group), but marked */
  done: ReadonlySet<string> = new Set()
): EvidenceField[] {
  if (names.length === 0) return [...fields];
  return fields.map((f) =>
    f.kind === 'text' && f.fromDisciplines
      ? {
          kind: 'select' as const,
          name: f.name,
          label: f.label,
          options: names.map((n) => ({ value: n, label: done.has(n) ? `${n} ✓` : n })),
        }
      : f
  );
}

/** «3 з 7» — how far through the list a person is */
export function progressText(done: number, total: number): string {
  return `${done} з ${total}`;
}
