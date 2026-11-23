import { describe as group, expect, it } from 'vitest';
import { applyAmounts, describe, presetSub } from './display';
import type { SummaryItem } from './types';

const item = (o: Partial<SummaryItem>): SummaryItem => ({
  target_id: 't',
  key: 'kcal',
  name: 'カロリー',
  unit: 'kcal',
  kind: 'cap',
  sort: 0,
  goal: 2200,
  used: 860,
  remaining: 1340,
  state: 'ok',
  ...o,
});

group('表示の文言（§3.4）', () => {
  it('上限型・残りあり：残り X（青）', () => {
    expect(describe(item({}), 'front')).toMatchObject({ label: '残り', value: '1,340kcal', tone: 'accent' });
  });
  it('上限型・超過：超過 X（オレンジ）', () => {
    const d = describe(item({ used: 2320, remaining: -120, state: 'over' }), 'front');
    expect(d).toMatchObject({ label: '超過', value: '120kcal', tone: 'over', over: true, frac: 0 });
  });
  it('上限型・ちょうど0は「残り 0」（達成ではない）', () => {
    expect(describe(item({ used: 2200, remaining: 0 }), 'front')).toMatchObject({ label: '残り', value: '0kcal', done: false });
  });
  it('到達型・未達：あと X', () => {
    const p = item({ key: 'p', unit: 'g', kind: 'reach', goal: 160, used: 88, remaining: 72 });
    expect(describe(p, 'front')).toMatchObject({ label: 'あと', value: '72g', done: false });
  });
  it('到達型・達成：達成 ✓（値なし）', () => {
    const p = item({ key: 'p', unit: 'g', kind: 'reach', goal: 160, used: 170, remaining: -10, state: 'done' });
    expect(describe(p, 'front')).toMatchObject({ label: '達成', value: '', done: true });
  });
  it('お金は ¥ を前に付ける', () => {
    const m = item({ key: 'money', unit: '円', goal: 1000, used: 580, remaining: 420 });
    expect(describe(m, 'front').value).toBe('¥420');
    expect(describe(m, 'back')).toMatchObject({ label: '使った', value: '¥580' });
  });
  it('裏：摂取 X / 目標（PFC）、カロリーは摂取量だけ', () => {
    const f = item({ key: 'f', unit: 'g', goal: 50, used: 32, remaining: 18 });
    expect(describe(f, 'back')).toMatchObject({ label: '摂取', value: '32g / 50g', tone: 'ink' });
    expect(describe(item({}), 'back')).toMatchObject({ label: '摂取', value: '860kcal' });
  });
  it('棒の長さ：表は残り、裏は摂取', () => {
    expect(describe(item({}), 'front').frac).toBeCloseTo(1340 / 2200);
    expect(describe(item({}), 'back').frac).toBeCloseTo(860 / 2200);
  });
});

group('applyAmounts', () => {
  it('足すと残りが減り、超過・達成の状態も変わる。引けば戻る', () => {
    const items = [item({ target_id: 'k' }), item({ target_id: 'p', key: 'p', kind: 'reach', goal: 160, used: 150, remaining: 10 })];
    const after = applyAmounts(items, { k: 1400, p: 20 });
    expect(after[0]).toMatchObject({ used: 2260, remaining: -60, state: 'over' });
    expect(after[1]).toMatchObject({ remaining: -10, state: 'done' });
    expect(applyAmounts(after, { k: 1400, p: 20 }, -1)).toEqual(items);
  });
});

group('presetSub', () => {
  const items = [
    item({ target_id: 'k', key: 'kcal' }),
    item({ target_id: 'p', key: 'p' }),
    item({ target_id: 'm', key: 'money' }),
  ];
  it('kcal とお金、お金が無ければ P', () => {
    expect(presetSub({ k: 180, m: 150 }, items)).toBe('180kcal · ¥150');
    expect(presetSub({ k: 120, p: 24 }, items)).toBe('120kcal · P24');
    expect(presetSub({}, items)).toBe('—');
  });
});
