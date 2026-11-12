/**
 * Which saved lines duplicate the rating (owner, 2026-11-12).
 *
 * A person added a publication to their Характеристика by hand and then entered
 * the same work in the rating. The document prints both, and a position that
 * counts to five counts the work twice. The rating entry is the one to keep: it
 * carries the verified, structured evidence; the typed line is the copy.
 *
 * Pure and free of the database, so the rule is tested without a screen. It
 * judges TEXT only — never a score, never an id — and the page puts both texts
 * side by side so the admin sees what was matched.
 *
 * **A DOI alone is not proof.** Somebody pastes the DOI of their first article
 * into the entry of their second (production had exactly that, and the DOI rule
 * in the rating refuses it for the same reason). Two descriptions that share a
 * DOI but are plainly about different works are NOT a copy: hiding one would
 * take a real publication out of the document.
 */

const DOI = /10\.\d{4,9}\/[^\s"'<>,;]+/i;
const DOI_OR_LINK = /https?:\/\/\S+|10\.\d{4,9}\/[^\s"'<>,;]+/gi;

/** A DOI the way two sources spell it differently: lower case, no trailing full stop or bracket */
export function extractDoi(text: string): string | null {
  const found = DOI.exec(text);
  if (!found) return null;
  return found[0].toLowerCase().replace(/[.)\]]+$/, '');
}

/**
 * A description reduced to letters and digits only, lower case. A list number
 * («48.»), a kind («монографія ·»), brackets and spacing are all gone, so two
 * spellings of one reference meet.
 */
export function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-zа-яіїєґ0-9]/g, '');
}

/** Where, and how much, of one description is looked for in the other */
const SKIP = 30;
const CHUNK = 45;
/** Shorter than this and a chunk proves nothing — a title of a few words matches by chance */
const MIN_LENGTH = 80;

/**
 * What the two descriptions say apart from their links: a stretch from the
 * middle of the shorter one, found (or not) inside the longer one. `null` when
 * either is too short to say anything — a bare DOI has no title to compare.
 *
 * The stretch is taken from the middle on purpose — the start is where a
 * description differs most («48.», «монографія ·», «співавторство.»).
 */
function textAgrees(a: string, b: string): boolean | null {
  const plainA = a.replace(DOI_OR_LINK, ' ');
  const plainB = b.replace(DOI_OR_LINK, ' ');
  const sa = squash(plainA);
  const sb = squash(plainB);
  if (sa.length < MIN_LENGTH || sb.length < MIN_LENGTH) return null;
  // The shorter one supplies the stretch, so the check reads the same either way round
  const [short, long] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
  if (!long.includes(short.slice(SKIP, SKIP + CHUNK))) return false;
  // One stretch is not enough: two articles by the same authors often share a
  // phrase of their titles («…національно-патріотичного виховання дітей та молоді»).
  // The same work shares most of its words.
  return sharedWords(plainA, plainB) >= MIN_SHARED;
}

/** The share of words two descriptions have in common, counted against the shorter one */
const MIN_SHARED = 0.6;

function sharedWords(a: string, b: string): number {
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-zа-яіїєґ0-9]+/)
        .filter((w) => w.length > 2)
    );
  const wa = words(a);
  const wb = words(b);
  const smaller = Math.min(wa.size, wb.size);
  if (smaller === 0) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / smaller;
}

/**
 * The two texts describe the same publication.
 *
 * **The description decides** (owner, 2026-11-12: «description matters more than
 * DOI»). When both sides carry a full description, they are a copy exactly when
 * the same stretch of it is found in both — whatever their DOIs say. A DOI is
 * typed by hand and is often wrong: a digit off in the pages, another prefix, or
 * the DOI of the person's OTHER article pasted in. Production had pairs with an
 * identical description and different DOIs, and pairs with different
 * descriptions and one shared DOI; only the description told them apart.
 *
 * **The DOI decides only when there is no description to compare** — one side
 * is a bare DOI or a link. Then two equal DOIs are a copy and two different
 * ones are not.
 *
 * **A conference (п.12) is the exception** (byText: false): its descriptions
 * all begin with the same few words, so the text alone would pair unrelated
 * lines. It needs the same DOI AND a description that does not contradict.
 */
export function isSamePublication(
  a: string,
  b: string,
  options: { byText: boolean } = { byText: true }
): boolean {
  const doiA = extractDoi(a);
  const doiB = extractDoi(b);
  const sameDoi = doiA !== null && doiB !== null && doiA === doiB;
  const agrees = textAgrees(a, b);

  if (!options.byText) return sameDoi && agrees !== false;
  if (agrees !== null) return agrees;
  return sameDoi;
}

/** The conference position — matched on DOI alone */
export const DOI_ONLY_POSITION = 12;
