import { describe as group, expect, it } from 'vitest';
import { applyAmounts, describe, gauge, kindTag, presetSub, statusWord } from './display';
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
const p = (o: Partial<SummaryItem>) => item({ key: 'p', name: 'タンパク質', unit: 'g', kind: 'reach', goal: 160, ...o });

group('表示の文言（§3.4）', () => {
  it('上限型・残りあり：残り X（青）', () => {
    expect(describe(item({}), 'front')).toMatchObject({ label: '残り', value: '1,340kcal', tone: 'accent' });
  });
  it('上限型・超過：超過 X（オレンジ）', () => {
    expect(describe(item({ used: 2320, remaining: -120, state: 'over' }), 'front')).toMatchObject({ label: '超過', value: '120kcal', tone: 'over', over: true });
  });
  it('上限型・ちょうど0は「残り 0」（達成ではない）', () => {
    expect(describe(item({ used: 2200, remaining: 0 }), 'front')).toMatchObject({ label: '残り', value: '0kcal', done: false });
  });
  it('到達型・未達：あと X、達成：達成 ✓', () => {
    expect(describe(p({ used: 88, remaining: 72 }), 'front')).toMatchObject({ label: 'あと', value: '72g', done: false });
    expect(describe(p({ used: 170, remaining: -10, state: 'done' }), 'front')).toMatchObject({ label: '達成 ✓', value: '', done: true });
  });
  it('お金は ¥ を前に付ける。裏は使った額', () => {
    const m = item({ key: 'money', unit: '円', goal: 1000, used: 580, remaining: 420 });
    expect(describe(m, 'front').value).toBe('¥420');
    expect(describe(m, 'back')).toMatchObject({ label: '使った', value: '¥580' });
  });
  it('裏：摂取 X / 目標（PFC）、カロリーは摂取量だけ', () => {
    expect(describe(item({ key: 'f', unit: 'g', goal: 50, used: 32, remaining: 18 }), 'back')).toMatchObject({ label: '摂取', value: '32g / 50g', tone: 'ink' });
    expect(describe(item({}), 'back')).toMatchObject({ label: '摂取', value: '860kcal' });
  });
  it('週の目標：補足に期間と今日の量', () => {
    const m = item({ key: 'money', unit: '円', goal: 7000, used: 3760, remaining: 3240, period: 'week', period_start: '2026-11-17', day_used: 580 });
    expect(describe(m, 'front')).toMatchObject({ value: '¥3,240', sub: '今週（11/17〜）· 今日 ¥580' });
    expect(kindTag(m)).toBe('上限・週');
    expect(kindTag(p({}))).toBe('到達・日');
  });
});

group('ゲージ（どの型も満タンから減っていく）', () => {
  it('上限型：残りの割合', () => {
    expect(gauge(item({}))).toEqual({ fill: 1340 / 2200, over: 0, pct: '残61%' });
    expect(gauge(item({ used: 0 }))).toEqual({ fill: 1, over: 0, pct: '残100%' });
  });
  it('上限型：超えたら残り0で、超えた割合（25%で頭打ち）', () => {
    const g = gauge(item({ used: 2420 }));
    expect(g).toMatchObject({ fill: 0, pct: '+10%' });
    expect(g.over).toBeCloseTo(0.1);
    expect(gauge(item({ used: 6600 }))).toMatchObject({ fill: 0, over: 0.25, pct: '+200%' });
  });
  it('到達型：あとの割合が減っていき、届いたら空', () => {
    const g = gauge(p({ used: 88 }));
    expect(g).toMatchObject({ over: 0, pct: '残45%' });
    expect(g.fill).toBeCloseTo(72 / 160);
    expect(gauge(p({ used: 160 }))).toEqual({ fill: 0, over: 0, pct: '' });
  });
  it('目標が0', () => {
    expect(gauge(item({ goal: 0, used: 0 }))).toMatchObject({ fill: 1, pct: '残100%' });
    expect(gauge(item({ goal: 0, used: 5 }))).toMatchObject({ fill: 0, pct: '超過' });
  });
  it('状態の言葉', () => {
    expect(statusWord(item({ used: 860 }))).toBe('まだ余裕あり');
    expect(statusWord(item({ used: 1900 }))).toBe('あと少しで上限');
    expect(statusWord(item({ used: 2300 }))).toBe('超過');
  });
});

group('applyAmounts', () => {
  it('足すと残りが減り、超過・達成の状態も変わる。今日の量も増える。引けば戻る', () => {
    const items = [item({ target_id: 'k', day_used: 860 }), p({ target_id: 'p', used: 150, remaining: 10 })];
    const after = applyAmounts(items, { k: 1400, p: 20 });
    expect(after[0]).toMatchObject({ used: 2260, remaining: -60, state: 'over', day_used: 2260 });
    expect(after[1]).toMatchObject({ remaining: -10, state: 'done' });
    expect(applyAmounts(after, { k: 1400, p: 20 }, -1)).toEqual(items);
  });
});

group('presetSub', () => {
  const items = [item({ target_id: 'k', key: 'kcal' }), item({ target_id: 'p', key: 'p' }), item({ target_id: 'm', key: 'money' })];
  it('kcal とお金、お金が無ければ P', () => {
    expect(presetSub({ k: 180, m: 150 }, items)).toBe('180kcal · ¥150');
    expect(presetSub({ k: 120, p: 24 }, items)).toBe('120kcal · P24');
    expect(presetSub({}, items)).toBe('—');
  });
});
