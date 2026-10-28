import { describe, expect, it } from 'vitest';
import { parseDeputies, parseStaffSheet } from './parse';
import { degreeFromList, matchDepartment, matchPeople } from './match';
import { compareStaffList, type CheckStaff } from './compare';

// Every shape below is one seen in edu-reference/staff.xlsx or the deputies
// document (2026-10-28).
const row = (n: number, ...cells: (string | number | null)[]) => ({
  row: n,
  cells: Array.from({ length: 8 }, (_, i) => (cells[i] == null ? null : String(cells[i]))),
});

describe('parseStaffSheet', () => {
  it('reads two rows per person and carries the кафедра on', () => {
    const out = parseStaffSheet([
      row(
        2,
        'Рик',
        'філософії і соціальної антропології',
        'штатний',
        1,
        'завідувач',
        'доцент',
        'кандидат',
        38
      ),
      row(
        3,
        'Сергій Миколайович',
        'імені професора І.П.Стогнія',
        null,
        null,
        null,
        null,
        'філософських наук'
      ),
      row(4, 'Герасимова', null, 'штатний', 0.25, 'професор', 'професор', 'доктор', 23),
      row(5, 'Ельвіра Миколаївна', null, null, null, null, null, 'філософських наук'),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      row: 2,
      lastName: 'Рик',
      names: 'Сергій Миколайович',
      department: 'філософії і соціальної антропології імені професора І.П.Стогнія',
      kind: 'штатний',
      rate: 1,
      position: 'завідувач',
      degreeLevel: 'кандидат',
      degreeField: 'філософських наук',
      experience: 38,
    });
    expect(out[1].department).toBe(out[0].department);
  });

  it('reads a person whose kind sits on the names row (rows 47 and 91)', () => {
    const out = parseStaffSheet([
      row(46, 'Хомич', 'політології та журналістики', 'штатний', 1, 'викладач', null, null, 2),
      row(47, 'Андрій Валерійович'),
      row(48, 'Панчук', null, null, null, null, null, null, 3),
      row(49, 'Юрій Павлович', null, 'сумісник', 0.5, 'доцент', 'доцент', 'кандидат', null),
    ]);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({
      lastName: 'Панчук',
      names: 'Юрій Павлович',
      kind: 'сумісник',
      rate: 0.5,
      experience: 3,
    });
  });

  it('joins a ступінь wrapped onto a third row', () => {
    const out = parseStaffSheet([
      row(
        710,
        'Пивовар',
        'теорії та методики фізичного виховання і спорту',
        'штатний',
        1,
        'доцент',
        'доцент',
        'кандидат наук з фізич',
        20
      ),
      row(711, 'Андрій Анатолійович', null, null, null, null, null, 'ного виховання і'),
      row(712, null, null, null, null, null, null, 'спорту'),
    ]);
    expect(out[0].degreeField).toBe('ного виховання і спорту');
    expect(degreeFromList(out[0].degreeLevel, out[0].degreeField)).toBe('cand_sport');
  });
});

describe('degreeFromList', () => {
  it('reads a ступінь cut mid-word across rows', () => {
    expect(degreeFromList('кандидат наук з дер', 'жавного управління')).toBe('cand_public_admin');
    expect(degreeFromList('доктор фізико-', 'математичних наук')).toBe('doc_physmath');
  });
  it('reads the PhD, the common branches and a typo', () => {
    expect(degreeFromList('доктор філософії ', null)).toBe('phd');
    expect(degreeFromList('кандидат', 'педагоігчних наук')).toBe('cand_pedagogy');
    expect(degreeFromList('доктор', 'історичних наук')).toBe('doc_history');
  });
  it('knows the level without a branch, and nothing from nothing', () => {
    expect(degreeFromList('доктор наук', null)).toBe('doc_?');
    expect(degreeFromList(null, null)).toBeNull();
  });
});

describe('matchDepartment', () => {
  const departments = [
    { name: 'Кафедра педагогіки, теорії і методики початкової освіти' },
    { name: 'Кафедра соціальних комунікацій, документознавства та інформаційної діяльності' },
  ];
  it('matches through the list’s typos', () => {
    expect(matchDepartment('педагогки, теорії і методики початкової освіти', departments)).toBe(
      departments[0]
    );
    expect(
      matchDepartment(
        'соціальних комунікацій, документо знавства та інформаційної діяльності',
        departments
      )
    ).toBe(departments[1]);
  });
  it('guesses nothing for an unknown name', () => {
    expect(matchDepartment('астрономії', departments)).toBeNull();
  });
});

