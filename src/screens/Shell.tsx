import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  createPreset,
  fetchDay,
  loadCache,
  lookupByName,
  saveCache,
  setConfirmedEmpty,
  setDayOff,
  updateEntry,
  type DayData,
  type EstimateMode,
} from '../lib/api';
import { addDays, formatDayLabel, todayKey } from '../lib/dayKey';
import { clampDay, daysWithQueuedAdds, missingBannerText } from '../lib/days';
import { overlay } from '../lib/overlay';
import { queue } from '../lib/queueInstance';
import type { Entry, Preset } from '../lib/types';
import { EntryForm, type EntryFormResult } from '../components/EntryForm';
import { RecordSheet } from '../components/RecordSheet';
import { TabBar, type Tab } from '../components/TabBar';
import { Toast, type ToastState } from '../components/Toast';
import { Capture, type CaptureResult } from './Capture';
import { EntriesScreen } from './EntriesScreen';
import { HomeScreen } from './HomeScreen';
import { PeriodScreen } from './PeriodScreen';
import { Settings } from './Settings';

const uuid = () => crypto.randomUUID();

type SheetState =
  | null
  | { kind: 'record' }
  | { kind: 'add'; label?: string; autoLookup?: boolean }
  | { kind: 'edit'; entry: Entry };

/**
 * アプリの土台（v1）：下のタブ（ホーム／記録一覧／＋記録／期間／設定）と、日ごとのデータ・送信キュー。
 * ホームと記録一覧は同じ「選んでいる日」を見る。過去の日を選んで記録すると、その日に入る（§5.3）。
 */
