// Supabase（zanryo スキーマ）とのやりとり
import { supabase } from './supabase';
import type { Op, SendResult } from './queue';
import type { Amounts, Entry, Preset, SummaryItem } from './types';

export interface DayData {
  day: string;
  summary: SummaryItem[];
  entries: Entry[];
  presets: Preset[];
  monthSaving: number | null;
  fetchedAt: string;
}

const num = (v: unknown) => Number(v ?? 0);

function friendly(message: string): string {
  if (message.includes('利用者として登録されていません')) return 'このアプリの利用者として登録されていません（supabase/sql/10_add_member.sql）';
  return message;
}

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(friendly(r.error.message));
  return r.data as T;
}

export async function bootstrap(): Promise<void> {
  check(await supabase.rpc('bootstrap'));
}

export async function fetchDay(day: string, isToday: boolean): Promise<DayData> {
  const [summary, entries, presets, saving] = await Promise.all([
    supabase.rpc('daily_summary', { p_day: day }),
    supabase
      .from('entries')
      .select('id,label,source,recorded_at,preset_id,entry_values(target_id,amount)')
      .eq('day_key', day)
      .is('deleted_at', null)
      .order('recorded_at', { ascending: false }),
    supabase.rpc('presets_ranked'),
    supabase.rpc('month_saving', { p_today: isToday ? null : day }),
  ]);

  type Row = Omit<Entry, 'values'> & { entry_values: { target_id: string; amount: number }[] };
  return {
    day,
    summary: (check(summary) as SummaryItem[]).map((s) => ({
      ...s,
      goal: num(s.goal),
      used: num(s.used),
      remaining: num(s.remaining),
    })),
    entries: (check(entries) as Row[]).map(({ entry_values, ...e }) => ({
      ...e,
      values: Object.fromEntries(entry_values.map((v) => [v.target_id, num(v.amount)])),
    })),
    presets: (check(presets) as Preset[]).map((p) => ({ ...p, use_count: num(p.use_count) })),
    monthSaving: check(saving) == null ? null : num(check(saving)),
    fetchedAt: new Date().toISOString(),
  };
}

/** キューの1件を送る。通信できないときは 'network'（あとで送り直す） */
export async function sendOp(op: Op): Promise<SendResult> {
  const r =
    op.type === 'add'
      ? await supabase.rpc('add_entry', {
          p_source: op.source,
          p_values: op.values,
          p_label: op.label,
          p_preset_id: op.preset_id,
          p_day_key: op.day_key,
          p_recorded_at: op.recorded_at,
          p_id: op.id,
        })
      : await supabase.rpc('delete_entry', { p_id: op.id });
  if (!r.error) return 'ok';
  // fetch 自体が失敗したとき（オフラインなど）は status が 0 になる
  if (r.status === 0 || (typeof navigator !== 'undefined' && !navigator.onLine)) return 'network';
  if (r.status >= 500) return 'network';
  return { error: friendly(r.error.message) };
}

export async function updateEntry(id: string, label: string, values: Amounts): Promise<void> {
  check(await supabase.rpc('update_entry', { p_id: id, p_values: values, p_label: label }));
}

export async function createPreset(label: string, amounts: Amounts, sort: number): Promise<string> {
  const r = await supabase.from('presets').insert({ label, amounts, sort }).select('id').single();
  return (check(r) as { id: string }).id;
}

// 最後に読めたデータを端末に残しておき、オフラインで開いたときに出す
const CACHE = 'zanryo.lastDay.v1';
export function saveCache(d: DayData) {
  try {
    localStorage.setItem(CACHE, JSON.stringify(d));
  } catch {
    /* noop */
  }
}
export function loadCache(day: string): DayData | null {
  try {
    const d = JSON.parse(localStorage.getItem(CACHE) || 'null') as DayData | null;
    return d && d.day === day ? d : null;
  } catch {
    return null;
  }
}
