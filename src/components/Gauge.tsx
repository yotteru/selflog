import { COLORS, type Tone } from '../lib/display';

const R = 70;
const CIRC = 2 * Math.PI * R;

/** カロリーの円形ゲージ（モックと同じ 164px・線幅14） */
export function Gauge({ frac, tone, children }: { frac: number; tone: Tone; children: React.ReactNode }) {
  return (
    <div className="gauge">
      <svg width="164" height="164" viewBox="0 0 164 164" aria-hidden="true">
        <circle cx="82" cy="82" r={R} fill="none" stroke="#ECECE7" strokeWidth="14" />
        {frac > 0.002 && (
          <circle
            cx="82"
            cy="82"
            r={R}
            fill="none"
            stroke={COLORS[tone]}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${(frac * CIRC).toFixed(1)} ${CIRC.toFixed(1)}`}
            transform="rotate(-90 82 82)"
            style={{ transition: 'stroke-dasharray 0.25s ease' }}
          />
        )}
      </svg>
      <div className="gauge-center">{children}</div>
    </div>
  );
}
