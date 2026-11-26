// 期間の折れ線グラフの点の位置（画面から切り離してテストする）
//
// 横軸は「日」の単位で、0 が期間の始まり、i+1 が i 日目の終わり。点は日ごとに1つ（時刻では動かさない）。
// - 積み上げの点：その日までの合計を、その日の終わり（i+1）に置く。今日の点は「今日の分を入れた途中の合計」
// - 目安の線：期間の始まり 0 から、期間の終わり n で目標にちょうど届く線。日ごとの目標の積み上げ（result.pace）を結ぶ。
//   どの日も目標が同じなら直線（goal × x / n）。休日の目標が大きければ、休日のところで傾きが大きくなる
// こうすると、点が線より上なら目安より多い・下なら少ない、が見た目と一致する。
import type { PeriodResult } from './period';

export interface LinePoint {
  x: number;
  y: number;
}

export interface LineSeries {
  /** 0,0 から始まる積み上げの点 */
  points: LinePoint[];
  /** 期間の日数 */
  n: number;
  /** 今日の点の位置（今日が期間の中にあれば。今日の終わり＝i+1） */
  todayX: number | null;
  /** 位置 x での目安 */
  paceAt: (x: number) => number;
  /** 最後の点（今日があれば今日の分まで）の、その日の終わりの目安との差。+ なら目安より少ない */
  diff: number;
  /**
   * 今日の目安（今日が期間の中にあるときだけ）。
   * goal：期間の目標の残り（目標 − 昨日までの合計）を、今日から終わりまでの日に、日ごとの目標の割合で分けた今日の分。
   *       上限型で残りがもう無ければ 0。
   * used：今日ここまでの量。
   */
  today: { goal: number; used: number } | null;
}

export function lineSeries(result: PeriodResult, today: string): LineSeries {
  const n = result.days.length;
  // 位置 x の目安：日の終わり（整数）は result.pace、そのあいだは直線でつなぐ
  const paceEnd = (k: number) => (k <= 0 ? 0 : result.pace[Math.min(n, k) - 1] ?? (result.goal * k) / n);
  const paceAt = (x: number) => {
    const k = Math.floor(x);
    return k >= n ? paceEnd(n) : paceEnd(k) + (paceEnd(k + 1) - paceEnd(k)) * (x - k);
  };
  const points: LinePoint[] = [{ x: 0, y: 0 }];
  let todayX: number | null = null;
  result.days.forEach((d, i) => {
    const y = result.cumulative[i];
    if (y == null) return;
    if (d.day === today) todayX = i + 1;
    points.push({ x: i + 1, y });
  });
  const last = points[points.length - 1];
  let todayGoal: LineSeries['today'] = null;
  if (todayX != null) {
    const t = todayX - 1; // 今日の位置（0 はじまり）
    const before = t > 0 ? (result.cumulative[t - 1] ?? 0) : 0;
    const used = (result.cumulative[t] ?? before) - before;
    const left = result.goal - before; // 期間の目標の残り
    const restGoals = paceEnd(n) - paceEnd(t); // 今日から終わりまでの日ごとの目標の合計
    const share = paceEnd(t + 1) - paceEnd(t); // 今日の目標
    const goal = restGoals > 0 ? (left * share) / restGoals : left;
    todayGoal = { goal: Math.max(0, goal), used };
  }
  return { points, n, todayX, paceAt, diff: paceAt(last.x) - last.y, today: todayGoal };
}

/** 縦軸のきりのよい目盛り（0 を含めて4〜6本） */
export function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0];
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1000) / 1000);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}
