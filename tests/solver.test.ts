import { describe, expect, it } from 'vitest';
import { chooseMethod, solve } from '../src/solver';
import { bruteForce, checkFeasible, randomInstance, totalOf } from './helpers';

describe('T2 再現性：同じ入力で 2 回計算すると結果が完全に一致する', () => {
  it.each(['exact', 'heuristic'] as const)('%s', (method) => {
    const input = randomInstance({ seed: 7, households: 12, drivers: 6, parking: 4 });
    const a = solve(input, { method });
    const b = solve(structuredClone(input), { method });
    expect(a.feasible).toBe(true);
    const strip = (o: typeof a) => ({ ...o, computeMs: 0 });
    expect(strip(b)).toEqual(strip(a));
  });
});

describe('T4 最適性：小規模で厳密解法と総当たりの合計距離が一致する', () => {
  for (let seed = 1; seed <= 8; seed++) {
    it(`seed ${seed}`, () => {
      const input = randomInstance({ seed, households: 7, drivers: 4, parking: 2, capacity: [2, 4] });
      const out = solve(input, { method: 'exact' });
      const brute = bruteForce(input);
      if (brute === Infinity) {
        expect(out.feasible).toBe(false);
        return;
      }
      expect(out.feasible).toBe(true);
      if (!out.feasible) return;
      expect(checkFeasible(input, out.cars)).toEqual([]);
      expect(out.totalDistanceM).toBe(brute);
      expect(totalOf(input, out.cars)).toBe(out.totalDistanceM);
    });
  }
});

describe('T5 近似解法と厳密解法の比較（中規模）：差が 5% 以内', () => {
  for (let seed = 11; seed <= 20; seed++) {
    it(`seed ${seed}`, () => {
      const input = randomInstance({ seed, households: 13, drivers: 6, parking: 4 });
      const exact = solve(input, { method: 'exact' });
      const heur = solve(input, { method: 'heuristic' });
      expect(exact.feasible).toBe(true);
      expect(heur.feasible).toBe(true);
      if (!exact.feasible || !heur.feasible) return;
      expect(checkFeasible(input, heur.cars)).toEqual([]);
      expect(totalOf(input, heur.cars)).toBe(heur.totalDistanceM);
      expect(heur.totalDistanceM).toBeGreaterThanOrEqual(exact.totalDistanceM);
      expect(heur.totalDistanceM / exact.totalDistanceM).toBeLessThanOrEqual(1.05);
    });
  }
});

describe('T6 30 世帯・8 台の合成データが 1 分以内に終わる', () => {
  it('heuristic で解く', { timeout: 70_000 }, () => {
    const input = randomInstance({ seed: 30, households: 30, drivers: 12, parking: 8 });
    expect(chooseMethod(input)).toBe('heuristic');
    const out = solve(input);
    expect(out.feasible).toBe(true);
    if (!out.feasible) return;
    expect(out.timedOut).toBe(false);
    expect(out.computeMs).toBeLessThan(60_000);
    expect(checkFeasible(input, out.cars)).toEqual([]);
    console.log(`T6: ${out.computeMs} ms, 合計 ${out.totalDistanceM} m`);
  });
});

describe('T9 台数の扱い', () => {
  it('車出し可能数 > 駐車台数ならちょうど駐車台数分の車を使う', () => {
    const input = randomInstance({ seed: 3, households: 10, drivers: 6, parking: 3 });
    const out = solve(input);
    expect(out.feasible && out.cars.length).toBe(3);
  });
  it('車出し可能数 < 駐車台数なら全台を使う', () => {
    const input = randomInstance({ seed: 4, households: 9, drivers: 3, parking: 6, capacity: [4, 4] });
    const out = solve(input);
    expect(out.feasible && out.cars.length).toBe(3);
  });
});
