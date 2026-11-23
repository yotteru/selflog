// 左右のスワイプで前後に移動する（ホーム・記録一覧・期間）。
// 縦のスクロールとぶつからないよう、最初に動いた向きで「横」か「縦」かを決め、縦ならスワイプとして扱わない。
import { useRef } from 'react';

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

/**
 * スワイプで前後に移動する。指の動きは React の描き直しをせず、要素の transform を直接動かす（iPhone でカクつかないように）。
 * 使い方：<div ref={swipe.ref} {...swipe.handlers}>
 */
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
  const el = useRef<HTMLDivElement | null>(null);
  const start = useRef<{ x: number; y: number; id: number; axis: 'h' | 'v' | null } | null>(null);
  const swiped = useRef(false);
  const latest = useRef({ onPrev, onNext, canPrev, canNext });
  latest.current = { onPrev, onNext, canPrev, canNext };

  const move = (x: number, animate: boolean, opacity = '') => {
    const node = el.current;
    if (!node) return;
    node.style.transition = animate ? 'transform 0.16s ease, opacity 0.16s ease' : 'none';
    node.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
    node.style.opacity = opacity;
  };

  /** 画面を横にすべらせて切り替える（dir: -1 = 左へ＝次、1 = 右へ＝前） */
  const slide = (dir: -1 | 1, go: () => void) => {
    move(dir * 70, true, '0');
    window.setTimeout(() => {
      go();
      move(-dir * 70, false, '0');
      requestAnimationFrame(() => requestAnimationFrame(() => move(0, true, '')));
    }, 140);
  };

  const handlers = {
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
      const { canPrev: cp, canNext: cn } = latest.current;
      // 端（今日より先・これ以上前がない）では少しだけ動いて戻る
      const blocked = (dx < 0 && !cn) || (dx > 0 && !cp);
      move(dx * (blocked ? 0.12 : 0.5), false);
    },
    onPointerUp(e: React.PointerEvent) {
      const s = start.current;
      start.current = null;
      if (!s || e.pointerId !== s.id || s.axis !== 'h') return;
      const dx = e.clientX - s.x;
      const { onPrev: prev, onNext: next, canPrev: cp, canNext: cn } = latest.current;
      swiped.current = Math.abs(dx) > LOCK;
      const r = swipeResult(dx, cp, cn);
      if (r === 'next') slide(-1, next);
      else if (r === 'prev') slide(1, prev);
      else move(0, true);
    },
    onPointerCancel() {
      start.current = null;
      move(0, true);
    },
    // スワイプした指を離したときに、下にあるボタンが押されないようにする
    onClickCapture(e: React.MouseEvent) {
      if (swiped.current) {
        e.stopPropagation();
        e.preventDefault();
        swiped.current = false;
      }
    },
  };

  return { ref: el, handlers };
}
