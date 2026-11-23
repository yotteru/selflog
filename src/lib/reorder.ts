/** 一覧の i 番目を1つ上（-1）か下（+1）に動かした新しい配列。端なら同じ配列を返す */
export function move<T>(list: readonly T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 並び順の番号を 10, 20, 30… に振り直す */
export function renumber<T extends { sort: number }>(list: readonly T[]): T[] {
  return list.map((x, i) => ({ ...x, sort: (i + 1) * 10 }));
}
