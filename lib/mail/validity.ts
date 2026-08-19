// «Посилання дійсне …» — how long a link lasts, in Ukrainian.
//
// A template string cannot just interpolate the number: Ukrainian counts take
// three forms, and «1 днів» / «2 днів» are both wrong. While every link lasted
// exactly 30 days the hardcoded «днів» happened to be right, and it stopped
// being right the moment a reset started measuring in hours.

/** Ukrainian count forms: 1 день · 2 дні · 5 днів */
export function pluralUk(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * «30 днів», «2 години», «1 година».
 *
 * Whole days are said in days — «720 годин» is a true answer to a question
 * nobody asked. Anything shorter stays in hours, which is the unit a reset
 * window is actually decided in.
 */
export function validityPhrase(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${pluralUk(days, 'день', 'дні', 'днів')}`;
  }
  return `${hours} ${pluralUk(hours, 'година', 'години', 'годин')}`;
}
