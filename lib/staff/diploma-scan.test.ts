import { describe, expect, it } from 'vitest';
import { diplomaScanExtension, isDiplomaScanType } from './diploma-scan';
import { diplomaKeyFor, isDiplomaKeyOf } from '@/lib/science/r2';
import { looksLikeImage } from '@/lib/files/compress-image';

// A diploma scan may be any image (owner, 2026-11-23); what is stored is JPEG or PNG
describe('diploma scan types', () => {
  it('stores JPEG and PNG only — a PDF or an exotic type is refused by the server', () => {
    expect(isDiplomaScanType('image/jpeg')).toBe(true);
    expect(isDiplomaScanType('image/png')).toBe(true);
    for (const t of ['application/pdf', 'image/webp', 'image/gif', 'image/heic', '']) {
      expect(isDiplomaScanType(t)).toBe(false);
    }
  });

  it('keys follow the type, inside the owner folder', () => {
    expect(diplomaScanExtension('image/png')).toBe('png');
    expect(diplomaScanExtension('image/jpeg')).toBe('jpg');
    const png = diplomaKeyFor({ staffId: 'abc', extension: 'png' });
    expect(png).toMatch(/^diplomas\/abc\/[0-9a-f-]+\.png$/);
    expect(isDiplomaKeyOf('abc', png)).toBe(true);
    expect(isDiplomaKeyOf('other', png)).toBe(false);
    expect(diplomaKeyFor({ staffId: 'abc' })).toMatch(/\.jpg$/);
  });
});

describe('looksLikeImage — what the picker takes before converting', () => {
  it('goes by the type, or by the extension when the system gives none', () => {
    expect(looksLikeImage({ type: 'image/webp', name: 'x.webp' })).toBe(true);
    expect(looksLikeImage({ type: '', name: 'IMG_1.HEIC' })).toBe(true);
    expect(looksLikeImage({ type: '', name: 'scan.tiff' })).toBe(true);
    expect(looksLikeImage({ type: 'application/pdf', name: 'x.pdf' })).toBe(false);
    expect(looksLikeImage({ type: '', name: 'notes.docx' })).toBe(false);
  });
});
