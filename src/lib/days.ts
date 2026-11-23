// 日付まわりの画面ルール（§3.5, §5.3）
import { addDays, diffDays, formatDayLabel } from './dayKey';
import { opDay } from './overlay';
import type { Op } from './queue';

/** 記録・表示できる日の範囲：今日を含めて直近31日（未来は不可） */
export function dayBounds(today: string) {
  return { min: addDays(today, -30), max: today };
}

export function clampDay(day: string, today: string): string {
  const { min, max } = dayBounds(today);
  if (day > max) return max;
  if (day < min) return min;
  return day;
}

/** キューにある（まだ反映されていない）記録の日。記録漏れのお知らせから外すのに使う */
export function daysWithQueuedAdds(ops: readonly Op[]): Set<string> {
  return new Set(ops.filter((o): o is Op & { type: 'add' } => o.type === 'add').map(opDay));
}

/** 記録漏れのお知らせの文言（§3.5）。無ければ null */
export function missingBannerText(days: string[]): string | null {
  if (days.length === 0) return null;
  if (days.length === 1) return `${formatDayLabel(days[0])}の記録がありません`;
  return `記録していない日が${days.length}日あります`;
}

/** 画面の見出し */
export function dayTitle(day: string, today: string, view: 'front' | 'back'): string {
  if (day === today) return view === 'front' ? '今日の残り' : '今日の積み上げ';
  return `${formatDayLabel(day)}の記録`;
}

/** 今日から見た日の呼び方（「昨日」「3日前」） */
export function relativeLabel(day: string, today: string): string {
  const d = diffDays(today, day);
  if (d === 0) return '今日';
  if (d === 1) return '昨日';
  return `${d}日前`;
}
