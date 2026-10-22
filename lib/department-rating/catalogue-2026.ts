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
