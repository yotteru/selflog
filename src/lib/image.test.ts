import { describe, expect, it } from 'vitest';
import { cropBox, fitSize } from './image';
import { resizeRect } from '../components/Cropper';

describe('cropBox', () => {
  it('切り抜いた範囲を、長辺2048px・約250万画素まで縮小する', () => {
    // 12MP（4032x3024）の中央80% → 3226x2419 は 780万画素なので、250万画素に収まるよう縮める
    const b = cropBox(4032, 3024, { x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    expect(b).toMatchObject({ sx: 403, sy: 302, sw: 3226, sh: 2419 });
    expect(b.dw * b.dh).toBeLessThanOrEqual(2_500_000);
    expect(b.dw / b.dh).toBeCloseTo(3226 / 2419, 2);
  });
  it('細長いレシートは、幅をつぶしすぎない（長辺2048px）', () => {
    // 縦の写真（3024x4032）から、幅の4割・高さの9割を切り抜く
    const b = cropBox(3024, 4032, { x: 0.3, y: 0.05, w: 0.4, h: 0.9 });
    expect(b.dh).toBe(2048);
    expect(b.dw).toBeGreaterThan(600);
  });
  it('小さい画像は拡大しない', () => {
    expect(cropBox(800, 600, { x: 0, y: 0, w: 1, h: 1 })).toMatchObject({ dw: 800, dh: 600 });
  });
  it('写真の外にはみ出さない', () => {
    const b = cropBox(1000, 1000, { x: 0.5, y: 0.5, w: 0.50001, h: 0.5 });
    expect(b.sx + b.sw).toBeLessThanOrEqual(1000);
  });
});

describe('fitSize（写真を画面の枠に収める）', () => {
  it('細長い写真は高さに合わせる', () => {
    expect(fitSize(800, 2100, 354, 490)).toEqual({ w: 186, h: 490 });
  });
  it('横長の写真は幅に合わせる', () => {
    expect(fitSize(4032, 3024, 354, 490)).toEqual({ w: 354, h: 265 });
  });
});

describe('resizeRect（四すみで大きさを変える）', () => {
  const s = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
  it('左上の角：右下は動かない', () => {
    const r = resizeRect(s, 'nw', 0.2, 0.3);
    expect(r.x).toBeCloseTo(0.3);
    expect(r.y).toBeCloseTo(0.4);
    expect(r.x + r.w).toBeCloseTo(0.9);
    expect(r.y + r.h).toBeCloseTo(0.9);
  });
  it('写真の外や、小さすぎる枠にはならない', () => {
    const r = resizeRect(s, 'se', 5, -5);
    expect(r.x + r.w).toBeCloseTo(1);
    expect(r.h).toBeCloseTo(0.08);
    expect(resizeRect(s, 'nw', -5, -5)).toMatchObject({ x: 0, y: 0 });
  });
});
