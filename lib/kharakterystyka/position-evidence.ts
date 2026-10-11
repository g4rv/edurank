// What a hand-typed row for each п.38 position actually asks for.
//
// Before this file every position offered one blank «Дані підтвердження» box,
// so п.15 (школярі) and п.20 (практичний досвід) asked for the same nothing and
// two people recorded the same fact in two shapes. The document is read against
// the Ліцензійні умови, and «Петренко, олімпіада» versus «керував ученицею, ІІІ
// етап, 2 місце» is the difference between a row that answers the position and
// one that only gestures at it.
//
// These are field specs of the SAME kind the rating's indicators carry, so the
// dialog renders them with `components/rating/evidence-fields.tsx`, validates
// them with `schemaForFields`, and prints them with `summarizeEvidence` — the
// generated sentence is the row's `text`, exactly as a rating row's is.
//
// ── What is required, and what is not ────────────────────────────────────────
//
// A typed row usually records an OLD year, from a document that said less than
// we would like. So only what NAMES the achievement is required; the rest is
// optional and simply does not appear in the printed sentence when empty. A
// form that refuses to save until every box is full would send somebody to
// invent a реєстраційний номер.
//
// `select` is used only where the answer is always known — it has no optional
// mode, and a required dropdown nobody can answer is worse than a blank box.
// Everything else that varies (місце, етап on п.14) is optional text.
//
// п.16–18 are absent on purpose: «для вищих військових навчальних закладів» is
// a claim this university may not make, so there is no form to offer.

import {
  BIB_ARTICLE,
  BIB_MONOGRAPH,
  date,
  isbn,
  number,
  opt,
  dateRange,
  select,
  text,
  url,
} from '@/lib/rating/evidence-fields';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import { PAGES_PER_AUTHOR_SHEET } from '@/lib/rating/scoring';

const DEGREE_OPTIONS = [
  opt('doctor', 'доктор наук'),
  opt('phd', 'доктор філософії (кандидат наук)'),
];

/** Position number → the fields its typed rows ask for */
export /**
 * The range a «Рік …» field accepts.
 *
 * These carried a floor of 1950 and nothing above it, so 123123 was a valid
 * year of employment: it saved, and printed into the licence document as «Рік
 * початку: 123123». A floor alone is not a range.
 *
 * The ceiling is **twenty years out**, not the rating window and not today
 * (owner, 2026-09-14). п.20 asks for practical work that may have ended long
 * before the window opened, and an end year can legitimately sit in the future
 * — an appointment someone still holds, a contract with a term. What it refuses
 * is a year outside any plausible working life: 123123 saved before this and
 * printed into a licence document as a year of employment.
 */
const LATEST_YEAR = new Date().getFullYear() + 20;

