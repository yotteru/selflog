import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPreset, fetchDay, loadCache, saveCache, setConfirmedEmpty, updateEntry, type DayData } from '../lib/api';
import { addDays, formatDayLabel, formatDayLong, todayKey } from '../lib/dayKey';
import { clampDay, dayBounds, dayTitle, daysWithQueuedAdds, missingBannerText, relativeLabel } from '../lib/days';
import { type View } from '../lib/display';
import { overlay } from '../lib/overlay';
import { queue } from '../lib/queueInstance';
import type { Entry, Preset } from '../lib/types';
import { CalorieCard, MacroCard, MoneyCard } from '../components/Cards';
import { EntryForm, type EntryFormResult } from '../components/EntryForm';
import { EntryList } from '../components/EntryList';
import { PresetGrid, PresetSheet } from '../components/Presets';
import { Toast, type ToastState } from '../components/Toast';
import { Capture, type CaptureResult } from './Capture';
import { Settings } from './Settings';

const uuid = () => crypto.randomUUID();

/**
 * 日ごとの画面。
 * - 今日：今日の残り（§5.1, モック Main）。記録漏れの日があれば一番上にお知らせ（§3.5）
 * - 過去の日：同じ構成で、その日の残量と記録（§5.3）。ここから記録したものはすべてその日に入る
 */
