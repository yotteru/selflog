import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * 下から出るシート。
 * - body に直接置く（スクロールする枠の中に置くと、iPhone で枠に切り取られて上下が見切れるため）
 * - キーボードが出たら、見えている範囲（visualViewport）に合わせて高さを縮める（保存ボタンがキーボードの下に隠れないように）
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const backdrop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const vv = window.visualViewport;
    const fit = () => {
      const el = backdrop.current;
      if (!el || !vv) return;
      el.style.top = `${vv.offsetTop}px`;
      el.style.height = `${vv.height}px`;
      el.style.bottom = 'auto';
    };
    fit();
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    return () => {
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
      document.body.style.overflow = prev;
      resetPageScroll();
    };
  }, []);

  return createPortal(
    <div className="sheet-backdrop" ref={backdrop} onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="link-btn" onClick={onClose}>
            閉じる
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** iPhone はキーボードを出すとページ全体を上にずらし、閉じても戻らないことがある。上端に戻す */
export function resetPageScroll() {
  if (window.scrollY !== 0 || document.documentElement.scrollTop !== 0) window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}
