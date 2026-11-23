export type Kind = 'reach' | 'cap';
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
  source: 'preset' | 'photo' | 'label' | 'manual';
  recorded_at: string;
  preset_id: string | null;
  values: Amounts;
  /** まだサーバーに届いていない（オフラインのキューにある） */
  pending?: boolean;
}
