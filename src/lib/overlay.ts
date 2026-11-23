// サーバーから読んだ値に、キューにある（まだ反映されていない）記録・削除を上乗せする
import { applyAmounts } from './display';
import { dayKeyOf } from './dayKey';
import type { Op } from './queue';
import type { Entry, SummaryItem } from './types';

export function opDay(op: Op & { type: 'add' }): string {
  return op.day_key ?? dayKeyOf(op.recorded_at);
}

export function overlay(
  day: string,
  summary: SummaryItem[],
  entries: Entry[],
  ops: readonly Op[],
): { summary: SummaryItem[]; entries: Entry[] } {
  let s = summary;
  let list = entries;
  const known = new Set(entries.map((e) => e.id));

  for (const op of ops) {
    if (op.type === 'add') {
      if (opDay(op) !== day || known.has(op.id)) continue; // 読み直した値にもう入っている
      s = applyAmounts(s, op.values, 1);
      list = [
        {
          id: op.id,
          label: op.label,
          source: op.source,
          recorded_at: op.recorded_at,
          preset_id: op.preset_id,
          values: op.values,
          pending: !op.sent,
        },
        ...list,
      ];
      known.add(op.id);
    } else {
      if (!list.some((e) => e.id === op.id)) continue;
      s = applyAmounts(s, op.values, -1);
      list = list.filter((e) => e.id !== op.id);
    }
  }
  return { summary: s, entries: list };
}
