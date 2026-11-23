// 記録・削除の送信キュー（仕様 §8：記録だけはオフラインでもキューに入れ、復帰したら送る）
//
// - 押した瞬間にキューへ入れ、画面にはすぐ反映する（楽観的な表示）。
// - 送れたものは「送信済み」にして、次にサーバーから読み直すまで画面の上乗せに使う（ちらつき防止）。
// - IDはこちらで作って送るので、同じ記録を二重に送っても1件にしかならない（add_entry の p_id）。
import type { Amounts, Entry } from './types';

export interface AddOp {
  type: 'add';
  id: string;
  recorded_at: string;
  day_key: string | null;
  source: Entry['source'];
  label: string;
  preset_id: string | null;
  values: Amounts;
  sent?: boolean;
}
export interface DeleteOp {
  type: 'delete';
  id: string;
  /** 画面から引く量（送る前に分かっている値） */
  values: Amounts;
  sent?: boolean;
}
export type Op = AddOp | DeleteOp;

export type SendResult = 'ok' | 'network' | { error: string };

const KEY = 'zanryo.queue.v1';

function read(): Op[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Op[]) : [];
  } catch {
    return [];
  }
}

function write(ops: Op[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch {
    /* 保存できなくても、メモリ上のキューで続ける */
  }
}

export class Queue {
  private ops: Op[] = read();
  private listeners = new Set<() => void>();
  private flushing = false;

  constructor(
    private send: (op: Op) => Promise<SendResult>,
    private onDropped: (op: Op, message: string) => void = () => {},
  ) {}

  all(): readonly Op[] {
    return this.ops;
  }

  get unsentCount(): number {
    return this.ops.filter((o) => !o.sent).length;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(ops: Op[]) {
    this.ops = ops;
    write(ops);
    this.listeners.forEach((fn) => fn());
  }

  add(op: AddOp) {
    this.set([...this.ops, op]);
  }

  /** 記録を消す。まだ送っていない記録なら、送らずにキューから外すだけ */
  remove(id: string, values: Amounts) {
    const pending = this.ops.find((o) => o.type === 'add' && o.id === id && !o.sent);
    if (pending) {
      this.set(this.ops.filter((o) => o !== pending));
      return;
    }
    this.set([...this.ops, { type: 'delete', id, values }]);
  }

  /** 送っていないものを順に送る。通信できなければそこで止めて、次の機会に続きから送る */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      for (;;) {
        const op = this.ops.find((o) => !o.sent);
        if (!op) break;
        const r = await this.send(op);
        if (r === 'network') break;
        if (r === 'ok') {
          this.set(this.ops.map((o) => (o === op ? { ...o, sent: true } : o)));
        } else {
          // サーバーが受け付けない記録（日付が範囲外など）は、送り続けても通らないので外す
          this.set(this.ops.filter((o) => o !== op));
          this.onDropped(op, r.error);
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  /** サーバーから読み直したあとに呼ぶ：送信済みのものは、もう読み直した値に含まれている */
  purgeSent(sentBefore: readonly Op[]) {
    const done = new Set(sentBefore.filter((o) => o.sent));
    if (done.size) this.set(this.ops.filter((o) => !done.has(o)));
  }
}
