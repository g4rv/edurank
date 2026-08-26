import { describe, expect, test } from 'vitest';
import { parseDelivered } from './mail-log';

/** The real 2026-08-25 export's header, verbatim. */
const EVENTS_HEADER =
  'Email,status,blocked,soft_bounce,hard_bounce,retrying,opened,clicked,unsub,spam,date,messageid,Sender,subject,campaign_id,contactid';

/** One message-events row: only the address, the status and the flags matter. */
function eventRow(email: string, status: string, flags: Partial<Record<string, boolean>> = {}) {
  const f = (name: string) => (flags[name] ? 'TRUE' : 'FALSE');
  return [
    email,
    status,
    f('blocked'),
    f('soft_bounce'),
    f('hard_bounce'),
    'FALSE',
    'FALSE',
    'FALSE',
    'FALSE',
    f('spam'),
    '2026-08-25T14:48:31',
    '55732048149019055',
    'no-reply@edurank.uhsp.edu.ua',
    '"Запрошення до системи EduRank"',
    '0',
    '19390984516',
  ].join(',');
}

const events = (...rows: string[]) => [EVENTS_HEADER, ...rows].join('\n');

describe('parseDelivered — Mailjet message-events export', () => {
  test('counts sent, opened and clicked as reached', () => {
    const delivered = parseDelivered(
      events(
        eventRow('one@uhsp.edu.ua', 'sent'),
        eventRow('two@uhsp.edu.ua', 'opened'),
        eventRow('three@uhsp.edu.ua', 'clicked')
      )
    );

    expect([...delivered].sort()).toEqual([
      'one@uhsp.edu.ua',
      'three@uhsp.edu.ua',
      'two@uhsp.edu.ua',
    ]);
  });

  test('a soft bounce is not delivered', () => {
    const delivered = parseDelivered(
      events(
        eventRow('reached@uhsp.edu.ua', 'sent'),
        eventRow('liubov.lokhvytska@uhsp.edu.ua', 'soft bounce', { soft_bounce: true })
      )
    );

    expect(delivered.has('liubov.lokhvytska@uhsp.edu.ua')).toBe(false);
    expect(delivered.has('reached@uhsp.edu.ua')).toBe(true);
  });

  test('the sender address in its own column is not a recipient', () => {
    const delivered = parseDelivered(events(eventRow('one@uhsp.edu.ua', 'sent')));

    expect(delivered.has('no-reply@edurank.uhsp.edu.ua')).toBe(false);
    expect(delivered.size).toBe(1);
  });

  test('an address that ever failed is dropped, even where another message reached it', () => {
    const delivered = parseDelivered(
      events(
        eventRow('flaky@uhsp.edu.ua', 'sent'),
        eventRow('flaky@uhsp.edu.ua', 'hard bounce', { hard_bounce: true })
      )
    );

    expect(delivered.has('flaky@uhsp.edu.ua')).toBe(false);
  });

  test('the same address over several rows is one person', () => {
    const delivered = parseDelivered(
      events(
        eventRow('skydorw@gmail.com', 'sent'),
        eventRow('skydorw@gmail.com', 'opened'),
        eventRow('SKYDORW@gmail.com', 'clicked')
      )
    );

    expect([...delivered]).toEqual(['skydorw@gmail.com']);
  });

  test('a comma inside a quoted subject does not shift the columns', () => {
    const row = eventRow('one@uhsp.edu.ua', 'sent').replace(
      '"Запрошення до системи EduRank"',
      '"Запрошення, будь ласка, до системи"'
    );

    expect(parseDelivered(events(row)).has('one@uhsp.edu.ua')).toBe(true);
  });
});

describe('parseDelivered — Mailjet statistics export', () => {
  const STATS_HEADER = 'email,sent,hard_bounce,soft_bounce,blocked,spam';

  test('a contact with sent above zero and no failure counts', () => {
    const delivered = parseDelivered(
      [STATS_HEADER, 'one@uhsp.edu.ua,1,0,0,0,0', 'never@uhsp.edu.ua,0,0,0,0,0'].join('\n')
    );

    expect([...delivered]).toEqual(['one@uhsp.edu.ua']);
  });

  test('a contact with a bounce count does not', () => {
    const delivered = parseDelivered([STATS_HEADER, 'bounced@uhsp.edu.ua,1,0,1,0,0'].join('\n'));

    expect(delivered.size).toBe(0);
  });
});

describe('parseDelivered — a plain list', () => {
  test('falls back to every address on every line', () => {
    const delivered = parseDelivered('one@uhsp.edu.ua\nTwo@uhsp.edu.ua\n');

    expect([...delivered].sort()).toEqual(['one@uhsp.edu.ua', 'two@uhsp.edu.ua']);
  });
});
