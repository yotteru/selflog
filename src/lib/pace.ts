// 時間に対するペースの目安（v1.2）
// 「いまの時刻なら、残りはこのくらいが目安」を、1日（朝4:00〜翌朝4:00）・週・月のうち過ぎた割合から出す。
// まっすぐ減る前提の目安。お金やスクリーンタイムのように1日の最後にまとめて入れるものには向かないので、
// ターゲットごとに出す・出さないを選べる（既定はカロリー・P・F・C だけ出す）。設定はこの端末にだけ保存する。
import { addDays, dayKeyOf } from './dayKey';
import { withUnit } from './display';
import type { Period, SummaryItem } from './types';

const DAY = 86_400_000;
const SHIFT = 5 * 3_600_000; // JST(+9) − 区切り(4)

/** 今日のうち過ぎた割合（0〜1）。朝4:00 が 0 */
export function dayElapsed(now: number): number {
  return (((now + SHIFT) % DAY) + DAY) % DAY / DAY;
}

/** その期間のうち過ぎた割合（0〜1）。期間がもう終わっていれば 1、まだ始まっていなければ 0 */
export function periodElapsed(now: number, period: Period, start: string, end: string): number {
  const today = dayKeyOf(now);
  if (today > end) return 1;
  if (today < start) return 0;
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY) + 1;
  const done = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY);
  void period;
  return Math.min(1, (done + dayElapsed(now)) / days);
}

export type PaceTone = 'ahead' | 'behind' | 'even' | 'over' | 'done';

export interface Pace {
  /** 目安の位置：目標のうち、いま残っていてよい割合（0〜1） */
  marker: number;
  text: string;
  tone: PaceTone;
}

/** 目安と比べた一言。上限型は「余裕／使いすぎ」、到達型は「先行／遅れ」。差が目標の5%以内は「目安どおり」 */
export function paceOf(item: Pick<SummaryItem, 'kind' | 'goal' | 'used' | 'key' | 'unit'>, elapsed: number): Pace {
  const marker = Math.max(0, 1 - elapsed);
  if (item.kind === 'cap' && item.used > item.goal) return { marker, text: '超過しています', tone: 'over' };
  if (item.kind === 'reach' && item.used >= item.goal) return { marker, text: '達成', tone: 'done' };
  const diff = item.goal * elapsed - item.used; // + なら目安より使って（摂って）いない
  if (Math.abs(diff) <= item.goal * 0.05) return { marker, text: '目安どおり', tone: 'even' };
  const amount = withUnit(item, Math.abs(diff));
  if (item.kind === 'reach') return diff > 0 ? { marker, text: `目安より ${amount} 遅れ`, tone: 'behind' } : { marker, text: `目安より ${amount} 先行`, tone: 'ahead' };
  return diff > 0 ? { marker, text: `目安より ${amount} 余裕`, tone: 'ahead' } : { marker, text: `目安より ${amount} 使いすぎ`, tone: 'behind' };
}

/** 画面に出すペース。今日（その期間の中）を見ているときだけ。過去の日は出さない */
export function paceFor(item: SummaryItem, viewing: string, now: number): Pace | null {
  const today = dayKeyOf(now);
  if (viewing !== today) return null;
  const period = item.period ?? 'day';
  const elapsed =
    period === 'day' ? dayElapsed(now) : periodElapsed(now, period, item.period_start ?? today, item.period_end ?? addDays(today, 0));
  return paceOf(item, elapsed);
}

// ---------------------------------------------------------------------------
// ターゲットごとの「ペースの目安を出す」（この端末に保存）
// ---------------------------------------------------------------------------

const KEY = 'zanryo.pace.v1';
const listeners = new Set<() => void>();
let cache: Record<string, boolean> | null = null;

function read(): Record<string, boolean> {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, boolean>;
  } catch {
    cache = {};
  }
  return cache;
}

/** 既定：カロリー・P・F・C は出す。お金・自分で追加したものは出さない（まとめて入力することが多いため） */
export function defaultShowPace(key: string | null): boolean {
  return key === 'kcal' || key === 'p' || key === 'f' || key === 'c';
}

export function showPace(target: { target_id: string; key: string | null }): boolean {
  const v = read()[target.target_id];
  return v ?? defaultShowPace(target.key);
}

export function setShowPace(targetId: string, show: boolean) {
  const next = { ...read(), [targetId]: show };
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 保存できなくても、この画面のあいだは効く */
  }
  listeners.forEach((fn) => fn());
}

export function subscribePace(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function pacePrefsVersion(): Record<string, boolean> {
  return read();
}
