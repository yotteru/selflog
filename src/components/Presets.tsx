import { presetSub } from '../lib/display';
import type { Preset, SummaryItem } from '../lib/types';
import { Sheet } from './Sheet';

function PresetButton({ p, items, onPick }: { p: Preset; items: SummaryItem[]; onPick: (p: Preset) => void }) {
  return (
    <button type="button" className="preset" onClick={() => onPick(p)}>
      <span className="label">＋ {p.label}</span>
      <span className="sub">{presetSub(p.amounts, items)}</span>
    </button>
  );
}

/** よく使う上位3件（§5.1） */
export function PresetGrid({
  presets,
  items,
  onPick,
  onShowAll,
}: {
  presets: Preset[];
  items: SummaryItem[];
  onPick: (p: Preset) => void;
  onShowAll: () => void;
}) {
  return (
    <section aria-label="プリセット">
      <div className="presets">
        {presets.length === 0 ? (
          <div className="preset empty">プリセットはまだありません（手入力のときに保存できます）</div>
        ) : (
          presets.slice(0, 3).map((p) => <PresetButton key={p.id} p={p} items={items} onPick={onPick} />)
        )}
      </div>
      {presets.length > 3 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="link-btn" onClick={onShowAll}>
            すべてのプリセット（{presets.length}）
          </button>
        </div>
      )}
    </section>
  );
}

export function PresetSheet({
  presets,
  items,
  onPick,
  onClose,
}: {
  presets: Preset[];
  items: SummaryItem[];
  onPick: (p: Preset) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="プリセット" onClose={onClose}>
      <div className="presets">
        {presets.map((p) => (
          <PresetButton
            key={p.id}
            p={p}
            items={items}
            onPick={(x) => {
              onClose();
              onPick(x);
            }}
          />
        ))}
      </div>
    </Sheet>
  );
}
