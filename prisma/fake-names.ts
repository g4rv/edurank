import type { EvidenceField } from '../lib/rating/evidence-fields';

// Invented people, deterministically.
//
// Shared by `test-data.ts`, the only seeder that creates people who are not
// real. The names are ordinary Ukrainian ones so the screens look like
// the university rather than like a fixture — attaching test data to a REAL
// colleague's name would put their name on every action taken while somebody
// pokes at the app.
//
// Everything here is driven by a seeded PRNG, so the same command builds the
// same university every time: a screenshot from last week still matches.

/**
 * Deterministic PRNG (mulberry32). The same command gives the same university
 * every time, so a demo you showed last week looks the same today.
 */
export function makeRandom(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SURNAMES = [
  'Мельник',
  'Шевченко',
  'Бондаренко',
  'Ткаченко',
  'Ковальчук',
  'Кравченко',
  'Олійник',
  'Шевчук',
  'Поліщук',
  'Бойко',
  'Коваленко',
  'Лисенко',
  'Марченко',
  'Савченко',
  'Руденко',
  'Мороз',
  'Кузьменко',
  'Гриценко',
  'Литвиненко',
  'Дяченко',
  'Пилипенко',
  'Соколов',
  'Романюк',
  'Захарчук',
  'Гончаренко',
  'Панасенко',
  'Данилюк',
  'Юрченко',
  'Василенко',
  'Тимошенко',
  'Клименко',
  'Онищенко',
  'Приходько',
  'Сергієнко',
  'Харченко',
  'Яценко',
  'Іваненко',
  'Костенко',
  'Науменко',
  'Павленко',
];

export const MALE_NAMES = [
  'Олександр',
  'Андрій',
  'Володимир',
  'Сергій',
  'Ігор',
  'Дмитро',
  'Юрій',
  'Микола',
  'Тарас',
  'Богдан',
  'Роман',
  'Віктор',
  'Павло',
  'Максим',
  'Артем',
];

export const FEMALE_NAMES = [
  'Олена',
  'Наталія',
  'Тетяна',
  'Ірина',
  'Оксана',
  'Марія',
  'Людмила',
  'Світлана',
  'Катерина',
  'Анна',
  'Галина',
  'Вікторія',
  'Юлія',
  'Софія',
  'Дарина',
];

export const MALE_PATRONYMICS = [
  'Олександрович',
  'Андрійович',
  'Володимирович',
  'Сергійович',
  'Ігорович',
  'Дмитрович',
  'Юрійович',
  'Миколайович',
  'Тарасович',
  'Богданович',
  'Романович',
  'Вікторович',
  'Павлович',
];

export const FEMALE_PATRONYMICS = [
  'Олександрівна',
  'Андріївна',
  'Володимирівна',
  'Сергіївна',
  'Ігорівна',
  'Дмитрівна',
  'Юріївна',
  'Миколаївна',
  'Тарасівна',
  'Богданівна',
  'Романівна',
  'Вікторівна',
  'Павлівна',
];

/** Female surnames in -енко/-ук/-як do not change; -ов/-ев take -а */
export function feminine(surname: string): string {
  return /(ов|ев|ів|ин)$/.test(surname) ? `${surname}а` : surname;
}

export function pick<T>(random: () => number, list: T[]): T {
  return list[Math.floor(random() * list.length)];
}

/** Valid demo evidence for any activity type, built from its own field specs */
export function sampleEvidence(fields: readonly EvidenceField[], random: () => number) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    switch (f.kind) {
      case 'text':
        out[f.name] = `Демо — ${f.label}`;
        break;
      case 'number':
        out[f.name] =
          f.name === 'pages' ? 24 + Math.floor(random() * 96) : 1 + Math.floor(random() * 4);
        break;
      case 'url':
        out[f.name] = f.hosts ? `https://${f.hosts[0]}/demo` : 'https://example.com/demo';
        break;
      case 'date':
        out[f.name] = `2026-${String(1 + Math.floor(random() * 9)).padStart(2, '0')}-15`;
        break;
      case 'isbn':
        out[f.name] = '978-3-16-148410-0';
        break;
      case 'doi':
        out[f.name] = '10.1000/demo.2026';
        break;
      case 'checkbox':
        out[f.name] = true;
        break;
      case 'select':
        out[f.name] = pick(random, [...f.options]).value;
        break;
    }
  }
  return out;
}
