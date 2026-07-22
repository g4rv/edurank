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
import { SECTION_TITLES } from '@/lib/rating/activity-types';
import {
  evidenceDefaults,
  summarizeEvidence,
  type EvidenceField,
} from '@/lib/rating/evidence-fields';
import { ACTIVITY_KIND_LABELS, INPUT_SOURCE_LABELS } from '@/lib/rating/labels';
import { schemaForFields } from '@/validations/activity-evidence';
import { computeScore, type ScoringSpec } from '@/lib/rating/scoring';
import type { InputSource } from '@/lib/generated/prisma/client';

// One activity type as this service page needs it. Read from the DB row, so the
// page always shows the forms the app is really using — including whatever an
// admin has just built (template editor v2).
export interface DebugType {
  id: string;
  code: string;
  section: number;
  itemNumber: string;
  label: string;
  coefficient: number;
  coefficientNote: string | null;
  inputSource: InputSource;
  divisionName: string | null;
  fields: EvidenceField[];
  scoring: ScoringSpec;
}

const SECTIONS = [1, 2, 3, 4, 5] as const;

export function RatingDebugPlayground({ types }: { types: DebugType[] }) {
  const [section, setSection] = useState<number>(types[0]?.section ?? 1);
  const [code, setCode] = useState(types[0]?.code ?? '');

  const sectionTypes = types.filter((t) => t.section === section);
  const selected = sectionTypes.find((t) => t.code === code) ?? sectionTypes[0];

  function onSectionChange(value: string) {
    const next = Number(value);
    setSection(next);
    const first = types.find((t) => t.section === next);
    if (first) setCode(first.code);
  }

  if (types.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        Активний рейтинговий рік ще не налаштовано.
      </div>
    );
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
            <Select value={selected?.code ?? ''} onValueChange={setCode}>
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
      {selected && <DebugForm key={selected.id} type={selected} />}
    </div>
  );
}

function DebugForm({ type }: { type: DebugType }) {
  const [result, setResult] = useState<{
    computedValue: number;
    score: number;
    summary: string;
  } | null>(null);
  // A hand-built spec can disagree with its own fields; this page is exactly
  // where that must be visible instead of throwing.
  const [scoreError, setScoreError] = useState<string | null>(null);
  // useState initializer: fields are static for this mount (form remounts per type)
  const [schema] = useState(() => schemaForFields(type.fields));

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldValues>({
    // schemas vary per activity type, so the form is untyped by design
    resolver: standardSchemaResolver(schema as never) as unknown as Resolver<FieldValues>,
    defaultValues: evidenceDefaults(type.fields),
  });

  function onSubmit(data: FieldValues) {
    try {
      const { computedValue, score } = computeScore(
        {
          code: type.code,
          coefficient: type.coefficient,
          scoring: type.scoring,
          evidenceFields: type.fields,
        },
        data
      );
      setResult({ computedValue, score, summary: summarizeEvidence(type.fields, data) });
      setScoreError(null);
    } catch (e) {
      setResult(null);
      setScoreError(e instanceof Error ? e.message : 'Помилка обчислення');
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-foreground px-2.5 py-0.5 font-semibold text-background">
            {type.itemNumber}
          </span>
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-medium text-primary">
            {INPUT_SOURCE_LABELS[type.inputSource]}
          </span>
          {type.divisionName && (
            <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
              {type.divisionName}
            </span>
          )}
          <span className="ml-auto text-muted-foreground">
            {ACTIVITY_KIND_LABELS[type.scoring.kind]}
          </span>
        </div>
        <h2 className="text-base font-semibold">{type.label}</h2>
        {type.coefficientNote && (
          <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">
            {type.coefficientNote}
          </p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">Коефіцієнт: {type.coefficient}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border bg-card p-5">
        <EvidenceFields
          fields={type.fields}
          register={register}
          control={control}
          errors={errors}
        />
        <Button type="submit" className="mt-4">
          Обчислити бали
        </Button>
      </form>

      {scoreError && (
        <div className="rounded-xl border-2 border-destructive/30 bg-card p-5 text-sm text-destructive">
          {scoreError}
        </div>
      )}

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
