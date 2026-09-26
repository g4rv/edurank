import { describe, expect, it } from 'vitest';
import {
  CROP_FRAME,
  CROP_ZOOM_MAX,
  clampOffset,
  clampZoom,
  coverScale,
  cropSource,
} from './avatar-crop';

describe('coverScale', () => {
  it('makes the shorter side exactly cover the frame', () => {
    expect(coverScale(1000, 1000)).toBe(CROP_FRAME / 1000);
    expect(coverScale(2000, 1000)).toBe(CROP_FRAME / 1000);
    expect(coverScale(1000, 4000)).toBe(CROP_FRAME / 1000);
  });
});

describe('cropSource', () => {
  it('takes the whole of a square picture at zoom 1', () => {
    expect(cropSource(1000, 1000, 1, { x: 0, y: 0 })).toEqual({ sx: 0, sy: 0, size: 1000 });
  });

  it('takes the middle of a wide picture at zoom 1', () => {
    // 2000×1000: the frame covers the height, so 500 px of width are cut off each side
    expect(cropSource(2000, 1000, 1, { x: 0, y: 0 })).toEqual({ sx: 500, sy: 0, size: 1000 });
  });

  it('shows a smaller area when zoomed in, centred on the same point', () => {
    const { sx, sy, size } = cropSource(1000, 1000, 2, { x: 0, y: 0 });
    expect(size).toBe(500);
    expect(sx).toBe(250);
    expect(sy).toBe(250);
  });

  it('moves the window the opposite way to the drag', () => {
    // Dragging the picture right shows more of its LEFT side.
    const still = cropSource(2000, 1000, 1, { x: 0, y: 0 });
    const dragged = cropSource(2000, 1000, 1, { x: 64, y: 0 });
    expect(dragged.sx).toBeLessThan(still.sx);
    expect(dragged.size).toBe(still.size);
  });
});

describe('clampOffset', () => {
  it('lets a wide picture move sideways but not up or down at zoom 1', () => {
    // The frame is 256 and the picture displays 512×256: 128 px of slack each way, none vertically
    expect(clampOffset({ x: 999, y: 999 }, 2000, 1000, 1)).toEqual({ x: 128, y: 0 });
    expect(clampOffset({ x: -999, y: -999 }, 2000, 1000, 1)).toEqual({ x: -128, y: 0 });
  });

  it('allows more room as the zoom grows, and never a gap inside the circle', () => {
    const offset = clampOffset({ x: 999, y: 999 }, 1000, 1000, 2);
    expect(offset).toEqual({ x: 128, y: 128 });
    // At the limit the window still lies inside the picture
    const { sx, sy, size } = cropSource(1000, 1000, 2, offset);
    expect(sx).toBeGreaterThanOrEqual(0);
    expect(sy).toBeGreaterThanOrEqual(0);
    expect(sx + size).toBeLessThanOrEqual(1000);
    expect(sy + size).toBeLessThanOrEqual(1000);
  });

  it('leaves an offset that already fits untouched', () => {
    expect(clampOffset({ x: 10, y: -20 }, 1000, 1000, 2)).toEqual({ x: 10, y: -20 });
  });
});

describe('clampZoom', () => {
  it('stays between 1 and the maximum', () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(99)).toBe(CROP_ZOOM_MAX);
  });
});
