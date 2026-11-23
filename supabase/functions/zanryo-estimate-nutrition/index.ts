// POST /zanryo-estimate-nutrition   （ログインした利用者のみ）
// 残量アプリ（zanryo）: 写真から栄養値・金額の下書きを作る。仕様 §6（ステップ4）。
//
// 入力: { mode: 'photo' | 'label' | 'receipt', image: <JPEG の base64> }
//    または { mode: 'name', query: '吉野家 牛丼 並盛' }（名前で調べる。Google 検索つき）
// 出力: { ok: true, mode, draft, sources? } または { ok: false, reason, draft: null }
//   reason: not_member / bad_request / daily_limit / rate_limited / failed
//   detail: 失敗したときの手がかり（例: gemini_404, usage_check_401, no_api_key）。秘密の値や読み取り内容は入れない
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
//   ZANRYO_GEMINI_SEARCH       … 省略時 on。off にすると「名前で調べる」で Google 検索を使わない
//   ZANRYO_GEMINI_LOOKUP_MODEL … 「名前で調べる」の検索つきの呼び出しに使うモデル。省略時 gemini-2.5-flash
//                                （gemini-2.5-flash-lite は新しいプロジェクトでは使えない：no longer available to new users）
//                                （無料枠の検索は Gemini 2 / 2.5 だけ 1日1,500回。Gemini 3 以降は0回。2026-11-23 に AI Studio で確認）
//
// 名前で調べる：まず Google 検索つきで呼ぶ。検索が使えない（無料枠の対象外など）と断られたら、
// 検索なし（Gemini の知識だけ）で1回だけ呼び直す。429（レート上限）は呼び直さない。
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
// 名前で調べる（例：「吉野家 牛丼 並盛」）
// ---------------------------------------------------------------------------

export interface LookupDraft {
  name: string;
  serving: string;
  kcal: number;
  p: number;
  f: number;
  c: number;
  price: number | null;
  confidence: 'low' | 'mid' | 'high';
}
export interface Source {
  title: string;
  uri: string;
}

/** 調べる言葉を整える。改行・制御文字を消し、60文字まで。空なら null */
export function normalizeQuery(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const q = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return q.length >= 1 ? q : null;
}

export const LOOKUP_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: STR,
    serving: STR,
    kcal: NUM,
    p: NUM,
    f: NUM,
    c: NUM,
    price: { type: 'INTEGER', nullable: true },
    confidence: { type: 'STRING', enum: ['low', 'mid', 'high'] },
  },
  required: ['name', 'serving', 'kcal', 'p', 'f', 'c', 'confidence'],
};

export function lookupPrompt(query: string, withSearch: boolean): string {
  return (
    `次の食べ物・飲み物の、1人前の栄養成分を${withSearch ? '調べて' : '答えて'}ください：「${query}」\n` +
    (withSearch ? '・知っている値でも、必ず Google 検索で公式の情報を確かめてから答える。\n' : '') +
    '・チェーン店や市販品なら、その会社の公式の栄養成分表の値を優先する。サイズの指定が無ければ標準（並・Mなど）にする。\n' +
    '・name は記録に使う短い名前。店名やブランドがあれば先頭に付け、サイズがあれば最後に付ける（例: 吉野家 牛丼 並盛、セブンイレブン ツナマヨおにぎり）。' +
    '質問の言葉や「カロリー」「教えて」などの余計な言葉は入れない。20文字くらいまで。\n' +
    '・serving は量（例: 1杯, 1個）、kcal、p（たんぱく質g）、f（脂質g）、c（炭水化物g。無ければ糖質＋食物繊維）。\n' +
    '・price は日本での税込価格（円・整数）。分からなければ null。\n' +
    '・確かな値なら confidence=high、推定なら mid か low。食べ物として特定できなければ name を空、数値は0、confidence=low。\n' +
    (withSearch
      ? '・答えは次の形の JSON だけを書く（説明や ``` は書かない）：{"name":"","serving":"","kcal":0,"p":0,"f":0,"c":0,"price":null,"confidence":"low"}'
      : '')
  );
}

