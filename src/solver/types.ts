// 最適化エンジンの入出力。世帯は 0..H-1 の番号で表し、会場は番号 H とする。

export type SolverInput = {
  /** 世帯ごとの参加する子の人数（すべて 1 以上） */
  kids: number[];
  /** 運転手に選べる世帯と乗車可能人数（node の昇順） */
  drivers: { node: number; capacity: number }[];
  parking: number;
  /** (H+1)×(H+1) の道路距離行列（メートル・整数）。最後の行と列が会場 */
  dist: number[][];
};

export type SolverCar = {
  driver: number;
  /** 立ち寄る世帯の番号の順番 */
  stops: number[];
};

export type SolverMethod = 'exact' | 'heuristic';

export type SolverOutput =
  | {
      feasible: true;
      /** driver の昇順 */
      cars: SolverCar[];
      totalDistanceM: number;
      method: SolverMethod;
      timedOut: boolean;
      computeMs: number;
    }
  | {
      feasible: false;
      method: SolverMethod;
      timedOut: boolean;
      computeMs: number;
    };
