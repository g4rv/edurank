import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { FIELD_LABELS } from '@/lib/labels';
import { FieldPermissionToggle } from '@/components/admin/field-permission-toggle';
import { AnimatedList, AnimatedItem } from '@/components/ui/animated-list';

const FIELD_GROUPS = [
  {
    label: 'Персональні дані',
    fields: ['lastName', 'firstName', 'patronymic', 'email', 'phone', 'isNpp'],
  },
  {
    label: 'Академічні дані',
    fields: [
      'academicRank',
      'scientificDegree',
      'degreeMatchesDepartment',
      'pedagogicalExperience',
      'adminPosition',
      'basicEducationMatch',
      'basicEducationSpecialty',
    ],
  },
  {
    label: 'Наукові профілі',
    fields: [
      'wosUrl',
      'wosCitationCount',
      'scopusUrl',
      'scopusCitationCount',
      'googleScholarUrl',
      'googleScholarCitationCount',
      'orcidId',
    ],
  },
  {
    label: 'Організаційне',
    fields: ['departmentId', 'divisionId'],
  },
] as const;

export default async function FieldPermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ division?: string }>;
}) {
  const session = await auth();
  if (session?.user.role !== 'ADMIN') redirect('/');

  const divisions = await db.division.findMany({ orderBy: { name: 'asc' } });
  const { division: divisionParam } = await searchParams;
  const selectedId = divisionParam ?? divisions[0]?.id;

  const grantedFields = selectedId
    ? await db.divisionFieldPermission.findMany({
        where: { divisionId: selectedId },
        select: { fieldName: true },
      })
    : [];

  const granted = new Set(grantedFields.map((p) => p.fieldName));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Доступ до полів</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Які поля персоналу редактори кожного відділу можуть змінювати
        </p>
      </div>

      {divisions.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Відділів не знайдено. Спочатку{' '}
          <Link href="/divisions/new" className="underline underline-offset-4">
            додайте відділ
          </Link>
          .
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {divisions.map((div) => (
              <Link
                key={div.id}
                href={`/admin/permissions/field?division=${div.id}`}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                  div.id === selectedId
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                )}
              >
                {div.name}
              </Link>
            ))}
          </div>

          {selectedId && (
            <div className="space-y-4">
              {FIELD_GROUPS.map((group) => (
                <div key={group.label} className="rounded-xl border bg-card">
                  <div className="border-b px-4 py-3">
                    <p className="text-sm font-medium">{group.label}</p>
                  </div>
                  <AnimatedList className="divide-y">
                    {group.fields.map((field) => (
                      <AnimatedItem key={field}>
                        <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/30">
                          <FieldPermissionToggle
                            divisionId={selectedId}
                            fieldName={field}
                            checked={granted.has(field)}
                          />
                          <span className="text-sm">{FIELD_LABELS[field] ?? field}</span>
                        </label>
                      </AnimatedItem>
                    ))}
                  </AnimatedList>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
