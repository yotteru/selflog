-- 残量アプリ（zanryo）: 目標の期間（日・週・月）と、週・月の集計（v1）
-- 04_capture.sql の後に1回だけ流す。
--
-- - ターゲットごとに目標の期間を選べる：day（1日）/ week（1週間・月曜はじまり）/ month（1か月・1日はじまり）
--   例：お金を「1週間 7,000円」にすると、月曜の朝4:00に目標額に戻り、その週のあいだ残りが減っていく。
-- - 日の集計（daily_summary）は、週・月の目標のターゲットについて「その期間の始まりからその日までの合計」を使う。
-- - 週・月の画面のために、日ごとの使った量と目標を返す range_summary を足す。
-- - 今月の節約は、週・月の目標を1日あたりに割った額（週なら÷7、月ならその月の日数で割る）で数える。

-- 二重に実行しないための確認（実行済みなら、何も変えずにここで止まる）
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'zanryo' and table_name = 'targets' and column_name = 'period'
  ) then
    raise exception '05_periods.sql はすでに実行済みです。もう一度流す必要はありません（何も変更していません）。';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 列
-- ---------------------------------------------------------------------------

alter table zanryo.targets
  add column period text not null default 'day' check (period in ('day', 'week', 'month'));
comment on column zanryo.targets.period is '目標の期間。daily_goal はこの期間あたりの目標（列名は互換のため daily_goal のまま）';

alter table zanryo.day_goals
  add column period text not null default 'day' check (period in ('day', 'week', 'month'));

-- ---------------------------------------------------------------------------
-- 期間の計算
-- ---------------------------------------------------------------------------

-- その日を含む期間の最初の日（週は月曜、月は1日）
create or replace function zanryo.period_start(p_day date, p_period text)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_period
    when 'week' then p_day - (extract(isodow from p_day)::int - 1)
    when 'month' then date_trunc('month', p_day::timestamp)::date
    else p_day
  end
$$;

-- その日を含む期間の最後の日
create or replace function zanryo.period_end(p_day date, p_period text)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_period
    when 'week' then zanryo.period_start(p_day, 'week') + 6
    when 'month' then (date_trunc('month', p_day::timestamp) + interval '1 month - 1 day')::date
    else p_day
  end
$$;

-- 目標を1日あたりに割った額（週は÷7、月はその月の日数で割る）
create or replace function zanryo.daily_equivalent(p_goal numeric, p_period text, p_day date)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_period
    when 'week' then p_goal / 7
    when 'month' then p_goal / (zanryo.period_end(p_day, 'month') - zanryo.period_start(p_day, 'month') + 1)
    else p_goal
  end
$$;

-- ---------------------------------------------------------------------------
-- スナップショットにも期間を持たせる
-- ---------------------------------------------------------------------------

create or replace function zanryo_private.ensure_day_goals(p_user uuid, p_day date)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into zanryo.day_goals (user_id, day_key, target_id, daily_goal, kind, period)
  select t.user_id, p_day, t.id, t.daily_goal, t.kind, t.period
  from zanryo.targets t
  where t.user_id = p_user and t.active
  on conflict do nothing
$$;

create or replace function zanryo_private.targets_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := zanryo.today_key();
begin
  if not exists (
    select 1 from zanryo.day_goals g where g.user_id = new.user_id and g.day_key = v_today
  ) then
    -- 今日のスナップショットがまだ無ければ、最初の集計時に作られる
    return null;
  end if;

  if new.active then
    insert into zanryo.day_goals (user_id, day_key, target_id, daily_goal, kind, period)
    values (new.user_id, v_today, new.id, new.daily_goal, new.kind, new.period)
    on conflict (user_id, day_key, target_id)
      do update set daily_goal = excluded.daily_goal, kind = excluded.kind, period = excluded.period;
  else
    delete from zanryo.day_goals g
    where g.user_id = new.user_id and g.day_key = v_today and g.target_id = new.id
      and not exists (
        select 1 from zanryo.entry_values ev join zanryo.entries e on e.id = ev.entry_id
        where ev.target_id = new.id and e.day_key = v_today and e.deleted_at is null);
  end if;
  return null;
end
$$;

drop trigger targets_after_write on zanryo.targets;
create trigger targets_after_write
  after insert or update of daily_goal, kind, active, period on zanryo.targets
  for each row execute function zanryo_private.targets_after_write();

-- ---------------------------------------------------------------------------
-- 日の集計（返す列が増えるので作り直す）
-- ---------------------------------------------------------------------------

drop function zanryo.daily_summary(date);
drop function zanryo_private.daily_summary(uuid, date);

