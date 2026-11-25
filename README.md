# 残量アプリ（selflog）

1日の「残り」（カロリー・PFC・使えるお金など）が、記録するたびに減っていく自分専用のアプリ。
iPhone のホーム画面に追加して使う PWA（`https://yotteru.github.io/selflog/`）。

> **Supabase は shiori と同じプロジェクトを使う。** このアプリのものには、すべて `zanryo` という名前を付けて分けている
> （DBは `zanryo` / `zanryo_private` スキーマ、Edge Function は `zanryo-…`、シークレットは `ZANRYO_…`）。
> 詳しくは [docs/setup-step1-2.md](docs/setup-step1-2.md) の「shiori と分けるためのルール」。
>
> **セキュリティと個人情報のルール**は [CLAUDE.md](CLAUDE.md)（秘密の値・個人情報をリポジトリに入れない、など）。

## ドキュメントの案内

| 知りたいこと | 読むもの |
|---|---|
| 何を作るか・ルール・決めたこと（仕様の正本） | [docs/CLAUDE_CODE_INSTRUCTIONS.md](docs/CLAUDE_CODE_INSTRUCTIONS.md) |
| 次の会話で続きをするとき | [docs/HANDOFF.md](docs/HANDOFF.md) |
| DB に流す SQL の一覧と順番 | [supabase/sql/README.md](supabase/sql/README.md) |
| 受け入れ基準の確認状況 | [docs/acceptance.md](docs/acceptance.md) |
| GitHub でメールアドレスを公開しない設定 | [docs/github-email-privacy.md](docs/github-email-privacy.md) |

段階ごとの「やること（設定）」と「確かめること」：

| 段階 | 中身 | 読むもの |
|---|---|---|
| ステップ1〜2 | DB・利用者の登録・ウィジェット（Scriptable） | [docs/setup-step1-2.md](docs/setup-step1-2.md) |
| ステップ3 | PWA を GitHub Pages に置く・ログイン | [docs/setup-step3.md](docs/setup-step3.md) |
| ステップ4 | 撮影して記録（料理・成分表示・レシート）・名前で調べる・Gemini の無料枠 | [docs/setup-step4.md](docs/setup-step4.md) |
| ステップ5〜6 | 過去の日・記録漏れのお知らせ・設定・スクリーンタイム | [docs/setup-step5-6.md](docs/setup-step5-6.md) |
| v1 / v1.1 | 今の画面構成（下のタブ・期間のグラフ）・目標の期間・平日と休日の目標 | [docs/setup-v1.md](docs/setup-v1.md) |

## ファイルの地図

| 場所 | 中身 |
|---|---|
| `supabase/sql/` | DBに流すSQL（番号順に SQL Editor で実行） |
| `supabase/functions/zanryo-widget-summary/` | ウィジェット用 Edge Function |
| `supabase/functions/zanryo-estimate-nutrition/` | 写真（料理・成分表示・レシート）の読み取りと、名前で調べる（Google 検索つき）Edge Function |
| `supabase/tests/` | SQLのテスト（PGlite上で `supabase/sql/` を流して確かめる） |
| `src/screens/` | 画面（Shell＝タブと日ごとのデータ、Home、Entries、Period、Settings、Capture、Login） |
| `src/components/` | 部品（ゲージ、期間のグラフ、記録のシート、切り抜きの枠など） |
| `src/lib/` | 画面から切り離したロジック（1日の区切り `dayKey.ts`、期間の集計 `period.ts`、折れ線 `lineChart.ts`、ペースの目安 `pace.ts`、送信キュー `queue.ts`、写真の切り抜き `image.ts`、API `api.ts` など。多くにテストあり） |
| `widget/zanryo.js` | Scriptable用ウィジェットスクリプト（見た目の作り直しは保留中） |
| `.github/workflows/pages.yml` | main（と作業ブランチ）に push すると GitHub Pages に置き直す |

## テスト

```bash
npm install
```

```bash
npm test
```

型のチェック：

```bash
npx tsc -p .
```

ウィジェットの描画処理が最後まで通るか（見た目は実機で確認）：

```bash
npm run widget:check
```

Supabaseに接続せずに、shiori との分離（public に何も作らない・登録していないユーザーは使えない・アンインストール）、day_key の境界・RLS・残量/節約/記録漏れ/週と月/休日の集計・ウィジェット用トークン、画面のロジックを確かめる。

## 進み具合

| 段階 | 状況 |
|---|---|
| 1. スキーマ、RLS、day_key | 済み |
| 2. ウィジェット（Scriptable） | 実機でロック画面に出ることを確認済み。**見た目の作り直しは保留**（利用者の判断） |
| 3. PWA（今日の残り・プリセット記録） | 済み（実機で使用中） |
| 4. 撮影して記録・レシート・名前で調べる | 済み（実機で使用中） |
| 5〜6. 過去の日・記録漏れ・設定 | 済み |
| v1. 下のタブ・スクロールしない画面・期間（週・月）・目標の期間 | 済み（`05_periods.sql` 適用済み） |
| v1.1. 平日と休日の目標 | 実装済み。`06_holidays.sql` 流済み。実機で確認するところ |

Gemini の無料枠の上限とモデルの選び方は [docs/setup-step4.md](docs/setup-step4.md) にまとめている。
