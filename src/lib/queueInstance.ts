// アプリ全体で1つだけの送信キュー（どの日の画面から記録しても同じキューに入る）
import { sendOp } from './api';
import { Queue } from './queue';

export const queue = new Queue(sendOp);
