import { db } from '@/lib/db';
import { ON_ROSTER } from '@/lib/queries/roster';

/** One person the «Співавтори» picker can offer. */
export interface CoauthorCandidate {
  id: string;
  /** «Прізвище Ім'я По батькові» — what a person types to find them. */
  name: string;
  /** The primary кафедра, to tell two people of one name apart. */
  department: string | null;
}

/**
 * Everybody an author may name as a co-author: the НПП on the roster, never the
 * author themselves.
 *
 * НПП only — наукова робота is an НПП's, an administrative account has no plan
 * to hold hours against — and never an archived person, who is off the roster
 * and could not sign in to see the hours they were given.
 *
 * About three hundred rows, sent once with the page: a search-as-you-type over
 * a list already in the browser answers in the same frame, where a request per
 * keystroke would not.
 */
export async function listCoauthorCandidates(excludeStaffId: string): Promise<CoauthorCandidate[]> {
  const people = await db.staff.findMany({
    where: { ...ON_ROSTER, isNpp: true, id: { not: excludeStaffId } },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      department: { select: { name: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { patronymic: 'asc' }],
  });

  return people.map((p) => ({
    id: p.id,
    name: `${p.lastName} ${p.firstName}${p.patronymic ? ` ${p.patronymic}` : ''}`,
    department: p.department?.name ?? null,
  }));
}
