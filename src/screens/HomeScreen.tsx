import { addDays, formatDayLabel } from '../lib/dayKey';
import { dayBounds, dayTitle } from '../lib/days';
import { fmt } from '../lib/display';
import type { SummaryItem } from '../lib/types';
import { useSwipe } from '../lib/useSwipe';
import { DayHeader } from '../components/DayHeader';
import { MeterRow, RingCard } from '../components/Gauges';

/**
 * ホーム（v1・スクロールしない）：情報を見ることに徹する画面。記録は下の「＋」から。
 * 左右のスワイプで日付が変わる（左へ＝次の日、右へ＝前の日。今日より先には進まない）。
 */
export function HomeScreen({
  day,
  today,
  isToday,
  items,
  loading,
  loadError,
  unsent,
  onGo,
  monthSaving,
  banner,
  onBanner,
  canConfirmEmpty,
  confirmedEmpty,
  busy,
  onConfirmEmpty,
}: {
  day: string;
  today: string;
  isToday: boolean;
  items: SummaryItem[];
  loading: boolean;
  loadError: string;
  unsent: number;
  onGo: (d: string) => void;
  monthSaving: number | null;
  banner: string | null;
  onBanner: () => void;
  canConfirmEmpty: boolean;
  confirmedEmpty: boolean;
  busy: boolean;
  onConfirmEmpty: (confirmed: boolean) => void;
}) {
  const { min } = dayBounds(today);
  const swipe = useSwipe({
    onPrev: () => onGo(addDays(day, -1)),
    onNext: () => onGo(addDays(day, 1)),
    canPrev: day > min,
    canNext: !isToday,
  });
  const ringItem = items.find((i) => i.key === 'kcal') ?? items[0];
  const meters = items.filter((i) => i !== ringItem);
  const saving = monthSaving == null ? undefined : `今月の節約（見込み）${monthSaving < 0 ? '−' : ''}¥${fmt(monthSaving)}`;

  return (
    <div className="home swipe-area" {...swipe}>
      {banner && (
        <button type="button" className="banner banner-button compact" onClick={onBanner}>
          <span>{banner}</span>
          <span aria-hidden="true">›</span>
        </button>
      )}

      <DayHeader day={day} today={today} title={dayTitle(day, today, 'front')} onGo={onGo} />

      {!isToday && (
        <div className="past-note compact">
          <span>＋で記録すると{formatDayLabel(day)}に入ります</span>
          <button type="button" className="inline-link" onClick={() => onGo(today)}>
            今日に戻る
          </button>
        </div>
      )}
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
      {loadError && <div className="banner compact" role="status">{loadError}</div>}
      {unsent > 0 && <div className="notice">未送信の記録が {unsent} 件（つながったら送ります）</div>}

      {loading ? (
        <div className="notice">読み込み中…</div>
      ) : (
        <>
          {ringItem && <RingCard item={ringItem} />}
          {meters.length > 0 && (
            <section className="card meters" aria-label="ターゲット">
              {meters.map((m) => (
                <MeterRow key={m.target_id} item={m} extra={m.key === 'money' ? saving : undefined} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
