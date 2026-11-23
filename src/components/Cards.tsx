import { describe, fmt, KIND_TAG, type View } from '../lib/display';
import type { SummaryItem } from '../lib/types';
import { Gauge } from './Gauge';

export function CalorieCard({ item, view }: { item: SummaryItem; view: View }) {
  const d = describe(item, view);
  const value = view === 'front' ? fmt(item.remaining) : fmt(item.used);
  return (
    <section className="card kcal" aria-label="カロリー">
      <Gauge frac={d.frac} tone={d.over ? 'over' : view === 'front' ? 'accent' : 'ink'}>
        <span className="label">{d.label}</span>
        <span className={`value ${d.over && view === 'front' ? 'tone-over' : ''}`}>{value}</span>
        <span className="unit">{item.unit}</span>
      </Gauge>
      <div className="kcal-side">
        <div className="title-row">
          <span className="name">{item.name}</span>
          <span className="tag">{KIND_TAG[item.kind]}</span>
        </div>
        <span>
          目標 {fmt(item.goal)} {item.unit}
        </span>
        <span>
          摂取 {fmt(item.used)} {item.unit}
        </span>
      </div>
    </section>
  );
}

export function Bar({ item, view, big = false }: { item: SummaryItem; view: View; big?: boolean }) {
  const d = describe(item, view);
  const textTone = d.over ? 'tone-over' : view === 'front' && d.done ? 'tone-accent' : 'tone-ink';
  return (
    <div className="bar-row">
      <div className="bar-head">
        <div className="title-row">
          <span className="name">{item.name}</span>
          <span className="tag">{KIND_TAG[item.kind]}</span>
        </div>
        <div className={`bar-value ${big ? 'big' : ''} ${textTone}`}>
          {view === 'front' && d.done && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12l5 5L20 7" />
            </svg>
          )}
          <span className="label">{d.label}</span>
          {d.value && <span className="value">{d.value}</span>}
        </div>
      </div>
      <div className="track">
        <div className={`fill bg-${d.tone}`} style={{ width: `${(d.frac * 100).toFixed(1)}%` }} />
      </div>
    </div>
  );
}

export function MacroCard({ items, view }: { items: SummaryItem[]; view: View }) {
  if (!items.length) return null;
  return (
    <section className="card bars" aria-label="PFC">
      {items.map((i) => (
        <Bar key={i.target_id} item={i} view={view} />
      ))}
    </section>
  );
}

export function MoneyCard({ item, view, saving }: { item: SummaryItem; view: View; saving: number | null }) {
  return (
    <section className="card bars" aria-label="使えるお金">
      <Bar item={item} view={view} big />
      {view === 'back' && saving != null && (
        <div className="saving">
          <span>今月の節約（見込み）</span>
          <strong className={saving < 0 ? 'minus' : ''}>
            {saving < 0 ? '−' : ''}¥{fmt(saving)}
          </strong>
        </div>
      )}
    </section>
  );
}
