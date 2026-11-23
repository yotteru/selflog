# ステップ1〜2：セットアップと動作確認

Windowsだけで進められる手順にしてある（Supabase CLI は `npx supabase` で使う。インストール不要）。

## 1. Supabaseプロジェクトを作る

1. https://supabase.com でプロジェクトを作る（リージョンは Tokyo）。
2. **Authentication → Providers → Email** を有効にする（マジックリンク）。
3. **Authentication → Sign In / Providers** で「Allow new users to sign up」は、自分の登録が済んだらオフにしておく。

## 2. スキーマを入れる

どちらかの方法で。

- **ダッシュボード**：SQL Editor に `supabase/migrations/20261123000000_init.sql` の中身を貼って実行。
- **CLI**：
  ```bash
  npx supabase login
  ```
  ```bash
  npx supabase link --project-ref <project-ref>
  ```
  ```bash
  npx supabase db push
  ```

### 確認（SQL Editor）

```sql
-- 3:59は前日、4:00は当日
select public.day_key_of('2026-11-23 03:59+09'), public.day_key_of('2026-11-23 04:00+09');
-- → 2026-11-22 | 2026-11-23

-- RLSがすべて有効
select relname, relrowsecurity from pg_class
where relname in ('targets','presets','entries','entry_values','day_goals','day_status');
-- → すべて true
```

## 3. 自分のユーザーとトークンを作る（PWAができるまでの仮手順）

PWA（ステップ3）ができれば画面からできるようになる。それまではSQL Editorで行う。

1. **Authentication → Users → Add user → Send magic link**（または Create new user）で自分を作る。
2. SQL Editor で、自分のユーザーとして初期データとトークンを作る：
   ```sql
   -- <USER_ID> は Users 画面の UID
   select set_config('request.jwt.claim.sub', '<USER_ID>', true);
   set local role authenticated;
   select public.bootstrap();          -- 既定の5ターゲット
   select public.issue_widget_token(); -- ← 表示された zr_... をメモ（二度と表示されない）
   ```
   ※ SQL Editor は1回の実行を1トランザクションで流すので、上の4行はまとめて実行する。
3. 試しに記録を入れる（同じく4行をまとめて実行）：
   ```sql
   select set_config('request.jwt.claim.sub', '<USER_ID>', true);
   set local role authenticated;
   select public.add_entry('manual',
     (select jsonb_object_agg(id, case key when 'kcal' then 860 when 'p' then 30 when 'money' then 580 else 0 end)
        from public.targets),
     'テスト');
   select key, goal, used, remaining, state from public.daily_summary();
   ```
   → kcal の remaining が 1340、money が 420 になる。

## 4. Edge Function `widget-summary` をデプロイする

```bash
npx supabase functions deploy widget-summary --no-verify-jwt
```

（`supabase/config.toml` にも `verify_jwt = false` を書いてある。ウィジェット用トークンはJWTではないため、ゲートウェイのJWT検証を切る。トークンの照合は関数の中でハッシュを比べて行う。）

`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` はEdge Functionに自動で入るので、設定は不要。

### 確認（PowerShell）

```powershell
curl.exe -s https://<project-ref>.supabase.co/functions/v1/widget-summary -H "Authorization: Bearer zr_..."
```

→ `{"day_key":"...","items":[{"key":"kcal","remaining":1340,...}],"month_saving":...}` が返る。
間違ったトークンなら `401 {"error":"invalid_token"}`。

## 5. Scriptable（iPhone）— **ここが一番のリスク。最初に実機で確かめる**

1. App Store で **Scriptable** を入れる。
2. 新しいスクリプトを作り、`widget/zanryo.js` の中身を貼り付け、名前を **zanryo** にする。
   （iCloud Drive の Scriptable フォルダに `zanryo.js` を置いてもよい）
3. スクリプトを実行 →「URLとトークンを設定」
   - URL: `https://<project-ref>.supabase.co/functions/v1/widget-summary`
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

結果（特に accessory 系が描けるか、文字が切れないか、反映までの時間）を教えてもらえれば、ステップ3に進む前に調整する。

## 補足：記録直後にウィジェットを更新できるか（未決事項 §10）

Scriptableのスクリプトをショートカットから実行しても、ウィジェットの再描画はiOSが決めるため、強制はできない。
ショートカット「zanryo を実行」はキャッシュを更新するだけになる。実機でどの程度早まるかは、ステップ3以降に試す。
