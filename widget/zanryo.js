// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: battery-half;

/**
 * 残量ウィジェット（Scriptable）
 * 仕様: docs/CLAUDE_CODE_INSTRUCTIONS.md §7
 *
 * 使い方
 * 1. このファイルの中身をScriptableの新しいスクリプトに貼り付け、名前を「zanryo」にする。
 * 2. Scriptableアプリでこのスクリプトを実行 →「URLとトークンを設定」。
 *    - URL:   https://<プロジェクト>.supabase.co/functions/v1/zanryo-widget-summary
 *    - トークン: PWAの設定画面で発行したもの（zr_ で始まる）
 *    どちらもKeychainに保存し、スクリプトには書かない。
 * 3. ロック画面／ホーム画面にScriptableのウィジェットを置き、Scriptに「zanryo」を選ぶ。
 *    円形ウィジェットは Parameter に表示する項目を書く: kcal / p / f / c / money（省略時 kcal）
 *    自分で追加したターゲットは名前を書く（例: スクリーンタイム）
 */

const KC_URL = 'zanryo.url';
const KC_TOKEN = 'zanryo.token';
const CACHE_FILE = 'zanryo-cache.json';
const REFRESH_MIN = 15;

// ホーム画面用（PWAと同じ配色）。ロック画面は iOS が単色で描くので白だけを使う
const COLOR = {
  accent: new Color('#1D4ED8'),
  over: new Color('#C2410C'),
  text: new Color('#111111'),
  sub: new Color('#5F5F5A'),
  bg: new Color('#FFFFFF'),
};

// ---------------------------------------------------------------------------
// データ
// ---------------------------------------------------------------------------

