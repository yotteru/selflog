-- 残量アプリ（zanryo）: 入れる前の確認（読むだけ。何も変更しない）
-- shiori のプロジェクトの SQL Editor で実行する。

-- 1) zanryo / zanryo_private というスキーマがまだ無いこと → 0行なら OK
select nspname as already_exists
from pg_namespace
where nspname in ('zanryo', 'zanryo_private');

-- 2) 参考：このプロジェクトにあるスキーマ（shiori が使っているもの）
select nspname as schema_name
from pg_namespace
where nspname not like 'pg\_%'
  and nspname not in ('information_schema', 'auth', 'storage', 'realtime', 'extensions',
                      'graphql', 'graphql_public', 'vault', 'pgsodium', 'pgsodium_masks',
                      'supabase_functions', 'supabase_migrations', 'net', 'cron', 'pgbouncer')
order by 1;

-- 3) 参考：shiori のマイグレーションを Supabase CLI で管理しているか
--    行が出れば CLI 管理。このリポジトリからは `supabase db push` を使わないこと（README 参照）。
select to_regclass('supabase_migrations.schema_migrations') is not null as shiori_uses_cli_migrations;
