import { describe, expect, it } from 'vitest';
import { move, renumber } from './reorder';

describe('並べ替え', () => {
  it('上下に動かす。端では動かない', () => {
    expect(move(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(move(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(move(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(move(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
  it('番号を振り直す', () => {
    expect(renumber([{ id: 'x', sort: 5 }, { id: 'y', sort: 1 }])).toEqual([{ id: 'x', sort: 10 }, { id: 'y', sort: 20 }]);
  });
});
