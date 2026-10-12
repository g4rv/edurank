import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

describe('redirects for the removed permission screens', () => {
  it('sends the three old URLs to the division pages', async () => {
    const redirects = await nextConfig.redirects!();
    const to = (source: string) => redirects.find((r) => r.source === source)?.destination;
    expect(to('/admin/permissions/field')).toBe('/divisions');
    expect(to('/admin/permissions/entity')).toBe('/divisions');
    expect(to('/divisions/:id/edit')).toBe('/divisions/:id');
    expect(redirects.every((r) => r.permanent === false)).toBe(true);
  });
});
