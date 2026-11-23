// GET /zanryo-widget-summary   Authorization: Bearer <widget_token>
// 残量アプリ（zanryo）: ウィジェット（Scriptable）向けに今日の残量を返す。仕様 §7。
// shiori と同じプロジェクトに置くので、関数名に zanryo- を付けて区別している。
//
// widget_token はJWTではないので、この関数はゲートウェイのJWT検証を切ってデプロイする
// （supabase/config.toml の verify_jwt = false、または `--no-verify-jwt`）。
// トークンの照合はDB側（zanryo.widget_summary_by_token）でハッシュを比べて行う。
import { createClient } from 'jsr:@supabase/supabase-js@2';

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: 'zanryo' },
});

Deno.serve(async (req) => {
  if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });

  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '');
  if (!m) return json(401, { error: 'missing_token' });

  const { data, error } = await supabase.rpc('widget_summary_by_token', { p_token: m[1] });
  if (error) {
    console.error('widget_summary_by_token failed', error);
    return json(500, { error: 'internal' });
  }
  if (!data) return json(401, { error: 'invalid_token' });
  return json(200, data);
});
