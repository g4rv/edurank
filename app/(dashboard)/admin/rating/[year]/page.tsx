import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { AnimatedPage } from '@/components/ui/animated-page';
import { ActivityTypeRow, type EditableActivityType } from '@/components/admin/activity-type-row';
import { AddActivityType } from '@/components/admin/add-activity-type';
import { NewActivityType } from '@/components/admin/new-activity-type';
import { ACTIVITY_TYPES_2026 } from '@/lib/rating/activity-types';
import { RATING_YEAR_STATUS_LABELS } from '@/lib/rating/labels';
import { parseTypeSpecs } from '@/validations/activity-type-spec';
import { cn } from '@/lib/utils';

/**
 * The next free number in a section — «3.1» after nothing, «3.25» after 3.24.
 * Only the section's own numbers count, so a stray number left by an older
 * catalogue cannot push the suggestion into another section's range.
 */
function nextItemNumber(section: number, types: { itemNumber: string }[]): string {
  const minors = types
    .map((t) => t.itemNumber.split('.'))
    .filter(([major]) => Number(major) === section)
    .map(([, minor]) => Number(minor))
    .filter((n) => Number.isFinite(n));
  return `${section}.${Math.max(0, ...minors) + 1}`;
}

export default async function RatingTemplatePage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year: yearParam } = await params;
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const year = Number(yearParam);
  if (!Number.isInteger(year)) notFound();

  const [template, divisions] = await Promise.all([
    db.ratingTemplate.findUnique({
      where: { year },
      select: {
        id: true,
        year: true,
        name: true,
        status: true,
        isActive: true,
        sections: {
          orderBy: { number: 'asc' },
          select: {
            id: true,
            number: true,
            title: true,
            activityTypes: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                code: true,
                label: true,
                itemNumber: true,
                maxPerYear: true,
                coefficient: true,
                coefficientNote: true,
                inputSource: true,
                verifyingDivisionId: true,
                evidenceFields: true,
                scoring: true,
                isActive: true,
                requiresVerification: true,
                entityFirstEntry: true,
                // Drives whether the row may be deleted or only deactivated
                _count: { select: { activities: true } },
              },
            },
          },
        },
      },
    }),
    db.division.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  if (!template) notFound();

  const editable = template.status === 'OPEN';
  const presentCodes = new Set(
    template.sections.flatMap((s) => s.activityTypes.map((t) => t.code))
  );
  const missingCodes = ACTIVITY_TYPES_2026.filter((d) => !presentCodes.has(d.code)).map((d) => ({
    code: d.code,
    label: `${d.itemNumber} — ${d.label}`,
  }));

  return (
    <AnimatedPage className="space-y-6">
      <Link
        href="/admin/rating"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Рейтингові роки
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{template.name}</h1>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                template.status === 'OPEN'
                  ? 'bg-green-500/10 text-green-600'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {RATING_YEAR_STATUS_LABELS[template.status]}
            </span>
            {template.isActive && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                Активний
              </span>
            )}
          </div>
          {!editable && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Рік закрито — показники доступні лише для перегляду
            </p>
          )}
        </div>
        {editable && missingCodes.length > 0 && (
          <AddActivityType templateId={template.id} missing={missingCodes} />
        )}
      </div>

      {template.sections.map((section) => (
        <div key={section.id} className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-5 py-2">
            <h2 className="text-sm font-semibold">
              Розділ {section.number}. {section.title}
            </h2>
            {editable && (
              <NewActivityType
                templateId={template.id}
                section={section.number}
                nextItemNumber={nextItemNumber(section.number, section.activityTypes)}
                divisions={divisions}
              />
            )}
          </div>
          {section.activityTypes.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">Немає показників.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {section.activityTypes.map((type) => {
                  // A row whose specs do not parse still renders — the admin
                  // needs to be able to open and repair it
                  let fields: EditableActivityType['fields'] = [];
                  let scoring: EditableActivityType['scoring'] = { kind: 'FIXED' };
                  try {
                    const specs = parseTypeSpecs(type);
                    fields = specs.fields;
                    scoring = specs.scoring;
                  } catch {
                    // leave the safe defaults
                  }

                  return (
                    <ActivityTypeRow
                      key={type.id}
                      templateId={template.id}
                      type={{
                        id: type.id,
                        code: type.code,
                        section: section.number,
                        itemNumber: type.itemNumber,
                        label: type.label,
                        coefficient: type.coefficient,
                        coefficientNote: type.coefficientNote,
                        maxPerYear: type.maxPerYear,
                        inputSource: type.inputSource,
                        verifyingDivisionId: type.verifyingDivisionId,
                        isActive: type.isActive,
                        requiresVerification: type.requiresVerification,
                        entityFirstEntry: type.entityFirstEntry,
                        activityCount: type._count.activities,
                        fields,
                        scoring,
                      }}
                      divisions={divisions}
                      editable={editable}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </AnimatedPage>
  );
}
