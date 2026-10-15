import { describe, expect, it } from 'vitest';
import { fitWithin, isWorthKeeping, jpegName } from './compress-image';

describe('fitWithin', () => {
  it('scales the long side down and keeps the ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 6000)).toEqual({ width: 1000, height: 2000 });
  });
  it('never scales up', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('isWorthKeeping', () => {
  it('keeps only a strictly smaller result', () => {
    expect(isWorthKeeping(1000, 900)).toBe(true);
    expect(isWorthKeeping(1000, 1000)).toBe(false);
    expect(isWorthKeeping(1000, 0)).toBe(false);
  });
});

describe('jpegName', () => {
  it('swaps the extension', () => {
    expect(jpegName('scan.png')).toBe('scan.jpg');
    expect(jpegName('a.b.JPEG')).toBe('a.b.jpg');
    expect(jpegName('noext')).toBe('noext.jpg');
  });
});
