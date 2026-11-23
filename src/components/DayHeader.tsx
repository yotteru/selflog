import { addDays, formatDayLong } from '../lib/dayKey';
import { dayBounds, relativeLabel } from '../lib/days';

/** 画面上の見出し：タイトルと、選んでいる日の小さな表示（操作は下の DayNav で） */
export function DayTitle({ day, today, title }: { day: string; today: string; title: string }) {
  const isToday = day === today;
  return (
    <header className="day-header">
      <div className="day-header-left">
        <span className="day-sub">
          {formatDayLong(day)}
          {!isToday && `・${relativeLabel(day, today)}`}
        </span>
        <h1 className={isToday ? '' : 'past'}>{title}</h1>
      </div>
    </header>
  );
}

/**
 * 日付の移動（画面の下・親指の届く位置）。‹ 前の日 / 日付（タップで選ぶ）/ 次の日 ›。
 * 日付のボタンの上に透明な日付入力を重ねて、タップで iPhone の日付選択が開くようにしている。
 */
export function DayNav({ day, today, onGo }: { day: string; today: string; onGo: (d: string) => void }) {
  const { min } = dayBounds(today);
  const isToday = day === today;
  return (
    <nav className="day-nav-bar" aria-label="日付の移動">
      <button type="button" className="day-step" aria-label="前の日" onClick={() => onGo(addDays(day, -1))} disabled={day <= min}>
        ‹
      </button>
      <label className="date-pill">
        <span>
          {formatDayLong(day)}
          {!isToday && <span className="rel">・{relativeLabel(day, today)}</span>}
        </span>
        <span aria-hidden="true" className="caret">
          ▾
        </span>
        <input type="date" aria-label="日付を選ぶ" min={min} max={today} value={day} onChange={(e) => e.target.value && onGo(e.target.value)} />
      </label>
      <button type="button" className="day-step" aria-label="次の日" onClick={() => onGo(addDays(day, 1))} disabled={isToday}>
        ›
      </button>
      {!isToday && (
        <button type="button" className="today-btn" onClick={() => onGo(today)}>
          今日
        </button>
      )}
    </nav>
  );
}
