// 出発時刻・乗車時刻の計算（設計書 5.6：集合時間からの逆算）

import type { CarSchedule, ScheduleParams } from './types';
import type { SolverCar } from '../solver/types';

const DAY_MIN = 24 * 60;

/** "HH:MM" → 0 時からの分 */
export function parseTime(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`時刻の形式が正しくありません：${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 0 時からの分 → "H:MM"（前日にまたがる場合は 24 時間で折り返す） */
export function formatTime(min: number): string {
  const v = ((Math.floor(min) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

/**
 * 1 台の時刻を求める。duration は所要時間行列（秒、最後の番号が会場）。
 * 計算は秒単位で行い、表示用の分は切り捨てる（早めに出る側に丸める）。
 */
export function computeSchedule(car: SolverCar, duration: number[][], params: ScheduleParams): CarSchedule {
  const venue = duration.length - 1;
  const arriveSec = (parseTime(params.assemblyTime) - params.bufferMin) * 60;
  const dwellSec = params.dwellMin * 60;
  const travel = (i: number, j: number) => duration[i][j] * params.durationFactor;

  const stopSec: number[] = new Array(car.stops.length);
  let t = arriveSec;
  for (let i = car.stops.length - 1; i >= 0; i--) {
    const next = i === car.stops.length - 1 ? venue : car.stops[i + 1];
    t = t - travel(car.stops[i], next) - dwellSec;
    stopSec[i] = t;
  }
  const first = car.stops.length > 0 ? car.stops[0] : venue;
  const departSec = t - travel(car.driver, first);

  const toMin = (sec: number) => Math.floor(sec / 60 + 1e-9);
  return {
    departMin: toMin(departSec),
    stopMin: stopSec.map(toMin),
    arriveMin: toMin(arriveSec),
  };
}
