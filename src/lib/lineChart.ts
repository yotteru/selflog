// 期間の折れ線グラフの点の位置（画面から切り離してテストする）
//
// 横軸は「日」の単位で、0 が期間の始まり、i+1 が i 日目の終わり。点は日ごとに1つ（時刻では動かさない）。
// - 積み上げの点：その日までの合計を、その日の終わり（i+1）に置く。今日の点は「今日の分を入れた途中の合計」
// - 目安の線：期間の始まり 0 から、期間の終わり n で目標にちょうど届く線。日ごとの目標の積み上げ（result.pace）を結ぶ。
//   どの日も目標が同じなら直線（goal × x / n）。休日の目標が大きければ、休日のところで傾きが大きくなる
// こうすると、点が線より上なら目安より多い・下なら少ない、が見た目と一致する。
import { fmt, withUnit } from './display';
import type { PeriodResult } from './period';
import type { Kind } from './types';

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
  return { points, n, todayX, paceAt };
}

/**
 * 目安線との差の一言。最後の点（今日があれば今日の分まで）と、その位置の目安線を比べる。
 * 上限型は「余裕／使いすぎ」、到達型は「先行／遅れ」（ホームのペースの言い方とそろえる）。
 * 期間の目標そのものを超えた（届いた）ら、それを優先する。過ぎた期間は最後の日の終わり＝目標と比べる。
 */
export function paceDiffText(
  s: LineSeries,
  result: PeriodResult,
  target: { kind: Kind; key: string | null; unit: string },
): { text: string; tone: 'ahead' | 'behind' | 'even' } | null {
  if (s.points.length < 2) return null;
  const last = s.points[s.points.length - 1];
  const ref = s.todayX == null && last.x === s.n ? '目標' : '目安線';
  if (target.kind === 'cap' && last.y > result.goal) return { text: `目標を ${withUnit(target, last.y - result.goal)} 超えています`, tone: 'behind' };
  if (target.kind === 'reach' && last.y >= result.goal) return { text: '目標を達成 ✓', tone: 'ahead' };
  const diff = s.paceAt(last.x) - last.y; // + なら目安線より少ない
  if (fmt(Math.abs(diff)) === '0') return { text: `${ref}どおり`, tone: 'even' };
  const a = withUnit(target, Math.abs(diff));
  if (target.kind === 'reach') return diff > 0 ? { text: `${ref}より ${a} 遅れ`, tone: 'behind' } : { text: `${ref}より ${a} 先行`, tone: 'ahead' };
  return diff > 0 ? { text: `${ref}より ${a} 余裕`, tone: 'ahead' } : { text: `${ref}より ${a} 使いすぎ`, tone: 'behind' };
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
