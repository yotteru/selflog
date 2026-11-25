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

/**
 * 送る画像の大きさの上限。レシートのような細長い紙でも小さな文字が読めるよう、長辺 2048px・合計 約250万画素まで。
 * （以前の長辺 1280px だと、細長いレシートは幅が 500px ほどになり、文字がつぶれて読めないことがあった）
 */
export const MAX_EDGE = 2048;
export const MAX_PIXELS = 2_500_000;
/** サーバーが受け取る上限（base64 の文字数）より少し小さく */
export const MAX_BASE64 = 2_300_000;

/** 出力するピクセルの範囲と大きさ（長辺 MAX_EDGE・合計 MAX_PIXELS まで縮小。拡大はしない） */
export function cropBox(naturalW: number, naturalH: number, r: CropRect, maxEdge = MAX_EDGE, maxPixels = MAX_PIXELS) {
  const sx = Math.round(r.x * naturalW);
  const sy = Math.round(r.y * naturalH);
  const sw = Math.max(1, Math.min(naturalW - sx, Math.round(r.w * naturalW)));
  const sh = Math.max(1, Math.min(naturalH - sy, Math.round(r.h * naturalH)));
  const scale = Math.min(1, maxEdge / Math.max(sw, sh), Math.sqrt(maxPixels / (sw * sh)));
  return { sx, sy, sw, sh, dw: Math.max(1, Math.round(sw * scale)), dh: Math.max(1, Math.round(sh * scale)) };
}

/** 写真を縦横比のまま、幅 maxW・高さ maxH の中に収めたときの大きさ */
export function fitSize(naturalW: number, naturalH: number, maxW: number, maxH: number) {
  const s = Math.min(maxW / naturalW, maxH / naturalH);
  return { w: Math.max(1, Math.floor(naturalW * s)), h: Math.max(1, Math.floor(naturalH * s)) };
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
  // 大きすぎて送れないときは、少しずつ小さくして作り直す
  for (const [edge, pixels, quality] of [
    [MAX_EDGE, MAX_PIXELS, 0.88],
    [MAX_EDGE, MAX_PIXELS, 0.75],
    [1600, 1_600_000, 0.75],
    [1280, 1_000_000, 0.7],
  ] as const) {
    const b = cropBox(img.naturalWidth, img.naturalHeight, r, edge, pixels);
    const canvas = document.createElement('canvas');
    canvas.width = b.dw;
    canvas.height = b.dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像を処理できませんでした');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, b.sx, b.sy, b.sw, b.sh, 0, 0, b.dw, b.dh);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    canvas.width = canvas.height = 0; // iOS のメモリを早めに返す
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (base64.length <= MAX_BASE64) return { base64, dataUrl };
  }
  throw new Error('写真が大きすぎて送れませんでした。範囲を小さくしてください');
}
