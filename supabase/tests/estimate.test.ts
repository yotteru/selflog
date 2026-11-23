import { describe, expect, it } from 'vitest';
import { extractJson, isMode, validateDraft } from '../functions/zanryo-estimate-nutrition/index';

describe('validateDraft（Gemini の返事の検証）', () => {
  it('料理の写真：範囲内ならそのまま、小数は1桁に', () => {
    expect(validateDraft('photo', { name: ' 鶏むね肉の定食 ', kcal: 640.26, p: 42, f: 14, c: 82, confidence: 'mid' })).toEqual({
      name: '鶏むね肉の定食', kcal: 640.3, p: 42, f: 14, c: 82, confidence: 'mid',
    });
  });
  it('料理の写真：範囲外・数値でないものは失敗（手入力へ）', () => {
    expect(validateDraft('photo', { name: 'x', kcal: 5000, p: 1, f: 1, c: 1, confidence: 'high' })).toBeNull();
    expect(validateDraft('photo', { name: 'x', kcal: 'たくさん', p: 1, f: 1, c: 1 })).toBeNull();
    expect(validateDraft('photo', { name: 'x', kcal: -1, p: 1, f: 1, c: 1 })).toBeNull();
    expect(validateDraft('photo', null)).toBeNull();
  });
  it('料理の写真：confidence が変なら low', () => {
    expect(validateDraft('photo', { name: '', kcal: 0, p: 0, f: 0, c: 0, confidence: '?' })).toMatchObject({ confidence: 'low' });
  });
  it('成分表示：100gあたりは 900kcal まで、1つ分は 3000kcal まで', () => {
    expect(validateDraft('label', { basis: 'per100g', unit_label: '100g', kcal: 540, p: 6.4, f: 33.8, c: 53.2 })).toMatchObject({ basis: 'per100g', unit_grams: null });
    expect(validateDraft('label', { basis: 'per100g', unit_label: '100g', kcal: 1200, p: 1, f: 1, c: 1 })).toBeNull();
    expect(validateDraft('label', { basis: 'per_unit', unit_label: '1袋', unit_grams: 60, kcal: 324, p: 3.8, f: 20.3, c: 31.9 })).toMatchObject({
      basis: 'per_unit', unit_label: '1袋', unit_grams: 60,
    });
    expect(validateDraft('label', { basis: 'weird', kcal: 1, p: 1, f: 1, c: 1 })).toBeNull();
  });
  it('レシート：合計は整数、品目は名前と金額があるものだけ、50件まで', () => {
    const r = validateDraft('receipt', {
      store: 'スーパー',
      total: 1280.4,
      items: [{ name: 'おにぎり', price: 150 }, { name: '', price: 10 }, { name: '値引', price: -50 }, { name: '牛乳', price: 'x' }],
    });
    expect(r).toEqual({ store: 'スーパー', total: 1280, items: [{ name: 'おにぎり', price: 150 }, { name: '値引', price: -50 }] });
    expect(validateDraft('receipt', { store: 'x', total: -1, items: [] })).toBeNull();
  });
});

describe('extractJson / isMode', () => {
  it('candidates の text を JSON として読む', () => {
    expect(extractJson({ candidates: [{ content: { parts: [{ text: '{"a":' }, { text: '1}' }] } }] })).toEqual({ a: 1 });
    expect(extractJson({ candidates: [] })).toBeNull();
    expect(extractJson({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] })).toBeNull();
  });
  it('mode', () => {
    expect(isMode('receipt')).toBe(true);
    expect(isMode('x')).toBe(false);
  });
});
