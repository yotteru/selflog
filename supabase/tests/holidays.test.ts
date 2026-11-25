import { beforeEach, describe, expect, it } from 'vitest';
import { asRole, asUser, createUser, freshDb, readSql, type Db } from './harness';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const OTHER = '00000000-0000-0000-0000-00000000005e';
let db: Db;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0];
let T: Record<string, string>;
let today: string;

const moneyGoal = async (user: string, day: string) =>
  (await one<{ g: string }>(
    `select goal::text g from zanryo_private.daily_summary($1, $2::date) where key = 'money'`,
    [user, day],
  ))!.g;

beforeEach(async () => {
  db = await freshDb();
  await createUser(db, A);
  await createUser(db, B);
  await createUser(db, OTHER, { member: false });
  await asUser(db, A, () => q('select zanryo.bootstrap()'));
  await asUser(db, B, () => q('select zanryo.bootstrap()'));
  T = Object.fromEntries((await q<{ key: string; id: string }>('select key, id from zanryo.targets where user_id = $1', [A])).map((r) => [r.key, r.id]));
  today = (await one<{ d: string }>('select zanryo.today_key()::text d'))!.d;
});

describe('祝日の判定', () => {
  it('2026年の祝日（振替休日・国民の休日を含む）', async () => {
    const rows = await q<{ d: string; n: string }>(
      `select d::date::text d, zanryo.jp_holiday_name(d::date) n
         from generate_series('2026-01-01'::date, '2026-12-31'::date, interval '1 day') d
        where zanryo.jp_holiday_name(d::date) is not null`,
    );
    expect(rows.map((r) => `${r.d.slice(5)} ${r.n}`)).toEqual([
      '01-01 元日',
      '01-12 成人の日',
      '02-11 建国記念の日',
      '02-23 天皇誕生日',
      '03-20 春分の日',
      '04-29 昭和の日',
      '05-03 憲法記念日',
      '05-04 みどりの日',
      '05-05 こどもの日',
      '05-06 振替休日',
      '07-20 海の日',
      '08-11 山の日',
      '09-21 敬老の日',
      '09-22 国民の休日',
      '09-23 秋分の日',
      '10-12 スポーツの日',
      '11-03 文化の日',
      '11-23 勤労感謝の日',
    ]);
  });
  it('日曜の祝日の次の日は振替休日（2027年は 2/11 木曜なので無し、2025年 11/24）', async () => {
    const r = await one<Record<string, string | null>>(`select
      zanryo.jp_holiday_name('2025-11-24') a, zanryo.jp_holiday_name('2027-03-22') b, zanryo.jp_holiday_name('2026-11-24') c`);
    expect(r).toEqual({ a: '振替休日', b: '振替休日', c: null });
  });
});

