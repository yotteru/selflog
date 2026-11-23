-- 残量アプリ（zanryo）: プリセットを「よく使う順」に返す（仕様 §5.1 よく使う上位3件）
-- 02_gemini_usage.sql の後に1回だけ流す。

-- 二重に実行しないための確認（実行済みなら、何も変えずにここで止まる）
do $$
begin
  if to_regprocedure('zanryo.presets_ranked()') is not null then
    raise exception '03_presets_ranked.sql はすでに実行済みです。もう一度流す必要はありません（何も変更していません）。';
  end if;
end
$$;

-- 直近60日に使った回数の多い順。同じ回数なら sort、ラベル順。
-- security invoker なので RLS が効き、自分のプリセットだけが返る。
create function zanryo.presets_ranked()
returns table (id uuid, label text, sort int, amounts jsonb, use_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.label, p.sort, p.amounts, count(e.id) as use_count
  from zanryo.presets p
  left join zanryo.entries e
    on e.preset_id = p.id
   and e.deleted_at is null
   and e.recorded_at > now() - interval '60 days'
  group by p.id
  order by count(e.id) desc, p.sort, p.label
$$;

revoke all on function zanryo.presets_ranked() from public, anon;
grant execute on function zanryo.presets_ranked() to authenticated;
