import { beforeEach, describe, expect, it } from 'vitest';
import { asRole, asUser, createUser, freshDb, readSql, type Db } from './harness';

const A = '00000000-0000-0000-0000-00000000000a';
const OTHER = '00000000-0000-0000-0000-00000000005e';
let db: Db;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0];

let T: Record<string, string>;

/** 日付チェックを外して、好きな日に記録を入れる（テスト用） */
async function put(day: string, values: Record<string, number>) {
  await q('alter table zanryo.entries disable trigger entries_before_write');
  await q('alter table zanryo.entry_values disable trigger entry_values_before_write');
  const e = await one<{ id: string }>(`insert into zanryo.entries (user_id, day_key, source) values ($1, $2, 'manual') returning id`, [A, day]);
  for (const [k, v] of Object.entries(values)) {
    await q('insert into zanryo.entry_values (entry_id, target_id, user_id, amount) values ($1, $2, $3, $4)', [e!.id, T[k], A, v]);
  }
  await q('alter table zanryo.entries enable trigger entries_before_write');
  await q('alter table zanryo.entry_values enable trigger entry_values_before_write');
}

type Row = { key: string; goal: string; used: string; remaining: string; state: string; period: string; period_start: string; period_end: string; day_used: string };
const summary = async (day: string) =>
  Object.fromEntries(
    (await q<Row>(
      `select key, goal::text, used::text, remaining::text, state, period, period_start::text, period_end::text, day_used::text
         from zanryo_private.daily_summary($1, $2::date)`,
      [A, day],
    )).map((r) => [r.key, r]),
  );

beforeEach(async () => {
  db = await freshDb();
  await createUser(db, A);
  await createUser(db, OTHER, { member: false });
  await asUser(db, A, () => q('select zanryo.bootstrap()'));
  T = Object.fromEntries((await q<{ key: string; id: string }>('select key, id from zanryo.targets where user_id = $1', [A])).map((r) => [r.key, r.id]));
});

describe('期間の計算', () => {
  it('週は月曜はじまり、月は1日はじまり。1日あたりの目標', async () => {
    const r = await one<Record<string, string>>(`select
      zanryo.period_start('2026-11-25', 'week')::text ws, zanryo.period_end('2026-11-25', 'week')::text we,
      zanryo.period_start('2026-11-23', 'week')::text ws_mon, zanryo.period_start('2026-11-29', 'week')::text ws_sun,
      zanryo.period_start('2026-11-25', 'month')::text ms, zanryo.period_end('2026-11-25', 'month')::text me,
      zanryo.period_end('2028-02-10', 'month')::text feb,
      zanryo.daily_equivalent(7000, 'week', '2026-11-25')::text w_eq,
      round(zanryo.daily_equivalent(30000, 'month', '2026-11-25'), 2)::text m_eq,
      zanryo.daily_equivalent(1000, 'day', '2026-11-25')::text d_eq`);
    expect(r).toEqual({
      ws: '2026-11-23', we: '2026-11-29', ws_mon: '2026-11-23', ws_sun: '2026-11-23',
      ms: '2026-11-01', me: '2026-11-30', feb: '2028-02-29',
      w_eq: '1000.0000000000000000', m_eq: '1000.00', d_eq: '1000',
    });
  });
});

describe('週・月の目標の残量', () => {
  it('お金を1週間7,000円にすると、その週の合計で減り、月曜に戻る', async () => {
    await q(`update zanryo.targets set period = 'week', daily_goal = 7000 where id = $1`, [T.money]);
    await put('2026-11-23', { money: 800 }); // 月
    await put('2026-11-25', { money: 1500 }); // 水
    await put('2026-11-30', { money: 200 }); // 次の月曜
    const wed = (await summary('2026-11-25')).money;
    expect(wed).toMatchObject({ goal: '7000', used: '2300', remaining: '4700', state: 'ok', period: 'week', period_start: '2026-11-23', period_end: '2026-11-29', day_used: '1500' });
    // 過去の日を見たときは、その日の時点の値
    expect((await summary('2026-11-24')).money).toMatchObject({ used: '800', day_used: '0' });
    // 次の週は戻る
    expect((await summary('2026-11-30')).money).toMatchObject({ used: '200', remaining: '6800', period_start: '2026-11-30' });
  });

  it('月の目標は1日からの合計。週をまたいでも続く', async () => {
    await q(`update zanryo.targets set period = 'month', daily_goal = 9000 where id = $1`, [T.c]);
    await put('2026-10-31', { c: 999 }); // 先月は入らない
    await put('2026-11-01', { c: 3000 });
    await put('2026-11-15', { c: 7000 });
    expect((await summary('2026-11-15')).c).toMatchObject({ used: '10000', remaining: '-1000', state: 'over', period: 'month', period_start: '2026-11-01', period_end: '2026-11-30' });
  });

  it('日の目標は今までどおり（その日の合計）', async () => {
    await put('2026-11-24', { kcal: 500 });
    await put('2026-11-25', { kcal: 700 });
    expect((await summary('2026-11-25')).kcal).toMatchObject({ goal: '2200', used: '700', remaining: '1500', period: 'day', day_used: '700' });
  });

  it('期間を変えても、すでにある日のスナップショットは変わらない', async () => {
    await summary('2026-11-20'); // 11/20 のスナップショット（日・1000円）を作る
    await q(`update zanryo.targets set period = 'week', daily_goal = 7000 where id = $1`, [T.money]);
    expect((await summary('2026-11-20')).money).toMatchObject({ goal: '1000', period: 'day' });
    expect((await summary('2026-11-21')).money).toMatchObject({ goal: '7000', period: 'week' });
  });

  it('期間を変えると、今日のスナップショットにも反映される', async () => {
    await asUser(db, A, () => q('select * from zanryo.daily_summary()'));
    await asUser(db, A, () => q(`update zanryo.targets set period = 'week', daily_goal = 7000 where key = 'money'`));
    const rows = await asUser(db, A, () => q<{ key: string; period: string; goal: string }>(`select key, period, goal::text from zanryo.daily_summary() where key = 'money'`));
    expect(rows[0]).toEqual({ key: 'money', period: 'week', goal: '7000' });
  });
});