const POSITION_EVIDENCE: Record<number, readonly EvidenceField[]> = {
  // ≥5 публікацій у фахових виданнях / Scopus / WoS. No quartile: the licence
  // asks only that the publication be in one of those lists, and a quartile the
  // rating uses for points would be a box nobody can answer for a 2022 article.
  1: [
    text('bibliography', 'Бібліографічний опис', {
      multiline: true,
      placeholder: BIB_ARTICLE,
    }),
    url('link', 'Посилання (DOI, Scopus, WoS)', { optional: true }),
  ],

  // Which of the three bars it answers is the row's `group`, asked separately —
  // it decides the threshold, not the wording. See `positionChoices`.
  2: [
    text('registrationNumber', 'Номер'),
    text('title', 'Назва'),
    date('date', 'Дата реєстрації', { optional: true }),
  ],

  // The law's «не менше 5 авторських аркушів (≥1,5 на співавтора)» is what
  // `hasFiveAuthorSheets` checks on a RATING row, and `positionRowProblem` checks
  // the same two bars on a typed one — the pages are required, so it always can.
  3: [
    select('option', 'Вид видання', [
      opt('textbook', 'підручник'),
      opt('study_guide', 'навчальний посібник'),
      opt('monograph', 'монографія'),
    ]),
    text('bibliography', 'Бібліографічний опис', {
      multiline: true,
      placeholder: BIB_MONOGRAPH,
    }),
    // Required (owner, 2026-10-12): the volume IS the condition — 5 author sheets,
    // 1,5 per co-author — and a row that may skip it proves nothing. The rating's
    // own rows already fail without pages. Co-authors stay optional: empty is a
    // sole author.
    number('pages', 'Кількість сторінок', { min: 1, int: true }),
    number('coAuthors', 'Кількість співавторів', { min: 1, int: true, optional: true }),
    isbn('isbn', 'ISBN', { optional: true }),
  ],

  4: [
    select('option', 'Вид праці', [
      opt('methodical_guide', 'навчально-методичний посібник'),
      opt('self_study_guide', 'посібник для самостійної роботи'),
      opt('lecture_notes', 'конспект лекцій'),
      opt('practicum', 'практикум'),
      opt('recommendations', 'методичні вказівки (рекомендації)'),
      opt('work_program', 'робоча програма'),
      opt('online_course', 'електронний курс на освітній платформі'),
    ]),
    text('title', 'Назва'),
    url('link', 'Посилання', { optional: true }),
  ],

  // Normally the profile answers this one — `defencePosition` reads
  // `degreeDefenceDate`. A typed row is the fallback for a defence the profile
  // does not carry; the date is required because the position turns on it
  // falling inside the five-year window.
  5: [
    select('option', 'Науковий ступінь', DEGREE_OPTIONS),
    date('date', 'Дата захисту'),
    text('specialty', 'Шифр і назва спеціальності', { optional: true }),
    text('topic', 'Тема дисертації', { optional: true }),
  ],

  6: [
    select('option', 'Ступінь здобувача', DEGREE_OPTIONS),
    text('candidate', 'ПІБ здобувача'),
    text('topic', 'Тема дисертації', { optional: true }),
    date('date', 'Дата присудження', { optional: true }),
  ],

  7: [
    select('option', 'Роль', [
      opt('opponent', 'офіційний опонент'),
      opt('head', 'голова ради'),
      opt('deputy_or_secretary', 'заступник / вчений секретар'),
      opt('member', 'член постійної спеціалізованої ради'),
      opt('one_time_member', 'член разової спеціалізованої ради'),
    ]),
    text('council', 'Назва / шифр ради'),
    text('candidate', 'ПІБ здобувача', { optional: true }),
    date('date', 'Дата', { optional: true }),
  ],

  8: [
    select('option', 'Роль', [
      opt('topic_leader', 'науковий керівник теми (проєкту)'),
      opt('topic_executor', 'відповідальний виконавець теми (проєкту)'),
      opt('editor_in_chief', 'головний редактор наукового видання'),
      opt('editorial_member', 'член редакційної колегії'),
      opt('reviewer', 'експерт (рецензент) наукового видання'),
    ]),
    text('title', 'Назва теми або видання'),
    text('registrationNumber', 'Номер держреєстрації', { optional: true }),
    url('link', 'Посилання', { optional: true }),
  ],

  9: [
    select('option', 'Вид участі', [
      opt('mon_commission', 'комісія (експертна рада) МОН'),
      opt('nazyavo_council', 'галузева експертна рада НАЗЯВО'),
      opt('accreditation_commission', 'Акредитаційна комісія'),
      opt('nfdu_or_state', 'комісія НФДУ або іншого органу державної влади'),
      opt('methodical_council', 'Науково-методична рада'),
      opt('quality_service', 'комісія Державної служби якості освіти'),
    ]),
    text('basis', 'Наказ / підстава'),
    date('date', 'Дата', { optional: true }),
  ],

  10: [
    select('option', 'Вид', [
      opt('project', 'участь у міжнародному науковому / освітньому проєкті'),
      opt('expertise', 'залучення до міжнародної експертизи'),
      opt('judge', 'звання «суддя міжнародної категорії»'),
    ]),
    text('title', 'Назва проєкту / програми'),
    text('role', 'Роль', { optional: true }),
    url('link', 'Посилання', { optional: true }),
  ],

  // «не менше трьох років» is the law's own condition, and nothing checks it
  // for a typed row — the two year fields are what makes it readable at a
  // glance, which is the most a hand-typed claim can offer.
  11: [
    text('organization', 'Назва установи / організації'),
    text('basis', 'Договір / підстава'),
    // One range, not two ends (owner, 2026-09-14): a picker that writes them in
    // order cannot produce «2019 → 2014», which two independent fields let
    // through however they were validated.
    dateRange('period', 'Період роботи'),
    url('link', 'Посилання', { optional: true }),
  ],

  12: [
    select('option', 'Вид публікації', [
      opt('approbation', 'апробаційна'),
      opt('popular', 'науково-популярна'),
      opt('advisory', 'консультаційна (дорадча)'),
      opt('expert', 'науково-експертна'),
    ]),
    text('bibliography', 'Бібліографічний опис', {
      multiline: true,
      placeholder: BIB_ARTICLE,
    }),
    url('link', 'Посилання', { optional: true }),
  ],

  // The hours matter: indicator 2.3 counts from 30, the licence asks 50. The
  // note beside the position says so, and this is the box that answers it.
  13: [
    text('discipline', 'Дисципліна'),
    text('language', 'Мова викладання'),
    // 50, as the licence asks (owner, 2026-10-12): a typed row is the licence's
    // own claim, so it carries the licence's bar, not the rating's 30.
    number('hours', 'Кількість аудиторних годин', { min: 50, int: true }),
    text('program', 'Освітня програма', { optional: true }),
  ],

  14: [
    select('option', 'Вид', [
      opt('olympiad_winner', 'керівництво студентом — призером олімпіади'),
      opt('contest_winner', 'керівництво студентом — призером конкурсу наукових робіт'),
      opt('jury', 'робота в оргкомітеті / журі'),
      opt('circle_lead', 'керівництво науковим гуртком / проблемною групою'),
      opt('art_sport_winner', 'керівництво призером мистецького / спортивного конкурсу'),
    ]),
    text('event', 'Назва заходу'),
    text('student', 'ПІБ студента', { optional: true }),
    text('stage', 'Етап', { optional: true }),
    text('place', 'Призове місце', { optional: true }),
  ],

  // No indicator will ever reach this one — the catalogue moves by a вчена рада
  // vote and they declined to add one (2026-08-07). Every row here is typed, so
  // it is the position that most needs a form worth the name.
  15: [
    // **Order and grouping are the owner's** (2026-09-14): who the школяр is,
    // what you did, how far they got and where they placed, what the subject
    // was — and the year last, because it is the one answer already filled in.
    // All three obligatory (owner, 2026-09-14). `cyrillicName` is what keeps
    // «фів» and «asdawdsad» out of a licence document.
    text('pupilLast', 'Прізвище', {
      join: 'pupil',
      joinLabel: 'Дані про школяра',
      rule: 'cyrillicName',
    }),
    text('pupilFirst', 'Ім’я', { join: 'pupil', rule: 'cyrillicName' }),
    text('pupilMiddle', 'По батькові', { join: 'pupil', rule: 'cyrillicName' }),
    select('option', 'Вид', [
      opt('olympiad_winner', 'керівництво школярем — призером учнівської олімпіади'),
      opt('man_winner', 'керівництво школярем — призером конкурсу-захисту МАН'),
      opt('olympiad_jury', 'участь у журі учнівської олімпіади'),
      opt('man_jury', 'участь у журі конкурсу-захисту МАН'),
    ]),
    // Half-width each, so the two sit on one line. A select is full-width by
    // default because its options are usually sentences; these are four short
    // words apiece.
    select(
      'stage',
      'Етап',
      [
        opt('stage_3', 'III етап'),
        opt('stage_4', 'IV етап'),
        opt('man_stage_2', 'II етап (МАН)'),
        opt('man_stage_3', 'III етап (МАН)'),
      ],
      { span: 1 }
    ),
    select(
      'place',
      'Призове місце',
      [
        opt('first', 'I місце'),
        opt('second', 'II місце'),
        opt('third', 'III місце'),
        opt('laureate', 'лауреат'),
      ],
      { span: 1 }
    ),
    // No-break spaces on BOTH sides of the pair, leaving the slash as the only
    // place the label can wrap: «Навчальний предмет /» then «назва заходу».
    text('event', 'Навчальний предмет / назва заходу', { span: 2 }),
  ],

  19: [
    text('title', "Назва об'єднання"),
    text('role', 'Роль / статус', { optional: true }),
    // The same picker as п.11 and п.20 (owner, 2026-10-10). Free text let «2019
    // - зараз» and «з 2019 р.» into a licence document in three shapes.
    dateRange('period', 'Період участі', { optional: true }),
  ],

  // Кадрові дані, and «крім педагогічної, науково-педагогічної, наукової» —
  // which is exactly what `pedagogicalExperience` on the profile measures, so
  // the profile cannot answer it and never will.
  20: [
    text('organization', 'Назва організації'),
    text('jobTitle', 'Посада'),
    // One range, not two ends (owner, 2026-09-14): a picker that writes them in
    // order cannot produce «2019 → 2014», which two independent fields let
    // through however they were validated.
    dateRange('period', 'Період роботи'),
  ],
};