export function Shell({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('home');
  const [today, setToday] = useState(todayKey());
  const [day, setDay] = useState(today);
  const [data, setData] = useState<DayData | null>(() => loadCache(today));
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [capture, setCapture] = useState<EstimateMode | null>(null);
  const [busy, setBusy] = useState(false);

  const isToday = day === today;
  const showToast = useCallback((message: string, onUndo?: () => void) => setToast({ message, onUndo, key: Date.now() }), []);

  useEffect(() => {
    queue.onDropped = (op, message) => showToast(`送れなかった記録があります：${message}${op.type === 'add' ? `（${op.label}）` : ''}`);
  }, [showToast]);

  const ops = useSyncExternalStore(
    (fn) => queue.subscribe(fn),
    () => queue.all(),
  );

  // 画面に出している日（非同期の読み込みが古い日の結果で上書きしないように）
  const dayRef = useRef(day);
  dayRef.current = day;
  const todayRef = useRef(today);
  const loading = useRef(0);

  const refresh = useCallback(async (target?: string) => {
    const t = todayKey();
    const prevToday = todayRef.current;
    todayRef.current = t;
    setToday(t);
    // 4:00 をまたいだら、「今日」を見ていた画面は新しい今日に移る
    let d = target ?? dayRef.current;
    if (!target && d === prevToday && d !== t) d = t;
    d = clampDay(d, t);
    if (d !== dayRef.current) {
      dayRef.current = d;
      setDay(d);
    }
    const seq = ++loading.current;
    const before = queue.all();
    try {
      const fresh = await fetchDay(d);
      if (seq !== loading.current) return;
      setData(fresh);
      saveCache(fresh);
      setLoadError('');
      queue.purgeSent(before);
      // 前の日を先に読んでおく（スワイプしたときにすぐ出るように）
      const prev = addDays(d, -1);
      if (!loadCache(prev)) void fetchDay(prev).then(saveCache).catch(() => {});
    } catch (e) {
      if (seq !== loading.current) return;
      setLoadError(navigator.onLine ? (e as Error).message : 'オフラインです。記録は端末に保存し、つながったら送ります。');
      setData((cur) => (cur && cur.day === d ? cur : loadCache(d)));
    }
  }, []);

  const sync = useCallback(async () => {
    const hadUnsent = queue.unsentCount > 0;
    await queue.flush();
    if (hadUnsent) await refresh();
  }, [refresh]);

  useEffect(() => {
    void (async () => {
      await queue.flush();
      await refresh();
    })();
    const onFocus = () => {
      if (document.visibilityState === 'visible') void queue.flush().then(() => refresh());
    };
    const onOnline = () => void sync();
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('online', onOnline);
    };
    // 最初の1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTo(d: string) {
    const next = clampDay(d, todayKey());
    if (next === day) return;
    setSheet(null);
    dayRef.current = next;
    setDay(next);
    // 読み込むあいだは、前の日の表示を薄く残す（「読み込み中」で画面が跳ねないように）
    const cached = loadCache(next);
    if (cached) setData(cached);
    setLoadError('');
    void refresh(next);
  }

  function selectTab(t: Tab) {
    if (t === tab) return;
    // 設定から戻ったら、目標の変更を反映するため読み直す
    if (tab === 'settings') void refresh();
    setTab(t);
  }

  const current = data && data.day === day ? data : null;
  // 選んだ日のデータがまだ無いあいだは、前に出していた日のデータを薄く出す（stale）
  const stale = !current && !!data;
  const view = current ?? data;
  const shown = useMemo(() => (view ? overlay(view.day, view.summary, view.entries, ops) : null), [view, ops]);
  const items = shown?.summary ?? [];

  // 記録漏れの日（キューに記録がある日は、もう記録したものとして外す）
  const queuedDays = useMemo(() => daysWithQueuedAdds(ops), [ops]);
  const missing = (data?.missingDays ?? []).filter((d) => !queuedDays.has(d) && d < today);

  const record = useCallback(
    (label: string, values: Record<string, number>, source: Entry['source'], presetId: string | null) => {
      const id = uuid();
      // 今日の画面からは日付を指定しない（記録時刻から決まる）。過去の日の画面からはその日に入れる（§4）
      const viewing = dayRef.current;
      const dayKey = viewing === todayKey() ? null : viewing;
      queue.add({ type: 'add', id, recorded_at: new Date().toISOString(), day_key: dayKey, source, label, preset_id: presetId, values });
      const where = dayKey ? `${formatDayLabel(dayKey)}に` : '';
      showToast(`${where}${label || '記録'} を記録しました`, () => {
        queue.remove(id, values);
        void sync();
      });
      void sync();
    },
    [showToast, sync],
  );

  const pickPreset = (p: Preset) => {
    setSheet(null);
    record(p.label, p.amounts, 'preset', p.id);
  };

  async function withPreset(r: { label: string; values: Record<string, number>; saveAsPreset: boolean }) {
    if (!r.saveAsPreset) return null;
    const max = Math.max(0, ...(current?.presets ?? []).map((p) => p.sort));
    return createPreset(r.label, r.values, max + 10);
  }

  async function submitManual(r: EntryFormResult) {
    const presetId = await withPreset(r);
    record(r.label, r.values, 'manual', presetId);
    if (presetId) void refresh();
  }

  async function submitCapture(r: CaptureResult) {
    const presetId = await withPreset(r);
    record(r.label, r.values, r.source, presetId);
    if (presetId) void refresh();
  }

  async function submitEdit(entry: Entry, r: EntryFormResult) {
    if (!navigator.onLine) throw new Error('オフラインのあいだは直せません');
    await updateEntry(entry.id, r.label, r.values);
    await refresh();
  }

  function deleteEntry(entry: Entry) {
    if (!window.confirm(`「${entry.label || '記録'}」を削除しますか？`)) return;
    setSheet(null);
    queue.remove(entry.id, entry.values);
    showToast('削除しました');
    void sync();
  }

  async function confirmEmpty(confirmed: boolean) {
    const msg = confirmed
      ? `${formatDayLabel(day)}は、何も食べず、お金も使わなかった日として確定しますか？`
      : `${formatDayLabel(day)}の「記録なしで確定」を取り消しますか？`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await setConfirmedEmpty(day, confirmed);
      await refresh();
      showToast(confirmed ? `${formatDayLabel(day)}を記録なしで確定しました` : '確定を取り消しました');
    } catch (e) {
      showToast(navigator.onLine ? (e as Error).message : 'オフラインのあいだは確定できません');
    } finally {
      setBusy(false);
    }
  }

  async function toggleDayOff() {
    const info = current?.dayInfo;
    if (!info) return;
    const nextOff = !info.off;
    const where = isToday ? '今日' : formatDayLabel(day);
    const msg = nextOff
      ? `${where}を休日として扱いますか？\n休日の目標を入れたターゲット（お金など）は、休日の目標になります。`
      : `${where}を平日として扱いますか？\n平日の目標に戻ります。`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      // 自動（土日祝）の判定と同じになるなら、手動の切り替えを消して自動に戻す
      await setDayOff(day, nextOff === info.autoOff ? null : nextOff);
      await refresh();
      showToast(`${where}を${nextOff ? '休日' : '平日'}にしました`);
    } catch (e) {
      showToast(navigator.onLine ? (e as Error).message : 'オフラインのあいだは切り替えられません');
    } finally {
      setBusy(false);
    }
  }

  const unsent = ops.filter((o) => !o.sent).length;
  const noEntries = shown && !stale ? shown.entries.length === 0 : false;
  const dayLabel = isToday ? '今日' : formatDayLabel(day);

  if (capture) {
    return (
      <Capture
        day={day}
        isToday={isToday}
        items={items}
        initialMode={capture}
        onRecord={submitCapture}
        onClose={() => setCapture(null)}
      />
    );
  }

  const common = {
    day,
    today,
    isToday,
    items,
    loading: !shown,
    stale,
    loadError,
    unsent,
    onGo: goTo,
  };

  return (
    <div className="app">
      <main className="app-body">
        {tab === 'home' && (
          <HomeScreen
            {...common}
            banner={isToday ? missingBannerText(missing) : null}
            onBanner={() => missing[0] && goTo(missing[0])}
            canConfirmEmpty={!isToday && noEntries && !current?.confirmedEmpty}
            confirmedEmpty={noEntries && Boolean(current?.confirmedEmpty)}
            busy={busy}
            onConfirmEmpty={confirmEmpty}
            dayInfo={current?.dayInfo}
            onToggleOff={toggleDayOff}
          />
        )}
        {tab === 'entries' && (
          <EntriesScreen
            {...common}
            entries={shown?.entries ?? []}
            otherMissing={missing.filter((d) => d !== day)}
            canConfirmEmpty={!isToday && noEntries && !current?.confirmedEmpty}
            confirmedEmpty={noEntries && Boolean(current?.confirmedEmpty)}
            busy={busy}
            onConfirmEmpty={confirmEmpty}
            onEdit={(entry) => setSheet({ kind: 'edit', entry })}
          />
        )}
        {tab === 'period' && (
          <PeriodScreen
            today={today}
            onOpenDay={(d) => {
              goTo(d);
              setTab('home');
            }}
          />
        )}
        {tab === 'settings' && <Settings onSignOut={onSignOut} />}
      </main>
      <TabBar tab={tab} onSelect={selectTab} onRecord={() => setSheet({ kind: 'record' })} />

      {sheet?.kind === 'record' && (
        <RecordSheet
          dayLabel={dayLabel}
          presets={current?.presets ?? []}
          items={items}
          onPick={pickPreset}
          onCapture={(mode) => {
            setSheet(null);
            setCapture(mode);
          }}
          onManual={() => setSheet({ kind: 'add' })}
          onLookup={(q) => setSheet({ kind: 'add', label: q, autoLookup: true })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'add' && (
        <EntryForm
          items={items}
          initial={sheet.label ? { label: sheet.label, values: {} } : undefined}
          autoLookup={sheet.autoLookup}
          title={isToday ? '手入力で記録' : `${formatDayLabel(day)}に手入力で記録`}
          submitLabel="記録する"
          allowSaveAsPreset
          onLookup={lookupByName}
          onSubmit={submitManual}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'edit' && (
        <EntryForm
          items={items}
          initial={sheet.entry}
          title="記録を直す"
          submitLabel="保存する"
          onSubmit={(r) => submitEdit(sheet.entry, r)}
          onDelete={() => deleteEntry(sheet.entry)}
          onClose={() => setSheet(null)}
        />
      )}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
