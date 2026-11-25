import type { Role } from '@/lib/generated/prisma/client';
import type { PageAccess } from './page-access';

/**
 * Where `/` and the login send somebody, and where a page they may not open
 * sends them back to (owner, 2026-11-25). Every editor went to `/staff` before,
 * which an editor without «Штат» can no longer open.
 *
 * A USER keeps landing on their own profile, heads and деканs included — only
 * an editor's start page moves. Pure; the caller gathers the answers.
 */
export interface StartPageInput {
  role: Role;
  access: PageAccess;
  canEnterData: boolean;
  canModerate: boolean;
  canOverseeScience: boolean;
  headsDepartment: boolean;
  isDean: boolean;
}

export function startPageFor(input: StartPageInput): string {
  if (input.role === 'ADMIN') return '/staff';
  if (input.role !== 'EDITOR') return '/profile';

  const { access } = input;
  if (access.staff) return '/staff';
  if (access.rating) return '/rating';
  if (input.canEnterData) return '/division-data';
  if (input.canModerate) return '/moderation';
  if (input.canOverseeScience) return '/science-plans';
  if (access.departments) return '/departments';
  if (access.faculties) return '/faculties';
  if (access.charts) return '/dashboard';
  if (input.isDean) return '/my-faculty';
  if (input.headsDepartment) return '/my-department';
  return '/profile';
}
