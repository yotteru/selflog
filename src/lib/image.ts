// 写真の切り抜き・縮小（§5.2, §6）
// - 送るのは切り抜いた部分だけ（人の顔や部屋の中を送らないため）。
// - canvas で描き直して JPEG にするので、EXIF（位置情報など）は残らない。

/** 切り抜く範囲（画像の幅・高さに対する割合 0〜1） */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_EDGE = 1280;

/** 出力するピクセルの範囲と大きさ（長辺 MAX_EDGE まで縮小） */
export function cropBox(naturalW: number, naturalH: number, r: CropRect) {
  const sx = Math.round(r.x * naturalW);
  const sy = Math.round(r.y * naturalH);
  const sw = Math.max(1, Math.round(r.w * naturalW));
  const sh = Math.max(1, Math.round(r.h * naturalH));
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  return { sx, sy, sw, sh, dw: Math.max(1, Math.round(sw * scale)), dh: Math.max(1, Math.round(sh * scale)) };
}

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img); // object URL は画面に出しているあいだ使うので、ここでは解放しない
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み込めませんでした'));
    };
    img.src = url;
  });
}

/** 切り抜いて縮小し、JPEG の base64（data: の前置きなし）と、確認用の data URL を返す */
export async function cropToJpeg(img: HTMLImageElement, r: CropRect): Promise<{ base64: string; dataUrl: string }> {
  const b = cropBox(img.naturalWidth, img.naturalHeight, r);
  const canvas = document.createElement('canvas');
  canvas.width = b.dw;
  canvas.height = b.dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像を処理できませんでした');
  ctx.drawImage(img, b.sx, b.sy, b.sw, b.sh, 0, 0, b.dw, b.dh);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  canvas.width = canvas.height = 0; // iOS のメモリを早めに返す
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), dataUrl };
}
