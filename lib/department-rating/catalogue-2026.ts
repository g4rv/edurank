/**
 * Рейтинг кафедри, 2026 — the scored half of the кафедра's report.
 *
 * Seed input only, like `ACTIVITY_TYPES_2026`: the app reads the
 * `DepartmentIndicator` rows, never this list. Labels are the template's own
 * (`edu-reference/department_raiting_template.xlsx`, «Аркуш1» B9:B40).
 *
 * The sheet's column A shows these numbers as dates — Google Sheets read
 * «1.1» as the first of January. Day = item, month = sub-item.
 *
 * Its «Всього» formula leaves out 12.2 (всеукраїнські конференції). Every other
 * row is in it, so that reads as a slip: 12.2 counts here (2026-10-20).
 */

import type { Derivation } from './derivation';

export type DepartmentIndicatorKind = 'HEADING' | 'COUNT' | 'CHOICE';

export interface DepartmentIndicatorDef {
  itemNumber: string;
  label: string;
  kind: DepartmentIndicatorKind;
  /** COUNT: points per unit */
  coefficient?: number;
  /** CHOICE: one of these, or nothing */
  options?: { label: string; points: number }[];
}

const heading = (itemNumber: string, label: string): DepartmentIndicatorDef => ({
  itemNumber,
  label,
  kind: 'HEADING',
});

const count = (itemNumber: string, label: string, coefficient: number): DepartmentIndicatorDef => ({
  itemNumber,
  label,
  kind: 'COUNT',
  coefficient,
});

export const DEPARTMENT_INDICATORS_2026: DepartmentIndicatorDef[] = [
  heading(
    '1',
    'Участь у виконанні міжнародних (всеукраїнських) наукових та освітніх проєктів за якими виграно грант'
  ),
  count('1.1', 'Горизонт, всього одиниць', 50),
  count('1.2', 'Еразмус, всього одиниць', 30),
  count('1.3', 'МОН, всього одиниць', 20),
  heading(
    '2',
    'Підготовка та подання на конкурс міжнародних (всеукраїнських) грантових програм та проєктів'
  ),
  count('2.1', 'Горизонт, всього одиниць', 15),
  count('2.2', 'Еразмус, всього одиниць', 10),
  count('2.3', 'МОН, всього одиниць', 5),
  {
    itemNumber: '3',
    label:
      'Залучення додаткових коштів до спеціального фонду університету за рахунок надання платних послуг',
    kind: 'CHOICE',
    options: [
      { label: '0-10 тис. грн.', points: 10 },
      { label: '10-20 тис. грн.', points: 20 },
      { label: 'більше 20 тис. грн.', points: 30 },
    ],
  },
  count(
    '4',
    'Підготовка науково-дослідних робіт для участі в конкурсі фундаментальних та прикладних досліджень, всього одиниць',
    10
  ),
  count('5', 'Ініціативна тематика кафедри (за умови реєстрації в УкрІНТЕІ), всього одиниць', 3),
  heading('6', 'Опубліковано монографій науково-педагогічними працівниками кафедри, з них'),
  count('6.1', 'в Українських виданнях, всього одиниць', 10),
  count('6.2', 'за кордоном, мовами країн ОЕСР та\\або ЄС, всього одиниць', 20),
  count('6.3', 'тих, що індексуються у Scopus та\\або WoS, всього одиниць', 30),
  heading('7', 'Опубліковано статей науково-педагогічними працівниками кафедри, з них'),
  count(
    '7.1',
    'тих, що індексуються у Scopus та\\або WoS, в наукових журналах з квартилями Q1-Q2, всього одиниць',
    5
  ),
  count(
    '7.2',
    'тих, що індексуються у Scopus та\\або WoS, в наукових журналах з квартилями Q3-Q4, всього одиниць',
    4
  ),
  count('7.3', 'з них у відкритому доступі', 1),
  // Added 2026-11-24 (owner): a publication in a фахове видання of category «Б», 2 points a record
  count('7.4', 'у фахових виданнях України категорії «Б», всього одиниць', 2),
  count(
    '8',
    'Опубліковано науково-педагогічними працівниками кафедри словників, каталогів, довідників та енциклопедій, всього одиниць',
    1
  ),
  count('8.1', 'з них у відкритому доступі', 1),
  count(
    '9',
    'Опубліковано науково-педагогічними працівниками кафедри підручників, навчальних посібників, всього одиниць',
    3
  ),
  count('9.1', 'з них у відкритому доступі', 1),
  count(
    '10',
    'Розміщено НПП кафедри результати навчально-наукової діяльності в Інституційному репозитарії університету, всього одиниць',
    0.5
  ),
  count(
    '11',
    'Опубліковано науково-педагогічними працівниками кафедри публікацій у матеріалах конференцій, які індексуються у Scopus та\\або WoS, всього одиниць',
    2
  ),
  count('11.1', 'з них у відкритому доступі', 1),
  heading(
    '12',
    'Організація та проведення міжнародних (всеукраїнських) наукових конференцій, конкурсів наукових робіт, мистецьких та спортивних заходів'
  ),
  count('12.1', 'міжнародного рівня, всього одиниць', 7),
  count('12.2', 'всеукраїнського рівня, всього одиниць', 5),
  count('12.3', 'інтернет-конференція, всього одиниць', 1),
  count('13.1', "Реєстрація об'єктів інтелектуальної власності", 2),
  count('13.2', 'Реєстрація патентів', 10),
];

