// 表示の文言と色（仕様 §3.4）。画面から切り離して、テストで確かめられるようにしている。
import type { Amounts, SummaryItem } from './types';

export type View = 'front' | 'back';
/** accent=青（ふつう）, over=オレンジ（超過）, ink=黒（裏の表示） */
export type Tone = 'accent' | 'over' | 'ink';

export const COLORS = { accent: '#1D4ED8', over: '#C2410C', ink: '#111111' } as const;

export function fmt(n: number): string {
  return Math.round(Math.abs(n)).toLocaleString('ja-JP');
}

export function isMoney(item: Pick<SummaryItem, 'key' | 'unit'>): boolean {
  return item.key === 'money' || item.unit === '円';
}

/** 1,340kcal / ¥420 / 72g */
export function withUnit(item: Pick<SummaryItem, 'key' | 'unit'>, n: number): string {
  return isMoney(item) ? `¥${fmt(n)}` : `${fmt(n)}${item.unit}`;
}

const clamp = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

export interface Described {
  /** 残り / 超過 / あと / 達成 / 摂取 / 使った */
  label: string;
  /** 値（単位つき）。達成のときは空 */
  value: string;
  /** ゲージ・棒の長さ（0〜1）。表は残り、裏は摂取量 */
  frac: number;
  tone: Tone;
  done: boolean;
  over: boolean;
}

export function describe(item: SummaryItem, view: View): Described {
  const over = item.kind === 'cap' && item.remaining < 0;
  const done = item.kind === 'reach' && item.remaining <= 0;

  if (view === 'back') {
    const money = isMoney(item);
    let value: string;
    if (money || item.key === 'kcal') value = withUnit(item, item.used);
    else value = `${withUnit(item, item.used)} / ${withUnit(item, item.goal)}`;
    return {
      label: money ? '使った' : '摂取',
      value,
      frac: clamp(item.used / item.goal),
      tone: over ? 'over' : 'ink',
      done,
      over,
    };
  }

  if (item.kind === 'reach') {
    return {
      label: done ? '達成' : 'あと',
      value: done ? '' : withUnit(item, item.remaining),
      frac: clamp(item.remaining / item.goal),
      tone: 'accent',
      done,
      over: false,
    };
  }
  return {
    label: over ? '超過' : '残り',
    value: withUnit(item, item.remaining),
    frac: clamp(item.remaining / item.goal),
    tone: over ? 'over' : 'accent',
    done: false,
    over,
  };
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
    return { ...it, used, remaining, state };
  });
}

/** プリセットの説明：「120kcal · P24」「180kcal · ¥150」 */
export function presetSub(amounts: Amounts, items: SummaryItem[]): string {
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
