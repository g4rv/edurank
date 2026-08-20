// GENERATED from edu-reference/УГСП_Дані.xlsx — do not hand-edit.
//
// The university's real structure: 8 факультети and
// 31 кафедри, used by the pre-production seed so the demo
// stands on the same tree the real import will produce.
//
// THIRTY-ONE, from a source that shows thirty-two twice. Both extras were
// checked row by row and neither is a кафедра:
//
//   «Кафедри» sheet, row 32 — «Проректор», Дудар В.Л., with no факультет and
//   no завідувач. A post, not a кафедра; the Google Sheets pipeline needed a
//   row to hang the проректор's data on and put it in this table.
//
//   «НПП» sheet — «Музичного мистецтва і методики навчання», on ONE person
//   (Губар М.Г.), whose row sits between three colleagues filed under
//   «Мистецької освіти і візуально-музичних практик». That кафедра has ten
//   others; this name has no завідувач, no факультет and no second person, and
//   appears nowhere on the «Кафедри» sheet. Read as the кафедра's former name
//   left on one row after a rename — CONFIRM before the real import, because if
//   it is wrong Губар lands on the wrong кафедра.
//
// Names carry their «Факультет» / «Кафедра» prefix, which the source sheet
// omits. Every screen renders the bare value as a noun phrase — «Розподіл
// ставок — Кафедра біології» — and without the prefix those read as fragments.
// Matching is unaffected: `normaliseDepartmentName` strips it.
//
// Four names follow `edu-reference/new_deps.docx` (2026-08-20), the university's
// own restructuring document, which is newer than the website these used to
// follow. Where the two disagree, the document wins:
//
//   математики, інформатики ТА методики    (site said «і»)
//   української лінгвістики І методики     (site said «та»)
//   І.П.Стогнія                            (site spaced it «І. П.»)
//   Кафедра ФІЗИЧНОЇ РЕАБІЛІТАЦІЇ, здоров’я і безпеки життєдіяльності
//
// `normaliseDepartmentName` forgives case, apostrophes and the prefix but NOT
// «і» against «та», so a кафедра spelled the other way is `unknown` to
// `specialityOrigin` and its завідувач sees every випускова-кафедра chip go
// gray with nothing to click. The довідник in lib/specialities/departments.ts
// therefore had to move in the same commit, and a test pins all 31 against it.
//
// The document also REGROUPS the факультети — 8 become 6 plus a навчально-
// науковий інститут, and 26 кафедри change parent. That half is deliberately
// NOT applied yet (owner, 2026-08-20): the кафедра names are what the roster
// and the 2025 folders are matched on, and the факультет is only a heading.

export const FACULTIES: readonly { name: string; short: string }[] = [
  { name: 'Факультет соціально-психологічний', short: 'СП' },
  { name: 'Факультет гуманітарної освіти і соціальних технологій', short: 'ГОСТ' },
  { name: 'Факультет мистецтва, менеджменту, педагогіки і психології', short: 'ММПП' },
  { name: 'Факультет природничої освіти', short: 'ПО' },
  { name: 'Факультет технологічної і математичної освіти', short: 'ТМО' },
  { name: 'Факультет української та іноземної філології', short: 'УІФ' },
  { name: "Факультет фізичної культури, спорту і здоров'я", short: 'ФКСЗ' },
  { name: 'Факультет фінансово-економічної і професійної освіти', short: 'ФЕПО' },
];

export const DEPARTMENTS: readonly { name: string; faculty: string }[] = [
  { name: 'Кафедра політології та журналістики', faculty: 'ГОСТ' },
  { name: 'Кафедра публічного управління та адміністрування', faculty: 'ГОСТ' },
  {
    name: 'Кафедра історії і культури України та спеціальних історичних дисциплін',
    faculty: 'ГОСТ',
  },
  { name: 'Кафедра загальної історії, правознавства і методик навчання', faculty: 'ГОСТ' },
  {
    name: 'Кафедра соціальних комунікацій, документознавства та інформаційної діяльності',
    faculty: 'ГОСТ',
  },
  { name: 'Кафедра цифрових технологій навчання', faculty: 'ГОСТ' },
  { name: 'Кафедра педагогіки, теорії і методики початкової освіти', faculty: 'ММПП' },
  { name: 'Кафедра мистецької освіти і візуально-музичних практик', faculty: 'ММПП' },
  { name: 'Кафедра практичної психології', faculty: 'ММПП' },
  { name: 'Кафедра менеджменту', faculty: 'ММПП' },
  { name: 'Кафедра екології, географії і методики навчання', faculty: 'ПО' },
  { name: 'Кафедра природничих дисциплін і методики навчання', faculty: 'ПО' },
  { name: 'Кафедра фізичної реабілітації, здоров’я і безпеки життєдіяльності', faculty: 'ПО' },
  { name: 'Кафедра психології і педагогіки дошкільної освіти', faculty: 'СП' },
  { name: 'Кафедра психології', faculty: 'СП' },
  { name: 'Кафедра соціальної педагогіки і соціальної роботи', faculty: 'СП' },
  { name: 'Кафедра освітології та педагогічної інноватики', faculty: 'СП' },
  {
    name: 'Кафедра філософії і соціальної антропології імені професора І.П.Стогнія',
    faculty: 'СП',
  },
  { name: 'Кафедра математики, інформатики та методики навчання', faculty: 'ТМО' },
  {
    name: 'Кафедра теорії і методики технологічної освіти та комп’ютерної графіки',
    faculty: 'ТМО',
  },
  { name: 'Кафедра теорії та методики професійної підготовки', faculty: 'ТМО' },
  { name: 'Кафедра української і зарубіжної літератури та методики навчання', faculty: 'УІФ' },
  { name: 'Кафедра української лінгвістики і методики навчання', faculty: 'УІФ' },
  { name: 'Кафедра іноземної філології, перекладу та методики навчання', faculty: 'УІФ' },
  { name: 'Кафедра професійної освіти', faculty: 'ФЕПО' },
  { name: 'Кафедра економіки', faculty: 'ФЕПО' },
  { name: 'Кафедра фінансів', faculty: 'ФЕПО' },
  { name: 'Кафедра обліку, оподаткування та бізнес-управління', faculty: 'ФЕПО' },
  { name: 'Кафедра теорії та методики фізичного виховання і спорту', faculty: 'ФКСЗ' },
  { name: 'Кафедра спортивних дисциплін і туризму', faculty: 'ФКСЗ' },
  { name: 'Кафедра спортивних ігор', faculty: 'ФКСЗ' },
];
