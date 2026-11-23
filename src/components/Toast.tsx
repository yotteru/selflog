import { useEffect, useRef } from 'react';

export interface ToastState {
  message: string;
  onUndo?: () => void;
  key: number;
}

/** 数秒で消えるトースト。「取り消す」を押せる（§5.1） */
export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const t = setTimeout(() => close.current(), 5000);
    return () => clearTimeout(t);
  }, [toast.key]);
  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.onUndo && (
        <button
          type="button"
          onClick={() => {
            toast.onUndo?.();
            onClose();
          }}
        >
          取り消す
        </button>
      )}
    </div>
  );
}
