# supabase/sql — 残量アプリのSQL

shiori と同じ Supabase プロジェクトで動かすので、このアプリのものは
**`zanryo` と `zanryo_private` の2つのスキーマの中だけ**に作る（`public` には何も作らない）。

| ファイル | いつ使う | 中身 |
|---|---|---|
| `00_check_before_install.sql` | 最初に1回 | 入れる前の確認（読むだけ） |
| `01_schema.sql` | 最初に1回 | テーブル・RLS・集計関数・ウィジェット用トークン |
| `02_gemini_usage.sql` | 最初に1回 | Gemini の1日の呼び出し回数のカウンター |
| `03_presets_ranked.sql` | 最初に1回 | プリセットを「よく使う順」に返す関数（ステップ3で追加） |
| `04_capture.sql` | 最初に1回 | レシートの記録、Edge Function 用の利用者チェック（ステップ4で追加） |
| `05_periods.sql` | 最初に1回 | 目標の期間（日・週・月）と、週・月の集計（v1 で追加） |
| `06_holidays.sql` | 最初に1回 | 平日と休日（土日祝・手で切り替え）で目標を分ける（v1.1 で追加） |
| `10_add_member.sql` | 最初に1回 | 自分を利用者として登録する（UID を書き換えて実行） |
| `99_uninstall.sql` | 消したいとき | 2つのスキーマごと削除（shiori には影響しない） |

- 実行は SQL Editor に貼り付けて、番号順に。
- `supabase db push` は使わない（shiori のマイグレーション履歴と混ざるため）。
- 各ファイルは1回だけ流す。もう一度流すと「すでに実行済みです」と出て止まる（何も変わらないので安心してよい）。
- 後から変更するときは `03_...sql` のように番号を足していき、すでに流したファイルは書き換えない。

## スキーマの中身

**zanryo**（アプリから呼ぶ。Data API の Exposed schemas に追加する）

| 名前 | 種類 | 内容 |
|---|---|---|
| `targets` | テーブル | ターゲット（カロリー・PFC・お金など） |
| `presets` | テーブル | プリセット |
| `entries` / `entry_values` | テーブル | 1回の記録と、ターゲットごとの量 |
| `day_goals` | テーブル | 日ごとの目標値のスナップショット（読むだけ） |
| `day_status` | テーブル | 日ごとの確定状態（読むだけ） |
| `daily_summary(day)`、`presets_ranked()` など | 関数 | 集計・記録・トークン発行のRPC |

**zanryo_private**（内部用。Data API には公開しない）

| 名前 | 内容 |
|---|---|
| `members` | このアプリを使えるユーザー |
| `widget_tokens` | ウィジェット用トークン（ハッシュのみ） |
| `gemini_usage` | Gemini の1日の呼び出し回数 |
| その他の関数 | 集計・チェックの内部処理 |
