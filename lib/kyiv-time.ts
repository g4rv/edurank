/**
 * Every moment the app prints is printed in Kyiv time (owner, 2026-10-07).
 *
 * The server runs on UTC, so `date.toLocaleString('uk-UA')` rendered there was
 * three hours behind: the audit log showed 22:38 for something done at 01:38,
 * and a date printed between midnight and 03:00 read as the day before. Pass
 * this as the options of every `toLocale…String('uk-UA', KYIV)` that prints an
 * instant — `createdAt`, `lockedAt`, `filledAt`.
 *
 * NOT for a calendar date stored as UTC midnight (a defence date): that is read
 * in UTC on purpose — see `degreeDefenceDate` in the audit log.
 */
export const KYIV = { timeZone: 'Europe/Kyiv' } as const;

/** How far Kyiv is ahead of UTC at that moment, in ms — +2 h in winter, +3 h in summer */
function kyivOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    ...KYIV,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
  return asIfUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Midnight of a `YYYY-MM-DD` day in Kyiv, as the instant it is */
function kyivMidnight(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  return new Date(utcMidnight - kyivOffsetMs(new Date(utcMidnight)));
}

/**
 * The first and last instant of a Kyiv calendar day — what a «від / до» filter
 * means by «7 жовтня». Built on UTC days it began at 03:00 and ran to 02:59
 * of the next day.
 */
export function kyivDayBounds(day: string): { start: Date; end: Date } {
  const start = kyivMidnight(day);
  return { start, end: new Date(start.getTime() + dayLengthMs(day) - 1) };
}

/** 24 h, except the two days a year the clocks move */
function dayLengthMs(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const following = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return kyivMidnight(following).getTime() - kyivMidnight(day).getTime();
}
