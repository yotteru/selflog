-- 残量アプリ（zanryo）: Gemini の1日の呼び出し回数（仕様 §6「無料枠だけで使う」）
-- Edge Function zanryo-estimate-nutrition が、Geminiを呼ぶ前に service_role で try_consume_gemini_call() を呼ぶ。
-- 上限に達していれば false を返すので、Geminiは呼ばずに手入力へ切り替える。
--
-- 日の区切りは、無料枠の1日あたりの上限（RPD）がリセットされる太平洋時間の0時に合わせる。
-- 無料枠の上限はAPIキー（プロジェクト）単位なので、ユーザーごとではなく全体で数える。

create table zanryo_private.gemini_usage (
  usage_day date primary key,
  calls int not null default 0 check (calls >= 0),
  updated_at timestamptz not null default now()
);
alter table zanryo_private.gemini_usage enable row level security;

create or replace function zanryo_private.gemini_usage_day()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Los_Angeles')::date
$$;

-- 上限未満なら1回分を数えて true、上限に達していれば数えずに false
create or replace function zanryo.try_consume_gemini_call(p_daily_limit int)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_calls int;
begin
  if p_daily_limit is null or p_daily_limit <= 0 then
    return false;
  end if;

  insert into zanryo_private.gemini_usage as u (usage_day, calls)
  values (zanryo_private.gemini_usage_day(), 1)
  on conflict (usage_day) do update
    set calls = u.calls + 1, updated_at = now()
    where u.calls < p_daily_limit
  returning u.calls into v_calls;

  return v_calls is not null;
end
$$;

-- 今日の使用回数（設定画面などで表示する用）
create or replace function zanryo.gemini_usage_today()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select calls from zanryo_private.gemini_usage where usage_day = zanryo_private.gemini_usage_day()), 0)
  where zanryo_private.member_uid() is not null
$$;

revoke all on function zanryo_private.gemini_usage_day() from public, anon, authenticated;
revoke all on function zanryo.try_consume_gemini_call(int) from public, anon, authenticated;
grant execute on function zanryo.try_consume_gemini_call(int) to service_role;
revoke all on function zanryo.gemini_usage_today() from public, anon;
grant execute on function zanryo.gemini_usage_today() to authenticated, service_role;
