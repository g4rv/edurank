import { describe, expect, it } from 'vitest';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, topicLabel } from './options';

describe('document types', () => {
  it('has a свідоцтво beside the довідка, сертифікат and диплом (owner, 2026-11-06)', () => {
    expect(DOCUMENT_TYPES).toContain('COMPLETION_CERTIFICATE');
    expect(DOCUMENT_TYPE_LABELS.COMPLETION_CERTIFICATE).toBe('Свідоцтво');
  });

  it('gives every type a Ukrainian label, so a new one cannot show as a bare key', () => {
    for (const type of DOCUMENT_TYPES) expect(DOCUMENT_TYPE_LABELS[type], type).toBeTruthy();
  });

  it('asks for a спеціальність only on a диплом; a свідоцтво names a тема like a сертифікат', () => {
    expect(topicLabel('DIPLOMA')).toBe('Спеціальність');
    expect(topicLabel('COMPLETION_CERTIFICATE')).toBe('Тема стажування');
    expect(topicLabel('CERTIFICATE')).toBe('Тема стажування');
  });
});
