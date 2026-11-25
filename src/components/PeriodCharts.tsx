// 期間の画面のグラフ：棒・折れ線・カレンダー
import { diffDays } from '../lib/dayKey';
import { lineSeries, niceTicks } from '../lib/lineChart';
import { COLORS, fmt, isMoney } from '../lib/display';
import type { DayStatus, PeriodResult, PeriodTarget } from '../lib/period';

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

export const amount = (t: { key: string | null; unit: string }, n: number) => (isMoney(t) ? `¥${fmt(n)}` : `${fmt(n)}${t.unit}`);

const BAR_COLOR: Record<DayStatus, string> = {
  ok: COLORS.accent,
  ng: COLORS.over,
  missing: 'transparent',
  today: '#93B4FF',
  future: 'transparent',
};

const STATUS_WORD = (reach: boolean): Record<DayStatus, string> => ({
  ok: reach ? '達成' : '目標内',
  ng: reach ? '届かず' : '超過',
  missing: '未記録',
  today: '今日',
  future: '',
});

/** 日ごとの量の棒グラフ（点線は1日の目標）。タップでその日を開く */
export function BarChart({
  result,
  target,
  today,
  onOpenDay,
}: {
  result: PeriodResult;
  target: PeriodTarget;
  today: string;
  onOpenDay: (day: string) => void;
}) {
  const days = result.days;
  const max = Math.max(1, ...days.map((d) => d.used), ...days.map((d) => d.dailyGoal * 1.25));
  const many = days.length > 7;
  const goalAt = ((days.find((d) => d.dailyGoal)?.dailyGoal ?? 0) / max) * 100;
  // 休日の目標などで、日によって目標が違うときは、棒ごとに目標の印を出す
  const varies = new Set(days.map((d) => d.dailyGoal)).size > 1;
  const words = STATUS_WORD(target.kind === 'reach');
  return (
    <>
      <div className={`bars ${many ? 'many' : ''}`} style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} aria-label="日ごとの量">
        {!varies && (
          <div className="bars-goal" style={{ bottom: `${goalAt}%` }}>
            <span>1日の目標</span>
          </div>
        )}
        {days.map((d) => (
          <button
            key={d.day}
            type="button"
            className={`bar ${d.status}`}
            aria-label={`${d.day} ${d.status === 'missing' ? '未記録' : `${amount(target, d.used)} ${words[d.status]}`}`}
            disabled={d.status === 'future' || diffDays(today, d.day) > 30}
            onClick={() => onOpenDay(d.day)}
          >
            <span
              style={{
                height: d.status === 'missing' ? '30%' : d.status === 'future' ? '0%' : `${Math.max(2, (d.used / max) * 100)}%`,
                background: target.kind === 'reach' && d.status === 'ng' ? '#93B4FF' : BAR_COLOR[d.status],
              }}
            />
            {varies && <i className="bar-goal" style={{ bottom: `${(d.dailyGoal / max) * 100}%` }} aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div className="bar-labels" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d, i) => (
          <span key={d.day} className={d.off ? 'off' : undefined}>{d.day === today ? (many ? '●' : '今日') : many ? (Number(d.day.slice(8)) % 5 === 0 || i === 0 ? Number(d.day.slice(8)) : '') : WEEKDAYS[i]}</span>
        ))}
      </div>
    </>
  );
}

const W = 340;
const H = 190;
const PAD = { l: 46, r: 8, t: 18, b: 20 };

/** 縦軸の数字：大きい数は「1.5万」のように短く */
function tickLabel(v: number): string {
  if (v >= 10000) return `${Math.round((v / 10000) * 10) / 10}万`;
  return fmt(v);
}

/**
 * 積み上げの折れ線：期間の始まり（0）からの合計（青い線）が、期間の目標（横の点線）に対してどこまで来たか。
 * 薄い斜線は「期間の終わりにちょうど目標になるペース」。点は日ごとに1つ、その日の終わりの位置に置くので、
 * 点が斜線より上なら目安より多い・下なら少ない。今日の点は途中なので白抜き。上限型は目標を超えたらオレンジ。
 * 文言の主な比較は「昨日まで」（今日の途中は食事などでいったん目安を超えやすいため、下に小さく添える）。
 */
