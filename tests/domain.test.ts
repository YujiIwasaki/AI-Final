import { describe, expect, it } from 'vitest';
import { buildCarsAndRiders, calcCost } from '../src/domain/cost';
import { buildProblem, problemPoints, toSolverInput } from '../src/domain/validate';
import type { Household, PlanInput, Player, Problem, Venue } from '../src/domain/types';
import { solve } from '../src/solver';
import { matrixOf } from './helpers';

const venue: Venue = { id: 'v', name: '会場', address: '', lat: 35.626, lng: 139.657, defaultParking: 2 };

function makeData() {
  const households: Household[] = [
    { id: 'a', label: 'A家', address: '', lat: 35.634, lng: 139.658 },
    { id: 'b', label: 'B家', address: '', lat: 35.633, lng: 139.663 },
    { id: 'c', label: 'C家', address: '', lat: 35.634, lng: 139.668 },
    { id: 'd', label: 'D家', address: '', lat: 35.636, lng: 139.678 },
    { id: 'e', label: 'E家', address: '', lat: 35.641, lng: 139.671 },
    { id: 'f', label: 'F家', address: '', lat: 35.637, lng: 139.646 },
  ];
  const players: Player[] = [
    { id: 'p1', name: 'A1', householdId: 'a', active: true },
    { id: 'p2', name: 'B1', householdId: 'b', active: true },
    { id: 'p3', name: 'B2', householdId: 'b', active: true },
    { id: 'p4', name: 'C1', householdId: 'c', active: true },
    { id: 'p5', name: 'D1', householdId: 'd', active: true },
    { id: 'p6', name: 'E1', householdId: 'e', active: true },
    { id: 'p7', name: 'F1', householdId: 'f', active: true },
  ];
  const input: PlanInput = {
    id: 'plan',
    matchDate: '2026-11-08',
    venueId: 'v',
    parking: 2,
    attendance: Object.fromEntries(players.map((p) => [p.id, true])),
    drivers: { a: 3, d: 3, f: 2 },
    unitPriceYenPerKm: 17,
    createdAt: '',
  };
  return { households, players, input };
}

function plan(households: Household[], players: Player[], input: PlanInput, v: Venue = venue) {
  const built = buildProblem(input, households, players, v);
  if (!built.ok) return { error: built.error };
  const dist = matrixOf(problemPoints(built.problem));
  const out = solve(toSolverInput(built.problem, dist));
  if (!out.feasible) return { error: { code: 'E04' } };
  return { problem: built.problem, out: { ...out, computeMs: 0 }, ...buildCarsAndRiders(built.problem, dist, out.cars, { unitPriceYenPerKm: input.unitPriceYenPerKm }) };
}

describe('T3 入力の順番を入れ替えても結果が一致する', () => {
  it('世帯・選手・入力のキーの順番を逆にする', () => {
    const { households, players, input } = makeData();
    const a = plan(households, players, input);
    const reversedInput: PlanInput = {
      ...input,
      attendance: Object.fromEntries(Object.entries(input.attendance).reverse()),
      drivers: Object.fromEntries(Object.entries(input.drivers).reverse()),
    };
    const b = plan(households.slice().reverse(), players.slice().reverse(), reversedInput);
    expect('cars' in a && a.cars.length).toBe(2);
    expect(b).toEqual(a);
  });
});

describe('T7 エラーケース', () => {
  it('E01 参加者が 0 人', () => {
    const { households, players, input } = makeData();
    const r = plan(households, players, { ...input, attendance: {} });
    expect(r.error?.code).toBe('E01');
  });
  it('E02 駐車可能台数が 0', () => {
    const { households, players, input } = makeData();
    expect(plan(households, players, { ...input, parking: 0 }).error?.code).toBe('E02');
  });
  it('E02 車を出せる世帯が 0', () => {
    const { households, players, input } = makeData();
    expect(plan(households, players, { ...input, drivers: {} }).error?.code).toBe('E02');
  });
  it('E03 乗車可能人数の合計が足りない（不足人数を表示）', () => {
    const { households, players, input } = makeData();
    // 参加 7 人。a(3+1) と d(1+1) の 2 台で最大 6 人 → あと 1 人
    const r = plan(households, players, { ...input, drivers: { a: 3, d: 1 } });
    expect(r.error?.code).toBe('E03');
    expect(r.error && 'message' in r.error && r.error.message).toContain('あと 1 人分');
  });
  it('E04 兄弟を同じ車に乗せる制約で定員に収まらない', () => {
    const { households, players, input } = makeData();
    // 参加は a・b（兄弟 2 人）・c・d の 5 人。a・c・d が乗車可能 1 人ずつで 3 台出す。
    // 人数は (1+1)×3 = 6 ≧ 5 で E03 は通過するが、B 家の 2 人はどの車にも一緒に乗れない
    const few = players.filter((p) => ['p1', 'p2', 'p3', 'p4', 'p5'].includes(p.id));
    const r = plan(households, few, {
      ...input,
      drivers: { a: 1, c: 1, d: 1 },
      parking: 3,
      attendance: Object.fromEntries(few.map((p) => [p.id, true])),
    });
    expect(r.error?.code).toBe('E04');
  });
  it('E05 住所の座標が未登録', () => {
    const { households, players, input } = makeData();
    const noCoords = households.map((h) => (h.id === 'c' ? { ...h, lat: undefined, lng: undefined } : h));
    const r = plan(noCoords, players, input);
    expect(r.error?.code).toBe('E05');
    expect(r.error && 'message' in r.error && r.error.message).toContain('C家');
  });
});

