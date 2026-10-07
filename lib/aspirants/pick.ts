import type { EvidenceField } from '@/lib/rating/evidence-fields';
import { aspirantKey } from './source';

/**
 * A ПІБ chosen from a list (`pickFrom` on the first field of a joined group,
 * owner 2026-10-07) — the shape shared by the form, the query and the server
 * check, with no database in it so a client component can import it.
 */
export interface PersonOption {
  /** `aspirantKey` of the name — what the select's value is */
  key: string;
  lastName: string;
  firstName: string;
  middleName: string;
  /** «015 Професійна освіта · вступ 2023 · денна» — tells two namesakes apart */
  detail: string;
}

/** The joined name group a `pickFrom` field heads, in order: прізвище, ім'я, по батькові */
export function pickedGroup(
  fields: readonly EvidenceField[]
): { pickFrom: 'aspirants'; names: string[] } | null {
  const head = fields.find((f) => f.kind === 'text' && f.pickFrom);
  if (!head || head.kind !== 'text' || !head.pickFrom || !head.join) return null;
  const names = fields.filter((f) => f.kind === 'text' && f.join === head.join).map((f) => f.name);
  return { pickFrom: head.pickFrom, names };
}

/** The `aspirantKey` of the name the evidence holds in that group */
export function pickedKey(names: readonly string[], evidence: unknown): string {
  const e = (evidence && typeof evidence === 'object' ? evidence : {}) as Record<string, unknown>;
  const at = (i: number) => (typeof e[names[i]] === 'string' ? (e[names[i]] as string) : '');
  return aspirantKey({ lastName: at(0), firstName: at(1), middleName: at(2) });
}
