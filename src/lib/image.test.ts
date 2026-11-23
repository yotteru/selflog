import { describe, expect, it } from 'vitest';
import { cropBox } from './image';

describe('cropBox', () => {
  it('切り抜いた範囲を、長辺1280pxまで縮小する', () => {
    // 12MP（4032x3024）の中央80%
    expect(cropBox(4032, 3024, { x: 0.1, y: 0.1, w: 0.8, h: 0.8 })).toEqual({
      sx: 403, sy: 302, sw: 3226, sh: 2419, dw: 1280, dh: 960,
    });
  });
  it('小さい画像は拡大しない', () => {
    expect(cropBox(800, 600, { x: 0, y: 0, w: 1, h: 1 })).toMatchObject({ dw: 800, dh: 600 });
  });
});
