// 左右のスワイプで前後に移動する（ホーム・記録一覧・期間）。
// 縦のスクロールとぶつからないよう、最初に動いた向きで「横」か「縦」かを決め、縦ならスワイプとして扱わない。
import { useRef } from 'react';

const LOCK = 8; // これだけ動いたら向きを決める（px）
const TRIGGER = 70; // これだけ横に動いたら移動する（px）
const FLICK_SPEED = 0.35; // これより速く払ったら、短くても移動する（px/ms）
const FLICK_MIN = 24; // 払うときも、最低これだけは動かす（px）

/** 動いた量から向きを決める（決まらなければ null） */
export function swipeAxis(dx: number, dy: number): 'h' | 'v' | null {
  if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return null;
  return Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
}

/**
 * 指を離したときの動き：左へ（次）、右へ（前）、どちらでもない。
 * 長く動かすか、短くても素早く払えば移動する（velocity は離す直前の速さ px/ms、左がマイナス）。
 */
export function swipeResult(dx: number, canPrev: boolean, canNext: boolean, velocity = 0): 'prev' | 'next' | null {
  const flickLeft = dx <= -FLICK_MIN && velocity <= -FLICK_SPEED;
  const flickRight = dx >= FLICK_MIN && velocity >= FLICK_SPEED;
  if ((dx <= -TRIGGER || flickLeft) && canNext) return 'next';
  if ((dx >= TRIGGER || flickRight) && canPrev) return 'prev';
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
  const start = useRef<{ x: number; y: number; id: number; axis: 'h' | 'v' | null; lastX: number; lastT: number; v: number } | null>(null);
  const swiped = useRef(false);
  const latest = useRef({ onPrev, onNext, canPrev, canNext });
  latest.current = { onPrev, onNext, canPrev, canNext };

  const move = (x: number, ms: number, opacity = '') => {
    const node = el.current;
    if (!node) return;
    node.style.transition = ms ? `transform ${ms}ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity ${ms}ms ease` : 'none';
    node.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
    node.style.opacity = opacity;
  };

  /** 画面を横にすべらせて切り替える（dir: -1 = 左へ＝次、1 = 右へ＝前）。端まで出て、反対側から入ってくる */
  const slide = (dir: -1 | 1, go: () => void) => {
    const width = el.current?.offsetWidth ?? 360;
    move(dir * width, 170, '0.3');
    window.setTimeout(() => {
      go();
      move(-dir * width * 0.6, 0, '0.3');
      requestAnimationFrame(() => requestAnimationFrame(() => move(0, 220, '')));
    }, 170);
  };

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      swiped.current = false;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: null, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
    },
    onPointerMove(e: React.PointerEvent) {
      const s = start.current;
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x;
      if (!s.axis) s.axis = swipeAxis(dx, e.clientY - s.y);
      if (s.axis !== 'h') return;
      // 離す直前の速さ（払ったかどうかの判定に使う）
      const dt = e.timeStamp - s.lastT;
      if (dt > 0) s.v = 0.7 * ((e.clientX - s.lastX) / dt) + 0.3 * s.v;
      s.lastX = e.clientX;
      s.lastT = e.timeStamp;
      const { canPrev: cp, canNext: cn } = latest.current;
      // 指にそのままついてくる。端（今日より先・これ以上前がない）では少しだけ動いて戻る
      const blocked = (dx < 0 && !cn) || (dx > 0 && !cp);
      move(blocked ? dx * 0.15 : dx, 0);
    },
    onPointerUp(e: React.PointerEvent) {
      const s = start.current;
      start.current = null;
      if (!s || e.pointerId !== s.id || s.axis !== 'h') return;
      const dx = e.clientX - s.x;
      const { onPrev: prev, onNext: next, canPrev: cp, canNext: cn } = latest.current;
      swiped.current = Math.abs(dx) > LOCK;
      const r = swipeResult(dx, cp, cn, s.v);
      if (r === 'next') slide(-1, next);
      else if (r === 'prev') slide(1, prev);
      else move(0, 200);
    },
    onPointerCancel() {
      start.current = null;
      move(0, 200);
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
