-- 残量アプリ（zanryo）: 入れる前の確認（読むだけ。何も変更しない）
-- shiori のプロジェクトの SQL Editor で実行する。
-- SQL Editor は最後のクエリの結果しか表示しないので、確認をすべて1つの表にまとめている。
-- result がすべて OK なら、01_schema.sql に進んでよい。

select '1. zanryo という名前のスキーマがまだ無い' as check_item,
       case when exists (select 1 from pg_namespace where nspname in ('zanryo', 'zanryo_private'))
            then 'NG：すでにある（入れずに相談する）' else 'OK' end as result
union all
select '2. shiori はマイグレーションを CLI で管理していない',
       case when to_regclass('supabase_migrations.schema_migrations') is not null
            then '注意：CLI管理。このリポジトリから db push はしないこと' else 'OK' end
union all
select '3. 参考：このプロジェクトにある独自スキーマ',
       coalesce(string_agg(nspname, ', ' order by nspname), '(なし)')
from pg_namespace
where nspname not like 'pg\_%'
  and nspname not in ('information_schema', 'auth', 'storage', 'realtime', 'extensions',
                      'graphql', 'graphql_public', 'vault', 'pgsodium', 'pgsodium_masks',
                      'supabase_functions', 'supabase_migrations', 'net', 'cron', 'pgbouncer');
