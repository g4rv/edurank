import { describe, expect, it } from 'vitest';
import { sameWorkByText } from './similar-title';

// The descriptions are the real ones from the 2026-11-13 production copy: one
// збірник, several different articles, one shared link (owner's bug report).
const A =
  'Юхименко Н. Ціннісні пріоритети національної ідеї України. Консолідація суспільства як ключовий чинник національної стійкості й розвитку суб’єктності України. Збірник наукових праць. Переяслав, 2026. С. 118-120.';

describe('sameWorkByText — a copy of the same article', () => {
  it('is the same when only the punctuation and spacing differ', () => {
    expect(sameWorkByText(A, A.replace(/\./g, '').replace(/ /g, '  '))).toBe(true);
  });

  it('is the same when another author prefix is typed in front', () => {
    expect(sameWorkByText(A, 'Н. П. Юхименко, ' + A.replace('Юхименко Н. ', ''))).toBe(true);
    expect(sameWorkByText(A, A.replace('Юхименко Н. ', ''))).toBe(true);
  });

  it('survives one typo in a long description', () => {
    expect(sameWorkByText(A, A.replace('ключовий', 'ключови'))).toBe(true);
  });

  it('is the same when the page range is typed with another dash', () => {
    expect(sameWorkByText(A, A.replace('118-120', '118–120'))).toBe(true);
  });
});

describe('sameWorkByText — another article in the SAME збірник', () => {
  it('is different when the page ranges differ, though the tail is shared', () => {
    const other =
      'Рик С. Інша стаття з того ж збірника. Збірник наукових праць. Переяслав, 2026. С. 121-123.';
    expect(sameWorkByText(A, other)).toBe(false);
  });

  it('is different when the titles share only the collection tail', () => {
    const other =
      'Рик С. Формування цифрової компетентності вчителя. Збірник наукових праць. Переяслав, 2026.';
    expect(sameWorkByText(A, other)).toBe(false);
  });

  it('keeps bare titles of one collection apart', () => {
    expect(
      sameWorkByText(
        'Міжнародні стандарти та підходи до протидії і запобігання корупції',
        'Основні напрями розвитку системи управління екологічною безпекою України в контексті виконання євроінтеграційних зобов’язань'
      )
    ).toBe(false);
    expect(
      sameWorkByText(
        'Основні напрями розвитку системи управління екологічною безпекою України в контексті виконання євроінтеграційних зобов’язань',
        'Проблеми та виклики нормативно-правового забезпечення імплементації європейських принципів в Україні'
      )
    ).toBe(false);
  });
});

describe('sameWorkByText — short texts', () => {
  it('does not take a short phrase inside a longer title for the same work', () => {
    expect(sameWorkByText('Освіта дорослих', 'Освіта дорослих в умовах воєнного часу')).toBe(false);
  });

  it('still matches a short text that is the same words', () => {
    expect(sameWorkByText('Освіта дорослих.', 'освіта  дорослих')).toBe(true);
  });

  it('never matches an empty text', () => {
    expect(sameWorkByText('', A)).toBe(false);
    expect(sameWorkByText('   ', '...')).toBe(false);
  });
});

describe('sameWorkByText — numbers carry identity', () => {
  // Found in review (2026-11-13): «Частина 1» / «Частина 2» differ by ONE word,
  // which is over the share threshold for a title of ten words or more.
  const base = 'Формування цифрової компетентності майбутніх учителів у закладах вищої освіти';
  it('keeps «частина 1» and «частина 2» of one title apart', () => {
    expect(sameWorkByText(`${base}. Частина 1`, `${base}. Частина 2`)).toBe(false);
  });

  it('keeps two volumes or two years apart', () => {
    expect(sameWorkByText(`${base}, том 3, 2025`, `${base}, том 4, 2025`)).toBe(false);
    expect(sameWorkByText(`${base}, 2024`, `${base}, 2025`)).toBe(false);
  });

  it('still calls it a copy when the numbers are only missing on one side', () => {
    expect(sameWorkByText(`${base}. С. 118-120`, base)).toBe(true);
    expect(sameWorkByText(`${base}, 2026`, base)).toBe(true);
  });
});

// An apostrophe belongs to the word (owner, 2026-11-24): a кафедра's initiative topic was
// counted twice because one author typed «здоровя'збережувальної»
describe('sameWorkByText — apostrophes', () => {
  const WORD = 'здоров’язбережувальної';
  const TITLE = `Формування ${WORD} компетентності у дітей, учнівської та студентської молоді в системі безперервної освіти: медико-біологічні та психолого-педагогічні аспекти`;

  it('is the same when the apostrophe sits in another place or is another character', () => {
    for (const typed of [
      "здоровя'збережувальної",
      "здоров'язбережувальної",
      'здоровʼязбережувальної',
      'здоровязбережувальної',
    ]) {
      expect(sameWorkByText(TITLE, TITLE.replace(WORD, typed)), typed).toBe(true);
    }
  });

  it('still keeps two different titles apart', () => {
    expect(
      sameWorkByText(
        TITLE,
        'Формування цифрової компетентності вчителя в системі безперервної освіти: аспекти підготовки'
      )
    ).toBe(false);
  });

  it('does not let a quote mark glue two words together', () => {
    expect(
      sameWorkByText("Оцінювання 'якості' освіти в закладах", 'Оцінювання якості освіти в закладах')
    ).toBe(true);
  });
});
