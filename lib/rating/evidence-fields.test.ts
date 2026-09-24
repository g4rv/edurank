import { describe, expect, it } from 'vitest';
import {
  date,
  EVIDENCE_FIELDS,
  summarizeEvidence,
  text,
  type EvidenceField,
} from './evidence-fields';

const box = (name: string, label: string, group?: string): EvidenceField => ({
  kind: 'checkbox',
  name,
  label,
  ...(group ? { group } : {}),
});

describe('summarizeEvidence', () => {
  it('lists plain values in field order', () => {
    const fields: EvidenceField[] = [
      { kind: 'text', name: 'title', label: 'Назва' },
      { kind: 'number', name: 'pages', label: 'Сторінок' },
    ];
    expect(summarizeEvidence(fields, { title: 'Монографія', pages: 120 })).toBe(
      'Монографія · Сторінок: 120'
    );
  });

  it('skips empty and unticked values', () => {
    const fields: EvidenceField[] = [
      { kind: 'text', name: 'title', label: 'Назва' },
      box('confirmed', 'Підтверджено'),
    ];
    expect(summarizeEvidence(fields, { title: '', confirmed: false })).toBe('');
    expect(summarizeEvidence(fields, { title: 'Так', confirmed: true })).toBe('Так · Підтверджено');
  });

  // Item 5.1's six materials used to be one part each and hit the 5-part cap,
  // so a course with five materials read identically to one with two.
  describe('a grouped checkbox set becomes one part', () => {
    const fields: EvidenceField[] = [
      { kind: 'text', name: 'discipline', label: 'Дисципліна' },
      box('a', 'Перший', 'Матеріали курсу'),
      box('b', 'Другий', 'Матеріали курсу'),
      box('c', 'Третій', 'Матеріали курсу'),
    ];

    it('lists the ticked labels under the group title', () => {
      expect(summarizeEvidence(fields, { discipline: 'Фізика', a: true, b: false, c: true })).toBe(
        'Фізика · Матеріали курсу: Перший, Третій'
      );
    });

    it('appears once, in the position of the first box', () => {
      const summary = summarizeEvidence(fields, {
        discipline: 'Фізика',
        a: true,
        b: true,
        c: true,
      });
      expect(summary).toBe('Фізика · Матеріали курсу: Перший, Другий, Третій');
      expect(summary.match(/Матеріали курсу/g)).toHaveLength(1);
    });

    it('is omitted entirely when nothing in the group is ticked', () => {
      expect(summarizeEvidence(fields, { discipline: 'Фізика', a: false })).toBe('Фізика');
    });
  });

  it('keeps every ticked material visible for the real 5.1 field set', () => {
    const materials = EVIDENCE_FIELDS.moodle_course.filter(
      (f) => f.kind === 'checkbox' && f.points !== undefined
    );
    const evidence: Record<string, unknown> = {
      mode: 'development',
      discipline: 'Алгоритми',
      link: 'https://moodle.example/course/1',
    };
    // Five of six — the case that used to be indistinguishable from two of six
    materials.forEach((m, i) => (evidence[m.name] = i < 5));

    const summary = summarizeEvidence(EVIDENCE_FIELDS.moodle_course, evidence);
    for (const m of materials.slice(0, 5)) expect(summary).toContain(m.label);
    expect(summary).not.toContain(materials[5].label);
  });
});

describe('joined text fields', () => {
  // «ПІБ школяра» was one box, so one person typed «Коваленко М. І.» and the
  // next «Марія Коваленко». Three boxes fix the order — but the licence
  // document must still read «Коваленко Марія Ігорівна», not
  // «Коваленко · Марія · Ігорівна», which is what one part per field would
  // print.
  const name = [
    text('pupilLast', 'Прізвище', { join: 'pupil', optional: true }),
    text('pupilFirst', 'Ім’я', { join: 'pupil', optional: true }),
    text('pupilMiddle', 'По батькові', { join: 'pupil', optional: true }),
  ];

  it('prints joined fields as one part, space-separated', () => {
    const out = summarizeEvidence(name, {
      pupilLast: 'Коваленко',
      pupilFirst: 'Марія',
      pupilMiddle: 'Ігорівна',
    });
    expect(out).toBe('Коваленко Марія Ігорівна');
  });

  it('skips the blanks instead of leaving gaps', () => {
    const out = summarizeEvidence(name, { pupilLast: 'Коваленко', pupilFirst: 'Марія' });
    expect(out).toBe('Коваленко Марія');
  });

  it('emits nothing when every part is empty', () => {
    expect(summarizeEvidence(name, {})).toBe('');
  });

  it('keeps the group in the position of its first field', () => {
    const fields = [text('before', 'Перед'), ...name, text('after', 'Після')];
    const out = summarizeEvidence(fields, {
      before: 'А',
      pupilLast: 'Коваленко',
      pupilFirst: 'Марія',
      after: 'Б',
    });
    expect(out).toBe('А · Коваленко Марія · Б');
  });
});

describe('summarizeEvidence — `uaDates`', () => {
  const fields = [date('publishedOn', 'Опубліковано/Проіндексовано')];

  it('prints a date the Ukrainian way when asked', () => {
    expect(summarizeEvidence(fields, { publishedOn: '2026-09-10' }, 5, { uaDates: true })).toBe(
      '10.09.2026'
    );
  });

  it('leaves it as stored by default', () => {
    expect(summarizeEvidence(fields, { publishedOn: '2026-09-10' })).toBe('2026-09-10');
  });
});
