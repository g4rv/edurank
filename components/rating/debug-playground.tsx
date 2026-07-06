'use client';

import { useState } from 'react';
import { useForm, type FieldValues, type Resolver } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EvidenceFields } from '@/components/rating/evidence-fields';
import { ACTIVITY_TYPES_2026, RATING_DIVISIONS, SECTION_TITLES } from '@/lib/rating/activity-types';
import { evidenceDefaults } from '@/lib/rating/evidence-fields';
import { ACTIVITY_KIND_LABELS, INPUT_SOURCE_LABELS } from '@/lib/rating/labels';
import { activityTypeMeta, summarizeEvidence } from '@/lib/rating/registry';
import { computeScore } from '@/lib/rating/scoring';

const SECTIONS = [1, 2, 3, 4, 5] as const;

export function RatingDebugPlayground() {
  const [section, setSection] = useState<number>(1);
  const sectionTypes = ACTIVITY_TYPES_2026.filter((t) => t.section === section);
  const [code, setCode] = useState(sectionTypes[0].code);

  function onSectionChange(value: string) {
    const next = Number(value);
    setSection(next);
    setCode(ACTIVITY_TYPES_2026.find((t) => t.section === next)!.code);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-[2fr_3fr]">
          <div className="space-y-2">
            <Label htmlFor="debug-section">Розділ</Label>
            <Select value={String(section)} onValueChange={onSectionChange}>
              <SelectTrigger id="debug-section" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    <span className="font-medium">{s}.</span>
                    <span className="line-clamp-1">{SECTION_TITLES[s]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="debug-type">Показник</Label>
            <Select value={code} onValueChange={setCode}>
              <SelectTrigger id="debug-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sectionTypes.map((t) => (
                  <SelectItem key={t.code} value={t.code}>
                    <span className="font-medium text-muted-foreground">{t.itemNumber}</span>
                    <span className="line-clamp-1">{t.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

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
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-foreground px-2.5 py-0.5 font-semibold text-background">
            {def.itemNumber}
          </span>
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-medium text-primary">
            {INPUT_SOURCE_LABELS[def.inputSource]}
          </span>
          {def.verifyingDivision && (
            <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
              {RATING_DIVISIONS[def.verifyingDivision]}
            </span>
          )}
          <span className="ml-auto text-muted-foreground">{ACTIVITY_KIND_LABELS[def.kind]}</span>
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
        <div className="rounded-xl border-2 border-primary/30 bg-card p-5 text-sm">
          <p>
            Обчислене значення: <span className="font-medium">{result.computedValue}</span>
          </p>
          <p>
            Бали: <span className="text-base font-semibold">{result.score}</span>
          </p>
          {result.summary && <p className="mt-1 text-muted-foreground">{result.summary}</p>}
        </div>
      )}
    </div>
  );
}
