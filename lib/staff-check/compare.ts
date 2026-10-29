import type { AcademicTitle, StaffPosition } from '@/lib/generated/prisma/client';
import type { DeputyUnit, SheetPlacement } from '@/lib/staff-check/parse';
import {
  degreeFromList,
  letters,
  matchDepartment,
  matchPeople,
  POSITION_FROM_LIST,
  TITLE_FROM_LIST,
} from '@/lib/staff-check/match';
import { CANDIDATE_DEGREES, DOCTOR_DEGREES } from '@/lib/staff/academic-options';

/**
 * The staff list held against the database (owner, 2026-10-28). Nothing here
 * writes. Two categories carry a `fix` that the script's `--apply` writes —
 * the стаж and a degree's missing галузь, where the owner trusts HR's list.
 * The ставки carry a `rate` that `pnpm db:staff-list-rates` writes (owner,
 * 2026-10-29). Everything else (посади, звання, accounts) stays a report: the
 * list is not trusted blindly, and a person decides those.
 *
 * Read the categories before acting on them; several are not errors:
 * - the list writes internal сумісництво as two placements on ONE кафедра
 *   (штатний + сумісник): the main place of work plus a part-time ставка, and
 *   the person's ставка there is their SUM (owner, 2026-10-29). The app holds
 *   one placement with one ставка, so the sum is what is compared;
 * - the system's ставка is the завідувач's split for the year, the list's is
 *   HR's;
 * - the list is a year newer than many stored стажі (+1 is the commonest gap).
 */

export interface CheckDepartment {
  id: string;
  name: string;
  headId: string | null;
  scienceDeputyId: string | null;
}

export interface CheckStaff {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string | null;
  isNpp: boolean;
  archived: boolean;
  departmentId: string | null;
  partTimeDepartmentIds: readonly string[];
  position: StaffPosition | null;
  academicTitle: AcademicTitle | null;
  pedagogicalExperience: number | null;
  /** Every degree key the person holds — diplomas and the mirror columns */
  degreeKeys: readonly string[];
}

export type FindingCategory =
  | 'unknownDepartment'
  | 'notInSystem'
  | 'nameNoPatronymic'
  | 'nameTypo'
  | 'severalAccounts'
  | 'archived'
  | 'notNpp'
  | 'otherMainDepartment'
  | 'partTimeMissing'
  | 'internalPartTime'
  | 'partTimeOnlyButMainHere'
  | 'rateMissing'
  | 'rateDiffers'
  | 'headNotSet'
  | 'positionDiffers'
  | 'titleDiffers'
  | 'degreeUnspecified'
  | 'degreeDiffers'
  | 'degreeOnlyInSystem'
  | 'experienceOneYear'
  | 'experienceDiffers'
  | 'onlyInSystem'
  | 'deputyToSet'
  | 'deputyDiffers'
  | 'deputySeveral'
  | 'deputyFaculty';

export interface Finding {
  category: FindingCategory;
  /** Who — the list's spelling, or the system's for `onlyInSystem` */
  person: string | null;
  department: string | null;
  /** The list's spreadsheet row, when it comes from the list */
  row: number | null;
  list: string | null;
  system: string | null;
  staffId: string | null;
  /**
   * What `--apply` would write — set only on the two categories the owner
   * trusts the HR list for (2026-10-28): the стаж, and the галузь of a degree
   * stored as the bare level («Кандидат наук» → «Кандидат педагогічних наук»).
   */
  fix?: StaffFix;
  /**
   * On `rateMissing` / `rateDiffers` only: the list's ставка for this кафедра —
   * the SUM of its lines, since a штатний + сумісник pair on one кафедра is one
   * ставка (owner, 2026-10-29). `pnpm db:staff-list-rates` writes it.
   */
  rate?: { departmentId: string; hundredths: number; held: number | null };
}

export type StaffFix =
  | { field: 'pedagogicalExperience'; value: number }
  | { field: 'degree'; from: string; to: string };

/** Every degree the profile's own lists offer — the only keys `--apply` may write */
const OFFERED_DEGREES = new Set([...CANDIDATE_DEGREES, ...DOCTOR_DEGREES].map((d) => d.value));

const UNSPECIFIED: Record<string, string> = {
  cand: 'candidate_unspecified',
  doc: 'doctor_unspecified',
};

