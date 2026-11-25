-- 残量アプリ（zanryo）: 平日と休日で目標を分ける（v1.1）
-- 05_periods.sql の後に1回だけ流す。
--
-- - ターゲットごとに「休日の目標」を入れられる（空欄なら平日と同じ）。目標の期間が「1日」のものだけ。
-- - 休日は、土日と国民の祝日（振替休日・国民の休日を含む）を自動で判定する。
--   有給や休日出勤などは、日ごとに手で「休日／平日」を切り替えられる（day_status.day_off）。
-- - その日の目標（day_goals のスナップショット）は、その日が休日なら休日の目標になる。
--   スナップショットに平日・休日の両方の目標も残すので、あとで休日／平日を切り替えてもその日の目標を作り直せる。
-- - 週・月の画面（range_summary）は、まだ来ていない日も、その日の目標（休日なら休日の目標）を返す
--   （週・月の目標の合計を「その期間の日ごとの目標の合計」にするため）。

-- 二重に実行しないための確認（実行済みなら、何も変えずにここで止まる）
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'zanryo' and table_name = 'targets' and column_name = 'holiday_goal'
  ) then
    raise exception '06_holidays.sql はすでに実行済みです。もう一度流す必要はありません（何も変更していません）。';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'zanryo' and table_name = 'targets' and column_name = 'period'
  ) then
    raise exception '先に 05_periods.sql を流してください（何も変更していません）。';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 列
-- ---------------------------------------------------------------------------

alter table zanryo.targets
  add column holiday_goal numeric check (holiday_goal >= 0);
comment on column zanryo.targets.holiday_goal is '休日の目標（null なら平日と同じ）。目標の期間が day のときだけ使う';

-- スナップショット：daily_goal はその日に使う目標。base_goal / holiday_goal はその日の時点の平日・休日の目標
alter table zanryo.day_goals
  add column base_goal numeric,
  add column holiday_goal numeric;
update zanryo.day_goals set base_goal = daily_goal where base_goal is null;

-- 日ごとの手動の切り替え：true＝休日、false＝平日、null＝自動（土日祝）
alter table zanryo.day_status
  add column day_off boolean;

-- ---------------------------------------------------------------------------
-- 祝日（2020年以降の祝日法。春分・秋分は 1980〜2099 年の近似式）
-- ---------------------------------------------------------------------------

-- 振替休日・国民の休日を除いた祝日の名前（祝日でなければ null）
create or replace function zanryo_private.jp_base_holiday(p_day date)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  y int := extract(year from p_day)::int;
  m int := extract(month from p_day)::int;
  d int := extract(day from p_day)::int;
  mon boolean := extract(isodow from p_day)::int = 1;
  nth int := (extract(day from p_day)::int - 1) / 7 + 1; -- その月の何回目のその曜日か
  shunbun int := floor(20.8431 + 0.242194 * (y - 1980) - floor((y - 1980) / 4.0))::int;
  shubun int := floor(23.2488 + 0.242194 * (y - 1980) - floor((y - 1980) / 4.0))::int;
begin
  if m = 1 and d = 1 then return '元日'; end if;
  if m = 1 and mon and nth = 2 then return '成人の日'; end if;
  if m = 2 and d = 11 then return '建国記念の日'; end if;
  if m = 2 and d = 23 and y >= 2020 then return '天皇誕生日'; end if;
  if m = 3 and d = shunbun then return '春分の日'; end if;
  if m = 4 and d = 29 then return '昭和の日'; end if;
  if m = 5 and d = 3 then return '憲法記念日'; end if;
  if m = 5 and d = 4 then return 'みどりの日'; end if;
  if m = 5 and d = 5 then return 'こどもの日'; end if;
  -- 2020・2021年は東京オリンピックのため移動
  if y = 2020 then
    if m = 7 and d = 23 then return '海の日'; end if;
    if m = 7 and d = 24 then return 'スポーツの日'; end if;
    if m = 8 and d = 10 then return '山の日'; end if;
  elsif y = 2021 then
    if m = 7 and d = 22 then return '海の日'; end if;
    if m = 7 and d = 23 then return 'スポーツの日'; end if;
    if m = 8 and d = 8 then return '山の日'; end if;
  else
    if m = 7 and mon and nth = 3 then return '海の日'; end if;
    if m = 8 and d = 11 then return '山の日'; end if;
    if m = 10 and mon and nth = 2 then return 'スポーツの日'; end if;
  end if;
  if m = 9 and mon and nth = 3 then return '敬老の日'; end if;
  if m = 9 and d = shubun then return '秋分の日'; end if;
  if m = 11 and d = 3 then return '文化の日'; end if;
  if m = 11 and d = 23 then return '勤労感謝の日'; end if;
  return null;
