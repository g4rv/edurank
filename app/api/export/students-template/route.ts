import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { auth } from '@/lib/auth';
import { STUDENT_DEGREE_LABELS, STUDENT_FUNDING_LABELS, STUDY_FORM_LABELS } from '@/lib/labels';
import { TEMPLATE_HEADERS } from '@/lib/students/import';

// The шаблон the деканат fills in — what makes «keep to one structure» real
// rather than a rule in an email.
//
// Its three enum columns carry Excel data validation, so a wrong «Форма» cannot
// be typed at all: the cell offers a dropdown and refuses anything else. That
// removes the single most common reason a file comes back rejected.
//
// The headers come from TEMPLATE_HEADERS — the same list the parser matches on,
// so the template cannot drift away from what the importer accepts. That
// includes «Спеціалізація», which is optional and blank on most rows: it is the
// shape the ЄДЕБО export already has, so two columns can be copied across
// rather than merged by hand.
//
// The proxy matcher excludes /api entirely, so this route authenticates itself.

/** Ukrainian labels of an enum, as a comma-joined Excel list formula */
function allowed(labels: Record<string, string>): string {
  return `"${Object.values(labels).join(',')}"`;
}

export async function GET() {
  const session = await auth();
  if (!session) return new NextResponse('Unauthorized', { status: 401 });
  if (session.user.role !== 'ADMIN') return new NextResponse('Forbidden', { status: 403 });

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Здобувачі');

  sheet.columns = TEMPLATE_HEADERS.map((h) => ({
    header: h.label,
    key: h.field,
    width: h.field === 'name' || h.field === 'speciality' || h.field === 'specialisation' ? 38 : 18,
  }));

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle' };

  // Two examples, so the wording is visible rather than described: one магістр
  // on контракт, one бакалавр on бюджет, and a спеціальність written the way
  // the register prints it.
  sheet.addRow({
    name: 'Бедій Валерія Миколаївна',
    degree: STUDENT_DEGREE_LABELS.MASTER,
    form: STUDY_FORM_LABELS.FULL_TIME,
    funding: STUDENT_FUNDING_LABELS.CONTRACT,
    speciality: 'C4 Психологія',
  });
  sheet.addRow({
    name: 'Ковальчук Олена Ігорівна',
    degree: STUDENT_DEGREE_LABELS.BACHELOR,
    form: STUDY_FORM_LABELS.PART_TIME,
    funding: STUDENT_FUNDING_LABELS.STATE,
    speciality: 'A3 Початкова освіта',
  });
  // The two-column case, and the reason the column exists: «A4 Середня освіта»
  // names no subject, and our норми price each subject apart — so a row like
  // this one is unreadable until the Спеціалізація cell says which.
  sheet.addRow({
    name: 'Петренко Іван Миколайович',
    degree: STUDENT_DEGREE_LABELS.BACHELOR,
    form: STUDY_FORM_LABELS.FULL_TIME,
    funding: STUDENT_FUNDING_LABELS.STATE,
    speciality: 'A4 Середня освіта',
    specialisation: 'A4.16 Захист України',
  });

  // Down to row 2000 — far past any one наказ, and the validation has to exist
  // on the empty rows, which is where the typing actually happens.
  const validations: [string, Record<string, string>, string][] = [
    ['B', STUDENT_DEGREE_LABELS, 'Оберіть ступінь зі списку'],
    ['C', STUDY_FORM_LABELS, 'Оберіть форму навчання зі списку'],
    ['D', STUDENT_FUNDING_LABELS, 'Оберіть джерело фінансування зі списку'],
  ];
  for (const [column, labels, message] of validations) {
    for (let row = 2; row <= 2000; row++) {
      sheet.getCell(`${column}${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [allowed(labels)],
        showErrorMessage: true,
        errorTitle: 'Недопустиме значення',
        error: message,
      };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="zdobuvachi-shablon.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
