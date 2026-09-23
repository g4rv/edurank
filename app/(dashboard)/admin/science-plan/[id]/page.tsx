import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Badge } from '@/components/aurora/ui/badge';
import { WorkTypeList, type WorkTypeRow } from '@/components/science/admin/work-type-list';
import { parseTypeSpecs } from '@/validations/activity-type-spec';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import type { ScoringSpec } from '@/lib/specs/scoring';

/**
 * ADMIN's Додаток III catalogue for one навчальний рік — the editor Task 13
 * builds. The segment is `[id]`, the `SciencePlanTemplate.id` — not the
 * academicYear string («2026/2027»), which contains a slash a single dynamic
 * route segment cannot hold without URL-encoding games. The id is already the
 * unique, slash-free key every other science query scopes on.
 */
export default async function ScienceWorkTypesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: templateId } = await params;
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const template = await db.sciencePlanTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      academicYear: true,
      status: true,
      workTypes: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          order: true,
          code: true,
          itemNumber: true,
          itemTitle: true,
          shortLabel: true,
          label: true,
          coefficient: true,
          unitNote: true,
          reportingForm: true,
          reuse: true,
          sharing: true,
          identityFields: true,
          linkRule: true,
          fileRule: true,
          maxPerYear: true,
          isActive: true,
          evidenceFields: true,
          scoring: true,
          _count: { select: { planRows: true } },
        },
      },
    },
  });
  if (!template) notFound();

  const workTypes: WorkTypeRow[] = template.workTypes.map((wt) => {
    // A row whose specs do not parse still renders — an admin has to be able
    // to open and repair it, not just watch the page 500.
    let fields: EvidenceField[] = [];
    let scoring: ScoringSpec = { kind: 'FIXED' };
    try {
      const specs = parseTypeSpecs(wt);
      fields = specs.fields;
      scoring = specs.scoring;
    } catch {
      // leave the safe defaults
    }

    return {
      id: wt.id,
      order: wt.order,
      code: wt.code,
      itemNumber: wt.itemNumber,
      itemTitle: wt.itemTitle,
      shortLabel: wt.shortLabel,
      label: wt.label,
      coefficient: wt.coefficient,
      unitNote: wt.unitNote,
      reportingForm: wt.reportingForm,
      reuse: wt.reuse,
      sharing: wt.sharing,
      identityFields: Array.isArray(wt.identityFields) ? (wt.identityFields as string[]) : [],
      linkRule: wt.linkRule,
      fileRule: wt.fileRule,
      maxPerYear: wt.maxPerYear,
      isActive: wt.isActive,
      planRowCount: wt._count.planRows,
      fields,
      scoring,
    };
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: 'Адміністрування' },
          { label: 'Планування наукової роботи', href: '/admin/science-plan' },
          { label: template.academicYear },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">
          Додаток III · {template.academicYear}
        </h1>
        <Badge tone={template.status === 'OPEN' ? 'ok' : 'muted'}>
          {template.status === 'OPEN' ? 'Відкритий' : 'Закритий'}
        </Badge>
      </div>
      {/* Counted, not typed: «26» was the number the 2026/2027 catalogue was
          seeded with, and it stops being true the first time an ADMIN adds a
          вид роботи — which is the whole point of this screen. */}
      <p className="text-sm text-foreground-soft">
        {workTypes.length} видів наукової роботи та їх вартість у годинах. Зміни діють одразу —
        деактивація приховує вид роботи з переліку для планування, не чіпаючи вже заплановані рядки.
      </p>

      <WorkTypeList templateId={template.id} workTypes={workTypes} />
    </div>
  );
}
