import { describe, expect, it } from 'vitest';
import sample from '../sample_data/sample.json';
import { buildCarsAndRiders } from '../src/domain/cost';
import { buildProblem, problemPoints, toSolverInput } from '../src/domain/validate';
import type { Household, PlanInput, Player, Venue } from '../src/domain/types';
import { solve } from '../src/solver';
import { checkFeasible, durationOf, matrixOf } from './helpers';

describe('T1 サンプルデータで計画を作成する', () => {
  it('定員超過がなく、参加者全員がちょうど 1 台に割り当てられる', () => {
    const households = sample.households as Household[];
    const players = sample.players as Player[];
    const venue = sample.venues[0] as Venue;
    const input = sample.planInputs[0] as PlanInput;

    const built = buildProblem(input, households, players, venue);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const dist = matrixOf(problemPoints(built.problem));
    const solverInput = toSolverInput(built.problem, dist);
    const out = solve(solverInput);
    expect(out.feasible).toBe(true);
    if (!out.feasible) return;
    expect(checkFeasible(solverInput, out.cars)).toEqual([]);

    const { cars, riders } = buildCarsAndRiders(built.problem, dist, durationOf(dist), out.cars, { unitPriceYenPerKm: 17 }, input);
    expect(cars).toHaveLength(input.parking);
    for (const c of cars) expect(c.load).toBeLessThanOrEqual(c.capacity);
    const participants = players.filter((p) => input.attendance[p.id]).map((p) => p.id).sort();
    expect(riders.map((r) => r.playerId).sort()).toEqual(participants);
    // 集合 8:30・余裕 15 分 → 全車 8:15 着。出発・乗車の時刻は到着より前で、立ち寄り順に進む
    for (const c of cars) {
      expect(c.schedule.arriveMin).toBe(8 * 60 + 15);
      const times = [c.schedule.departMin, ...c.schedule.stopMin, c.schedule.arriveMin];
      for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });
});
