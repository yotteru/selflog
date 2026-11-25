// Supabase（zanryo スキーマ）とのやりとり
import { supabase } from './supabase';
import type { Op, SendResult } from './queue';
import type { Amounts, Entry, Period, Preset, RangeRow, SummaryItem } from './types';

export interface DayData {
  day: string;
  summary: SummaryItem[];
  entries: Entry[];
  presets: Preset[];
  /** 今月の節約（見込み）。どの日を見ていても、今日までの今月の値 */
  monthSaving: number | null;
  /** 「この日は記録なしで確定」済みか */
  confirmedEmpty: boolean;
  /** 記録漏れの日（直近7日、今日を除く。§3.5） */
  missingDays: string[];
  /** その日が休日か（06_holidays.sql を流す前は null） */
  dayInfo?: DayInfo | null;
  fetchedAt: string;
}

/** zanryo.day_info() */
export interface DayInfo {
  /** その日を休日として扱うか */
  off: boolean;
  /** 自動（土日祝）での判定 */
  autoOff: boolean;
  /** 手で切り替えた日か */
  manual: boolean;
  /** 祝日の名前（祝日でなければ null） */
  holidayName: string | null;
  /** 休日の目標を入れたターゲットがあるか（無ければ休日の表示を出さない） */
  hasHolidayGoals: boolean;
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

export async function fetchDay(day: string): Promise<DayData> {
  const [summary, entries, presets, saving, status, missing, info] = await Promise.all([
    supabase.rpc('daily_summary', { p_day: day }),
    supabase
      .from('entries')
      .select('id,label,source,recorded_at,preset_id,entry_values(target_id,amount)')
      .eq('day_key', day)
      .is('deleted_at', null)
      .order('recorded_at', { ascending: false }),
    supabase.rpc('presets_ranked'),
    supabase.rpc('month_saving', { p_today: null }),
    supabase.from('day_status').select('confirmed_empty').eq('day_key', day).maybeSingle(),
    supabase.rpc('missing_days'),
    supabase.rpc('day_info', { p_day: day }),
  ]);
  // day_info は 06_holidays.sql を流す前は無い。そのときは休日の表示を出さないだけにする
  type InfoRow = { off: boolean; auto_off: boolean; manual: boolean; holiday_name: string | null; has_holiday_goals: boolean };
  const infoRow = info.error ? null : ((info.data as InfoRow[] | null)?.[0] ?? null);

  type Row = Omit<Entry, 'values'> & { entry_values: { target_id: string; amount: number }[] };
  const savingValue = check(saving);
  return {
    day,
    summary: (check(summary) as SummaryItem[]).map((s) => ({
      ...s,
      goal: num(s.goal),
      used: num(s.used),
      remaining: num(s.remaining),
      period: s.period ?? 'day',
      day_used: s.day_used == null ? num(s.used) : num(s.day_used),
    })),
    entries: (check(entries) as Row[]).map(({ entry_values, ...e }) => ({
      ...e,
      values: Object.fromEntries(entry_values.map((v) => [v.target_id, num(v.amount)])),
    })),
    presets: (check(presets) as Preset[]).map((p) => ({ ...p, use_count: num(p.use_count) })),
    monthSaving: savingValue == null ? null : num(savingValue),
    confirmedEmpty: Boolean((check(status) as { confirmed_empty: boolean } | null)?.confirmed_empty),
    missingDays: (check(missing) as string[]).map(String).sort(),
    dayInfo: infoRow && {
      off: Boolean(infoRow.off),
      autoOff: Boolean(infoRow.auto_off),
      manual: Boolean(infoRow.manual),
      holidayName: infoRow.holiday_name,
      hasHolidayGoals: Boolean(infoRow.has_holiday_goals),
    },
    fetchedAt: new Date().toISOString(),
  };
}

/** 週・月の画面用：from〜to（62日まで）の日ごと・ターゲットごとの量と目標 */
export async function fetchRange(from: string, to: string): Promise<RangeRow[]> {
  const rows = check(await supabase.rpc('range_summary', { p_from: from, p_to: to })) as RangeRow[];
  return rows.map((r) => ({ ...r, day_key: String(r.day_key), goal: num(r.goal), daily_goal: num(r.daily_goal), used: num(r.used), off: Boolean(r.off) }));
}

/** その日を休日（true）／平日（false）にする。null で自動（土日祝）に戻す */
export async function setDayOff(day: string, off: boolean | null): Promise<void> {
  check(await supabase.rpc('set_day_off', { p_day: day, p_off: off }));
}

/** 「この日は記録なしで確定」（§3.5）／取り消し */
export async function setConfirmedEmpty(day: string, confirmed: boolean): Promise<void> {
  check(await supabase.rpc(confirmed ? 'confirm_empty_day' : 'unconfirm_empty_day', { p_day: day }));
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
  | Failure;

type Failure = { ok: false; reason: 'not_member' | 'bad_request' | 'daily_limit' | 'rate_limited' | 'failed' | 'offline'; detail?: string };

/** Edge Function zanryo-estimate-nutrition を呼ぶ。失敗しても例外にせず、理由を返す */
async function invokeEstimate<T>(body: Record<string, unknown>): Promise<T | Failure> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { ok: false, reason: 'offline' };
  const { data, error } = await supabase.functions.invoke('zanryo-estimate-nutrition', { body });
  if (data && typeof data === 'object' && 'ok' in data) return data as T;
  // 失敗の手がかり：関数が返した理由、なければ HTTP の番号（404=関数が無い、401=ログイン/JWT の設定 など）
  const res = (error as { context?: Response } | null)?.context;
  if (res && typeof res.status === 'number') {
    try {
      const b = await res.clone().json();
      if (b && typeof b === 'object' && 'ok' in b) return b as T;
    } catch {
      /* 本文が JSON でない */
    }
    return { ok: false, reason: 'failed', detail: `HTTP ${res.status}` };
  }
  return { ok: false, reason: 'failed', detail: error ? (error as Error).name || 'error' : 'no_response' };
}

/** 写真から下書きを作る */
export function estimate(mode: EstimateMode, image: string): Promise<EstimateResult> {
  return invokeEstimate<EstimateResult>({ mode, image });
}

export type LookupResult =
  | {
      ok: true;
      draft: { name: string; serving: string; kcal: number; p: number; f: number; c: number; price: number | null; confidence: 'low' | 'mid' | 'high' };
      sources: { title: string; uri: string }[];
      /** Google 検索を使えたか（false なら Gemini の知識だけ） */
      searched: boolean;
      /** 検索が使えなかった理由（手がかり） */
      searchError?: string;
      /** Gemini が実際に検索した回数（0 なら検索せずに答えた） */
      searchQueries?: number;
      /** Gemini が検索に使った言葉（「Google で確かめる」リンクに使う） */
      queries?: string[];
    }
  | Failure;

/** 名前で調べる（例：「吉野家 牛丼 並盛」）。送るのは言葉だけ */
export function lookupByName(query: string): Promise<LookupResult> {
  return invokeEstimate<LookupResult>({ mode: 'name', query });
}

export const FAILURE_TEXT: Record<Failure['reason'], string> = {
  daily_limit: '今日の推定回数の上限に達しました。手入力してください。',
  rate_limited: '今は推定できません（無料枠の上限）。少し待つか、手入力してください。',
  offline: 'オフラインのため調べられません。手入力してください。',
  not_member: 'このアプリの利用者として登録されていません。',
  bad_request: '送れませんでした。手入力してください。',
  failed: 'うまく調べられませんでした。手入力してください。',
};

export async function updateEntry(id: string, label: string, values: Amounts): Promise<void> {
  check(await supabase.rpc('update_entry', { p_id: id, p_values: values, p_label: label }));
}

export async function createPreset(label: string, amounts: Amounts, sort: number): Promise<string> {
  const r = await supabase.from('presets').insert({ label, amounts, sort }).select('id').single();
  return (check(r) as { id: string }).id;
}

// ---------------------------------------------------------------------------
// 設定（§5.4）
// ---------------------------------------------------------------------------

export interface Target {
  id: string;
  key: string | null;
  name: string;
  unit: string;
  kind: 'reach' | 'cap';
  /** 目標（period あたり） */
  daily_goal: number;
  /** 休日の目標（null なら平日と同じ。period が day のときだけ使う） */
  holiday_goal: number | null;
  period: Period;
  sort: number;
  active: boolean;
}

// 古い DB には列が足りないことがある（05_periods.sql の前は period、06_holidays.sql の前は holiday_goal）。
// そのときは、無い列を使わずに読み書きする（使おうとしたときだけ、流すファイルを知らせる）
const missingColumn = (e: { message: string } | null, col: string) => !!e && e.message.includes(col);

export async function listTargets(): Promise<Target[]> {
  const cols = ['id', 'key', 'name', 'unit', 'kind', 'daily_goal', 'period', 'holiday_goal', 'sort', 'active'];
  let r = await supabase.from('targets').select(cols.join(',')).order('sort').order('created_at');
  for (const col of ['holiday_goal', 'period']) {
    if (missingColumn(r.error, col)) {
      cols.splice(cols.indexOf(col), 1);
      r = await supabase.from('targets').select(cols.join(',')).order('sort').order('created_at');
    }
  }
  return (check(r) as unknown as Target[]).map((t) => ({
    ...t,
    daily_goal: num(t.daily_goal),
    holiday_goal: t.holiday_goal == null ? null : num(t.holiday_goal),
    period: t.period ?? 'day',
  }));
}

/** 古い DB に無い列を外す（その列に意味のある値が入っているときは、準備が必要と知らせる） */
function forOldDb<T extends { period: Period; holiday_goal: number | null }>(t: T, error: { message: string } | null) {
  const out: Partial<T> = { ...t };
  if (missingColumn(error, 'holiday_goal')) {
    if (t.holiday_goal != null) throw new Error('休日の目標を使うには、DB の準備（supabase/sql/06_holidays.sql）が必要です');
    delete out.holiday_goal;
  }
  if (missingColumn(error, 'period')) {
    if (t.period !== 'day') throw new Error('目標の期間を使うには、DB の準備（supabase/sql/05_periods.sql）が必要です');
    delete out.period;
    delete out.holiday_goal;
  }
  return out;
}

export async function saveTarget(t: Pick<Target, 'id' | 'name' | 'unit' | 'kind' | 'daily_goal' | 'holiday_goal' | 'period' | 'active'>): Promise<void> {
  const { id, ...fields } = t;
  let r = await supabase.from('targets').update(fields).eq('id', id);
  if (missingColumn(r.error, 'holiday_goal') || missingColumn(r.error, 'period')) {
    r = await supabase.from('targets').update(forOldDb(fields, r.error)).eq('id', id);
  }
  check(r);
}

export async function addTarget(t: Pick<Target, 'name' | 'unit' | 'kind' | 'daily_goal' | 'holiday_goal' | 'period' | 'sort'>): Promise<string> {
  let r = await supabase.from('targets').insert(t).select('id').single();
  if (missingColumn(r.error, 'holiday_goal') || missingColumn(r.error, 'period')) {
    r = await supabase.from('targets').insert(forOldDb(t, r.error)).select('id').single();
  }
  return (check(r) as { id: string }).id;
}

/** 並べ替え：画面の順に sort を 10, 20, 30… と振り直す（変わった行だけ更新）。before は並べ替える前の値 */
export async function reorder(table: 'targets' | 'presets', rows: { id: string }[], before: { id: string; sort: number }[]): Promise<void> {
  const old = new Map(before.map((r) => [r.id, r.sort]));
  const results = await Promise.all(
    rows.map((r, i) => ((i + 1) * 10 === old.get(r.id) ? null : supabase.from(table).update({ sort: (i + 1) * 10 }).eq('id', r.id))),
  );
  for (const r of results) if (r) check(r);
}

export interface PresetRow {
  id: string;
  label: string;
  sort: number;
  amounts: Amounts;
}

export async function listPresets(): Promise<PresetRow[]> {
  const r = await supabase.from('presets').select('id,label,sort,amounts').order('sort').order('label');
  return check(r) as PresetRow[];
}

export async function savePreset(p: Pick<PresetRow, 'id' | 'label' | 'amounts'>): Promise<void> {
  check(await supabase.from('presets').update({ label: p.label, amounts: p.amounts }).eq('id', p.id));
}

export async function deletePreset(id: string): Promise<void> {
  check(await supabase.from('presets').delete().eq('id', id));
}

export interface WidgetTokenStatus {
  issued_at: string;
  last_used_at: string | null;
}

export async function widgetTokenStatus(): Promise<WidgetTokenStatus | null> {
  const rows = check(await supabase.rpc('widget_token_status')) as WidgetTokenStatus[];
  return rows[0] ?? null;
}

/** 発行・再発行。平文のトークンを返すのはこのときだけ（どこにも保存しない） */
export async function issueWidgetToken(): Promise<string> {
  return check(await supabase.rpc('issue_widget_token')) as string;
}

export async function revokeWidgetToken(): Promise<void> {
  check(await supabase.rpc('revoke_widget_token'));
}

export async function geminiUsageToday(): Promise<number | null> {
  const r = await supabase.rpc('gemini_usage_today');
  return r.error || r.data == null ? null : num(r.data);
}

export const widgetUrl = () => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/zanryo-widget-summary`;

// ---------------------------------------------------------------------------
// 最後に読めたデータを端末に残しておき、オフラインで開いたときに出す（日ごと、最近の数日分）
// ---------------------------------------------------------------------------

const CACHE = 'zanryo.days.v1';
const KEEP = 10;

function readCacheMap(): Record<string, DayData> {
  try {
    return JSON.parse(localStorage.getItem(CACHE) || '{}') as Record<string, DayData>;
  } catch {
    return {};
  }
}

export function saveCache(d: DayData) {
  try {
    const map = readCacheMap();
    map[d.day] = d;
    const keep = Object.keys(map).sort().slice(-KEEP);
    localStorage.setItem(CACHE, JSON.stringify(Object.fromEntries(keep.map((k) => [k, map[k]]))));
    localStorage.removeItem('zanryo.lastDay.v1'); // 古い形式
  } catch {
    /* noop */
  }
}

export function loadCache(day: string): DayData | null {
  const d = readCacheMap()[day] as Partial<DayData> | undefined;
  if (!d || !d.summary) return null;
  return { ...d, confirmedEmpty: d.confirmedEmpty ?? false, missingDays: d.missingDays ?? [] } as DayData;
}

/** ログアウトしたら端末の記録のコピーを消す（共有端末で残さないため） */
export function clearLocalData() {
  try {
    localStorage.removeItem(CACHE);
    localStorage.removeItem('zanryo.lastDay.v1');
  } catch {
    /* noop */
  }
}
