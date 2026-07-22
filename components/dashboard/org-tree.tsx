import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { FacultyNode } from '@/lib/queries/get-dashboard';

// Факультет → Кафедра → скільки НПП. An indented list rather than a drawn
// graph: the structure is two levels deep and every row needs a readable name
// and a number, which boxes-and-lines does badly and a list does well. The
// connector rule is the same idiom the sidebar uses for its section links.

const counts = new Intl.NumberFormat('uk-UA');

/** «кафедра / кафедри / кафедр» — Ukrainian picks the form by the number */
function departmentWord(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'кафедр';
  const mod10 = count % 10;
  if (mod10 === 1) return 'кафедра';
  if (mod10 >= 2 && mod10 <= 4) return 'кафедри';
  return 'кафедр';
}

export function OrgTree({ faculties }: { faculties: FacultyNode[] }) {
  if (faculties.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        Факультетів ще немає. Створіть перший на сторінці «Факультети».
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {faculties.map((faculty) => (
        <div key={faculty.id} className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <Link
              href={`/faculties/${faculty.id}`}
              className="truncate text-sm font-medium hover:underline"
            >
              {faculty.name}
            </Link>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {faculty.departments.length} {departmentWord(faculty.departments.length)} ·{' '}
              {counts.format(faculty.nppCount)} НПП
            </span>
          </div>

          {faculty.departments.length > 0 && (
            <ul className="mt-2 ml-1 space-y-1 border-l pl-3">
              {faculty.departments.map((department) => (
                <li key={department.id} className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/departments/${department.id}`}
                    className="truncate text-sm text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {department.name}
                  </Link>
                  {/* A department with nobody in it is worth seeing, so it stays
                      in the list and only its number goes quiet. */}
                  <span
                    className={cn(
                      'shrink-0 text-xs tabular-nums',
                      department.nppCount === 0 && 'text-muted-foreground'
                    )}
                  >
                    {counts.format(department.nppCount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
