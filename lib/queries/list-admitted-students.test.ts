import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    admittedStudent: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { db } from '@/lib/db';
import {
  ADMITTED_PAGE_SIZE,
  admittedYears,
  findAcceptedStudent,
  listAdmittedStudents,
  registerRows,
  studentsMatching,
} from './list-admitted-students';

const findMany = db.admittedStudent.findMany as unknown as Mock;
const findFirst = db.admittedStudent.findFirst as unknown as Mock;
const count = db.admittedStudent.count as unknown as Mock;

/** What Prisma hands back for a row with its speciality joined in */
function row(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    name: 'Ковальчук Олена Ігорівна',
    degree: 'BACHELOR',
    form: 'FULL_TIME',
    funding: 'STATE',
    speciality: { name: 'Психологія' },
    ...over,
  };
}

const CRITERIA = {
  speciality: 'Психологія',
  form: 'FULL_TIME',
  funding: 'STATE',
} as const;

beforeEach(() => {
  findMany.mockReset();
  findFirst.mockReset();
  count.mockReset();
});

describe('registerRows', () => {
  it('flattens the joined speciality, so registerOptions gets plain rows', async () => {
    findMany.mockResolvedValue([row()]);

    await expect(registerRows(2026)).resolves.toEqual([
      {
        name: 'Ковальчук Олена Ігорівна',
        speciality: 'Психологія',
        degree: 'BACHELOR',
        form: 'FULL_TIME',
        funding: 'STATE',
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { year: 2026 } }));
  });
});

describe('studentsMatching', () => {
  it('asks for one year, one programme, one combination — and returns ПІБ only', async () => {
    findMany.mockResolvedValue([{ name: 'Андрієнко А. А.' }, { name: 'Бондар Б. Б.' }]);

    const names = await studentsMatching(2026, CRITERIA);

    expect(names).toEqual(['Андрієнко А. А.', 'Бондар Б. Б.']);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          year: 2026,
          form: 'FULL_TIME',
          funding: 'STATE',
          speciality: { name: 'Психологія' },
        },
      })
    );
  });
});

describe('findAcceptedStudent', () => {
  it('looks the ПІБ up normalised, not as typed', async () => {
    findFirst.mockResolvedValue(row());

    await findAcceptedStudent(2026, '  КОВАЛЬЧУК   Олена Ігорівна ', CRITERIA);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          year: 2026,
          nameNormalised: 'ковальчук олена ігорівна',
        }),
      })
    );
  });

  // The apostrophe is why both sides must use normaliseStudentName: a наказ
  // types О’лена with U+2019 and a person types О'лена with an ASCII quote.
  it('folds the apostrophe the claims normaliser folds', async () => {
    findFirst.mockResolvedValue(null);

    await findAcceptedStudent(2026, 'Мар’яна Іванівна Коваль', CRITERIA);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ nameNormalised: "мар'яна іванівна коваль" }),
      })
    );
  });

  it('flattens the joined speciality onto the row', async () => {
    findFirst.mockResolvedValue(row());

    await expect(findAcceptedStudent(2026, 'Ковальчук Олена Ігорівна', CRITERIA)).resolves.toEqual({
      id: 'c1',
      name: 'Ковальчук Олена Ігорівна',
      speciality: 'Психологія',
      degree: 'BACHELOR',
      form: 'FULL_TIME',
      funding: 'STATE',
    });
  });

  it('returns null when nothing matches', async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      findAcceptedStudent(2026, 'Вигаданий Ніхто Ніхтович', CRITERIA)
    ).resolves.toBeNull();
  });
});

describe('listAdmittedStudents', () => {
  it('pages 30 at a time and reports the total', async () => {
    count.mockResolvedValue(61);
    findMany.mockResolvedValue([row()]);

    const page = await listAdmittedStudents({ year: 2026, page: 3 });

    expect(ADMITTED_PAGE_SIZE).toBe(30);
    expect(page.total).toBe(61);
    expect(page.totalPages).toBe(3);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 60, take: 30 }));
  });

  // Twenty ПІБ repeat in the 2026 intake. Ordering by name alone would let a
  // page boundary between two of them drop one and repeat the other.
  it('sorts by ПІБ ascending by default, breaking ties on id', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await listAdmittedStudents({ year: 2026, page: 1 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ name: 'asc' }, { id: 'asc' }] })
    );
  });

  it('reverses the ПІБ sort on desc', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await listAdmittedStudents({ year: 2026, page: 1, sort: 'name', dir: 'desc' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ name: 'desc' }, { id: 'asc' }] })
    );
  });

  // Спеціальність sorts by НАЗВА: the code is a constant keyed by name and is
  // in no column, so SQL cannot order by it.
  it('sorts спеціальність through the joined name', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await listAdmittedStudents({ year: 2026, page: 1, sort: 'speciality', dir: 'desc' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ speciality: { name: 'desc' } }, { name: 'asc' }, { id: 'asc' }],
      })
    );
  });

  // Two values across a thousand rows, so the tie-break is doing all the work:
  // without `name` the rows inside «Бюджет» would come back in no order at all,
  // and without `id` a page boundary would drop some and repeat others.
  it.each(['funding', 'form', 'degree'] as const)(
    'sorts the %s enum with ПІБ and id underneath it',
    async (sort) => {
      count.mockResolvedValue(0);
      findMany.mockResolvedValue([]);

      await listAdmittedStudents({ year: 2026, page: 1, sort, dir: 'asc' });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ [sort]: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        })
      );
    }
  );

  it('leaves an absent filter out of the where clause entirely', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await listAdmittedStudents({ year: 2026, page: 1 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { year: 2026 } }));
  });

  it('applies every filter it is given', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await listAdmittedStudents({
      year: 2026,
      degree: 'MASTER',
      form: 'PART_TIME',
      funding: 'CONTRACT',
      specialityId: 'sp1',
      page: 1,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          year: 2026,
          degree: 'MASTER',
          form: 'PART_TIME',
          funding: 'CONTRACT',
          specialityId: 'sp1',
        },
      })
    );
  });

  // «петренко  о» must find «Петренко О.І.» — the person searching types what
  // they remember, not what the наказ spells.
  it('searches the normalised column, with the query normalised too', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await listAdmittedStudents({ year: 2026, search: '  ПЕТРЕНКО   О ', page: 1 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { year: 2026, nameNormalised: { contains: 'петренко о' } },
      })
    );
  });

  it('ignores a search that is only whitespace', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await listAdmittedStudents({ year: 2026, search: '   ', page: 1 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { year: 2026 } }));
  });

  it('never asks for a page below the first', async () => {
    count.mockResolvedValue(10);
    findMany.mockResolvedValue([]);

    await listAdmittedStudents({ year: 2026, page: 0 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }));
  });

  it('reports one page when the year is empty, so the pager stays hidden', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    const page = await listAdmittedStudents({ year: 2026, page: 1 });
    expect(page.totalPages).toBe(1);
  });
});

describe('admittedYears', () => {
  it('lists the years that have rows, newest first', async () => {
    findMany.mockResolvedValue([{ year: 2027 }, { year: 2026 }]);
    await expect(admittedYears()).resolves.toEqual([2027, 2026]);
  });
});
