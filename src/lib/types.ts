export type Kind = 'reach' | 'cap';
/** 目標の期間（v1）。week は月曜はじまり、month は1日はじまり */
export type Period = 'day' | 'week' | 'month';
export type State = 'ok' | 'over' | 'done';
export type TargetKey = 'kcal' | 'p' | 'f' | 'c' | 'money';

/** zanryo.daily_summary() の1行 */
export interface SummaryItem {
  target_id: string;
  key: TargetKey | null;
  name: string;
  unit: string;
  kind: Kind;
  sort: number;
  goal: number;
  used: number;
  remaining: number;
  state: State;
  /** 目標の期間。goal / used / remaining はこの期間の値（日なら今までどおり） */
  period?: Period;
  period_start?: string;
  period_end?: string;
  /** その日だけの量 */
  day_used?: number;
}

/** zanryo.range_summary() の1行（週・月の画面用） */
export interface RangeRow {
  day_key: string;
  target_id: string;
  key: TargetKey | null;
  name: string;
  unit: string;
  kind: Kind;
  sort: number;
  period: Period;
  /** 期間あたりの目標 */
  goal: number;
  /** 1日あたりに割った目標 */
  daily_goal: number;
  /** その日だけの量 */
  used: number;
  confirmed: boolean;
}

/** target_id → 量 */
export type Amounts = Record<string, number>;

export interface Preset {
  id: string;
  label: string;
  sort: number;
  amounts: Amounts;
  use_count: number;
}

export interface Entry {
  id: string;
  label: string;
  source: 'preset' | 'photo' | 'label' | 'receipt' | 'manual';
  recorded_at: string;
  preset_id: string | null;
  values: Amounts;
  /** まだサーバーに届いていない（オフラインのキューにある） */
  pending?: boolean;
}
