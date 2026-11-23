-- 残量アプリ（zanryo）v0: スキーマ・RLS・集計関数
-- 仕様: docs/CLAUDE_CODE_INSTRUCTIONS.md §3, §4, §7
--
-- このアプリは shiori と同じ Supabase プロジェクトに同居する。混ざらないように：
-- - このアプリのものは、すべて2つのスキーマの中だけに作る（public には何も作らない）。
--     zanryo          … テーブルと、アプリから呼ぶRPC（Data API の Exposed schemas に追加する）
--     zanryo_private  … 内部用の関数・トークン・利用者リスト（Data API には公開しない）
-- - 使えるのは zanryo_private.members に登録したユーザーだけ。
--   ログイン（auth.users）は shiori と共通だが、shiori のユーザーはこのアプリのデータに触れない。
-- - 消すときは 99_uninstall.sql（2つのスキーマを消すだけ。shiori には影響しない）。
--
-- 方針
-- - テーブルはすべて user_id を持ち、RLSで本人の行だけを読み書きできる。
-- - 日の区切りは zanryo.day_key_of()（JST 4:00）。src/lib/dayKey.ts と同じ結果になる。
-- - day_goals / day_status は書き込みをRPC（security definer）経由に限定し、クライアントからは読むだけ。

-- 二重に実行しないための確認（実行済みなら、何も変えずにここで止まる）
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'zanryo') then
    raise exception '01_schema.sql はすでに実行済みです。もう一度流す必要はありません（何も変更していません）。';
  end if;
end
$$;

create schema zanryo;
create schema zanryo_private;
comment on schema zanryo is '残量アプリ（selflog リポジトリ）。shiori とは無関係';
comment on schema zanryo_private is '残量アプリの内部用（Data API に公開しない）';
revoke all on schema zanryo, zanryo_private from public;

-- ---------------------------------------------------------------------------
-- 利用者（このアプリを使えるユーザー）
-- ---------------------------------------------------------------------------

create table zanryo_private.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table zanryo_private.members enable row level security;

-- ログイン中のユーザーが利用者なら、そのIDを返す（違えば null）。RLSの条件に使う
create or replace function zanryo_private.member_uid()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id from zanryo_private.members m where m.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 日の区切り
-- ---------------------------------------------------------------------------

create or replace function zanryo.day_key_of(ts timestamptz)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$
  select ((ts at time zone 'Asia/Tokyo') - interval '4 hours')::date
$$;

create or replace function zanryo.today_key()
returns date
language sql
stable
set search_path = ''
as $$
  select zanryo.day_key_of(now())
$$;

-- 記録・編集できる日（今日を含めて直近31日。未来は不可）。§3.5
create or replace function zanryo_private.assert_recordable_day(p_day date)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := zanryo.today_key();
begin
  if p_day is null then
    raise exception 'day_key is required' using errcode = '22004';
  end if;
  if p_day > v_today then
    raise exception '未来の日には記録できません (%).', p_day using errcode = '22023';
  end if;
  if p_day < v_today - 30 then
    raise exception '記録・編集できるのは直近31日までです (%).', p_day using errcode = '22023';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------------

create table zanryo.targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- アプリの機能から参照する固定キー（kcal / p / f / c / money）。
  -- Geminiの推定値の割り当て先や「節約」の計算対象を見つけるのに使う。利用者が追加したターゲットは null。
  key text check (key in ('kcal', 'p', 'f', 'c', 'money')),
  name text not null check (length(name) between 1 and 40),
  unit text not null default '' check (length(unit) <= 10),
  kind text not null check (kind in ('reach', 'cap')),
  daily_goal numeric not null check (daily_goal >= 0),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);
create index targets_user_sort on zanryo.targets (user_id, sort);

