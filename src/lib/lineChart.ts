// 期間の折れ線グラフの点の位置（画面から切り離してテストする）
//
// 横軸は「日」の単位で、0 が期間の始まり（初日の朝4:00）、i+1 が i 日目の終わり。
// - 積み上げの点：過ぎた日はその日の終わり（i+1）、今日は「いまの時刻」（i + 今日のうち過ぎた割合）
// - 目安の線：期間の始まり 0 から、期間の終わり n で目標にちょうど届く直線。位置 x の目安は goal × x / n
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
  /** いまの位置（今日が期間の中にあれば） */
  nowX: number | null;
  /** 位置 x での目安 */
  paceAt: (x: number) => number;
  /** いま（または期間の終わり）の目安との差。+ なら目安より少ない */
  diff: number;
  /**
   * 終わった日（昨日まで）の目安との差。+ なら目安より少ない。終わった日がまだ無ければ null。
   * 今日の途中は、食事のようにまとめて増えるものだと一時的に目安を上下するので、主な比較はこちらにする
   */
  diffDone: number | null;
}

export function lineSeries(result: PeriodResult, today: string, todayElapsed: number): LineSeries {
  const n = result.days.length;
  const paceAt = (x: number) => (result.goal * x) / n;
  const points: LinePoint[] = [{ x: 0, y: 0 }];
  let nowX: number | null = null;
  result.days.forEach((d, i) => {
    const y = result.cumulative[i];
    if (y == null) return;
    if (d.day === today) {
      nowX = i + Math.max(0, Math.min(1, todayElapsed));
      points.push({ x: nowX, y });
    } else {
      points.push({ x: i + 1, y });
    }
  });
  const last = points[points.length - 1];
  const done = [...points].reverse().find((p) => p.x > 0 && Number.isInteger(p.x) && (nowX == null || p.x <= Math.floor(nowX)));
  return { points, n, nowX, paceAt, diff: paceAt(last.x) - last.y, diffDone: done ? paceAt(done.x) - done.y : null };
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
