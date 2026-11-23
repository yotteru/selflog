import { useRef } from 'react';
import type { CropRect } from '../lib/image';

const MIN = 0.12;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 送る範囲を決める枠。枠の中をドラッグで移動、右下の丸で大きさを変える。
 * 枠の外は暗くして、送られないことが分かるようにする。
 */
export function Cropper({ src, rect, onChange }: { src: string; rect: CropRect; onChange: (r: CropRect) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'move' | 'resize'; px: number; py: number; start: CropRect } | null>(null);

  function begin(kind: 'move' | 'resize', e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { kind, px: e.clientX, py: e.clientY, start: rect };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    const el = box.current;
    if (!d || !el) return;
    const bw = el.clientWidth;
    const bh = el.clientHeight;
    const dx = (e.clientX - d.px) / bw;
    const dy = (e.clientY - d.py) / bh;
    const s = d.start;
    if (d.kind === 'move') {
      onChange({ ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) });
    } else {
      onChange({ ...s, w: clamp(s.w + dx, MIN, 1 - s.x), h: clamp(s.h + dy, MIN, 1 - s.y) });
    }
  }
  const end = () => {
    drag.current = null;
  };

  return (
    <div className="cropper" ref={box} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <img src={src} alt="撮影した写真" draggable={false} />
      <div
        className="crop-rect"
        style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
        onPointerDown={(e) => begin('move', e)}
        aria-label="送る範囲（ドラッグで移動）"
      >
        <div className="crop-handle" onPointerDown={(e) => begin('resize', e)} aria-label="範囲の大きさを変える" />
      </div>
    </div>
  );
}