describe('平日と休日の目標', () => {
  it('休日の目標を入れると、土日祝はその目標になる。空欄なら平日と同じ', async () => {
    await q(`update zanryo.targets set daily_goal = 1000, holiday_goal = 3000 where id = $1`, [T.money]);
    expect(await moneyGoal(A, '2026-11-20')).toBe('1000'); // 金曜
    expect(await moneyGoal(A, '2026-11-21')).toBe('3000'); // 土曜
    expect(await moneyGoal(A, '2026-11-23')).toBe('3000'); // 月曜・勤労感謝の日
    const kcal = await one<{ g: string }>(`select goal::text g from zanryo_private.daily_summary($1, '2026-11-21') where key = 'kcal'`, [A]);
    expect(kcal!.g).toBe('2200'); // 休日の目標なし → 平日と同じ
  });

  it('日ごとに手で休日／平日を切り替えられ、自動に戻せる', async () => {
    await q(`update zanryo.targets set daily_goal = 1000, holiday_goal = 3000 where id = $1`, [T.money]);
    const weekday = await one<{ d: string }>(
      `select d::date::text d from generate_series(zanryo.today_key() - 6, zanryo.today_key(), interval '1 day') d
        where extract(isodow from d) between 1 and 5 and zanryo.jp_holiday_name(d::date) is null limit 1`,
    );
    const d = weekday!.d;
    expect(await moneyGoal(A, d)).toBe('1000');
    await asUser(db, A, () => q(`select zanryo.set_day_off($1, true)`, [d]));
    expect(await moneyGoal(A, d)).toBe('3000');
    const info = await asUser(db, A, () => one(`select * from zanryo.day_info($1)`, [d]));
    expect(info).toMatchObject({ off: true, auto_off: false, manual: true, has_holiday_goals: true });
    await asUser(db, A, () => q(`select zanryo.set_day_off($1, null)`, [d]));
    expect(await moneyGoal(A, d)).toBe('1000');
    // 記録なしで確定した日の状態は変えない
    await asUser(db, A, () => q(`select zanryo.confirm_empty_day($1)`, [d]));
    await asUser(db, A, () => q(`select zanryo.set_day_off($1, true)`, [d]));
    const st = await one<{ confirmed_empty: boolean; day_off: boolean }>(`select confirmed_empty, day_off from zanryo.day_status where user_id = $1 and day_key = $2`, [A, d]);
    expect(st).toEqual({ confirmed_empty: true, day_off: true });
  });

  it('切り替えはその日の時点の目標で作り直す（あとで目標を変えても過去の日は変わらない）', async () => {
    await q(`update zanryo.targets set daily_goal = 1000, holiday_goal = 3000 where id = $1`, [T.money]);
    const d = (await one<{ d: string }>(`select (zanryo.today_key() - 3)::text d`))!.d;
    await moneyGoal(A, d); // スナップショットを作る
    await q(`update zanryo.targets set daily_goal = 500, holiday_goal = 5000 where id = $1`, [T.money]);
    await asUser(db, A, () => q(`select zanryo.set_day_off($1, true)`, [d]));
    await asUser(db, A, () => q(`select zanryo.set_day_off($1, false)`, [d]));
    expect(await moneyGoal(A, d)).toBe('1000');
    await asUser(db, A, () => q(`select zanryo.set_day_off($1, true)`, [d]));
    expect(await moneyGoal(A, d)).toBe('3000');
  });

  it('今日の目標は、休日の目標を変えるとすぐ変わる（今日が休日なら）', async () => {
    await moneyGoal(A, today);
    await asUser(db, A, () => q(`select zanryo.set_day_off($1, true)`, [today]));
    await q(`update zanryo.targets set holiday_goal = 4000 where id = $1`, [T.money]);
    expect(await moneyGoal(A, today)).toBe('4000');
  });

  it('週・月の目標のターゲットには使わない', async () => {
    await q(`update zanryo.targets set period = 'week', daily_goal = 7000, holiday_goal = 3000 where id = $1`, [T.money]);
    expect(await moneyGoal(A, '2026-11-21')).toBe('7000');
  });

  it('他の人の切り替えは見えず、利用者でない人・未来の日・31日より前は断る', async () => {
    await asUser(db, A, () => q(`select zanryo.set_day_off($1, true)`, [today]));
    const seen = await asUser(db, B, () => q(`select * from zanryo.day_status where day_key = $1`, [today]));
    expect(seen).toEqual([]);
    expect((await asUser(db, B, () => one<{ manual: boolean }>(`select * from zanryo.day_info($1)`, [today])))!.manual).toBe(false);
    await expect(asUser(db, OTHER, () => q(`select zanryo.set_day_off($1, true)`, [today]))).rejects.toThrow(/利用者として登録されていません/);
    await expect(asUser(db, A, () => q(`select zanryo.set_day_off(zanryo.today_key() + 1, true)`))).rejects.toThrow(/未来/);
    await expect(asUser(db, A, () => q(`select zanryo.set_day_off(zanryo.today_key() - 40, true)`))).rejects.toThrow(/31日/);
    await expect(asRole(db, 'anon', () => q(`select zanryo.set_day_off($1, true)`, [today]))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, A, () => q(`update zanryo.day_status set day_off = false`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, A, () => q(`select zanryo_private.is_off_day($1, $2)`, [A, today]))).rejects.toThrow(/permission denied/);
  });
});

describe('週・月の画面（range_summary）', () => {
  it('まだ来ていない日も、その日の目標（休日なら休日の目標）と休日かどうかを返す', async () => {
    await q(`update zanryo.targets set daily_goal = 1000, holiday_goal = 3000 where id = $1`, [T.money]);
    const rows = await asUser(db, A, () =>
      q<{ day_key: string; daily_goal: string; used: string; confirmed: boolean; off: boolean }>(
        `select day_key::text, daily_goal::text, used::text, confirmed, off from zanryo.range_summary($1::date, $1::date + 9) where key = 'money'`,
        [today],
      ),
    );
    expect(rows).toHaveLength(10);
    for (const r of rows) {
      const dow = new Date(`${r.day_key}T00:00:00Z`).getUTCDay();
      const auto = dow === 0 || dow === 6 || r.off; // 祝日は off で確かめる
      expect(r.daily_goal).toBe(auto ? '3000' : '1000');
      if (r.day_key > today) expect(r).toMatchObject({ used: '0', confirmed: false });
    }
  });
});

describe('06_holidays.sql', () => {
  it('二重に流すと止まる', async () => {
    await expect(db.exec(readSql('06_holidays.sql'))).rejects.toThrow(/すでに実行済みです/);
  });
});
