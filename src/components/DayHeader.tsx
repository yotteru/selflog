import { addDays, formatDayLong } from '../lib/dayKey';
import { dayBounds, relativeLabel } from '../lib/days';

/**
 * 日付（タップで選べる大きなボタン）と前後の移動。ホームと記録一覧で使う。
 * 日付のボタンの上に透明な日付入力を重ねて、タップで iPhone の日付選択が開くようにしている。
 */
export function DayHeader({
  day,
  today,
  title,
  onGo,
  right,
}: {
  day: string;
  today: string;
  title: string;
  onGo: (d: string) => void;
  right?: React.ReactNode;
}) {
  const { min } = dayBounds(today);
  const isToday = day === today;
  return (
    <header className="day-header">
      <div className="day-header-left">
        <div className="day-line">
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
        </div>
        <h1 className={isToday ? '' : 'past'}>{title}</h1>
      </div>
      {right}
    </header>
  );
}
