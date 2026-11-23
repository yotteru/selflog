# ステップ3：PWA（今日の残り・プリセット記録）

スマホで開くアプリ本体を、**Cloudflare Pages**（無料）に置く。
リポジトリが非公開なので、無料の GitHub Pages は使えないため。

## 1. SQL を1つ追加で流す

SQL Editor で `supabase/sql/03_presets_ranked.sql` を実行する（プリセットを「よく使う順」に並べる関数）。

## 2. Supabase の公開用キーを確かめる

**Project Settings → API Keys** で、次の2つをメモする（shiori と同じ値）。

- Project URL：`https://<project-ref>.supabase.co`
- 公開用のキー：`anon`（または `publishable`）のキー

この2つはブラウザに渡ってよい値。`service_role` / `secret` のキーは**絶対に使わない**。

## 3. Cloudflare Pages に置く

1. https://dash.cloudflare.com でアカウントを作る（無料）。
2. **Workers & Pages → Create → Pages → Connect to Git** で GitHub とつなぎ、`yotteru/selflog` を選ぶ
   （非公開リポジトリなので、Cloudflare にこのリポジトリへのアクセスを許可する）。
3. 設定：

   | 項目 | 値 |
   |---|---|
   | Production branch | `claude/new-session-nx7j7c`（main にまとめたら main に変える） |
   | Framework preset | なし（None） |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | 環境変数 `VITE_SUPABASE_URL` | 手順2の Project URL |
   | 環境変数 `VITE_SUPABASE_ANON_KEY` | 手順2の公開用のキー |
   | 環境変数 `NODE_VERSION` | `22` |

4. **Save and Deploy**。終わると `https://<名前>.pages.dev` のURLが出る。

以後、このブランチに push するたびに自動で置き直される。

## 4. ログインの戻り先を Supabase に登録する

**Authentication → URL Configuration → Redirect URLs** に `https://<名前>.pages.dev/**` を**追加**する。

- **Site URL は変えない**（shiori のもの）。
- 追加しないと、ログインのメールのリンクが shiori 側に飛ぶ。

## 5. iPhone に入れる

1. Safari で `https://<名前>.pages.dev` を開く。
2. 共有ボタン →「ホーム画面に追加」。
3. ホーム画面の「残量」から開き、メールアドレスを入れて「メールを送る」。
4. 届いたメールで**ログインする**（下の「ログインについて」を参照）。

## ログインについて（iPhone のホーム画面アプリの制約）

ホーム画面に追加したアプリと Safari は、ログイン状態を共有しない（iOS の仕様）。
メールのリンクを押すと Safari で開くため、**ホーム画面のアプリ側はログインできない**。

そのためアプリには「確認コード」を入れる欄を付けてある。ただし、Supabase の今のメールにはコードが書かれていない。
コードを載せるには、**Authentication → Emails → Magic Link** のテンプレートに次の1行を足す：

```html
<p>確認コード：{{ .Token }}</p>
```

※ このテンプレートは **shiori と共通**。shiori のログインメールにもコードの行が増える（リンクはそのまま使える）。

## 6. 動作確認

- [ ] ログインすると「今日の残り」が出る。初回は5つのターゲットが自動で作られる
- [ ] 「手入力で記録」で記録し、「プリセットに保存」にチェックするとプリセットができる
- [ ] プリセットを押すと**その場で**残りが減り、トーストの「取り消す」で戻る（受け入れ基準1）
- [ ] 上限を超えると、オレンジと「超過」の文字になる。P が 160g に届くと「✓ 達成」になる（受け入れ基準3）
- [ ] 「積み上げ」に切り替えると、摂取量・使った額と「今月の節約（見込み）」が出る
- [ ] 記録一覧の記録をタップすると、直したり削除したりできる
- [ ] 機内モードでプリセットを押すと「未送信の記録が1件」と出て、戻すと送られる
- [ ] 記録から15〜30分でロック画面のウィジェットにも反映される

## PC で動かすとき（任意）

```bash
cp .env.example .env.local
```

`.env.local` に URL とキーを書いてから：

```bash
npm run dev
```
