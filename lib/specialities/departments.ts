// Випускові кафедри per speciality — transcribed from
// `edu-reference/uhsp-specialnosti-kafedry.html`, itself checked against the
// кафедра pages on uhsp.edu.ua in August 2026.
//
// DISPLAY ONLY. This does not restrict anything. An НПП may recruit a student
// onto any programme in the university and the bonus follows the RECRUITER
// wherever the student ends up studying (confirmed 2026-08-10) — which is why
// `Speciality` carries no `departmentId` and must not gain one. The map exists
// so the «Бонус» column can tell a завідувач whether the students their people
// brought in went onto their OWN кафедра's programmes or somebody else's. Those
// are different pieces of work and the head is the one who has to weigh them.
//
// A constant rather than a table with an editing UI (decided 2026-08-12): it
// moves about once a year, a wrong row is a one-line patch, and a table nobody
// maintains goes stale without anybody noticing.
//
// Six specialities are taught by more than one кафедра, so the value is a list.

/**
 * Speciality → its випускові кафедри.
 *
 * Keys are byte-identical to `SPECIALITY_NORMS_2026`, including the typographic
 * apostrophe in «здоров’я» — the HTML source writes a plain quote there, and a
 * key that does not match the seeded name simply never resolves. A test pins
 * this in both directions.
 */
export const SPECIALITY_DEPARTMENTS: Readonly<Record<string, readonly string[]>> = {
  // ── ФГОСТ ──
  Журналістика: ['Кафедра соціальних комунікацій, документознавства та інформаційної діяльності'],
  'Інформаційна, бібліотечна та архівна справа': [
    'Кафедра соціальних комунікацій, документознавства та інформаційної діяльності',
  ],
  'Історія та археологія': [
    'Кафедра історії і культури України та спеціальних історичних дисциплін',
    'Кафедра загальної історії, правознавства і методик навчання',
  ],
  'Середня освіта (історія)': [
    'Кафедра загальної історії, правознавства і методик навчання',
    'Кафедра історії і культури України та спеціальних історичних дисциплін',
  ],
  'Професійна освіта (документознавство)': [
    'Кафедра соціальних комунікацій, документознавства та інформаційної діяльності',
  ],
  'Професійна освіта (видавничо-поліграфічна справа)': [
    'Кафедра соціальних комунікацій, документознавства та інформаційної діяльності',
  ],
  // Кафедра цифрових технологій навчання provides much of the teaching but is
  // not випускова for THIS programme, so it is not here — the question this map
  // answers is «whose programme did the student enrol on», not «who taught
  // them». It is випускова for «Комп'ютерні науки», at the foot of this list.
  'Професійна освіта (цифрові технології)': [
    'Кафедра соціальних комунікацій, документознавства та інформаційної діяльності',
  ],
  // Both are випускові: the master's sits on the first, the bachelor's ОП on
  // the second.
  'Публічне управління та адміністрування': [
    'Кафедра публічного управління та адміністрування',
    'Кафедра політології та журналістики',
  ],
  Політологія: ['Кафедра політології та журналістики'],

  // ── ФПО ──
  'Середня освіта (біологія та здоров’я людини)': [
    'Кафедра здоров’я і безпеки життєдіяльності',
    'Кафедра природничих дисциплін і методики навчання',
  ],
  'Середня освіта (природничі науки)': ['Кафедра природничих дисциплін і методики навчання'],
  'Середня освіта (географія)': ['Кафедра екології, географії і методики навчання'],

  // ── СПФ ──
  'Освітні, педагогічні науки': ['Кафедра освітології та педагогічної інноватики'],
  'Середня освіта (захист України)': ['Кафедра освітології та педагогічної інноватики'],
  'Дошкільна освіта': ['Кафедра психології і педагогіки дошкільної освіти'],
  'Соціальна робота': ['Кафедра соціальної педагогіки і соціальної роботи'],
  Філософія: ['Кафедра філософії і соціальної антропології імені професора І. П. Стогнія'],
  // 053 is split across two факультети by ОП, not by level — both are випускові.
  Психологія: ['Кафедра психології', 'Кафедра практичної психології'],

  // ── ФММПП ──
  Менеджмент: ['Кафедра менеджменту'],
  'Початкова освіта': ['Кафедра педагогіки, теорії і методики початкової освіти'],
  'Середня освіта (музичне мистецтво)': ['Кафедра мистецької освіти і візуально-музичних практик'],
  'Середня освіта (образотворче мистецтво)': [
    'Кафедра мистецької освіти і візуально-музичних практик',
  ],

  // ── ФТМО ──
  'Середня освіта (математика)': ['Кафедра математики, інформатики і методики навчання'],
  'Середня освіта (інформатика)': ['Кафедра математики, інформатики і методики навчання'],
  'Середня освіта (трудове навчання і технології)': [
    'Кафедра теорії і методики технологічної освіти та комп’ютерної графіки',
  ],
  'Професійна освіта (охорона праці)': ['Кафедра теорії та методики професійної підготовки'],
  'Професійна освіта (транспорт)': ['Кафедра теорії та методики професійної підготовки'],

  // ── ФУІФ ──
  // Випускова is the лінгвістика кафедра; Кафедра української і зарубіжної
  // літератури carries the літературний блок and is deliberately not listed.
  'Середня освіта (українська мова і література)': [
    'Кафедра української лінгвістики та методики навчання',
  ],
  'Середня освіта (іноземна мова і література)': [
    'Кафедра іноземної філології, перекладу та методики навчання',
  ],
  'Філологія (переклад)': ['Кафедра іноземної філології, перекладу та методики навчання'],

  // ── ФФКСЗ ──
  'Фізична культура і спорт': [
    'Кафедра теорії та методики фізичного виховання і спорту',
    'Кафедра спортивних дисциплін і туризму',
    'Кафедра спортивних ігор',
  ],
  'Середня освіта (фізична культура)': [
    'Кафедра теорії та методики фізичного виховання і спорту',
    'Кафедра спортивних дисциплін і туризму',
  ],

  // ── ФФЕПО ──
  Економіка: ['Кафедра економіки'],
  'Фінанси, банківська справа та страхування': ['Кафедра фінансів'],
  'Облік і оподаткування': ['Кафедра обліку, оподаткування та бізнес-управління'],
  'Професійна освіта (товарознавство)': ['Кафедра професійної освіти'],
  'Професійна освіта (сфера обслуговування)': ['Кафедра професійної освіти'],
  'Туризм і рекреація': ['Кафедра професійної освіти'],

  // ── Confirmed by the owner, 2026-08-18 ───────────────────────────────────
  //
  // These two sat empty because `uhsp-specialnosti-kafedry.html` names no
  // випускова кафедра for either, and a guess here is worse than silence: a
  // wrong кафедра tells a завідувач their people recruited for somebody else,
  // while an empty list makes `specialityOrigin` answer `unknown` and the
  // screen say so. The file recorded both guesses and waited; the owner has
  // now confirmed each, and both match.
  //
  // «Музичне мистецтво» is додаток 5's name for what the owner calls «музична
  // освіта» — the performer's degree under ФММПП, distinct from «Середня освіта
  // (музичне мистецтво)» above, which the same кафедра also graduates.
  "Комп'ютерні науки": ['Кафедра цифрових технологій навчання'],
  'Музичне мистецтво': ['Кафедра мистецької освіти і візуально-музичних практик'],
};

