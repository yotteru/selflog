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
| `supabase/tests/` | SQLのテスト（PGlite上で `supabase/sql/` を流して確かめる） |
| `src/` | PWA（Vite + React + TypeScript）。`src/lib/` に日付・表示ルール・送信キューなど |
| `src/lib/dayKey.ts` | 1日の区切り（朝4:00 JST）のユーティリティ |
| `widget/zanryo.js` | Scriptable用ウィジェットスクリプト |
| `docs/setup-step1-2.md` | ステップ1〜2のセットアップと動作確認の手順 |
| `docs/setup-step3.md` | ステップ3（PWA を Cloudflare Pages に置く）と動作確認の手順 |

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
- [ ] 4. `estimate-nutrition` と 5.2
  - 1日の呼び出し回数のカウンター（`try_consume_gemini_call`）は先に入れてある
  - 実装するときにやること（仕様 §6 の更新分）：
    - 無料枠で画像入力が使えるFlash系のモデルを選び、その無料枠の上限（RPM / RPD）を公式ドキュメントで確認して、この README に書く
    - APIキーは、Cloud Billing を有効にしていないプロジェクトで AI Studio から発行する
    - 429 のときはリトライせず、「今は推定できません」と出して手入力に切り替える
    - 関数名は `zanryo-estimate-nutrition`、シークレットは `ZANRYO_GEMINI_API_KEY` / `ZANRYO_GEMINI_MODEL` / `ZANRYO_GEMINI_DAILY_LIMIT`
    - 1日の上限は環境変数にする（初期値は無料枠より十分少なくする）
    - 送る前に中心部分を切り抜けるようにし、縮小するときに EXIF（位置情報など）を取り除く
- [ ] 5. 5.3（過去の日・記録漏れのバナー）
- [ ] 6. 5.4（設定）と仕上げ
