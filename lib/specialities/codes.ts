// Коди галузей знань і спеціальностей.
//
// Ukraine replaced the numeric перелік with a letter-coded one:
//
//   постанова КМУ № 1021 від 2024-09-06, чинний з 2024-11-01
//   https://zakon.rada.gov.ua/laws/show/1021-2024-п
//
// So «014.03 Середня освіта (Історія)» is now «A4.03». The BRANCH and the
// SPECIALITY are renamed (014 → A4); the предметна спеціальність keeps its old
// number (.03), which is the rule this file encodes and the reason a legacy
// code is worth keeping beside the new one rather than being thrown away.
//
// Sub-numbers come from:
//   наказ МОН № 260 від 2024-03-04 (z0405-24) — 014.xx and 015.xx
//   https://zakon.rada.gov.ua/laws/show/z0405-24
//
// ─────────────────────────────────────────────────────────────────────────────
// NOT YET CONFIRMED BY THE UNIVERSITY. Every row below was read off the two
// laws above and matched to our own speciality names by hand. The names in
// `SPECIALITY_NORMS_2026` are the university's, not the law's, and five of them
// no longer have an equivalent at all (see `note`). Have somebody check this
// table once before it appears on a printed document.
// ─────────────────────────────────────────────────────────────────────────────

/** Галузь знань — the letter that starts every code */
export const KNOWLEDGE_BRANCHES = {
  A: 'Освіта',
  B: 'Культура, мистецтво та гуманітарні науки',
  C: 'Соціальні науки, журналістика та інформація',
  D: 'Бізнес, адміністрування та право',
  E: 'Природничі науки, математика та статистика',
  F: 'Інформаційні технології',
  G: 'Інженерія, виробництво та будівництво',
  H: 'Сільське, лісове, рибне господарство та ветеринарна медицина',
  I: 'Охорона здоров’я та соціальне забезпечення',
  J: 'Транспорт та послуги',
  K: 'Безпека та оборона',
} as const;

export type BranchLetter = keyof typeof KNOWLEDGE_BRANCHES;

export interface SpecialityCodes {
  /** Постанова 1021-2024, e.g. «A4.03». Null where nothing maps — see `note` */
  code: string | null;
  /** The code the university's own paperwork still carries, e.g. «014.03» */
  legacy: string | null;
  /** Only set when `code` is null: why there is no new code */
  note?: string;
}

/** The 2024 renumbering merged most of 015; only these two survive as-is */
const MERGED_IN_2024 =
  'Спеціалізацію об’єднано під час перенумерації 015 у 2024 році — відповідника немає';

/**
 * Our 38 specialities, keyed by the name they are seeded and matched under.
 *
 * Keyed by name rather than by code because the name is what a `StudentClaim`
 * points at and what the вчена рада's додаток 5 prints. Names here must stay
 * byte-identical to `SPECIALITY_NORMS_2026` in lib/stake/norms.ts.
 */
export const SPECIALITY_CODES: Readonly<Record<string, SpecialityCodes>> = {
  // ── A. Освіта ──
  'Освітні, педагогічні науки': { code: 'A1', legacy: '011' },
  'Дошкільна освіта': { code: 'A2', legacy: '012' },
  'Початкова освіта': { code: 'A3', legacy: '013' },
  'Фізична культура і спорт': { code: 'A7', legacy: '017' },

  // A4 — Середня освіта. The suffix is the предметна спеціальність, unchanged
  // from the numeric перелік, which is what makes «A4.03» readable to anybody
  // who knew «014.03».
  'Середня освіта (українська мова і література)': { code: 'A4.01', legacy: '014.01' },
  'Середня освіта (іноземна мова і література)': { code: 'A4.02', legacy: '014.02' },
  'Середня освіта (історія)': { code: 'A4.03', legacy: '014.03' },
  'Середня освіта (математика)': { code: 'A4.04', legacy: '014.04' },
  'Середня освіта (біологія та здоров’я людини)': { code: 'A4.05', legacy: '014.05' },
  'Середня освіта (географія)': { code: 'A4.07', legacy: '014.07' },
  'Середня освіта (інформатика)': { code: 'A4.09', legacy: '014.09' },
  'Середня освіта (трудове навчання і технології)': { code: 'A4.10', legacy: '014.10' },
  'Середня освіта (фізична культура)': { code: 'A4.11', legacy: '014.11' },
  'Середня освіта (образотворче мистецтво)': { code: 'A4.12', legacy: '014.12' },
  'Середня освіта (музичне мистецтво)': { code: 'A4.13', legacy: '014.13' },
  'Середня освіта (природничі науки)': { code: 'A4.15', legacy: '014.15' },
  'Середня освіта (захист України)': { code: 'A4.16', legacy: '014.16' },

  // A5 — Професійна освіта. The 2024 наказ renumbered the спеціалізації to
  // 015.31–015.39 and merged most of the older ones; only two of our seven
  // survive with a direct equivalent.
  'Професійна освіта (транспорт)': { code: 'A5.38', legacy: '015.38' },
  'Професійна освіта (цифрові технології)': { code: 'A5.39', legacy: '015.39' },
  'Професійна освіта (сфера обслуговування)': { code: null, legacy: '015', note: MERGED_IN_2024 },
  'Професійна освіта (товарознавство)': { code: null, legacy: '015', note: MERGED_IN_2024 },
  'Професійна освіта (документознавство)': { code: null, legacy: '015', note: MERGED_IN_2024 },
  'Професійна освіта (видавничо-поліграфічна справа)': {
    code: null,
    legacy: '015',
    note: MERGED_IN_2024,
  },
  'Професійна освіта (охорона праці)': { code: null, legacy: '015', note: MERGED_IN_2024 },

  // ── B. Культура, мистецтво та гуманітарні науки ──
  'Історія та археологія': { code: 'B9', legacy: '032' },
  Філософія: { code: 'B10', legacy: '033' },
  // «(переклад)» is the university's own specialisation label; B11 has no
  // official sub-code for it, so the code stops at the speciality.
  'Філологія (переклад)': { code: 'B11', legacy: '035' },
  'Інформаційна, бібліотечна та архівна справа': { code: 'B13', legacy: '029' },

  // ── C. Соціальні науки, журналістика та інформація ──
  Економіка: { code: 'C1', legacy: '051' },
  Політологія: { code: 'C2', legacy: '052' },
  Психологія: { code: 'C4', legacy: '053' },
  Журналістика: { code: 'C7', legacy: '061' },

  // ── D. Бізнес, адміністрування та право ──
  'Облік і оподаткування': { code: 'D1', legacy: '071' },
  'Фінанси, банківська справа та страхування': { code: 'D2', legacy: '072' },
  Менеджмент: { code: 'D3', legacy: '073' },
  'Публічне управління та адміністрування': { code: 'D4', legacy: '281' },

  // ── I. Охорона здоров’я та соціальне забезпечення ──
  // Renamed in 2024: «Соціальна робота та консультування».
  'Соціальна робота': { code: 'I10', legacy: '231' },

  // ── J. Транспорт та послуги ──
  'Туризм і рекреація': { code: 'J3', legacy: '242' },
};

