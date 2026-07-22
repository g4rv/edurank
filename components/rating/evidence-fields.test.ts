import { describe, expect, it } from 'vitest';
import { toRenderItems } from './evidence-fields';
import { EVIDENCE_FIELDS, type EvidenceField } from '@/lib/rating/evidence-fields';

// The six materials are the gate checkboxes of item 5.1, read off its own specs
const MOODLE_MATERIALS = EVIDENCE_FIELDS.moodle_course
  .filter((f) => f.kind === 'checkbox' && f.mustBeTrue)
  .map((f) => f.name);

const box = (name: string, group?: string): EvidenceField => ({
  kind: 'checkbox',
  name,
  label: name,
  ...(group ? { group } : {}),
});

const text = (name: string): EvidenceField => ({ kind: 'text', name, label: name });

describe('toRenderItems', () => {
  it('leaves ungrouped fields alone', () => {
    const items = toRenderItems([text('a'), box('b'), text('c')]);
    expect(items.map((i) => i.kind)).toEqual(['single', 'single', 'single']);
  });

  it('folds consecutive boxes of the same group into one block', () => {
    const items = toRenderItems([text('a'), box('b', 'G'), box('c', 'G'), text('d')]);
    expect(items.map((i) => i.kind)).toEqual(['single', 'group', 'single']);
    const group = items[1];
    expect(group.kind === 'group' && group.title).toBe('G');
    expect(group.kind === 'group' && group.fields.map((f) => f.name)).toEqual(['b', 'c']);
  });

  it('keeps different groups apart', () => {
    const items = toRenderItems([box('a', 'G1'), box('b', 'G2')]);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind === 'group')).toBe(true);
  });

  // Only adjacent boxes merge, so a spec change that separates them is visible
  // rather than silently producing one block with a field missing from between
  it('does not merge across an intervening field', () => {
    const items = toRenderItems([box('a', 'G'), text('mid'), box('b', 'G')]);
    expect(items.map((i) => i.kind)).toEqual(['group', 'single', 'group']);
  });

  it('never loses or duplicates a field', () => {
    for (const [code, fields] of Object.entries(EVIDENCE_FIELDS)) {
      const flat = toRenderItems(fields).flatMap((i) =>
        i.kind === 'single' ? [i.field.name] : i.fields.map((f) => f.name)
      );
      expect(flat, code).toEqual(fields.map((f) => f.name));
    }
  });

  it('groups all six Moodle materials under one heading', () => {
    const items = toRenderItems(EVIDENCE_FIELDS.moodle_course);
    const groups = items.filter((i) => i.kind === 'group');
    expect(groups).toHaveLength(1);

    const group = groups[0];
    expect(group.kind === 'group' && group.title).toBe('Матеріали курсу');
    expect(MOODLE_MATERIALS).toHaveLength(6);
    expect(group.kind === 'group' && group.fields.map((f) => f.name)).toEqual(MOODLE_MATERIALS);
  });
});
