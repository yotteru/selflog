# 残量アプリ（selflog）

1日の「残り」（カロリー・PFC・使えるお金）が、記録するたびに減っていく自分専用のアプリ。
仕様は [docs/CLAUDE_CODE_INSTRUCTIONS.md](docs/CLAUDE_CODE_INSTRUCTIONS.md)。

> **Supabase は shiori と同じプロジェクトを使う。** このアプリのものには、すべて `zanryo` という名前を付けて分けている
> （DBは `zanryo` / `zanryo_private` スキーマ、Edge Function は `zanryo-…`、シークレットは `ZANRYO_…`）。
> 詳しくは [docs/setup-step1-2.md](docs/setup-step1-2.md) の「shiori と分けるためのルール」。

| 場所 | 中身 |
|---|---|
| `supabase/sql/` | DBに流すSQL（番号順に SQL Editor で実行。[一覧](supabase/sql/README.md)） |
| `supabase/functions/zanryo-widget-summary/` | ウィジェット用 Edge Function |
| `supabase/functions/zanryo-estimate-nutrition/` | 写真（料理・成分表示・レシート）を Gemini で読み取る Edge Function |
| `supabase/tests/` | SQLのテスト（PGlite上で `supabase/sql/` を流して確かめる） |
| `src/` | PWA（Vite + React + TypeScript）。`src/lib/` に日付・表示ルール・送信キューなど |
| `src/lib/dayKey.ts` | 1日の区切り（朝4:00 JST）のユーティリティ |
| `widget/zanryo.js` | Scriptable用ウィジェットスクリプト |
| `docs/setup-step1-2.md` | ステップ1〜2のセットアップと動作確認の手順 |
| `docs/setup-step3.md` | ステップ3（PWA を GitHub Pages に置く）と動作確認の手順 |
| `docs/setup-step4.md` | ステップ4（撮影して記録・Gemini）と動作確認の手順 |

## テスト

```bash
npm install
```

```bash
npm test
```

ウィジェットの描画処理が最後まで通るか（見た目は実機で確認）：

```bash
npm run widget:check
```

Supabaseに接続せずに、shiori との分離（public に何も作らない・登録していないユーザーは使えない・アンインストール）、day_key の境界・RLS・残量/節約/記録漏れの集計・ウィジェット用トークンを確かめる。

## 進み具合（仕様 §11）

- [x] 1. スキーマ、RLS、day_key のユーティリティとテスト
- [x] 2. `zanryo-widget-summary` と Scriptable スクリプト（実機でロック画面に出ることを確認済み。見た目を作り直し中）
- [x] 3. PWA 5.1（プリセット記録まで）（**実機確認待ち**）
- [x] 4. `zanryo-estimate-nutrition` と 5.2（レシートの読み取りも追加）（**実機確認待ち**）

## Gemini の無料枠

- モデルは `gemini-flash-lite-latest`（Flash 系でいちばん軽いもの）。Edge Function のシークレット `ZANRYO_GEMINI_MODEL` で変えられる。
- 無料枠の上限（AI Studio の Rate limits の画面で確認。2026-11-23）：
  - Flash-Lite（Gemini 3.5 Flash Lite / 3.1 Flash Lite）：**15 RPM / 500 RPD**
  - Flash（Gemini 3.5 Flash / 3.8 Flash）：5 RPM / 20 RPD（少ないので使わない）
- アプリ側の1日の上限 `ZANRYO_GEMINI_DAILY_LIMIT` は初期値 **100**（500 より十分少ない）。
- 上限は Google のプロジェクト単位で、同じプロジェクトのほかのアプリと分け合う。このアプリ専用のプロジェクトでキーを作る。
- 1日の区切りは太平洋時間の0時（無料枠のリセットに合わせる）。

- [ ] 5. 5.3（過去の日・記録漏れのバナー）
- [ ] 6. 5.4（設定）と仕上げ
