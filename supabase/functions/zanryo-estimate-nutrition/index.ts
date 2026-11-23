// POST /zanryo-estimate-nutrition   （ログインした利用者のみ）
// 残量アプリ（zanryo）: 写真から栄養値・金額の下書きを作る。仕様 §6（ステップ4）。
//
// 入力: { mode: 'photo' | 'label' | 'receipt', image: <JPEG の base64> }
// 出力: { ok: true, mode, draft } または { ok: false, reason, draft: null }
//   reason: not_member / bad_request / daily_limit / rate_limited / failed
//
// 無料枠だけで使う（§6）：
//   - キーは Cloud Billing を有効にしていないプロジェクトのもの（AI Studio で発行）。上限を超えてもエラーになるだけ。
//   - 429（レート上限）のときはリトライしない。
//   - 1日の呼び出し回数を DB（zanryo.try_consume_gemini_call）で数え、上限を超えたら Gemini を呼ばない。
//   - 画像は保存しない（このリクエストの中でだけ使い、終われば捨てる）。
//
// シークレット（Edge Functions → Secrets。shiori と分けるため ZANRYO_ で始める）:
//   ZANRYO_GEMINI_API_KEY      … 必須
//   ZANRYO_GEMINI_MODEL        … 省略時 gemini-flash-lite-latest
//   ZANRYO_GEMINI_DAILY_LIMIT  … 省略時 100（無料枠の1日の上限 500 より十分少なく）
//   ZANRYO_ALLOWED_ORIGINS     … 省略時 https://yotteru.github.io,http://localhost:5173
//
// ダッシュボードに貼り付けて使えるよう、1ファイルにまとめ、外部ライブラリを使っていない。
// 下の純粋な関数はテスト（supabase/tests/estimate.test.ts）から読み込む。

export type Mode = 'photo' | 'label' | 'receipt';

export interface PhotoDraft {
  name: string;
  kcal: number;
  p: number;
  f: number;
  c: number;
  confidence: 'low' | 'mid' | 'high';
}
export interface LabelDraft {
  basis: 'per100g' | 'per_unit';
  unit_label: string;
  unit_grams: number | null;
  kcal: number;
  p: number;
  f: number;
  c: number;
}
export interface ReceiptDraft {
  store: string;
  total: number;
  items: { name: string; price: number }[];
}

const NUM = { type: 'NUMBER' };
const STR = { type: 'STRING' };

export const SCHEMAS: Record<Mode, unknown> = {
  photo: {
    type: 'OBJECT',
    properties: { name: STR, kcal: NUM, p: NUM, f: NUM, c: NUM, confidence: { type: 'STRING', enum: ['low', 'mid', 'high'] } },
    required: ['name', 'kcal', 'p', 'f', 'c', 'confidence'],
  },
  label: {
    type: 'OBJECT',
    properties: {
      basis: { type: 'STRING', enum: ['per100g', 'per_unit'] },
      unit_label: STR,
      unit_grams: { type: 'NUMBER', nullable: true },
      kcal: NUM,
      p: NUM,
      f: NUM,
      c: NUM,
    },
    required: ['basis', 'unit_label', 'kcal', 'p', 'f', 'c'],
  },
  receipt: {
    type: 'OBJECT',
    properties: {
      store: STR,
      total: { type: 'INTEGER' },
      items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: STR, price: { type: 'INTEGER' } }, required: ['name', 'price'] } },
    },
    required: ['store', 'total', 'items'],
  },
};

export const PROMPTS: Record<Mode, string> = {
  photo:
    'この写真に写っている料理を1人前として、料理名（日本語・短く）と、エネルギー(kcal)・たんぱく質(p, g)・脂質(f, g)・炭水化物(c, g)を推定してください。' +
    '日本の一般的な分量を基準にします。料理が写っていない・判断できないときは name を空にし、数値は0、confidence を low にしてください。',
  label:
    'この写真は食品の栄養成分表示です。表示の基準が「100gあたり」なら basis=per100g、「1袋・1個・1食・1本あたり」など1つ分なら basis=per_unit にしてください。' +
    'unit_label には基準の言葉（例: 100g, 1袋, 1個, 1食）を、1つ分の重さ（g）が書かれていれば unit_grams に入れてください（無ければ null）。' +
    'kcal・p（たんぱく質g）・f（脂質g）・c（炭水化物g。無ければ糖質＋食物繊維）は表示の値をそのまま読み取ってください。読めない値は0にしてください。',
  receipt:
    'この写真は買い物のレシートです。店名（store）、支払った合計金額（total、税込の円、整数）、品目（items: 品名と税込の金額）を読み取ってください。' +
    '値引きは品目の金額に反映してください。カード番号・会員番号・電話番号・住所・氏名などの個人情報は、どの項目にも絶対に含めないでください。' +
    '読み取れないときは store を空、total を0、items を空にしてください。',
};

