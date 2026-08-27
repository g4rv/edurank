// Ukrainian counts take THREE forms, and the UI was using one of them
// everywhere: «1 записів», «2 кафедр», «4 цитувань» (2026-08-27).
//
// The rule was already written down and already tested — in `lib/mail/validity.ts`,
// used by the invite mail and nowhere else, under a comment saying «the wrong
// one reads as broken software». It lives here now so the screen can use it too.

/** 1 день · 2 дні · 5 днів */
export function pluralUk(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «1 запис», «2 записи», «5 записів» — the count and its noun together */
export function countUk(n: number, one: string, few: string, many: string): string {
  return `${n} ${pluralUk(n, one, few, many)}`;
}

/** The forms this app repeats, so a caller names the thing rather than three endings */
export const UK = {
  record: (n: number) => countUk(n, 'запис', 'записи', 'записів'),
  person: (n: number) => countUk(n, 'особа', 'особи', 'осіб'),
  department: (n: number) => countUk(n, 'кафедра', 'кафедри', 'кафедр'),
  submission: (n: number) => countUk(n, 'подання', 'подання', 'подань'),
  citation: (n: number) => countUk(n, 'цитування', 'цитування', 'цитувань'),
  partTimer: (n: number) => countUk(n, 'сумісник', 'сумісники', 'сумісників'),
  primary: (n: number) => countUk(n, 'основний', 'основні', 'основних'),
} as const;
