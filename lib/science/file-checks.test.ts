import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { sha256Hex, sniffType, fileProblem, pdfPageCount, MAX_FILE_BYTES } from './file-checks';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

/**
 * Generates a valid PDF with 3 pages using pdf-lib's own API.
 * This ensures a correctly-formed PDF structure with proper xref table.
 */
async function makeThreePagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.addPage();
  doc.addPage();
  return doc.save();
}

describe('sniffType', () => {
  it('reads the bytes, not the name', () => {
    expect(sniffType(PDF)).toBe('application/pdf');
    expect(sniffType(PNG)).toBe('image/png');
    expect(sniffType(JPEG)).toBe('image/jpeg');
  });

  it('is null for anything else — an .exe renamed to .pdf is not a PDF', () => {
    expect(sniffType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
    expect(sniffType(new Uint8Array([]))).toBeNull();
  });
});

describe('sha256Hex', () => {
  it('is the same for the same bytes and different for one changed byte', () => {
    expect(sha256Hex(PDF)).toBe(sha256Hex(new Uint8Array(PDF)));
    expect(sha256Hex(PDF)).not.toBe(sha256Hex(PNG));
  });

  it('is lowercase hex of the right length', () => {
    expect(sha256Hex(PDF)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('pdfPageCount', () => {
  it('returns the page count for a valid PDF with 3 pages', async () => {
    const pdfBytes = await makeThreePagePdf();
    const count = await pdfPageCount(pdfBytes);
    expect(count).toBe(3);
  });

  it('returns null for non-PDF bytes', async () => {
    const nonPdfBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // MZ header (exe)
    const count = await pdfPageCount(nonPdfBytes);
    expect(count).toBeNull();
  });
});

describe('fileProblem', () => {
  it('refuses a type outside the list', () => {
    expect(fileProblem({ declaredType: 'application/zip', sizeBytes: 10 })).not.toBeNull();
  });

  it('refuses a file over the cap', () => {
    expect(
      fileProblem({ declaredType: 'application/pdf', sizeBytes: MAX_FILE_BYTES + 1 })
    ).not.toBeNull();
  });

  it('accepts a file exactly at the cap', () => {
    expect(fileProblem({ declaredType: 'application/pdf', sizeBytes: MAX_FILE_BYTES })).toBeNull();
  });

  it('refuses an empty file', () => {
    expect(fileProblem({ declaredType: 'application/pdf', sizeBytes: 0 })).not.toBeNull();
  });
});
