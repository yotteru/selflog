// Scriptable の API を最小限まねて、widget/zanryo.js の描画処理を Node で最後まで通す（見た目は確かめられない）。
// 使い方: node widget/test/scriptable-stub.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const log = [];
class Color { constructor(hex, a = 1) { this.hex = hex; this.a = a; } static white() { return new Color('#FFFFFF'); } static dynamic(l) { return l; } }
class Size { constructor(w, h) { this.width = w; this.height = h; } }
class Point { constructor(x, y) { this.x = x; this.y = y; } }
class Rect { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } }
class Path { addLines() {} addRoundedRect() {} move() {} addLine() {} }
const Font = new Proxy({}, { get: (_, name) => (size) => ({ name, size }) });
class DrawContext {
  setTextAlignedCenter() {} setTextColor() {} setFont() {} addPath() {} setStrokeColor() {} setLineWidth() {}
  strokePath() {} setFillColor() {} fillPath() {}
  drawTextInRect(t) { log.push(`  [img] ${t}`); }
  getImage() { return { image: true }; }
}
class WidgetText { constructor(t) { this.text = t; log.push(`  text: ${t}`); } centerAlignText() {} }
class WidgetImage { centerAlignImage() {} }
class WidgetStack {
  addText(t) { return new WidgetText(t); }
  addStack() { return new WidgetStack(); }
  addSpacer() {} addImage() { return new WidgetImage(); }
  layoutHorizontally() {} layoutVertically() {} centerAlignContent() {} bottomAlignContent() {} setPadding() {}
}
class ListWidget extends WidgetStack { presentSmall() {} }
class DateFormatter { string(d) { return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; } }
const store = new Map();
const Keychain = { contains: (k) => store.has(k), get: (k) => store.get(k), set: (k, v) => store.set(k, v), remove: (k) => store.delete(k) };
const fm = { joinPath: (a, b) => `${a}/${b}`, documentsDirectory: () => '/tmp', fileExists: () => false, readString: () => '', writeString: () => {} };
const FileManager = { local: () => fm };

const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const sample = (over) => ({
  day_key: today, updated_at: null, month_saving: over ? -1200 : 7270,
  items: [
    { key: 'kcal', name: 'カロリー', unit: 'kcal', kind: 'cap', goal: 2200, remaining: over ? -120 : 1340, state: over ? 'over' : 'ok' },
    { key: 'p', name: 'タンパク質', unit: 'g', kind: 'reach', goal: 160, remaining: over ? -5 : 72, state: over ? 'done' : 'ok' },
    { key: 'f', name: '脂質', unit: 'g', kind: 'cap', goal: 50, remaining: 18, state: 'ok' },
    { key: 'c', name: '炭水化物', unit: 'g', kind: 'cap', goal: 278, remaining: 120, state: 'ok' },
    { key: 'money', name: '使えるお金', unit: '円', kind: 'cap', goal: 1000, remaining: over ? -180 : 420, state: over ? 'over' : 'ok' },
  ],
});

let body = { current: sample(false) };
class Request { constructor(url) { this.url = url; } async loadJSON() { this.response = { statusCode: 200 }; return body.current; } }

const src = readFileSync(fileURLToPath(new URL('../zanryo.js', import.meta.url)), 'utf8')
  .replace(/^if \(config\.runsInWidget\)[\s\S]*$/m, 'export { buildWidget, load };');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

for (const over of [false, true]) {
  body.current = sample(over);
  for (const family of ['accessoryCircular', 'accessoryRectangular', 'accessoryInline', 'small', 'medium']) {
    for (const param of family === 'accessoryCircular' ? ['kcal', 'p', 'money'] : [null]) {
      store.set('zanryo.url', 'https://example/zanryo-widget-summary');
      store.set('zanryo.token', 'zr_x');
      const fn = new AsyncFunction(
        'Color', 'Size', 'Point', 'Rect', 'Path', 'Font', 'DrawContext', 'ListWidget', 'DateFormatter',
        'Keychain', 'FileManager', 'Request', 'args', 'config', 'Script',
        src.replace('export { buildWidget, load };', `return buildWidget(await load(), ${JSON.stringify(family)});`),
      );
      log.push(`${over ? '超過' : '通常'} ${family}${param ? ` (${param})` : ''}`);
      const w = await fn(Color, Size, Point, Rect, Path, Font, DrawContext, ListWidget, DateFormatter,
        Keychain, FileManager, Request, { widgetParameter: param }, { widgetFamily: family }, {});
      if (!w.refreshAfterDate) throw new Error('refreshAfterDate missing');
    }
  }
}
console.log(log.join('\n'));
