import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import ExcelJS from 'exceljs';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: { staff: { findUnique: vi.fn() }, qualification: { findMany: vi.fn() } },
}));
// Partial: the real list-params reader needs this module's `STAFF_SORT_FIELDS`.
vi.mock('@/lib/queries/list-staff', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/list-staff')>()),
  listStaff: vi.fn(),
}));
vi.mock('@/lib/qualifications/access', () => ({ canViewAnyQualifications: vi.fn() }));
vi.mock('@/lib/log', () => ({ logError: vi.fn(), logWarning: vi.fn() }));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { listStaff } from '@/lib/queries/list-staff';
import { canViewAnyQualifications } from '@/lib/qualifications/access';
import { fileNameFromDisposition } from '@/lib/export/file-names';
import { GET } from './route';

const mockAuth = auth as unknown as Mock;
const mockAllowed = canViewAnyQualifications as unknown as Mock;
const mockFindStaff = db.staff.findUnique as unknown as Mock;
const mockFindMany = db.qualification.findMany as unknown as Mock;
const mockListStaff = listStaff as unknown as Mock;

const person = (id: string, lastName: string, over: Record<string, unknown> = {}) => ({
  id,
  isNpp: true,
  lastName,
  firstName: 'Іван',
  patronymic: 'Іванович',
  department: { name: 'Кафедра ботаніки' },
  partTimeDepartments: [],
  ...over,
});

const record = (staffId: string, topic: string, over: Record<string, unknown> = {}) => ({
  staffId,
  kind: 'TRAINING',
  institution: 'Університет',
  documentType: 'CERTIFICATE',
  series: null,
  number: '1',
  topic,
  issuedOn: new Date('2025-05-20T00:00:00.000Z'),
  creditsHundredths: 300,
  fileKey: null,
  ...over,
});

const call = (qs = '') => GET(new Request(`http://localhost/api/export/qualifications${qs}`));

async function sheetOf(response: Response) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
  return wb.worksheets[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: 'a1' } });
  mockAllowed.mockResolvedValue(true);
  mockFindMany.mockResolvedValue([]);
});

describe('who may export', () => {
  it('refuses nobody-signed-in with 401', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it('refuses everybody who cannot read the records with 403, and reads nothing', async () => {
    mockAllowed.mockResolvedValue(false);
    expect((await call()).status).toBe(403);
    expect((await call('?staffId=x')).status).toBe(403);
    expect(mockListStaff).not.toHaveBeenCalled();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('asks the same rule the tab does', async () => {
    mockListStaff.mockResolvedValue([]);
    await call();
    expect(mockAllowed).toHaveBeenCalledWith({ id: 'a1', role: 'ADMIN', staffId: 'a1' });
  });
});

describe('one НПП (?staffId=)', () => {
  it('exports that person’s records, named after them', async () => {
    mockFindStaff.mockResolvedValue(person('s1', 'Петренко'));
    mockFindMany.mockResolvedValue([record('s1', 'Тема А'), record('s1', 'Тема Б')]);
    const response = await call('?staffId=s1');
    expect(response.status).toBe(200);
    expect(fileNameFromDisposition(response.headers.get('Content-Disposition'))).toBe(
      'Петренко Іван Іванович - Підвищення кваліфікації.xlsx'
    );
    const sheet = await sheetOf(response);
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getCell('I2').value).toBe('Тема А');
    expect(mockFindMany.mock.calls[0][0].where).toEqual({ staffId: { in: ['s1'] } });
    // Never the whole list for a single-person request.
    expect(mockListStaff).not.toHaveBeenCalled();
  });

  it('is 404 for an unknown person and for an administrative one', async () => {
    mockFindStaff.mockResolvedValue(null);
    expect((await call('?staffId=nope')).status).toBe(404);
    mockFindStaff.mockResolvedValue(person('s2', 'Адмінов', { isNpp: false }));
    expect((await call('?staffId=s2')).status).toBe(404);
  });
});

describe('the staff list', () => {
  it('exports the listed НПП in the list’s order, skipping people with no records', async () => {
    mockListStaff.mockResolvedValue([
      person('s2', 'Бойко'),
      person('s1', 'Андрієнко'),
      person('s3', 'Без записів'),
      person('adm', 'Адмінов', { isNpp: false }),
    ]);
    mockFindMany.mockResolvedValue([record('s1', 'Тема 1'), record('s2', 'Тема 2')]);
    const sheet = await sheetOf(await call());

    expect(sheet.rowCount).toBe(3);
    // Бойко first — the order the list gave, not alphabetical by this route.
    expect(String(sheet.getCell('B2').value)).toContain('Бойко');
    expect(String(sheet.getCell('B3').value)).toContain('Андрієнко');
    // Only НПП are looked up: an administrative account has no records.
    expect(mockFindMany.mock.calls[0][0].where.staffId.in).toEqual(['s2', 's1', 's3']);
  });

  // The button hands over the page's own query string, and the route reads it
  // with the reader the page uses — so the file is the filtered list.
  it('applies the filters the /staff page is on', async () => {
    mockListStaff.mockResolvedValue([]);
    await call('?q=ivan&dept=d1&faculty=f1&partTime=1&sort=email&dir=desc');
    expect(mockListStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'ivan',
        departmentId: 'd1',
        facultyId: 'f1',
        partTime: true,
        sort: 'email',
        dir: 'desc',
        archived: 'exclude',
      })
    );
  });

  it('exports the archive when the page is showing it', async () => {
    mockListStaff.mockResolvedValue([]);
    await call('?archived=1');
    expect(mockListStaff).toHaveBeenCalledWith(expect.objectContaining({ archived: 'only' }));
  });

  it('names the кафедри a сумісник holds', async () => {
    mockListStaff.mockResolvedValue([
      person('s1', 'Петренко', {
        partTimeDepartments: [{ department: { name: 'Кафедра екології' } }],
      }),
    ]);
    mockFindMany.mockResolvedValue([record('s1', 'Тема')]);
    const sheet = await sheetOf(await call());
    expect(sheet.getCell('C2').value).toBe('Кафедра ботаніки + Кафедра екології');
  });

  it('puts a person’s newest record first', async () => {
    mockListStaff.mockResolvedValue([person('s1', 'Петренко')]);
    mockFindMany.mockResolvedValue([record('s1', 'Нова'), record('s1', 'Стара')]);
    await call();
    expect(mockFindMany.mock.calls[0][0].orderBy).toEqual([
      { issuedOn: 'desc' },
      { createdAt: 'desc' },
    ]);
  });

  it('answers 500, not an exception, when the query fails', async () => {
    mockListStaff.mockRejectedValue(new Error('db down'));
    expect((await call()).status).toBe(500);
  });
});
