import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { RatingDebugPlayground, type DebugType } from '@/components/rating/debug-playground';
import { parseTypeSpecs } from '@/validations/activity-type-spec';

// Dev/QA tool: renders every evidence form of the active year and computes the
// score locally. Reads the DB rows, so it shows what an admin has actually
// configured. ADMIN-only; carries no data-changing actions.
export default async function RatingDebugPage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const template = await db.ratingTemplate.findFirst({
    where: { isActive: true },
    select: {
      year: true,
      activityTypes: {
        select: {
          id: true,
          code: true,
          label: true,
          itemNumber: true,
          coefficient: true,
          coefficientNote: true,
          inputSource: true,
          evidenceFields: true,
          scoring: true,
          section: { select: { number: true } },
          verifyingDivision: { select: { name: true } },
        },
        orderBy: [{ section: { number: 'asc' } }, { order: 'asc' }],
      },
    },
  });

  // A row whose specs do not parse is dropped instead of crashing the page —
  // this is the page you open precisely when a spec is suspect.
  const types: DebugType[] = (template?.activityTypes ?? []).flatMap((t) => {
    try {
      const specs = parseTypeSpecs(t);
      return [
        {
          id: t.id,
          code: t.code,
          section: t.section.number,
          itemNumber: t.itemNumber,
          label: t.label,
          coefficient: t.coefficient,
          coefficientNote: t.coefficientNote,
          inputSource: t.inputSource,
          divisionName: t.verifyingDivision?.name ?? null,
          fields: specs.fields,
          scoring: specs.scoring,
        },
      ];
    } catch {
      return [];
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          Рейтинг — тест форм{template ? ` (${template.year})` : ''}
        </h1>
        <p className="text-sm text-muted-foreground">
          Службова сторінка: перегляд форм доказів та перевірка обчислення балів для всіх типів
          показників.
        </p>
      </div>
      <RatingDebugPlayground types={types} />
    </div>
  );
}
