import { describe, it, expect } from 'vitest';
import {
  buildKharakterystyka,
  type KharakterystykaActivity,
  type KharakterystykaEntry,
} from './build';
import { LICENCE_POSITIONS, REQUIRED_POSITIONS } from './positions';
import { LICENCE_POSITION_LINKS } from '@/lib/rating/db-specs';
import { catalogueType } from '@/lib/rating/db-specs';

const YEAR = 2026;
const NO_PROFILE = { scientificDegree: null, degreeDefenceDate: null };

/**
 * An activity as the query hands it over. `code` picks the real catalogue
 * indicator, so the test exercises the same evidence fields and the same
 * position links the seed writes — not an invented shape that happens to pass.
 */
function activity(
  code: string,
  evidence: Record<string, unknown>,
  overrides: Partial<KharakterystykaActivity> = {}
): KharakterystykaActivity {
  const type = catalogueType(code);
  return {
    year: YEAR,
    status: 'APPROVED',
    evidence,
    activityType: {
      itemNumber: type.specs.itemNumber,
      label: type.def.label,
      isActive: true,
      licencePositions: type.specs.licencePositions,
      evidenceFields: type.specs.evidenceFields,
    },
    ...overrides,
  };
}

function position(result: ReturnType<typeof buildKharakterystyka>, number: number) {
  const found = result.positions.find((p) => p.number === number);
  if (!found) throw new Error(`position ${number} missing`);
  return found;
}

const publication = (n: number) =>
  activity('publication_cat_b', { option: 'solo', bibliography: `Стаття ${n}` });

describe('buildKharakterystyka — shape', () => {
  it('always returns all 20 positions, in order', () => {
    const result = buildKharakterystyka([], NO_PROFILE, YEAR);
    expect(result.positions).toHaveLength(20);
    expect(result.positions.map((p) => p.number)).toEqual(LICENCE_POSITIONS.map((p) => p.number));
  });

  it('covers the five years ending at the given year', () => {
    const result = buildKharakterystyka([], NO_PROFILE, 2026);
    expect(result).toMatchObject({ from: 2022, to: 2026 });
  });

  it('a person with no data meets nothing and does not qualify', () => {
    const result = buildKharakterystyka([], NO_PROFILE, YEAR);
    expect(result.metCount).toBe(0);
    expect(result.qualifies).toBe(false);
    expect(result.positions.every((p) => p.evidence === '')).toBe(true);
  });
});

describe('thresholds', () => {
  it('п.1 needs five publications — four is not enough', () => {
    const four = buildKharakterystyka([1, 2, 3, 4].map(publication), NO_PROFILE, YEAR);
    expect(position(four, 1).met).toBe(false);
    expect(position(four, 1).progress).toEqual({ have: 4, need: 5 });

    const five = buildKharakterystyka([1, 2, 3, 4, 5].map(publication), NO_PROFILE, YEAR);
    expect(position(five, 1).met).toBe(true);
  });

  it('counts Scopus and фахові publications towards the same bar', () => {
    const mixed = [
      activity('publication_cat_a', { option: 'q1', bibliography: 'A1' }),
      activity('publication_cat_a', { option: 'q2', bibliography: 'A2' }),
      publication(1),
      publication(2),
      publication(3),
    ];
    expect(position(buildKharakterystyka(mixed, NO_PROFILE, YEAR), 1).met).toBe(true);
  });

  it('п.4 needs three навчально-методичні праці', () => {
    const two = [
      activity('edition_publication', { option: 'methodical_guide', pages: 100 }),
      activity('moodle_course', { mode: 'development', discipline: 'Педагогіка' }),
    ];
    expect(position(buildKharakterystyka(two, NO_PROFILE, YEAR), 4).met).toBe(false);

    const three = [
      ...two,
      activity('edition_publication', { option: 'recommendations', pages: 60 }),
    ];
    expect(position(buildKharakterystyka(three, NO_PROFILE, YEAR), 4).met).toBe(true);
  });

  it('a single-entry position needs one entry and shows no counter', () => {
    const none = buildKharakterystyka([], NO_PROFILE, YEAR);
    expect(position(none, 6).met).toBe(false);
    expect(position(none, 6).progress).toBeNull();

    const one = buildKharakterystyka(
      [activity('defense_supervision', { option: 'phd', candidate: 'Петренко О.', topic: 'Тема' })],
      NO_PROFILE,
      YEAR
    );
    expect(position(one, 6).met).toBe(true);
  });
});

