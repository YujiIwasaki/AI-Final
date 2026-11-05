import type { SolverCar } from './types';

export type Candidate = { cars: SolverCar[]; total: number };

/** 片道距離（運転手宅 → 立ち寄り先 → 会場）。会場は dist の最後の番号 */
export function routeCost(driver: number, stops: number[], dist: number[][]): number {
  const venue = dist.length - 1;
  let d = 0;
  let prev = driver;
  for (const s of stops) {
    d += dist[prev][s];
    prev = s;
  }
  return d + dist[prev][venue];
}

/** 車を driver の昇順に並べる */
export function sortCars(cars: SolverCar[]): SolverCar[] {
  return cars.map((c) => ({ driver: c.driver, stops: c.stops.slice() })).sort((a, b) => a.driver - b.driver);
}

/**
 * 解の比較（設計書 5.3「同点の扱い」）。
 * 合計距離 → 車出し世帯の並び → 各車の立ち寄り順 の辞書順で小さい方を良い解とする。
 * 世帯の番号は ID 順に振ってあるので、番号の辞書順は ID の辞書順と同じになる。
 */
export function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.total !== b.total) return a.total - b.total;
  const ka = candidateKey(a.cars);
  const kb = candidateKey(b.cars);
  for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  return ka.length - kb.length;
}

function candidateKey(cars: SolverCar[]): number[] {
  const sorted = sortCars(cars);
  const key = sorted.map((c) => c.driver);
  for (const c of sorted) key.push(-1, ...c.stops);
  return key;
}

export function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/** 0..n-1 から k 個選ぶ組み合わせを辞書順に列挙する */
export function* combinations(n: number, k: number): Generator<number[]> {
  const idx = Array.from({ length: k }, (_, i) => i);
  if (k > n) return;
  while (true) {
    yield idx.slice();
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