describe('今月の節約（週の目標は1日あたりに割る）', () => {
  it('1週間7,000円なら、確定した日ごとに1,000円ずつ', async () => {
    await q(`update zanryo.targets set period = 'week', daily_goal = 7000 where id = $1`, [T.money]);
    await put('2026-11-02', { money: 400 }); // +600
    await put('2026-11-03', { money: 1300 }); // -300
    await put('2026-11-05', { money: 0, kcal: 100 }); // +1000
    const s = await one<{ s: string }>(`select round(zanryo_private.month_saving($1, '2026-11-05'::date))::text s`, [A]);
    expect(s!.s).toBe(String(600 - 300 + 1000));
  });
});

describe('range_summary（週・月の画面用）', () => {
  it('日ごと・ターゲットごとの量、1日あたりの目標、確定済みか', async () => {
    await q(`update zanryo.targets set period = 'week', daily_goal = 7000 where id = $1`, [T.money]);
    await put('2026-11-02', { kcal: 2000, money: 800 });
    await q(`insert into zanryo.day_status values ($1, '2026-11-04', true)`, [A]);
    const rows = await q<{ day_key: string; key: string; used: string; daily_goal: string; goal: string; confirmed: boolean; period: string }>(
      `select day_key::text, key, used::text, round(daily_goal)::text as daily_goal, goal::text, confirmed, period
         from zanryo_private.range_summary($1, '2026-11-02', '2026-11-08')`,
      [A],
    );
    const days = [...new Set(rows.map((r) => r.day_key))];
    expect(days).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    const mon = rows.filter((r) => r.day_key === '2026-11-02');
    expect(mon.find((r) => r.key === 'kcal')).toMatchObject({ used: '2000', daily_goal: '2200', confirmed: true });
    expect(mon.find((r) => r.key === 'money')).toMatchObject({ used: '800', goal: '7000', daily_goal: '1000', period: 'week' });
    expect(rows.find((r) => r.day_key === '2026-11-03')).toMatchObject({ used: '0', confirmed: false });
    expect(rows.find((r) => r.day_key === '2026-11-04')).toMatchObject({ confirmed: true });
  });

  it('今日より先の日は返さない。62日を超える範囲や、利用者でない人は断る', async () => {
    const today = (await one<{ d: string }>('select zanryo.today_key()::text d'))!.d;
    const rows = await asUser(db, A, () =>
      q<{ day_key: string }>(`select distinct day_key::text from zanryo.range_summary($1::date - 2, $1::date + 5)`, [today]),
    );
    expect(rows.map((r) => r.day_key).sort().at(-1)).toBe(today);
    await expect(asUser(db, A, () => q(`select * from zanryo.range_summary('2026-01-01', '2026-06-01')`))).rejects.toThrow(/62日/);
    await expect(asUser(db, OTHER, () => q(`select * from zanryo.range_summary('2026-11-01', '2026-11-07')`))).rejects.toThrow(/利用者として登録されていません/);
    await expect(asRole(db, 'anon', () => q(`select * from zanryo.range_summary('2026-11-01', '2026-11-07')`))).rejects.toThrow(/permission denied/);
  });
});

describe('ウィジェット', () => {
  it('期間と今日の量も返す', async () => {
    await q(`update zanryo.targets set period = 'week', daily_goal = 7000 where id = $1`, [T.money]);
    const tok = (await asUser(db, A, () => one<{ t: string }>('select zanryo.issue_widget_token() t')))!.t;
    const j = await asRole(db, 'service_role', async () => (await one<{ j: any }>('select zanryo.widget_summary_by_token($1) j', [tok]))!.j);
    expect(j.items.find((i: any) => i.key === 'money')).toMatchObject({ period: 'week', goal: 7000, day_used: 0 });
    expect(j.items.find((i: any) => i.key === 'kcal')).toMatchObject({ period: 'day' });
  });
});

describe('05_periods.sql', () => {
  it('二重に流すと止まる', async () => {
    await expect(db.exec(readSql('05_periods.sql'))).rejects.toThrow(/すでに実行済みです/);
  });
});
