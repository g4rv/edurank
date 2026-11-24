import { disciplineKey, evidenceDisciplineKey } from './assigned';

/**
 * «Зарахувати» (owner, 2026-11-24): a moderator counts one of a person's entries
 * for a discipline they are missing, by giving the entry that discipline's name.
 * It exists because the departments' list holds shortened, misspelt or abbreviated
 * names, and the person's own entry — right in substance — matches none of them.
 *
 * What may be counted, decided here and nowhere else:
 */
export interface CountEntryCase {
  /** The assigned names of this person for the year, as stored */
  assigned: readonly { name: string; nameNormalised: string; accepted?: boolean }[];
  /** The assigned name the moderator picked */
  target: string;
  /** The evidence of the entry the moderator picked */
  entryEvidence: unknown;
  /** Evidence of the person's other counted entries under the same indicator */
  otherEvidence: readonly unknown[];
}

/** The assigned discipline a typed or picked name stands for, spelling aside */
export function assignedTarget<T extends { nameNormalised: string }>(
  assigned: readonly T[],
  name: string
): T | undefined {
  const key = disciplineKey(name);
  return assigned.find((a) => a.nameNormalised === key);
}

/** null when the entry may be counted for the target, otherwise the reason (Ukrainian) */
export function countEntryProblem(c: CountEntryCase): string | null {
  const target = assignedTarget(c.assigned, c.target);
  if (!target) return 'Такої дисципліни немає у списку цієї людини';

  // Already counted by a moderator: an entry on top of it would count nothing more
  if (target.accepted) return 'Цю дисципліну вже зараховано без запису';

  const own = evidenceDisciplineKey(c.entryEvidence);
  if (!own) return 'Запис не називає дисципліни';
  // Renaming an entry that already counts for an assigned discipline would take
  // that discipline away from it
  if (c.assigned.some((a) => a.nameNormalised === own)) {
    return 'Цей запис уже зараховано за іншою дисципліною зі списку';
  }
  // The discipline already has an entry: nothing to count, and the person's own
  // entry stays as it is
  if (c.otherEvidence.some((e) => evidenceDisciplineKey(e) === target.nameNormalised)) {
    return 'Для цієї дисципліни запис уже є';
  }
  return null;
}

/** The entry's evidence with the discipline set to the assigned name — nothing else changes */
export function withDiscipline(evidence: unknown, name: string): Record<string, unknown> {
  return { ...(evidence as Record<string, unknown>), discipline: name };
}
