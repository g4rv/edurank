/**
 * ORCID — stored as the bare identifier, shown as a link.
 *
 * `Staff.orcidId` holds what a person typed and nothing more: the column is a
 * free `String?` and always has been. The profile URL is therefore never
 * stored — it is built from the identifier at render time, so the two can never
 * disagree and nobody has to keep a link and an id in step by hand.
 *
 * People paste all of it: the bare id, the id with no hyphens, the whole
 * `https://orcid.org/…` address, sometimes with a trailing slash. All of those
 * mean the same person, so they are normalised to one shape here rather than in
 * three components.
 *
 * A value that is not an ORCID at all comes back `null`, and the caller shows
 * the raw text with no link. Guessing a URL from something unrecognised would
 * send an editor to a 404 page that looks like the person's own.
 */

const ORCID_HOST = 'orcid.org';

/**
 * Sixteen characters in four groups. The last one is a checksum digit that may
 * be `X`, which is why this is not `\d{16}` — an ORCID ending in X is ordinary
 * and a digits-only test rejects one person in ten.
 */
const ORCID_RE = /^(\d{4})-?(\d{4})-?(\d{4})-?(\d{3}[\dX])$/i;

/**
 * The identifier in its canonical `0000-0002-1825-0097` form, or null if the
 * value is not an ORCID.
 */
export function normaliseOrcid(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let value = raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '');
  if (value.toLowerCase().startsWith(ORCID_HOST + '/')) {
    value = value.slice(ORCID_HOST.length + 1);
  }
  value = value.replace(/\/+$/, '');

  const match = ORCID_RE.exec(value);
  if (!match) return null;

  return `${match[1]}-${match[2]}-${match[3]}-${match[4].toUpperCase()}`;
}

/** The public profile page for that identifier, or null when it is not an ORCID. */
export function orcidUrl(raw: string | null | undefined): string | null {
  const id = normaliseOrcid(raw);
  return id === null ? null : `https://${ORCID_HOST}/${id}`;
}