create table zanryo.presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (length(label) between 1 and 60),
  sort int not null default 0,
  -- { "<target_id>": amount }（仕様の presets.values。values はSQLの予約語なので amounts とした）
  amounts jsonb not null default '{}'::jsonb check (jsonb_typeof(amounts) = 'object'),
  created_at timestamptz not null default now()
);
create index presets_user_sort on zanryo.presets (user_id, sort);

create table zanryo.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recorded_at timestamptz not null default now(),
  -- 省略時は recorded_at から計算する。過去の日に記録するときは記録先の日を入れる（§4）
  day_key date not null,
  label text not null default '' check (length(label) <= 80),
  source text not null check (source in ('preset', 'photo', 'label', 'manual')),
  preset_id uuid references zanryo.presets (id) on delete set null,
  deleted_at timestamptz, -- 取り消しは論理削除
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index entries_user_day on zanryo.entries (user_id, day_key) where deleted_at is null;

create table zanryo.entry_values (
  entry_id uuid not null references zanryo.entries (id) on delete cascade,
  target_id uuid not null references zanryo.targets (id) on delete restrict,
  -- RLSを単純にするため、仕様に加えて user_id も持たせる
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount numeric not null check (amount >= 0),
  primary key (entry_id, target_id)
);
create index entry_values_target on zanryo.entry_values (target_id);

-- 日ごとの目標値スナップショット（目標を変えても過去の日に影響させない。§3.2）
create table zanryo.day_goals (
  user_id uuid not null references auth.users (id) on delete cascade,
  day_key date not null,
  target_id uuid not null references zanryo.targets (id) on delete restrict,
  daily_goal numeric not null,
  kind text not null check (kind in ('reach', 'cap')),
  primary key (user_id, day_key, target_id)
);

-- 日ごとの確定状態（§3.5）
create table zanryo.day_status (
  user_id uuid not null references auth.users (id) on delete cascade,
  day_key date not null,
  confirmed_empty boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, day_key)
);

-- ウィジェット用トークン（ハッシュだけを保存。§7）
create table zanryo_private.widget_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table zanryo.targets enable row level security;
alter table zanryo.presets enable row level security;
alter table zanryo.entries enable row level security;
alter table zanryo.entry_values enable row level security;
alter table zanryo.day_goals enable row level security;
alter table zanryo.day_status enable row level security;
alter table zanryo_private.widget_tokens enable row level security;

create policy targets_own on zanryo.targets
  for all to authenticated
  using (user_id = (select zanryo_private.member_uid()))
  with check (user_id = (select zanryo_private.member_uid()));

create policy presets_own on zanryo.presets
  for all to authenticated
  using (user_id = (select zanryo_private.member_uid()))
  with check (user_id = (select zanryo_private.member_uid()));

-- entries は論理削除なので DELETE は許可しない
create policy entries_select on zanryo.entries
  for select to authenticated
  using (user_id = (select zanryo_private.member_uid()));
create policy entries_insert on zanryo.entries
  for insert to authenticated
  with check (
    user_id = (select zanryo_private.member_uid())
    and (preset_id is null or exists (
      select 1 from zanryo.presets p where p.id = preset_id and p.user_id = (select zanryo_private.member_uid())))
  );
create policy entries_update on zanryo.entries
  for update to authenticated
  using (user_id = (select zanryo_private.member_uid()))
  with check (user_id = (select zanryo_private.member_uid()));

create policy entry_values_own on zanryo.entry_values
  for all to authenticated
  using (user_id = (select zanryo_private.member_uid()))
  with check (
    user_id = (select zanryo_private.member_uid())
    and exists (select 1 from zanryo.entries e where e.id = entry_id and e.user_id = (select zanryo_private.member_uid()))
    and exists (select 1 from zanryo.targets t where t.id = target_id and t.user_id = (select zanryo_private.member_uid()))
  );

-- day_goals / day_status はRPC経由でだけ書き込む
create policy day_goals_select on zanryo.day_goals
  for select to authenticated
  using (user_id = (select zanryo_private.member_uid()));
