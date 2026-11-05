// solve()：最適化の入口。規模を見積もって厳密解法と近似解法を切り替える（設計書 5.2）

import { estimateExactOps, solveExact } from './exact';
import { solveHeuristic } from './heuristic';
import { hashString } from './rng';
import type { SolverInput, SolverMethod, SolverOutput } from './types';

export type { SolverInput, SolverOutput } from './types';

/** この見積り以下なら厳密解法を使う */
export const EXACT_OPS_LIMIT = 2e8;
/** 安全装置：これを超えたらその時点の最良解を返す */
export const TIME_LIMIT_MS = 55_000;

export type SolveOptions = {
  /** 省略時は規模で自動選択（テスト用に固定できる） */
  method?: SolverMethod;
  timeLimitMs?: number;
  randomStarts?: number;
};

export function chooseMethod(input: SolverInput): SolverMethod {
  return estimateExactOps(input) <= EXACT_OPS_LIMIT ? 'exact' : 'heuristic';
}

export function solve(input: SolverInput, options: SolveOptions = {}): SolverOutput {
  const started = Date.now();
  const deadline = started + (options.timeLimitMs ?? TIME_LIMIT_MS);
  const method = options.method ?? chooseMethod(input);
  const K = Math.min(input.parking, input.drivers.length);
  if (K <= 0) return { feasible: false, method, timedOut: false, computeMs: 0 };

  const { best, timedOut } =
    method === 'exact'
      ? solveExact(input, deadline)
      : solveHeuristic(input, {
          // シードは入力内容のハッシュ値。同じ入力なら同じ乱数列になる
          seed: hashString(JSON.stringify(input)),
          randomStarts: options.randomStarts,
          deadline,
        });

  const computeMs = Date.now() - started;
  if (!best) return { feasible: false, method, timedOut, computeMs };
  return { feasible: true, cars: best.cars, totalDistanceM: best.total, method, timedOut, computeMs };
}
