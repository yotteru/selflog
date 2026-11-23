import { useEffect, useMemo, useState } from 'react';
import { fetchRange } from '../lib/api';
import { addDays } from '../lib/dayKey';
import { monthRange, rangeLabel, weekRange } from '../lib/days';
import { COLORS, gauge, isMoney, PERIOD_WORD } from '../lib/display';
import { buildPeriod, periodTargets, type PeriodView } from '../lib/period';
import type { RangeRow } from '../lib/types';
import { useSwipe } from '../lib/useSwipe';
import { amount, BarChart, Calendar, LineChart } from '../components/PeriodCharts';

type Chart = 'bar' | 'line' | 'calendar';
const CHART_LABEL: Record<Chart, string> = { bar: '棒', line: '折れ線', calendar: 'カレンダー' };
const CHARTS: Record<PeriodView, Chart[]> = { week: ['bar', 'line'], month: ['calendar', 'bar', 'line'] };
const CHART_KEY = 'zanryo.periodChart.v1';

/** 週・月ごとに、最後に選んだグラフの種類（この端末に保存） */
function loadChart(view: PeriodView): Chart {
  try {
    const v = (JSON.parse(localStorage.getItem(CHART_KEY) || '{}') as Record<string, Chart>)[view];
    if (v && CHARTS[view].includes(v)) return v;
  } catch {
    /* noop */
  }
  return CHARTS[view][0];
}
function saveChart(view: PeriodView, chart: Chart) {
  try {
    const all = JSON.parse(localStorage.getItem(CHART_KEY) || '{}') as Record<string, Chart>;
    localStorage.setItem(CHART_KEY, JSON.stringify({ ...all, [view]: chart }));
  } catch {
    /* noop */
  }
}

const GOAL_AT = 0.8;

