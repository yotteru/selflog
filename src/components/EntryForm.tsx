import { useState } from 'react';
import type { Amounts, Entry, SummaryItem } from '../lib/types';
import { Sheet } from './Sheet';

function fieldLabel(i: SummaryItem): string {
  if (i.key === 'kcal') return 'kcal';
  if (i.key === 'money') return 'お金（円）';
  if (i.key === 'p' || i.key === 'f' || i.key === 'c') return `${i.key.toUpperCase()}（${i.unit}）`;
  return `${i.name}（${i.unit}）`;
}

export interface EntryFormResult {
  label: string;
  values: Amounts;
  saveAsPreset: boolean;
}

/** 手入力で記録する／記録を直す（§5.1 今日の記録一覧の編集） */
export function EntryForm({
  items,
  entry,
  onSubmit,
  onDelete,
  onClose,
}: {
  items: SummaryItem[];
  /** 渡せば編集、無ければ新規 */
  entry?: Entry;
  onSubmit: (r: EntryFormResult) => Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(entry?.label ?? '');
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.target_id, entry?.values[i.target_id] ? String(entry.values[i.target_id]) : ''])),
  );
  const [saveAsPreset, setSaveAsPreset] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    if (saveAsPreset && !label.trim()) return setError('プリセットに保存するときは名前を入れてください');
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
    <Sheet title={entry ? '記録を直す' : '手入力で記録'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field">
          名前
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例：鶏むね肉の定食" maxLength={80} />
        </label>
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
        {!entry && (
          <label className="check">
            <input type="checkbox" checked={saveAsPreset} onChange={(e) => setSaveAsPreset(e.target.checked)} />
            プリセットに保存（次回からワンタップ）
          </label>
        )}
        {error && <div className="error" role="alert">{error}</div>}
        <button type="submit" className="primary" disabled={busy}>
          {entry ? '保存する' : '記録する'}
        </button>
        {entry && onDelete && (
          <button type="button" className="secondary danger" onClick={onDelete}>
            この記録を削除する
          </button>
        )}
      </form>
    </Sheet>
  );
}
