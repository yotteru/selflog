# 残量アプリ（selflog）

1日の「残り」（カロリー・PFC・使えるお金）が、記録するたびに減っていく自分専用のアプリ。
仕様は [docs/CLAUDE_CODE_INSTRUCTIONS.md](docs/CLAUDE_CODE_INSTRUCTIONS.md)。

| 場所 | 中身 |
|---|---|
| `supabase/migrations/` | スキーマ・RLS・集計関数（`daily_summary` など） |
| `supabase/functions/widget-summary/` | ウィジェット用 Edge Function |
| `supabase/tests/` | SQLのテスト（PGliteでマイグレーションを流して確かめる） |
| `src/lib/dayKey.ts` | 1日の区切り（朝4:00 JST）のユーティリティ |
| `widget/zanryo.js` | Scriptable用ウィジェットスクリプト |
| `docs/setup-step1-2.md` | ステップ1〜2のセットアップと動作確認の手順 |

## テスト

```bash
npm install
npm test
```

Supabaseに接続せずに、day_key の境界・RLS・残量/節約/記録漏れの集計・ウィジェット用トークンを確かめる。

## 進み具合（仕様 §11）

- [x] 1. スキーマ、RLS、day_key のユーティリティとテスト
- [x] 2. `widget-summary` と Scriptable スクリプト（**実機でのロック画面確認待ち**）
- [ ] 3. PWA 5.1（プリセット記録まで）
- [ ] 4. `estimate-nutrition` と 5.2
  - 1日の呼び出し回数のカウンター（`try_consume_gemini_call`）は先に入れてある
  - 実装するときにやること（仕様 §6 の更新分）：
    - 無料枠で画像入力が使えるFlash系のモデルを選び、その無料枠の上限（RPM / RPD）を公式ドキュメントで確認して、この README に書く
    - APIキーは、Cloud Billing を有効にしていないプロジェクトで AI Studio から発行する
    - 429 のときはリトライせず、「今は推定できません」と出して手入力に切り替える
    - 1日の上限は環境変数にする（初期値は無料枠より十分少なくする）
    - 送る前に中心部分を切り抜けるようにし、縮小するときに EXIF（位置情報など）を取り除く
- [ ] 5. 5.3（過去の日・記録漏れのバナー）
- [ ] 6. 5.4（設定）と仕上げ
