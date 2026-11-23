-- 残量アプリ（zanryo）: 撮影して記録（ステップ4）
-- 03_presets_ranked.sql の後に1回だけ流す。
--   - 記録の種類（entries.source）に「レシート」（receipt）を足す
--   - Edge Function が「このアプリの利用者か」を確かめるための関数

-- 二重に実行しないための確認（実行済みなら、何も変えずにここで止まる）
do $$
begin
  if to_regprocedure('zanryo.is_member()') is not null then
    raise exception '04_capture.sql はすでに実行済みです。もう一度流す必要はありません（何も変更していません）。';
  end if;
end
$$;

alter table zanryo.entries drop constraint entries_source_check;
alter table zanryo.entries add constraint entries_source_check
  check (source in ('preset', 'photo', 'label', 'receipt', 'manual'));

-- ログイン中のユーザーが、このアプリの利用者なら true
create function zanryo.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select zanryo_private.member_uid() is not null
$$;

revoke all on function zanryo.is_member() from public, anon;
grant execute on function zanryo.is_member() to authenticated;