/** JST 4:00 区切りの日付（src/lib/dayKey.ts と同じ式） */
function dayKeyOf(date) {
  return new Date(date.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function cachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
}

function readCache() {
  try {
    const fm = FileManager.local();
    const p = cachePath();
    if (!fm.fileExists(p)) return null;
    return JSON.parse(fm.readString(p));
  } catch (e) {
    return null;
  }
}

function writeCache(data) {
  try {
    FileManager.local().writeString(cachePath(), JSON.stringify({ data, fetched_at: new Date().toISOString() }));
  } catch (e) {
    console.error(e);
  }
}

/** @returns {{ data: any, fetchedAt: Date, stale: boolean, error?: string } | { data: null, error: string }} */
async function load() {
  if (!Keychain.contains(KC_URL) || !Keychain.contains(KC_TOKEN)) {
    return { data: null, error: '未設定：Scriptableで実行して設定' };
  }
  try {
    const req = new Request(Keychain.get(KC_URL));
    req.method = 'GET';
    req.headers = { Authorization: `Bearer ${Keychain.get(KC_TOKEN)}` };
    req.timeoutInterval = 10;
    const body = await req.loadJSON();
    const status = req.response && req.response.statusCode;
    if (status !== 200) throw new Error(status === 401 ? 'トークンが無効です' : `HTTP ${status}`);
    writeCache(body);
    return { data: body, fetchedAt: new Date(), stale: false };
  } catch (e) {
    const cached = readCache();
    const message = (e && e.message) || String(e);
    if (cached) return { data: cached.data, fetchedAt: new Date(cached.fetched_at), stale: true, error: message };
    return { data: null, error: message };
  }
}

// ---------------------------------------------------------------------------
// 表示の文言（§3.4）
// ---------------------------------------------------------------------------

function num(n) {
  const v = Math.round(Math.abs(Number(n) || 0));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function isMoney(item) {
  return item.key === 'money' || item.unit === '円';
}

/** 値と単位。お金は ¥ を前に付ける */
function amount(item, n) {
  if (isMoney(item)) return `¥${num(n)}`;
  return `${num(n)}${item.unit || ''}`;
}

/** 表示する項目か（到達型で達成したものは外す） */
function visible(item) {
  return !(item.kind === 'reach' && item.state === 'done');
}

/** 状態の言葉：残り／超過／あと／達成 */
function stateWord(item) {
  if (item.kind === 'reach') return item.state === 'done' ? '達成' : 'あと';
  return item.state === 'over' ? '超過' : '残り';
}

/** 「残り 1,340kcal」「超過 ¥180」「あと 72g」「達成 ✓」 */
function statusText(item) {
  if (item.kind === 'reach' && item.state === 'done') return '達成 ✓';
  return `${stateWord(item)} ${amount(item, item.remaining)}`;
}

const SHORT_NAME = { kcal: 'kcal', p: 'P', f: 'F', c: 'C', money: 'お金' };
const LONG_NAME = { kcal: 'カロリー', p: 'タンパク質', f: '脂質', c: '炭水化物', money: '使えるお金' };

/** 項目を探す。kcal / p / f / c / money のほか、自分で追加したターゲットは名前で（例：スクリーンタイム） */
function find(data, key) {
  return (data.items || []).find((i) => i.key === key || i.name === key);
}

function timeLabel(date) {
  const df = new DateFormatter();
  df.dateFormat = 'H:mm';
  return df.string(date);
}

/** 失敗時・前日のデータのときの注記 */
function staleNote(res) {
  if (!res.data) return null;
  if (res.data.day_key !== dayKeyOf(new Date())) return `${timeLabel(res.fetchedAt)}時点（前日）`;
  if (res.stale) return `${timeLabel(res.fetchedAt)}時点`;
  return null;
}

/** 残りの割合（0〜1）。表は減る：リング・棒は残りの量を表す */
function remainingFrac(item) {
  const goal = Number(item.goal) || 0;
  return goal > 0 ? Math.max(0, Math.min(1, Number(item.remaining) / goal)) : 0;
}

// ---------------------------------------------------------------------------
// ロック画面：円形（モック Widgets の円形）
// 細いリング＋上に小さな見出し、中央に値。ロック画面は単色で描かれるので白だけで描く。
// ---------------------------------------------------------------------------

/** 円形の中の2行：[見出し, 値] */
function circularLines(item) {
  const name = SHORT_NAME[item.key] || item.name;
  if (item.kind === 'reach') {
    if (item.state === 'done') return [`${name} 達成`, '✓'];
    return [`${name} あと`, `${num(item.remaining)}${item.unit || ''}`];
  }
  if (isMoney(item)) return [stateWord(item), `¥${num(item.remaining)}`];
  if (item.key === 'kcal') return [item.state === 'over' ? 'kcal超過' : 'kcal', num(item.remaining)];
  // 自分で追加したターゲット（名前が長いことが多いので、見出しは状態だけ）
  if (!item.key) return [stateWord(item), `${num(item.remaining)}${item.unit || ''}`];
  return [`${name} ${stateWord(item)}`, `${num(item.remaining)}${item.unit || ''}`];
}

function ringImage(item, stale) {
  const S = 76; // ロック画面の円形ウィジェットのおおよその大きさ（pt）
  const ctx = new DrawContext();
  ctx.size = new Size(S, S);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const lw = 5;
  const r = S / 2 - lw / 2 - 4;
  const c = S / 2;

  const arc = (to, color) => {
    const steps = Math.max(2, Math.ceil(120 * to));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + 2 * Math.PI * (to * i) / steps;
      pts.push(new Point(c + r * Math.cos(a), c + r * Math.sin(a)));
    }
    const path = new Path();
    path.addLines(pts);
    ctx.addPath(path);
    ctx.setStrokeColor(color);
    ctx.setLineWidth(lw);
    ctx.strokePath();
  };
  arc(1, new Color('#FFFFFF', 0.25));
  const frac = remainingFrac(item);
  if (frac > 0.005) arc(frac, Color.white());

  const [label, value] = circularLines(item);
  ctx.setTextAlignedCenter();
  ctx.setTextColor(new Color('#FFFFFF', 0.85));
  ctx.setFont(Font.mediumSystemFont(10));
  ctx.drawTextInRect(stale ? `${label}*` : label, new Rect(8, 22, S - 16, 13));
  ctx.setTextColor(Color.white());
  ctx.setFont(Font.boldRoundedSystemFont(value.length <= 4 ? 17 : value.length <= 5 ? 15 : 13));
  ctx.drawTextInRect(value, new Rect(6, 35, S - 12, 21));
  return ctx.getImage();
}

function circularWidget(res) {
  const w = new ListWidget();
  w.addAccessoryWidgetBackground = true;
  w.setPadding(0, 0, 0, 0);
  const key = (args.widgetParameter || 'kcal').trim();
  const item = res.data && (find(res.data, key) || res.data.items[0]);
  if (!item) {
    const t = w.addText('—');
    t.font = Font.boldRoundedSystemFont(16);
    t.centerAlignText();
    return w;
  }
  const img = w.addImage(ringImage(item, !!staleNote(res)));
  img.imageSize = new Size(76, 76);
  img.centerAlignImage();
  return w;
}

// ---------------------------------------------------------------------------
// ロック画面：横長（モック Widgets の横長）
//   今日の残り                ← 小さな見出し（古い値のときは「12:30時点」）
//   1,340kcal · ¥420           ← 太字
//   P あと72g   F 残り18g   C 残り120g
// ---------------------------------------------------------------------------

function rectHeadline(item) {
  if (!item) return null;
  const v = amount(item, item.remaining);
  return item.state === 'over' ? `超過${v}` : v;
}

function rectangularWidget(res) {
  const w = new ListWidget();
  w.setPadding(0, 0, 0, 0);
  if (!res.data) {
    const a = w.addText('今日の残り');
    a.font = Font.mediumSystemFont(11);
    a.textOpacity = 0.8;
    const b = w.addText(res.error || '取得できません');
    b.font = Font.semiboldSystemFont(13);
    b.minimumScaleFactor = 0.6;
    return w;
  }
  const d = res.data;
  const note = staleNote(res);

  const cap = w.addText(note || '今日の残り');
  cap.font = Font.mediumSystemFont(11);
  cap.textOpacity = 0.8;
  cap.lineLimit = 1;

  const head = [rectHeadline(find(d, 'kcal')), rectHeadline(find(d, 'money'))].filter(Boolean).join(' · ');
  const main = w.addText(head);
  main.font = Font.boldRoundedSystemFont(18);
  main.lineLimit = 1;
  main.minimumScaleFactor = 0.6;

  const pfc = ['p', 'f', 'c'].map((k) => find(d, k)).filter((i) => i && visible(i));
  if (pfc.length) {
    w.addSpacer(1);
    const row = w.addStack();
    row.layoutHorizontally();
    pfc.forEach((i, idx) => {
      if (idx > 0) row.addSpacer();
      const t = row.addText(`${SHORT_NAME[i.key]} ${stateWord(i)}${amount(i, i.remaining)}`);
      t.font = Font.mediumSystemFont(12);
      t.lineLimit = 1;
      t.minimumScaleFactor = 0.6;
    });
    if (pfc.length < 3) row.addSpacer();
  }
  return w;
}

function inlineWidget(res) {
  const w = new ListWidget();
  if (!res.data) {
    w.addText('残量: 取得できません');
    return w;
  }
  const head = [rectHeadline(find(res.data, 'kcal')), rectHeadline(find(res.data, 'money'))].filter(Boolean);
  w.addText(`今日の残り ${head.join(' · ')}`);
  return w;
}

// ---------------------------------------------------------------------------
// ホーム画面（small / medium）。PWAと同じ配色：白地、アクセント青、超過はオレンジ
// ---------------------------------------------------------------------------

function addBar(stack, item, width) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, 4);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const track = new Path();
  track.addRoundedRect(new Rect(0, 0, width, 4), 2, 2);
  ctx.addPath(track);
  ctx.setFillColor(new Color('#ECECE7'));
  ctx.fillPath();
  const f = item.state === 'over' ? 1 : remainingFrac(item);
  if (f > 0.01) {
    const p = new Path();
    p.addRoundedRect(new Rect(0, 0, Math.max(4, width * f), 4), 2, 2);
    ctx.addPath(p);
    ctx.setFillColor(item.state === 'over' ? COLOR.over : COLOR.accent);
    ctx.fillPath();
  }
  const img = stack.addImage(ctx.getImage());
  img.imageSize = new Size(width, 4);
}

