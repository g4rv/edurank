import { describe, expect, it } from 'vitest';
import { matchSupervisor, parseSupervisors } from './match-supervisor';

const STAFF = [
  { id: 'ou', lastName: 'Шапран', firstName: 'Ольга', patronymic: 'Іванівна' },
  { id: 'yu', lastName: 'Шапран', firstName: 'Юрій', patronymic: 'Петрович' },
  { id: 'kal', lastName: 'Калівошко', firstName: 'Ольга', patronymic: 'Миколаївна' },
  { id: 'pk', lastName: 'Пархоменко-Куцевіл', firstName: 'Оксана', patronymic: 'Ігорівна' },
  { id: 'pol', lastName: 'Поліщук', firstName: 'Віталій', patronymic: 'Васильович' },
  { id: 'piv', lastName: 'Пивовар', firstName: 'Андрій', patronymic: 'Анатолійович' },
];

describe('parseSupervisors — the cell as the аспірантура types it', () => {
  it('reads initials before or after the surname, and drops the degrees', () => {
    expect(parseSupervisors('д.пед.н., проф. Ю.П. Шапран')).toEqual([
      { surname: 'Шапран', initials: 'ЮП' },
    ]);
    expect(parseSupervisors('д.пед.н., проф. Доброскок І.І.')).toEqual([
      { surname: 'Доброскок', initials: 'ІІ' },
    ]);
    expect(parseSupervisors('д.н.з.держ.управ., проф.М.І.Карпа')).toEqual([
      { surname: 'Карпа', initials: 'МІ' },
    ]);
  });

  it('reads a surname with no initials', () => {
    expect(parseSupervisors('д. н. з держ. управ., проф. Пархоменко-Куцевіл')).toEqual([
      { surname: 'Пархоменко-Куцевіл', initials: '' },
    ]);
  });

  it('reads two керівники in one cell', () => {
    expect(
      parseSupervisors(
        'д.н. з фіз. виховання та спорту, проф. Пангелова Н.Є проф.; к.н. з фіз. виховання та спорту, доц. А.А.Пивовар'
      )
    ).toEqual([
      { surname: 'Пангелова', initials: 'НЄ' },
      { surname: 'Пивовар', initials: 'АА' },
    ]);
  });
});

describe('matchSupervisor — one НПП, or nobody', () => {
  it('tells two people with one surname apart by the initials', () => {
    expect(matchSupervisor({ surname: 'Шапран', initials: 'ЮП' }, STAFF)?.id).toBe('yu');
    expect(matchSupervisor({ surname: 'Шапран', initials: 'ОІ' }, STAFF)?.id).toBe('ou');
  });

  it('forgives one wrong letter in the surname', () => {
    expect(matchSupervisor({ surname: 'Калівошка', initials: 'ОМ' }, STAFF)?.id).toBe('kal');
  });

  it('refuses wrong initials rather than guess', () => {
    expect(matchSupervisor({ surname: 'Поліщук', initials: 'ІВ' }, STAFF)).toBeNull();
  });

  it('refuses a surname two people share when the cell gives no initials', () => {
    expect(matchSupervisor({ surname: 'Шапран', initials: '' }, STAFF)).toBeNull();
    expect(matchSupervisor({ surname: 'Пархоменко-Куцевіл', initials: '' }, STAFF)?.id).toBe('pk');
  });
});
