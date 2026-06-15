import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Pencil } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { AnimatedPage } from '@/components/ui/animated-page';
import { DeleteDivisionButton } from '@/components/division/delete-button';
import { FIELD_LABELS } from '@/lib/labels';

const ENTITY_LABELS: Record<string, string> = {
  STAFF: 'Персонал',
  DEPARTMENT: 'Кафедра',
  FACULTY: 'Факультет',
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Створення',
  UPDATE: 'Редагування',
  DELETE: 'Видалення',
};

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold tracking-wide text-foreground uppercase">
        {title}
      </h2>
      {children}
    </div>
  );
}

export default async function DivisionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = session?.user.role;

  if (role === 'USER') redirect('/profile');

  const division = await db.division.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      _count: { select: { staff: true } },
      fieldPermissions: { select: { fieldName: true }, orderBy: { fieldName: 'asc' } },
      entityPermissions: {
        select: { entity: true, action: true },
        orderBy: [{ entity: 'asc' }, { action: 'asc' }],
      },
    },
  });

  if (!division) notFound();

  const isAdmin = role === 'ADMIN';

  return (
    <AnimatedPage className="space-y-6">
      <Link
        href="/divisions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Відділи
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{division.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {division._count.staff} співробітників
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-start gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/divisions/${id}/edit`}>
                <Pencil className="size-4" />
              </Link>
            </Button>
            <DeleteDivisionButton divisionId={id} divisionName={division.name} />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <InfoCard title="Доступ до полів">
          {division.fieldPermissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Поля не налаштовано</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {division.fieldPermissions.map((fp) => (
                <span
                  key={fp.fieldName}
                  className="rounded-md border bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
                >
                  {FIELD_LABELS[fp.fieldName] ?? fp.fieldName}
                </span>
              ))}
            </div>
          )}
        </InfoCard>

        <InfoCard title="Дії з сутностями">
          {division.entityPermissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Дії не налаштовано</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {division.entityPermissions.map((ep) => (
                <span
                  key={`${ep.entity}-${ep.action}`}
                  className="rounded-md border bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
                >
                  {ENTITY_LABELS[ep.entity] ?? ep.entity} — {ACTION_LABELS[ep.action] ?? ep.action}
                </span>
              ))}
            </div>
          )}
        </InfoCard>
      </div>
    </AnimatedPage>
  );
}
