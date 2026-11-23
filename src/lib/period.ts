// 週・月の画面（v1）の集計。range_summary の行から、画面に出す値を作る。
import type { Period, RangeRow } from './types';

export type PeriodView = 'week' | 'month';
export type DayStatus = 'ok' | 'ng' | 'missing' | 'today' | 'future';

export interface PeriodTarget {
  target_id: string;
  key: string | null;
  name: string;
  unit: string;
  kind: 'reach' | 'cap';
  period: Period;
  sort: number;
}

export interface PeriodDay {
  day: string;
  used: number;
  dailyGoal: number;
  status: DayStatus;
}

export interface PeriodResult {
  total: number;
  goal: number;
  /** 目標を何と比べたか：その期間の目標（週の目標を週で見る）か、期間の日数分の1日あたりの目標の合計か */
  goalBasis: 'period' | 'all-days';
  /** 期間の日数 */
  dayCount: number;
  /** 今日までに過ぎた日数（今日を含む） */
  elapsedDays: number;
  recordedDays: number;
  /** 1日平均：過ぎた日数で割る（記録していない日は 0 として数える） */
  average: number;
  days: PeriodDay[];
  /** 折れ線用：その日までの積み上げ（未来の日は null） */
  cumulative: (number | null)[];
  /** 折れ線用：期間の終わりにちょうど目標になるペースの、その日までの量 */
  pace: number[];
  counts: { ok: number; ng: number; missing: number };
}

/** 範囲に出てくるターゲット（並び順どおり。いちばん新しい日の名前・期間を使う） */
export function periodTargets(rows: RangeRow[]): PeriodTarget[] {
  const map = new Map<string, PeriodTarget>();
  for (const r of [...rows].sort((a, b) => a.day_key.localeCompare(b.day_key))) {
    map.set(r.target_id, { target_id: r.target_id, key: r.key, name: r.name, unit: r.unit, kind: r.kind, period: r.period, sort: r.sort });
  }
  return [...map.values()].sort((a, b) => a.sort - b.sort);
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * 1つのターゲットの、週・月のまとめ。
 * - その日の状態：未来 / 今日（途中なので数えない）/ 未記録 / 目標内（到達型は達成）/ 超過（到達型は届かず）
 *   1日の目標と比べる（週・月の目標は1日あたりに割った額と比べる）
 * - 合計と比べる目標：ターゲットの目標の期間が画面と同じ（週の目標を週で見る）ならその期間の目標、
 *   ちがえば期間の日数分の1日あたりの目標の合計（必ず記録する前提。記録していない日も目標に入れる）
 */
export function buildPeriod(rows: RangeRow[], targetId: string, view: PeriodView, from: string, to: string, today: string): PeriodResult {
  const mine = rows.filter((r) => r.target_id === targetId);
  const byDay = new Map(mine.map((r) => [r.day_key, r]));
  const latest = mine.reduce<RangeRow | undefined>((a, r) => (!a || r.day_key > a.day_key ? r : a), undefined);

  const days: PeriodDay[] = eachDay(from, to).map((day) => {
    const r = byDay.get(day);
    if (day > today || !r) return { day, used: r?.used ?? 0, dailyGoal: r?.daily_goal ?? latest?.daily_goal ?? 0, status: day > today ? 'future' : 'missing' };
    let status: DayStatus;
    if (day === today) status = 'today';
    else if (!r.confirmed) status = 'missing';
    else status = (r.kind === 'reach' ? r.used >= r.daily_goal : r.used <= r.daily_goal) ? 'ok' : 'ng';
    return { day, used: r.used, dailyGoal: r.daily_goal, status };
  });

  const counted = days.filter((d) => d.status === 'ok' || d.status === 'ng' || (d.status === 'today' && byDay.get(d.day)?.confirmed));
  const total = days.filter((d) => d.status !== 'future').reduce((a, d) => a + d.used, 0);
  const samePeriod = latest?.period === view;
  // 必ず記録する前提：記録の有無にかかわらず、期間の日数分の目標と比べる
  const goal = samePeriod ? latest!.goal : days.reduce((a, d) => a + d.dailyGoal, 0);
  const elapsedDays = days.filter((d) => d.status !== 'future').length;

  let run = 0;
  const cumulative = days.map((d) => (d.status === 'future' ? null : (run += d.used)));
  const pace = days.map((_, i) => (goal * (i + 1)) / days.length);

  return {
    total,
    goal,
    goalBasis: samePeriod ? 'period' : 'all-days',
    dayCount: days.length,
    elapsedDays,
    recordedDays: counted.length,
    average: elapsedDays ? total / elapsedDays : 0,
    days,
    cumulative,
    pace,
    counts: {
      ok: days.filter((d) => d.status === 'ok').length,
      ng: days.filter((d) => d.status === 'ng').length,
      missing: days.filter((d) => d.status === 'missing').length,
    },
  };
}
