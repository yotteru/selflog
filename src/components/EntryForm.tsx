import { useEffect, useRef, useState } from 'react';
import { FAILURE_TEXT, type LookupResult } from '../lib/api';
import type { Amounts } from '../lib/types';
import { Sheet } from './Sheet';

/** 入力欄に出すターゲット（日の集計 SummaryItem でも、設定の Target でもよい） */
export interface FieldTarget {
  target_id: string;
  key: string | null;
  name: string;
  unit: string;
}

function fieldLabel(i: FieldTarget): string {
  if (i.key === 'kcal') return 'kcal';
  if (i.key === 'money') return 'お金（円）';
  if (i.key === 'p' || i.key === 'f' || i.key === 'c') return `${i.key.toUpperCase()}（${i.unit}）`;
  return i.unit ? `${i.name}（${i.unit}）` : i.name;
}

export interface EntryFormResult {
  label: string;
  values: Amounts;
  saveAsPreset: boolean;
}

/**
 * 名前と、ターゲットごとの量を入れるフォーム。
 * 手入力で記録する／記録を直す（§5.1）／プリセットを直す（§5.4）で使う。
 */
export function EntryForm({
  items,
  initial,
  title,
  submitLabel,
  allowSaveAsPreset = false,
  requireLabel = false,
  onSubmit,
  onDelete,
  deleteLabel = 'この記録を削除する',
  onLookup,
  autoLookup = false,
  onClose,
}: {
  items: FieldTarget[];
  initial?: { label: string; values: Amounts };
  title: string;
  submitLabel: string;
  allowSaveAsPreset?: boolean;
  requireLabel?: boolean;
  onSubmit: (r: EntryFormResult) => Promise<void>;
  onDelete?: () => void;
  deleteLabel?: string;
  /** 渡すと、名前の横に「調べる」ボタンを出す（名前で栄養成分を調べる） */
  onLookup?: (query: string) => Promise<LookupResult>;
  /** 開いたらすぐ「調べる」（＋記録のシートで言葉を入れて調べたとき） */
  autoLookup?: boolean;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.target_id, initial?.values[i.target_id] ? String(initial.values[i.target_id]) : ''])),
  );
  const [saveAsPreset, setSaveAsPreset] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<Extract<LookupResult, { ok: true }> | null>(null);
  const [lookupError, setLookupError] = useState('');
  /** 調べる前に打った言葉（「元に戻す」用） */
  const [typed, setTyped] = useState<string | null>(null);

  async function lookup() {
    if (!onLookup || !label.trim()) return;
    setLooking(true);
    setLookupError('');
    setFound(null);
    try {
      const r = await onLookup(label.trim());
      if (!r.ok) {
        setLookupError(FAILURE_TEXT[r.reason] + (r.detail ? `（詳細：${r.detail}）` : ''));
        return;
      }
      if (!r.draft.name && !r.draft.kcal) {
        setLookupError('見つかりませんでした。言葉を変えるか、手入力してください。');
        return;
      }
      // 見つかった値を入れる（kcal・P・F・C、分かれば値段）。どれも記録する前に直せる
      const next = { ...vals };
      for (const i of items) {
        const v =
          i.key === 'kcal' ? r.draft.kcal : i.key === 'p' ? r.draft.p : i.key === 'f' ? r.draft.f : i.key === 'c' ? r.draft.c : i.key === 'money' ? r.draft.price : null;
        if (v != null && v > 0) next[i.target_id] = String(v);
      }
      setVals(next);
      setFound(r);
      // 名前を整えた名前に置き換える（打った言葉は「元に戻す」で戻せる）
      const tidy = r.draft.name.trim();
      if (tidy && tidy !== label.trim()) {
        setTyped(label);
        setLabel(tidy);
      } else {
        setTyped(null);
      }
    } finally {
      setLooking(false);
    }
  }

  const started = useRef(false);
  useEffect(() => {
    if (autoLookup && !started.current && label.trim()) {
      started.current = true;
      void lookup();
    }
    // 開いたときに1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const values: Amounts = {};
  for (const [k, v] of Object.entries(vals)) {
    const n = Number(v);
    if (v !== '' && Number.isFinite(n) && n > 0) values[k] = n;
  }
  const empty = Object.keys(values).length === 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (empty) return setError('どれか1つは量を入れてください');
    if ((requireLabel || saveAsPreset) && !label.trim()) return setError('名前を入れてください');
    setBusy(true);
    try {
      await onSubmit({ label: label.trim(), values, saveAsPreset });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field">
          名前
          {onLookup ? (
            <span className="lookup-row">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例：吉野家 牛丼 並盛" maxLength={60} />
              <button type="button" className="secondary" onClick={lookup} disabled={looking || !label.trim()}>
                {looking ? '調べています…' : '調べる'}
              </button>
            </span>
          ) : (
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例：鶏むね肉の定食" maxLength={60} />
          )}
        </label>
        {onLookup && !found && !lookupError && (
          <p className="hint">「調べる」を押すと、名前の言葉だけが Google（Gemini）に送られ、栄養成分と値段を調べます。個人的なことは書かないでください。</p>
        )}
        {lookupError && <div className="banner" role="status">{lookupError}</div>}
        {found && (
          <div className="lookup-result" role="status">
            <strong>
              {found.draft.name || label}
              {found.draft.serving && `（${found.draft.serving}）`}の値を入れました
            </strong>
            {typed != null && (
              <span className="hint">
                名前を「{found.draft.name}」に整えました（直せます）。
                <button
                  type="button"
                  className="inline-link"
                  onClick={() => {
                    setLabel(typed);
                    setTyped(null);
                  }}
                >
                  元に戻す
                </button>
              </span>
            )}
            {found.draft.confidence !== 'high' && <span className="hint strong">確かな値ではありません。確かめてから記録してください。</span>}
            {found.searched ? (
              found.sources.length > 0 ? (
                <span className="hint">
                  Google 検索で調べました。出典：
                  {found.sources.map((s, i) => (
                    <span key={s.uri}>
                      {i > 0 && '、'}
                      <a href={s.uri} target="_blank" rel="noopener noreferrer">
                        {s.title}
                      </a>
                    </span>
                  ))}
                </span>
              ) : (found.searchQueries ?? 0) > 0 ? (
                <span className="hint">Google 検索で調べましたが、どのページに基づく値かは返ってきませんでした。下のリンクで確かめられます。</span>
              ) : (
                <span className="hint">Gemini が検索せずに答えた値です（出典なし）。</span>
              )
            ) : (
              <span className="hint">
                Google 検索が使えなかったため、Gemini の知識から出した値です。
                {found.searchError && `（詳細：${found.searchError}）`}
              </span>
            )}
            <span className="hint">
              Google で確かめる：
              {(found.queries && found.queries.length > 0 ? found.queries : [label.trim()]).map((q, i) => (
                <span key={q}>
                  {i > 0 && '、'}
                  <a href={`https://www.google.com/search?q=${encodeURIComponent(q)}`} target="_blank" rel="noopener noreferrer">
                    {q}
                  </a>
                </span>
              ))}
            </span>
          </div>
        )}
        <div className="grid-fields">
          {items.map((i) => (
            <label className="field" key={i.target_id}>
              {fieldLabel(i)}
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={vals[i.target_id] ?? ''}
                onChange={(e) => setVals({ ...vals, [i.target_id]: e.target.value })}
              />
            </label>
          ))}
        </div>
        {allowSaveAsPreset && (
          <label className="check">
            <input type="checkbox" checked={saveAsPreset} onChange={(e) => setSaveAsPreset(e.target.checked)} />
            プリセットに保存（次回からワンタップ）
          </label>
        )}
        {error && <div className="error" role="alert">{error}</div>}
        <button type="submit" className="primary" disabled={busy}>
          {submitLabel}
        </button>
        {onDelete && (
          <button type="button" className="secondary danger" onClick={onDelete}>
            {deleteLabel}
          </button>
        )}
      </form>
    </Sheet>
  );
}
