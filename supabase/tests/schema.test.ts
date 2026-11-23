import { beforeEach, describe, expect, it } from 'vitest';
import { asRole, asUser, createUser, freshDb, type Db } from './harness';
import { dayKeyOf } from '../../src/lib/dayKey';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

type Summary = { key: string; goal: string; used: string; remaining: string; state: string; kind: string };

let db: Db;
let today: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0];
const shift = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function targetIds(uid: string) {
  const rows = await q<{ key: string; id: string }>('select key, id from public.targets where user_id = $1', [uid]);
  return Object.fromEntries(rows.map((r) => [r.key, r.id])) as Record<'kcal' | 'p' | 'f' | 'c' | 'money', string>;
}

async function summary(uid: string, day?: string) {
  const rows = await asUser(db, uid, () =>
    q<Summary>('select * from public.daily_summary($1::date)', [day ?? null]),
  );
  return Object.fromEntries(rows.map((r) => [r.key, r]));
}

async function add(uid: string, values: Record<string, number>, opts: { day?: string; id?: string } = {}) {
  return asUser(db, uid, async () =>
    (await one<{ id: string }>(
      `select public.add_entry('manual', $1::jsonb, 'test', null, $2::date, null, $3::uuid) as id`,
      [JSON.stringify(values), opts.day ?? null, opts.id ?? null],
    ))!.id,
  );
}

beforeEach(async () => {
  db = await freshDb();
  await createUser(db, A);
  await createUser(db, B);
  await asUser(db, A, () => q('select public.bootstrap()'));
  await asUser(db, B, () => q('select public.bootstrap()'));
  today = (await one<{ d: string }>("select public.today_key()::text as d"))!.d;
});

describe('day_key_of（SQL）', () => {
  it('3:59 JSTは前日、4:00 JSTは当日', async () => {
    const r = await one<{ a: string; b: string }>(
      `select public.day_key_of('2026-11-23T03:59:59.999+09:00')::text a,
              public.day_key_of('2026-11-23T04:00:00+09:00')::text b`,
    );
    expect(r).toEqual({ a: '2026-11-22', b: '2026-11-23' });
  });

  it('TypeScript版と同じ結果になる', async () => {
    const samples: string[] = [];
    for (let t = Date.parse('2026-12-28T00:00:00Z'); t < Date.parse('2027-01-03T00:00:00Z'); t += 37 * 60_000) {
      samples.push(new Date(t).toISOString());
    }
    const rows = await q<{ ts: string; d: string }>(
      'select ts::text as ts, public.day_key_of(ts::timestamptz)::text as d from unnest($1::text[]) ts',
      [samples],
    );
    for (const r of rows) expect(r.d, r.ts).toBe(dayKeyOf(r.ts));
  });
});

describe('bootstrap', () => {
  it('既定の5ターゲットを作り、2回目は何もしない', async () => {
    await asUser(db, A, () => q('select public.bootstrap()'));
    const rows = await q<{ key: string; kind: string; daily_goal: string }>(
      'select key, kind, daily_goal::text from public.targets where user_id = $1 order by sort',
      [A],
    );
    expect(rows).toEqual([
      { key: 'kcal', kind: 'cap', daily_goal: '2200' },
      { key: 'p', kind: 'reach', daily_goal: '160' },
      { key: 'f', kind: 'cap', daily_goal: '50' },
      { key: 'c', kind: 'cap', daily_goal: '278' },
      { key: 'money', kind: 'cap', daily_goal: '1000' },
    ]);
  });
});