describe('п.2 — alternatives', () => {
  const copyright = (n: number) =>
    activity('copyright_registration', { certificateNumber: `${n}`, title: `Твір ${n}` });

  it('one patent is enough on its own', () => {
    const result = buildKharakterystyka(
      [activity('patent_granted', { registrationNumber: '1', title: 'Пристрій' })],
      NO_PROFILE,
      YEAR
    );
    expect(position(result, 2).met).toBe(true);
  });

  it('five copyright certificates are enough on their own', () => {
    const four = buildKharakterystyka([1, 2, 3, 4].map(copyright), NO_PROFILE, YEAR);
    expect(position(four, 2).met).toBe(false);
    // The closest alternative is the copyright one, not «0 of 1 patents»
    expect(position(four, 2).progress).toEqual({ have: 4, need: 5 });

    const five = buildKharakterystyka([1, 2, 3, 4, 5].map(copyright), NO_PROFILE, YEAR);
    expect(position(five, 2).met).toBe(true);
  });

  it('the two alternatives do not add up — 3 certificates is not 3/1 patents', () => {
    const result = buildKharakterystyka([1, 2, 3].map(copyright), NO_PROFILE, YEAR);
    expect(position(result, 2).met).toBe(false);
  });
});

describe('applications never close a position', () => {
  it('a patent application scores nothing towards п.2', () => {
    const result = buildKharakterystyka(
      [activity('patent_application', { title: 'Заявка' })],
      NO_PROFILE,
      YEAR
    );
    expect(position(result, 2).met).toBe(false);
    expect(position(result, 2).entries).toHaveLength(0);
  });

  it('an unwon grant proposal scores nothing towards п.10', () => {
    const result = buildKharakterystyka(
      [activity('intl_grant_application', { title: 'Проєкт' })],
      NO_PROFILE,
      YEAR
    );
    expect(position(result, 10).met).toBe(false);
  });

  it('and the catalogue keeps them unmapped', () => {
    expect(LICENCE_POSITION_LINKS.patent_application).toBeUndefined();
    expect(LICENCE_POSITION_LINKS.intl_grant_application).toBeUndefined();
  });
});

describe('2.2 splits between п.3 and п.4 by the chosen option', () => {
  it('a підручник feeds п.3, not п.4', () => {
    // 150 pages / 24 = 6.25 авт. арк., sole author — over the 5-sheet bar
    const result = buildKharakterystyka(
      [activity('edition_publication', { option: 'textbook', pages: 150 })],
      NO_PROFILE,
      YEAR
    );
    expect(position(result, 3).met).toBe(true);
    expect(position(result, 4).entries).toHaveLength(0);
  });

  it('методичні рекомендації feed п.4, not п.3', () => {
    const result = buildKharakterystyka(
      [activity('edition_publication', { option: 'recommendations', pages: 150 })],
      NO_PROFILE,
      YEAR
    );
    expect(position(result, 3).entries).toHaveLength(0);
    expect(position(result, 4).entries).toHaveLength(1);
  });
});

