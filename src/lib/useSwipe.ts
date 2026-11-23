// 左右のスワイプで前後に移動する（ホーム・記録一覧・期間）。
// 縦のスクロールとぶつからないよう、最初に動いた向きで「横」か「縦」かを決め、縦ならスワイプとして扱わない。
import { useRef, useState } from 'react';

const LOCK = 10; // これだけ動いたら向きを決める（px）
const TRIGGER = 60; // これだけ横に動いたら移動する（px）

/** 動いた量から向きを決める（決まらなければ null） */
export function swipeAxis(dx: number, dy: number): 'h' | 'v' | null {
  if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return null;
  return Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
}

/** 指を離したときの動き：左へ（次）、右へ（前）、どちらでもない */
export function swipeResult(dx: number, canPrev: boolean, canNext: boolean): 'prev' | 'next' | null {
  if (dx <= -TRIGGER && canNext) return 'next';
  if (dx >= TRIGGER && canPrev) return 'prev';
  return null;
}

export function useSwipe({
  onPrev,
  onNext,
  canPrev = true,
  canNext = true,
}: {
  onPrev: () => void;
  onNext: () => void;
  canPrev?: boolean;
  canNext?: boolean;
}) {
  const start = useRef<{ x: number; y: number; id: number; axis: 'h' | 'v' | null } | null>(null);
  const swiped = useRef(false);
  const [offset, setOffset] = useState(0);

  const reset = () => {
    start.current = null;
    setOffset(0);
  };

  return {
    style: {
      transform: offset ? `translateX(${offset}px)` : undefined,
      transition: offset ? 'none' : 'transform 0.2s ease',
      touchAction: 'pan-y' as const,
    },
    onPointerDown(e: React.PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      swiped.current = false;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: null };
    },
    onPointerMove(e: React.PointerEvent) {
      const s = start.current;
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x;
      if (!s.axis) s.axis = swipeAxis(dx, e.clientY - s.y);
      if (s.axis !== 'h') return;
      // 端（今日より先・これ以上前がない）では少しだけ動いて戻る
      const blocked = (dx < 0 && !canNext) || (dx > 0 && !canPrev);
      setOffset(dx * (blocked ? 0.1 : 0.35));
    },
    onPointerUp(e: React.PointerEvent) {
      const s = start.current;
      if (s && e.pointerId === s.id && s.axis === 'h') {
        const r = swipeResult(e.clientX - s.x, canPrev, canNext);
        swiped.current = Math.abs(e.clientX - s.x) > LOCK;
        if (r === 'next') onNext();
        if (r === 'prev') onPrev();
      }
      reset();
    },
    onPointerCancel: reset,
    // スワイプした指を離したときに、下にあるボタンが押されないようにする
    onClickCapture(e: React.MouseEvent) {
      if (swiped.current) {
        e.stopPropagation();
        e.preventDefault();
        swiped.current = false;
      }
    },
  };
}