create policy day_status_select on zanryo.day_status
  for select to authenticated
  using (user_id = (select zanryo_private.member_uid()));

-- 権限（GRANT）はファイルの最後にまとめてある

-- ---------------------------------------------------------------------------
-- 内部関数
-- ---------------------------------------------------------------------------

-- その日の目標値スナップショットを作る（無ければ。既にある行は変えない）
create or replace function zanryo_private.ensure_day_goals(p_user uuid, p_day date)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into zanryo.day_goals (user_id, day_key, target_id, daily_goal, kind)
  select t.user_id, p_day, t.id, t.daily_goal, t.kind
  from zanryo.targets t
  where t.user_id = p_user and t.active
  on conflict do nothing
$$;

-- 確定済みの日か（有効な記録が1件以上 or 記録なしで確定）
create or replace function zanryo_private.is_confirmed_day(p_user uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from zanryo.entries e
      where e.user_id = p_user and e.day_key = p_day and e.deleted_at is null)
    or exists (
      select 1 from zanryo.day_status s
      where s.user_id = p_user and s.day_key = p_day and s.confirmed_empty)
$$;

create or replace function zanryo_private.daily_summary(p_user uuid, p_day date)
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
  state text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform zanryo_private.ensure_day_goals(p_user, p_day);
  return query
  with used as (
    select ev.target_id, sum(ev.amount) as used
    from zanryo.entry_values ev
    join zanryo.entries e on e.id = ev.entry_id
    where e.user_id = p_user and e.day_key = p_day and e.deleted_at is null
    group by ev.target_id
  )
  select
    t.id,
    t.key,
    t.name,
    t.unit,
    g.kind,
    t.sort,
    g.daily_goal,
    coalesce(u.used, 0),
    g.daily_goal - coalesce(u.used, 0),
    case
      when g.kind = 'reach' then case when g.daily_goal - coalesce(u.used, 0) <= 0 then 'done' else 'ok' end
      else case when g.daily_goal - coalesce(u.used, 0) < 0 then 'over' else 'ok' end
    end
  from zanryo.day_goals g
  join zanryo.targets t on t.id = g.target_id
  left join used u on u.target_id = g.target_id
  where g.user_id = p_user and g.day_key = p_day
  order by t.sort, t.created_at;
end
$$;

-- 今月の節約（見込み）。§3.3
-- = 今月の各日の (その日の目標 − その日に使った額) の合計。
--   含めるのは確定済みの日と、見込みとしての当日（p_today）だけ。未確定の過去日は含めない。
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
        (select g.daily_goal from zanryo.day_goals g
          where g.user_id = p_user and g.day_key = c.day and g.target_id = v_money),
        (select t.daily_goal from zanryo.targets t where t.id = v_money)
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

-- 記録漏れの日（直近7日のうち今日を除く、確定済みでない日）。§3.5
-- 使い始める前の日（最初のターゲットを作った日より前）は対象にしない。
create or replace function zanryo_private.missing_days(p_user uuid, p_today date)
returns setof date
language sql
stable
security definer
set search_path = ''
as $$
  select d::date
  from generate_series((p_today - 7)::timestamp, (p_today - 1)::timestamp, interval '1 day') d
  where d::date >= coalesce(
      (select min(zanryo.day_key_of(t.created_at)) from zanryo.targets t where t.user_id = p_user),
      p_today)
    and not zanryo_private.is_confirmed_day(p_user, d::date)
  order by 1
$$;

-- ---------------------------------------------------------------------------
-- トリガー
-- ---------------------------------------------------------------------------

create or replace function zanryo_private.entries_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.day_key is null then
      new.day_key := zanryo.day_key_of(new.recorded_at);
    end if;
    perform zanryo_private.assert_recordable_day(new.day_key);
  else
    if new.user_id <> old.user_id then
      raise exception 'user_id cannot be changed';
    end if;
    -- 編集・削除・取り消しも直近31日まで
    perform zanryo_private.assert_recordable_day(old.day_key);
    if new.day_key is distinct from old.day_key then
      perform zanryo_private.assert_recordable_day(new.day_key);
    end if;
    new.updated_at := now();
  end if;
  return new;
