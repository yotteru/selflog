import { describe, expect, it } from 'vitest';
import { monthRange, rangeLabel, weekRange } from './days';
import { buildPeriod, periodTargets } from './period';
import type { RangeRow } from './types';

const row = (day: string, o: Partial<RangeRow> = {}): RangeRow => ({
  day_key: day, target_id: 'k', key: 'kcal', name: 'カロリー', unit: 'kcal', kind: 'cap', sort: 10,
  period: 'day', goal: 2200, daily_goal: 2200, used: 0, confirmed: true, ...o,
});

describe('週・月の範囲', () => {
  it('週は月曜〜日曜', () => {
    expect(weekRange('2026-11-25')).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(weekRange('2026-11-23')).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(weekRange('2026-11-29')).toEqual({ from: '2026-11-23', to: '2026-11-29' });
  });
  it('月は1日〜末日（うるう年も）', () => {
    expect(monthRange('2026-11-25')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
  it('見出し', () => {
    expect(rangeLabel('week', '2026-11-23', '2026-11-29')).toBe('11/23（月）〜 11/29（日）');
    expect(rangeLabel('month', '2026-11-01', '2026-11-30')).toBe('2026年11月');
  });
});

describe('buildPeriod', () => {
  // 11/23（月）〜11/29（日）、今日は 11/27（金）
  const rows = [
    row('2026-11-23', { used: 2000 }), // 目標内
    row('2026-11-24', { used: 2500 }), // 超過
    row('2026-11-25', { used: 0, confirmed: false }), // 未記録
    row('2026-11-26', { used: 2200 }), // ちょうど＝目標内
    row('2026-11-27', { used: 800 }), // 今日（途中）
  ];
  const r = buildPeriod(rows, 'k', 'week', '2026-11-23', '2026-11-29', '2026-11-27');

  it('日ごとの状態', () => {
    expect(r.days.map((d) => d.status)).toEqual(['ok', 'ng', 'missing', 'ok', 'today', 'future', 'future']);
    expect(r.counts).toEqual({ ok: 2, ng: 1, missing: 1 });
  });
  it('目標は記録の有無にかかわらず7日分。平均は過ぎた日数（今日を含む5日）で割る', () => {
    expect(r.total).toBe(7500);
    expect(r.goal).toBe(2200 * 7);
    expect(r.goalBasis).toBe('all-days');
    expect(r).toMatchObject({ dayCount: 7, elapsedDays: 5, recordedDays: 4 });
    expect(r.average).toBe(7500 / 5);
  });
  it('折れ線：その日までの積み上げ（未来は null）と、期間の終わりにちょうど目標になるペース', () => {
    expect(r.cumulative).toEqual([2000, 4500, 4500, 6700, 7500, null, null]);
    expect(r.pace[0]).toBeCloseTo(2200);
    expect(r.pace[6]).toBeCloseTo(2200 * 7);
  });
  it('月：その月の日数分（11月は30日）', () => {
    const m = buildPeriod([row('2026-11-02', { used: 1000 })], 'k', 'month', '2026-11-01', '2026-11-30', '2026-11-03');
    expect(m).toMatchObject({ goal: 2200 * 30, dayCount: 30, elapsedDays: 3, total: 1000 });
  });

  it('週の目標のターゲットを週で見ると、その週の目標と比べる。日の判定は1日あたり', () => {
    const money = (day: string, used: number, confirmed = true): RangeRow =>
      row(day, { target_id: 'm', key: 'money', unit: '円', period: 'week', goal: 7000, daily_goal: 1000, used, confirmed });
    const m = buildPeriod(
      [money('2026-11-23', 800), money('2026-11-24', 1500), money('2026-11-25', 0, false), money('2026-11-26', 300), money('2026-11-27', 0, false)],
      'm', 'week', '2026-11-23', '2026-11-29', '2026-11-27',
    );
    expect(m).toMatchObject({ total: 2600, goal: 7000, goalBasis: 'period' });
    expect(m.days.map((d) => d.status)).toEqual(['ok', 'ng', 'missing', 'ok', 'today', 'future', 'future']);
  });

  it('到達型：目標以上なら達成（ok）', () => {
    const p = (day: string, used: number): RangeRow => row(day, { target_id: 'p', key: 'p', kind: 'reach', goal: 160, daily_goal: 160, used });
    const x = buildPeriod([p('2026-11-23', 170), p('2026-11-24', 100)], 'p', 'week', '2026-11-23', '2026-11-29', '2026-11-27');
    expect(x.days.slice(0, 2).map((d) => d.status)).toEqual(['ok', 'ng']);
  });

  it('ターゲットの一覧（並び順、いちばん新しい日の名前）', () => {
    const t = periodTargets([row('2026-11-23', { name: '旧' }), row('2026-11-24', { name: 'カロリー' }), row('2026-11-24', { target_id: 'p', key: 'p', sort: 5 })]);
    expect(t.map((x) => [x.target_id, x.name])).toEqual([['p', 'カロリー'], ['k', 'カロリー']]);
  });
});
