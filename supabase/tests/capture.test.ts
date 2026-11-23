import { beforeEach, describe, expect, it } from 'vitest';
import { asRole, asUser, createUser, freshDb, readSql, type Db } from './harness';

const ME = '00000000-0000-0000-0000-00000000000a';
const OTHER = '00000000-0000-0000-0000-00000000005e';
let db: Db;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

beforeEach(async () => {
  db = await freshDb();
  await createUser(db, ME);
  await createUser(db, OTHER, { member: false });
});

describe('04_capture.sql', () => {
  it('レシートの記録を保存できる', async () => {
    await asUser(db, ME, () => q('select zanryo.bootstrap()'));
    const id = await asUser(db, ME, async () => (await q<{ id: string }>(`select zanryo.add_entry('receipt', '{}'::jsonb, 'スーパー') id`))[0].id);
    expect(id).toBeTruthy();
    await expect(asUser(db, ME, () => q(`select zanryo.add_entry('nope', '{}'::jsonb)`))).rejects.toThrow(/entries_source_check/);
  });

  it('is_member：利用者は true、それ以外は false、anon は呼べない', async () => {
    expect((await asUser(db, ME, () => q<{ m: boolean }>('select zanryo.is_member() m')))[0].m).toBe(true);
    expect((await asUser(db, OTHER, () => q<{ m: boolean }>('select zanryo.is_member() m')))[0].m).toBe(false);
    await expect(asRole(db, 'anon', () => q('select zanryo.is_member()'))).rejects.toThrow(/permission denied/);
  });

  it('二重に流すと止まる', async () => {
    await expect(db.exec(readSql('04_capture.sql'))).rejects.toThrow(/すでに実行済みです/);
  });
});