describe('matchPeople — never by surname alone', () => {
  const p = (lastName: string, firstName: string, patronymic: string | null) => ({
    lastName,
    firstName,
    patronymic,
  });
  const people = [
    p('Троценко', 'Дмитро', 'Олександрович'),
    p('Троценко', 'Валерій', 'Володимирович'),
    p('Скибіцька', 'Діана', null),
    p('Самолюк', 'Віктор', 'Анатолійович'),
    p('Овсієнко', 'Анатолій', 'Миколайович'),
  ];
  it('matches the full ПІБ, and only the right Троценко', () => {
    expect(matchPeople('Троценко', 'Валерій Володимирович', people)).toEqual({
      people: [people[1]],
      how: 'exact',
    });
  });
  it('matches a missing по батькові', () => {
    expect(matchPeople('Скибіцька', 'Діана Григорівна', people)?.how).toBe('noPatronymic');
  });
  it('matches the list’s typos, saying so', () => {
    expect(matchPeople('Самолюк', 'Віктор Ананійович', people)).toEqual({
      people: [people[3]],
      how: 'typo',
    });
    expect(matchPeople('Овсієнко', 'Панатолій Миколайович', people)).toEqual({
      people: [people[4]],
      how: 'typo',
    });
  });
  it('matches nobody it is not sure of', () => {
    expect(matchPeople('Троценко', 'Тетяна Іванівна', people)).toBeNull();
  });
});

describe('parseDeputies', () => {
  it('reads units, wrapped names, several people and the faculty rows', () => {
    const text = [
      '|Факультет соціальних наук, бізнесу та адміністрування     |Костик Євгеній Петрович   |+380 |',
      '|Соціальних комунікацій, документознавства та інформаційної|Довжук Ігор Володимирович |+380 |',
      '|діяльності                                                |                          |     |',
      '|Обліку, оподаткування та бізнес-управління                |Вовченко Роман Сергійович |     |',
      '|                                                          |Перчук Оксана Володимирівна|    |',
    ].join('\n');
    expect(parseDeputies(text)).toEqual([
      {
        unit: 'Факультет соціальних наук, бізнесу та адміністрування',
        faculty: true,
        people: ['Костик Євгеній Петрович'],
      },
      {
        unit: 'Соціальних комунікацій, документознавства та інформаційної діяльності',
        faculty: false,
        people: ['Довжук Ігор Володимирович'],
      },
      {
        unit: 'Обліку, оподаткування та бізнес-управління',
        faculty: false,
        people: ['Вовченко Роман Сергійович', 'Перчук Оксана Володимирівна'],
      },
    ]);
  });
});

describe('compareStaffList', () => {
  const dept = {
    id: 'd1',
    name: 'Кафедра політології і журналістики',
    headId: 'kotsur',
    scienceDeputyId: null,
  };
  const person = (over: Partial<CheckStaff>): CheckStaff => ({
    id: 'kotsur',
    lastName: 'Коцур',
    firstName: 'Леся',
    patronymic: 'Михайлівна',
    isNpp: true,
    archived: false,
    departmentId: 'd1',
    partTimeDepartmentIds: [],
    position: 'DOCENT',
    academicTitle: 'DOCENT',
    pedagogicalExperience: 11,
    degreeKeys: ['doctor_unspecified'],
    ...over,
  });
  const placement = (over: object) => ({
    row: 21,
    lastName: 'Коцур',
    names: 'Леся Михайлівна',
    department: 'політології і журналістики',
    kind: 'штатний' as const,
    rate: 1,
    position: 'завідувач',
    title: 'доцент',
    degreeLevel: 'доктор',
    degreeField: 'політичних наук',
    experience: 12,
    ...over,
  });

  it('compares internal сумісництво as ONE ставка — the sum — and reports its shape', () => {
    const findings = compareStaffList({
      placements: [
        placement({}),
        placement({ row: 23, kind: 'сумісник', rate: 0.4, position: 'професор' }),
      ],
      deputies: [],
      departments: [dept],
      staff: [person({})],
      allocations: new Map([['kotsur|d1', 125]]),
    });
    const by = (c: string) => findings.filter((f) => f.category === c);
    expect(by('rateDiffers')).toEqual([expect.objectContaining({ list: '1,40', system: '1,25' })]);
    expect(by('internalPartTime')).toHaveLength(1);
    // Facts compared once, from the main placement
    expect(by('degreeUnspecified')).toEqual([
      expect.objectContaining({ list: 'доктор політичних наук (doc_politics)' }),
    ]);
    expect(by('experienceOneYear')).toHaveLength(1);
    expect(by('headNotSet')).toHaveLength(0);
  });

  it('sets a single deputy, leaves several and a факультет to the admin', () => {
    const findings = compareStaffList({
      placements: [],
      deputies: [
        { unit: 'Політології та журналістики', faculty: false, people: ['Коцур Леся Михайлівна'] },
        { unit: 'Політології та журналістики', faculty: false, people: ['А Б В', 'Г Д Е'] },
        { unit: 'Факультет соціальних наук', faculty: true, people: ['Ж З И'] },
      ],
      departments: [dept],
      staff: [person({})],
      allocations: new Map(),
    });
    expect(findings.map((f) => [f.category, f.staffId])).toEqual([
      ['deputyToSet', 'kotsur'],
      ['deputySeveral', null],
      ['deputyFaculty', null],
    ]);
  });
});
