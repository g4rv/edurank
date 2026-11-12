import { describe, expect, it } from 'vitest';
import { extractDoi, isSamePublication, squash } from './duplicates';

const LINE =
  'Пангелова Н., Рижик Р., Юзковець І., Кравченко Т., Рубан В. Вплив оздоровчої рекреаційної рухової активності на фізичний стан підлітків. Спортивний вісник. 2026. №1.';

describe('extractDoi', () => {
  it('finds a DOI in a link or in plain text, in lower case', () => {
    expect(extractDoi('https://doi.org/10.32782/HBTS.83.1.18')).toBe('10.32782/hbts.83.1.18');
    expect(extractDoi('DOI: 10.24919/2519-058X.21.246901')).toBe('10.24919/2519-058x.21.246901');
  });

  it('drops a closing full stop or bracket, not part of the DOI', () => {
    expect(extractDoi('(doi 10.1109/SIST50301.2021.9465917).')).toBe(
      '10.1109/sist50301.2021.9465917'
    );
  });

  it('is null when there is no DOI', () => {
    expect(extractDoi('Просто бібліографічний опис без посилання')).toBeNull();
  });
});

describe('squash', () => {
  it('keeps letters and digits only, lower case', () => {
    expect(squash('48. Монографія · «Назва», 2026!')).toBe('48монографіяназва2026');
  });
});

describe('isSamePublication', () => {
  it('matches the same DOI whatever surrounds it', () => {
    expect(
      isSamePublication(
        'Автор А. Назва. Журнал. https://doi.org/10.1000/ABC.1',
        'Інший опис того ж.  DOI 10.1000/abc.1.'
      )
    ).toBe(true);
  });

  it('matches the same description even when the DOIs differ — the description decides', () => {
    expect(isSamePublication(`${LINE} 10.1000/a.1`, `${LINE} 10.1000/a.2`)).toBe(true);
    // a digit off in the pages, another prefix, a trailing full stop
    expect(
      isSamePublication(
        `${LINE} 10.52058/3041-1254-2026-5(27)-2754-2767`,
        `${LINE} 10.52058/3041-1254-2026-5(27)-2755-2767`
      )
    ).toBe(true);
    expect(
      isSamePublication(
        `${LINE} 10.32540/2071-1476-2026-1-09.`,
        `${LINE} 10.15802/2071-1476-2026-1-09`
      )
    ).toBe(true);
  });

  it('does not match two articles by the same authors that share a phrase of their titles', () => {
    const first =
      'Багно Ю.М., Сергійчук О.М. Особливості національно-патріотичного виховання дітей та молоді в умовах євроінтеграції. Вісник науки та освіти: журнал. № 3(33). 2025. С.771-786. · https://10.52058/2786-6165-2025-3(33)-771-786';
    const second =
      'співавторство · Багно Ю. Сергійчук О. Практико орієнтовні технології підготовки вчителя до національно-патріотичного виховання дітей та молоді. Наукові записки Вінницького державного педагогічного університету імені Михайла Коцюбинського. Серія: Педагогіка і психологія. №86. · DOI 10.31652/2415-7872-2026-86-37-43';
    expect(isSamePublication(first, second)).toBe(false);
  });

  it('does not match two different descriptions with different DOIs', () => {
    expect(
      isSamePublication(
        `${LINE} 10.1000/a.1`,
        'Коцур В., Войтенко Ю. Передумови та особливості змінюваності влади в Україні і країнах Балтії: політико-історичний аналіз. Суспільство. 2023. №4. 10.1000/a.2'
      )
    ).toBe(false);
  });

  it('falls back to the DOI only when one side has no description', () => {
    expect(isSamePublication('10.1000/a.1', `${LINE} 10.1000/a.1`)).toBe(true);
    expect(isSamePublication('10.1000/a.1', `${LINE} 10.1000/a.2`)).toBe(false);
  });

  it('does not match two different works that share a pasted DOI', () => {
    const other =
      'Воловик Л.М., Ковальська К.В. Екологічні виміри економічного розвитку регіонів світу у шкільному курсі географії. Освіта і наука. 2026. №4. С. 10-20.';
    const second =
      'Ковальська К.В., Давиденко М.М. Особливості інклюзивного навчання географії у закладах фахової передвищої освіти: проблеми та перспективи. Інноваційна педагогіка. 2026. Випуск 96.';
    expect(
      isSamePublication(`${other} DOI 10.32782/ip/96.9`, `${second} DOI 10.32782/ip/96.9`)
    ).toBe(false);
  });

  it('takes a bare DOI at its word when the other side has the same one', () => {
    expect(isSamePublication('10.32782/ip/96.9', `${LINE} https://doi.org/10.32782/IP/96.9`)).toBe(
      true
    );
  });

  it('matches the same description under another prefix', () => {
    expect(isSamePublication(`48.${LINE}`, LINE)).toBe(true);
    expect(isSamePublication(`монографія · ${LINE}`, `співавторство. ${LINE}`)).toBe(true);
  });

  it('reads the same either way round', () => {
    expect(isSamePublication(`${LINE} Додатково: DOI не вказано.`, LINE)).toBe(true);
    expect(isSamePublication(LINE, `${LINE} Додатково: DOI не вказано.`)).toBe(true);
  });

  it('does not match two different works', () => {
    expect(
      isSamePublication(
        LINE,
        'Коцур В., Войтенко Ю. Передумови та особливості змінюваності влади в Україні і країнах Балтії: політико-історичний аналіз. Суспільство. 2023. №4.'
      )
    ).toBe(false);
  });

  it('does not match on a short text, which matches by chance', () => {
    expect(isSamePublication('Назва статті. 2025.', 'Назва статті. 2025.')).toBe(false);
  });

  it('can be told to match on DOI alone', () => {
    expect(isSamePublication(LINE, `48.${LINE}`, { byText: false })).toBe(false);
    expect(
      isSamePublication(`${LINE} 10.1000/a.1`, `x ${LINE} 10.1000/A.1`, { byText: false })
    ).toBe(true);
  });
});