describe('T8 区間距離・負担額が手計算の値と一致する', () => {
  it('3 世帯を回る 1 台', () => {
    const problem: Problem = {
      households: [
        { id: 'x', label: 'X', lat: 0, lng: 0, playerIds: ['x1'] },
        { id: 'y', label: 'Y', lat: 0, lng: 0, playerIds: ['y1', 'y2'] },
        { id: 'z', label: 'Z', lat: 0, lng: 0, playerIds: ['z1'] },
      ],
      venue: { id: 'v', name: 'V', lat: 0, lng: 0 },
      drivers: [{ householdId: 'x', capacity: 3 }],
      parking: 1,
    };
    // 番号 3 が会場。x → y = 1000, y → z = 2000, z → 会場 = 3500
    const dist = [
      [0, 1000, 9999, 9999],
      [9999, 0, 2000, 9999],
      [9999, 9999, 0, 3500],
      [9999, 9999, 9999, 0],
    ];
    const { cars, riders } = buildCarsAndRiders(problem, dist, [{ driver: 0, stops: [1, 2] }], { unitPriceYenPerKm: 17 });
    expect(cars[0]).toMatchObject({ driverHouseholdId: 'x', stops: ['y', 'z'], load: 3, capacity: 3, distanceM: 6500 });
    const byId = Object.fromEntries(riders.map((r) => [r.playerId, r]));
    // 運転手の子：区間 = 車の片道距離、負担 0
    expect(byId.x1).toMatchObject({ isOwnCar: true, sectionDistanceM: 6500, roundTripDistanceM: 13000, costYen: 0 });
    // y：2000 + 3500 = 5500 m、往復 11 km × 17 円 = 187 円（兄弟それぞれ同じ）
    expect(byId.y1).toMatchObject({ sectionDistanceM: 5500, roundTripDistanceM: 11000, costYen: 187 });
    expect(byId.y2).toMatchObject({ sectionDistanceM: 5500, costYen: 187 });
    // z：3500 m、往復 7 km × 17 円 = 119 円
    expect(byId.z1).toMatchObject({ sectionDistanceM: 3500, roundTripDistanceM: 7000, costYen: 119 });
  });
  it('calcCost は 1 円未満を四捨五入する', () => {
    expect(calcCost({ isOwnCar: false, roundTripDistanceM: 1030 }, { unitPriceYenPerKm: 17 })).toBe(18); // 17.51
    expect(calcCost({ isOwnCar: false, roundTripDistanceM: 1020 }, { unitPriceYenPerKm: 17 })).toBe(17); // 17.34
    expect(calcCost({ isOwnCar: true, roundTripDistanceM: 5000 }, { unitPriceYenPerKm: 17 })).toBe(0);
  });
});

describe('T10 子が参加しない車出し世帯は運転手に選ばれない（D10）', () => {
  it('車出しを入力していても除外され、空席の合計にも数えない', () => {
    const { households, players, input } = makeData();
    // f 家の子（p7）が不参加。f 家は乗車可能 4 人で入力されている
    const attendance = { ...input.attendance, p7: false };
    const r = plan(households, players, { ...input, attendance, drivers: { a: 3, d: 3, f: 4 } });
    expect('cars' in r).toBe(true);
    if (!('cars' in r) || !r.cars || !r.problem) return;
    expect(r.problem.drivers.map((d) => d.householdId)).toEqual(['a', 'd']);
    expect(r.cars.map((c) => c.driverHouseholdId)).not.toContain('f');
    expect(r.problem.households.map((h) => h.id)).not.toContain('f');
  });
  it('子が参加しない世帯しか車を出せなければ E02', () => {
    const { households, players, input } = makeData();
    const attendance = { ...input.attendance, p7: false };
    expect(plan(households, players, { ...input, attendance, drivers: { f: 4 } }).error?.code).toBe('E02');
  });
  it('子が参加しない世帯の席を数えると足りるが、数えなければ E03', () => {
    const { households, players, input } = makeData();
    // 参加 6 人。a(1+1) と f(4) なら足りるが、f は除外 → a だけでは 2 人しか乗れない
    const attendance = { ...input.attendance, p7: false };
    const r = plan(households, players, { ...input, attendance, drivers: { a: 1, f: 4 } });
    expect(r.error?.code).toBe('E03');
  });
});
