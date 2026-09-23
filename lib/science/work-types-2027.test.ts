import { describe, expect, it } from 'vitest';
import { computeScore } from '@/lib/specs/scoring';
import { SCIENCE_WORK_TYPES_2027, scienceDbSpecs } from './work-types-2027';

const byCode = (code: string) => {
  const def = SCIENCE_WORK_TYPES_2027.find((d) => d.code === code);
  if (!def) throw new Error(`no work type "${code}"`);
  const { evidenceFields, scoring, coefficient } = scienceDbSpecs(def);
  return { code, coefficient, scoring, evidenceFields };
};

/** Hours the engine computes for this evidence. */
const hours = (code: string, evidence: object) => computeScore(byCode(code), evidence).score;

describe('the catalogue is whole', () => {
  it('has 26 types covering the 18 printed items', () => {
    expect(SCIENCE_WORK_TYPES_2027).toHaveLength(26);
    const items = new Set(SCIENCE_WORK_TYPES_2027.map((d) => d.itemNumber));
    expect(items.size).toBe(18);
  });

  it('has no duplicate code and no duplicate order', () => {
    const codes = SCIENCE_WORK_TYPES_2027.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
    const orders = SCIENCE_WORK_TYPES_2027.map((d) => d.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('names identity fields that its own form actually has', () => {
    for (const def of SCIENCE_WORK_TYPES_2027) {
      const names = new Set(def.fields.map((f) => f.name));
      for (const field of def.identityFields) {
        expect(names, `${def.code} → ${field}`).toContain(field);
      }
    }
  });
});

describe('hours match the printed Додаток III', () => {
  it('п.1 — грант: 400 г за одну програму', () => {
    expect(hours('intl_grant_program', {})).toBe(400);
  });

  it('п.1 — проєкт: 300 керівнику, 100 члену', () => {
    expect(hours('intl_project', { option: 'lead' })).toBe(300);
    expect(hours('intl_project', { option: 'member' })).toBe(100);
  });

  it('п.2 — дисертація: 500 доктора наук, 300 доктора філософії', () => {
    expect(hours('dissertation', { option: 'doctor' })).toBe(500);
    expect(hours('dissertation', { option: 'phd' })).toBe(300);
  });

  it('п.3 — монографія 200 і посібник 100 за друкований аркуш', () => {
    expect(hours('monograph', { option: 'monograph', credits: 3 })).toBe(600);
    expect(hours('monograph', { option: 'manual', credits: 3 })).toBe(300);
  });

  it('п.3 — перевидання: 50 за друкований аркуш', () => {
    expect(hours('monograph_reissue', { value: 2 })).toBe(100);
  });

  it('п.4 — стаття, за 1 сторінку, six tiers', () => {
    expect(hours('article', { option: 'scopus', credits: 10 })).toBe(500);
    expect(hours('article', { option: 'fahove_b', credits: 10 })).toBe(300);
    expect(hours('article', { option: 'foreign', credits: 10 })).toBe(200);
    expect(hours('article', { option: 'journal', credits: 10 })).toBe(150);
    expect(hours('article', { option: 'proceedings', credits: 10 })).toBe(100);
    expect(hours('article', { option: 'other', credits: 10 })).toBe(50);
  });

  it('п.5 — заявка: 100 винахід, 40 корисна модель, 30 авторське право', () => {
    expect(hours('ip_application', { option: 'invention' })).toBe(100);
    expect(hours('ip_application', { option: 'utility_model' })).toBe(40);
    expect(hours('ip_application', { option: 'copyright' })).toBe(30);
  });

  it('п.6 — доповідь: 5 / 3 / 2 за сторінку', () => {
    expect(hours('conference_paper', { option: 'international', credits: 4 })).toBe(20);
    expect(hours('conference_paper', { option: 'national', credits: 4 })).toBe(12);
    expect(hours('conference_paper', { option: 'other', credits: 4 })).toBe(8);
  });

  it('п.6 — участь: 6 г за день, не більше 5', () => {
    expect(hours('conference_attendance', { value: 3 })).toBe(18);
    expect(byCode('conference_attendance')).toBeDefined();
    const def = SCIENCE_WORK_TYPES_2027.find((d) => d.code === 'conference_attendance');
    expect(def?.maxPerYear).toBe(5);
  });

  it('п.7 — рецензування, four separate units', () => {
    expect(hours('review_publication', { value: 2 })).toBe(20);
    expect(hours('review_dissertation', {})).toBe(50);
    expect(hours('review_intl_project', {})).toBe(30);
    expect(hours('review_article', {})).toBe(10);
  });

  it('п.8 — конкурс: 50 / 40 / 30 за підготовку, 100 за перемогу', () => {
    expect(hours('state_competition_entry', { option: 'lead' })).toBe(50);
    expect(hours('state_competition_entry', { option: 'secretary' })).toBe(40);
    expect(hours('state_competition_entry', { option: 'member' })).toBe(30);
    expect(hours('state_competition_win', {})).toBe(100);
  });

  it('п.9 — госпдоговірне дослідження: 100', () => {
    expect(hours('contract_research', {})).toBe(100);
  });

  it('п.10 — редколегія 100 / 100 / 100 / 50, англомовний супровід 5 за сторінку', () => {
    expect(hours('editorial_board', { option: 'editor_in_chief' })).toBe(100);
    expect(hours('editorial_board', { option: 'managing_editor' })).toBe(100);
    expect(hours('editorial_board', { option: 'secretary' })).toBe(100);
    expect(hours('editorial_board', { option: 'member' })).toBe(50);
    expect(hours('english_support', { value: 6 })).toBe(30);
  });

  it('п.11 — авторський доробок', () => {
    expect(hours('art_achievement', { option: 'laureate_intl' })).toBe(100);
    expect(hours('art_achievement', { option: 'laureate_national' })).toBe(50);
    expect(hours('art_achievement', { option: 'personal_show' })).toBe(100);
    expect(hours('art_achievement', { option: 'honoured_person' })).toBe(100);
    expect(hours('art_achievement', { option: 'prepared_laureate_intl' })).toBe(50);
    expect(hours('art_achievement', { option: 'prepared_laureate_national' })).toBe(30);
  });

  it('п.12–п.18 — the flat ones', () => {
    expect(hours('phd_supervision', {})).toBe(50);
    expect(hours('expert_review', {})).toBe(50);
    expect(hours('student_group', {})).toBe(50);
    expect(hours('lab_leadership', {})).toBe(100);
    expect(hours('art_publication', {})).toBe(50);
    expect(hours('academic_mobility', {})).toBe(100);
    expect(hours('student_research_win', { option: 'winner' })).toBe(30);
    expect(hours('student_research_win', { option: 'runner_up' })).toBe(20);
  });
});

describe('the flags the наказ dictates', () => {
  it('marks as YEARLY exactly what the Примітка column repeats', () => {
    const yearly = SCIENCE_WORK_TYPES_2027.filter((d) => d.reuse === 'YEARLY').map((d) => d.code);
    expect(yearly.sort()).toEqual(
      [
        'conference_attendance',
        'dissertation',
        'editorial_board',
        'lab_leadership',
        'phd_supervision',
        'student_group',
      ].sort()
    );
  });

  it('gives a per-year cap a per-year key — otherwise the cap can never restart', () => {
    // «Участь в конференціях (мах.5)» is a limit per навчальний рік. A ONCE key
    // carries no year, so the same annual конференція could never be attended
    // again — and the cap would never reset (D25, owner 2026-09-17).
    const capped = SCIENCE_WORK_TYPES_2027.filter((d) => d.maxPerYear !== undefined);
    expect(capped.length).toBeGreaterThan(0);
    for (const def of capped) {
      expect(def.reuse, `${def.code} carries maxPerYear but not a yearly key`).toBe('YEARLY');
    }
  });

  it('shares a pool only where a work has co-authors', () => {
    const shared = SCIENCE_WORK_TYPES_2027.filter((d) => d.sharing === 'SHARED').map((d) => d.code);
    expect(shared.sort()).toEqual(
      [
        'article',
        'art_publication',
        'conference_paper',
        'ip_application',
        'monograph',
        'monograph_reissue',
      ].sort()
    );
  });
});

describe('D39/D47 — how each type is proved', () => {
  it('exactly the eight large or published documents are link only', () => {
    const linkOnly = SCIENCE_WORK_TYPES_2027.filter(
      (d) => d.linkRule === 'REQUIRED' && d.fileRule === 'NONE'
    ).map((d) => d.code);
    expect([...linkOnly].sort()).toEqual(
      [
        'article',
        'conference_paper',
        'editorial_board',
        'english_support',
        'intl_grant_program',
        'intl_project',
        'monograph',
        'monograph_reissue',
      ].sort()
    );
  });

  it('leaves every other type on the defaults (link or file)', () => {
    const others = SCIENCE_WORK_TYPES_2027.filter((d) => d.fileRule !== 'NONE');
    expect(others).toHaveLength(18);
    for (const d of others) {
      expect(d.linkRule).toBeUndefined();
      expect(d.fileRule).toBeUndefined();
    }
  });
});
