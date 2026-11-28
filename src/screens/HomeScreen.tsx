import { addDays, formatDayLabel } from '../lib/dayKey';
import { paceFor } from '../lib/pace';
import { dayBounds, dayTitle } from '../lib/days';
import type { RangeRow, SummaryItem } from '../lib/types';
import type { DayInfo } from '../lib/api';
import { useSwipe } from '../lib/useSwipe';
import { DayNav, DayTitle } from '../components/DayHeader';
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
  stale = false,
  loadError,
  unsent,
  onGo,
  banner,
  onBanner,
  canConfirmEmpty,
  confirmedEmpty,
  busy,
  onConfirmEmpty,
  dayInfo,
  onToggleOff,
  guideRows,
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
  banner: string | null;
  onBanner: () => void;
  canConfirmEmpty: boolean;
  confirmedEmpty: boolean;
  busy: boolean;
  onConfirmEmpty: (confirmed: boolean) => void;
  /** その日が休日か（休日の目標を入れたターゲットがあるときだけ表示する） */
  dayInfo?: DayInfo | null;
  onToggleOff?: () => void;
  /** 今日の目安のための、今週・今月の日ごとの量と目標 */
  guideRows?: RangeRow[] | null;
}) {
  const { min } = dayBounds(today);
  const swipe = useSwipe({
    onPrev: () => onGo(addDays(day, -1)),
    onNext: () => onGo(addDays(day, 1)),
    canPrev: day > min,
    canNext: !isToday,
  });
  // 今日の目安（▼）：今週（今月）の残りを、今日から終わりまでの日に分けた今日の分。日ごとに決まる
  const pace = (i: SummaryItem) => paceFor(i, guideRows, day, today);
  const ringItem = items.find((i) => i.key === 'kcal') ?? items[0];
  const meters = items.filter((i) => i !== ringItem);

  return (
    <div className="home swipe-area" ref={swipe.ref} {...swipe.handlers}>
      {banner && (
        <button type="button" className="banner banner-button compact" onClick={onBanner}>
          <span>{banner}</span>
          <span aria-hidden="true">›</span>
        </button>
      )}

      <DayTitle
        day={day}
        today={today}
        title={dayTitle(day, today, 'front')}
        badge={
          dayInfo?.hasHolidayGoals && !stale ? (
            <button
              type="button"
              className={`day-type ${dayInfo.off ? 'off' : ''}`}
              onClick={onToggleOff}
              disabled={busy}
              aria-label={`${dayInfo.off ? '休日' : '平日'}の目標（タップで切り替え）`}
            >
              {dayInfo.off ? (dayInfo.manual ? '休日（手動）' : dayInfo.holidayName ?? '休日') : dayInfo.manual ? '平日（手動）' : '平日'}
              <span aria-hidden="true"> ⇄</span>
            </button>
          ) : undefined
        }
      />

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
                <MeterRow key={m.target_id} item={m} pace={stale ? null : pace(m)} />
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
