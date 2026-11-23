import { withUnit } from '../lib/display';
import type { Entry, SummaryItem } from '../lib/types';

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Tokyo' });
}

function summaryOf(e: Entry, items: SummaryItem[]) {
  return items
    .filter((i) => e.values[i.target_id])
    .map((i) => (i.key === 'p' || i.key === 'f' || i.key === 'c' ? `${i.key.toUpperCase()}${Math.round(e.values[i.target_id])}` : withUnit(i, e.values[i.target_id])))
    .join(' · ');
}

/** 今日の記録一覧（v0 は簡素な一覧）。タップで編集 */
export function EntryList({ entries, items, onEdit }: { entries: Entry[]; items: SummaryItem[]; onEdit: (e: Entry) => void }) {
  return (
    <section className="card entries" aria-label="記録一覧">
      <h2>記録（{entries.length}件）</h2>
      {entries.length === 0 && <div className="entry meta">まだ記録がありません</div>}
      {entries.map((e) => (
        <div className="entry" key={e.id}>
          <button type="button" className="main" onClick={() => onEdit(e)} disabled={e.pending}>
            <div className="label">
              {e.label || '（名前なし）'}
              {e.pending && <span className="pending">未送信</span>}
            </div>
            <div className="meta">
              {time(e.recorded_at)} · {summaryOf(e, items)}
            </div>
          </button>
        </div>
      ))}
    </section>
  );
}
