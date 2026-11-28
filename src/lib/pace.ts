// 今日の目安（▼）
// 「今週（今月）の目標を守るには、今日はどれくらいにすればいいか」を、日ごとに決める（時刻では動かさない）。
//   今日の目安 =（期間の目標 − 昨日までの量）を、今日から期間の終わりまでの日に、日ごとの目標の割合で分けた今日の分
// - 期間：目標の期間が「1日」「1週間」のターゲットは今週（月〜日）、「1か月」は今月
// - 記録していない日（未記録）は、その日の目標どおりとみなす（記録し忘れで今日の目安がふくらまないように）
// - 休日の目標が大きい日は、その分多く分ける
// - すべてのターゲットに出す
import { monthRange, weekRange } from './days';
import { withUnit } from './display';
import { buildPeriod } from './period';
import type { RangeRow, SummaryItem } from './types';

export type PaceTone = 'ahead' | 'behind' | 'even' | 'over' | 'done';

export interface Pace {
  /** ▼の位置：棒の満タン（目標）のうち、今日の終わりに残っていてよい割合（0〜1） */
  marker: number;
  text: string;
  tone: PaceTone;
  /** 今日の目安の量 */
  guide: number;
}

/** ターゲットの目安を出す期間（その日を含む週か月） */
export function guideRange(item: Pick<SummaryItem, 'period'>, day: string): { view: 'week' | 'month'; from: string; to: string } {
  return item.period === 'month' ? { view: 'month', ...monthRange(day) } : { view: 'week', ...weekRange(day) };
}

/** 今日の目安の量と、昨日までの量（未記録の日はその日の目標とみなす） */
export function dayGuide(rows: RangeRow[], item: Pick<SummaryItem, 'target_id' | 'period'>, day: string): { guide: number; before: number } | null {
  const { view, from, to } = guideRange(item, day);
  if (!rows.some((r) => r.target_id === item.target_id)) return null;
  const r = buildPeriod(rows, item.target_id, view, from, to, day);
  const t = r.days.findIndex((d) => d.day === day);
  if (t < 0) return null;
  const before = r.days.slice(0, t).reduce((a, d) => a + (d.status === 'missing' ? d.dailyGoal : d.used), 0);
  const rest = r.days.slice(t).reduce((a, d) => a + d.dailyGoal, 0);
  const left = r.goal - before;
  const guide = rest > 0 ? (left * r.days[t].dailyGoal) / rest : left;
  return { guide: Math.max(0, guide), before };
}

/**
 * ▼の位置と一言。上限型は「目安より X 余裕／使いすぎ」、到達型は「目安まで あと X／目安を達成」（目安＝今日の目安）。
 * 棒は、1日の目標なら1日の目標、週・月の目標ならその期間の目標が満タン。
 */
export function paceOf(
  item: Pick<SummaryItem, 'kind' | 'goal' | 'used' | 'key' | 'unit' | 'period' | 'day_used'>,
  g: { guide: number; before: number },
): Pace {
  const daily = (item.period ?? 'day') === 'day';
  const today = daily ? item.used : (item.day_used ?? 0);
  // 今日の終わりに、目安どおりなら使っている（摂っている）量。棒の満タンに対する残りの割合が▼の位置
  const endUsed = (daily ? 0 : g.before) + g.guide;
  const marker = item.goal > 0 ? Math.min(1, Math.max(0, 1 - endUsed / item.goal)) : 0;
  const diff = g.guide - today; // + なら今日の目安より少ない
  const amount = withUnit(item, Math.abs(diff));
  const base = { marker, guide: g.guide };
  if (Math.abs(diff) < 0.5) return { ...base, text: item.kind === 'reach' ? '目安を達成' : '目安どおり', tone: item.kind === 'reach' ? 'done' : 'even' };
  if (item.kind === 'reach') return diff > 0 ? { ...base, text: `目安まで あと ${amount}`, tone: 'behind' } : { ...base, text: '目安を達成', tone: 'done' };
  return diff > 0 ? { ...base, text: `目安より ${amount} 余裕`, tone: 'ahead' } : { ...base, text: `目安より ${amount} 使いすぎ`, tone: 'over' };
}

/** 画面に出す目安。今日を見ているときだけ（過去の日は出さない）。期間のデータが無ければ出さない */
export function paceFor(item: SummaryItem, rows: RangeRow[] | null | undefined, viewing: string, today: string): Pace | null {
  if (viewing !== today || !rows) return null;
  const g = dayGuide(rows, item, today);
  return g ? paceOf(item, g) : null;
}
