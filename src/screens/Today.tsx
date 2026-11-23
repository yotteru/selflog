import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPreset, fetchDay, loadCache, saveCache, sendOp, updateEntry, type DayData } from '../lib/api';
import { formatDayLong, todayKey } from '../lib/dayKey';
import { type View } from '../lib/display';
import { overlay } from '../lib/overlay';
import { Queue } from '../lib/queue';
import type { Entry, Preset } from '../lib/types';
import { CalorieCard, MacroCard, MoneyCard } from '../components/Cards';
import { EntryForm, type EntryFormResult } from '../components/EntryForm';
import { EntryList } from '../components/EntryList';
import { PresetGrid, PresetSheet } from '../components/Presets';
import { Toast, type ToastState } from '../components/Toast';

const uuid = () => crypto.randomUUID();

/** 今日の残り（§5.1, モック Main） */
export function Today({ onSignOut }: { onSignOut: () => void }) {
  const [day, setDay] = useState(todayKey());
  const [data, setData] = useState<DayData | null>(() => loadCache(todayKey()));
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<View>('front');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [sheet, setSheet] = useState<null | { kind: 'presets' } | { kind: 'add' } | { kind: 'edit'; entry: Entry }>(null);

  const showToast = useCallback((message: string, onUndo?: () => void) => setToast({ message, onUndo, key: Date.now() }), []);

  // 送信キュー（アプリを閉じても端末に残る）
  const queue = useMemo(
    () => new Queue(sendOp, (op, message) => showToast(`送れなかった記録があります：${message}${op.type === 'add' ? `（${op.label}）` : ''}`)),
    [showToast],
  );
  const ops = useSyncExternalStore(
    (fn) => queue.subscribe(fn),
    () => queue.all(),
  );

  const loading = useRef(0);
  const refresh = useCallback(async () => {
    const d = todayKey();
    setDay(d);
    const seq = ++loading.current;
    const before = queue.all();
    try {
      const fresh = await fetchDay(d, true);
      if (seq !== loading.current) return;
      setData(fresh);
      saveCache(fresh);
      setLoadError('');
      queue.purgeSent(before);
    } catch (e) {
      if (seq !== loading.current) return;
      setLoadError(navigator.onLine ? (e as Error).message : 'オフラインです。記録は端末に保存し、つながったら送ります。');
      setData((cur) => cur ?? loadCache(d));
    }
  }, [queue]);

  const sync = useCallback(async () => {
    const hadUnsent = queue.unsentCount > 0;
    await queue.flush();
    if (hadUnsent) await refresh();
  }, [queue, refresh]);

  useEffect(() => {
    void (async () => {
      await queue.flush();
      await refresh();
    })();
    const onFocus = () => {
      if (document.visibilityState === 'visible') void queue.flush().then(refresh);
    };
    const onOnline = () => void sync();
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [queue, refresh, sync]);

  const shown = useMemo(() => (data ? overlay(day, data.summary, data.entries, ops) : null), [data, day, ops]);
  const items = shown?.summary ?? [];
  const kcal = items.find((i) => i.key === 'kcal');
  const money = items.find((i) => i.key === 'money');
  const macros = items.filter((i) => i !== kcal && i !== money);

  const record = useCallback(
    (label: string, values: Record<string, number>, source: Entry['source'], presetId: string | null) => {
      const id = uuid();
      queue.add({ type: 'add', id, recorded_at: new Date().toISOString(), day_key: null, source, label, preset_id: presetId, values });
      showToast(`${label || '記録'} を記録しました`, () => {
        queue.remove(id, values);
        void sync();
      });
      void sync();
    },
    [queue, showToast, sync],
  );

  const pickPreset = (p: Preset) => record(p.label, p.amounts, 'preset', p.id);

  async function submitManual(r: EntryFormResult) {
    let presetId: string | null = null;
    if (r.saveAsPreset) {
      presetId = await createPreset(r.label, r.values, (data?.presets.length ?? 0) + 1);
    }
    record(r.label, r.values, 'manual', presetId);
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

  const unsent = ops.filter((o) => !o.sent).length;

  return (
    <main className="screen">
      <header className="header">
        <div>
          <div className="date">{formatDayLong(day)}</div>
          <h1>{view === 'front' ? '今日の残り' : '今日の積み上げ'}</h1>
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

      {loadError && <div className="banner" role="status">{loadError}</div>}
      {unsent > 0 && <div className="notice">未送信の記録が {unsent} 件あります（つながったら送ります）</div>}

      {!shown ? (
        <div className="notice">読み込み中…</div>
      ) : (
        <>
          {kcal && <CalorieCard item={kcal} view={view} />}
          <MacroCard items={macros} view={view} />
          {money && <MoneyCard item={money} view={view} saving={data?.monthSaving ?? null} />}

          <PresetGrid presets={data?.presets ?? []} items={items} onPick={pickPreset} onShowAll={() => setSheet({ kind: 'presets' })} />

          <button type="button" className="primary" onClick={() => setSheet({ kind: 'add' })}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            手入力で記録
          </button>
          <div className="notice">「撮影して記録」はステップ4で追加します</div>

          <EntryList entries={shown.entries} items={items} onEdit={(entry) => setSheet({ kind: 'edit', entry })} />

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button type="button" className="link-btn" style={{ color: 'var(--sub)' }} onClick={onSignOut}>
              ログアウト
            </button>
          </div>
        </>
      )}

      {sheet?.kind === 'presets' && data && (
        <PresetSheet presets={data.presets} items={items} onPick={pickPreset} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'add' && <EntryForm items={items} onSubmit={submitManual} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'edit' && (
        <EntryForm
          items={items}
          entry={sheet.entry}
          onSubmit={(r) => submitEdit(sheet.entry, r)}
          onDelete={() => deleteEntry(sheet.entry)}
          onClose={() => setSheet(null)}
        />
      )}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </main>
  );
}
