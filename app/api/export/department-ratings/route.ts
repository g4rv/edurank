import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listMyDepartments } from '@/lib/queries/list-my-department';
import { deanOf } from '@/lib/queries/scope';
import { attachmentHeader } from '@/lib/export/file-names';
import { buildRatingListWorkbook } from '@/lib/staff/rating-list-workbook';
import { logError } from '@/lib/log';

/**
 * «ПІБ | кафедра | рейтинг» for a завідувач's кафедра or a декан's факультет
 * (owner, 2026-09-24).
 *
 * `?department=<id>` — one кафедра; `?faculty=<id>` — every кафедра of a
 * факультет. Built on `listMyDepartments`, the query behind «Моя кафедра», so
 * the file can only ever hold what this person may already see on screen:
 * a кафедра outside their scope simply is not in it, and one asked for by id
 * is refused rather than silently emptied.
 *
 * NOT covered by `proxy.ts` — every `/api` route authenticates itself.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const departmentId = url.searchParams.get('department');
  const facultyId = url.searchParams.get('faculty');
  if (!departmentId === !facultyId) return new Response('Bad Request', { status: 400 });

  try {
    const template = await getActiveTemplate();
    if (!template) return new Response('Not Found', { status: 404 });

    const mine = await listMyDepartments(session.user.staffId, template.year);

    let chosen = mine;
    let title: string;
    if (departmentId) {
      chosen = mine.filter((d) => d.id === departmentId);
      if (chosen.length === 0) return new Response('Forbidden', { status: 403 });
      title = chosen[0].name;
    } else {
      // A факультет is a декан's, and only theirs — a завідувач's scope covers
      // one of its кафедри, which is not the факультет.
      const faculty = (await deanOf(session.user.staffId)).find((f) => f.id === facultyId);
      if (!faculty) return new Response('Forbidden', { status: 403 });
      chosen = mine.filter((d) => d.faculty === faculty.name);
      title = faculty.name;
    }

    // A кафедра with nobody on it would be a yellow heading over nothing.
    const groups = chosen
      .filter((d) => d.staff.length > 0)
      .map((d) => ({
        department: d.name,
        staff: d.staff.map((person) => ({
          fullName: person.name,
          total: person.total,
          isPartTime: person.isPartTime,
        })),
      }));

    const buffer = await buildRatingListWorkbook(groups, template.year).xlsx.writeBuffer();
    return new Response(buffer as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentHeader(`Рейтинг ${template.year} — ${title}.xlsx`),
      },
    });
  } catch (e) {
    logError('export.departmentRatings', e, { userId: session.user.id });
    return new Response('Internal Server Error', { status: 500 });
  }
}
