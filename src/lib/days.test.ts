import { describe, expect, it } from 'vitest';
import { clampDay, dayBounds, dayTitle, daysWithQueuedAdds, missingBannerText, relativeLabel } from './days';
import type { Op } from './queue';

describe('記録漏れのお知らせ（§3.5）', () => {
  it('1日なら日付を出す', () => {
    expect(missingBannerText(['2026-11-21'])).toBe('11/21（土）の記録がありません');
  });
  it('複数なら日数', () => {
    expect(missingBannerText(['2026-11-20', '2026-11-21'])).toBe('記録していない日が2日あります');
  });
  it('無ければ出さない', () => {
    expect(missingBannerText([])).toBeNull();
  });
});

describe('日付の範囲（今日を含めて31日、未来は不可）', () => {
  it('範囲', () => {
    expect(dayBounds('2026-11-23')).toEqual({ min: '2026-10-24', max: '2026-11-23' });
  });
  it('範囲の外は端に寄せる', () => {
    expect(clampDay('2026-11-30', '2026-11-23')).toBe('2026-11-23');
    expect(clampDay('2026-10-01', '2026-11-23')).toBe('2026-10-24');
    expect(clampDay('2026-11-20', '2026-11-23')).toBe('2026-11-20');
  });
});

describe('見出し', () => {
  it('今日と過去の日', () => {
    expect(dayTitle('2026-11-23', '2026-11-23', 'front')).toBe('今日の残り');
    expect(dayTitle('2026-11-23', '2026-11-23', 'back')).toBe('今日の積み上げ');
    expect(dayTitle('2026-11-21', '2026-11-23', 'front')).toBe('11/21（土）の記録');
    expect(relativeLabel('2026-11-22', '2026-11-23')).toBe('昨日');
    expect(relativeLabel('2026-11-20', '2026-11-23')).toBe('3日前');
  });
});

describe('daysWithQueuedAdds', () => {
  it('キューの記録の日（日付指定なしは記録時刻から）', () => {
    const ops: Op[] = [
      { type: 'add', id: 'a', recorded_at: '2026-11-22T18:59:00Z', day_key: null, source: 'preset', label: '', preset_id: null, values: {} },
      { type: 'add', id: 'b', recorded_at: '2026-11-23T01:00:00Z', day_key: '2026-11-20', source: 'manual', label: '', preset_id: null, values: {} },
      { type: 'delete', id: 'c', values: {} },
    ];
    expect([...daysWithQueuedAdds(ops)].sort()).toEqual(['2026-11-20', '2026-11-22']);
  });
});
