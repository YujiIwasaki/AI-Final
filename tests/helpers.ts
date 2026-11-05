// テスト用の合成データ。外部 API を使わず、座標から「道路距離らしい」距離をつくる。

import { mulberry32 } from '../src/solver/rng';
import { routeCost } from '../src/solver/common';
import type { SolverCar, SolverInput } from '../src/solver/types';
import type { LatLng } from '../src/domain/types';

/** 直線距離 × 1.3 に、南北方向で少し差をつけた非対称の距離（メートル・整数） */
export function pseudoRoad(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const straight = 2 * R * Math.asin(Math.sqrt(h));
  const skew = b.lat > a.lat ? 1.05 : 1.0;
  return Math.round(straight * 1.3 * skew);
}

export function matrixOf(points: LatLng[]): number[][] {
  return points.map((a) => points.map((b) => pseudoRoad(a, b)));
}

/** 距離から所要時間（秒）をつくる（時速 30 km 相当） */
export function durationOf(dist: number[][]): number[][] {
  return dist.map((row) => row.map((d) => Math.round(d / (30_000 / 3600))));
}

export const SCHEDULE = { assemblyTime: '09:00', bufferMin: 15, dwellMin: 5, durationFactor: 1.3 };

/** ランダムな合成問題（世帯 h 個 + 会場）。drivers 個の世帯が車を出せる */
export function randomInstance(opts: {
  seed: number;
  households: number;
  drivers: number;
  parking: number;
  maxKids?: number;
  capacity?: [number, number];
}): SolverInput {
  const rand = mulberry32(opts.seed);
  const center = { lat: 35.63, lng: 139.66 };
  const points: LatLng[] = [];
  for (let i = 0; i < opts.households; i++) {
    points.push({ lat: center.lat + (rand() - 0.5) * 0.08, lng: center.lng + (rand() - 0.5) * 0.1 });
  }
  points.push(center);
  const kids = points.slice(0, -1).map(() => (rand() < 0.15 ? 2 : 1) + (opts.maxKids && opts.maxKids > 2 && rand() < 0.05 ? 1 : 0));
  const [cmin, cmax] = opts.capacity ?? [3, 4];
  // 車を出せる世帯は番号の間隔をあけて選ぶ
  const driverNodes = Array.from({ length: opts.households }, (_, i) => i)
    .filter((_, i) => i % Math.max(1, Math.floor(opts.households / opts.drivers)) === 0)
    .slice(0, opts.drivers);
  return {
    kids,
    drivers: driverNodes.map((node) => ({ node, capacity: cmin + Math.floor(rand() * (cmax - cmin + 1)) })),
    parking: opts.parking,
    dist: matrixOf(points),
  };
}

/** 解が制約を満たしているか（全員ちょうど 1 回、定員内、台数）を調べる */
export function checkFeasible(input: SolverInput, cars: SolverCar[]): string[] {
  const errors: string[] = [];
  const K = Math.min(input.parking, input.drivers.length);
  if (cars.length !== K) errors.push(`台数が ${cars.length}（期待 ${K}）`);
  const seen = new Map<number, number>();
  const capacity = new Map(input.drivers.map((d) => [d.node, d.capacity]));
  for (const c of cars) {
    if (!capacity.has(c.driver)) errors.push(`運転手に選べない世帯 ${c.driver} が運転している`);
    seen.set(c.driver, (seen.get(c.driver) ?? 0) + 1);
    let load = 0;
    for (const s of c.stops) {
      seen.set(s, (seen.get(s) ?? 0) + 1);
      load += input.kids[s];
    }
    if (load > (capacity.get(c.driver) ?? 0)) errors.push(`世帯 ${c.driver} の車が定員超過（${load}）`);
  }
  for (let h = 0; h < input.kids.length; h++) {
    if (seen.get(h) !== 1) errors.push(`世帯 ${h} の割当回数が ${seen.get(h) ?? 0}`);
  }
  return errors;
}

export function totalOf(input: SolverInput, cars: SolverCar[]) {
  return cars.reduce((a, c) => a + routeCost(c.driver, c.stops, input.dist), 0);
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs.slice()];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/** 総当たりで最適値を求める（小規模専用） */
export function bruteForce(input: SolverInput): number {
  const H = input.kids.length;
  const K = Math.min(input.parking, input.drivers.length);
  let best = Infinity;
  const D = input.drivers;
  const choose = (start: number, picked: typeof D) => {
    if (picked.length === K) {
      const pickedNodes = new Set(picked.map((p) => p.node));
      const riders = Array.from({ length: H }, (_, i) => i).filter((h) => !pickedNodes.has(h));
      const assign = new Array<number>(riders.length).fill(0);
      const total = K ** riders.length;
      for (let code = 0; code < total; code++) {
        let x = code;
        for (let i = 0; i < riders.length; i++) {
          assign[i] = x % K;
          x = Math.floor(x / K);
        }
        let sum = 0;
        let ok = true;
        for (let c = 0; c < K && ok; c++) {
          const group = riders.filter((_, i) => assign[i] === c);
          const load = group.reduce((a, h) => a + input.kids[h], 0);
          if (load > picked[c].capacity) {
            ok = false;
            break;
          }
          let bestRoute = Infinity;
          for (const p of permutations(group)) bestRoute = Math.min(bestRoute, routeCost(picked[c].node, p, input.dist));
          sum += bestRoute;
        }
        if (ok) best = Math.min(best, sum);
      }
      return;
    }
    for (let i = start; i < D.length; i++) choose(i + 1, [...picked, D[i]]);
  };
  choose(0, []);
  return best;
}
