import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 置き場所のサブパス（Cloudflare Pages なら '/' のまま）
const base = process.env.VITE_BASE ?? '/';

// 画面に出す版の番号（GitHub Actions では commit の先頭7文字）とビルドした時刻
const version = (process.env.GITHUB_SHA ?? 'dev').slice(0, 7);
const builtAt = new Date().toISOString();

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILT_AT__: JSON.stringify(builtAt),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 登録は src/main.tsx で行う（新しい版が届いたら自動で読み込み直すため）
      injectRegister: false,
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: '残量',
        short_name: '残量',
        description: '今日の残り（カロリー・PFC・お金）',
        lang: 'ja',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#F6F6F3',
        theme_color: '#F6F6F3',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 新しい版が届いたら待たずに切り替える（読み込み直しは src/lib/updates.ts）
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // アプリの画面だけをキャッシュする（Supabase への通信はキャッシュしない）
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
      },
    }),
  ],
});