function addRow(parent, item, width) {
  const box = parent.addStack();
  box.layoutVertically();
  const row = box.addStack();
  row.centerAlignContent();
  const name = row.addText(item.key === 'kcal' ? 'カロリー' : SHORT_NAME[item.key] || item.name);
  name.font = Font.mediumSystemFont(11);
  name.textColor = COLOR.sub;
  row.addSpacer();
  const value = row.addText(statusText(item));
  value.font = Font.semiboldSystemFont(12);
  value.textColor = item.state === 'over' ? COLOR.over : COLOR.text;
  value.lineLimit = 1;
  value.minimumScaleFactor = 0.7;
  box.addSpacer(3);
  addBar(box, item, width);
}

function bigKcal(parent, item) {
  const cap = parent.addText(item.state === 'over' ? 'カロリー 超過' : 'カロリー 残り');
  cap.font = Font.mediumSystemFont(11);
  cap.textColor = item.state === 'over' ? COLOR.over : COLOR.sub;
  const row = parent.addStack();
  row.bottomAlignContent();
  const v = row.addText(num(item.remaining));
  v.font = Font.boldRoundedSystemFont(30);
  v.textColor = item.state === 'over' ? COLOR.over : COLOR.text;
  v.minimumScaleFactor = 0.6;
  v.lineLimit = 1;
  row.addSpacer(3);
  const u = row.addText('kcal');
  u.font = Font.mediumSystemFont(12);
  u.textColor = COLOR.sub;
}