end
$$;

-- 祝日の名前（振替休日・国民の休日を含む。祝日でなければ null）
create or replace function zanryo.jp_holiday_name(p_day date)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := zanryo_private.jp_base_holiday(p_day);
  p date;
begin
  if v is not null then
    return v;
  end if;
  -- 振替休日：日曜の祝日から祝日が続いたあとの、最初の祝日でない日
  p := p_day - 1;
  while zanryo_private.jp_base_holiday(p) is not null loop
    if extract(isodow from p)::int = 7 then
      return '振替休日';
    end if;
    p := p - 1;
  end loop;
  -- 国民の休日：前の日と次の日が祝日にはさまれた日
  if extract(isodow from p_day)::int <> 7
     and zanryo_private.jp_base_holiday(p_day - 1) is not null
     and zanryo_private.jp_base_holiday(p_day + 1) is not null then
    return '国民の休日';
  end if;
  return null;
end
$$;

-- その人にとってその日が休日か（手で切り替えた日はそれ、ほかは土日祝）
create or replace function zanryo_private.is_off_day(p_user uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.day_off from zanryo.day_status s where s.user_id = p_user and s.day_key = p_day),
    extract(isodow from p_day)::int in (6, 7) or zanryo.jp_holiday_name(p_day) is not null
  )
$$;