/**
 * Which 2026 lines can be counted from the staff's personal entries (owner,
 * 2026-11-16). Seed input only — the app reads `DepartmentIndicator.derivation`.
 *
 * FULL only where the personal entry decides the line exactly. Every other
 * overlap is PARTIAL, and the reason is on its line:
 */
export const DERIVATIONS_2026: Record<string, Derivation> = {
  '5': {
    coverage: 'FULL',
    from: [{ code: 'initiative_topic', keys: [], text: 'title' }],
  },
  // The personal split is the book's LANGUAGE; the report's is where it was
  // published («в Українських виданнях» / «за кордоном»)
  '6.1': {
    coverage: 'PARTIAL',
    from: [{ code: 'monograph_ua', keys: ['isbn'], text: 'bibliography' }],
  },
  '6.2': {
    coverage: 'PARTIAL',
    from: [{ code: 'monograph_eu', keys: ['isbn'], text: 'bibliography' }],
  },
  // Q1/Q2 is Scopus/WoS by definition
  '7.1': {
    coverage: 'FULL',
    from: [
      {
        code: 'publication_cat_a',
        when: { field: 'option', in: ['q1', 'q2'] },
        keys: ['doi', 'link'],
        text: 'bibliography',
      },
    ],
  },
  // 3.8's «Q3-4 / відсутній» was split into «Q3-4» and «відсутній» on
  // 2026-11-17 (`pnpm db:cat-a-quartile`), so this reads Q3-4 alone — and a
  // quartile implies Scopus/WoS, so it is FULL like 7.1 (owner, 2026-11-17).
  '7.2': {
    coverage: 'FULL',
    from: [
      {
        code: 'publication_cat_a',
        when: { field: 'option', in: ['q3_4'] },
        keys: ['doi', 'link'],
        text: 'bibliography',
      },
    ],
  },
  '9': {
    coverage: 'FULL',
    from: [
      {
        code: 'edition_publication',
        when: { field: 'option', in: ['textbook', 'study_guide'] },
        keys: [],
        text: 'bibliography',
      },
    ],
  },
  // The line also covers олімпіади and конкурси nobody enters as an organiser
  '12.1': {
    coverage: 'PARTIAL',
    from: [
      { code: 'intl_conf_organization', keys: [], text: 'title' },
      {
        code: 'cultural_sport_events',
        when: { field: 'option', in: ['international'] },
        keys: [],
        text: 'title',
      },
    ],
  },
  '12.2': {
    coverage: 'PARTIAL',
    from: [
      { code: 'ukr_conf_organization', keys: [], text: 'title' },
      {
        code: 'cultural_sport_events',
        when: { field: 'option', in: ['national'] },
        keys: [],
        text: 'title',
      },
    ],
  },
  '13.1': {
    coverage: 'FULL',
    from: [{ code: 'copyright_registration', keys: ['certificateNumber'], text: 'title' }],
  },
  '13.2': {
    coverage: 'FULL',
    from: [{ code: 'patent_granted', keys: ['registrationNumber'], text: 'title' }],
  },
};
