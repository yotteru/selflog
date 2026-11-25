# HANDOFF: 残量アプリ（selflog）の開発（2026-11-25）

## 現在地（1行）
v1.1（平日と休日の目標）まで実装して main に反映済み。利用者が `supabase/sql/06_holidays.sql` を流して実機で確かめる段階。

## 決定事項
- 仕様の正本は `docs/CLAUDE_CODE_INSTRUCTIONS.md`（§5.5 が今の画面、§10 が決めたことと理由）。手順と確認は `docs/setup-*.md`。入口は `README.md` — 理由: 役割を分けて重複させない。
- セキュリティ・個人情報は `CLAUDE.md` が最優先。秘密の値と個人情報をリポジトリ・コミット・チャットに入れない。作者メールは `208667756+yotteru@users.noreply.github.com` だけ — 理由: リポジトリが公開。
- Supabase は shiori と同じプロジェクト。DB は `zanryo` / `zanryo_private` スキーマ、関数は `zanryo-*`、シークレットは `ZANRYO_*` — 理由: 無料枠のプロジェクト数の上限。
- DB の変更は `supabase/sql/` に番号を足した新しいファイル（次は `07_...sql`）で作り、利用者が SQL Editor で流す。流済みのファイルは書き換えない。各ファイルの先頭に二重実行の確認を入れる。`supabase db push` は使わない — 理由: shiori のマイグレーション履歴と混ざる。
- 新しい関数は作ると誰でも実行できるので、ファイルの最後で `revoke` / `grant` を書く。書き込みは security definer の RPC、テーブルは RLS で本人だけ — 理由: 見えないことに頼らない。
- アプリは、新しい SQL を流す前の DB でも動くようにする（無い列・関数はエラーにせず機能を隠す） — 理由: 反映（push）と SQL の実行の順番がずれるため。
- Gemini は無料枠だけ（課金を有効にしない）。写真は `gemini-flash-lite-latest`、名前で調べる（検索つき）は `gemini-2.5-flash` — 理由: 無料の検索は Gemini 2.x だけ。
- 画面の原則（利用者の希望）：ゲージは満タンから減る、ホーム・記録一覧・期間はページがスクロールしない、下のタブは固定、よく押すものは画面の下、ホームは見るだけ、左右スワイプで日付・期間を移動、週は月曜はじまり、週・月の目標は記録の有無にかかわらず日数分（必ず記録する前提）。
- 利用者は「反映任せる」と言っている：その会話の作業ブランチと `main` の両方に push してよい（2026-11-25 に改めて「今後もプッシュしていい」と確認済み）（main への push で GitHub Pages に自動で置かれ、iPhone のアプリも自動で入れ替わる）。PR は作らない。
- 説明は日本語で、とても分かりやすく短く（利用者の希望）。

## 未決事項
- ウィジェット（Scriptable `widget/zanryo.js`）の見た目の作り直し：利用者が保留中。言われるまで触らない。
- `docs/CLAUDE_CODE_INSTRUCTIONS.md` §10 の未決2件（円形の初期項目、記録直後の強制更新）は、ウィジェットの作り直しのときに決める。

## 次のアクション
1. 利用者に、`06_holidays.sql` を流したか・実機で `docs/setup-v1.md` の「v1.1 確かめること」の4項目がどうだったかを聞き、不具合があれば直す。
2. 利用者の次の要望に取りかかる。作業ごとに：`npx tsc -p .` と `npm test`（今 183 件）→ 画面の変更は下の「画面の確かめ方」で iPhone 16 の大きさで見る → 下の秘密の確認 → 作者メールを確かめてコミット → 2つのブランチに push → docs（仕様 §10・該当する setup）を更新。
3. コミットする前の秘密の確認（何も出なければよい）：`git grep -nIE "AIza[0-9A-Za-z_-]{20,}|sb_secret_|gmail\.com" -- . ':!package-lock.json'`

## 画面の確かめ方（リポジトリには入れていない）
- `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite build` → `npx vite preview --port 4173`。
- Playwright（入っているものを `require(<npm root -g>/playwright)` で読む）で、`https://example.supabase.co/**` を `route` で横取りして偽のデータを返す（`rpc/daily_summary`、`rpc/range_summary`、`rpc/day_info`、`/entries`、`/targets` など）。認証は localStorage の `zanryo-auth` に偽のセッションを入れる。画面は 393×852（iPhone 16）。
- 前の会話の確かめ用スクリプトは一時フォルダにあり、新しい会話には残らない。必要なら同じやり方で作り直す。

## 資産
- アプリ：`src/`（画面 `screens/`、部品 `components/`、ロジックとテスト `lib/`）。公開先 `https://yotteru.github.io/selflog/`。
- DB：`supabase/sql/00〜06, 10, 99`（一覧は `supabase/sql/README.md`。利用者は 06 まで流済み）。テスト `supabase/tests/`（PGlite）。
- Edge Function：`supabase/functions/zanryo-estimate-nutrition/index.ts`、`zanryo-widget-summary/index.ts`（利用者がダッシュボードに貼って置く。変えたら貼り直しを頼む）。
- 文書：`README.md`、`CLAUDE.md`、`docs/`（仕様・各段階の手順・受け入れ基準・メールの非公開・この引き継ぎ）。

## 次セッションへの開始指示（コピペ用）
「selflog リポジトリの docs/HANDOFF.md と CLAUDE.md を読んで。着手前に不明点を全部質問して。なければ次のアクション1から開始して。説明は日本語で。」
