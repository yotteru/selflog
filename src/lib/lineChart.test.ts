import { describe, expect, it } from 'vitest';
import { lineSeries, niceTicks } from './lineChart';
import { buildPeriod } from './period';
import type { RangeRow } from './types';

const row = (day: string, used: number): RangeRow => ({
  day_key: day, target_id: 'k', key: 'kcal', name: 'カロリー', unit: 'kcal', kind: 'cap', sort: 1,
  period: 'day', goal: 2000, daily_goal: 2000, used, confirmed: true,
});

// 11/23（月）〜11/29（日）、今日は水曜。1日2000kcal、週14000kcal
const result = buildPeriod([row('2026-11-23', 1900), row('2026-11-24', 1950), row('2026-11-25', 1000)], 'k', 'week', '2026-11-23', '2026-11-29', '2026-11-25');

describe('折れ線の点の位置（日ごと）', () => {
  it('0,0 から始まり、どの日もその日の終わり（今日も時刻では動かさない）', () => {
    const s = lineSeries(result, '2026-11-25');
    expect(s.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1900 },
      { x: 2, y: 3850 },
      { x: 3, y: 4850 },
    ]);
    expect(s.todayX).toBe(3);
  });
  it('目安より少ない日は、点が目安の線より下（見た目と数字が一致する）', () => {
    const s = lineSeries(result, '2026-11-25');
    expect(s.points[1].y).toBeLessThan(s.paceAt(1));
    expect(s.points[2].y).toBeLessThan(s.paceAt(2));
  });
  it('期間の終わりで目安はちょうど目標', () => {
    expect(lineSeries(result, '2026-11-25').paceAt(7)).toBe(14000);
  });
  it('過ぎた期間（今日を含まない）は最後の日の終わりで比べる', () => {
    const past = buildPeriod([row('2026-11-16', 2500)], 'k', 'week', '2026-11-16', '2026-11-22', '2026-11-25');
    const s = lineSeries(past, '2026-11-25');
    expect(s.todayX).toBeNull();
    expect(s.points.at(-1)).toEqual({ x: 7, y: 2500 });
  });
});

describe('平日と休日で目標が違うとき', () => {
  // お金：平日1000円・休日3000円。11/23（月・祝）〜11/29（日）。休日は 23・28・29 → 週 3000×3 + 1000×4 = 13000
  const money = (day: string, used: number, off: boolean): RangeRow => ({
    day_key: day, target_id: 'm', key: 'money', name: 'お金', unit: '円', kind: 'cap', sort: 1,
    period: 'day', goal: off ? 3000 : 1000, daily_goal: off ? 3000 : 1000, used, confirmed: true, off,
  });
  const days = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
  const offs = [true, false, false, false, false, true, true];
  const rows = days.map((d, i) => money(d, d <= '2026-11-25' ? 900 : 0, offs[i]));
  const r = buildPeriod(rows, 'm', 'week', '2026-11-23', '2026-11-29', '2026-11-25');
  it('週の目標は日ごとの目標の合計。まだ来ていない日も、その日の目標で数える', () => {
    expect(r.goal).toBe(13000);
    expect(r.days.map((d) => d.off)).toEqual(offs);
  });
  it('目安の線は日ごとの目標の積み上げ（休日で大きく増える）', () => {
    expect(r.pace).toEqual([3000, 4000, 5000, 6000, 7000, 10000, 13000]);
    const s = lineSeries(r, '2026-11-25');
    expect(s.paceAt(1)).toBe(3000);
    expect(s.paceAt(1.5)).toBe(3500);
    expect(s.paceAt(7)).toBe(13000);
  });
  it('月曜（祝日）の 900 円は、休日の目標 3000 円と比べて目標内', () => {
    expect(r.days[0].status).toBe('ok');
  });
});

describe('縦軸の目盛り', () => {
  it('きりのよい数で、最大を超えるところまで', () => {
    expect(niceTicks(15400)).toEqual([0, 5000, 10000, 15000, 20000]);
    expect(niceTicks(7000)).toEqual([0, 2000, 4000, 6000, 8000]);
    expect(niceTicks(160 * 7)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(0)).toEqual([0]);
  });
});
