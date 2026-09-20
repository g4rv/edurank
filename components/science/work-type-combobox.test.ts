import { describe, expect, it } from 'vitest';
import { variantLabel } from './work-type-combobox';
import type { PlanWorkType } from '@/components/science/add-plan-row-dialog';

const type = (label: string, shortLabel: string | null = null): PlanWorkType =>
  ({ label, shortLabel }) as unknown as PlanWorkType;

/**
 * Пункт 7 is the row this exists for: four види роботи, two of them opening
 * with the same 47 characters, which made the old single list unreadable.
 */
const P7 = 'Рецензування, експертна оцінка, опонування';

describe('variantLabel', () => {
  it('prefers the catalogue’s own short form', () => {
    // Most пункти have no heading their labels begin with: «Перемога у
    // конкурсі…» shares no prefix with «Участь у конкурсі…», so stripping
    // could never produce «Перемога у конкурсі».
    expect(
      variantLabel(
        type('Перемога у конкурсі проєктів та розробок', 'Перемога у конкурсі'),
        'Конкурс'
      )
    ).toBe('Перемога у конкурсі');
  });

  it('drops the пункт heading when the label opens with it', () => {
    expect(variantLabel(type(`${P7} дисертацій`), P7)).toBe('дисертацій');
  });

  it('drops it from the long one too', () => {
    expect(variantLabel(type(`${P7} монографій, підручників, навчальних посібників`), P7)).toBe(
      'монографій, підручників, навчальних посібників'
    );
  });

  it('leaves a label that does NOT start with the heading whole', () => {
    // «Рецензування міжнародних проєктів» shares a word with the heading and
    // not the heading itself — cutting a partial match would maim it.
    const label = 'Рецензування міжнародних проєктів';
    expect(variantLabel(type(label), P7)).toBe(label);
  });

  it('leaves everything whole when the пункт has no heading', () => {
    const label = 'Видання монографії, підручника, посібника';
    expect(variantLabel(type(label), '')).toBe(label);
  });

  it('never returns an empty string when the label IS the heading', () => {
    // A single-type пункт is seeded with its own label as the heading, so the
    // two match exactly. Showing nothing would be worse than repeating it.
    expect(variantLabel(type(P7), P7)).toBe(P7);
  });

  it('ignores punctuation between the heading and the rest', () => {
    expect(variantLabel(type('Рецензування: дисертацій'), 'Рецензування')).toBe('дисертацій');
  });
});