end
$$;

create trigger entries_before_write
  before insert or update on zanryo.entries
  for each row execute function zanryo_private.entries_before_write();

create or replace function zanryo_private.entries_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform zanryo_private.ensure_day_goals(new.user_id, new.day_key);
  return null;
end
$$;

create trigger entries_after_write
  after insert or update of day_key on zanryo.entries
  for each row execute function zanryo_private.entries_after_write();

-- 記録の値を直すときも、その記録の日が直近31日以内であること
create or replace function zanryo_private.entry_values_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date;
begin
  select e.day_key into v_day from zanryo.entries e
  where e.id = coalesce(new.entry_id, old.entry_id);
  if v_day is not null then
    perform zanryo_private.assert_recordable_day(v_day);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger entry_values_before_write
  before insert or update or delete on zanryo.entry_values
  for each row execute function zanryo_private.entry_values_before_write();

-- ターゲットを変えたら「今日」のスナップショットだけ追従させる（過去の日は変えない）
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
    insert into zanryo.day_goals (user_id, day_key, target_id, daily_goal, kind)
    values (new.user_id, v_today, new.id, new.daily_goal, new.kind)
    on conflict (user_id, day_key, target_id)
      do update set daily_goal = excluded.daily_goal, kind = excluded.kind;
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

create trigger targets_after_write
  after insert or update of daily_goal, kind, active on zanryo.targets
  for each row execute function zanryo_private.targets_after_write();

-- ---------------------------------------------------------------------------
-- 公開RPC（認証ユーザー用）
-- ---------------------------------------------------------------------------

create or replace function zanryo_private.require_uid()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if zanryo_private.member_uid() is null then
    raise exception 'このアプリの利用者として登録されていません' using errcode = '42501';
  end if;
  return v;
end
$$;

-- 初回ログイン時に呼ぶ。ターゲットが1件も無ければ既定の5つを作る（§3.2）
create or replace function zanryo.bootstrap()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := zanryo_private.require_uid();
begin
  if exists (select 1 from zanryo.targets where user_id = v_user) then
    return;
  end if;
  insert into zanryo.targets (user_id, key, name, unit, kind, daily_goal, sort) values
    (v_user, 'kcal',  'カロリー',   'kcal', 'cap',   2200, 10),
    (v_user, 'p',     'タンパク質', 'g',    'reach', 160,  20),
    (v_user, 'f',     '脂質',       'g',    'cap',   50,   30),
    (v_user, 'c',     '炭水化物',   'g',    'cap',   278,  40),
    (v_user, 'money', '使えるお金', '円',   'cap',   1000, 50);
end
$$;

create or replace function zanryo.daily_summary(p_day date default null)
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
  state text
)
language sql
security definer
set search_path = ''
as $$
  select * from zanryo_private.daily_summary(zanryo_private.require_uid(), coalesce(p_day, zanryo.today_key()))
$$;

create or replace function zanryo.month_saving(p_today date default null)
returns numeric
language sql
security definer
set search_path = ''
as $$
  select zanryo_private.month_saving(zanryo_private.require_uid(), coalesce(p_today, zanryo.today_key()))
$$;

create or replace function zanryo.missing_days()
returns setof date
language sql
security definer
set search_path = ''
as $$
  select * from zanryo_private.missing_days(zanryo_private.require_uid(), zanryo.today_key())
$$;

