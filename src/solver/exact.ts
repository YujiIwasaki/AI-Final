// 厳密解法（設計書 5.2 ①）：車出し世帯の組み合わせ総当たり × Held-Karp × 部分集合 DP

import { binom, combinations, compareCandidates, sortCars, type Candidate } from './common';
import type { SolverCar, SolverInput } from './types';

/** 計算量の見積り：C(|D|,K) × (2^n × n² + K × (2^n × n + 3^n)) */
export function estimateExactOps(input: SolverInput): number {
  const d = input.drivers.length;
  const k = Math.min(input.parking, d);
  if (k <= 0) return 0;
  const n = input.kids.length - k;
  if (n > 24) return Infinity;
  const p2 = 2 ** n;
  return binom(d, k) * (p2 * n * n + k * (p2 * n + 3 ** n));
}

const ctz = (x: number) => 31 - Math.clz32(x & -x);

export function solveExact(input: SolverInput, deadline: number): { best: Candidate | null; timedOut: boolean } {
  const { kids, drivers, dist } = input;
  const H = kids.length;
  const V = H;
  const K = Math.min(input.parking, drivers.length);
  let best: Candidate | null = null;
  let timedOut = false;

  for (const combo of combinations(drivers.length, K)) {
    if (Date.now() > deadline) {
      timedOut = true;
      break;
    }
    const chosen = combo.map((i) => drivers[i]);
    const chosenNodes = new Set(chosen.map((c) => c.node));
    const riders: number[] = [];
    for (let h = 0; h < H; h++) if (!chosenNodes.has(h)) riders.push(h);
    const n = riders.length;
    const size = 1 << n;
    const full = size - 1;

    // 部分集合ごとの乗車人数
    const weight = new Int32Array(size);
    for (let m = 1; m < size; m++) weight[m] = weight[m & (m - 1)] + kids[riders[ctz(m)]];
    if (weight[full] > chosen.reduce((a, c) => a + c.capacity, 0)) continue;

    // f[m*n+i]：riders[i] から出発し、集合 m の家をすべて回って会場に着く最短距離（i ∈ m）
    const f = new Float64Array(size * Math.max(n, 1)).fill(Infinity);
    const next = new Int8Array(size * Math.max(n, 1)).fill(-1);
    for (let i = 0; i < n; i++) f[(1 << i) * n + i] = dist[riders[i]][V];
    for (let m = 1; m < size; m++) {
      if ((m & (m - 1)) === 0) continue;
      for (let i = 0; i < n; i++) {
        if (!(m & (1 << i))) continue;
        const rest = m ^ (1 << i);
        const ri = riders[i];
        let bestV = Infinity;
        let bestJ = -1;
        for (let j = 0; j < n; j++) {
          if (!(rest & (1 << j))) continue;
          const v = dist[ri][riders[j]] + f[rest * n + j];
          if (v < bestV) {
            bestV = v;
            bestJ = j;
          }
        }
        f[m * n + i] = bestV;
        next[m * n + i] = bestJ;
      }
    }

    // 車 t が集合 m を回るときの最短距離と、最初に寄る家
    const carCost: Float64Array[] = [];
    const carFirst: Int8Array[] = [];
    for (const car of chosen) {
      const cost = new Float64Array(size).fill(Infinity);
      const first = new Int8Array(size).fill(-1);
      cost[0] = dist[car.node][V];
      for (let m = 1; m < size; m++) {
        if (weight[m] > car.capacity) continue;
        let bestV = Infinity;
        for (let i = 0; i < n; i++) {
          if (!(m & (1 << i))) continue;
          const v = dist[car.node][riders[i]] + f[m * n + i];
          if (v < bestV) {
            bestV = v;
            first[m] = i;
          }
        }
        cost[m] = bestV;
      }
      carCost.push(cost);
      carFirst.push(first);
    }

    // 立ち寄り先の集合を K 台に分ける：dp[t][m] = 車 0..t で集合 m を回る最短合計
    const dp: Float64Array[] = [carCost[0]];
    const choice: Int32Array[] = [new Int32Array(0)];
    for (let t = 1; t < K; t++) {
      const prev = dp[t - 1];
      const cost = carCost[t];
      const cur = new Float64Array(size).fill(Infinity);
      const ch = new Int32Array(size).fill(-1);
      const last = t === K - 1;
      for (let m = last ? full : 0; m < size; m++) {
        let bestV = Infinity;
        let bestSub = -1;
        for (let sub = m; ; sub = (sub - 1) & m) {
          const c = cost[sub];
          if (c !== Infinity) {
            const v = prev[m ^ sub] + c;
            if (v < bestV) {
              bestV = v;
              bestSub = sub;
            }
          }
          if (sub === 0) break;
        }
        cur[m] = bestV;
        ch[m] = bestSub;
      }
      dp.push(cur);
      choice.push(ch);
    }

    const total = dp[K - 1][full];
    if (total === Infinity) continue;

    // 復元
    const sets = new Array<number>(K);
    let m = full;
    for (let t = K - 1; t >= 1; t--) {
      sets[t] = choice[t][m];
      m ^= sets[t];
    }
    sets[0] = m;
    const cars: SolverCar[] = chosen.map((car, t) => {
      const stops: number[] = [];
      let set = sets[t];
      if (set !== 0) {
        let i = carFirst[t][set];
        while (i >= 0) {
          stops.push(riders[i]);
          const nm = set ^ (1 << i);
          const ni = next[set * n + i];
          set = nm;
          i = set === 0 ? -1 : ni;
        }
      }
      return { driver: car.node, stops };
    });

    const cand: Candidate = { cars: sortCars(cars), total };
    if (!best || compareCandidates(cand, best) < 0) best = cand;
  }
  return { best, timedOut };
}
