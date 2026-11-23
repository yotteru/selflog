import { useEffect, useState, useSyncExternalStore } from 'react';
import { addDays, formatDayLabel } from '../lib/dayKey';
import { pacePrefsVersion, paceFor, showPace, subscribePace } from '../lib/pace';
import { dayBounds, dayTitle } from '../lib/days';
import { fmt } from '../lib/display';
import type { SummaryItem } from '../lib/types';
import { useSwipe } from '../lib/useSwipe';
import { DayNav, DayTitle } from '../components/DayHeader';
import { MeterRow, RingCard } from '../components/Gauges';

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    const onVisible = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return now;
}

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
  stale = false,
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
  /** 選んだ日を読み込み中で、前の日の表示を薄く出している */
  stale?: boolean;
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
  // ペースの目安：1分ごとに時刻を進め、ターゲットごとの「出す・出さない」の変更にもついていく
  const now = useNow();
  useSyncExternalStore(subscribePace, pacePrefsVersion);
  const pace = (i: SummaryItem) => (showPace(i) ? paceFor(i, day, now) : null);
  const ringItem = items.find((i) => i.key === 'kcal') ?? items[0];
  const meters = items.filter((i) => i !== ringItem);
  const saving = monthSaving == null ? undefined : `今月の節約（見込み）${monthSaving < 0 ? '−' : ''}¥${fmt(monthSaving)}`;

  return (
    <div className="home swipe-area" ref={swipe.ref} {...swipe.handlers}>
      {banner && (
        <button type="button" className="banner banner-button compact" onClick={onBanner}>
          <span>{banner}</span>
          <span aria-hidden="true">›</span>
        </button>
      )}

      <DayTitle day={day} today={today} title={dayTitle(day, today, 'front')} />

      {!isToday && (
        <div className="past-note compact">
          <span>＋で記録すると{formatDayLabel(day)}に入ります</span>
        </div>
      )}
      {loadError && <div className="banner compact" role="status">{loadError}</div>}
      {unsent > 0 && <div className="notice">未送信の記録が {unsent} 件（つながったら送ります）</div>}

      {loading ? (
        <div className="notice">読み込み中…</div>
      ) : (
        <>
          <div className={`day-content ${stale ? 'stale' : ''}`} aria-busy={stale}>
          {ringItem && <RingCard item={ringItem} pace={stale ? null : pace(ringItem)} />}
          {meters.length > 0 && (
            <section className="card meters" aria-label="ターゲット">
              {meters.map((m) => (
                <MeterRow key={m.target_id} item={m} pace={stale ? null : pace(m)} extra={m.key === 'money' ? saving : undefined} />
              ))}
            </section>
          )}
          </div>
        </>
      )}

      <div className="bottom-controls">
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
        <DayNav day={day} today={today} onGo={onGo} />
      </div>
    </div>
  );
}
