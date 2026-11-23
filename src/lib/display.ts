// 表示の文言・色・ゲージ（仕様 §3.4、v1 のゲージ）。画面から切り離して、テストで確かめられるようにしている。
//
// ゲージは上限型・到達型とも「残量」の向き：最初は満タンで、使う（摂る）ほど減っていく。
//   - 上限型：0 を過ぎたら、目標の線の右に超えた分がオレンジで伸びる
//   - 到達型：0 になったら「達成 ✓」
import { formatDayLabel } from './dayKey';
import type { Amounts, Period, SummaryItem } from './types';

export type View = 'front' | 'back';
/** accent=青（ふつう）, over=オレンジ（超過）, ink=黒（裏の表示） */
export type Tone = 'accent' | 'over' | 'ink';

export const COLORS = { accent: '#1D4ED8', over: '#C2410C', ink: '#111111' } as const;

export function fmt(n: number): string {
  return Math.round(Math.abs(n)).toLocaleString('ja-JP');
}

export function isMoney(item: { key: string | null; unit: string }): boolean {
  return item.key === 'money' || item.unit === '円';
}

/** 1,340kcal / ¥420 / 72g */
export function withUnit(item: { key: string | null; unit: string }, n: number): string {
  return isMoney(item) ? `¥${fmt(n)}` : `${fmt(n)}${item.unit}`;
}

const clamp = (x: number, lo = 0, hi = 1) => (Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : lo);

export const PERIOD_WORD: Record<Period, { short: string; label: string; current: string }> = {
  day: { short: '日', label: '1日', current: '今日' },
  week: { short: '週', label: '1週間', current: '今週' },
  month: { short: '月', label: '1か月', current: '今月' },
};

/** 「上限・日」「到達・週」 */
export function kindTag(item: Pick<SummaryItem, 'kind' | 'period'>): string {
  return `${KIND_TAG[item.kind]}・${PERIOD_WORD[item.period ?? 'day'].short}`;
}

export interface Gauge {
  /** 残りの割合（0〜1）。棒は目標の線までのうち、この割合だけ伸びる */
  fill: number;
  /** 超えた割合（0〜0.25 で頭打ち）。上限型で目標を超えたときだけ */
  over: number;
  /** 「残61%」「+13%」。達成したら空 */
  pct: string;
}

export function gauge(item: Pick<SummaryItem, 'kind' | 'goal' | 'used'>): Gauge {
  const ratio = item.goal > 0 ? item.used / item.goal : item.used > 0 ? Infinity : 0;
  if (item.kind === 'reach' && ratio >= 1) return { fill: 0, over: 0, pct: '' };
  if (item.kind === 'cap' && ratio > 1) {
    return { fill: 0, over: clamp(ratio - 1, 0, 0.25), pct: Number.isFinite(ratio) ? `+${Math.round((ratio - 1) * 100)}%` : '超過' };
  }
  return { fill: clamp(1 - ratio), over: 0, pct: `残${Math.round(clamp(1 - ratio) * 100)}%` };
}

export interface Described {
  /** 残り / 超過 / あと / 達成 ✓ / 摂取 / 使った */
  label: string;
  /** 値（単位つき）。達成のときは空 */
  value: string;
  /** 週・月の目標のときの補足（「今週（11/17〜）· 今日 ¥580」） */
  sub: string;
  gauge: Gauge;
  tone: Tone;
  done: boolean;
  over: boolean;
}

export function describe(item: SummaryItem, view: View): Described {
  const over = item.kind === 'cap' && item.remaining < 0;
  const done = item.kind === 'reach' && item.remaining <= 0;
  const period = item.period ?? 'day';
  const sub =
    period === 'day'
      ? ''
      : `${PERIOD_WORD[period].current}（${item.period_start ? formatDayLabel(item.period_start).replace(/（.）/, '') : ''}〜）· 今日 ${withUnit(item, item.day_used ?? 0)}`;
  const g = gauge(item);

  if (view === 'back') {
    const money = isMoney(item);
    const value = money || item.key === 'kcal' ? withUnit(item, item.used) : `${withUnit(item, item.used)} / ${withUnit(item, item.goal)}`;
    return { label: money ? '使った' : '摂取', value, sub, gauge: g, tone: over ? 'over' : 'ink', done, over };
  }
  if (item.kind === 'reach') {
    return { label: done ? '達成 ✓' : 'あと', value: done ? '' : withUnit(item, item.remaining), sub, gauge: g, tone: 'accent', done, over: false };
  }
  return { label: over ? '超過' : '残り', value: withUnit(item, item.remaining), sub, gauge: g, tone: over ? 'over' : 'accent', done: false, over };
}

/** カロリーの状態の言葉 */
export function statusWord(item: Pick<SummaryItem, 'kind' | 'goal' | 'used'>): string {
  const ratio = item.goal > 0 ? item.used / item.goal : 0;
  if (item.kind === 'reach') return ratio >= 1 ? '達成' : ratio >= 0.8 ? 'あと少し' : 'まだこれから';
  if (ratio > 1) return '超過';
  if (ratio >= 0.8) return 'あと少しで上限';
  return 'まだ余裕あり';
}

export const KIND_TAG = { reach: '到達', cap: '上限' } as const;

/** 記録した量を足し引きして、残量を計算し直す（サーバーに届く前の楽観的な表示に使う） */
export function applyAmounts(items: SummaryItem[], delta: Amounts, sign: 1 | -1 = 1): SummaryItem[] {
  return items.map((it) => {
    const d = delta[it.target_id];
    if (!d) return it;
    const used = it.used + sign * d;
    const remaining = it.goal - used;
    const state = it.kind === 'reach' ? (remaining <= 0 ? 'done' : 'ok') : remaining < 0 ? 'over' : 'ok';
    return { ...it, used, remaining, state, day_used: it.day_used == null ? it.day_used : it.day_used + sign * d };
  });
}

/** プリセットの説明：「120kcal · P24」「180kcal · ¥150」 */
export function presetSub(amounts: Amounts, items: Pick<SummaryItem, 'target_id' | 'key'>[]): string {
  const by = (key: string) => {
    const t = items.find((i) => i.key === key);
    return t ? amounts[t.target_id] ?? 0 : 0;
  };
  const parts: string[] = [];
  if (by('kcal')) parts.push(`${fmt(by('kcal'))}kcal`);
  if (by('money')) parts.push(`¥${fmt(by('money'))}`);
  else if (by('p')) parts.push(`P${fmt(by('p'))}`);
  return parts.join(' · ') || '—';
}