/**
 * The name as it is compared, never as it is shown.
 *
 * A кафедра is renamed on /departments, typed with a straight apostrophe in one
 * place and a typographic one in another, and sometimes recorded without the
 * word «кафедра» at all. All three are the same кафедра, and a lookup that
 * misses turns every chip gray for no reason a user could act on.
 */
export function normaliseDepartmentName(name: string): string {
  // Order matters: the «кафедра» prefix is stripped LAST, because the anchor
  // only matches once the leading whitespace is gone.
  return name
    .toLowerCase()
    .replace(/[’'`ʼ‘]/g, '’')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^кафедра\s+/, '');
}

/** Every кафедра the довідник knows, normalised */
const KNOWN_DEPARTMENTS: ReadonlySet<string> = new Set(
  Object.values(SPECIALITY_DEPARTMENTS).flatMap((names) => names.map(normaliseDepartmentName))
);

/** Is this кафедра in the довідник at all? */
export function isKnownDepartment(departmentName: string): boolean {
  return KNOWN_DEPARTMENTS.has(normaliseDepartmentName(departmentName));
}

/**
 * Where a recruited student's speciality sits relative to one кафедра.
 *
 * `unknown` is a real third answer, not a fallback we tolerate. The demo dataset
 * invents кафедри that no довідник has ever heard of, and so will any university
 * that reorganises before this file is updated. Reporting those as `other` would
 * tell a head their people recruit for strangers, which is a claim we cannot
 * support — `unknown` says we do not know, and the screen says so too.
 */
export type SpecialityOrigin = 'own' | 'other' | 'unknown';

export function specialityOrigin(departmentName: string, speciality: string): SpecialityOrigin {
  if (!isKnownDepartment(departmentName)) return 'unknown';

  const owners = SPECIALITY_DEPARTMENTS[speciality];
  if (!owners) return 'unknown';

  const own = normaliseDepartmentName(departmentName);
  return owners.some((name) => normaliseDepartmentName(name) === own) ? 'own' : 'other';
}

/** Every speciality this кафедра is a випускова кафедра for */
export function specialitiesOf(departmentName: string): string[] {
  const own = normaliseDepartmentName(departmentName);
  return Object.entries(SPECIALITY_DEPARTMENTS)
    .filter(([, owners]) => owners.some((name) => normaliseDepartmentName(name) === own))
    .map(([speciality]) => speciality);
}