export function validateLookup(raw: unknown): LookupDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kcal = num(o.kcal, 0, 3000);
  const p = num(o.p, 0, 300);
  const f = num(o.f, 0, 300);
  const c = num(o.c, 0, 500);
  if (kcal == null || p == null || f == null || c == null) return null;
  const price = o.price == null || o.price === '' ? null : num(o.price, 0, 100_000);
  const confidence = o.confidence === 'high' || o.confidence === 'mid' ? o.confidence : 'low';
  return { name: str(o.name, 40), serving: str(o.serving, 20), kcal, p, f, c, price: price == null ? null : Math.round(price), confidence };
}

/** 検索つきの返事は JSON 指定ができないので、文章の中から JSON を取り出す */
export function extractJsonLoose(body: unknown): unknown {
  const text = (body as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('');
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Gemini のエラーの手がかり（画面の「詳細」に出す）。上限の名前か、エラー文の先頭。
 * 個人情報や秘密の値が混ざらないよう、英数字と一部の記号だけ・100文字までにする。
 */
export function errorHint(errorBody: unknown): string {
  const q = quotaName(errorBody);
  if (q) return q;
  const e = (Array.isArray(errorBody) ? errorBody[0] : errorBody) as { error?: { status?: unknown; message?: unknown } } | null;
  const msg = [e?.error?.status, e?.error?.message].filter((x) => typeof x === 'string').join(' ');
  const safe = msg.replace(/[^A-Za-z0-9 _.,:()-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
  return safe || 'unknown';
}

/** 429 の本文から、当たった上限の名前（quotaMetric の最後の部分）を取り出す。手がかりとして画面に出すため */
export function quotaName(errorBody: unknown): string | null {
  let text = '';
  try {
    text = JSON.stringify(errorBody ?? '');
  } catch {
    return null;
  }
  const m = /"quota(?:Metric|Id)"\s*:\s*"([^"]+)"/.exec(text);
  if (!m) return null;
  return m[1].split('/').pop()!.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 60) || null;
}

/** Gemini が実際に Google 検索をした回数（検索の言葉の数）。0 なら検索せずに答えた */
export function searchQueryCount(body: unknown): number {
  const q = (body as { candidates?: { groundingMetadata?: { webSearchQueries?: unknown[] } }[] })?.candidates?.[0]?.groundingMetadata?.webSearchQueries;
  return Array.isArray(q) ? q.length : 0;
}

/** 検索で見たページ（出典）。https のものだけ、3件まで */
export function extractSources(body: unknown): Source[] {
  const chunks = (body as { candidates?: { groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[] })
    ?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const out: Source[] = [];
  for (const ch of chunks) {
    const uri = ch?.web?.uri;
    if (typeof uri !== 'string' || !uri.startsWith('https://') || uri.length > 2000) continue;
    if (out.some((s) => s.uri === uri)) continue;
    out.push({ title: str(ch.web?.title, 60) || 'ページ', uri });
    if (out.length >= 3) break;
  }
  return out;
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
  const fail = (status: number, reason: string, detail?: string) => json(status, { ok: false, reason, detail, draft: null });

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
  if (!member.ok) return fail(403, 'not_member', `member_check_${member.status}`);
  if ((await member.json()) !== true) return fail(403, 'not_member');

  // 2) 入力
  let body: { mode?: unknown; image?: unknown; query?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request');
  }
  const mode = body.mode;
  const image = body.image;
  const query = mode === 'name' ? normalizeQuery(body.query) : null;
  if (mode === 'name') {
    if (!query) return fail(400, 'bad_request');
  } else if (!isMode(mode) || typeof image !== 'string' || image.length < 100 || image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return fail(400, 'bad_request');
  }

  // 3) 1日の上限（超えていたら Gemini を呼ばない）。呼ぶたびに1回数える
  const service = env('SUPABASE_SERVICE_ROLE_KEY')!;
  const limit = Number(env('ZANRYO_GEMINI_DAILY_LIMIT') ?? '100');
  const consume = async (): Promise<Response | null> => {
    const consumed = await rpc('try_consume_gemini_call', { p_daily_limit: limit }, service, `Bearer ${service}`);
    if (!consumed.ok) return fail(500, 'failed', `usage_check_${consumed.status}`);
    if ((await consumed.json()) !== true) return fail(200, 'daily_limit');
    return null;
  };

  // 4) Gemini（429 はリトライしない）
  const key = env('ZANRYO_GEMINI_API_KEY');
  if (!key) return fail(500, 'failed', 'no_api_key');
  const model = env('ZANRYO_GEMINI_MODEL') ?? 'gemini-flash-lite-latest';
  const lookupModel = env('ZANRYO_GEMINI_LOOKUP_MODEL') ?? 'gemini-2.5-flash';
  const call = async (payload: unknown, useModel = model) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(useModel)}:generateContent`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(payload),
      });
      // 失敗時の本文は、上限の種類を見分けるためだけに使う（ログには残さない）
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    } finally {
      clearTimeout(timer);
    }
  };
  const errorOf = (status: number, detail: string) => {
    console.error('gemini error', status); // 本文は記録しない（画像や読み取り内容を残さない）
    return fail(200, status === 429 ? 'rate_limited' : 'failed', detail);
  };

  try {
    const limited = await consume();
    if (limited) return limited;

    if (mode === 'name') {
      const useSearch = env('ZANRYO_GEMINI_SEARCH') !== 'off';
      let searchFailure = useSearch ? '' : 'search_off';
      if (useSearch) {
        // 検索つきは、無料枠で検索が使える世代のモデルで呼ぶ
        const r = await call(
          {
            contents: [{ role: 'user', parts: [{ text: lookupPrompt(query!, true) }] }],
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0.2 },
          },
          lookupModel,
        );
        if (r.status === 200) {
          const draft = validateLookup(extractJsonLoose(r.body));
          if (draft) {
            return json(200, { ok: true, mode, draft, sources: extractSources(r.body), searched: true, searchQueries: searchQueryCount(r.body), model: lookupModel });
          }
          return fail(200, 'failed', 'unreadable');
        }
        // 検索つきが失敗したら（検索が無料枠で使えない・検索の上限など）、検索なしで1回だけ呼ぶ。
        // 同じ呼び出しを繰り返すのではなく、別の呼び出しを1回だけ試す。それも 429 なら止める。
        searchFailure = `${lookupModel}:${r.status}:${errorHint(r.body)}`;
        const again = await consume();
        if (again) return again;
      }
      const r = await call({
        contents: [{ role: 'user', parts: [{ text: lookupPrompt(query!, false) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: LOOKUP_SCHEMA, temperature: 0.2 },
      });
      if (r.status !== 200) {
        const detail = `${searchFailure ? `${searchFailure} / ` : ''}nosearch:${r.status}:${errorHint(r.body)}`;
        return r.status === 429 ? fail(200, 'rate_limited', detail) : fail(200, 'failed', detail);
      }
      const draft = validateLookup(extractJson(r.body));
      // 検索が使えなかった理由も返す（画面の「詳細」に出す。上限の名前やエラー文の先頭だけ）
      return draft ? json(200, { ok: true, mode, draft, sources: [], searched: false, searchError: searchFailure }) : fail(200, 'failed', 'unreadable');
    }

    const m = mode as Mode;
    const r = await call({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: image } }, { text: PROMPTS[m] }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMAS[m], temperature: 0.2 },
    });
    if (r.status !== 200) return errorOf(r.status, `gemini_${r.status}:${errorHint(r.body)}`);
    const draft = validateDraft(m, extractJson(r.body));
    return draft ? json(200, { ok: true, mode, draft }) : fail(200, 'failed', 'unreadable');
  } catch (e) {
    console.error('gemini request failed', (e as Error).name);
    return fail(200, 'failed', (e as Error).name === 'AbortError' ? 'gemini_timeout' : 'gemini_network');
  }
}

if (typeof Deno !== 'undefined') Deno.serve(handle);
