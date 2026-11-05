// Web Worker の入口。計算中も画面が固まらないよう、最適化は別スレッドで動かす。

import { solve, type SolverInput } from './index';

self.onmessage = (e: MessageEvent<SolverInput>) => {
  self.postMessage(solve(e.data));
};