-- goal / used / remaining は「その期間」の値。日の目標なら今までと同じ。
-- used は期間の始まりから p_day までの合計（過去の日を見たときは、その日の時点の値）。
-- day_used はその日だけの合計。
create function zanryo_private.daily_summary(p_user uuid, p_day date)
returns table (
  target_id uuid,
  key text,
  name text,
  unit text,
  kind text,
  sort int,
  goal numeric,
  used numeric,
  remaining numeric,
  state text,
  period text,
  period_start date,
  period_end date,
  day_used numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform zanryo_private.ensure_day_goals(p_user, p_day);
  return query
  with g as (
    select dg.target_id, dg.daily_goal, dg.kind, dg.period,
           zanryo.period_start(p_day, dg.period) as ps,
           zanryo.period_end(p_day, dg.period) as pe
    from zanryo.day_goals dg
    where dg.user_id = p_user and dg.day_key = p_day
  ),
  amounts as (
    select ev.target_id, e.day_key, sum(ev.amount) as amount
    from zanryo.entry_values ev
    join zanryo.entries e on e.id = ev.entry_id
    where e.user_id = p_user and e.deleted_at is null
      and e.day_key between zanryo.period_start(p_day, 'month') - 6 and p_day
    group by ev.target_id, e.day_key
  ),
  u as (
    select g.target_id,
           coalesce(sum(a.amount) filter (where a.day_key between g.ps and p_day), 0) as used,
           coalesce(sum(a.amount) filter (where a.day_key = p_day), 0) as day_used
    from g left join amounts a on a.target_id = g.target_id
    group by g.target_id
  )
  select
    t.id,
    t.key,
    t.name,
    t.unit,
    g.kind,
    t.sort,
    g.daily_goal,
    u.used,
    g.daily_goal - u.used,
    case
      when g.kind = 'reach' then case when g.daily_goal - u.used <= 0 then 'done' else 'ok' end
      else case when g.daily_goal - u.used < 0 then 'over' else 'ok' end
    end,
    g.period,
    g.ps,
    g.pe,
    u.day_used
  from g
  join zanryo.targets t on t.id = g.target_id
  join u on u.target_id = g.target_id
  order by t.sort, t.created_at;
end
$$;

create function zanryo.daily_summary(p_day date default null)
returns table (
  target_id uuid,
  key text,
  name text,
  unit text,
  kind text,
  sort int,
  goal numeric,
  used numeric,
  remaining numeric,
  state text,
  period text,
  period_start date,
  period_end date,
  day_used numeric
)
language sql
security definer
set search_path = ''
as $$
  select * from zanryo_private.daily_summary(zanryo_private.require_uid(), coalesce(p_day, zanryo.today_key()))
$$;

-- ---------------------------------------------------------------------------
-- 今月の節約：週・月の目標は1日あたりに割った額で数える（§3.3 の式はそのまま）
-- ---------------------------------------------------------------------------

create or replace function zanryo_private.month_saving(p_user uuid, p_today date)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_money uuid;
  v_result numeric;
begin
  select t.id into v_money from zanryo.targets t where t.user_id = p_user and t.key = 'money';
  if v_money is null then
    return null;
  end if;

  perform zanryo_private.ensure_day_goals(p_user, p_today);

  with days as (
    select d::date as day
    from generate_series(date_trunc('month', p_today::timestamp), p_today::timestamp, interval '1 day') d
  ),
  counted as (
    select day from days
    where day = p_today or zanryo_private.is_confirmed_day(p_user, day)
  ),
  per_day as (
    select
      c.day,
      coalesce(
        (select zanryo.daily_equivalent(g.daily_goal, g.period, c.day) from zanryo.day_goals g
          where g.user_id = p_user and g.day_key = c.day and g.target_id = v_money),
        (select zanryo.daily_equivalent(t.daily_goal, t.period, c.day) from zanryo.targets t where t.id = v_money)
      ) as goal,
      coalesce(
        (select sum(ev.amount) from zanryo.entry_values ev
          join zanryo.entries e on e.id = ev.entry_id
          where e.user_id = p_user and e.day_key = c.day and e.deleted_at is null
            and ev.target_id = v_money),
        0
      ) as used
    from counted c
  )
  select coalesce(sum(goal - used), 0) into v_result from per_day;

  return v_result;
end
$$;

-- ---------------------------------------------------------------------------
-- 週・月の画面用：日ごとの使った量と目標（§ v1 期間の表示）
-- ---------------------------------------------------------------------------

-- p_from〜p_to（今日まで、62日まで）の各日・各ターゲットについて：
--   goal は期間あたりの目標、daily_goal は1日あたりに割った目標、used はその日だけの量、
--   confirmed はその日が確定済み（記録あり or 記録なしで確定）か。
-- その日の目標のスナップショットがあればそれを、なければ今のターゲット（使っているもの）を使う。
create or replace function zanryo_private.range_summary(p_user uuid, p_from date, p_to date)
returns table (
  day_key date,
  target_id uuid,
  key text,
  name text,
  unit text,
  kind text,
  sort int,
  period text,
  goal numeric,
  daily_goal numeric,
  used numeric,
  confirmed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select d::date as day
    from generate_series(p_from::timestamp, least(p_to, zanryo.today_key())::timestamp, interval '1 day') d
  ),
  goals as (
    select d.day, g.target_id, g.daily_goal as goal, g.kind, g.period
    from days d
    join zanryo.day_goals g on g.user_id = p_user and g.day_key = d.day
    union all
    select d.day, t.id, t.daily_goal, t.kind, t.period
    from days d
    join zanryo.targets t on t.user_id = p_user and t.active
    where not exists (select 1 from zanryo.day_goals g where g.user_id = p_user and g.day_key = d.day)
  ),
  amounts as (
    select e.day_key, ev.target_id, sum(ev.amount) as amount
    from zanryo.entries e
    join zanryo.entry_values ev on ev.entry_id = e.id
    where e.user_id = p_user and e.deleted_at is null and e.day_key between p_from and p_to
    group by e.day_key, ev.target_id
  ),
  confirmed as (
    select d.day, zanryo_private.is_confirmed_day(p_user, d.day) as ok from days d
  )
  select
    go.day, t.id, t.key, t.name, t.unit, go.kind, t.sort, go.period, go.goal,
    zanryo.daily_equivalent(go.goal, go.period, go.day),
    coalesce(a.amount, 0),
    c.ok
  from goals go
  join zanryo.targets t on t.id = go.target_id
  join confirmed c on c.day = go.day
  left join amounts a on a.day_key = go.day and a.target_id = go.target_id
  order by go.day, t.sort, t.created_at
$$;

create function zanryo.range_summary(p_from date, p_to date)
returns table (
  day_key date,
  target_id uuid,
  key text,
  name text,
  unit text,
  kind text,
  sort int,
  period text,
  goal numeric,
  daily_goal numeric,
  used numeric,
  confirmed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := zanryo_private.require_uid();
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 61 then
    raise exception '期間は62日までです' using errcode = '22023';
  end if;
  return query select * from zanryo_private.range_summary(v_user, p_from, p_to);
end
$$;

-- ---------------------------------------------------------------------------
-- ウィジェット：期間の情報も返す
-- ---------------------------------------------------------------------------

create or replace function zanryo.widget_summary_by_token(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_today date := zanryo.today_key();
  v_items jsonb;
  v_updated timestamptz;
begin
  if p_token is null or length(p_token) < 20 then
    return null;
  end if;

  update zanryo_private.widget_tokens w set last_used_at = now()
  where w.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  returning w.user_id into v_user;
  if v_user is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', s.key, 'name', s.name, 'unit', s.unit, 'kind', s.kind,
           'goal', s.goal, 'used', s.used, 'remaining', s.remaining, 'state', s.state,
           'period', s.period, 'day_used', s.day_used)
         order by s.sort), '[]'::jsonb)
  into v_items
  from zanryo_private.daily_summary(v_user, v_today) s;

  select max(greatest(e.updated_at, e.created_at)) into v_updated
  from zanryo.entries e where e.user_id = v_user and e.day_key = v_today;

  return jsonb_build_object(
    'day_key', v_today,
    'updated_at', v_updated,
    'generated_at', now(),
    'items', v_items,
    'month_saving', zanryo_private.month_saving(v_user, v_today)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 実行権限
-- ---------------------------------------------------------------------------

revoke all on function
  zanryo_private.daily_summary(uuid, date),
  zanryo_private.range_summary(uuid, date, date)
from public, anon, authenticated;

revoke all on function
  zanryo.daily_summary(date),
  zanryo.range_summary(date, date),
  zanryo.period_start(date, text),
  zanryo.period_end(date, text),
  zanryo.daily_equivalent(numeric, text, date)
from public, anon;

grant execute on function
  zanryo.daily_summary(date),
  zanryo.range_summary(date, date),
  zanryo.period_start(date, text),
  zanryo.period_end(date, text),
  zanryo.daily_equivalent(numeric, text, date)
to authenticated, service_role;
