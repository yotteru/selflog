import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 置き場所のサブパス（Cloudflare Pages なら '/' のまま）
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
        // アプリの画面だけをキャッシュする（Supabase への通信はキャッシュしない）
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
      },
    }),
  ],
});