describe('п.3 — «не менше 5 авторських аркушів»', () => {
  const monograph = (pages: number, coAuthors?: number) =>
    activity('monograph_ua', {
      pages,
      ...(coAuthors ? { coAuthors } : {}),
      isbn: '978-966-00-0000-1',
      bibliography: 'Монографія',
    });

  it('a short monograph does not count', () => {
    // 96 / 24 = 4 sheets — under 5
    const result = buildKharakterystyka([monograph(96)], NO_PROFILE, YEAR);
    expect(position(result, 3).met).toBe(false);
    expect(position(result, 3).entries).toHaveLength(0);
  });

  it('and says why it does not', () => {
    const result = buildKharakterystyka([monograph(96)], NO_PROFILE, YEAR);
    expect(position(result, 3).note).toMatch(/5 авт/);
  });

  it('120 pages is exactly 5 sheets and counts', () => {
    expect(position(buildKharakterystyka([monograph(120)], NO_PROFILE, YEAR), 3).met).toBe(true);
  });

  it('co-authorship must still leave 1.5 sheets each', () => {
    // 240 / 24 = 10 sheets total (over 5), but split 8 ways = 1.25 each
    expect(position(buildKharakterystyka([monograph(240, 8)], NO_PROFILE, YEAR), 3).met).toBe(
      false
    );
    // Split 6 ways = 1.67 each
    expect(position(buildKharakterystyka([monograph(240, 6)], NO_PROFILE, YEAR), 3).met).toBe(true);
  });

  it('a row with no page count fails instead of throwing', () => {
    const result = buildKharakterystyka(
      [activity('monograph_ua', { isbn: '978-966-00-0000-1', bibliography: 'Без сторінок' })],
      NO_PROFILE,
      YEAR
    );
    expect(position(result, 3).met).toBe(false);
  });
});

describe('which entries count at all', () => {
  it('a discarded entry does not', () => {
    const removed = [1, 2, 3, 4, 5].map((n) => ({
      ...publication(n),
      status: 'REMOVED' as const,
    }));
    expect(position(buildKharakterystyka(removed, NO_PROFILE, YEAR), 1).met).toBe(false);
  });

  it('an entry of a deactivated indicator does not', () => {
    const deactivated = [1, 2, 3, 4, 5].map((n) => {
      const a = publication(n);
      return { ...a, activityType: { ...a.activityType, isActive: false } };
    });
    expect(position(buildKharakterystyka(deactivated, NO_PROFILE, YEAR), 1).met).toBe(false);
  });

  it('an entry older than the window does not', () => {
    const old = [1, 2, 3, 4, 5].map((n) => ({ ...publication(n), year: 2021 }));
    // 2021 is outside 2022–2026
    expect(position(buildKharakterystyka(old, NO_PROFILE, 2026), 1).met).toBe(false);
    // …and inside 2021–2025
    expect(position(buildKharakterystyka(old, NO_PROFILE, 2025), 1).met).toBe(true);
  });
});