/** The branch letter a code belongs to, or null for «015» / anything unparsable */
export function branchOf(code: string | null | undefined): BranchLetter | null {
  const letter = code?.[0]?.toUpperCase();
  return letter && letter in KNOWLEDGE_BRANCHES ? (letter as BranchLetter) : null;
}

/** «A4.03» → «A4»; «C1» → «C1». The speciality without its предметна частина */
export function baseCode(code: string): string {
  return code.split('.')[0];
}

/**
 * «Середня освіта (історія)» → «Історія».
 *
 * The subject alone, capitalised. Only useful where the parent speciality is
 * already obvious from context — a column of thirteen rows all starting
 * «Середня освіта» wastes the width that the subject actually needs.
 */
export function subjectOf(name: string): string | null {
  const inner = name.match(/\(([^)]+)\)\s*$/)?.[1];
  if (!inner) return null;
  return inner.charAt(0).toUpperCase() + inner.slice(1);
}

export type CodeStyle =
  /** «A4.03» — a column of its own, next to the name */
  | 'code'
  /** «Середня освіта (історія)» — what we have always shown */
  | 'name'
  /** «A4.03 Середня освіта (історія)» — official documents and exports */
  | 'full'
  /** «A4.03 · Історія» — dense tables, where the parent repeats down the column */
  | 'compact'
  /** «014.03 / A4.03» — while both numbers are still in circulation on paper */
  | 'both';

/**
 * One speciality, written for the place it is being shown.
 *
 * The point of having this in one file: «Спеціальність» means a different
 * amount of text in an export, in a picker and in a dense grid, and every
 * screen inventing its own formatting is how two of them end up disagreeing
 * about whether the code comes first.
 */
export function formatSpeciality(name: string, style: CodeStyle = 'name'): string {
  const codes = SPECIALITY_CODES[name];
  const code = codes?.code ?? null;

  switch (style) {
    case 'name':
      return name;
    case 'code':
      return code ?? codes?.legacy ?? '—';
    case 'full':
      return code ? `${code} ${name}` : name;
    case 'compact': {
      const subject = subjectOf(name);
      if (!code) return name;
      return subject ? `${code} · ${subject}` : `${code} ${name}`;
    }
    case 'both': {
      const legacy = codes?.legacy;
      if (code && legacy && !legacy.startsWith('015')) return `${legacy} / ${code}`;
      return code ?? legacy ?? name;
    }
  }
}

/**
 * Sort key that orders by code the way the перелік does.
 *
 * Plain string sort puts «A4.10» before «A4.2» and every uncoded row first, so
 * the letter, the speciality number and the предметна number are compared
 * separately, with uncoded rows pushed to the end where they are noticed.
 */
export function specialityCodeSortKey(name: string): string {
  const code = SPECIALITY_CODES[name]?.code;
  if (!code) return 'ZZZ';
  const [head, tail] = code.split('.');
  const letter = head[0];
  const number = Number(head.slice(1)) || 0;
  const subject = Number(tail) || 0;
  return `${letter}${String(number).padStart(3, '0')}${String(subject).padStart(3, '0')}`;
}
