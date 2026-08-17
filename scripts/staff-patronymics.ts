// По батькові for the people `УГСП_Дані.xlsx` does not carry.
//
// Seventeen of the 294 on the кафедра lists are not in that older sheet at all —
// they joined after it was made — so `build-staff-roster.ts` has nothing to fill
// their patronymic from. These were found on the university's own site
// (2026-08-17) and are keyed by the exact «Прізвище Ім'я» the .docx spells.
//
// **Only `confirmed` entries are applied.** The rest are recorded with what was
// found and why it is not trusted, because a wrong по батькові is worse than a
// missing one: it becomes the person's name on every screen, in the
// Характеристика, and in the Excel the university circulates. Promoting one is a
// single flag once somebody has checked it with the кафедра.

export interface PatronymicEntry {
  /** «Прізвище Ім'я» exactly as the .docx lists it — the join key */
  listedName: string;
  patronymic: string;
  /** Applied only when true */
  confirmed: boolean;
  /** Where it came from, so the next person can re-check it */
  source: string;
  /** Why it is not confirmed, when it is not */
  doubt?: string;
}

export const PATRONYMICS: readonly PatronymicEntry[] = [
  // ── Confirmed: each has its own profile page on uhsp.edu.ua, and the URL
  // itself spells the patronymic, so there is nothing to infer. ──
  {
    listedName: 'Луцик Оксана',
    patronymic: 'Олександрівна',
    confirmed: true,
    source: 'uhsp.edu.ua/personnel/luczyk-oksana-oleksandrivna/',
  },
  {
    listedName: 'Висовень Оксана',
    patronymic: 'Іванівна',
    confirmed: true,
    source: 'uhsp.edu.ua/personnel/vysoven-oksana-ivanivna/',
  },
  {
    // Also завідувач of this кафедра — worth setting as `headId` at import.
    listedName: 'Мізін Костянтин',
    patronymic: 'Іванович',
    confirmed: true,
    source: 'uhsp.edu.ua/personnel/mizin-kostyantyn-ivanovych/',
  },
  {
    listedName: 'Захарченко Алла',
    patronymic: 'Василівна',
    confirmed: true,
    source: 'uhsp.edu.ua/personnel/zaharchenko-alla-vasylivna/',
  },
  {
    listedName: 'Семененко Олена',
    patronymic: 'Газисівна',
    confirmed: true,
    source: 'uhsp.edu.ua/personnel/semenenko-olena-gazysivna/',
  },
  {
    listedName: 'Потапенко Олександр',
    patronymic: 'Іванович',
    confirmed: true,
    source: 'uhsp.edu.ua/personnel/potapenko-oleksandr-ivanovych/',
  },
  {
    listedName: 'Троценко Тетяна',
    patronymic: 'Юріївна',
    confirmed: true,
    source: 'uhsp.edu.ua/personnel/trotsenko-tetyana-yuriyivna/',
  },

  // ── Found, not confirmed. Each names a кафедра matching the .docx, which is
  // good corroboration but not the same as the person's own profile page. ──
  {
    listedName: 'Скибіцька Діана',
    patronymic: 'Григорівна',
    confirmed: false,
    source: 'fhost.uhsp.edu.ua — кафедра політології',
    doubt: 'from page text, no personnel profile',
  },
  {
    listedName: 'Панасюк Андрій',
    patronymic: 'Олегович',
    confirmed: false,
    source: 'fhost.uhsp.edu.ua — ПУА, PhD',
    doubt: 'from page text, no personnel profile',
  },
  {
    listedName: 'Христюк Анна',
    patronymic: 'Олександрівна',
    confirmed: false,
    source: 'fuif.uhsp.edu.ua — кафедра іноземної філології',
    doubt: 'from page text, no personnel profile',
  },
  {
    listedName: 'Карпань Анна',
    patronymic: 'Петрівна',
    confirmed: false,
    source: 'ftmo.uhsp.edu.ua — кафедра ТМПП',
    doubt: 'from page text, no personnel profile',
  },
  {
    listedName: 'Сентіщев Олександр',
    patronymic: 'Олександрович',
    confirmed: false,
    source: 'qc.uhsp.edu.ua — керівник Кваліфікаційного центру',
    doubt: 'from page text, no personnel profile',
  },

  // ── Weak. The person found may not be the person listed. ──
  {
    listedName: 'Погребна Людмила',
    patronymic: 'Миколаївна',
    confirmed: false,
    source: 'uhsp.edu.ua — начальник відділу кадрів',
    doubt: 'that is an administrative post, not a кафедра педагогіки lecturer — may be two people',
  },
  {
    listedName: 'Бакуменко Тетяна',
    patronymic: 'Костянтинівна',
    confirmed: false,
    source: 'dissertation title on preschool education',
    doubt: 'not a UHSP page at all — weakest of the set',
  },

  // ── Surname conflicts. The .docx and the EMAIL agree with each other and both
  // disagree with the university site, by one letter. Somebody has to ask them
  // which is right; whichever it is, one of the three sources needs correcting.
  {
    listedName: 'Кирилова Ірина',
    patronymic: 'Іванівна',
    confirmed: false,
    source: 'uhsp.edu.ua/personnel/krylova-iryna-ivanivna/',
    doubt: 'site says КРИЛОВА; .docx and iryna.kyrylova@ both say КИРИЛОВА',
  },
  {
    listedName: 'Ляшенко Юрій',
    patronymic: 'Миколайович',
    confirmed: false,
    source: 'uhsp.edu.ua/personnel/lyashhenko-yurij-mykolajovych/',
    doubt: 'site says ЛЯЩЕНКО; .docx and yurii.liashenko@ both say ЛЯШЕНКО',
  },

  // Колесник Артем — confirmed as a lecturer on кафедра політології та
  // журналістики, но по батькові appears nowhere on the site. Ask the кафедра.
];

/** «Прізвище Ім'я» → по батькові, confirmed entries only */
export const CONFIRMED_PATRONYMICS: ReadonlyMap<string, string> = new Map(
  PATRONYMICS.filter((p) => p.confirmed).map((p) => [p.listedName, p.patronymic])
);
