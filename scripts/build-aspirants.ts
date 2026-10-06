import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import type { SourceAspirant } from '../lib/aspirants/source';

// Builds lib/aspirants/aspirants.json from the аспірантура's list (owner,
// 2026-10-07).
//
//   pnpm aspirants:build                       — the default file below
//   pnpm aspirants:build "<path to the .docx>" — a newer list
//
// Runs HERE, where edu-reference/ is; the JSON goes into git and
// `pnpm db:import-aspirants` loads it on the server — the same split the
// students list uses, for the same reason: production has no edu-reference/.
//
// The docx is a Word table: Спеціальність · Кафедра · № · ПІБ · Дата
// народження · Рік вступу · Форма навчання · Науковий керівник. The first two
// are written once per group and left blank under it, so they are filled
// down. **The birth date is not kept** — nothing needs it, and birth dates were
// stripped out of student names once already (`db:clean-student-names`).

const DEFAULT = 'edu-reference/ВІДОМОСТІ аспіранти 01.10.2026.docx';

function cellText(cellXml: string): string {
  const paragraphs = cellXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  return paragraphs
    .map((p) =>
      p
        .replace(/<[^>]+>/g, '')
        .replace(/ /g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join(' / ');
}

async function main() {
  const file = resolve(process.argv[2] ?? DEFAULT);
  const zip = await JSZip.loadAsync(readFileSync(file));
  const xml = await zip.file('word/document.xml')!.async('string');
  const rows = xml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? [];

  const out: SourceAspirant[] = [];
  let speciality = '';
  let department = '';
  const skipped: string[] = [];

  for (const row of rows) {
    const cells = (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map(cellText);
    if (cells.length < 8) continue;
    const [spec, dept, , name, , year, form, supervisors] = cells;
    if (spec === 'Спеціальність') continue; // the header row
    if (spec) speciality = spec;
    if (dept) department = dept;

    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      if (name) skipped.push(name);
      continue;
    }
    out.push({
      lastName: parts[0],
      firstName: parts[1],
      middleName: parts.slice(2).join(' '),
      speciality,
      departmentText: department,
      admissionYear: /^\d{4}$/.test(year) ? Number(year) : null,
      studyForm: form,
      supervisorsRaw: supervisors,
    });
  }

  const target = resolve('lib/aspirants/aspirants.json');
  writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
  console.log(`${file}\n→ ${target}: ${out.length} аспірантів`);
  if (skipped.length) console.log(`пропущено (не ПІБ): ${skipped.join('; ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
