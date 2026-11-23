// ゲージ（v1）：どの型も満タンから減っていく「残量」の向き。
// 棒は目標の線（黒い縦線・幅の 80% の位置）までが満タン。上限型で超えた分は線の右にオレンジで伸びる。
import { COLORS, describe, fmt, kindTag, statusWord, type View } from '../lib/display';
import type { SummaryItem } from '../lib/types';

const GOAL_AT = 0.8;

export function MeterBar({ item, view }: { item: SummaryItem; view: View }) {
  const d = describe(item, view);
  return (
    <div className="meter-track" role="img" aria-label={`${item.name} ${d.gauge.pct || d.label}`}>
      <div className="meter-fill" style={{ width: `${d.gauge.fill * GOAL_AT * 100}%`, background: COLORS.accent }} />
      {d.gauge.over > 0 && <div className="meter-over" style={{ left: `${GOAL_AT * 100}%`, width: `${d.gauge.over * GOAL_AT * 100}%` }} />}
      <div className="meter-goal" style={{ left: `${GOAL_AT * 100}%` }} />
    </div>
  );
}

export function MeterRow({ item, view, extra }: { item: SummaryItem; view: View; extra?: string }) {
  const d = describe(item, view);
  const tone = d.over ? 'tone-over' : d.done && view === 'front' ? 'tone-accent' : 'tone-ink';
  const sub = [d.sub, extra].filter(Boolean).join(' · ');
  return (
    <div className="meter-row">
      <div className="meter-head">
        <div className="title-row">
          <span className="name">{item.name}</span>
          <span className="tag">{kindTag(item)}</span>
        </div>
        <div className={`meter-value ${tone}`}>
          <span className="label">{d.label}</span>
          {d.value && <span className="value">{d.value}</span>}
          <span className="pct">{d.gauge.pct}</span>
        </div>
      </div>
      <MeterBar item={item} view={view} />
      {sub && <span className="meter-sub">{sub}</span>}
    </div>
  );
}

const R = 58;
const CIRC = 2 * Math.PI * R;

/** カロリー（など先頭のターゲット）の円。残りの分の弧が減っていく。超えたら超えた分をオレンジで描く */
export function RingCard({ item, view }: { item: SummaryItem; view: View }) {
  const d = describe(item, view);
  const arc = d.over ? d.gauge.over * 4 : d.gauge.fill; // 超過は 25% で一周
  const value = view === 'front' ? fmt(item.remaining) : fmt(item.used);
  const bigPct = d.done ? '✓' : d.over ? d.gauge.pct : `${Math.round(d.gauge.fill * 100)}%`;
  return (
    <section className="card ring-card" aria-label={item.name}>
      <div className="ring">
        <svg width="136" height="136" viewBox="0 0 136 136" aria-hidden="true">
          <circle cx="68" cy="68" r={R} fill="none" stroke="#ECECE7" strokeWidth="12" />
          {arc > 0.002 && (
            <circle
              cx="68"
              cy="68"
              r={R}
              fill="none"
              stroke={d.over ? COLORS.over : COLORS.accent}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${(Math.min(arc, 1) * CIRC).toFixed(1)} ${CIRC.toFixed(1)}`}
              transform="rotate(-90 68 68)"
              style={{ transition: 'stroke-dasharray 0.25s ease' }}
            />
          )}
        </svg>
        <div className="ring-center">
          <span className="label">{d.label.replace(' ✓', '')}</span>
          <span className={`value ${d.over && view === 'front' ? 'tone-over' : ''}`}>{d.done && view === 'front' ? '✓' : value}</span>
          <span className="unit">{item.unit}</span>
        </div>
      </div>
      <div className="ring-side">
        <div className="title-row">
          <span className="name">{item.name}</span>
          <span className="tag">{kindTag(item)}</span>
        </div>
        <div className="ring-pct">
          <strong className={d.over ? 'tone-over' : 'tone-accent'}>{bigPct}</strong>
          <span>{d.done ? '達成' : d.over ? '超えた' : '残っている'}</span>
        </div>
        <span className="ring-meta">
          {fmt(item.used)} / {fmt(item.goal)} {item.unit}
        </span>
        {d.sub && <span className="ring-meta">{d.sub}</span>}
        <span className={`status-pill ${d.over ? 'over' : ''}`}>{statusWord(item)}</span>
      </div>
    </section>
  );
}
