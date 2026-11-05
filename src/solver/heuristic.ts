// 近似解法（設計書 5.2 ②）：複数の初期解 × regret 挿入 × 局所探索
// 再現性のため、時間ではなく「試行回数」と「改善がなくなったら終了」で止める（5.3）。

import { compareCandidates, routeCost, sortCars, type Candidate } from './common';
import { mulberry32, shuffle } from './rng';
import type { SolverInput } from './types';

type Route = { driver: number; capacity: number; stops: number[]; load: number };

export type HeuristicOptions = {
  seed: number;
  randomStarts?: number;
  deadline: number;
};

/** 局所探索 1 回あたりの改善回数の上限（無限ループ防止） */
const MAX_IMPROVEMENTS = 5000;

export function solveHeuristic(input: SolverInput, opts: HeuristicOptions): { best: Candidate | null; timedOut: boolean } {
  const { kids, drivers, dist } = input;
  const H = kids.length;
  const V = H;
  const K = Math.min(input.parking, drivers.length);
  const rand = mulberry32(opts.seed);
  const totalKids = kids.reduce((a, b) => a + b, 0);
  let timedOut = false;
  const timeUp = () => {
    if (!timedOut && Date.now() > opts.deadline) timedOut = true;
    return timedOut;
  };

  // ---- 1. 初期解（車を出す世帯の選び方）----
  const idx = drivers.map((_, i) => i);
  const sortedBy = (key: (i: number) => number) => idx.slice().sort((a, b) => key(b) - key(a) || a - b).slice(0, K);
  const starts: number[][] = [
    sortedBy((i) => dist[drivers[i].node][V]), // 会場から遠い順
    sortedBy((i) => drivers[i].capacity + kids[drivers[i].node]), // 乗せられる人数が多い順
    sortedBy((i) => drivers[i].capacity), // 乗車可能人数が多い順
    sortedBy((i) => -dist[drivers[i].node][V]), // 会場に近い順
  ];
  for (let r = 0; r < (opts.randomStarts ?? 50); r++) starts.push(shuffle(idx, rand).slice(0, K));
  const seen = new Set<string>();
  const uniqueStarts = starts
    .map((s) => s.slice().sort((a, b) => a - b))
    .filter((s) => {
      const key = s.join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  let best: Candidate | null = null;
  for (const start of uniqueStarts) {
    if (timeUp()) break;
    const chosen = start.map((i) => drivers[i]);
    // 定員の合計が足りない選び方は、どう割り当てても解にならない
    if (chosen.reduce((a, c) => a + c.capacity + kids[c.node], 0) < totalKids) continue;
    const routes = construct(chosen.map((c) => ({ driver: c.node, capacity: c.capacity, stops: [], load: 0 })));
    if (!routes) continue;
    localSearch(routes);
    const cand: Candidate = { cars: sortCars(routes.map((r) => ({ driver: r.driver, stops: r.stops }))), total: totalCost(routes) };
    if (!best || compareCandidates(cand, best) < 0) best = cand;
  }
  return { best, timedOut };

  // ---------------------------------------------------------------

  function cost(r: Route) {
    return routeCost(r.driver, r.stops, dist);
  }
  function totalCost(routes: Route[]) {
    return routes.reduce((a, r) => a + cost(r), 0);
  }

  /** u を r に挿入するときの最小の増加距離と位置 */
  function bestInsert(r: Route, u: number): { delta: number; pos: number } {
    let delta = Infinity;
    let pos = -1;
    const s = r.stops;
    for (let p = 0; p <= s.length; p++) {
      const a = p === 0 ? r.driver : s[p - 1];
      const b = p === s.length ? V : s[p];
      const d = dist[a][u] + dist[u][b] - dist[a][b];
      if (d < delta) {
        delta = d;
        pos = p;
      }
    }
    return { delta, pos };
  }

  function insertAt(r: Route, u: number, pos: number) {
    r.stops.splice(pos, 0, u);
    r.load += kids[u];
  }

  // ---- 2. 割当：regret 挿入法 ----
  function construct(routes: Route[]): Route[] | null {
    const driverSet = new Set(routes.map((r) => r.driver));
    const unassigned: number[] = [];
    for (let h = 0; h < H; h++) if (!driverSet.has(h)) unassigned.push(h);

    const regret = regretInsert(cloneRoutes(routes), unassigned.slice());
    if (regret) return regret;
    // 定員が厳しく regret 挿入で詰まったときは、人数の多い世帯から入れる
    const byKids = unassigned.slice().sort((a, b) => kids[b] - kids[a] || a - b);
    const fallback = cloneRoutes(routes);
    for (const u of byKids) {
      let bestR = -1;
      let bestIns = { delta: Infinity, pos: -1 };
      fallback.forEach((r, ri) => {
        if (r.load + kids[u] > r.capacity) return;
        const ins = bestInsert(r, u);
        if (ins.delta < bestIns.delta) {
          bestIns = ins;
          bestR = ri;
        }
      });
      if (bestR < 0) return null;
      insertAt(fallback[bestR], u, bestIns.pos);
    }
    return fallback;
  }

  function regretInsert(routes: Route[], unassigned: number[]): Route[] | null {
    while (unassigned.length > 0) {
      let pick = -1;
      let pickRegret = -Infinity;
      let pickBest = Infinity;
      let pickRoute = -1;
      let pickPos = -1;
      for (let ui = 0; ui < unassigned.length; ui++) {
        const u = unassigned[ui];
        let b1 = Infinity;
        let b2 = Infinity;
        let b1r = -1;
        let b1p = -1;
        routes.forEach((r, ri) => {
          if (r.load + kids[u] > r.capacity) return;
          const { delta, pos } = bestInsert(r, u);
          if (delta < b1) {
            b2 = b1;
            b1 = delta;
            b1r = ri;
            b1p = pos;
          } else if (delta < b2) {
            b2 = delta;
          }
        });
        if (b1r < 0) return null;
        // 入れられる車が 1 台しかない世帯は最優先
        const reg = b2 === Infinity ? Number.MAX_SAFE_INTEGER : b2 - b1;
        if (reg > pickRegret || (reg === pickRegret && b1 < pickBest)) {
          pick = ui;
          pickRegret = reg;
          pickBest = b1;
          pickRoute = b1r;
          pickPos = b1p;
        }
      }
      insertAt(routes[pickRoute], unassigned[pick], pickPos);
      unassigned.splice(pick, 1);
    }
    return routes;
  }

  function cloneRoutes(routes: Route[]): Route[] {
    return routes.map((r) => ({ ...r, stops: r.stops.slice() }));
  }

  // ---- 3. 局所探索 ----
  function localSearch(routes: Route[]) {
    for (const r of routes) intraOpt(r);
    let count = 0;
    while (count < MAX_IMPROVEMENTS && !timeUp()) {
      if (relocate(routes) || swap(routes) || driverSwap(routes)) {
        count++;
        continue;
      }
      break;
    }
  }

  /** 1 台の中で回る順番を変える（2-opt と Or-opt）。改善がなくなるまで繰り返す */
  function intraOpt(r: Route) {
    let improved = true;
    while (improved) {
      improved = false;
      const base = cost(r);
      const n = r.stops.length;
      // 2-opt：区間 [i, j] を逆順にする
      for (let i = 0; i < n - 1 && !improved; i++) {
        for (let j = i + 1; j < n && !improved; j++) {
          const s = r.stops.slice(0, i).concat(r.stops.slice(i, j + 1).reverse(), r.stops.slice(j + 1));
          if (routeCost(r.driver, s, dist) < base) {
            r.stops = s;
            improved = true;
          }
        }
      }
      // Or-opt：長さ 1〜3 の区間を別の位置へ移す
      for (let len = 1; len <= 3 && !improved; len++) {
        for (let i = 0; i + len <= n && !improved; i++) {
          const seg = r.stops.slice(i, i + len);
          const rest = r.stops.slice(0, i).concat(r.stops.slice(i + len));
          for (let p = 0; p <= rest.length && !improved; p++) {
            if (p === i) continue;
            const s = rest.slice(0, p).concat(seg, rest.slice(p));
            if (routeCost(r.driver, s, dist) < base) {
              r.stops = s;
              improved = true;
            }
          }
        }
      }
    }
  }

  /** 世帯を別の車へ移す */
  function relocate(routes: Route[]): boolean {
    for (let a = 0; a < routes.length; a++) {
      const ra = routes[a];
      const baseA = cost(ra);
      for (let i = 0; i < ra.stops.length; i++) {
        const u = ra.stops[i];
        const without = ra.stops.slice(0, i).concat(ra.stops.slice(i + 1));
        const gain = baseA - routeCost(ra.driver, without, dist);
        for (let b = 0; b < routes.length; b++) {
          if (b === a) continue;
          const rb = routes[b];
          if (rb.load + kids[u] > rb.capacity) continue;
          const { delta, pos } = bestInsert(rb, u);
          if (delta < gain) {
            ra.stops = without;
            ra.load -= kids[u];
            insertAt(rb, u, pos);
            intraOpt(ra);
            intraOpt(rb);
            return true;
          }
        }
      }
    }
    return false;
  }

  /** 2 台の間で世帯を入れ替える */
  function swap(routes: Route[]): boolean {
    for (let a = 0; a < routes.length; a++) {
      for (let b = a + 1; b < routes.length; b++) {
        const ra = routes[a];
        const rb = routes[b];
        const base = cost(ra) + cost(rb);
        for (let i = 0; i < ra.stops.length; i++) {
          for (let j = 0; j < rb.stops.length; j++) {
            const u = ra.stops[i];
            const v = rb.stops[j];
            if (ra.load - kids[u] + kids[v] > ra.capacity) continue;
            if (rb.load - kids[v] + kids[u] > rb.capacity) continue;
            const na: Route = { ...ra, stops: ra.stops.slice(0, i).concat(ra.stops.slice(i + 1)), load: ra.load - kids[u] };
            const nb: Route = { ...rb, stops: rb.stops.slice(0, j).concat(rb.stops.slice(j + 1)), load: rb.load - kids[v] };
            const ia = bestInsert(na, v);
            const ib = bestInsert(nb, u);
            if (cost(na) + ia.delta + cost(nb) + ib.delta < base) {
              insertAt(na, v, ia.pos);
              insertAt(nb, u, ib.pos);
              routes[a] = na;
              routes[b] = nb;
              intraOpt(na);
              intraOpt(nb);
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  /** 車を出す世帯を、出していない車出し可能世帯と入れ替える */
  function driverSwap(routes: Route[]): boolean {
    const base = totalCost(routes);
    const used = new Set(routes.map((r) => r.driver));
    for (let ci = 0; ci < routes.length; ci++) {
      for (const t of drivers) {
        if (used.has(t.node)) continue;
        const next = cloneRoutes(routes);
        // t は今どこかの車に乗っている → 外して、t の車として運転させる
        for (const r of next) {
          const p = r.stops.indexOf(t.node);
          if (p >= 0) {
            r.stops.splice(p, 1);
            r.load -= kids[t.node];
          }
        }
        const s = next[ci].driver;
        next[ci].driver = t.node;
        next[ci].capacity = t.capacity;
        if (next[ci].load > t.capacity) continue;
        // 元の運転手 s は乗せてもらう側になる
        let bestR = -1;
        let bestIns = { delta: Infinity, pos: -1 };
        next.forEach((r, ri) => {
          if (r.load + kids[s] > r.capacity) return;
          const ins = bestInsert(r, s);
          if (ins.delta < bestIns.delta) {
            bestIns = ins;
            bestR = ri;
          }
        });
        if (bestR < 0) continue;
        insertAt(next[bestR], s, bestIns.pos);
        for (const r of next) intraOpt(r);
        if (totalCost(next) < base) {
          routes.splice(0, routes.length, ...next);
          return true;
        }
      }
    }
    return false;
  }
}
