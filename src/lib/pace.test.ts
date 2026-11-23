import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });

import { dayElapsed, paceFor, paceOf, periodElapsed, setShowPace, showPace } from './pace';
import type { SummaryItem } from './types';

const jst = (s: string) => Date.parse(`${s}+09:00`);
const kcal = (o: Partial<SummaryItem> = {}): SummaryItem => ({
  target_id: 'k', key: 'kcal', name: 'カロリー', unit: 'kcal', kind: 'cap', sort: 0, goal: 2200, used: 860, remaining: 1340, state: 'ok', ...o,
});

beforeEach(() => store.clear());

describe('過ぎた割合', () => {
  it('1日は朝4:00が0、翌朝4:00の直前が1に近い', () => {
    expect(dayElapsed(jst('2026-11-23T04:00:00'))).toBe(0);
    expect(dayElapsed(jst('2026-11-23T16:00:00'))).toBeCloseTo(0.5);
    expect(dayElapsed(jst('2026-11-23T19:00:00'))).toBeCloseTo(15 / 24);
    expect(dayElapsed(jst('2026-11-24T03:00:00'))).toBeCloseTo(23 / 24);
  });
  it('週：月曜の朝4:00が0。水曜の正午（朝4:00から8時間）なら (2 + 8/24) / 7', () => {
    expect(periodElapsed(jst('2026-11-25T12:00:00'), 'week', '2026-11-23', '2026-11-29')).toBeCloseTo((2 + 8 / 24) / 7);
  });
  it('月：30日の月の16日の朝4:00なら 15/30。終わった期間は1', () => {
    expect(periodElapsed(jst('2026-11-16T04:00:00'), 'month', '2026-11-01', '2026-11-30')).toBeCloseTo(15 / 30);
    expect(periodElapsed(jst('2026-12-02T10:00:00'), 'month', '2026-11-01', '2026-11-30')).toBe(1);
  });
});

describe('目安と比べた一言', () => {
  it('上限型：目安より使っていなければ余裕、使っていれば使いすぎ', () => {
    // 19:00 → 15/24 過ぎた。目安の使用量 2200×0.625=1375、使ったのは 860 → 515 余裕
    expect(paceOf(kcal(), 15 / 24)).toMatchObject({ text: '目安より 515kcal 余裕', tone: 'ahead' });
    expect(paceOf(kcal({ used: 1800 }), 15 / 24)).toMatchObject({ text: '目安より 425kcal 使いすぎ', tone: 'behind' });
    expect(paceOf(kcal(), 15 / 24).marker).toBeCloseTo(9 / 24);
  });
  it('差が目標の5%以内なら目安どおり', () => {
    expect(paceOf(kcal({ used: 1300 }), 15 / 24)).toMatchObject({ text: '目安どおり', tone: 'even' });
  });
  it('到達型：遅れ／先行', () => {
    const p = { key: 'p' as const, unit: 'g', kind: 'reach' as const, goal: 160 };
    expect(paceOf({ ...p, used: 88 }, 15 / 24)).toMatchObject({ text: '目安より 12g 遅れ', tone: 'behind' });
    expect(paceOf({ ...p, used: 140 }, 15 / 24)).toMatchObject({ text: '目安より 40g 先行', tone: 'ahead' });
  });
  it('超過・達成', () => {
    expect(paceOf(kcal({ used: 2300 }), 0.5)).toMatchObject({ tone: 'over' });
    expect(paceOf({ key: 'p', unit: 'g', kind: 'reach', goal: 160, used: 170 }, 0.5)).toMatchObject({ tone: 'done' });
  });
  it('過去の日を見ているときは出さない', () => {
    const now = jst('2026-11-23T19:00:00');
    expect(paceFor(kcal(), '2026-11-22', now)).toBeNull();
    expect(paceFor(kcal(), '2026-11-23', now)).not.toBeNull();
  });
});

describe('ペースの目安を出すか（この端末に保存）', () => {
  it('既定はカロリー・PFCだけ', () => {
    expect(showPace({ target_id: 'k', key: 'kcal' })).toBe(true);
    expect(showPace({ target_id: 'm', key: 'money' })).toBe(false);
    expect(showPace({ target_id: 's', key: null })).toBe(false);
  });
  it('切り替えると覚える', () => {
    setShowPace('m', true);
    setShowPace('k', false);
    expect(showPace({ target_id: 'm', key: 'money' })).toBe(true);
    expect(showPace({ target_id: 'k', key: 'kcal' })).toBe(false);
  });
});