/**
 * The fields a typed row for this position asks for, or an empty list where
 * there is no form at all — п.16–18, the military positions.
 */
export function positionEvidenceFields(position: number): readonly EvidenceField[] {
  return POSITION_EVIDENCE[position] ?? [];
}

/**
 * Positions whose own text sets a minimum LENGTH for the period (owner,
 * 2026-10-12: «не менше трьох років» accepted a single month). п.19 has no such
 * condition; п.11 asks three years and п.20 five.
 */
const MIN_PERIOD_YEARS: Record<number, number> = { 11: 3, 20: 5 };

/** «з 01.10.2023 до 30.09.2026» is three years — the end day counts */
function spansYears(from: string, to: string, years: number): boolean {
  // A value that is no date is the field schema's to refuse, not this rule's:
  // refinements run even when a field failed, and must not throw on its junk.
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!day.test(from) || !day.test(to)) return true;
  const [y, m, d] = from.split('-').map(Number);
  // The day the span would end on, inclusive: the same date `years` later, less a day.
  const limit = new Date(Date.UTC(y + years, m - 1, d - 1)).toISOString().slice(0, 10);
  return to >= limit;
}

const yearsWord = (n: number) => (n === 3 ? 'трьох років' : n === 5 ? 'п’яти років' : `${n} р.`);