export function LineChart({ result, target, today }: { result: PeriodResult; target: PeriodTarget; today: string }) {
  const s = lineSeries(result, today);
  const maxY = Math.max(result.goal, ...s.points.map((p) => p.y), 1) * 1.04;
  const ticks = niceTicks(maxY);
  const top = ticks[ticks.length - 1] || 1;
  const px = (x: number) => PAD.l + ((W - PAD.l - PAD.r) * x) / s.n;
  const py = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / top);
  const path = s.points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
  const last = s.points[s.points.length - 1];
  const overGoal = target.kind === 'cap' && last.y > result.goal;
  const color = overGoal ? COLORS.over : COLORS.accent;
  const many = s.n > 7;
  const reach = target.kind === 'reach';
  // 比べ方：主は「昨日まで（終わった日）」。今日の途中は食事などでいったん目安を超えやすいので、下に小さく添える
  const tone = (v: number) => ((reach ? v > 0 : v < 0) ? 'tone-over' : 'tone-accent');
  const word = (v: number) => (reach ? (v > 0 ? '遅れ' : '先行') : v >= 0 ? '少ない' : '多い');
  const inProgress = s.todayX != null;
  const main =
    inProgress && s.diffDone != null
      ? { label: '昨日まで', v: s.diffDone }
      : { label: inProgress ? '今日の終わり' : '期間の終わり', v: s.diff };
  const sub = inProgress && s.diffDone != null ? { v: s.diff } : null;

  return (
    <figure className="line-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${target.name}の積み上げ ${amount(target, last.y)}（目標 ${amount(target, result.goal)}）`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={py(t)} y2={py(t)} className="lc-grid" />
            <text x={PAD.l - 6} y={py(t) + 3.5} textAnchor="end" className="lc-tick">
              {tickLabel(t)}
            </text>
          </g>
        ))}
        <text x={PAD.l - 6} y={PAD.t - 7} textAnchor="end" className="lc-unit">
          {isMoney(target) ? '円' : target.unit}
        </text>
        {/* 日の区切り（各日の終わり）に薄い縦線。点はこの線の上に乗る */}
        {result.days.map((d, i) => (
          <line key={`v${d.day}`} x1={px(i + 1)} x2={px(i + 1)} y1={PAD.t} y2={py(0)} className="lc-vgrid" />
        ))}
        {/* 横軸の文字は、その日の点（日の終わり）の真下 */}
        {result.days.map((d, i) =>
          !many || (i + 1) % 5 === 0 || i === 0 ? (
            <text key={d.day} x={px(i + 1)} y={H - 5} textAnchor="middle" className={`lc-tick ${d.off ? 'off' : ''}`}>
              {many ? Number(d.day.slice(8)) : WEEKDAYS[i]}
            </text>
          ) : null,
        )}
        <polyline points={[0, ...result.pace].map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')} fill="none" className="lc-pace" />
        <line x1={PAD.l} x2={W - PAD.r} y1={py(result.goal)} y2={py(result.goal)} className="lc-goal" />
        <text x={W - PAD.r} y={py(result.goal) - 5} textAnchor="end" className="lc-label">
          目標 {amount(target, result.goal)}
        </text>
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {s.points.slice(1).map((p, i) =>
          p.x === s.todayX ? (
            <circle key={i} cx={px(p.x)} cy={py(p.y)} r={many ? 3.5 : 4.5} fill="#fff" stroke={color} strokeWidth="2.5" />
          ) : (
            <circle key={i} cx={px(p.x)} cy={py(p.y)} r={many ? 2 : 3} fill={color} />
          ),
        )}
      </svg>
      <figcaption className="caption">
        <span className="lc-key">
          <i className="k-line" style={{ background: color }} />
          積み上げ {amount(target, last.y)}
        </span>
        <span className="lc-key">
          <i className="k-pace" />
          目安（終わりにちょうど目標）
        </span>
        {main && (
          <span className={`lc-diff ${tone(main.v)}`}>
            {main.label}の目安より {amount(target, Math.abs(main.v))} {word(main.v)}
          </span>
        )}
        {sub && (
          <span className="lc-sub">
            今日の分を入れると、今日の終わりの目安より {amount(target, Math.abs(sub.v))} {word(sub.v)}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** 月のカレンダー（○目標内・×超過・未記録）。タップでその日を開く */
export function Calendar({
  result,
  target,
  today,
  from,
  onOpenDay,
}: {
  result: PeriodResult;
  target: PeriodTarget;
  today: string;
  from: string;
  onOpenDay: (day: string) => void;
}) {
  const firstDow = (new Date(`${from}T00:00:00Z`).getUTCDay() + 6) % 7;
  const words = STATUS_WORD(target.kind === 'reach');
  return (
    <div className="calendar" aria-label="カレンダー">
      {WEEKDAYS.map((w) => (
        <span key={w} className="cal-dow">
          {w}
        </span>
      ))}
      {Array.from({ length: firstDow }, (_, i) => (
        <span key={`b${i}`} />
      ))}
      {result.days.map((d) => (
        <button
          key={d.day}
          type="button"
          className={`cal-cell ${d.status} ${target.kind === 'reach' ? 'reach' : ''}`}
          disabled={d.status === 'future' || diffDays(today, d.day) > 30}
          onClick={() => onOpenDay(d.day)}
          aria-label={`${d.day} ${words[d.status]}`}
        >
          <span className="d">{Number(d.day.slice(8))}</span>
          <span className="m">{{ ok: '○', ng: target.kind === 'reach' ? '△' : '×', missing: '未', today: '今日', future: '' }[d.status]}</span>
        </button>
      ))}
    </div>
  );
}
