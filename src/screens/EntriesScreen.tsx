import { formatDayLabel } from '../lib/dayKey';
import { fmt, withUnit } from '../lib/display';
import type { Entry, SummaryItem } from '../lib/types';
import { DayHeader } from '../components/DayHeader';

const SOURCE: Record<Entry['source'], string> = { preset: 'プリセット', photo: '写真', label: '成分表示', receipt: 'レシート', manual: '手入力' };

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Tokyo' });
}

function summaryOf(e: Entry, items: SummaryItem[]) {
  return items
    .filter((i) => e.values[i.target_id])
    .map((i) => (i.key === 'p' || i.key === 'f' || i.key === 'c' ? `${i.key.toUpperCase()}${Math.round(e.values[i.target_id])}` : withUnit(i, e.values[i.target_id])))
    .join(' · ');
}

/** 記録一覧（v1 のタブ）。その日の記録をタップで直す・削除する */
export function EntriesScreen({
  day,
  today,
  isToday,
  items,
  loading,
  loadError,
  unsent,
  onGo,
  entries,
  otherMissing,
  canConfirmEmpty,
  confirmedEmpty,
  busy,
  onConfirmEmpty,
  onEdit,
}: {
  day: string;
  today: string;
  isToday: boolean;
  items: SummaryItem[];
  loading: boolean;
  loadError: string;
  unsent: number;
  onGo: (d: string) => void;
  entries: Entry[];
  otherMissing: string[];
  canConfirmEmpty: boolean;
  confirmedEmpty: boolean;
  busy: boolean;
  onConfirmEmpty: (confirmed: boolean) => void;
  onEdit: (e: Entry) => void;
}) {
  const kcal = items.find((i) => i.key === 'kcal');
  const money = items.find((i) => i.key === 'money');
  return (
    <div className="entries-screen">
      <DayHeader day={day} today={today} title={isToday ? '今日の記録' : `${formatDayLabel(day)}の記録`} onGo={onGo} />
      {loadError && <div className="banner compact" role="status">{loadError}</div>}
      {unsent > 0 && <div className="notice">未送信の記録が {unsent} 件（つながったら送ります）</div>}

      <div className="stat-row">
        <div className="stat">
          <span>摂取</span>
          <strong>
            {fmt(kcal?.day_used ?? kcal?.used ?? 0)}
            <small> kcal</small>
          </strong>
        </div>
        <div className="stat">
          <span>使った</span>
          <strong>¥{fmt(money?.day_used ?? money?.used ?? 0)}</strong>
        </div>
        <div className="stat">
          <span>記録</span>
          <strong>
            {entries.length}
            <small> 件</small>
          </strong>
        </div>
      </div>

      {canConfirmEmpty && (
        <div className="confirm-inline">
          <span>この日は記録がありません</span>
          <button type="button" className="secondary small" onClick={() => onConfirmEmpty(true)} disabled={busy}>
            記録なしで確定
          </button>
        </div>
      )}
      {confirmedEmpty && (
        <div className="confirm-inline">
          <span>✓ 記録なしで確定した日</span>
          <button type="button" className="inline-link" onClick={() => onConfirmEmpty(false)} disabled={busy}>
            取り消す
          </button>
        </div>
      )}

      <section className="card entry-list" aria-label="記録一覧">
        {loading ? (
          <div className="notice">読み込み中…</div>
        ) : entries.length === 0 ? (
          <div className="notice">まだ記録がありません。下の「＋」から記録できます。</div>
        ) : (
          entries.map((e) => (
            <button key={e.id} type="button" className="entry-row" onClick={() => onEdit(e)} disabled={e.pending}>
              <span className="time">{time(e.recorded_at)}</span>
              <span className="main">
                <span className="label">{e.label || '（名前なし）'}</span>
                <span className="meta">{summaryOf(e, items)}</span>
              </span>
              <span className="tag">{e.pending ? '未送信' : SOURCE[e.source]}</span>
              <span aria-hidden="true" className="chev">
                ›
              </span>
            </button>
          ))
        )}
      </section>
      {!loading && entries.length > 0 && <p className="hint center">タップで直す・削除する</p>}
      {!isToday && otherMissing.length > 0 && (
        <button type="button" className="link-btn" onClick={() => onGo(otherMissing[0])}>
          ほかにも記録していない日があります（{otherMissing.map(formatDayLabel).join('、')}）›
        </button>
      )}
    </div>
  );
}
