import { describe, expect, it } from 'vitest';
import { swipeAxis, swipeResult } from './useSwipe';

describe('スワイプの判定', () => {
  it('少ししか動いていなければ決めない', () => {
    expect(swipeAxis(5, 3)).toBeNull();
  });
  it('横に大きく動けば横、縦なら縦（斜めは縦に寄せてスクロールを邪魔しない）', () => {
    expect(swipeAxis(40, 5)).toBe('h');
    expect(swipeAxis(5, 40)).toBe('v');
    expect(swipeAxis(30, 30)).toBe('v');
  });
  it('左へ60px以上で次、右へで前。行けない向きなら何もしない', () => {
    expect(swipeResult(-80, true, true)).toBe('next');
    expect(swipeResult(80, true, true)).toBe('prev');
    expect(swipeResult(-40, true, true)).toBeNull();
    expect(swipeResult(-80, true, false)).toBeNull();
    expect(swipeResult(80, false, true)).toBeNull();
  });
});