describe('evidence text', () => {
  it('reads «summary (year)», newest first, separated by a blank line', () => {
    const result = buildKharakterystyka(
      [
        { ...publication(1), year: 2024 },
        { ...publication(2), year: 2026 },
      ],
      NO_PROFILE,
      YEAR
    );
    const lines = position(result, 1).evidence.split('\n\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/\(2026\)$/);
    expect(lines[1]).toMatch(/\(2024\)$/);
  });

  it('lists every entry, not just the first five', () => {
    const many = Array.from({ length: 12 }, (_, i) => publication(i + 1));
    expect(position(buildKharakterystyka(many, NO_PROFILE, YEAR), 1).entries).toHaveLength(12);
  });
});

describe('п.5 — the defence date', () => {
  it('is met when the defence falls inside the window', () => {
    const result = buildKharakterystyka(
      [],
      { scientificDegree: 'DOCTOR', degreeDefenceDate: new Date('2024-05-20') },
      2026
    );
    expect(position(result, 5).met).toBe(true);
  });

  it('is not met when it falls before it', () => {
    const result = buildKharakterystyka(
      [],
      { scientificDegree: 'DOCTOR', degreeDefenceDate: new Date('2015-05-20') },
      2026
    );
    expect(position(result, 5).met).toBe(false);
  });

  it('says so when a degree is recorded but the date is missing', () => {
    const result = buildKharakterystyka(
      [],
      { scientificDegree: 'CANDIDATE', degreeDefenceDate: null },
      2026
    );
    expect(position(result, 5).note).toMatch(/дату захисту/);
  });
});

describe('positions nobody derives', () => {
  it('п.15 and п.20 are manual and carry a reason', () => {
    const result = buildKharakterystyka([], NO_PROFILE, YEAR);
    for (const n of [15, 20]) {
      expect(position(result, n).fill).toBe('MANUAL');
      expect(position(result, n).note).toBeTruthy();
    }
  });

  it('п.16–18 are military and never apply here', () => {
    const result = buildKharakterystyka([], NO_PROFILE, YEAR);
    for (const n of [16, 17, 18]) {
      expect(position(result, n).fill).toBe('NOT_APPLICABLE');
      expect(position(result, n).met).toBe(false);
    }
  });
});

describe('Кнпп — «at least four of twenty»', () => {
  it('three positions do not qualify, four do', () => {
    const three = [
      activity('patent_granted', { title: 'Патент' }), // п.2
      activity('defense_supervision', { option: 'phd', student: 'П.' }), // п.6
      activity('org_consulting', { organization: 'Ліцей', mentionLink: 'https://e.ua/1' }), // п.11
    ];
    const result3 = buildKharakterystyka(three, NO_PROFILE, YEAR);
    expect(result3.metCount).toBe(3);
    expect(result3.qualifies).toBe(false);

    const four = [...three, activity('prof_associations', { title: 'Спілка' })]; // п.19
    const result4 = buildKharakterystyka(four, NO_PROFILE, YEAR);
    expect(result4.metCount).toBe(REQUIRED_POSITIONS);
    expect(result4.qualifies).toBe(true);
  });

  it('one entry may close two positions without being counted twice', () => {
    // A won international grant is both «наукова тема» (п.8) and «міжнародний
    // проєкт» (п.10) — two facts about one project, not double counting.
    const result = buildKharakterystyka(
      [
        activity('intl_grant_won', { option: 'project_leader', title: 'Проєкт' }),
        activity('ndr_execution', { option: 'leader', title: 'НДР' }),
      ],
      NO_PROFILE,
      YEAR
    );
    expect(position(result, 8).met).toBe(true);
    expect(position(result, 10).met).toBe(true);
    expect(position(result, 8).entries).toHaveLength(1);
  });
});

// ─── KharakterystykaEntry — evidence that is not a rating activity ───────────
//
// Two sources, one table: п.15 and п.20 typed by hand, because the rating holds
// neither and the catalogue only moves by a вчена рада vote; and 2022–2024,
// carried in from the university's own files for years the app never had a
// rating for.

function entry(
  position: number,
  overrides: Partial<KharakterystykaEntry> = {}
): KharakterystykaEntry {
  return {
    position,
    group: null,
    year: YEAR,
    text: 'Внесений вручну запис',
    count: 1,
    itemNumber: null,
    ...overrides,
  };
}

describe('buildKharakterystyka — manual and imported entries', () => {
  // The regression this table exists for. п.15 and п.20 have no indicator and
  // rendered as rows nobody could fill, on a document the university is
  // licensed against.
  it('fills п.15, which no indicator can reach', () => {
    const before = buildKharakterystyka([], NO_PROFILE, YEAR);
    expect(position(before, 15).met).toBe(false);

    const after = buildKharakterystyka([], NO_PROFILE, YEAR, [
      entry(15, { text: 'Журі ІІІ етапу Всеукраїнської олімпіади з біології' }),
    ]);
    const p15 = position(after, 15);
    expect(p15.met).toBe(true);
    expect(p15.entries).toHaveLength(1);
    expect(p15.evidence).toContain('олімпіади з біології');
  });

  it('fills п.20 the same way', () => {
    const result = buildKharakterystyka([], NO_PROFILE, YEAR, [entry(20)]);
    expect(position(result, 20).met).toBe(true);
  });

  // Military positions. A row here would assert something the licence
  // conditions do not let this university claim, so there is nothing to type.
  it('never fills п.16–18, whatever is passed', () => {
    const result = buildKharakterystyka([], NO_PROFILE, YEAR, [entry(16), entry(17), entry(18)]);
    for (const n of [16, 17, 18]) {
      expect(position(result, n).met).toBe(false);
      expect(position(result, n).entries).toHaveLength(0);
    }
  });

  it('counts towards a derived position beside the rating own entries', () => {
    // п.1 needs five publications: three from the rating, two imported
    const result = buildKharakterystyka(
      [publication(1), publication(2), publication(3)],
      NO_PROFILE,
      YEAR,
      [entry(1, { year: 2023 }), entry(1, { year: 2022 })]
    );
    const p1 = position(result, 1);
    expect(p1.progress).toEqual({ have: 5, need: 5 });
    expect(p1.met).toBe(true);
    expect(p1.entries).toHaveLength(5);
  });

  // One legacy cell can mean «five publications» rather than five rows, and п.1
  // asks for five — counting it as one would understate the person.
  it('honours count, and still prints one line', () => {
    const result = buildKharakterystyka([], NO_PROFILE, YEAR, [
      entry(1, { count: 5, text: 'П’ять публікацій за 2023 рік' }),
    ]);
    const p1 = position(result, 1);
    expect(p1.met).toBe(true);
    expect(p1.progress).toEqual({ have: 5, need: 5 });
    expect(p1.entries).toHaveLength(1);
  });

  it('treats a count below one as one, so a bad row cannot erase itself', () => {
    const result = buildKharakterystyka([], NO_PROFILE, YEAR, [entry(6, { count: 0 })]);
    expect(position(result, 6).met).toBe(true);
  });

  // The whole reason the row carries a year: 2022 rows drop out by themselves
  // once the document is built for 2027, with nobody deleting anything.
  it('applies the five-year window to entries', () => {
    const outside = buildKharakterystyka([], NO_PROFILE, YEAR, [entry(15, { year: 2021 })]);
    expect(position(outside, 15).met).toBe(false);

    const inside = buildKharakterystyka([], NO_PROFILE, YEAR, [entry(15, { year: 2022 })]);
    expect(position(inside, 15).met).toBe(true);
  });

  // п.2 is «one patent» OR «five свідоцтва» — two bars over two groups.
  it('routes an entry to the alternative it names', () => {
    const patent = buildKharakterystyka([], NO_PROFILE, YEAR, [entry(2, { group: 'patent' })]);
    expect(position(patent, 2).met).toBe(true);

    const oneCertificate = buildKharakterystyka([], NO_PROFILE, YEAR, [
      entry(2, { group: 'copyright' }),
    ]);
    expect(position(oneCertificate, 2).met).toBe(false);

    const fiveCertificates = buildKharakterystyka([], NO_PROFILE, YEAR, [
      entry(2, { group: 'copyright', count: 5 }),
    ]);
    expect(position(fiveCertificates, 2).met).toBe(true);
  });

  // Naming no group lands on the position's FIRST alternative — for п.2 that is
  // the patent, which the law names first.
  it('lands on the first alternative when no group is named', () => {
    const result = buildKharakterystyka([], NO_PROFILE, YEAR, [entry(2)]);
    expect(position(result, 2).met).toBe(true);
  });

  it('counts towards Кнпп like any other met position', () => {
    const entries = [entry(15), entry(20), entry(6), entry(7)];
    const result = buildKharakterystyka([], NO_PROFILE, YEAR, entries);
    expect(result.metCount).toBe(REQUIRED_POSITIONS);
    expect(result.qualifies).toBe(true);
  });

  it('changes nothing when none are passed', () => {
    const activities = [publication(1), publication(2)];
    const withNone = buildKharakterystyka(activities, NO_PROFILE, YEAR);
    const withEmpty = buildKharakterystyka(activities, NO_PROFILE, YEAR, []);
    expect(withEmpty).toEqual(withNone);
  });
});
