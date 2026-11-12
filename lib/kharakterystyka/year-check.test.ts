import { describe, expect, it } from 'vitest';
import { yearProblem, yearsInDescription } from './year-check';

const WINDOW = { from: 2022 };

describe('yearsInDescription', () => {
  it('finds the year of a bibliographic description', () => {
    expect(
      yearsInDescription('Ryzhkov O. Agile methodology. IEEE SIST (Nur-Sultan, 28–30 Apr. 2021).')
    ).toEqual([2021]);
  });

  it('ignores a page range that looks like years', () => {
    expect(
      yearsInDescription('Остапчук О. Радянська пропаганда. Вісник. 2025. № 3(33). с. 2021-2032.')
    ).toEqual([2025]);
  });

  it('ignores a topic period in a title', () => {
    expect(
      yearsInDescription('Kotsur V. Privatization in Ukraine (1991–2004): Features. P. 100–109.')
    ).toEqual([]);
    expect(
      yearsInDescription('Мовна політика в УРСР у 1920-1930-ті рр.: історіографія. 2024.')
    ).toEqual([2024]);
  });

  it('reads the year out of a bare DOI, but not the pages at its end', () => {
    expect(yearsInDescription('https://doi.org/10.31470/2306-546X-2021-50-83-96')).toEqual([2021]);
    expect(
      yearsInDescription(
        'Автор. Назва. 2023. https://doi.org/10.52058/2786-6165-2025-3(33)-2021-2032'
      )
    ).toEqual([2023, 2025]);
  });

  it('does not read a year out of a longer number', () => {
    expect(yearsInDescription('Том 12345 Випуск 83. С. 20212')).toEqual([]);
  });

  it('returns each year once, ascending', () => {
    expect(yearsInDescription('2024 text 2021 text 2024')).toEqual([2021, 2024]);
  });
});

describe('yearProblem', () => {
  it('flags a publication older than the window', () => {
    expect(yearProblem('Автор. Назва. Журнал. 2021. №3.', WINDOW)).toEqual({
      latest: 2021,
      years: [2021],
    });
  });

  it('flags the newest year even when older ones are mentioned', () => {
    expect(
      yearProblem('Kalmykova (2019), cited in Mysan (2020). Psycholinguistic.', WINDOW)
    ).toEqual({
      latest: 2020,
      years: [2019, 2020],
    });
  });

  it('lets an old year stand beside a recent one', () => {
    expect(yearProblem('Назва про події 2019 року. Журнал. 2024. №1.', WINDOW)).toBeNull();
  });

  it('says nothing about a year inside the window', () => {
    expect(yearProblem('Автор. Назва. 2022.', WINDOW)).toBeNull();
    expect(yearProblem('Автор. Назва. 2026.', { from: 2022 })).toBeNull();
  });

  it('does not flag a year after the window', () => {
    expect(yearProblem('Автор. Том1 Випуск 83 2028', WINDOW)).toBeNull();
  });

  it('flags a description whose only year sits in its DOI', () => {
    expect(yearProblem('DOI 10.31392/NPU-nc.series15.2021.11-К(142).13', WINDOW)).toEqual({
      latest: 2021,
      years: [2021],
    });
  });

  it('says nothing about a description with no year', () => {
    expect(yearProblem('Просто назва без року', WINDOW)).toBeNull();
    expect(
      yearProblem('Kotsur V. Privatization in Ukraine (1991–2004). P. 100–109.', WINDOW)
    ).toBeNull();
  });

  it('follows the window it is given', () => {
    expect(yearProblem('Автор. Назва. 2022.', { from: 2023 })).not.toBeNull();
  });
});