export function Home({ onSignOut }: { onSignOut: () => void }) {
  const [today, setToday] = useState(todayKey());
  const [day, setDay] = useState(today);
  const [data, setData] = useState<DayData | null>(() => loadCache(today));
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<View>('front');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [screen, setScreen] = useState<'day' | 'capture' | 'settings'>('day');
  const [sheet, setSheet] = useState<null | { kind: 'presets' } | { kind: 'add' } | { kind: 'edit'; entry: Entry }>(null);
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
    setData(loadCache(next));
    setLoadError('');
    void refresh(next);
    window.scrollTo(0, 0);
  }

  const current = data && data.day === day ? data : null;
  const shown = useMemo(() => (current ? overlay(day, current.summary, current.entries, ops) : null), [current, day, ops]);
  const items = shown?.summary ?? [];
  const kcal = items.find((i) => i.key === 'kcal');
  const money = items.find((i) => i.key === 'money');
  const macros = items.filter((i) => i !== kcal && i !== money);

  // 記録漏れの日（キューに記録がある日は、もう記録したものとして外す）
  const queuedDays = useMemo(() => daysWithQueuedAdds(ops), [ops]);
  const missing = (data?.missingDays ?? []).filter((d) => !queuedDays.has(d) && d < today);
  const banner = missingBannerText(missing);
  const otherMissing = missing.filter((d) => d !== day);

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

  const pickPreset = (p: Preset) => record(p.label, p.amounts, 'preset', p.id);

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
      ? `${formatDayLabel(day)}は、何も食べず、お金も使わなかった日として確定しますか？\n今月の節約には、この日の目標額がそのまま入ります。`
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

  const unsent = ops.filter((o) => !o.sent).length;
  const { min } = dayBounds(today);

  if (screen === 'capture') {
    return <Capture day={day} isToday={isToday} items={items} onRecord={submitCapture} onClose={() => setScreen('day')} />;
  }
  if (screen === 'settings') {
    return (
      <Settings
        onClose={() => {
          setScreen('day');
          void refresh();
        }}
        onSignOut={onSignOut}
      />
    );
  }

  const noEntries = shown ? shown.entries.length === 0 : false;

  return (
    <main className="screen">
      {isToday && banner && (
        <button type="button" className="banner banner-button" onClick={() => goTo(missing[0])}>
          <span>{banner}</span>
          <span aria-hidden="true">›</span>
        </button>
      )}

      <header className="header">
        <div>
          <label className="date-picker">
            <span className="date">
              {formatDayLong(day)}
              {!isToday && <span className="rel">（{relativeLabel(day, today)}）</span>} ▾
            </span>
            <input
              type="date"
              aria-label="日付を選ぶ"
              min={min}
              max={today}
              value={day}
              onChange={(e) => e.target.value && goTo(e.target.value)}
            />
          </label>
          <h1 className={isToday ? '' : 'past'}>{dayTitle(day, today, view)}</h1>
        </div>
        <div className="seg" role="group" aria-label="表示の切り替え">
          <button type="button" aria-pressed={view === 'front'} onClick={() => setView('front')}>
            残り
          </button>
          <button type="button" aria-pressed={view === 'back'} onClick={() => setView('back')}>
            積み上げ
          </button>
        </div>
      </header>

      <nav className="day-nav" aria-label="日付の移動">
        <button type="button" className="link-btn" onClick={() => goTo(addDays(day, -1))} disabled={day <= min}>
          ‹ 前の日
        </button>
        {!isToday && (
          <button type="button" className="link-btn" onClick={() => goTo(today)}>
            今日に戻る
          </button>
        )}
        <button type="button" className="link-btn" onClick={() => goTo(addDays(day, 1))} disabled={isToday} aria-label="次の日">
          次の日 ›
        </button>
      </nav>

      {!isToday && <div className="past-note">この画面から記録すると、{formatDayLabel(day)}の記録になります</div>}
      {loadError && <div className="banner" role="status">{loadError}</div>}
      {unsent > 0 && <div className="notice">未送信の記録が {unsent} 件あります（つながったら送ります）</div>}

      {!shown ? (
        <div className="notice">読み込み中…</div>
      ) : (
        <>
          {kcal && <CalorieCard item={kcal} view={view} />}
          <MacroCard items={macros} view={view} />
          {money && <MoneyCard item={money} view={view} saving={current?.monthSaving ?? null} />}

          <PresetGrid presets={current?.presets ?? []} items={items} onPick={pickPreset} onShowAll={() => setSheet({ kind: 'presets' })} />

          <button type="button" className="primary" onClick={() => setScreen('capture')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            撮影して記録
          </button>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button type="button" className="link-btn" onClick={() => setSheet({ kind: 'add' })}>
              手入力で記録
            </button>
          </div>

          {!isToday && noEntries && !current?.confirmedEmpty && (
            <section className="card confirm-empty">
              <p>この日は記録がありません。何も食べず、お金も使わなかった日なら、確定してください。確定すると今月の節約に入ります。</p>
              <button type="button" className="secondary" onClick={() => confirmEmpty(true)} disabled={busy}>
                この日は記録なしで確定
              </button>
            </section>
          )}
          {noEntries && current?.confirmedEmpty && (
            <section className="card confirm-empty">
              <p>✓ 記録なしで確定した日です。</p>
              <button type="button" className="link-btn" onClick={() => confirmEmpty(false)} disabled={busy}>
                確定を取り消す
              </button>
            </section>
          )}

          <EntryList entries={shown.entries} items={items} onEdit={(entry) => setSheet({ kind: 'edit', entry })} title={isToday ? '今日の記録' : `${formatDayLabel(day)}の記録`} />

          {!isToday && otherMissing.length > 0 && (
            <button type="button" className="link-btn" onClick={() => goTo(otherMissing[0])}>
              ほかにも記録していない日があります（{otherMissing.map(formatDayLabel).join('、')}）›
            </button>
          )}

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button type="button" className="link-btn" style={{ color: 'var(--sub)' }} onClick={() => setScreen('settings')}>
              ⚙ 設定
            </button>
          </div>
        </>
      )}

      {sheet?.kind === 'presets' && current && (
        <PresetSheet presets={current.presets} items={items} onPick={pickPreset} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'add' && (
        <EntryForm
          items={items}
          title={isToday ? '手入力で記録' : `${formatDayLabel(day)}に手入力で記録`}
          submitLabel="記録する"
          allowSaveAsPreset
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
    </main>
  );
}
