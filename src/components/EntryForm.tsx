import { useState } from 'react';
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
  onClose: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.target_id, initial?.values[i.target_id] ? String(initial.values[i.target_id]) : ''])),
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
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例：鶏むね肉の定食" maxLength={60} />
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
