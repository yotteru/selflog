import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Queue, type AddOp, type SendResult } from './queue';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
});

const add = (id: string): AddOp => ({
  type: 'add', id, recorded_at: '2026-11-23T03:00:00Z', day_key: null, source: 'preset', label: id, preset_id: null, values: { k: 100 },
});

beforeEach(() => store.clear());

describe('Queue', () => {
  it('通信できないあいだは残り、復帰したら順に送る', async () => {
    let online = false;
    const sent: string[] = [];
    const q = new Queue(async (op): Promise<SendResult> => {
      if (!online) return 'network';
      sent.push(`${op.type}:${op.id}`);
      return 'ok';
    });
    q.add(add('a'));
    q.add(add('b'));
    await q.flush();
    expect(q.unsentCount).toBe(2);
    online = true;
    await q.flush();
    expect(sent).toEqual(['add:a', 'add:b']);
    expect(q.unsentCount).toBe(0);
    // 読み直すまでは画面の上乗せのために残っている
    expect(q.all()).toHaveLength(2);
    q.purgeSent(q.all());
    expect(q.all()).toHaveLength(0);
  });

  it('アプリを開き直してもキューは残っている', () => {
    new Queue(async () => 'network').add(add('a'));
    expect(new Queue(async () => 'ok').all()).toHaveLength(1);
  });

  it('送る前に取り消せば、送らずに消える', async () => {
    const send = vi.fn(async (): Promise<SendResult> => 'ok');
    const q = new Queue(send);
    q.add(add('a'));
    q.remove('a', { k: 100 });
    await q.flush();
    expect(send).not.toHaveBeenCalled();
    expect(q.all()).toHaveLength(0);
  });

  it('送った後に取り消すと、削除を送る', async () => {
    const sent: string[] = [];
    const q = new Queue(async (op) => (sent.push(`${op.type}:${op.id}`), 'ok'));
    q.add(add('a'));
    await q.flush();
    q.remove('a', { k: 100 });
    await q.flush();
    expect(sent).toEqual(['add:a', 'delete:a']);
  });

  it('サーバーに断られた記録は外して知らせる', async () => {
    const dropped = vi.fn();
    const q = new Queue(async () => ({ error: '未来の日には記録できません' }), dropped);
    q.add(add('a'));
    await q.flush();
    expect(q.all()).toHaveLength(0);
    expect(dropped).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), '未来の日には記録できません');
  });

  it('送っている途中に追加されたものも送る', async () => {
    const sent: string[] = [];
    let q!: Queue;
    q = new Queue(async (op) => {
      sent.push(op.id);
      if (op.id === 'a') q.add(add('b'));
      return 'ok';
    });
    q.add(add('a'));
    await q.flush();
    expect(sent).toEqual(['a', 'b']);
  });
});
