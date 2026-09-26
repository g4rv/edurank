import { cn } from '@/lib/utils';

/**
 * A piece of evidence, printed so it cannot widen its column.
 *
 * The п.38 document's evidence is typed prose with URLs dropped into it, and a
 * URL is one unbreakable word — a Google Analytics link on п.20 measured 214
 * characters. `table-fixed` gives the cell 42% of the table and no more, so
 * that one word pushed the body wider than the head and the whole document
 * gained a horizontal scrollbar, with the columns no longer over their own
 * headings (owner, 2026-09-21).
 *
 * Two rules, and the first is the one that matters:
 *
 * 1. **No token prints longer than `MAX_TOKEN`.** Anything longer is cut and
 *    ends in «…», so the column's width is decided by the layout rather than by
 *    whatever somebody pasted. `break-words` underneath is the safety net for a
 *    narrow screen, where even 56 characters may not fit.
 * 2. **A URL is a link.** They were plain text, so the one thing in the cell
 *    somebody actually wants to act on — «is this conference real» — had to be
 *    selected and pasted by hand, and a cut URL could not even be copied. The
 *    `href` carries the whole address; only the printed form is short.
 *
 * `--brand` and underlined, per §2 of `docs/aurora.md`: blue means the link
 * leaves EduRank.
 */
const MAX_TOKEN = 56;

/** A bare http(s) address. Trailing punctuation is stripped below, not here. */
const URL_PATTERN = /https?:\/\/\S+/g;

/** Punctuation that ends the sentence rather than the address. */
const TRAILING = [')', ']', '.', ',', ';', ':', '!', '?', '»', '"', "'"];

/**
 * Drop the sentence's punctuation from the end of an address.
 *
 * «…конференції https://example.com/page.» — the full stop is the sentence's,
 * and a link that carries it 404s. One character at a time, because a URL can
 * pick up two («(див. …)»).
 *
 * **A run of dots stays.** The Google Analytics link on п.20 genuinely ends
 * «..» — base64 padding — so only a LONE dot is read as punctuation. Guessing
 * the other way broke a real address that is in the data today.
 */
function trimSentence(url: string): string {
  let end = url.length;
  while (end > 0 && TRAILING.includes(url[end - 1])) {
    const last = url[end - 1];
    if (last === '.' && url[end - 2] === '.') break;
    // A закривна дужка is the sentence's only if the address has not opened
    // one itself. DOIs do: «doi.org/10.52058/2786-4952-2025-1(47)-1356-1373»
    // is in this person's document today, and cutting its bracket 404s.
    if ((last === ')' || last === ']') && !isUnclosed(url.slice(0, end), last)) break;
    end--;
  }
  return url.slice(0, end);
}

/** True when the closing bracket at the end has no opener inside the address. */
function isUnclosed(url: string, closing: string): boolean {
  const opening = closing === ')' ? '(' : '[';
  const opens = url.split(opening).length;
  const closes = url.split(closing).length;
  return closes > opens;
}

export interface EvidencePart {
  text: string;
  /** The whole address when this part is a link; null for prose. */
  href: string | null;
}

/**
 * Split typed evidence into prose and links.
 *
 * Exported for its tests: the interesting cases are all in here rather than in
 * the markup — a URL that ends a sentence, one wrapped in brackets, and the
 * summaries that carry three of them in a row.
 */
export function splitEvidence(text: string): EvidencePart[] {
  const parts: EvidencePart[] = [];
  let at = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    const url = trimSentence(match[0]);
    if (start > at) parts.push({ text: text.slice(at, start), href: null });
    parts.push({ text: url, href: url });
    at = start + url.length;
  }

  if (at < text.length) parts.push({ text: text.slice(at), href: null });
  return parts;
}

/** `token` cut to `MAX_TOKEN`, ending in «…» when anything was dropped. */
export function shortenToken(token: string): string {
  if (token.length <= MAX_TOKEN) return token;
  return `${token.slice(0, MAX_TOKEN - 1)}…`;
}

/**
 * Prose with its own long words cut.
 *
 * Not only URLs: a DOI, a ЄДРПОУ-style code or a pasted reference number is
 * just as unbreakable, and the column has to hold whatever was typed into it.
 */
export function shortenWords(text: string): string {
  return text.replace(/\S+/g, shortenToken);
}

export function EvidenceText({ text, className }: { text: string; className?: string }) {
  return (
    // `break-words` as well as the cut: on a phone the column is narrower than
    // 56 characters, and a token that still does not fit has to wrap rather
    // than push the table wider.
    <span className={cn('break-words whitespace-pre-line', className)}>
      {splitEvidence(text).map((part, i) =>
        part.href ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            // The whole address, for the reader who wants to see where it goes
            // before following it — the printed form is cut.
            title={part.href}
            className="text-brand underline decoration-brand/30 underline-offset-4 transition-colors hover:decoration-brand"
          >
            {shortenToken(part.text)}
          </a>
        ) : (
          <span key={i}>{shortenWords(part.text)}</span>
        )
      )}
    </span>
  );
}
