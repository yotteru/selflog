// 期間の画面のグラフ：棒・折れ線・カレンダー
import { diffDays } from '../lib/dayKey';
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
  const words = STATUS_WORD(target.kind === 'reach');
  return (
    <>
      <div className={`bars ${many ? 'many' : ''}`} style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} aria-label="日ごとの量">
        <div className="bars-goal" style={{ bottom: `${goalAt}%` }}>
          <span>1日の目標</span>
        </div>
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
          </button>
        ))}
      </div>
      <div className="bar-labels" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d, i) => (
          <span key={d.day}>{d.day === today ? (many ? '●' : '今日') : many ? (Number(d.day.slice(8)) % 5 === 0 || i === 0 ? Number(d.day.slice(8)) : '') : WEEKDAYS[i]}</span>
        ))}
      </div>
    </>
  );
}

const W = 320;
const H = 150;
const PAD = { l: 4, r: 4, t: 14, b: 4 };

/**
 * 積み上げの折れ線：1日目からの合計（青い線）が、期間の目標（横の点線）に対してどこまで来たか。
 * 薄い斜線は「期間の終わりにちょうど目標になるペース」。上限型は線を超えたらオレンジ。
 */
export function LineChart({ result, target, today }: { result: PeriodResult; target: PeriodTarget; today: string }) {
  const n = result.days.length;
  const max = Math.max(result.goal, result.total, 1) * 1.08;
  const x = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * (i + 0.5)) / n;
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
  const pts = result.cumulative.map((v, i) => (v == null ? null : ([x(i), y(v)] as const))).filter((p): p is readonly [number, number] => !!p);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const pace = `M${x(-0.5).toFixed(1)},${y(0).toFixed(1)} L${x(n - 0.5).toFixed(1)},${y(result.goal).toFixed(1)}`;
  const last = pts.at(-1);
  const overGoal = target.kind === 'cap' && result.total > result.goal;
  const color = overGoal ? COLORS.over : COLORS.accent;
  const todayIndex = result.days.findIndex((d) => d.day === today);
  // 今日の時点での目安（ペースの線の上の値）
  const paceNow = todayIndex >= 0 ? result.pace[todayIndex] : null;
  const ahead = paceNow == null ? null : paceNow - result.total; // 上限型：+なら目安より少ない

  return (
    <figure className="line-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${target.name}の積み上げ ${amount(target, result.total)}（目標 ${amount(target, result.goal)}）`}>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(result.goal)} y2={y(result.goal)} className="lc-goal" />
        <text x={W - PAD.r} y={y(result.goal) - 4} textAnchor="end" className="lc-label">
          目標 {amount(target, result.goal)}
        </text>
        <path d={pace} className="lc-pace" />
        {line && <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={n > 7 ? 1.8 : 3} fill={color} />
        ))}
        {last && todayIndex >= 0 && <circle cx={last[0]} cy={last[1]} r="5" fill="#fff" stroke={color} strokeWidth="2.5" />}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="lc-axis" />
      </svg>
      <figcaption className="caption">
        青い線：積み上げ · 点線：期間の目標 · 薄い斜線：期間の終わりにちょうど目標になるペース
        {ahead != null &&
          (target.kind === 'cap'
            ? ` · いまの目安より ${amount(target, Math.abs(ahead))} ${ahead >= 0 ? '少ない' : '多い'}`
            : ` · いまの目安より ${amount(target, Math.abs(ahead))} ${ahead > 0 ? '遅れ' : '先行'}`)}
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