const hundredths = (rate: number) => Math.round(rate * 100);
const rateText = (h: number) => (h / 100).toFixed(2).replace('.', ',');
const fio = (s: CheckStaff) => `${s.lastName} ${s.firstName} ${s.patronymic ?? ''}`.trim();
const deptLabel = (name: string) => name.replace(/^Кафедра\s+/i, '');

export function compareStaffList(input: {
  placements: readonly SheetPlacement[];
  deputies: readonly DeputyUnit[];
  departments: readonly CheckDepartment[];
  staff: readonly CheckStaff[];
  /** `${staffId}|${departmentId}` → hundredths, the year's split */
  allocations: ReadonlyMap<string, number>;
}): Finding[] {
  const { placements, deputies, departments, staff, allocations } = input;
  const out: Finding[] = [];
  const add = (f: Omit<Finding, 'list' | 'system' | 'staffId' | 'row'> & Partial<Finding>) =>
    out.push({ list: null, system: null, staffId: null, row: null, ...f });
  const byId = new Map(staff.map((s) => [s.id, s]));
  const deptName = (id: string | null) =>
    id ? deptLabel(departments.find((d) => d.id === id)?.name ?? '—') : '—';

  // Placements resolved to a кафедра and a person, once — the ставка and the
  // shape checks look across them.
  const resolved = placements.map((p) => {
    const department = matchDepartment(p.department, departments);
    const match = department ? matchPeople(p.lastName, p.names, staff) : null;
    // Of several accounts with one ПІБ, the one placed on this кафедра
    const person = match
      ? (match.people.find(
          (s) =>
            s.departmentId === department!.id || s.partTimeDepartmentIds.includes(department!.id)
        ) ?? match.people[0])
      : null;
    return { p, department, match, person };
  });

  const unknownDepartments = new Set<string>();
  const seen = new Set<string>();
  const rateChecked = new Set<string>();

  for (const { p, department, match, person } of resolved) {
    const who = `${p.lastName} ${p.names ?? ''}`.trim();
    if (!department) {
      unknownDepartments.add(p.department);
      continue;
    }
    const base = { person: who, department: deptLabel(department.name), row: p.row };
    if (!match || !person) {
      add({ ...base, category: 'notInSystem' });
      continue;
    }
    seen.add(person.id);
    const ref = { ...base, staffId: person.id };
    if (match.how === 'noPatronymic')
      add({ ...ref, category: 'nameNoPatronymic', system: fio(person) });
    if (match.how === 'typo') add({ ...ref, category: 'nameTypo', system: fio(person) });
    if (match.people.length > 1)
      add({ ...ref, category: 'severalAccounts', system: String(match.people.length) });
    if (person.archived) add({ ...ref, category: 'archived' });
    if (!person.isNpp) add({ ...ref, category: 'notNpp' });

    const main = p.kind === 'штатний';
    if (main && person.departmentId !== department.id) {
      add({ ...ref, category: 'otherMainDepartment', system: deptName(person.departmentId) });
    }
    if (
      !main &&
      person.departmentId !== department.id &&
      !person.partTimeDepartmentIds.includes(department.id)
    ) {
      add({ ...ref, category: 'partTimeMissing' });
    }
    if (!main && person.departmentId === department.id) {
      const sameName = (q: SheetPlacement) =>
        letters(`${q.lastName}${q.names ?? ''}`) === letters(`${p.lastName}${p.names ?? ''}`);
      const mainHere = placements.some(
        (q) =>
          sameName(q) &&
          q.kind === 'штатний' &&
          matchDepartment(q.department, departments)?.id === department.id
      );
      add({ ...ref, category: mainHere ? 'internalPartTime' : 'partTimeOnlyButMainHere' });
    }

    // The ставка: once per person and кафедра, the SUM of the list's placements
    const pair = `${person.id}|${department.id}`;
    if (!rateChecked.has(pair)) {
      rateChecked.add(pair);
      const listed = resolved
        .filter(
          (r) =>
            r.person?.id === person.id && r.department?.id === department.id && r.p.rate != null
        )
        .reduce((sum, r) => sum + hundredths(r.p.rate!), 0);
      const held = allocations.get(pair);
      const rate = { departmentId: department.id, hundredths: listed, held: held ?? null };
      if (listed && held == null)
        add({ ...ref, category: 'rateMissing', list: rateText(listed), rate });
      else if (listed && held !== listed)
        add({
          ...ref,
          category: 'rateDiffers',
          list: rateText(listed),
          system: rateText(held!),
          rate,
        });
    }

    if (p.position === 'завідувач') {
      if (department.headId !== person.id) {
        const head = department.headId ? byId.get(department.headId) : null;
        add({ ...ref, category: 'headNotSet', system: head ? fio(head) : null });
      }
    }

    // What a person IS, from their main placement only — a сумісник row
    // repeats it, and comparing twice would report it twice.
    if (!main) continue;
    const position = p.position ? POSITION_FROM_LIST[p.position] : undefined;
    if (position && person.position !== position)
      add({ ...ref, category: 'positionDiffers', list: p.position, system: person.position });
    const title = p.title ? (TITLE_FROM_LIST[p.title] ?? null) : null;
    if ((title ?? null) !== (person.academicTitle ?? null))
      add({ ...ref, category: 'titleDiffers', list: p.title, system: person.academicTitle });

    const degree = degreeFromList(p.degreeLevel, p.degreeField);
    const held = person.degreeKeys.filter((k) => k !== 'basic_education');
    const listText = [p.degreeLevel, p.degreeField].filter(Boolean).join(' ');
    if (degree) {
      const [level] = degree.split('_');
      const known = !degree.endsWith('_?');
      const has = known
        ? held.includes(degree)
        : held.some((k) => k.startsWith(`${level}_`) || (level === 'cand' && k === 'phd'));
      if (!has) {
        // The level is right and only the branch is missing: the list can fill it —
        // but only ever with a degree OUR list offers, never HR's own wording
        const unspecified =
          known && held.includes(UNSPECIFIED[level] ?? '') && OFFERED_DEGREES.has(degree);
        add({
          ...ref,
          category: unspecified ? 'degreeUnspecified' : 'degreeDiffers',
          list: `${listText} (${degree})`,
          system: held.join(', ') || null,
          ...(unspecified && { fix: { field: 'degree', from: UNSPECIFIED[level], to: degree } }),
        });
      }
    } else if (held.length) {
      add({ ...ref, category: 'degreeOnlyInSystem', system: held.join(', ') });
    }

    if (p.experience != null && person.pedagogicalExperience !== p.experience) {
      const oneYear =
        person.pedagogicalExperience != null && p.experience - person.pedagogicalExperience === 1;
      add({
        ...ref,
        category: oneYear ? 'experienceOneYear' : 'experienceDiffers',
        list: String(p.experience),
        system: person.pedagogicalExperience == null ? null : String(person.pedagogicalExperience),
        fix: { field: 'pedagogicalExperience', value: p.experience },
      });
    }
  }

  for (const name of unknownDepartments)
    add({ category: 'unknownDepartment', person: null, department: name });

  // An active НПП on a кафедра the list covers, but not on the list
  const covered = new Set(resolved.map((r) => r.department?.id).filter((id): id is string => !!id));
  for (const s of staff) {
    if (s.archived || !s.isNpp || seen.has(s.id) || !s.departmentId || !covered.has(s.departmentId))
      continue;
    add({
      category: 'onlyInSystem',
      person: fio(s),
      department: deptName(s.departmentId),
      staffId: s.id,
    });
  }

  // Science deputies — one per кафедра in the app (several: the owner assigns)
  for (const unit of deputies) {
    if (unit.faculty) {
      add({ category: 'deputyFaculty', person: unit.people.join(', '), department: unit.unit });
      continue;
    }
    const department = matchDepartment(unit.unit, departments);
    if (!department) {
      add({ category: 'unknownDepartment', person: null, department: unit.unit });
      continue;
    }
    const current = department.scienceDeputyId ? byId.get(department.scienceDeputyId) : null;
    const base = { department: deptLabel(department.name), system: current ? fio(current) : null };
    if (unit.people.length > 1) {
      add({ ...base, category: 'deputySeveral', person: unit.people.join(', ') });
      continue;
    }
    const [named] = unit.people;
    if (!named) continue;
    if (!current) {
      const [lastName, ...rest] = named.split(' ');
      const match = matchPeople(lastName, rest.join(' ') || null, staff);
      add({
        ...base,
        category: 'deputyToSet',
        person: named,
        staffId: match?.people[0]?.id ?? null,
      });
    } else if (letters(fio(current)) !== letters(named)) {
      add({ ...base, category: 'deputyDiffers', person: named });
    }
  }
  return out;
}
