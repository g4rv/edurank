import { z } from 'zod';

// Рейтинг кафедри — the report a завідувач fills (2026-10-20).
//
// The scored half is checked here only for shape (whole numbers ≥ 0); which
// ids are legal depends on the year's lines and is `valuesProblem`'s job. The
// narrative half — items 14–17 of the template — has no points, so its
// structure is fixed here rather than in the database. Every box is optional.
//
// Shared by the form and the action, and it accepts its own output: the form
// sends what the resolver produced, which the action parses again.

export const NARRATIVE_LIMITS = {
  /** item 14 — rows of ініціативна тематика */
  initiativeRows: 3,
  /** item 15 — держбюджетні / госпдоговірні дослідження */
  studies: 2,
  /** 17.3 «до 3000 знаків» */
  results: 3000,
  /** 17.4 «до 2000 знаків» */
  role: 2000,
  /** 17.5 «до 6000 знаків» */
  impact: 6000,
  /** 17.6 «до 1000 знаків» */
  confirmations: 1000,
  /** Any box the template sets no limit on */
  text: 6000,
} as const;

/** 17.1 «Основний вид впливу» — the template's twelve, in its order */
export const IMPACT_KINDS = [
  'на забезпечення безпеки та оборони країни',
  'на розвиток економіки',
  'на розвиток технологій',
  "на забезпечення здоров'я та якості життя",
  'на розвиток передової науки',
  'на популяризацію результатів наукових досліджень',
  'на розвиток освіти',
  'на розвиток соціальної сфери',
  'на розвиток культури',
  'на збереження стану навколишнього природного середовища',
  'на забезпечення продовольчої безпеки',
  'на розвиток державної політики',
] as const;

const tooLong = 'Занадто довгий текст';
const text = (max: number = NARRATIVE_LIMITS.text) =>
  z.string().trim().max(max, { error: tooLong });

const initiativeRowSchema = z.object({
  topic: text(),
  results: text(),
  expected: text(),
});

const studySchema = z.object({
  title: text(),
  customer: text(),
  lead: text(),
  team: text(),
  funding: text(),
  results: text(),
});

export const narrativeSchema = z.object({
  initiative: z
    .array(initiativeRowSchema)
    .max(NARRATIVE_LIMITS.initiativeRows, { error: 'Не більше трьох тем' }),
  studies: z
    .array(studySchema)
    .max(NARRATIVE_LIMITS.studies, { error: 'Не більше двох досліджень' }),
  development: z.object({
    name: text(),
    essence: text(),
    patentability: text(),
    comparison: text(),
    economics: text(),
    adopters: text(),
    readiness: text(),
    contacts: text(),
  }),
  impact: z.object({
    // 17.1 «Основний вид впливу» — one select (owner, 2026-10-21: a list of
    // ticks was tried the same day and reverted)
    kind: z.enum(IMPACT_KINDS).nullable(),
    resultsList: text(),
    results: text(NARRATIVE_LIMITS.results),
    role: text(NARRATIVE_LIMITS.role),
    description: text(NARRATIVE_LIMITS.impact),
    confirmations: text(NARRATIVE_LIMITS.confirmations),
  }),
});

export type DepartmentNarrative = z.infer<typeof narrativeSchema>;

export const EMPTY_NARRATIVE: DepartmentNarrative = {
  initiative: [],
  studies: [],
  development: {
    name: '',
    essence: '',
    patentability: '',
    comparison: '',
    economics: '',
    adopters: '',
    readiness: '',
    contacts: '',
  },
  impact: {
    kind: null,
    resultsList: '',
    results: '',
    role: '',
    description: '',
    confirmations: '',
  },
};

/**
 * Counts are typed, whole, 1–999 (owner, 2026-10-21 — a 1–10 select was
 * considered and dropped: a кафедра can publish more than ten articles). 0 is
 * not a value: an empty box already says «none».
 */
export const MIN_COUNT = 1;
export const MAX_COUNT = 999;

export const departmentReportSchema = z.object({
  departmentId: z.string().min(1),
  year: z.number().int(),
  values: z.record(
    z.string(),
    z
      .number({ error: 'Вкажіть ціле число' })
      .int({ error: 'Вкажіть ціле число' })
      // 0, not MIN_COUNT: a CHOICE's first option is index 0. A COUNT's own
      // floor of 1 needs the row's kind and is `valuesProblem`'s check.
      .min(0, { error: 'Не менше 0' })
      .max(MAX_COUNT, { error: `Не більше ${MAX_COUNT}` })
  ),
  narrative: narrativeSchema,
});

export type DepartmentReportInput = z.infer<typeof departmentReportSchema>;

/**
 * A stored narrative, read leniently: a row saved by an older shape renders as
 * empty boxes rather than taking the page down.
 */
export function readNarrative(stored: unknown): DepartmentNarrative {
  const parsed = narrativeSchema.safeParse(stored);
  return parsed.success ? parsed.data : EMPTY_NARRATIVE;
}
