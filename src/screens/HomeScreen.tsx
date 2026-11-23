import { useEffect, useState } from 'react';
import { formatDayLabel } from '../lib/dayKey';
import { dayTitle } from '../lib/days';
import { fmt, presetSub, type View } from '../lib/display';
import type { Preset, SummaryItem } from '../lib/types';
import { DayHeader } from '../components/DayHeader';
import { MeterRow, RingCard } from '../components/Gauges';

/** 画面の高さに応じた、ホームに並べるプリセットの数 */
function usePresetRoom(): number {
  const query = '(min-height: 760px)';
  const [tall, setTall] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setTall(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return tall ? 6 : 3;
}

/**
 * ホーム（v1・スクロールしない）
 * 上：日付・表示の切り替え・お知らせ → 円（カロリー）→ 棒（ほかのターゲット）→ 下：プリセット3つ（親指の届く位置）
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
  view,
  onView,
  presets,
  monthSaving,
  banner,
  onBanner,
  canConfirmEmpty,
  confirmedEmpty,
  busy,
  onConfirmEmpty,
  onPick,
  onMorePresets,
}: {
  day: string;
  today: string;
  isToday: boolean;
  items: SummaryItem[];
  loading: boolean;
  loadError: string;
  unsent: number;
  onGo: (d: string) => void;
  view: View;
  onView: (v: View) => void;
  presets: Preset[];
  monthSaving: number | null;
  banner: string | null;
  onBanner: () => void;
  canConfirmEmpty: boolean;
  confirmedEmpty: boolean;
  busy: boolean;
  onConfirmEmpty: (confirmed: boolean) => void;
  onPick: (p: Preset) => void;
  onMorePresets: () => void;
}) {
  const room = usePresetRoom();
  const ringItem = items.find((i) => i.key === 'kcal') ?? items[0];
  // 画面に余裕があれば2段（6つ）、なければ1段（3つ）。入りきらないときは最後を「すべて」にする
  const shown = presets.length > room ? presets.slice(0, room - 1) : presets.slice(0, room);
  const meters = items.filter((i) => i !== ringItem);

  return (
    <div className="home">
      {banner && (
        <button type="button" className="banner banner-button compact" onClick={onBanner}>
          <span>{banner}</span>
          <span aria-hidden="true">›</span>
        </button>
      )}

      <DayHeader
        day={day}
        today={today}
        title={dayTitle(day, today, view)}
        onGo={onGo}
        right={
          <div className="seg" role="group" aria-label="表示の切り替え">
            <button type="button" aria-pressed={view === 'front'} onClick={() => onView('front')}>
              残り
            </button>
            <button type="button" aria-pressed={view === 'back'} onClick={() => onView('back')}>
              積み上げ
            </button>
          </div>
        }
      />

      {!isToday && (
        <div className="past-note compact">
          <span>ここで記録すると{formatDayLabel(day)}に入ります</span>
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
          {ringItem && <RingCard item={ringItem} view={view} />}
          {meters.length > 0 && (
            <section className="card meters" aria-label="ターゲット">
              {meters.map((m) => (
                <MeterRow
                  key={m.target_id}
                  item={m}
                  view={view}
                  extra={view === 'back' && m.key === 'money' && monthSaving != null ? `今月の節約（見込み）${monthSaving < 0 ? '−' : ''}¥${fmt(monthSaving)}` : undefined}
                />
              ))}
            </section>
          )}

          <div className="home-presets" aria-label="プリセット">
            {shown.map((p) => (
              <button key={p.id} type="button" className="preset" onClick={() => onPick(p)}>
                <span className="label">＋ {p.label}</span>
                <span className="sub">{presetSub(p.amounts, items)}</span>
              </button>
            ))}
            {presets.length === 0 && (
              <button type="button" className="preset empty" onClick={onMorePresets}>
                プリセットはまだありません（＋記録から作れます）
              </button>
            )}
            {presets.length > room && (
              <button type="button" className="preset more" onClick={onMorePresets}>
                すべて（{presets.length}）
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
