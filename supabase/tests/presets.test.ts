import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createUser, freshDb, readSql, type Db } from './harness';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
let db: Db;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;

beforeEach(async () => {
  db = await freshDb();
  await createUser(db, A);
  await createUser(db, B);
});

async function preset(uid: string, label: string, sort: number) {
  return asUser(db, uid, async () =>
    (await q<{ id: string }>(`insert into zanryo.presets (label, sort, amounts) values ($1, $2, '{}') returning id`, [
      label,
      sort,
    ]))[0].id,
  );
}
const use = (uid: string, presetId: string) =>
  asUser(db, uid, () => q(`select zanryo.add_entry('preset', '{}'::jsonb, 'x', $1)`, [presetId]));

describe('presets_ranked', () => {
  it('使った回数の多い順、同数なら sort 順。取り消した記録は数えない', async () => {
    await asUser(db, A, () => q('select zanryo.bootstrap()'));
    const a = await preset(A, 'プロテイン', 1);
    const b = await preset(A, 'おにぎり', 2);
    const c = await preset(A, 'コーヒー', 3);
    await use(A, c);
    await use(A, c);
    await use(A, b);
    await use(A, a);
    await use(A, a);
    await use(A, a);
    await asUser(db, A, () => q(`update zanryo.entries set deleted_at = now() where preset_id = $1`, [a]));
    const rows = await asUser(db, A, () => q<{ label: string; use_count: string }>('select label, use_count::text from zanryo.presets_ranked()'));
    expect(rows).toEqual([
      { label: 'コーヒー', use_count: '2' },
      { label: 'おにぎり', use_count: '1' },
      { label: 'プロテイン', use_count: '0' },
    ]);
  });

  it('他人のプリセットは返らない', async () => {
    await preset(A, 'Aの', 1);
    expect(await asUser(db, B, () => q('select * from zanryo.presets_ranked()'))).toEqual([]);
  });

  it('二重に流すと止まる', async () => {
    await expect(db.exec(readSql('03_presets_ranked.sql'))).rejects.toThrow(/すでに実行済みです/);
  });
});