function homeWidget(res, family) {
  const w = new ListWidget();
  w.backgroundColor = COLOR.bg;
  w.setPadding(14, 14, 12, 14);

  if (!res.data) {
    const t = w.addText('今日の残り');
    t.font = Font.semiboldSystemFont(12);
    t.textColor = COLOR.sub;
    w.addSpacer(6);
    const e = w.addText(res.error || '取得できません');
    e.font = Font.systemFont(12);
    e.textColor = COLOR.text;
    w.addSpacer();
    return w;
  }

  const d = res.data;
  const kcal = find(d, 'kcal');
  const rest = d.items.filter((i) => i.key !== 'kcal' && visible(i));
  const medium = family !== 'small';
  const note = staleNote(res);

  if (medium) {
    const cols = w.addStack();
    const left = cols.addStack();
    left.layoutVertically();
    left.size = new Size(120, 0);
    if (kcal) bigKcal(left, kcal);
    left.addSpacer();
    if (d.month_saving != null) {
      const s = Number(d.month_saving);
      const a = left.addText('今月の節約（見込み）');
      a.font = Font.mediumSystemFont(10);
      a.textColor = COLOR.sub;
      const b = left.addText(`${s < 0 ? '−' : ''}¥${num(s)}`);
      b.font = Font.boldRoundedSystemFont(15);
      b.textColor = s < 0 ? COLOR.over : COLOR.accent;
    }
    const n = left.addText(note || `${timeLabel(res.fetchedAt)} 更新`);
    n.font = Font.systemFont(9);
    n.textColor = COLOR.sub;
    cols.addSpacer(14);
    const right = cols.addStack();
    right.layoutVertically();
    rest.forEach((i, idx) => {
      if (idx > 0) right.addSpacer(6);
      addRow(right, i, 170);
    });
    right.addSpacer();
    return w;
  }

  if (kcal) bigKcal(w, kcal);
  w.addSpacer(6);
  rest.slice(0, 4).forEach((i, idx) => {
    if (idx > 0) w.addSpacer(4);
    addRow(w, i, 128);
  });
  w.addSpacer();
  if (note) {
    const n = w.addText(note);
    n.font = Font.systemFont(9);
    n.textColor = COLOR.sub;
  }
  return w;
}

function buildWidget(res, family) {
  let w;
  switch (family) {
    case 'accessoryCircular':
      w = circularWidget(res);
      break;
    case 'accessoryRectangular':
      w = rectangularWidget(res);
      break;
    case 'accessoryInline':
      w = inlineWidget(res);
      break;
    default:
      w = homeWidget(res, family);
  }
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MIN * 60 * 1000);
  // タップでPWAを開きたい場合は、ここに w.url = 'https://...' を設定する
  return w;
}

// ---------------------------------------------------------------------------
// アプリ内で実行したとき：設定とプレビュー
// ---------------------------------------------------------------------------

async function setup() {
  const a = new Alert();
  a.title = '残量ウィジェットの設定';
  a.message = 'URLは .../functions/v1/zanryo-widget-summary、トークンはPWAの設定画面で発行したもの。';
  a.addTextField('https://xxxx.supabase.co/functions/v1/zanryo-widget-summary', Keychain.contains(KC_URL) ? Keychain.get(KC_URL) : '');
  a.addSecureTextField('zr_...', '');
  a.addAction('保存');
  a.addCancelAction('キャンセル');
  if ((await a.presentAlert()) === -1) return;
  const url = a.textFieldValue(0).trim();
  const token = a.textFieldValue(1).trim();
  if (url) Keychain.set(KC_URL, url);
  if (token) Keychain.set(KC_TOKEN, token);
}

async function menu() {
  const a = new Alert();
  a.title = '残量ウィジェット';
  const actions = [
    ['URLとトークンを設定', async () => setup()],
    ['プレビュー：円形', async () => buildWidget(await load(), 'accessoryCircular').presentAccessoryCircular()],
    ['プレビュー：横長', async () => buildWidget(await load(), 'accessoryRectangular').presentAccessoryRectangular()],
    ['プレビュー：小', async () => buildWidget(await load(), 'small').presentSmall()],
    ['プレビュー：中', async () => buildWidget(await load(), 'medium').presentMedium()],
    [
      '取得結果を表示',
      async () => {
        const res = await load();
        const b = new Alert();
        b.title = res.error ? `エラー: ${res.error}` : 'OK';
        b.message = JSON.stringify(res.data, null, 1);
        b.addAction('閉じる');
        await b.present();
      },
    ],
    [
      'トークンを削除',
      async () => {
        if (Keychain.contains(KC_TOKEN)) Keychain.remove(KC_TOKEN);
      },
    ],
  ];
  for (const [label] of actions) a.addAction(label);
  a.addCancelAction('閉じる');
  const i = await a.presentSheet();
  if (i >= 0) await actions[i][1]();
}

if (config.runsInWidget) {
  Script.setWidget(buildWidget(await load(), config.widgetFamily));
} else if (config.runsInApp) {
  await menu();
} else {
  // ショートカットなどから実行したとき：取得してキャッシュを更新するだけ
  await load();
}
Script.complete();
