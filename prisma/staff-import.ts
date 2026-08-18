import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normaliseDepartmentName } from '../lib/specialities/departments';
import type { PrismaClient } from '../lib/generated/prisma/client';

// The real НПП — `pnpm db:seed:staff`.
//
// Reads `staff-roster.json`, which `pnpm staff:build` writes from the files in
// `edu-reference/`. Two files rather than one because they have different
// lifetimes and different risks: the roster changes when somebody joins or
// leaves, and it holds ~300 colleagues' names and corporate addresses, so it is
// gitignored and never travels with the image.
//
// **Re-runnable, and that is the point** (rewritten 2026-08-18). The previous
// version parsed the spreadsheet directly and could only be reached through a
// mode that called `wipePeople()` first — importing the staff deleted the
// administrator, the structure and the audit log. This upserts on the email, so
// running it again after the roster changes updates who is there and adds who
// is new, and touches nothing else in the database.
//
// **Nobody gets a password.** An account with no `passwordHash` cannot sign in,
// and `/admin/invites` is how each person sets their own. Seeding a shared one
// for 300 people would be the single worst thing this file could do.

/** One person as `pnpm staff:build` writes them */
interface RosterEntry {
  /** ПІБ with the patronymic, where the sources had one */
  fullName: string;
  /** As the кафедра page listed them — usually without the patronymic */
  listedName: string;
  email: string;
  /** Their primary кафедра, spelled as `prisma/preprod-org.ts` spells it */
  department: string | null;
  /** Кафедри they also teach on — сумісництво */
  alsoIn?: string[];
  hasPatronymic?: boolean;
}

export interface ImportResult {
  created: number;
  updated: number;
  /** `StaffDepartment` rows written for сумісництво */
  secondary: number;
  /** Names the roster has no address for — nothing is imported while any exist */
  withoutEmail: string[];
  /** «address — name, name» for an address claimed by more than one person */
  duplicateEmails: string[];
  /** Кафедри named in the roster that the database does not have */
  unknownDepartments: string[];
}

const ROSTER_PATH = 'staff-roster.json';

/** «Рик Сергій Миколайович» → the three parts, patronymic optional */
function splitName(fullName: string): { lastName: string; firstName: string; patronymic: string } {
  const parts = fullName.trim().split(/\s+/);
  return {
    lastName: parts[0] ?? fullName,
    firstName: parts[1] ?? '',
    // Empty rather than null: the column is required, and «no patronymic
    // recorded» is a fact about the source, not about the person.
    patronymic: parts.slice(2).join(' '),
  };
}

export async function importRealStaff(prisma: PrismaClient): Promise<ImportResult> {
  const path = resolve(process.cwd(), ROSTER_PATH);
  let roster: RosterEntry[];
  try {
    roster = JSON.parse(readFileSync(path, 'utf8')) as RosterEntry[];
  } catch {
    throw new Error(
      `Немає файлу ${ROSTER_PATH}. Спершу зберіть його: pnpm staff:build ` +
        '(потрібні файли з edu-reference/, тому запускати треба з машини мейнтейнера)'
    );
  }

  const result: ImportResult = {
    created: 0,
    updated: 0,
    secondary: 0,
    withoutEmail: [],
    duplicateEmails: [],
    unknownDepartments: [],
  };

  // ── refuse before writing anything ────────────────────────────────────────
  // Half an import is worse than none: the people who landed are indexed by an
  // address somebody is about to correct, and re-running would then create a
  // second row for the corrected one.
  const byEmail = new Map<string, string[]>();
  for (const person of roster) {
    const email = person.email?.trim().toLowerCase();
    if (!email) {
      result.withoutEmail.push(person.fullName);
      continue;
    }
    byEmail.set(email, [...(byEmail.get(email) ?? []), person.fullName]);
  }
  for (const [email, names] of byEmail) {
    if (names.length > 1) result.duplicateEmails.push(`${email} — ${names.join(', ')}`);
  }
  if (result.withoutEmail.length > 0 || result.duplicateEmails.length > 0) return result;

  // ── кафедри, matched the way the rest of the app matches them ─────────────
  const departments = await prisma.department.findMany({ select: { id: true, name: true } });
  const departmentByName = new Map(departments.map((d) => [normaliseDepartmentName(d.name), d.id]));
  const unknown = new Set<string>();
  const findDepartment = (name: string | null | undefined): string | null => {
    if (!name) return null;
    const id = departmentByName.get(normaliseDepartmentName(name));
    if (!id) unknown.add(name);
    return id ?? null;
  };

  for (const person of roster) {
    const email = person.email.trim().toLowerCase();
    const { lastName, firstName, patronymic } = splitName(person.fullName);
    const departmentId = findDepartment(person.department);

    const existing = await prisma.staff.findUnique({ where: { email }, select: { id: true } });

    // `update` deliberately carries the name and the кафедра but NOT the role,
    // the profile or `isNpp`: those are edited in the app after the import, and
    // a re-run must not undo somebody's work. The roster is the authority on
    // who exists and where they teach, nothing more.
    const staff = await prisma.staff.upsert({
      where: { email },
      update: { lastName, firstName, patronymic, ...(departmentId ? { departmentId } : {}) },
      create: {
        email,
        lastName,
        firstName,
        patronymic,
        isNpp: true,
        role: 'USER',
        departmentId,
        // No passwordHash — see the note at the top of this file.
      },
      select: { id: true },
    });

    if (existing) result.updated += 1;
    else result.created += 1;

    // Сумісництво. `StaffDepartment` is the join that lets somebody teach on a
    // кафедра that is not their primary one, and the roster is the only place
    // that knows about it.
    for (const alsoName of person.alsoIn ?? []) {
      const alsoId = findDepartment(alsoName);
      if (!alsoId || alsoId === departmentId) continue;
      await prisma.staffDepartment.upsert({
        where: { staffId_departmentId: { staffId: staff.id, departmentId: alsoId } },
        update: {},
        create: { staffId: staff.id, departmentId: alsoId },
      });
      result.secondary += 1;
    }
  }

  result.unknownDepartments = [...unknown].sort();
  return result;
}
