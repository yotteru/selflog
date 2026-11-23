# ステップ1〜2：セットアップと動作確認

残量アプリは **shiori と同じ Supabase プロジェクト**に入れる。Windowsだけで進められる手順にしてある
（Supabase CLI は Edge Function のデプロイにだけ使い、`npx supabase` で動かす。インストールは不要）。

## shiori と分けるためのルール

| もの | 残量アプリの名前 | shiori と共通か |
|---|---|---|
| DBのテーブル・関数 | `zanryo` / `zanryo_private` スキーマの中だけ | 分かれている（`public` には何も作らない） |
| Edge Function | `zanryo-` で始まる名前 | 名前で区別 |
| シークレット（環境変数） | `ZANRYO_` で始まる名前 | 名前で区別（ステップ4から使う） |
| ログイン（Authentication） | — | **共通**。使えるのは `zanryo_private.members` に登録した人だけ |
| 無料枠（DB容量・関数の呼び出し回数） | — | **共通**（この用途ならごく一部しか使わない） |

- SQL は `supabase/sql/` のファイルを SQL Editor で番号順に流す。**`supabase db push` は使わない**（shiori のマイグレーション履歴と混ざるため）。
- `supabase link` もしない。CLI を使うときは毎回 `--project-ref` を付ける（取り違えを防ぐため）。
- 残量アプリをやめるときは `supabase/sql/99_uninstall.sql` を流せば、shiori に影響なく全部消える。

## 1. 入れる前の確認

SQL Editor で `supabase/sql/00_check_before_install.sql` を実行する（読むだけ）。

- 1つ目の結果が **0行** なら OK（`zanryo` という名前がまだ使われていない）。
- 3つ目が `true` なら、shiori は CLI でマイグレーションを管理している。上のルールどおり `db push` を使わなければ問題ない。

## 2. スキーマを入れる

SQL Editor で、次の2つのファイルの中身をそれぞれ貼り付けて実行する。

1. `supabase/sql/01_schema.sql`
2. `supabase/sql/02_gemini_usage.sql`

### Data API に zanryo を公開する

**Project Settings → Data API → Exposed schemas** に `zanryo` を**追加**する（`public` など、shiori が使っているものは消さない）。
`zanryo_private` は追加しない。

### 確認

```sql
-- 3:59は前日、4:00は当日
select zanryo.day_key_of('2026-11-23 03:59+09'), zanryo.day_key_of('2026-11-23 04:00+09');
-- → 2026-11-22 | 2026-11-23

-- RLSがすべて有効
select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('zanryo', 'zanryo_private') and c.relkind = 'r';
-- → すべて true
```

## 3. 自分を利用者として登録し、トークンを作る

1. **Authentication → Users** で自分の UID を確かめる。
   - shiori と同じメールアドレスで使うなら、shiori のユーザーをそのまま使う（新しく作らない）。
   - 別のメールアドレスにするなら **Add user** で作る。shiori で新規登録を止めていても、ここからなら作れる。
2. `supabase/sql/10_add_member.sql` の `<USER_ID>` を自分の UID に書き換えて実行する。
3. 自分のユーザーとして初期データとトークンを作る（4行をまとめて実行する。SQL Editor は1回の実行を1トランザクションで流す）：
   ```sql
   select set_config('request.jwt.claim.sub', '<USER_ID>', true);
   set local role authenticated;
   select zanryo.bootstrap();          -- 既定の5ターゲット
   select zanryo.issue_widget_token(); -- ← 表示された zr_... をメモ（二度と表示されない）
   ```
   PWA（ステップ3）ができたら、この2つは画面からできるようになる。
4. 試しに記録を入れる（同じくまとめて実行）：
   ```sql
   select set_config('request.jwt.claim.sub', '<USER_ID>', true);
   set local role authenticated;
   select zanryo.add_entry('manual',
     (select jsonb_object_agg(id, case key when 'kcal' then 860 when 'p' then 30 when 'money' then 580 else 0 end)
        from zanryo.targets),
     'テスト');
   select key, goal, used, remaining, state from zanryo.daily_summary();
   ```
   → kcal の remaining が 1340、money が 420 になる。

## 4. Edge Function `zanryo-widget-summary` をデプロイする

`<project-ref>` は shiori のプロジェクトのもの（ダッシュボードのURL `supabase.com/dashboard/project/<project-ref>` の部分）。

```bash
npx supabase login
```

```bash
npx supabase functions deploy zanryo-widget-summary --project-ref <project-ref> --no-verify-jwt
```

- `--no-verify-jwt`：ウィジェット用トークンはJWTではないので、ゲートウェイのJWT検証を切る。照合は関数の中でハッシュを比べて行う（`supabase/config.toml` にも書いてある）。
- `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` はEdge Functionに自動で入るので、設定は不要。
- ダッシュボードの **Edge Functions** に、shiori の関数と並んで `zanryo-widget-summary` が出ていればOK。

### 確認（PowerShell）

```powershell
curl.exe -s https://<project-ref>.supabase.co/functions/v1/zanryo-widget-summary -H "Authorization: Bearer zr_..."
```

→ `{"day_key":"...","items":[{"key":"kcal","remaining":1340,...}],"month_saving":...}` が返る。
間違ったトークンなら `401 {"error":"invalid_token"}`。

## 5. Scriptable（iPhone）— **ここが一番のリスク。最初に実機で確かめる**

1. App Store で **Scriptable** を入れる。
2. 新しいスクリプトを作り、`widget/zanryo.js` の中身を貼り付け、名前を **zanryo** にする。
   （iCloud Drive の Scriptable フォルダに `zanryo.js` を置いてもよい）
3. スクリプトを実行 →「URLとトークンを設定」
   - URL: `https://<project-ref>.supabase.co/functions/v1/zanryo-widget-summary`
   - トークン: 手順3でメモした `zr_...`
4. 「取得結果を表示」で JSON が出ることを確認。「プレビュー：円形／横長／小／中」で見た目を確認。
5. ロック画面を長押し → カスタマイズ → ロック画面 → ウィジェットを追加 → Scriptable
   - **円形**を置き、タップして Script = zanryo、Parameter = `kcal`（他に `p` `money` `f` `c`）
   - **横長**を置き、Script = zanryo
6. ホーム画面にも small / medium を置いて確認。

### 確かめること（チェックリスト）

- [ ] 円形ウィジェットにリングと「残り 1,340 kcal」が出る
- [ ] Parameter を `p` にすると「あと 130 P」になる
- [ ] 横長に「今日の残り 1,340kcal · ¥420」と、2行目に PFC が出る
- [ ] SQLで money を超過させる（`add_entry` で 600 を追加）と、「超過 ¥180」になる
- [ ] P を 160 以上にすると、横長の2行目から P が消え、円形（p）は「達成 ✓」になる
- [ ] 機内モードにしてもエラーにならず、「H:mm時点」と最後の値が出る
- [ ] 記録してから何分で反映されるか（目安15分。**30分以内なら受け入れ基準6を満たす**）
- [ ] shiori がこれまでどおり動く

結果（特に accessory 系が描けるか、文字が切れないか、反映までの時間）を教えてもらえれば、ステップ3に進む前に調整する。

## 補足：記録直後にウィジェットを更新できるか（未決事項 §10）

Scriptableのスクリプトをショートカットから実行しても、ウィジェットの再描画はiOSが決めるため、強制はできない。
ショートカット「zanryo を実行」はキャッシュを更新するだけになる。実機でどの程度早まるかは、ステップ3以降に試す。
