import { useState } from 'react';
import type { EstimateMode } from '../lib/api';
import { presetSub } from '../lib/display';
import type { Preset, SummaryItem } from '../lib/types';
import { Sheet } from './Sheet';

const WAYS: { mode: EstimateMode; label: string; icon: string }[] = [
  { mode: 'photo', label: '料理を撮る', icon: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3 3 0 1 0 0 6a3 3 0 1 0 0-6' },
  { mode: 'label', label: '成分表示', icon: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5' },
  { mode: 'receipt', label: 'レシート', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6' },
];

/**
 * ＋記録（下のタブの真ん中）：調べる・撮影・手入力・すべてのプリセットを1か所に。
 * プリセットはよく使う順。タップするとすぐ記録して閉じる。
 */
export function RecordSheet({
  dayLabel,
  presets,
  items,
  onPick,
  onCapture,
  onManual,
  onLookup,
  onClose,
}: {
  dayLabel: string;
  presets: Preset[];
  items: SummaryItem[];
  onPick: (p: Preset) => void;
  onCapture: (mode: EstimateMode) => void;
  onManual: () => void;
  onLookup: (query: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  return (
    <Sheet title="記録する" onClose={onClose}>
      <p className="hint">{dayLabel}に入ります</p>
      <form
        className="lookup-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) onLookup(query.trim());
        }}
      >
        <input aria-label="名前で調べる" placeholder="名前で調べる（例：吉野家 牛丼 並盛）" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={60} />
        <button type="submit" className="primary small" disabled={!query.trim()}>
          調べる
        </button>
      </form>
      <div className="ways">
        {WAYS.map((w) => (
          <button key={w.mode} type="button" className="way" onClick={() => onCapture(w.mode)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={w.icon} />
            </svg>
            {w.label}
          </button>
        ))}
        <button type="button" className="way" onClick={onManual}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />
          </svg>
          手入力
        </button>
      </div>
      <div className="row-between">
        <strong style={{ fontSize: 14 }}>プリセット</strong>
        <span className="hint">よく使う順 · タップで記録</span>
      </div>
      {presets.length === 0 ? (
        <p className="hint">まだありません。記録するときに「プリセットに保存」で作れます。</p>
      ) : (
        <div className="sheet-presets">
          {presets.map((p) => (
            <button key={p.id} type="button" className="preset" onClick={() => onPick(p)}>
              <span className="label">＋ {p.label}</span>
              <span className="sub">{presetSub(p.amounts, items)}</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
