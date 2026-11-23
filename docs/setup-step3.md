# ステップ3：PWA（今日の残り・プリセット記録）

スマホで開くアプリ本体を **GitHub Pages**（`https://yotteru.github.io/selflog/`）に置く。
無料の GitHub Pages は公開リポジトリでしか使えないので、このリポジトリを公開にする（shiori と同じ）。

### 公開しても大丈夫な理由

- リポジトリには秘密の値（APIキー、サービスキー、ウィジェット用トークン）を入れていない。どれも Supabase の設定か端末の中にだけある。
- PWA が使う Supabase の URL と公開用のキーは、どこに置いても配信するJSに入る（ブラウザに渡すための値）。
- データを守っているのは RLS と利用者リスト（`zanryo_private.members`）。仕組みが見えても、登録した本人以外は読めない。
- **公開にする前に必ず**：最初のコミット（Initial commit）の作者欄に個人のメールアドレスが入っているので、履歴を書き換えて GitHub の noreply アドレスにする（[docs/github-email-privacy.md](github-email-privacy.md)）。これが済むまで公開にしない。

## 1. SQL を1つ追加で流す

SQL Editor で `supabase/sql/03_presets_ranked.sql` を実行する（プリセットを「よく使う順」に並べる関数）。

## 2. Supabase の公開用キーを確かめる

**Project Settings → API Keys** で、次の2つをメモする（shiori と同じ値）。

- Project URL：`https://<project-ref>.supabase.co`
- 公開用のキー：`anon`（または `publishable`）のキー

この2つはブラウザに渡ってよい値。`service_role` / `secret` のキーは**絶対に使わない**。

## 3. GitHub Pages に置く

1. リポジトリの **Settings → General → Danger Zone → Change visibility** で **Public** にする。
2. **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする。
3. **Settings → Environments → github-pages → Deployment branches** に `claude/new-session-nx7j7c` を追加する
   （既定では main からしか置けないため。main にまとめたら不要）。
4. **Settings → Secrets and variables → Actions → Variables** に2つ追加する（Secrets ではなく Variables でよい。どちらも公開してよい値）：

   | 名前 | 値 |
   |---|---|
   | `VITE_SUPABASE_URL` | 手順2の Project URL |
   | `VITE_SUPABASE_ANON_KEY` | 手順2の公開用のキー |

5. **Actions → Deploy PWA to GitHub Pages → Run workflow** で実行する。
   緑になれば `https://yotteru.github.io/selflog/` で開ける。以後はこのブランチに push するたびに自動で置き直される。

## 4. ログインの戻り先を Supabase に登録する

**Authentication → URL Configuration → Redirect URLs** に `https://yotteru.github.io/selflog/**` を**追加**する。

- **Site URL は変えない**（shiori のもの）。
- 追加しないと、ログインのメールのリンクが shiori 側に飛ぶ。

## 5. iPhone に入れて、ログインする

ホーム画面のアプリは**メールアドレス＋パスワード**でログインする。パスワードは最初の1回だけ Safari で決める。

1. **Safari** で `https://yotteru.github.io/selflog/` を開く。
2. 「はじめての方」→ メールアドレスを入れて「ログイン用のメールを送る」。
3. 届いたメールのリンクを押す → Safari でログインした状態になる。
4. 画面のいちばん下の「パスワードを決める」で、12文字以上のパスワードを決める（パスワード管理アプリに保存しておく）。
5. Safari の共有ボタン →「ホーム画面に追加」。
6. ホーム画面の「残量」を開き、メールアドレスとパスワードでログインする。以後はログインしたままになる。

- パスワードは shiori と同じユーザーに付く。shiori はこれまでどおりメールのリンクでログインできる。

### なぜパスワードなのか

- ホーム画面に追加したアプリと Safari は、ログイン状態を共有しない（iOS の仕様）。メールのリンクは Safari で開くため、ホーム画面のアプリはリンクではログインできない。
- メールに確認コードを載せる方法もあるが、Supabase の無料プランではメールの文面を変えられない（独自のメール送信サーバーが必要）。

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