const num = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 10) / 10;
};
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Gemini の返事を確かめる。おかしければ null（画面では手入力に切り替える） */
export function validateDraft(mode: Mode, raw: unknown): PhotoDraft | LabelDraft | ReceiptDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (mode === 'photo') {
    const kcal = num(o.kcal, 0, 3000);
    const p = num(o.p, 0, 300);
    const f = num(o.f, 0, 300);
    const c = num(o.c, 0, 500);
    if (kcal == null || p == null || f == null || c == null) return null;
    const confidence = o.confidence === 'high' || o.confidence === 'mid' ? o.confidence : 'low';
    return { name: str(o.name, 40), kcal, p, f, c, confidence };
  }
  if (mode === 'label') {
    const basis = o.basis === 'per100g' || o.basis === 'per_unit' ? o.basis : null;
    const max = basis === 'per100g' ? 900 : 3000;
    const kcal = num(o.kcal, 0, max);
    const p = num(o.p, 0, 300);
    const f = num(o.f, 0, 300);
    const c = num(o.c, 0, 500);
    if (!basis || kcal == null || p == null || f == null || c == null) return null;
    const unit_grams = o.unit_grams == null ? null : num(o.unit_grams, 1, 5000);
    return { basis, unit_label: str(o.unit_label, 10) || (basis === 'per100g' ? '100g' : '1個'), unit_grams, kcal, p, f, c };
  }
  const total = num(o.total, 0, 1_000_000);
  if (total == null) return null;
  const items = Array.isArray(o.items)
    ? o.items
        .slice(0, 50)
        .map((it) => {
          const r = (it ?? {}) as Record<string, unknown>;
          return { name: str(r.name, 40), price: num(r.price, -100_000, 1_000_000) };
        })
        .filter((it): it is { name: string; price: number } => it.name !== '' && it.price != null)
    : [];
  return { store: str(o.store, 40), total: Math.round(total), items };
}

/** Gemini の generateContent の返事から JSON を取り出す */
export function extractJson(body: unknown): unknown {
  const text = (body as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function isMode(v: unknown): v is Mode {
  return v === 'photo' || v === 'label' || v === 'receipt';
}

// ---------------------------------------------------------------------------
// ここから下は Edge Function（Deno）で動くときだけ使う
// ---------------------------------------------------------------------------

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void } | undefined;

const MAX_IMAGE_CHARS = 2_500_000; // base64 で約1.8MB（長辺1280pxのJPEGなら十分）

async function handle(req: Request): Promise<Response> {
  const env = (k: string) => Deno!.env.get(k);
  const allowed = (env('ZANRYO_ALLOWED_ORIGINS') ?? 'https://yotteru.github.io,http://localhost:5173').split(',').map((s) => s.trim());
  const origin = req.headers.get('Origin') ?? '';
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  const fail = (status: number, reason: string) => json(status, { ok: false, reason, draft: null });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail(405, 'bad_request');

  const url = env('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') ?? '';
  const apikey = req.headers.get('apikey') ?? env('SUPABASE_ANON_KEY') ?? '';
  const rpc = (name: string, body: unknown, key: string, authorization: string) =>
    fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: authorization, 'Content-Type': 'application/json', 'Content-Profile': 'zanryo', 'Accept-Profile': 'zanryo' },
      body: JSON.stringify(body),
    });

  // 1) このアプリの利用者か（ログインしているだけでは足りない。shiori のユーザーは使えない）
  const member = await rpc('is_member', {}, apikey, auth);
  if (!member.ok || (await member.json()) !== true) return fail(403, 'not_member');

  // 2) 入力
  let mode: unknown, image: unknown;
  try {
    ({ mode, image } = await req.json());
  } catch {
    return fail(400, 'bad_request');
  }
  if (!isMode(mode) || typeof image !== 'string' || image.length < 100 || image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return fail(400, 'bad_request');
  }

  // 3) 1日の上限（超えていたら Gemini を呼ばない）
  const service = env('SUPABASE_SERVICE_ROLE_KEY')!;
  const limit = Number(env('ZANRYO_GEMINI_DAILY_LIMIT') ?? '100');
  const consumed = await rpc('try_consume_gemini_call', { p_daily_limit: limit }, service, `Bearer ${service}`);
  if (!consumed.ok) return fail(500, 'failed');
  if ((await consumed.json()) !== true) return fail(200, 'daily_limit');

  // 4) Gemini（リトライしない）
  const key = env('ZANRYO_GEMINI_API_KEY');
  if (!key) return fail(500, 'failed');
  const model = env('ZANRYO_GEMINI_MODEL') ?? 'gemini-flash-lite-latest';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: image } }, { text: PROMPTS[mode] }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMAS[mode], temperature: 0.2 },
      }),
    });
    if (res.status === 429) return fail(200, 'rate_limited');
    if (!res.ok) {
      console.error('gemini error', res.status); // 本文は記録しない（画像や読み取り内容を残さない）
      return fail(200, 'failed');
    }
    const draft = validateDraft(mode, extractJson(await res.json()));
    return draft ? json(200, { ok: true, mode, draft }) : fail(200, 'failed');
  } catch (e) {
    console.error('gemini request failed', (e as Error).name);
    return fail(200, 'failed');
  } finally {
    clearTimeout(timer);
  }
}

if (typeof Deno !== 'undefined') Deno.serve(handle);
