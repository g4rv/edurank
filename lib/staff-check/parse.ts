/**
 * Reading the university's own staff list and the science-deputies table
 * (owner, 2026-10-28) — the two documents `pnpm db:check-staff-list` holds the
 * database against. Pure: the script reads the files and hands the cells in.
 *
 * `staff.xlsx` takes TWO rows per placement and was typed by hand, so it has
 * shapes a plain reader trips over — each handled below, each seen in the file:
 *
 * - row 1: surname, кафедра, штатний/сумісник, ставка, посада, звання, ступінь
 *   (first words), стаж; row 2: ім'я та по батькові, the кафедра's wrapped
 *   end, the ступінь's wrapped end («філософських наук»);
 * - the кафедра is written once per block and carries on to the next people;
 * - rows 47 and 91: the kind and the rest sit on the NAMES row instead;
 * - a long ступінь wraps to a THIRD row («…фізичного виховання і» / «спорту»);
 * - a ступінь cut mid-word across rows («кандидат наук з дер» + «жавного
 *   управління») — so the degree is matched on letters, not words.
 */

export interface SheetPlacement {
  /** The spreadsheet row the placement starts on, for the report */
  row: number;
  lastName: string;
  /** «Ім'я По-батькові», null when the sheet left it out */
  names: string | null;
  department: string;
  /** штатний = the main кафедра; сумісник = an additional one */
  kind: 'штатний' | 'сумісник';
  /** In ставки, as written: 1, 0.75 … */
  rate: number | null;
  position: string | null;
  title: string | null;
  degreeLevel: string | null;
  degreeField: string | null;
  experience: number | null;
}

type Cells = readonly (string | null)[];

const clean = (s: string | null | undefined): string | null =>
  s == null ? null : s.replace(/\s+/g, ' ').trim() || null;
const num = (s: string | null): number | null => {
  if (s == null) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const kindOf = (s: string | null): SheetPlacement['kind'] | null => {
  const k = clean(s)?.toLowerCase();
  return k === 'штатний' || k === 'сумісник' ? k : null;
};

/**
 * The placements of `staff.xlsx`. `rows` are the data rows after the header,
 * each the 8 columns A–H as text (null for an empty cell), with its sheet row
 * number.
 */
export function parseStaffSheet(rows: readonly { row: number; cells: Cells }[]): SheetPlacement[] {
  const out: SheetPlacement[] = [];
  let department: string | null = null;

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i].cells.map(clean);
    if (c.every((v) => v == null)) continue;

    // A third row that only carries on the ступінь («спорту»)
    if (c[0] == null && c[2] == null && c[6] != null) {
      const last = out.at(-1);
      if (last) last.degreeField = clean(`${last.degreeField ?? ''} ${c[6]}`);
      continue;
    }

    const next = (rows[i + 1]?.cells ?? []).map(clean);
    let first = c;
    let names: string | null = null;
    let field: string | null = null;
    let consumed = false;

    if (kindOf(c[2]) == null && kindOf(next[2]) != null) {
      // The kind sits on the NAMES row: surname from this one, the rest from that
      first = next.map((v, k) => (k === 0 ? c[0] : (c[k] ?? v)));
      names = next[0] ?? null;
      field = next[6] ?? null;
      consumed = true;
    } else if (kindOf(c[2]) != null && kindOf(next[2]) == null && next[0] != null) {
      names = next[0];
      field = next[6] ?? null;
      consumed = true;
      // The кафедра's name wrapped onto the second row
      if (c[1] != null && next[1] != null) first = [c[0], `${c[1]} ${next[1]}`, ...c.slice(2)];
    }

    const kind = kindOf(first[2]);
    if (!kind || !first[0]) {
      if (consumed) i++;
      continue;
    }
    if (first[1] != null) department = first[1];
    if (!department) {
      if (consumed) i++;
      continue;
    }

    out.push({
      row: rows[i].row,
      lastName: first[0],
      names,
      department,
      kind,
      rate: num(first[3]),
      position: first[4]?.toLowerCase() ?? null,
      title: first[5]?.toLowerCase() ?? null,
      degreeLevel: first[6],
      degreeField: field,
      experience: num(first[7]),
    });
    if (consumed) i++;
  }
  return out;
}

export interface DeputyUnit {
  /** The кафедра or факультет as the document writes it */
  unit: string;
  faculty: boolean;
  /** Every person named for it, in order */
  people: string[];
}

/**
 * The deputies table, from the document's text — `antiword` prints a Word table
 * as `|cell|cell|cell|` lines. Column 1 the unit, 2 the person, 3 the phone. A
 * unit's name may wrap onto the next line (the person cell then empty); a
 * second or third person sits on a line with no unit.
 */
export function parseDeputies(text: string): DeputyUnit[] {
  const units: DeputyUnit[] = [];
  let current: DeputyUnit | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const [unit, person] = line
      .split('|')
      .slice(1, 4)
      .map((s) => clean(s));
    if (unit) {
      if (current && !person && current.people.length > 0 && !/^Факультет/i.test(unit)) {
        // The unit's name carries on («…інформаційної» / «діяльності»)
        current.unit = `${current.unit} ${unit}`;
        continue;
      }
      current = { unit, faculty: /^Факультет/i.test(unit), people: [] };
      units.push(current);
    }
    if (person && current) current.people.push(person);
  }
  return units;
}
