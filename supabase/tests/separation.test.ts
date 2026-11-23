// shiori と同じプロジェクトに同居させても混ざらないことを確かめる
import { beforeEach, describe, expect, it } from 'vitest';
import { asRole, asUser, createUser, freshDb, readSql, type Db } from './harness';

const ME = '00000000-0000-0000-0000-00000000000a';
const SHIORI_USER = '00000000-0000-0000-0000-00000000005e'; // shiori だけを使っているユーザー

let db: Db;
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;

beforeEach(async () => {
  db = await freshDb();
  await createUser(db, ME);
  await createUser(db, SHIORI_USER, { member: false });
  await asUser(db, ME, () => q('select zanryo.bootstrap()'));
});

describe('shiori との分離', () => {
  it('public スキーマには何も作らない', async () => {
    const rows = await q(`
      select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname <> 'shiori_notes' and c.relname not like 'shiori_notes_%'
      union all
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
    expect(rows).toEqual([]);
  });

  it('利用者に登録していないユーザー（shiori のユーザー）は何もできない', async () => {
    await expect(asUser(db, SHIORI_USER, () => q('select zanryo.bootstrap()'))).rejects.toThrow(/利用者として登録されていません/);
    await expect(asUser(db, SHIORI_USER, () => q('select * from zanryo.daily_summary()'))).rejects.toThrow(
      /利用者として登録されていません/,
    );
    await expect(asUser(db, SHIORI_USER, () => q('select zanryo.issue_widget_token()'))).rejects.toThrow(
      /利用者として登録されていません/,
    );
    // テーブルを直接読んでも0行、書こうとしてもRLSで拒否
    expect(await asUser(db, SHIORI_USER, () => q('select * from zanryo.targets'))).toEqual([]);
    await expect(
      asUser(db, SHIORI_USER, () =>
        q(`insert into zanryo.targets (user_id, name, unit, kind, daily_goal) values ($1, 'x', 'g', 'cap', 1)`, [
          SHIORI_USER,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('利用者を外すと、その人のデータにも触れなくなる', async () => {
    await q('delete from zanryo_private.members where user_id = $1', [ME]);
    expect(await asUser(db, ME, () => q('select * from zanryo.targets'))).toEqual([]);
  });

  it('anon は zanryo スキーマに入れない', async () => {
    await expect(asRole(db, 'anon', () => q('select * from zanryo.targets'))).rejects.toThrow(/permission denied/);
  });

  it('99_uninstall.sql で跡形なく消え、shiori のテーブルは残る', async () => {
    await q(`insert into public.shiori_notes (body) values ('shiori のデータ')`);
    await db.exec(readSql('99_uninstall.sql'));
    const left = await q(`select nspname from pg_namespace where nspname like 'zanryo%'`);
    expect(left).toEqual([]);
    expect(await q('select body from public.shiori_notes')).toEqual([{ body: 'shiori のデータ' }]);
    expect(await q('select id from auth.users order by id')).toHaveLength(2);
  });

  it('00_check_before_install.sql は入れる前に流せて、何も変えない', async () => {
    const fresh = new (await import('@electric-sql/pglite')).PGlite();
    await fresh.exec('create schema supabase_migrations;');
    await fresh.exec(readSql('00_check_before_install.sql'));
    const left = await fresh.query(`select nspname from pg_namespace where nspname like 'zanryo%'`);
    expect(left.rows).toEqual([]);
  });
});

describe('SQLファイルを二重に実行したとき', () => {
  it.each(['01_schema.sql', '02_gemini_usage.sql'])('%s は「実行済み」と分かるエラーで止まる', async (f) => {
    await expect(db.exec(readSql(f))).rejects.toThrow(/すでに実行済みです/);
  });
});
