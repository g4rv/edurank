'use client';

import { useState } from 'react';
import { useForm, type FieldValues, type Resolver } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Button } from '@/components/ui/button';
import { EvidenceFields } from '@/components/rating/evidence-fields';
import { ACTIVITY_TYPES_2026, RATING_DIVISIONS, SECTION_TITLES } from '@/lib/rating/activity-types';
import { evidenceDefaults } from '@/lib/rating/evidence-fields';
import { INPUT_SOURCE_LABELS } from '@/lib/rating/labels';
import { activityTypeMeta, summarizeEvidence } from '@/lib/rating/registry';
import { computeScore } from '@/lib/rating/scoring';
import { cn } from '@/lib/utils';

const SECTIONS = [1, 2, 3, 4, 5] as const;

export function RatingDebugPlayground() {
  const [code, setCode] = useState(ACTIVITY_TYPES_2026[0].code);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <nav className="space-y-4">
        {SECTIONS.map((section) => (
          <div key={section} className="rounded-xl border bg-card p-3">
            <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">
              Розділ {section}. {SECTION_TITLES[section]}
            </p>
            <ul className="space-y-0.5">
              {ACTIVITY_TYPES_2026.filter((t) => t.section === section).map((t) => (
                <li key={t.code}>
                  <button
                    type="button"
                    onClick={() => setCode(t.code)}
                    className={cn(
                      'w-full rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-accent',
                      t.code === code && 'bg-accent font-medium'
                    )}
                  >
                    <span className="mr-1.5 text-muted-foreground">{t.itemNumber}</span>
                    <span className="line-clamp-1">{t.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* key remounts the form when the type changes */}
      <DebugForm key={code} code={code} />
    </div>
  );
}

function DebugForm({ code }: { code: string }) {
  const { def, fields, schema } = activityTypeMeta(code);
  const [result, setResult] = useState<{
    computedValue: number;
    score: number;
    summary: string;
  } | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldValues>({
    // schemas vary per activity type, so the form is untyped by design
    resolver: standardSchemaResolver(schema as never) as unknown as Resolver<FieldValues>,
    defaultValues: evidenceDefaults(fields),
  });

  function onSubmit(data: FieldValues) {
    const { computedValue, score } = computeScore(code, data, def.coefficient);
    setResult({ computedValue, score, summary: summarizeEvidence(code, data) });
  }

  return (
    <div className="space-y-4 self-start">
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-accent px-2 py-0.5">{def.itemNumber}</span>
          <span className="rounded-full bg-accent px-2 py-0.5">{def.kind}</span>
          <span className="rounded-full bg-accent px-2 py-0.5">
            {INPUT_SOURCE_LABELS[def.inputSource]}
          </span>
          {def.verifyingDivision && (
            <span className="rounded-full bg-accent px-2 py-0.5">
              {RATING_DIVISIONS[def.verifyingDivision]}
            </span>
          )}
        </div>
        <h2 className="text-base font-semibold">{def.label}</h2>
        {def.coefficientNote && (
          <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">
            {def.coefficientNote}
          </p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">Коефіцієнт: {def.coefficient}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border bg-card p-5">
        <EvidenceFields
          code={code}
          fields={fields}
          register={register}
          control={control}
          errors={errors}
        />
        <Button type="submit" className="mt-4">
          Обчислити бали
        </Button>
      </form>

      {result && (
        <div className="rounded-xl border bg-card p-5 text-sm">
          <p>
            Обчислене значення: <span className="font-medium">{result.computedValue}</span>
          </p>
          <p>
            Бали: <span className="font-semibold">{result.score}</span>
          </p>
          {result.summary && <p className="mt-1 text-muted-foreground">{result.summary}</p>}
        </div>
      )}
    </div>
  );
}
