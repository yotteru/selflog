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

export type EstimateMode = 'photo' | 'label' | 'receipt';
export type EstimateResult =
  | { ok: true; mode: 'photo'; draft: { name: string; kcal: number; p: number; f: number; c: number; confidence: 'low' | 'mid' | 'high' } }
  | { ok: true; mode: 'label'; draft: { basis: 'per100g' | 'per_unit'; unit_label: string; unit_grams: number | null; kcal: number; p: number; f: number; c: number } }
  | { ok: true; mode: 'receipt'; draft: { store: string; total: number; items: { name: string; price: number }[] } }
  | { ok: false; reason: 'not_member' | 'bad_request' | 'daily_limit' | 'rate_limited' | 'failed' | 'offline'; detail?: string };

/** 写真から下書きを作る（Edge Function zanryo-estimate-nutrition）。失敗しても例外にせず、理由を返す */
export async function estimate(mode: EstimateMode, image: string): Promise<EstimateResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { ok: false, reason: 'offline' };
  const { data, error } = await supabase.functions.invoke('zanryo-estimate-nutrition', { body: { mode, image } });
  if (data && typeof data === 'object' && 'ok' in data) return data as EstimateResult;
  // 失敗の手がかり：関数が返した理由、なければ HTTP の番号（404=関数が無い、401=ログイン/JWT の設定 など）
  const res = (error as { context?: Response } | null)?.context;
  if (res && typeof res.status === 'number') {
    try {
      const body = await res.clone().json();
      if (body && typeof body === 'object' && 'ok' in body) return body as EstimateResult;
    } catch {
      /* 本文が JSON でない */
    }
    return { ok: false, reason: 'failed', detail: `HTTP ${res.status}` };
  }
  return { ok: false, reason: 'failed', detail: error ? (error as Error).name || 'error' : 'no_response' };
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
