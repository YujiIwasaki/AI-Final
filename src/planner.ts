// 「計画を作成」の一連の流れ（設計書 5.2 の図）：
// 事前チェック → 距離行列を取得 → 最適化（Web Worker）→ ルート形状を取得 → 区間距離・負担額 → 保存

import { buildCarsAndRiders } from './domain/cost';
import type { Car, PlanError, PlanInput, PlanResult } from './domain/types';
import { buildProblem, problemPoints, toSolverInput } from './domain/validate';
import { getDistanceMatrix, getRouteGeometry } from './services/routing';
import type { SolverInput, SolverOutput } from './solver/types';
import { db, newId } from './storage/db';

export type Progress = 'check' | 'distance' | 'solve' | 'route' | 'save';

export const PROGRESS_LABEL: Record<Progress, string> = {
  check: '入力を確認しています…',
  distance: '道路距離を取得しています…',
  solve: '配車を最適化しています…',
  route: '地図に描く経路を取得しています…',
  save: '結果を保存しています…',
};

const routingError = (): PlanError => ({
  code: 'E06',
  message: '道路距離を取得できませんでした。通信状態を確認して再実行してください',
});

function solveInWorker(input: SolverInput): Promise<SolverOutput> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./solver/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SolverOutput>) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (e) => {
      reject(new Error(e.message));
      worker.terminate();
    };
    worker.postMessage(input);
  });
}

export async function createPlan(
  input: PlanInput,
  onProgress: (p: Progress) => void = () => {},
): Promise<{ ok: true; result: PlanResult } | { ok: false; error: PlanError }> {
  onProgress('check');
  // エラーになっても「前回の入力を複製」で使えるよう、入力は先に保存する
  await db.planInputs.put(input);
  const [households, players, venue] = await Promise.all([
    db.households.toArray(),
    db.players.toArray(),
    db.venues.get(input.venueId),
  ]);
  const built = buildProblem(input, households, players, venue);
  if (!built.ok) return { ok: false, error: built.error };
  const problem = built.problem;

  onProgress('distance');
  const points = problemPoints(problem);
  let dist: number[][];
  try {
    dist = await getDistanceMatrix(points);
  } catch {
    return { ok: false, error: routingError() };
  }

  onProgress('solve');
  const solverInput = toSolverInput(problem, dist);
  const out = await solveInWorker(solverInput);
  if (!out.feasible) {
    return { ok: false, error: { code: 'E04', message: '定員内で全員を割り当てられる組み合わせがありません' } };
  }

  onProgress('route');
  const settings = { unitPriceYenPerKm: input.unitPriceYenPerKm };
  const { cars: carsNoGeometry, riders } = buildCarsAndRiders(problem, solverInput.dist, out.cars, settings);
  const cars: Car[] = [];
  try {
    for (const sc of out.cars) {
      const route = [sc.driver, ...sc.stops].map((i) => points[i]).concat(points[points.length - 1]);
      const geometry = await getRouteGeometry(route);
      cars.push({ ...carsNoGeometry[cars.length], geometry });
    }
  } catch {
    return { ok: false, error: routingError() };
  }

  onProgress('save');
  const participatingIds = new Set(problem.households.map((h) => h.id));
  const result: PlanResult = {
    id: newId(),
    inputId: input.id,
    inputSnapshot: {
      input,
      venue: venue!,
      households: households.filter((h) => participatingIds.has(h.id)),
      players: players.filter((p) => input.attendance[p.id] && participatingIds.has(p.householdId)),
    },
    distanceMatrix: solverInput.dist,
    cars,
    riders,
    totalDistanceM: out.totalDistanceM,
    method: out.method,
    timedOut: out.timedOut,
    computeMs: out.computeMs,
    createdAt: new Date().toISOString(),
  };
  await db.planResults.put(result);
  return { ok: true, result };
}