/**
 * What a position's own text demands of a typed row that no single field can
 * say — the length of a period, the volume of a book. Null when the row is fine.
 *
 * One function for the form and the action, so the browser and the server
 * cannot disagree. `path` is the field the message belongs under.
 *
 * Only what the row CARRIES is judged: п.3's pages and співавтори are optional
 * (an old book rarely has its volume to hand), and an absent number is not a
 * failing one.
 */
export function positionRowProblem(
  position: number,
  evidence: Record<string, unknown>
): { path: string; message: string } | null {
  const years = MIN_PERIOD_YEARS[position];
  if (years) {
    const range = evidence.period as { from?: string; to?: string } | undefined;
    if (range?.from && range?.to && !spansYears(range.from, range.to, years)) {
      return {
        path: 'period',
        message: `Період має бути не менше ${yearsWord(years)}`,
      };
    }
  }

  if (position === 3) {
    const pages = Number(evidence.pages);
    if (Number.isFinite(pages) && pages > 0) {
      const total = pages / PAGES_PER_AUTHOR_SHEET;
      if (total < 5) {
        return {
          path: 'pages',
          message: `Обсяг має бути не менше 5 авторських аркушів (${5 * PAGES_PER_AUTHOR_SHEET} сторінок)`,
        };
      }
      const coAuthors = Number(evidence.coAuthors);
      if (Number.isFinite(coAuthors) && coAuthors > 1 && total / coAuthors < 1.5) {
        return {
          path: 'coAuthors',
          message: 'На кожного співавтора має припадати не менше 1,5 авторського аркуша',
        };
      }
    }
  }

  return null;
}

