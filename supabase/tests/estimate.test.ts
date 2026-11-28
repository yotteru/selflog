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

import { capConfidence, extractJsonLoose, extractSources, jstToday, lookupPrompt, normalizeQuery, validateLookup } from '../functions/zanryo-estimate-nutrition/index';

describe('名前で調べる', () => {
  it('調べる言葉：改行や制御文字を消し、60文字まで。空はだめ', () => {
    expect(normalizeQuery('  吉野家\n牛丼\t並盛 ')).toBe('吉野家 牛丼 並盛');
    expect(normalizeQuery('a'.repeat(100))).toHaveLength(60);
    expect(normalizeQuery('   ')).toBeNull();
    expect(normalizeQuery(123)).toBeNull();
  });
  it('指示文に言葉が入り、検索つきは根拠の文と JSON を書くよう指示する', () => {
    expect(lookupPrompt('吉野家 牛丼', true)).toContain('「吉野家 牛丼」');
    expect(lookupPrompt('x', true)).toContain('どのページ（いつの情報か）に何と書いてあったか');
    expect(lookupPrompt('x', true)).toContain('JSON を書く');
    expect(lookupPrompt('x', false)).not.toContain('JSON を書く');
  });
  it('古い情報を避ける：今日の日付を伝え、検索の言葉に年を入れ、新しいページを使うよう頼む', () => {
    const t = lookupPrompt('吉野家 牛丼', true, '2026年11月28日');
    expect(t).toContain('今日は2026年11月28日');
    expect(t).toContain('「2026」');
    expect(t).toContain('いちばん新しいもの');
    expect(t).toContain('"as_of"');
    expect(lookupPrompt('x', false, '2026年11月28日')).toContain('知識が古い可能性');
  });
  it('日本時間の今日（UTC の夜は翌日）', () => {
    expect(jstToday(new Date('2026-11-27T15:30:00Z'))).toBe('2026年11月28日');
    expect(jstToday(new Date('2026-11-27T14:30:00Z'))).toBe('2026年11月27日');
  });
  it('検索せずに出した値は high にしない', () => {
    const d = validateLookup({ name: 'x', serving: '', kcal: 100, p: 1, f: 1, c: 1, price: null, confidence: 'high', as_of: '2024年5月' })!;
    expect(d.as_of).toBe('2024年5月');
    expect(capConfidence(d).confidence).toBe('mid');
  });
  it('検証：範囲内なら通す。値段は整数、無ければ null', () => {
    expect(validateLookup({ name: '牛丼', serving: '並盛 1杯', kcal: 635, p: 19.5, f: 20.4, c: 92.8, price: 498, confidence: 'high' })).toEqual({
      name: '牛丼', serving: '並盛 1杯', kcal: 635, p: 19.5, f: 20.4, c: 92.8, price: 498, confidence: 'high', as_of: '',
    });
    expect(validateLookup({ name: 'x', serving: '', kcal: 100, p: 1, f: 1, c: 1, price: null })).toMatchObject({ price: null, confidence: 'low' });
    expect(validateLookup({ name: 'x', serving: '', kcal: 100, p: 1, f: 1, c: 1, price: 'わからない' })).toMatchObject({ price: null });
    expect(validateLookup({ name: 'x', kcal: 9999, p: 1, f: 1, c: 1 })).toBeNull();
  });
  it('文章の中の JSON を取り出す（``` で囲まれていても）', () => {
    const body = { candidates: [{ content: { parts: [{ text: 'はい。\n```json\n{"name":"牛丼","kcal":635}\n```' }] } }] };
    expect(extractJsonLoose(body)).toEqual({ name: '牛丼', kcal: 635 });
    expect(extractJsonLoose({ candidates: [{ content: { parts: [{ text: '分かりません' }] } }] })).toBeNull();
  });
  it('出典：https だけ、重複なし、3件まで', () => {
    const web = (uri: string, title = 't') => ({ web: { uri, title } });
    const body = {
      candidates: [{ groundingMetadata: { groundingChunks: [web('https://a.example/1', '吉野家'), web('http://b.example'), web('https://a.example/1'), web('https://c.example'), web('https://d.example'), web('https://e.example')] } }],
    };
    expect(extractSources(body)).toEqual([
      { uri: 'https://a.example/1', title: '吉野家' },
      { uri: 'https://c.example', title: 't' },
      { uri: 'https://d.example', title: 't' },
    ]);
    expect(extractSources({})).toEqual([]);
  });
});

import { errorHint, quotaName, searchQueries, searchQueryCount } from '../functions/zanryo-estimate-nutrition/index';

describe('429 の種類', () => {
  it('当たった上限の名前を取り出す', () => {
    const normal = { error: { details: [{ violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests' }] }] } };
    expect(quotaName(normal)).toBe('generate_content_free_tier_requests');
    expect(quotaName({ error: { message: 'x' } })).toBeNull();
  });
  it('エラーの手がかり：上限の名前、なければエラー文の先頭（英数字だけ・100文字まで）', () => {
    expect(errorHint({ error: { details: [{ violations: [{ quotaMetric: 'x/generate_content_free_tier_requests' }] }] } })).toBe('generate_content_free_tier_requests');
    expect(errorHint({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Resource has been exhausted (e.g. check quota). 日本語' } })).toBe('RESOURCE_EXHAUSTED Resource has been exhausted (e.g. check quota).');
    expect(errorHint([{ error: { status: 'RESOURCE_EXHAUSTED' } }])).toBe('RESOURCE_EXHAUSTED');
    expect(errorHint({ error: { message: 'a'.repeat(300) } })).toHaveLength(100);
    expect(errorHint(null)).toBe('unknown');
  });
  it('実際に検索した回数', () => {
    expect(searchQueryCount({ candidates: [{ groundingMetadata: { webSearchQueries: ['吉野家 牛丼 並盛 カロリー'] } }] })).toBe(1);
    expect(searchQueryCount({ candidates: [{}] })).toBe(0);
  });
  it('検索に使った言葉：重複なし・3件まで・60文字まで', () => {
    const body = { candidates: [{ groundingMetadata: { webSearchQueries: ['吉野家 牛丼 カロリー', '吉野家 牛丼 カロリー', 'a'.repeat(100), 'x', 'y', 1] } }] };
    expect(searchQueries(body)).toEqual(['吉野家 牛丼 カロリー', 'a'.repeat(60), 'x']);
    expect(searchQueries({})).toEqual([]);
  });
  it('文章のあとの JSON を取り出す（根拠の文が先にあっても）', () => {
    const body = { candidates: [{ content: { parts: [{ text: '吉野家の公式サイトでは、牛丼並盛は635kcal。\n{"name":"吉野家 牛丼 並盛","kcal":635}' }] } }] };
    expect(extractJsonLoose(body)).toEqual({ name: '吉野家 牛丼 並盛', kcal: 635 });
  });
});