describe('RLS', () => {
  it('他人のデータは見えず、書けない', async () => {
    const tA = await targetIds(A);
    await add(A, { [tA.kcal]: 500 });
    const seen = await asUser(db, B, async () => ({
      targets: await q('select * from public.targets where user_id = $1', [A]),
      entries: await q('select * from public.entries'),
      values: await q('select * from public.entry_values'),
    }));
    expect(seen.targets).toHaveLength(0);
    expect(seen.entries).toHaveLength(0);
    expect(seen.values).toHaveLength(0);

    // 他人のターゲットIDを混ぜても無視される
    await add(B, { [tA.kcal]: 999 });
    expect((await summary(A)).kcal.used).toBe('500');

    // 他人の記録は消せない
    const idA = (await one<{ id: string }>('select id from public.entries where user_id = $1', [A]))!.id;
    await asUser(db, B, () => q('select public.delete_entry($1)', [idA]));
    expect((await summary(A)).kcal.used).toBe('500');
  });

  it('day_goals / day_status はクライアントから直接書けない', async () => {
    const tA = await targetIds(A);
    await expect(
      asUser(db, A, () =>
        q(`insert into public.day_goals values ($1, $2, $3, 1, 'cap')`, [A, today, tA.kcal]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, A, () => q(`insert into public.day_status values ($1, $2, true)`, [A, today])),
    ).rejects.toThrow(/permission denied/);
  });

  it('anon はRPCもテーブルも使えない', async () => {
    await expect(asRole(db, 'anon', () => q('select * from public.daily_summary()'))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asRole(db, 'anon', () => q('select * from public.targets'))).rejects.toThrow(/permission denied/);
  });

  it('private の内部関数は authenticated から呼べない', async () => {
    await expect(
      asUser(db, A, () => q('select private.month_saving($1, $2)', [A, today])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('記録と残量', () => {
  it('記録すると残りが減り、取り消すと戻る', async () => {
    const t = await targetIds(A);
    const id = await add(A, { [t.kcal]: 860, [t.p]: 30, [t.money]: 580 });
    let s = await summary(A);
    expect(s.kcal).toMatchObject({ goal: '2200', used: '860', remaining: '1340', state: 'ok' });
    expect(s.money).toMatchObject({ remaining: '420', state: 'ok' });
    expect(s.p).toMatchObject({ remaining: '130', state: 'ok' });

    await asUser(db, A, () => q('select public.delete_entry($1)', [id]));
    s = await summary(A);
    expect(s.kcal).toMatchObject({ used: '0', remaining: '2200' });
  });

  it('上限型の超過は over、0ちょうどは ok（達成ではない）', async () => {
    const t = await targetIds(A);
    await add(A, { [t.f]: 50, [t.money]: 1200 });
    const s = await summary(A);
    expect(s.f).toMatchObject({ remaining: '0', state: 'ok' });
    expect(s.money).toMatchObject({ remaining: '-200', state: 'over' });
  });

  it('到達型は目標に届くと done', async () => {
    const t = await targetIds(A);
    await add(A, { [t.p]: 100 });
    expect((await summary(A)).p.state).toBe('ok');
    await add(A, { [t.p]: 60 });
    expect((await summary(A)).p).toMatchObject({ remaining: '0', state: 'done' });
  });

  it('同じ p_id で再送しても二重にならない', async () => {
    const t = await targetIds(A);
    const id = '11111111-1111-1111-1111-111111111111';
    await add(A, { [t.kcal]: 100 }, { id });
    await add(A, { [t.kcal]: 100 }, { id });
    expect((await summary(A)).kcal.used).toBe('100');
  });

  it('update_entry で値を置き換える', async () => {
    const t = await targetIds(A);
    const id = await add(A, { [t.kcal]: 100, [t.p]: 10 });
    await asUser(db, A, () =>
      q('select public.update_entry($1, $2::jsonb, $3)', [id, JSON.stringify({ [t.kcal]: 300 }), '直した']),
    );
    const s = await summary(A);
    expect(s.kcal.used).toBe('300');
    expect(s.p.used).toBe('0');
  });
});

describe('過去の日', () => {
  it('過去の日に記録しても今日の残量は変わらない', async () => {
    const t = await targetIds(A);
    const day = shift(today, -2);
    await add(A, { [t.kcal]: 700 }, { day });
    expect((await summary(A, day)).kcal.used).toBe('700');
    expect((await summary(A)).kcal.used).toBe('0');
    const e = await one<{ day_key: string }>('select day_key::text from public.entries where user_id = $1', [A]);
    expect(e!.day_key).toBe(day);
  });

  it('未来の日・31日より前には記録できない', async () => {
    const t = await targetIds(A);
    await expect(add(A, { [t.kcal]: 1 }, { day: shift(today, 1) })).rejects.toThrow(/未来/);
    await expect(add(A, { [t.kcal]: 1 }, { day: shift(today, -31) })).rejects.toThrow(/直近31日/);
    await expect(add(A, { [t.kcal]: 1 }, { day: shift(today, -30) })).resolves.toBeTruthy();
  });

  it('目標値を変えても過去の日のスナップショットは変わらず、今日には反映される', async () => {
    const t = await targetIds(A);
    const day = shift(today, -1);
    await add(A, { [t.kcal]: 100 }, { day });
    await summary(A); // 今日のスナップショットを作る
    await asUser(db, A, () => q('update public.targets set daily_goal = 1800 where id = $1', [t.kcal]));
    expect((await summary(A, day)).kcal.goal).toBe('2200');
    expect((await summary(A)).kcal.goal).toBe('1800');
  });

  it('無効化したターゲットは今日の集計から外れる（過去は残る）', async () => {
    const t = await targetIds(A);
    const day = shift(today, -1);
    await add(A, { [t.c]: 10 }, { day });
    await summary(A);
    await asUser(db, A, () => q('update public.targets set active = false where id = $1', [t.c]));
    expect((await summary(A)).c).toBeUndefined();
    expect((await summary(A, day)).c).toBeDefined();
  });
});

describe('記録漏れ（missing_days）', () => {
  it('直近7日（今日を除く）の未確定日を返し、記録・確定で消える', async () => {
    await q(`update public.targets set created_at = now() - interval '20 days' where user_id = $1`, [A]);
    const t = await targetIds(A);
    const missing = async () =>
      (await asUser(db, A, () => q<{ d: string }>('select d::text from public.missing_days() d'))).map((r) => r.d);

    expect(await missing()).toEqual([7, 6, 5, 4, 3, 2, 1].map((n) => shift(today, -n)));

    await add(A, { [t.kcal]: 100 }, { day: shift(today, -1) });
    await asUser(db, A, () => q('select public.confirm_empty_day($1)', [shift(today, -3)]));
    expect(await missing()).toEqual([7, 6, 5, 4, 2].map((n) => shift(today, -n)));
  });

  it('使い始める前の日は記録漏れにしない', async () => {
    const m = await asUser(db, A, () => q('select * from public.missing_days()'));
    expect(m).toHaveLength(0);
  });
});

describe('今月の節約（month_saving）', () => {
  // 31日より前の日も自由に作れるよう、記録の日付チェックを外して private 関数を直接呼ぶ
  async function seed(day: string, money: number) {
    const t = await targetIds(A);
    await q('alter table public.entries disable trigger entries_before_write');
    await q('alter table public.entry_values disable trigger entry_values_before_write');
    const e = await one<{ id: string }>(
      `insert into public.entries (user_id, day_key, source) values ($1, $2, 'manual') returning id`,
      [A, day],
    );
    await q('insert into public.entry_values (entry_id, target_id, user_id, amount) values ($1, $2, $3, $4)', [
      e!.id,
      t.money,
      A,
      money,
    ]);
    await q('alter table public.entries enable trigger entries_before_write');
    await q('alter table public.entry_values enable trigger entry_values_before_write');
  }
  const saving = async (d: string) =>
    (await one<{ s: string }>('select private.month_saving($1, $2::date)::text s', [A, d]))!.s;

  it('確定済みの日と当日（見込み）だけを数える', async () => {
    // 2026-11-10 を「今日」とみなす
    await seed('2026-11-01', 400); // +600
    await seed('2026-11-03', 1300); // −300（超過）
    await seed('2026-10-31', 0); // 先月なので入らない
    await q(`insert into public.day_status values ($1, '2026-11-05', true)`, [A]); // +1000
    await q(`insert into public.day_goals select $1, '2026-11-05', id, daily_goal, kind from public.targets where user_id = $1`, [A]);
    await seed('2026-11-10', 250); // 当日: +750
    // 11/02, 04, 06〜09 は未記録 → 入らない
    expect(await saving('2026-11-10')).toBe(String(600 - 300 + 1000 + 750));
  });

  it('記録のない当日も見込みとして目標額をそのまま数える', async () => {
    expect(await saving('2026-11-10')).toBe('1000');
  });

  it('取り消した記録は数えない', async () => {
    await seed('2026-11-10', 300);
    await q('update public.entries set deleted_at = now() where user_id = $1', [A]);
    expect(await saving('2026-11-10')).toBe('1000');
  });

  it('その日の目標スナップショットを使う', async () => {
    await seed('2026-11-02', 500);
    const t = await targetIds(A);
    await q(`update public.day_goals set daily_goal = 800 where user_id = $1 and day_key = '2026-11-02' and target_id = $2`, [A, t.money]);
    // 11/02: 800−500=300, 11/03(当日): 1000
    expect(await saving('2026-11-03')).toBe('1300');
  });
});

describe('ウィジェット用トークン', () => {
  const widget = (token: string) =>
    asRole(db, 'service_role', async () =>
      (await one<{ j: any }>('select public.widget_summary_by_token($1) j', [token]))!.j,
    );

  it('発行したトークンで残量が取れ、再発行すると古いものは無効になる', async () => {
    const t = await targetIds(A);
    await add(A, { [t.kcal]: 860, [t.money]: 580, [t.p]: 200 });
    const tok1 = (await asUser(db, A, () => one<{ t: string }>('select public.issue_widget_token() t')))!.t;
    expect(tok1).toMatch(/^zr_[0-9a-f]{64}$/);

    const j = await widget(tok1);
    expect(j.day_key).toBe(today);
    expect(j.month_saving).toBeTypeOf('number');
    const kcal = j.items.find((i: any) => i.key === 'kcal');
    expect(kcal).toMatchObject({ name: 'カロリー', unit: 'kcal', kind: 'cap', goal: 2200, remaining: 1340, state: 'ok' });
    expect(j.items.find((i: any) => i.key === 'p').state).toBe('done');
    expect(j.updated_at).toBeTruthy();

    // ハッシュだけが保存されている
    const stored = await one<{ token_hash: string }>('select token_hash from private.widget_tokens where user_id = $1', [A]);
    expect(stored!.token_hash).not.toContain(tok1.slice(3));

    const tok2 = (await asUser(db, A, () => one<{ t: string }>('select public.issue_widget_token() t')))!.t;
    expect(await widget(tok1)).toBeNull();
    expect((await widget(tok2)).day_key).toBe(today);
  });

  it('間違ったトークンは null', async () => {
    expect(await widget('zr_' + '0'.repeat(64))).toBeNull();
    expect(await widget('')).toBeNull();
  });

  it('authenticated / anon からは widget_summary_by_token を呼べない', async () => {
    await expect(asUser(db, A, () => q("select public.widget_summary_by_token('x')"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asRole(db, 'anon', () => q("select public.widget_summary_by_token('x')"))).rejects.toThrow(
      /permission denied/,
    );
  });
});