-- その日に使う目標（期間が1日で、休日の目標があり、その日が休日なら休日の目標）
create or replace function zanryo_private.goal_for_day(p_user uuid, p_day date, p_period text, p_base numeric, p_holiday numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_period = 'day' and p_holiday is not null and zanryo_private.is_off_day(p_user, p_day) then p_holiday
    else p_base
  end
$$;

-- ---------------------------------------------------------------------------
-- スナップショット
-- ---------------------------------------------------------------------------

create or replace function zanryo_private.ensure_day_goals(p_user uuid, p_day date)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into zanryo.day_goals (user_id, day_key, target_id, daily_goal, kind, period, base_goal, holiday_goal)
  select t.user_id, p_day, t.id,
         zanryo_private.goal_for_day(p_user, p_day, t.period, t.daily_goal, t.holiday_goal),
         t.kind, t.period, t.daily_goal,
         case when t.period = 'day' then t.holiday_goal end
  from zanryo.targets t
  where t.user_id = p_user and t.active
  on conflict do nothing
$$;

-- 休日／平日を切り替えたあと、その日の目標を作り直す（平日・休日の目標はその日の時点のまま）
create or replace function zanryo_private.refresh_day_goals(p_user uuid, p_day date)
returns void
language sql
security definer
set search_path = ''
as $$
  update zanryo.day_goals g
  set daily_goal = zanryo_private.goal_for_day(p_user, p_day, g.period, coalesce(g.base_goal, g.daily_goal), g.holiday_goal)
  where g.user_id = p_user and g.day_key = p_day
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
    insert into zanryo.day_goals (user_id, day_key, target_id, daily_goal, kind, period, base_goal, holiday_goal)
    values (
      new.user_id, v_today, new.id,
      zanryo_private.goal_for_day(new.user_id, v_today, new.period, new.daily_goal, new.holiday_goal),
      new.kind, new.period, new.daily_goal,
      case when new.period = 'day' then new.holiday_goal end)
    on conflict (user_id, day_key, target_id)
      do update set daily_goal = excluded.daily_goal, kind = excluded.kind, period = excluded.period,
                    base_goal = excluded.base_goal, holiday_goal = excluded.holiday_goal;
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
  after insert or update of daily_goal, holiday_goal, kind, active, period on zanryo.targets
  for each row execute function zanryo_private.targets_after_write();

-- ---------------------------------------------------------------------------
-- 日ごとの休日／平日（アプリから呼ぶ）
-- ---------------------------------------------------------------------------

-- p_off：true＝休日にする、false＝平日にする、null＝自動（土日祝）に戻す。記録できる日（直近31日）だけ
create or replace function zanryo.set_day_off(p_day date, p_off boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := zanryo_private.require_uid();
begin
  perform zanryo_private.assert_recordable_day(p_day);
  insert into zanryo.day_status (user_id, day_key, day_off)
  values (v_user, p_day, p_off)
  on conflict (user_id, day_key) do update set day_off = p_off, updated_at = now();
  perform zanryo_private.ensure_day_goals(v_user, p_day);
  perform zanryo_private.refresh_day_goals(v_user, p_day);
end
$$;

-- その日が休日か。auto_off は自動（土日祝）での判定、manual は手で切り替えた日か、
-- has_holiday_goals は休日の目標を入れたターゲットがあるか（無ければ画面に休日の表示を出さない）
create or replace function zanryo.day_info(p_day date)
returns table (
  off boolean,
  auto_off boolean,
  manual boolean,
  holiday_name text,
  has_holiday_goals boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := zanryo_private.require_uid();
  v_manual boolean;
begin
  select s.day_off into v_manual from zanryo.day_status s where s.user_id = v_user and s.day_key = p_day;
  return query select
    coalesce(v_manual, extract(isodow from p_day)::int in (6, 7) or zanryo.jp_holiday_name(p_day) is not null),
    extract(isodow from p_day)::int in (6, 7) or zanryo.jp_holiday_name(p_day) is not null,
    v_manual is not null,
    zanryo.jp_holiday_name(p_day),
    exists (select 1 from zanryo.targets t where t.user_id = v_user and t.active and t.period = 'day' and t.holiday_goal is not null);
end
$$;

-- ---------------------------------------------------------------------------
-- 今月の節約：スナップショットの無い日は、その日の目標（休日なら休日の目標）で数える
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
        (select zanryo.daily_equivalent(
                  zanryo_private.goal_for_day(p_user, c.day, t.period, t.daily_goal, t.holiday_goal), t.period, c.day)
           from zanryo.targets t where t.id = v_money)
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
-- 週・月の画面用（まだ来ていない日も返し、休日かどうかも返す。返す列が増えるので作り直す）
-- ---------------------------------------------------------------------------

drop function zanryo.range_summary(date, date);
drop function zanryo_private.range_summary(uuid, date, date);

-- p_from〜p_to（62日まで）の各日・各ターゲットについて：
--   goal は期間あたりの目標、daily_goal は1日あたりに割った目標、used はその日だけの量、
--   confirmed はその日が確定済みか、off はその日が休日か。
-- その日の目標のスナップショットがあればそれを、なければ今のターゲット（使っているもの）から、その日の目標を作る。
-- 今日より先の日は used = 0、confirmed = false（目標だけ使う）。
create function zanryo_private.range_summary(p_user uuid, p_from date, p_to date)
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
  confirmed boolean,
  off boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select d::date as day
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  ),
  goals as (
    select d.day, g.target_id, g.daily_goal as goal, g.kind, g.period
    from days d
    join zanryo.day_goals g on g.user_id = p_user and g.day_key = d.day
    union all
    select d.day, t.id, zanryo_private.goal_for_day(p_user, d.day, t.period, t.daily_goal, t.holiday_goal), t.kind, t.period
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
  day_flags as (
    select d.day,
           zanryo_private.is_confirmed_day(p_user, d.day) as ok,
           zanryo_private.is_off_day(p_user, d.day) as off
    from days d
  )
  select
    go.day, t.id, t.key, t.name, t.unit, go.kind, t.sort, go.period, go.goal,
    zanryo.daily_equivalent(go.goal, go.period, go.day),
    coalesce(a.amount, 0),
    f.ok,
    f.off
  from goals go
  join zanryo.targets t on t.id = go.target_id
  join day_flags f on f.day = go.day
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
  confirmed boolean,
  off boolean
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
-- 実行権限（関数は作ると誰でも実行できる状態になるので、ここで絞る）
-- ---------------------------------------------------------------------------

revoke all on function
  zanryo.jp_holiday_name(date),
  zanryo_private.jp_base_holiday(date),
  zanryo_private.is_off_day(uuid, date),
  zanryo_private.goal_for_day(uuid, date, text, numeric, numeric),
  zanryo_private.refresh_day_goals(uuid, date),
  zanryo_private.range_summary(uuid, date, date)
from public, anon, authenticated;

revoke all on function
  zanryo.set_day_off(date, boolean),
  zanryo.day_info(date),
  zanryo.range_summary(date, date)
from public, anon;

-- 祝日の判定は中で使うだけ（アプリからは day_info で知る）
grant execute on function zanryo.jp_holiday_name(date) to service_role;

grant execute on function
  zanryo.set_day_off(date, boolean),
  zanryo.day_info(date),
  zanryo.range_summary(date, date)
to authenticated, service_role;
