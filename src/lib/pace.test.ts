import { describe, expect, it } from 'vitest';
import { dayGuide, guideRange, paceFor, paceOf } from './pace';
import type { RangeRow, SummaryItem } from './types';

// 11/23（月）〜11/29（日）
const WEEK = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
const kcalRow = (day: string, used: number, confirmed = true): RangeRow => ({
  day_key: day, target_id: 'k', key: 'kcal', name: 'カロリー', unit: 'kcal', kind: 'cap', sort: 1,
  period: 'day', goal: 2200, daily_goal: 2200, used, confirmed,
});
const kcal = (o: Partial<SummaryItem> = {}): SummaryItem => ({
  target_id: 'k', key: 'kcal', name: 'カロリー', unit: 'kcal', kind: 'cap', sort: 0, goal: 2200, used: 1150, remaining: 1050, state: 'ok', period: 'day', ...o,
});

describe('今日の目安（今週の残り ÷ 残りの日）', () => {
  it('月〜金に計 9,000 なら、土の目安は (15,400 − 9,000) ÷ 2 = 3,200', () => {
    const used = [2000, 1800, 1700, 1900, 1600];
    const rows = WEEK.map((d, i) => kcalRow(d, used[i] ?? 0, i < 5));
    expect(dayGuide(rows, kcal(), '2026-11-28')).toEqual({ guide: 3200, before: 9000 });
  });
  it('月曜は、週の目標を7日で分けた量（1日の目標）', () => {
    const rows = WEEK.map((d) => kcalRow(d, 0, false));
    expect(dayGuide(rows, kcal(), '2026-11-23')?.guide).toBeCloseTo(2200);
  });
  it('記録していない日は、その日の目標どおりとみなす（目安がふくらまない）', () => {
    // 月 2,000、火は未記録 → 昨日まで 2,000 + 2,200 = 4,200。水の目安は (15,400 − 4,200) ÷ 5 = 2,240
    const rows = [kcalRow('2026-11-23', 2000), kcalRow('2026-11-24', 0, false), ...WEEK.slice(2).map((d) => kcalRow(d, 0, false))];
    expect(dayGuide(rows, kcal(), '2026-11-25')).toEqual({ guide: 2240, before: 4200 });
  });
  it('上限型でもう週の目標を超えていたら、目安は 0', () => {
    const rows = [kcalRow('2026-11-23', 16000), ...WEEK.slice(1).map((d) => kcalRow(d, 0, false))];
    expect(dayGuide(rows, kcal(), '2026-11-24')?.guide).toBe(0);
  });
  it('休日の目標が大きい日は、その分多く分ける', () => {
    // お金：平日 1,000・休日（土日）3,000。週 11,000。月〜金に計 4,000 → 残り 7,000 を土日（3,000 と 3,000）で分ける → 3,500
    const money = (day: string, used: number, off: boolean, confirmed: boolean): RangeRow => ({
      day_key: day, target_id: 'm', key: 'money', name: 'お金', unit: '円', kind: 'cap', sort: 2,
      period: 'day', goal: off ? 3000 : 1000, daily_goal: off ? 3000 : 1000, used, confirmed, off,
    });
    const rows = WEEK.map((d, i) => money(d, i < 5 ? 800 : 0, i >= 5, i < 5));
    expect(dayGuide(rows, { target_id: 'm', period: 'day' }, '2026-11-28')).toEqual({ guide: 3500, before: 4000 });
  });
  it('目標の期間が1か月なら今月、それ以外は今週', () => {
    expect(guideRange({ period: 'month' }, '2026-11-28')).toEqual({ view: 'month', from: '2026-11-01', to: '2026-11-30' });
    expect(guideRange({ period: 'day' }, '2026-11-28')).toEqual({ view: 'week', from: '2026-11-23', to: '2026-11-29' });
  });
});

describe('▼の位置と一言', () => {
  it('上限型：今日の目安より少なければ余裕、多ければ使いすぎ', () => {
    // 目安 3,200、今日 1,150 → 2,050 余裕。▼は満タン（2,200）に対して 1 − 3,200/2,200 → 0（左端）
    expect(paceOf(kcal(), { guide: 3200, before: 9000 })).toMatchObject({ text: '目安より 2,050kcal 余裕', tone: 'ahead', marker: 0 });
    // 目安 1,800、今日 1,150 → 650 余裕。▼は 1 − 1,800/2,200
    expect(paceOf(kcal(), { guide: 1800, before: 0 }).marker).toBeCloseTo(1 - 1800 / 2200);
    expect(paceOf(kcal({ used: 2000 }), { guide: 1800, before: 0 })).toMatchObject({ text: '目安より 200kcal 使いすぎ', tone: 'over' });
  });
  it('到達型：あと X／達成', () => {
    const p = { key: 'p' as const, unit: 'g', kind: 'reach' as const, goal: 160, period: 'day' as const };
    expect(paceOf({ ...p, used: 104 }, { guide: 160, before: 0 })).toMatchObject({ text: '目安まで あと 56g', tone: 'behind' });
    expect(paceOf({ ...p, used: 170 }, { guide: 160, before: 0 })).toMatchObject({ text: '目安を達成', tone: 'done' });
  });
  it('週の目標のターゲット：棒は週の目標。▼は「昨日まで＋今日の目安」を使ったときの残り。比べるのは今日の分', () => {
    const w = { key: 'money' as const, unit: '円', kind: 'cap' as const, goal: 7000, used: 3500, day_used: 500, period: 'week' as const };
    const pace = paceOf(w, { guide: 1000, before: 3000 });
    expect(pace.marker).toBeCloseTo(1 - 4000 / 7000);
    expect(pace.text).toBe('目安より ¥500 余裕');
  });
  it('過去の日・期間のデータが無いときは出さない', () => {
    const rows = WEEK.map((d) => kcalRow(d, 0, false));
    expect(paceFor(kcal(), rows, '2026-11-27', '2026-11-28')).toBeNull();
    expect(paceFor(kcal(), null, '2026-11-28', '2026-11-28')).toBeNull();
    expect(paceFor(kcal(), rows, '2026-11-28', '2026-11-28')).not.toBeNull();
  });
});
