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
 */

const KC_URL = 'zanryo.url';
const KC_TOKEN = 'zanryo.token';
const CACHE_FILE = 'zanryo-cache.json';
const REFRESH_MIN = 15;

const COLOR = {
  accent: new Color('#1D4ED8'),
  over: new Color('#C2410C'),
  text: Color.dynamic(new Color('#111827'), new Color('#F9FAFB')),
  sub: Color.dynamic(new Color('#6B7280'), new Color('#9CA3AF')),
  bg: Color.dynamic(new Color('#FFFFFF'), new Color('#111827')),
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

/** 値と単位。お金は ¥ を前に付ける */
function amount(item, n) {
  if (item.key === 'money' || item.unit === '円') return `¥${num(n)}`;
  return `${num(n)}${item.unit || ''}`;
}

/** 表示する項目か（到達型で達成したものは外す） */
function visible(item) {
  return !(item.kind === 'reach' && item.state === 'done');
}

/** 「残り 1,340kcal」「超過 120g」「あと 52g」「達成 ✓」 */
function statusText(item, { withUnit = true } = {}) {
  const v = withUnit ? amount(item, item.remaining) : num(item.remaining);
  if (item.kind === 'reach') return item.state === 'done' ? '達成 ✓' : `あと ${v}`;
  return item.state === 'over' ? `超過 ${v}` : `残り ${v}`;
}

/** 短い形（横長ウィジェット用）: 「1,340kcal」「超過120kcal」 */
function shortText(item) {
  if (item.kind === 'reach') return item.state === 'done' ? '達成' : `あと${amount(item, item.remaining)}`;
  return item.state === 'over' ? `超過${amount(item, item.remaining)}` : amount(item, item.remaining);
}

const SHORT_NAME = { kcal: 'kcal', p: 'P', f: 'F', c: 'C', money: 'お金' };

function find(data, key) {
  return (data.items || []).find((i) => i.key === key);
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

// ---------------------------------------------------------------------------
// 描画
// ---------------------------------------------------------------------------

/** 円形（accessoryCircular）: リングと中央の文字を1枚の画像に描く */
function ringImage(item, note) {
  const S = 120;
  const ctx = new DrawContext();
  ctx.size = new Size(S, S);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const lw = 10;
  const r = S / 2 - lw / 2 - 1;
  const c = S / 2;

  const goal = Number(item.goal) || 0;
  const remaining = Number(item.remaining) || 0;
  const frac = goal > 0 ? Math.max(0, Math.min(1, remaining / goal)) : 0;

  const arc = (from, to, color) => {
    const steps = Math.max(2, Math.ceil(90 * (to - from)));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + 2 * Math.PI * (from + ((to - from) * i) / steps);
      pts.push(new Point(c + r * Math.cos(a), c + r * Math.sin(a)));
    }
    const path = new Path();
    path.addLines(pts);
    ctx.addPath(path);
    ctx.setStrokeColor(color);
    ctx.setLineWidth(lw);
    ctx.strokePath();
  };

  arc(0, 1, new Color('#FFFFFF', 0.25));
  if (frac > 0) arc(0, frac, Color.white());

  const label = item.state === 'over' ? '超過' : item.kind === 'reach' ? (item.state === 'done' ? '達成' : 'あと') : '残り';
  const main = item.kind === 'reach' && item.state === 'done' ? '✓' : num(remaining);
  const unit = item.key === 'money' ? '¥' : SHORT_NAME[item.key] || item.name;

  ctx.setTextAlignedCenter();
  ctx.setTextColor(Color.white());
  ctx.setFont(Font.semiboldSystemFont(15));
  ctx.drawTextInRect(label, new Rect(0, 26, S, 18));
  ctx.setFont(Font.boldRoundedSystemFont(main.length > 4 ? 24 : 30));
  ctx.drawTextInRect(main, new Rect(4, 44, S - 8, 34));
  ctx.setFont(Font.mediumSystemFont(note ? 12 : 15));
  ctx.drawTextInRect(note ? '古い値' : unit, new Rect(0, 80, S, 18));
  return ctx.getImage();
}

function circularWidget(res) {
  const w = new ListWidget();
  w.addAccessoryWidgetBackground = true;
  const key = (args.widgetParameter || 'kcal').trim();
  const item = res.data && (find(res.data, key) || res.data.items[0]);
  if (!item) {
    const t = w.addText('—');
    t.centerAlignText();
    return w;
  }
  const img = w.addImage(ringImage(item, staleNote(res)));
  img.centerAlignImage();
  return w;
}

function rectangularWidget(res) {
  const w = new ListWidget();
  if (!res.data) {
    w.addText('残量').font = Font.boldSystemFont(13);
    const t = w.addText(res.error || '取得できません');
    t.font = Font.systemFont(11);
    return w;
  }
  const d = res.data;
  const kcal = find(d, 'kcal');
  const money = find(d, 'money');

  const head = [kcal, money].filter(Boolean).map(shortText).join(' · ');
  const t1 = w.addText(`今日の残り ${head}`);
  t1.font = Font.semiboldSystemFont(14);
  t1.minimumScaleFactor = 0.6;
  t1.lineLimit = 1;

  const pfc = ['p', 'f', 'c']
    .map((k) => find(d, k))
    .filter((i) => i && visible(i))
    .map((i) => `${SHORT_NAME[i.key]} ${shortText(i)}`)
    .join('  ');
  if (pfc) {
    const t2 = w.addText(pfc);
    t2.font = Font.systemFont(12);
    t2.minimumScaleFactor = 0.6;
    t2.lineLimit = 1;
  }

  const note = staleNote(res);
  if (note) {
    const t3 = w.addText(note);
    t3.font = Font.systemFont(10);
    t3.textOpacity = 0.7;
  }
  return w;
}

function inlineWidget(res) {
  const w = new ListWidget();
  if (!res.data) {
    w.addText('残量: 取得できません');
    return w;
  }
  const parts = ['kcal', 'money'].map((k) => find(res.data, k)).filter(Boolean).map(shortText);
  w.addText(`残り ${parts.join(' · ')}`);
  return w;
}

/** ホーム画面（small / medium / large）。中身は同じ */
function homeWidget(res) {
  const w = new ListWidget();
  w.backgroundColor = COLOR.bg;
  w.setPadding(12, 14, 12, 14);

  const title = w.addText('今日の残り');
  title.font = Font.semiboldSystemFont(12);
  title.textColor = COLOR.sub;
  w.addSpacer(4);

  if (!res.data) {
    const t = w.addText(res.error || '取得できません');
    t.font = Font.systemFont(12);
    t.textColor = COLOR.text;
    w.addSpacer();
    return w;
  }

  const big = config.widgetFamily !== 'small';
  for (const item of res.data.items.filter(visible)) {
    const row = w.addStack();
    row.centerAlignContent();
    const name = row.addText(item.key === 'kcal' ? 'カロリー' : SHORT_NAME[item.key] || item.name);
    name.font = Font.systemFont(big ? 13 : 12);
    name.textColor = COLOR.sub;
    name.lineLimit = 1;
    row.addSpacer();
    const value = row.addText(statusText(item));
    value.font = Font.semiboldRoundedSystemFont(big ? 15 : 13);
    value.textColor = item.state === 'over' ? COLOR.over : COLOR.text;
    value.lineLimit = 1;
    value.minimumScaleFactor = 0.7;
    w.addSpacer(2);
  }

  w.addSpacer();
  const footer = [];
  if (res.data.month_saving != null) {
    const s = Number(res.data.month_saving);
    footer.push(`今月の節約 ${s < 0 ? '−' : ''}¥${num(s)}（見込み）`);
  }
  const note = staleNote(res);
  footer.push(note || `${timeLabel(res.fetchedAt)} 更新`);
  const f = w.addText(footer.join(big ? '  ·  ' : '\n'));
  f.font = Font.systemFont(10);
  f.textColor = COLOR.sub;
  f.minimumScaleFactor = 0.7;
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
      w = homeWidget(res);
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
