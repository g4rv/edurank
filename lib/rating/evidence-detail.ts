import type { EvidenceField } from '@/lib/rating/evidence-fields';

/**
 * One submission's evidence, field by field, ready to render.
 *
 * The moderation table shows `summarizeEvidence` — every field flattened into
 * one string, capped at five parts and then truncated to a line. That is a
 * summary and it is the right thing for a list, but it makes the moderator's
 * actual job impossible: a DOI they cannot click, a bibliographic description
 * cut off mid-word, and anything past the fifth field simply absent.
 *
 * This keeps the fields apart, keeps every one of them, and works out what is
 * openable. Nothing is truncated here — the renderer decides how to show a long
 * value, not this.
 */

export interface EvidenceItem {
  name: string;
  label: string;
  kind: EvidenceField['kind'];
  /** Display text — an option's label rather than its value, a tick as «Так» */
  value: string;
  /** Set when the value can be opened: a url as-is, a DOI resolved through doi.org */
  href?: string;
  /** Long free text gets its own block rather than sitting on the label's line */
  multiline?: boolean;
}

/** A DOI is only useful to a moderator as something they can open */
export function doiUrl(doi: string): string {
  const trimmed = doi.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://doi.org/${trimmed.replace(/^doi:\s*/i, '')}`;
}

function externalUrl(value: string): string | undefined {
  const trimmed = value.trim();
  // Anything without a scheme is somebody's note, not an address — linking it
  // would produce a relative link back into the app.
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

export function evidenceItems(fields: readonly EvidenceField[], evidence: unknown): EvidenceItem[] {
  if (typeof evidence !== 'object' || evidence === null) return [];
  const e = evidence as Record<string, unknown>;
  const items: EvidenceItem[] = [];

  for (const f of fields) {
    const raw = e[f.name];

    // A false checkbox is an answer, but «ні» on every unticked box is noise on
    // an indicator with six of them. Empty values are dropped for the same
    // reason: the field set is the year's, and a submission rarely fills it all.
    if (raw === undefined || raw === null || raw === '' || raw === false) continue;

    const base = { name: f.name, label: f.label, kind: f.kind };

    switch (f.kind) {
      case 'select': {
        const option = f.options.find((o) => o.value === raw);
        items.push({ ...base, value: option?.label ?? String(raw) });
        break;
      }
      case 'checkbox':
        items.push({ ...base, label: f.group ?? f.label, value: f.label });
        break;
      case 'doi':
        items.push({ ...base, value: String(raw), href: doiUrl(String(raw)) });
        break;
      case 'url':
        items.push({ ...base, value: String(raw), href: externalUrl(String(raw)) });
        break;
      case 'text':
        items.push({
          ...base,
          value: String(raw),
          // A bibliographic description is the thing being checked; it needs the
          // width of the panel, not the half-line a label leaves it.
          multiline: f.multiline || String(raw).length > 60,
          href: externalUrl(String(raw)),
        });
        break;
      default:
        items.push({ ...base, value: String(raw) });
    }
  }

  return items;
}
