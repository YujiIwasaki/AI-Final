import { describe, expect, it } from 'vitest';
import { computeSchedule, formatTime, parseTime } from '../src/domain/schedule';

// 番号 0 = 運転手宅、1 = A 家、2 = B 家、3 = 会場。所要時間は秒
const duration = [
  [0, 600, 9999, 1800],
  [9999, 0, 300, 1200],
  [9999, 9999, 0, 900],
  [9999, 9999, 9999, 0],
];
const params = { assemblyTime: '09:00', bufferMin: 15, dwellMin: 5, durationFactor: 1.3 };

describe('T11 出発時刻・乗車時刻が手計算の値と一致する', () => {
  it('設計書 5.6 の例：運転手宅 → A 家 10 分、A 家 → 会場 20 分', () => {
    // 到着目標 8:45。A 家 = 8:45 − 26 分 − 5 分 = 8:14、出発 = 8:14 − 13 分 = 8:01
    const s = computeSchedule({ driver: 0, stops: [1] }, duration, params);
    expect(formatTime(s.arriveMin)).toBe('8:45');
    expect(s.stopMin.map(formatTime)).toEqual(['8:14']);
    expect(formatTime(s.departMin)).toBe('8:01');
  });

  it('2 か所に寄る：運転手宅 → A 家 → B 家 → 会場', () => {
    // B 家 = 8:45 − 15×1.3(19.5 分) − 5 分 = 8:20:30 → 8:20
    // A 家 = 8:20:30 − 5×1.3(6.5 分) − 5 分 = 8:09:00 → 8:09
    // 出発 = 8:09:00 − 13 分 = 7:56
    const s = computeSchedule({ driver: 0, stops: [1, 2] }, duration, params);
    expect(s.stopMin.map(formatTime)).toEqual(['8:09', '8:20']);
    expect(formatTime(s.departMin)).toBe('7:56');
  });

  it('立ち寄り先のない車：到着目標 − 運転手宅から会場までの時間（乗車時間は見込まない）', () => {
    // 8:45 − 30×1.3(39 分) = 8:06
    const s = computeSchedule({ driver: 0, stops: [] }, duration, params);
    expect(s.stopMin).toEqual([]);
    expect(formatTime(s.departMin)).toBe('8:06');
  });

  it('分は切り捨てる（早めに出る側に丸める）', () => {
    // B 家から直接会場へ：8:45 − 15×1.3 分(19 分 30 秒) = 8:25:30 → 8:25 と表示
    const s = computeSchedule({ driver: 2, stops: [] }, duration, params);
    expect(formatTime(s.departMin)).toBe('8:25');
  });

  it('日付をまたぐ：集合 0:20 なら前日 23 時台に出発する', () => {
    const s = computeSchedule({ driver: 0, stops: [1] }, duration, { ...params, assemblyTime: '00:20' });
    // 到着目標 0:05 → A 家 23:34 → 出発 23:21
    expect(formatTime(s.arriveMin)).toBe('0:05');
    expect(s.stopMin.map(formatTime)).toEqual(['23:34']);
    expect(formatTime(s.departMin)).toBe('23:21');
  });

  it('時刻の変換', () => {
    expect(parseTime('9:05')).toBe(545);
    expect(parseTime('09:05')).toBe(545);
    expect(formatTime(545)).toBe('9:05');
    expect(formatTime(-1)).toBe('23:59');
    expect(() => parseTime('9時')).toThrow();
  });
});
