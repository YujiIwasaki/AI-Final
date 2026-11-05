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
  /** 集合時間（HH:MM） */
  assemblyTime: string;
  /** 余裕時間（分）。会場到着の目標 = 集合時間 − 余裕時間 */
  bufferMin: number;
  /** 子を乗せる家 1 か所あたりの乗車時間（分） */
  dwellMin: number;
  /** 走行時間の補正係数 */
  durationFactor: number;
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
  schedule: CarSchedule;
};

/** 時刻はすべて「0 時からの分」 */
export type CarSchedule = {
  /** 運転手宅を出発する時刻 */
  departMin: number;
  /** 各立ち寄り先で子を乗せる時刻（stops と同じ順） */
  stopMin: number[];
  /** 会場に着く時刻（= 集合時間 − 余裕時間） */
  arriveMin: number;
};

export type Rider = {
  playerId: string;
  driverHouseholdId: string;
  isOwnCar: boolean;
  /** 乗車地点から会場までの走行距離（片道） */
  sectionDistanceM: number;
  roundTripDistanceM: number;
  costYen: number;
  /** 乗車する時刻（0 時からの分）。自分の家の車なら運転手宅の出発時刻 */
  pickupMin: number;
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
  /** 所要時間行列（秒・整数。補正係数を掛ける前の値） */
  durationMatrix: number[][];
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
  /** 以下は新しく作る計画の初期値（設計書 D13） */
  durationFactor: number;
  dwellMin: number;
  bufferMin: number;
};

export const DEFAULT_SETTINGS: Settings = {
  // ガソリン 170 円/L、燃費 10 km/L を想定
  unitPriceYenPerKm: 17,
  durationFactor: 1.3,
  dwellMin: 5,
  bufferMin: 15,
};

export type ScheduleParams = Pick<PlanInput, 'assemblyTime' | 'bufferMin' | 'dwellMin' | 'durationFactor'>;

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
