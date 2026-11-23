// 撮影して記録（§5.2）の計算。画面から切り離してテストする。
import type { Amounts, SummaryItem } from './types';

export interface Nutrients {
  kcal: number;
  p: number;
  f: number;
  c: number;
}
export type Basis = 'per100g' | 'per_unit';

const r1 = (n: number) => Math.round(n * 10) / 10;
const map = (v: Nutrients, k: number): Nutrients => ({ kcal: r1(v.kcal * k), p: r1(v.p * k), f: r1(v.f * k), c: r1(v.c * k) });
/** 丸めずに掛ける（基準の切り替えを往復しても値がずれないように） */
const scale = (v: Nutrients, k: number): Nutrients => ({ kcal: v.kcal * k, p: v.p * k, f: v.f * k, c: v.c * k });

/** 料理の写真：推定値 × 分量（×0.5 単位） */
export function photoRecord(v: Nutrients, servings: number): Nutrients {
  return map(v, servings);
}

/**
 * 成分表示の基準を切り替える（100gあたり ⇔ 1つ分あたり）。
 * 1つ分が何gか（unitGrams）が分からないと切り替えられないので null を返す。
 * 丸めない（表示するときに丸める）。
 */
export function convertBasis(v: Nutrients, from: Basis, to: Basis, unitGrams: number | null): Nutrients | null {
  if (from === to) return v;
  if (!unitGrams || unitGrams <= 0) return null;
  return from === 'per100g' ? scale(v, unitGrams / 100) : scale(v, 100 / unitGrams);
}

/** 成分表示：基準あたりの値 × 食べた量（100gあたりなら g、1つ分あたりなら 個数） */
export function labelRecord(v: Nutrients, basis: Basis, amount: number): Nutrients {
  if (!Number.isFinite(amount) || amount <= 0) return { kcal: 0, p: 0, f: 0, c: 0 };
  return map(v, basis === 'per100g' ? amount / 100 : amount);
}

/** 基準を切り替えたときの「食べた量」の初期値。同じ量を食べたことになるように換算する */
export function convertAmount(amount: number, from: Basis, to: Basis, unitGrams: number | null): number {
  if (from === to || !unitGrams) return to === 'per100g' ? unitGrams ?? 100 : 1;
  return from === 'per100g' ? r1(amount / unitGrams) : r1(amount * unitGrams);
}

/** kcal / P / F / C / お金 を、ターゲットID → 量 に変える（0 は入れない） */
export function toAmounts(v: Partial<Nutrients> & { money?: number }, items: SummaryItem[]): Amounts {
  const out: Amounts = {};
  for (const it of items) {
    const key = it.key as keyof typeof v | null;
    if (!key) continue;
    const n = v[key];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[it.target_id] = n;
  }
  return out;
}

export const round1 = r1;

export function describeRecord(v: Partial<Nutrients> & { money?: number }): string {
  const parts: string[] = [];
  if (v.kcal) parts.push(`${Math.round(v.kcal)}kcal`);
  const pfc = (['p', 'f', 'c'] as const).filter((k) => v[k]).map((k) => `${k.toUpperCase()}${r1(v[k]!)}`);
  if (pfc.length) parts.push(pfc.join(' '));
  if (v.money) parts.push(`¥${Math.round(v.money).toLocaleString('ja-JP')}`);
  return parts.join(' · ') || '—';
}
