import { beforeEach, describe, expect, it } from 'vitest';
import { asRole, asUser, createUser, freshDb, type Db } from './harness';

const A = '00000000-0000-0000-0000-00000000000a';
let db: Db;

const consume = (limit: number) =>
  asRole(db, 'service_role', async () =>
    (await db.query<{ ok: boolean }>('select zanryo.try_consume_gemini_call($1) ok', [limit])).rows[0].ok,
  );

beforeEach(async () => {
  db = await freshDb();
  await createUser(db, A);
});

describe('Geminiの1日の呼び出し回数', () => {
  it('上限までは true、超えたら false で、回数は上限で止まる', async () => {
    expect(await consume(2)).toBe(true);
    expect(await consume(2)).toBe(true);
    expect(await consume(2)).toBe(false);
    expect(await consume(2)).toBe(false);
    const n = await asUser(db, A, async () =>
      (await db.query<{ n: number }>('select zanryo.gemini_usage_today() n')).rows[0].n,
    );
    expect(n).toBe(2);
  });

  it('前日の分は数えない', async () => {
    await db.query(
      `insert into zanryo_private.gemini_usage (usage_day, calls) values (zanryo_private.gemini_usage_day() - 1, 99)`,
    );
    expect(await consume(1)).toBe(true);
  });

  it('上限0や不正な値なら呼ばせない', async () => {
    expect(await consume(0)).toBe(false);
  });

  it('authenticated / anon からは数えられない', async () => {
    await expect(asUser(db, A, () => db.query('select zanryo.try_consume_gemini_call(10)'))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asRole(db, 'anon', () => db.query('select zanryo.try_consume_gemini_call(10)'))).rejects.toThrow(
      /permission denied/,
    );
  });
});
