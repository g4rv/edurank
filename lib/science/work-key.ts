import { normalizeDoi } from '@/lib/doi';
import { normalizeIsbn } from '@/lib/isbn';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import type { ScienceReuse, ScienceSharing } from '@/lib/generated/prisma/client';

/**
 * The normalised identity of ONE work — the string two unique indexes carry the
 * whole reuse rule on. See «Reuse — the rule is the index, not a check» in
 * `docs/superpowers/specs/2026-09-15-science-plan-design.md`.
 *
 * Nothing at runtime checks whether a work was already recorded.
 * `ScienceWork.dedupKey @unique` and `@@unique([staffId, workId])` on
 * `ScienceRecord` are the rule, and this function is what feeds them — which
 * is why a bug here is not a wrong message, it is a rule that silently stops
 * applying.
 *
 * Normalisation stays CONSERVATIVE: lowercase, collapse whitespace, trim,
 * strip trailing punctuation. Not transliteration, not stemming, not
 * punctuation inside the string. A false collision refuses work somebody
 * really did, which is a worse failure than a duplicate somebody can report —
 * the duplicate has a person and a screen to report it from, the refusal has
 * neither.
 */

function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    // No query, no fragment, no trailing slash: the same journal page reached
    // from a mail link with `?utm=` and from the browser bar is one work.
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.host.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    // Not a URL at all — fall through to the text rule rather than refusing.
    // Somebody typing a journal's name into a «Посилання» box has still
    // identified their work, and the next person typing the same name should
    // still collide with them.
    return null;
  }
}

function normalizeText(raw: string): string | null {
  const value = raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:!?]+$/, '')
    .trim();
  return value || null;
}

function valueFor(field: EvidenceField, raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  switch (field.kind) {
    case 'doi': {
      // `normalizeDoi` preserves case on purpose — publishers print DOIs mixed
      // and the stored value should match the paper. A KEY is a different job:
      // DOIs compare case-insensitively, so two authors typing the same DOI in
      // different case must land on one work.
      const doi = normalizeDoi(raw);
      return doi ? `doi:${doi.toLowerCase()}` : null;
    }
    case 'isbn': {
      const isbn = normalizeIsbn(raw);
      return isbn ? `isbn:${isbn}` : null;
    }
    case 'url': {
      const url = normalizeUrl(raw);
      return url ? `url:${url}` : normalizeTextKey(raw);
    }
    default:
      return normalizeTextKey(raw);
  }
}

function normalizeTextKey(raw: string): string | null {
  const text = normalizeText(raw);
  return text ? `t:${text}` : null;
}

export function workKey(input: {
  identityFields: readonly string[];
  evidenceFields: readonly EvidenceField[];
  reuse: ScienceReuse;
  sharing: ScienceSharing;
  evidence: Record<string, unknown>;
  academicYear: string;
  staffId: string;
}): string | null {
  let core: string | null = null;
  for (const name of input.identityFields) {
    const field = input.evidenceFields.find((f) => f.name === name);
    // An `identityFields` entry naming a field the type does not declare is a
    // catalogue mistake an ADMIN can make on /admin/science-plan/[id]. Skip it
    // rather than throw: the next name in the list is usually `title`, and a
    // typo in the catalogue must not stop somebody recording their work.
    if (!field) continue;
    core = valueFor(field, input.evidence[name]);
    if (core) break;
  }
  if (!core) return null;

  // The year goes INSIDE the key for a YEARLY type, which is what lets the same
  // аспірант be supervised again next year — the наказ grants that explicitly
  // («Щороку на одного аспіранта») — while the same стаття never repeats.
  const withYear = input.reuse === 'YEARLY' ? `${core}@${input.academicYear}` : core;

  // D24: an INDIVIDUAL type's identity is often a name several people
  // legitimately share — a journal's редколегія is four people, one
  // конференція is twenty. Prefixing with the person gives each their own key
  // space, while `@@unique([staffId, workId])` still stops them claiming it
  // twice inside it.
  return input.sharing === 'INDIVIDUAL' ? `s_${input.staffId}:${withYear}` : withYear;
}
