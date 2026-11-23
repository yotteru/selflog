import { describe, expect, it } from 'vitest';
import { convertAmount, convertBasis, describeRecord, labelRecord, photoRecord, toAmounts } from './capture';
import type { SummaryItem } from './types';

// モックと同じ例：100gあたり 540kcal / P6.4 / F33.8 / C53.2、1袋 = 60g
const per100 = { kcal: 540, p: 6.4, f: 33.8, c: 53.2 };

describe('成分表示（受け入れ基準5）', () => {
  it('100gあたり × 45g', () => {
    expect(labelRecord(per100, 'per100g', 45)).toEqual({ kcal: 243, p: 2.9, f: 15.2, c: 23.9 });
  });
  it('1袋あたりに切り替えると、基準あたりの値が 60g 分に換算される', () => {
    const b = convertBasis(per100, 'per100g', 'per_unit', 60)!;
    expect(b.kcal).toBeCloseTo(324);
    expect(b.p).toBeCloseTo(3.84);
    expect(b.f).toBeCloseTo(20.28);
    expect(b.c).toBeCloseTo(31.92);
  });
  it('100g ⇔ 1袋 を往復しても値がずれない', () => {
    const back = convertBasis(convertBasis(per100, 'per100g', 'per_unit', 60)!, 'per_unit', 'per100g', 60)!;
    for (const k of ['kcal', 'p', 'f', 'c'] as const) expect(back[k]).toBeCloseTo(per100[k], 9);
  });
  it('切り替えても、同じ量を食べたなら記録する値は同じ', () => {
    const perBag = convertBasis(per100, 'per100g', 'per_unit', 60)!;
    const a = labelRecord(per100, 'per100g', 60);
    const b = labelRecord(perBag, 'per_unit', convertAmount(60, 'per100g', 'per_unit', 60));
    expect(b).toEqual(a);
    expect(labelRecord(perBag, 'per_unit', 2)).toEqual({ kcal: 648, p: 7.7, f: 40.6, c: 63.8 }); // 120g 分 = 100gあたり × 1.2
  });
  it('1袋あたり → 100gあたりにも戻せる', () => {
    expect(convertBasis({ kcal: 324, p: 3.6, f: 20.4, c: 31.8 }, 'per_unit', 'per100g', 60)).toEqual({ kcal: 540, p: 6, f: 34, c: 53 });
  });
  it('1つ分の重さが分からないと切り替えられない', () => {
    expect(convertBasis(per100, 'per100g', 'per_unit', null)).toBeNull();
  });
  it('食べた量が0や空なら0', () => {
    expect(labelRecord(per100, 'per100g', 0)).toEqual({ kcal: 0, p: 0, f: 0, c: 0 });
    expect(labelRecord(per100, 'per100g', NaN)).toEqual({ kcal: 0, p: 0, f: 0, c: 0 });
  });
  it('切り替え時の食べた量の初期値', () => {
    expect(convertAmount(120, 'per100g', 'per_unit', 60)).toBe(2);
    expect(convertAmount(1.5, 'per_unit', 'per100g', 60)).toBe(90);
    expect(convertAmount(45, 'per100g', 'per_unit', null)).toBe(1);
  });
});

describe('料理の写真', () => {
  it('分量 ×1.5', () => {
    expect(photoRecord({ kcal: 640, p: 42, f: 14, c: 82 }, 1.5)).toEqual({ kcal: 960, p: 63, f: 21, c: 123 });
  });
});

describe('toAmounts / describeRecord', () => {
  const items = [
    { target_id: 'k', key: 'kcal' },
    { target_id: 'p', key: 'p' },
    { target_id: 'm', key: 'money' },
    { target_id: 'x', key: null },
  ] as SummaryItem[];
  it('ターゲットIDに割り当て、0は入れない', () => {
    expect(toAmounts({ kcal: 120, p: 0, money: 150 }, items)).toEqual({ k: 120, m: 150 });
  });
  it('説明文', () => {
    expect(describeRecord({ kcal: 243.4, p: 2.9, f: 15.2, c: 23.9, money: 1280 })).toBe('243kcal · P2.9 F15.2 C23.9 · ¥1,280');
    expect(describeRecord({})).toBe('—');
  });
});
