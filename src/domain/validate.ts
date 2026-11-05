// 事前チェック（設計書 5.5）と入力の正規化（5.3）

import type { Household, PlanError, PlanInput, Player, Problem, Venue } from './types';
import type { SolverInput } from '../solver/types';

export type BuildResult = { ok: true; problem: Problem } | { ok: false; error: PlanError };

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const hasCoords = (x: { lat?: number; lng?: number }) =>
  typeof x.lat === 'number' && typeof x.lng === 'number' && Number.isFinite(x.lat) && Number.isFinite(x.lng);

/** 参加する子の人数と、運転手に選べる世帯（D10：参加する子がいる世帯だけ）を数える */
export function summarizeInput(input: Pick<PlanInput, 'attendance' | 'drivers' | 'parking'>, players: Player[]) {
  const kidsByHousehold = new Map<string, number>();
  for (const p of players) {
    if (!p.active || !input.attendance[p.id]) continue;
    kidsByHousehold.set(p.householdId, (kidsByHousehold.get(p.householdId) ?? 0) + 1);
  }
  const participants = [...kidsByHousehold.values()].reduce((a, b) => a + b, 0);
  const eligibleDrivers = Object.entries(input.drivers)
    .filter(([hid]) => (kidsByHousehold.get(hid) ?? 0) > 0)
    .map(([householdId, capacity]) => ({ householdId, capacity: Math.max(0, Math.floor(capacity)) }))
    .sort((a, b) => (a.householdId < b.householdId ? -1 : a.householdId > b.householdId ? 1 : 0));
  const k = Math.min(Math.max(0, Math.floor(input.parking)), eligibleDrivers.length);
  const seats = eligibleDrivers.reduce((a, d) => a + d.capacity, 0);
  return { kidsByHousehold, participants, eligibleDrivers, k, seats };
}

/**
 * K 台で乗せられる子の最大人数。車を出す世帯の子は自分の車に乗るので、
 * 世帯ごとに「乗車可能人数 + 自分の子の人数」が大きい順に K 世帯選んだときが最大になる。
 */
export function maxCarriable(eligible: { householdId: string; capacity: number }[], kidsByHousehold: Map<string, number>, k: number) {
  return eligible
    .map((d) => d.capacity + (kidsByHousehold.get(d.householdId) ?? 0))
    .sort((a, b) => b - a)
    .slice(0, k)
    .reduce((a, b) => a + b, 0);
}

export function buildProblem(
  input: PlanInput,
  households: Household[],
  players: Player[],
  venue: Venue | undefined,
): BuildResult {
  const householdMap = new Map(households.map((h) => [h.id, h]));
  const validPlayers = players.filter((p) => householdMap.has(p.householdId));
  const { kidsByHousehold, participants, eligibleDrivers, k } = summarizeInput(input, validPlayers);

  if (participants === 0) {
    return { ok: false, error: { code: 'E01', message: '参加する選手がいません' } };
  }
  if (Math.floor(input.parking) <= 0 || eligibleDrivers.length === 0) {
    return { ok: false, error: { code: 'E02', message: '車を出せる世帯がありません（車を出せるのは参加する子がいる世帯だけです）' } };
  }
  const carriable = maxCarriable(eligibleDrivers, kidsByHousehold, k);
  if (carriable < participants) {
    return {
      ok: false,
      error: { code: 'E03', message: `乗車可能人数の合計が足りません（あと ${participants - carriable} 人分）` },
    };
  }
  if (!venue) {
    return { ok: false, error: { code: 'E05', message: '会場が選択されていません' } };
  }
  if (!hasCoords(venue)) {
    return { ok: false, error: { code: 'E05', message: `${venue.name}の住所の位置が確認できていません。マスタで確認してください` } };
  }

  const participatingHouseholds = [...kidsByHousehold.keys()].map((id) => householdMap.get(id)!).sort(byId);
  const missing = participatingHouseholds.filter((h) => !hasCoords(h));
  if (missing.length > 0) {
    return {
      ok: false,
      error: {
        code: 'E05',
        message: `${missing.map((h) => h.label).join('、')}の住所の位置が確認できていません。マスタで確認してください`,
      },
    };
  }

  const problem: Problem = {
    households: participatingHouseholds.map((h) => ({
      id: h.id,
      label: h.label,
      lat: h.lat!,
      lng: h.lng!,
      playerIds: validPlayers
        .filter((p) => p.householdId === h.id && p.active && input.attendance[p.id])
        .map((p) => p.id)
        .sort(),
    })),
    venue: { id: venue.id, name: venue.name, lat: venue.lat!, lng: venue.lng! },
    drivers: eligibleDrivers,
    parking: Math.floor(input.parking),
  };
  return { ok: true, problem };
}

/** 距離行列を求める地点の並び（世帯を ID 順、最後に会場） */
export function problemPoints(problem: Problem) {
  return [...problem.households.map((h) => ({ lat: h.lat, lng: h.lng })), { lat: problem.venue.lat, lng: problem.venue.lng }];
}

export function toSolverInput(problem: Problem, dist: number[][]): SolverInput {
  const index = new Map(problem.households.map((h, i) => [h.id, i]));
  return {
    kids: problem.households.map((h) => h.playerIds.length),
    drivers: problem.drivers
      .map((d) => ({ node: index.get(d.householdId)!, capacity: d.capacity }))
      .sort((a, b) => a.node - b.node),
    parking: problem.parking,
    dist: dist.map((row) => row.map((v) => Math.round(v))),
  };
}