/** Does this form ask for a period? Then it does not also ask for a «Рік». */
export function hasPeriodField(fields: readonly EvidenceField[]): boolean {
  return fields.some((f) => f.kind === 'dateRange');
}

/**
 * The «Рік» of a row whose form carries a period: the year the period ENDS,
 * pulled into the window the document covers (owner, 2026-10-10 — a period is
 * enough, asking for the year as well was asking twice).
 *
 * Pulled in, not refused: п.20 is practical work that may have ended before the
 * window opened, and an appointment somebody still holds ends in the future. The
 * row lands on the nearest year the document prints. Null when there is no
 * period to read (п.19's is optional) — the caller keeps its own year.
 */
export function yearFromPeriod(
  fields: readonly EvidenceField[],
  evidence: unknown,
  minYear: number,
  maxYear: number
): number | null {
  const e = (evidence ?? {}) as Record<string, unknown>;
  for (const f of fields) {
    if (f.kind !== 'dateRange') continue;
    const range = e[f.name] as { to?: string; from?: string } | undefined;
    const end = range?.to ?? range?.from;
    if (!end) continue;
    const year = Number(end.slice(0, 4));
    if (!Number.isInteger(year)) continue;
    return Math.min(Math.max(year, minYear), maxYear);
  }
  return null;
}

/**
 * Positions whose one required DATE is the row's year (owner, 2026-10-12): п.5
 * turns on the defence falling inside the window, and a separate «Рік» beside
 * it could say 2025 for a defence in 2010. The year is the date's, and a date
 * outside the window is refused — not pulled in as a period is, because a
 * defence in 2010 does not answer a question about the last five years.
 */
const YEAR_FROM_DATE: Record<number, string> = { 5: 'date' };

/** Does this position take its «Рік» from a field of its own? Then no «Рік» box. */
export function yearIsDerived(position: number, fields: readonly EvidenceField[]): boolean {
  return position in YEAR_FROM_DATE || hasPeriodField(fields);
}

/**
 * The row's year, from the form's own date or period; null when there is
 * nothing to read (п.19's period is optional) and the caller keeps its own.
 * For a date, the year is the date's own — the window is judged by the caller.
 */
export function rowYear(
  position: number,
  fields: readonly EvidenceField[],
  evidence: unknown,
  minYear: number,
  maxYear: number
): number | null {
  const dateField = YEAR_FROM_DATE[position];
  if (dateField) {
    const value = ((evidence ?? {}) as Record<string, unknown>)[dateField];
    const match = typeof value === 'string' ? /^(\d{4})-\d{2}-\d{2}$/.exec(value) : null;
    return match ? Number(match[1]) : null;
  }
  return yearFromPeriod(fields, evidence, minYear, maxYear);
}

/** What п.5 says when the defence is outside the window — the date, not a «Рік» */
export function defenceWindowMessage(from: number, to: number): string {
  return `Захист має бути в межах ${from}–${to} років`;
}

/** The position-5 half of the row's judgement, which needs the window */
export function defenceProblem(
  position: number,
  evidence: Record<string, unknown>,
  from: number,
  to: number
): { path: string; message: string } | null {
  if (position !== 5) return null;
  const year = rowYear(5, [], evidence, from, to);
  if (year === null) return null;
  return year < from || year > to
    ? { path: 'date', message: defenceWindowMessage(from, to) }
    : null;
}
