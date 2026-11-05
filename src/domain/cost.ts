// 区間距離と負担額（設計書 5.4）

import type { Car, Problem, Rider, ScheduleParams, Settings } from './types';
import { computeSchedule } from './schedule';
import type { SolverCar } from '../solver/types';
import { routeCost } from '../solver/common';

/**
 * 負担額の計算はこの関数 1 か所にまとめる。ガソリン代のルールが決まったら、ここだけを差し替える。
 * 仮ルール：負担額 = 往復距離(km) × 単価(円/km)、1 円未満は四捨五入。自分の家の車なら 0。
 */
export function calcCost(rider: Pick<Rider, 'isOwnCar' | 'roundTripDistanceM'>, settings: Pick<Settings, 'unitPriceYenPerKm'>): number {
  if (rider.isOwnCar) return 0;
  return Math.round((rider.roundTripDistanceM / 1000) * settings.unitPriceYenPerKm);
}

/** ソルバーの結果（番号）を、世帯 ID を使った車と子どもごとの結果（距離・負担額・時刻）に変換する */
export function buildCarsAndRiders(
  problem: Problem,
  dist: number[][],
  duration: number[][],
  solverCars: SolverCar[],
  settings: Pick<Settings, 'unitPriceYenPerKm'>,
  scheduleParams: ScheduleParams,
): { cars: Omit<Car, 'geometry'>[]; riders: Rider[] } {
  const venue = dist.length - 1;
  const capacityOf = new Map(problem.drivers.map((d) => [d.householdId, d.capacity]));
  const cars: Omit<Car, 'geometry'>[] = [];
  const riders: Rider[] = [];

  for (const sc of solverCars) {
    const driverHousehold = problem.households[sc.driver];
    const distanceM = routeCost(sc.driver, sc.stops, dist);
    const load = sc.stops.reduce((a, s) => a + problem.households[s].playerIds.length, 0);
    const schedule = computeSchedule(sc, duration, scheduleParams);
    cars.push({
      driverHouseholdId: driverHousehold.id,
      stops: sc.stops.map((s) => problem.households[s].id),
      capacity: capacityOf.get(driverHousehold.id) ?? 0,
      load,
      distanceM,
      schedule,
    });

    const pushRiders = (node: number, sectionDistanceM: number, isOwnCar: boolean, pickupMin: number) => {
      for (const playerId of problem.households[node].playerIds) {
        const base = {
          playerId,
          driverHouseholdId: driverHousehold.id,
          isOwnCar,
          sectionDistanceM,
          roundTripDistanceM: sectionDistanceM * 2,
        };
        riders.push({ ...base, costYen: calcCost(base, settings), pickupMin });
      }
    };

    // 運転手の子：区間距離 = 車の片道距離、負担額 = 0
    pushRiders(sc.driver, distanceM, true, schedule.departMin);

    // 立ち寄り先 si の子：d(si, si+1) + … + d(sm, 会場)
    let suffix = 0;
    const sections: number[] = new Array(sc.stops.length);
    for (let i = sc.stops.length - 1; i >= 0; i--) {
      const next = i === sc.stops.length - 1 ? venue : sc.stops[i + 1];
      suffix += dist[sc.stops[i]][next];
      sections[i] = suffix;
    }
    sc.stops.forEach((s, i) => pushRiders(s, sections[i], false, schedule.stopMin[i]));
  }
  return { cars, riders };
}
