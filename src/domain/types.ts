// 設計書 3 章のデータ構造

export type LatLng = { lat: number; lng: number };

/** 世帯（兄弟は同じ世帯） */
export type Household = {
  id: string;
  label: string;
  address: string;
  lat?: number;
  lng?: number;
  geocodedAt?: string;
};

/** 選手 */
export type Player = {
  id: string;
  name: string;
  householdId: string;
  active: boolean;
};

/** 会場 */
export type Venue = {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  geocodedAt?: string;
  defaultParking: number;
};

/** 計画入力（試合ごと） */
export type PlanInput = {
  id: string;
  matchDate: string;
  venueId: string;
  parking: number;
  /** playerId → 参加するか */
  attendance: Record<string, boolean>;
  /** 車を出せる householdId → 乗車可能人数（運転手と自分の子を除く） */
  drivers: Record<string, number>;
  unitPriceYenPerKm: number;
  createdAt: string;
};

export type Car = {
  driverHouseholdId: string;
  /** 立ち寄る世帯IDの順番（運転手宅と会場は含めない） */
  stops: string[];
  capacity: number;
  /** 乗せる子の人数（自分の子は除く） */
  load: number;
  /** 運転手宅から会場までの片道距離 */
  distanceM: number;
  /** 地図に描く経路 [lat, lng] */
  geometry: [number, number][];
};

export type Rider = {
  playerId: string;
  driverHouseholdId: string;
  isOwnCar: boolean;
  /** 乗車地点から会場までの走行距離（片道） */
  sectionDistanceM: number;
  roundTripDistanceM: number;
  costYen: number;
};

/** 計算に使った入力一式（座標を含む）のコピー */
export type PlanSnapshot = {
  input: PlanInput;
  venue: Venue;
  households: Household[];
  players: Player[];
};

export type PlanResult = {
  id: string;
  inputId: string;
  inputSnapshot: PlanSnapshot;
  distanceMatrix: number[][];
  cars: Car[];
  riders: Rider[];
  totalDistanceM: number;
  method: 'exact' | 'heuristic';
  /** 55 秒の安全装置で打ち切ったか（このときは再現性を保証しない） */
  timedOut: boolean;
  computeMs: number;
  createdAt: string;
};

export type Settings = {
  unitPriceYenPerKm: number;
};

export const DEFAULT_SETTINGS: Settings = {
  // ガソリン 170 円/L、燃費 10 km/L を想定
  unitPriceYenPerKm: 17,
};

export type ErrorCode = 'E01' | 'E02' | 'E03' | 'E04' | 'E05' | 'E06';

export type PlanError = { code: ErrorCode; message: string };

/** 計算対象に正規化した問題（ID 順に並べ、参加する世帯だけを残したもの） */
export type Problem = {
  households: {
    id: string;
    label: string;
    lat: number;
    lng: number;
    /** 参加する子の playerId（ID 順） */
    playerIds: string[];
  }[];
  venue: { id: string; name: string; lat: number; lng: number };
  /** 運転手に選べる世帯（参加する子がいる世帯のみ・ID 順） */
  drivers: { householdId: string; capacity: number }[];
  parking: number;
};
