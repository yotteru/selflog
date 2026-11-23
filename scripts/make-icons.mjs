// アプリのアイコン（public/*.png）を SVG から作る。デザインを変えたときだけ実行する。
//   node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// playwright はこのリポジトリの依存に入れていないので、グローバルに入っているものを使う
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#1D4ED8"/>
  <circle cx="50" cy="50" r="27" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="9"/>
  <circle cx="50" cy="50" r="27" fill="none" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round"
    stroke-dasharray="${(2 * Math.PI * 27 * 0.62).toFixed(1)} 200" transform="rotate(-90 50 50)"/>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${svg(size)}</body>`);
  writeFileSync(`public/${name}`, await page.screenshot({ omitBackground: false }));
}
await browser.close();
console.log('ok');
