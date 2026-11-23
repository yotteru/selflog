import { describe, expect, it } from 'vitest';
import { overlay } from './overlay';
import type { AddOp } from './queue';
import type { Entry, SummaryItem } from './types';

const summary: SummaryItem[] = [
  { target_id: 'k', key: 'kcal', name: 'カロリー', unit: 'kcal', kind: 'cap', sort: 0, goal: 2200, used: 0, remaining: 2200, state: 'ok' },
];
const add = (id: string, at = '2026-11-23T03:00:00Z'): AddOp => ({
  type: 'add', id, recorded_at: at, day_key: null, source: 'preset', label: id, preset_id: null, values: { k: 300 },
});
const entry = (id: string): Entry => ({ id, label: id, source: 'preset', recorded_at: '', preset_id: null, values: { k: 300 } });

describe('overlay', () => {
  it('まだ届いていない記録を足して、一覧の先頭に出す', () => {
    const r = overlay('2026-11-23', summary, [], [add('a')]);
    expect(r.summary[0].remaining).toBe(1900);
    expect(r.entries.map((e) => [e.id, e.pending])).toEqual([['a', true]]);
  });
  it('サーバーにもう入っている記録は二重に足さない', () => {
    const r = overlay('2026-11-23', [{ ...summary[0], used: 300, remaining: 1900 }], [entry('a')], [{ ...add('a'), sent: true }]);
    expect(r.summary[0].remaining).toBe(1900);
    expect(r.entries).toHaveLength(1);
  });
  it('ほかの日の記録は足さない（3:59 JST は前日）', () => {
    const r = overlay('2026-11-23', summary, [], [add('a', '2026-11-22T18:59:00Z')]);
    expect(r.summary[0].remaining).toBe(2200);
  });
  it('削除待ちの記録は引いて、一覧から外す', () => {
    const base = [{ ...summary[0], used: 300, remaining: 1900 }];
    const r = overlay('2026-11-23', base, [entry('a')], [{ type: 'delete', id: 'a', values: { k: 300 } }]);
    expect(r.summary[0].remaining).toBe(2200);
    expect(r.entries).toEqual([]);
  });
});
