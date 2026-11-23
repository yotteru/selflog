import { describe, expect, it } from 'vitest';
import { addDays, dayKeyOf, diffDays, formatDayLabel, isRecordableDay, todayKey } from './dayKey';

// JSTの時刻を表すDate（+09:00で指定）
const jst = (s: string) => new Date(`${s}+09:00`);

describe('dayKeyOf（朝4:00 JST区切り）', () => {
  it('3:59は前日', () => {
    expect(dayKeyOf(jst('2026-11-23T03:59:59.999'))).toBe('2026-11-22');
  });
  it('4:00は当日', () => {
    expect(dayKeyOf(jst('2026-11-23T04:00:00'))).toBe('2026-11-23');
  });
  it('深夜0時台は前日', () => {
    expect(dayKeyOf(jst('2026-11-23T00:00:00'))).toBe('2026-11-22');
  });
  it('23:59は当日', () => {
    expect(dayKeyOf(jst('2026-11-23T23:59:59'))).toBe('2026-11-23');
  });
  it('UTCで与えても同じ（4:00 JST = 前日19:00 UTC）', () => {
    expect(dayKeyOf('2026-11-22T18:59:59Z')).toBe('2026-11-22');
    expect(dayKeyOf('2026-11-22T19:00:00Z')).toBe('2026-11-23');
  });
  it('月・年またぎ', () => {
    expect(dayKeyOf(jst('2026-12-01T03:00:00'))).toBe('2026-11-30');
    expect(dayKeyOf(jst('2027-01-01T03:59:00'))).toBe('2026-12-31');
    expect(dayKeyOf(jst('2027-01-01T04:00:00'))).toBe('2027-01-01');
  });
  it('うるう日', () => {
    expect(dayKeyOf(jst('2028-03-01T02:00:00'))).toBe('2028-02-29');
  });
  it('不正な値は例外', () => {
    expect(() => dayKeyOf('nope')).toThrow();
  });
  it('todayKey は dayKeyOf(now)', () => {
    expect(todayKey(jst('2026-11-23T05:00:00'))).toBe('2026-11-23');
  });
});

describe('日付の計算', () => {
  it('addDays / diffDays', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-12-01', '2026-11-23')).toBe(8);
  });
  it('isRecordableDay: 今日〜30日前まで、未来は不可', () => {
    const now = jst('2026-11-23T10:00:00');
    expect(isRecordableDay('2026-11-23', now)).toBe(true);
    expect(isRecordableDay('2026-10-24', now)).toBe(true);
    expect(isRecordableDay('2026-10-23', now)).toBe(false);
    expect(isRecordableDay('2026-11-24', now)).toBe(false);
  });
  it('isRecordableDay: 4:00前は前日が「今日」', () => {
    const now = jst('2026-11-24T03:00:00');
    expect(isRecordableDay('2026-11-24', now)).toBe(false);
    expect(isRecordableDay('2026-11-23', now)).toBe(true);
  });
  it('formatDayLabel', () => {
    expect(formatDayLabel('2026-11-21')).toBe('11/21（土）');
    expect(formatDayLabel('2026-11-23')).toBe('11/23（月）');
  });
});
