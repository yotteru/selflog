/**
 * 1日の区切り（§3.1）。
 * day_key = (記録時刻をJSTにした値 − 4時間) の日付。
 * JSTは夏時間がない固定のUTC+9なので、UTC+5時間ずらしてUTCの日付を取れば同じ値になる。
 * SQL側の zanryo.day_key_of() と必ず同じ結果になること（supabase/tests で照合している）。
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** JST(+9h) − 区切り(4h) */
const SHIFT = (9 - 4) * HOUR;

/** 'YYYY-MM-DD' */
export type DayKey = string;

export function dayKeyOf(at: Date | number | string): DayKey {
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) throw new Error(`invalid date: ${String(at)}`);
  return new Date(t + SHIFT).toISOString().slice(0, 10);
}

export function todayKey(now: Date | number = Date.now()): DayKey {
  return dayKeyOf(now);
}

function parse(key: DayKey): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error(`invalid day key: ${key}`);
  const t = Date.parse(`${key}T00:00:00Z`);
  if (Number.isNaN(t)) throw new Error(`invalid day key: ${key}`);
  return t;
}

export function addDays(key: DayKey, n: number): DayKey {
  return new Date(parse(key) + n * DAY).toISOString().slice(0, 10);
}

/** a − b（日数） */
export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((parse(a) - parse(b)) / DAY);
}

/** 記録できる日か（今日を含めて直近31日、未来は不可。§3.5） */
export function isRecordableDay(key: DayKey, now: Date | number = Date.now()): boolean {
  const d = diffDays(todayKey(now), key);
  return d >= 0 && d <= 30;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** '11/21（土）' */
export function formatDayLabel(key: DayKey): string {
  const d = new Date(parse(key));
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAYS[d.getUTCDay()]}）`;
}