-- 1回の記録を、値と一緒にまとめて保存する。
-- p_id を渡すと冪等になる（オフラインのキューから再送しても二重にならない）。
-- p_values: { "<target_id>": amount }。自分のターゲット以外のキーは無視する。
create or replace function zanryo.add_entry(
  p_source text,
  p_values jsonb,
  p_label text default '',
  p_preset_id uuid default null,
  p_day_key date default null,
  p_recorded_at timestamptz default null,
  p_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := zanryo_private.require_uid();
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_at timestamptz := coalesce(p_recorded_at, now());
begin
  if v_at > now() + interval '5 minutes' then
    raise exception 'recorded_at is in the future' using errcode = '22023';
  end if;
  if p_id is not null and exists (select 1 from zanryo.entries where id = p_id) then
    return p_id; -- 再送
  end if;

  insert into zanryo.entries (id, user_id, recorded_at, day_key, label, source, preset_id)
  values (v_id, v_user, v_at, coalesce(p_day_key, zanryo.day_key_of(v_at)),
          coalesce(p_label, ''), p_source, p_preset_id);

  insert into zanryo.entry_values (entry_id, target_id, user_id, amount)
  select v_id, t.id, v_user, (kv.value)::numeric
  from jsonb_each_text(coalesce(p_values, '{}'::jsonb)) kv
  join zanryo.targets t on t.id::text = kv.key and t.user_id = v_user
  where kv.value is not null;

  return v_id;
end
$$;

-- 記録の内容を置き換える（値は全部入れ替え）
create or replace function zanryo.update_entry(
  p_id uuid,
  p_values jsonb,
  p_label text default null,
  p_day_key date default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := zanryo_private.require_uid();
begin
  update zanryo.entries
  set label = coalesce(p_label, label),
      day_key = coalesce(p_day_key, day_key)
  where id = p_id and user_id = v_user and deleted_at is null;
  if not found then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;

  delete from zanryo.entry_values where entry_id = p_id;
  insert into zanryo.entry_values (entry_id, target_id, user_id, amount)
  select p_id, t.id, v_user, (kv.value)::numeric
  from jsonb_each_text(coalesce(p_values, '{}'::jsonb)) kv
  join zanryo.targets t on t.id::text = kv.key and t.user_id = v_user
  where kv.value is not null;
end
$$;

-- 取り消し・削除（論理削除）
create or replace function zanryo.delete_entry(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update zanryo.entries set deleted_at = now()
  where id = p_id and user_id = zanryo_private.require_uid() and deleted_at is null;
end
$$;

-- 「この日は記録なしで確定」。§3.5
create or replace function zanryo.confirm_empty_day(p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := zanryo_private.require_uid();
begin
  perform zanryo_private.assert_recordable_day(p_day);
  insert into zanryo.day_status (user_id, day_key, confirmed_empty)
  values (v_user, p_day, true)
  on conflict (user_id, day_key) do update set confirmed_empty = true, updated_at = now();
  perform zanryo_private.ensure_day_goals(v_user, p_day);
end
$$;

create or replace function zanryo.unconfirm_empty_day(p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := zanryo_private.require_uid();
begin
  perform zanryo_private.assert_recordable_day(p_day);
  update zanryo.day_status set confirmed_empty = false, updated_at = now()
  where user_id = v_user and day_key = p_day;
end
$$;

-- ウィジェット用トークンを発行（再発行すると古いトークンは使えなくなる）。
-- 平文のトークンを返すのはこのときだけ。DBにはSHA-256のハッシュだけを残す。
create or replace function zanryo.issue_widget_token()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := zanryo_private.require_uid();
  -- gen_random_uuid() は暗号論的乱数（v4: 122bit）。2つ連ねて244bit。
  v_token text := 'zr_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  insert into zanryo_private.widget_tokens (user_id, token_hash, created_at, last_used_at)
  values (v_user, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now(), null)
  on conflict (user_id) do update
    set token_hash = excluded.token_hash, created_at = excluded.created_at, last_used_at = null;
  return v_token;
end
$$;

create or replace function zanryo.widget_token_status()
returns table (issued_at timestamptz, last_used_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select w.created_at, w.last_used_at from zanryo_private.widget_tokens w
  where w.user_id = zanryo_private.require_uid()
$$;

create or replace function zanryo.revoke_widget_token()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from zanryo_private.widget_tokens where user_id = zanryo_private.require_uid()
$$;

-- ---------------------------------------------------------------------------
-- ウィジェット用（Edge Function widget-summary から service_role で呼ぶ）
-- ---------------------------------------------------------------------------

-- トークンが正しければ今日の残量を返す。正しくなければ null。§7
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
           'goal', s.goal, 'used', s.used, 'remaining', s.remaining, 'state', s.state)
         order by s.sort), '[]'::jsonb)
  into v_items
  from zanryo_private.daily_summary(v_user, v_today) s;

  select max(greatest(e.updated_at, e.created_at)) into v_updated
  from zanryo.entries e where e.user_id = v_user and e.day_key = v_today;

  return jsonb_build_object(
    'day_key', v_today,
    'updated_at', v_updated,       -- 今日の記録が最後に変わった時刻（記録が無ければ null）
    'generated_at', now(),
    'items', v_items,
    'month_saving', zanryo_private.month_saving(v_user, v_today)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 実行権限
-- ---------------------------------------------------------------------------

-- zanryo スキーマ：ログインした利用者だけが使う（anon には何も許可しない）。
-- Supabase は public 以外のスキーマには既定の権限を付けないので、ここで明示する。
grant usage on schema zanryo to authenticated, service_role;
grant select, insert, update on zanryo.targets, zanryo.presets, zanryo.entries to authenticated;
grant delete on zanryo.targets, zanryo.presets to authenticated;
grant select, insert, update, delete on zanryo.entry_values to authenticated;
grant select on zanryo.day_goals, zanryo.day_status to authenticated;
grant all on all tables in schema zanryo to service_role;

-- zanryo_private スキーマ：Data API に公開しないので、外から直接は呼べない。
revoke all on all functions in schema zanryo_private from public, anon, authenticated;
grant usage on schema zanryo_private to authenticated, service_role;
-- RLSの条件と、security invoker の記録系RPC（RLSを効かせるため invoker にしている）から呼ぶ検査関数だけ許可する。
grant execute on function
  zanryo_private.member_uid(),
  zanryo_private.require_uid(),
  zanryo_private.assert_recordable_day(date)
to authenticated;

revoke all on function zanryo.day_key_of(timestamptz), zanryo.today_key() from public;
grant execute on function zanryo.day_key_of(timestamptz), zanryo.today_key() to authenticated, service_role;

revoke execute on function
  zanryo.bootstrap(),
  zanryo.daily_summary(date),
  zanryo.month_saving(date),
  zanryo.missing_days(),
  zanryo.add_entry(text, jsonb, text, uuid, date, timestamptz, uuid),
  zanryo.update_entry(uuid, jsonb, text, date),
  zanryo.delete_entry(uuid),
  zanryo.confirm_empty_day(date),
  zanryo.unconfirm_empty_day(date),
  zanryo.issue_widget_token(),
  zanryo.widget_token_status(),
  zanryo.revoke_widget_token(),
  zanryo.widget_summary_by_token(text)
from public, anon;

grant execute on function
  zanryo.bootstrap(),
  zanryo.daily_summary(date),
  zanryo.month_saving(date),
  zanryo.missing_days(),
  zanryo.add_entry(text, jsonb, text, uuid, date, timestamptz, uuid),
  zanryo.update_entry(uuid, jsonb, text, date),
  zanryo.delete_entry(uuid),
  zanryo.confirm_empty_day(date),
  zanryo.unconfirm_empty_day(date),
  zanryo.issue_widget_token(),
  zanryo.widget_token_status(),
  zanryo.revoke_widget_token()
to authenticated;

revoke execute on function zanryo.widget_summary_by_token(text) from authenticated;
grant execute on function zanryo.widget_summary_by_token(text) to service_role;
