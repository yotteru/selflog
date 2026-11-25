import { useLayoutEffect, useRef, useState } from 'react';
import { fitSize, type CropRect } from '../lib/image';

const MIN = 0.08;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Corner = 'nw' | 'ne' | 'sw' | 'se';
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

/** 枠の角を動かしたあとの範囲（反対の角は動かさない） */
export function resizeRect(s: CropRect, corner: Corner, dx: number, dy: number): CropRect {
  let { x, y } = s;
  let right = s.x + s.w;
  let bottom = s.y + s.h;
  if (corner === 'nw' || corner === 'sw') x = clamp(s.x + dx, 0, right - MIN);
  else right = clamp(right + dx, x + MIN, 1);
  if (corner === 'nw' || corner === 'ne') y = clamp(s.y + dy, 0, bottom - MIN);
  else bottom = clamp(bottom + dy, y + MIN, 1);
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * 送る範囲を決める枠。枠の中をドラッグで移動、四すみの丸で大きさを変える。
 * 枠の外は暗くして、送られないことが分かるようにする。
 * 写真を表示する台（stage）は写真とまったく同じ縦横比にして、画面の枠と送る範囲がずれないようにする。
 */
export function Cropper({
  src,
  naturalW,
  naturalH,
  rect,
  onChange,
}: {
  src: string;
  naturalW: number;
  naturalH: number;
  rect: CropRect;
  onChange: (r: CropRect) => void;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'move' | Corner; px: number; py: number; start: CropRect } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // 使える幅と高さ（画面の6割まで）に、写真の縦横比のまま収める
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const measure = () => setSize(fitSize(naturalW, naturalH, el.clientWidth, Math.round(window.innerHeight * 0.58)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [naturalW, naturalH]);

  function begin(kind: 'move' | Corner, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { kind, px: e.clientX, py: e.clientY, start: rect };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    const el = stage.current;
    if (!d || !el) return;
    const dx = (e.clientX - d.px) / el.clientWidth;
    const dy = (e.clientY - d.py) / el.clientHeight;
    const s = d.start;
    if (d.kind === 'move') onChange({ ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) });
    else onChange(resizeRect(s, d.kind, dx, dy));
  }
  const end = () => {
    drag.current = null;
  };

  return (
    <div className="cropper" ref={outer}>
      {size && (
        <div
          className="crop-stage"
          ref={stage}
          style={{ width: size.w, height: size.h }}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <img src={src} alt="撮影した写真" draggable={false} />
          <div
            className="crop-rect"
            style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
            onPointerDown={(e) => begin('move', e)}
            aria-label="送る範囲（ドラッグで移動）"
          >
            {CORNERS.map((c) => (
              <div key={c} className={`crop-handle ${c}`} onPointerDown={(e) => begin(c, e)} aria-label="範囲の大きさを変える" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