/** 期間（v1）：週・月で、合計と目標・日ごとの棒やカレンダー・目標内／超過／未記録の日数を見る */
export function PeriodScreen({ today, onOpenDay }: { today: string; onOpenDay: (day: string) => void }) {
  const [view, setView] = useState<PeriodView>('week');
  const [chart, setChartState] = useState<Chart>(() => loadChart('week'));
  const changeView = (v: PeriodView) => {
    setView(v);
    setChartState(loadChart(v));
  };
  const setChart = (c: Chart) => {
    setChartState(c);
    saveChart(view, c);
  };
  const [anchor, setAnchor] = useState(today);
  // 読み込んだデータは、どの期間のものかと一緒に持つ（切り替えた直後に前の期間のデータで描かないため）
  const [loaded, setLoaded] = useState<{ key: string; rows: RangeRow[] } | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const range = view === 'week' ? weekRange(anchor) : monthRange(anchor);

  const rangeKey = `${range.from}/${range.to}`;
  const rows = loaded && loaded.key === rangeKey ? loaded.rows : null;

  useEffect(() => {
    let alive = true;
    setError('');
    fetchRange(range.from, range.to)
      .then((r) => alive && setLoaded({ key: `${range.from}/${range.to}`, rows: r }))
      .catch((e: Error) => {
        if (!alive) return;
        if (/range_summary/.test(e.message)) setError('DB の準備ができていません（supabase/sql/05_periods.sql を流してください）');
        else setError(navigator.onLine ? e.message : 'オフラインのため表示できません');
      });
    return () => {
      alive = false;
    };
  }, [range.from, range.to]);

  const targets = useMemo(() => (rows ? periodTargets(rows) : []), [rows]);
  const target = targets.find((t) => t.target_id === selected) ?? targets.find((t) => t.key === 'kcal') ?? targets[0];
  const result = useMemo(
    () => (rows && target ? buildPeriod(rows, target.target_id, view, range.from, range.to, today) : null),
    [rows, target, view, range.from, range.to, today],
  );

  const isCurrent = range.to >= today;
  // 左右のスワイプで前後の週・月へ（今より先には進まない）
  const swipe = useSwipe({
    onPrev: () => setAnchor(addDays(range.from, -1)),
    onNext: () => setAnchor(addDays(range.to, 1)),
    canNext: !isCurrent,
  });
  const g = result && target ? gauge({ kind: target.kind, goal: result.goal, used: result.total }) : null;
  const done = !!g && target?.kind === 'reach' && g.pct === '';
  const over = !!g && g.over > 0;


  return (
    <div className="period-screen swipe-area" ref={swipe.ref} {...swipe.handlers}>
      <header className="day-header">
        <h1>期間</h1>
        <div className="seg" role="group" aria-label="期間の単位">
          <button type="button" aria-pressed={view === 'week'} onClick={() => changeView('week')}>
            週
          </button>
          <button type="button" aria-pressed={view === 'month'} onClick={() => changeView('month')}>
            月
          </button>
        </div>
      </header>

      <div className="range-nav">
        <button type="button" className="icon-btn" aria-label={view === 'week' ? '前の週' : '前の月'} onClick={() => setAnchor(addDays(range.from, -1))}>
          ‹
        </button>
        <span>
          {rangeLabel(view, range.from, range.to)}
          {isCurrent && (view === 'week' ? ' · 今週' : ' · 今月')}
        </span>
        <button type="button" className="icon-btn" aria-label={view === 'week' ? '次の週' : '次の月'} onClick={() => setAnchor(addDays(range.to, 1))} disabled={isCurrent}>
          ›
        </button>
      </div>

      {targets.length > 0 && (
        <div className="chips" role="group" aria-label="ターゲット">
          {targets.map((t) => (
            <button key={t.target_id} type="button" className="chip" aria-pressed={t.target_id === target?.target_id} onClick={() => setSelected(t.target_id)}>
              {t.key === 'kcal' ? 'kcal' : t.key === 'money' ? 'お金' : t.key ? t.key.toUpperCase() : t.name}
            </button>
          ))}
        </div>
      )}

      {error && <div className="banner compact">{error}</div>}
      {!rows && !error && <div className="notice">読み込み中…</div>}
      {rows && !target && <div className="notice">この期間のデータはありません</div>}

      {result && target && g && (
        <section className="card period-card" aria-label={`${target.name}の${view === 'week' ? '週' : '月'}のまとめ`}>
          <div className="period-head">
            <div>
              <span className="caption">
                {target.name}：{isCurrent ? (view === 'week' ? '今週' : '今月') : 'この期間'}
                {target.kind === 'reach' ? 'の合計（到達）' : isMoney(target) ? '使った額' : 'の合計'}
                {result.goalBasis === 'period' ? `（目標は${PERIOD_WORD[target.period].label}）` : `（${result.dayCount}日分の目標と比べる）`}
              </span>
              <strong className="period-total">
                {amount(target, result.total)} <small>/ {amount(target, result.goal)}</small>
              </strong>
            </div>
            <strong className={`period-pct ${over ? 'tone-over' : 'tone-accent'}`}>{done ? '達成 ✓' : g.pct}</strong>
          </div>
          <div className="meter-track" role="img" aria-label={done ? '達成' : g.pct}>
            <div className="meter-fill" style={{ width: `${g.fill * GOAL_AT * 100}%`, background: COLORS.accent }} />
            {g.over > 0 && <div className="meter-over" style={{ left: `${GOAL_AT * 100}%`, width: `${g.over * GOAL_AT * 100}%` }} />}
            <div className="meter-goal" style={{ left: `${GOAL_AT * 100}%` }} />
          </div>
          <span className="caption">
            1日平均 {amount(target, result.average)}（{result.elapsedDays}日）
            {target.period !== 'day' && ` · 1日あたりの目標 ${amount(target, result.days.find((d) => d.dailyGoal)?.dailyGoal ?? 0)}`}
          </span>

          <div className="chart-switch seg small" role="group" aria-label="グラフの種類">
            {CHARTS[view].map((c) => (
              <button key={c} type="button" aria-pressed={chart === c} onClick={() => setChart(c)}>
                {CHART_LABEL[c]}
              </button>
            ))}
          </div>
          {chart === 'line' ? (
            <LineChart result={result} target={target} today={today} />
          ) : chart === 'calendar' && view === 'month' ? (
            <Calendar result={result} target={target} today={today} from={range.from} onOpenDay={onOpenDay} />
          ) : (
            <BarChart result={result} target={target} today={today} onOpenDay={onOpenDay} />
          )}

          <div className="count-row">
            <div className="count ok">
              <span>{target.kind === 'reach' ? '達成した日' : '目標内の日'}</span>
              <strong>
                {result.counts.ok}
                <small> 日</small>
              </strong>
            </div>
            <div className="count ng">
              <span>{target.kind === 'reach' ? '届かなかった日' : '超過した日'}</span>
              <strong>
                {result.counts.ng}
                <small> 日</small>
              </strong>
            </div>
            <div className="count missing">
              <span>未記録</span>
              <strong>
                {result.counts.missing}
                <small> 日</small>
              </strong>
            </div>
          </div>
        </section>
      )}
      {result && chart !== 'line' && (
        <p className="hint">
          {chart === 'calendar'
            ? '○＝目標内（到達型は達成）· ×＝超過 · 点線＝未記録。タップでその日を開く（直近31日）'
            : '棒：青＝目標内（到達型は達成）· オレンジ＝超過 · 点線＝未記録 · 薄い青＝今日（途中）。タップでその日を開く'}
        </p>
      )}
    </div>
  );
}
