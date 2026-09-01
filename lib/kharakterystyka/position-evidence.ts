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
  select,
  text,
  url,
} from '@/lib/rating/evidence-fields';
import type { EvidenceField } from '@/lib/rating/evidence-fields';

const DEGREE_OPTIONS = [
  opt('doctor', 'доктор наук'),
  opt('phd', 'доктор філософії (кандидат наук)'),
];

/** Position number → the fields its typed rows ask for */
export const POSITION_EVIDENCE: Record<number, readonly EvidenceField[]> = {
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
  // `hasFiveAuthorSheets` checks on a RATING row. A typed row carries no such
  // check — see the note in `build.ts` — but the numbers are asked for anyway,
  // so whoever reads the document can do the division themselves.
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
    number('pages', 'Кількість сторінок', { min: 1, int: true, optional: true }),
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
    number('fromYear', 'Рік початку', { min: 1950, int: true }),
    number('toYear', 'Рік завершення', { min: 1950, int: true }),
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
    number('hours', 'Кількість аудиторних годин', { min: 1, int: true }),
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
    select('option', 'Вид', [
      opt('olympiad_winner', 'керівництво школярем — призером учнівської олімпіади'),
      opt('man_winner', 'керівництво школярем — призером конкурсу-захисту МАН'),
      opt('olympiad_jury', 'участь у журі учнівської олімпіади'),
      opt('man_jury', 'участь у журі конкурсу-захисту МАН'),
    ]),
    select('stage', 'Етап', [
      opt('stage_3', 'III етап'),
      opt('stage_4', 'IV етап'),
      opt('man_stage_2', 'II етап (МАН)'),
      opt('man_stage_3', 'III етап (МАН)'),
    ]),
    text('event', 'Навчальний предмет / назва заходу'),
    text('pupil', 'ПІБ школяра', { optional: true }),
    text('place', 'Призове місце', { optional: true }),
  ],

  19: [
    text('title', "Назва об'єднання"),
    text('role', 'Роль / статус', { optional: true }),
    text('period', 'Період', { optional: true }),
  ],

  // Кадрові дані, and «крім педагогічної, науково-педагогічної, наукової» —
  // which is exactly what `pedagogicalExperience` on the profile measures, so
  // the profile cannot answer it and never will.
  20: [
    text('organization', 'Назва організації'),
    text('jobTitle', 'Посада'),
    number('fromYear', 'Рік початку', { min: 1950, int: true }),
    number('toYear', 'Рік завершення', { min: 1950, int: true }),
  ],
};

/**
 * The fields a typed row for this position asks for, or an empty list where
 * there is no form at all — п.16–18, the military positions.
 */
export function positionEvidenceFields(position: number): readonly EvidenceField[] {
  return POSITION_EVIDENCE[position] ?? [];
}
