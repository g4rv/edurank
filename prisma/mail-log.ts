import { readFileSync } from 'fs';

// Reading a mail server's own log of what it delivered.
//
// The app never learns which of its sends succeeded, so a repair like
// `fix-invite-tokens.ts` has to be told from outside. Mailjet exports two
// different files and both land here:
//
//   message events      Email,status,blocked,soft_bounce,hard_bounce,…
//                       one row per message, `status` carries the outcome and
//                       the flags are the words TRUE / FALSE
//   contact statistics  email,sent,hard_bounce,soft_bounce,blocked,spam
//                       one row per contact, every column a count
//
// Anything else — a column pasted into a text file, a plain list — falls back
// to «every address on every line».

/** Columns whose value means the message did NOT reach the person. */
const FAILURE_COLUMNS = ['hard_bounce', 'soft_bounce', 'blocked', 'spam'];

/** Statuses that mean it arrived. `queued` and `deferred` deliberately do not. */
const REACHED_STATUSES = new Set(['sent', 'delivered', 'opened', 'clicked']);

/** A status naming one of the ways a message fails. */
const FAILED_STATUS = /bounce|blocked|spam/;

/**
 * One CSV line into cells, honouring quotes.
 *
 * A naive `split(',')` is fine until a subject line contains a comma, and then
 * every column after it shifts by one — silently, which is the worst way for a
 * delivery list to be wrong.
 */
function cells(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (c === ',' && !quoted) {
      out.push(cell.trim());
      cell = '';
    } else {
      cell += c;
    }
  }
  out.push(cell.trim());
  return out;
}

/** `TRUE` in an events export, a count above zero in a statistics one. */
function positive(cell: string | undefined): boolean {
  const value = (cell ?? '').trim().toLowerCase();
  return value === 'true' || Number(value) > 0;
}

/**
 * The addresses a letter actually reached, lower-cased.
 *
 * Being IN the file is not the question. An export lists what happened, and
 * some of what happened is a bounce — or a contact nothing was ever sent to.
 * So the outcome columns are read whenever the header offers them.
 *
 * An address that failed ANYWHERE in the file is not delivered, even if
 * another row for it succeeded. That person gets a second letter they may not
 * need, which is the harmless direction — the other way round leaves somebody
 * nobody can see was missed.
 */
export function parseDelivered(text: string): Set<string> {
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== '');

  // Case-insensitive: the events export writes `Email`, the statistics one `email`.
  const header = cells(lines[0] ?? '').map((c) => c.toLowerCase());
  const emailAt = header.indexOf('email');
  if (emailAt === -1) {
    const found = clean.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
    return new Set(found.map((a) => a.toLowerCase()));
  }

  const statusAt = header.indexOf('status');
  const sentAt = header.indexOf('sent');
  const failureAt = FAILURE_COLUMNS.map((c) => header.indexOf(c)).filter((i) => i !== -1);

  const reached = new Set<string>();
  const failed = new Set<string>();

  for (const line of lines.slice(1)) {
    const row = cells(line);
    const email = (row[emailAt] ?? '').toLowerCase();
    if (!email) continue;

    const status = statusAt === -1 ? '' : (row[statusAt] ?? '').toLowerCase();
    if (failureAt.some((i) => positive(row[i])) || FAILED_STATUS.test(status)) {
      failed.add(email);
      continue;
    }

    // A statistics row proves delivery by its count; an events row by its status.
    if (sentAt === -1 ? REACHED_STATUSES.has(status) : positive(row[sentAt])) reached.add(email);
  }

  for (const address of failed) reached.delete(address);
  return reached;
}

/** {@link parseDelivered} over a file on disk. */
export function readDelivered(path: string): Set<string> {
  return parseDelivered(readFileSync(path, 'utf8'));
}
