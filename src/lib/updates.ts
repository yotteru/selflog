// 新しい版のアプリを受け取ったら、自動で読み込み直す。
// ホーム画面に追加したアプリは、一度読み込んだ画面を端末に保存して使うため、何もしないと古い版のまま動き続ける。
// - 開いたとき・アプリに戻ってきたとき・1時間ごとに新しい版を確かめる
// - 新しい版が来たら、その場で読み込み直す（送信待ちの記録は端末に残っているので消えない）
import { registerSW } from 'virtual:pwa-register';

export function startAutoUpdate() {
  if (!('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => void registration.update().catch(() => {});
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
}
