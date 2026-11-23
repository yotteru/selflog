// PGlite（WASM版Postgres）上で、Supabaseの auth スキーマとロールを最小限まねて supabase/sql/ を流す。
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SQL_DIR = fileURLToPath(new URL('../sql', import.meta.url));
/** 入れるときに流すファイル（01〜09）。00 は確認用、10 以降は手作業用、99 は削除用 */
const INSTALL = /^0[1-9]_.*\.sql$/;

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- shiori 側のテーブルの代わり（public にあるものに触れないことを確かめる）
create table public.shiori_notes (id serial primary key, body text);
`;

export async function freshDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of readdirSync(SQL_DIR).filter((f) => INSTALL.test(f)).sort()) {
    await db.exec(readFileSync(join(SQL_DIR, f), 'utf8'));
  }
  return db;
}

export type Db = PGlite;

export function readSql(name: string) {
  return readFileSync(join(SQL_DIR, name), 'utf8');
}

/** auth.users にユーザーを作る。member=true なら残量アプリの利用者としても登録する */
export async function createUser(db: Db, id: string, { member = true } = {}) {
  await db.query('insert into auth.users (id) values ($1)', [id]);
  if (member) await db.query('insert into zanryo_private.members (user_id) values ($1)', [id]);
}

/** 指定ユーザーとして（authenticated ロールで）実行する */
export async function asUser<T>(db: Db, uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

export async function asRole<T>(db: Db, role: 'anon' | 'service_role', fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
  }
}
