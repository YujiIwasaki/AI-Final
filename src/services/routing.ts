// OSRM 公開サーバー：道路距離行列（table）とルート形状（route）。座標だけを送る。
// デモ用サーバーのため、1 回の計画で table 1 回と route K 回にとどめ、結果は端末にキャッシュする（設計書 6 章）。

import type { LatLng } from '../domain/types';
import { getCache, putCache } from '../storage/db';

const BASE = 'https://router.project-osrm.org';

const coordList = (points: LatLng[]) => points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');

export class RoutingError extends Error {}

/** 片道・自動車の道路距離行列（メートル・整数） */
export async function getDistanceMatrix(points: LatLng[]): Promise<number[][]> {
  const coords = coordList(points);
  const key = `table:${coords}`;
  const cached = await getCache<number[][]>(key);
  if (cached) return cached;

  let data: { code: string; distances?: (number | null)[][] };
  try {
    const res = await fetch(`${BASE}/table/v1/driving/${coords}?annotations=distance`);
    data = await res.json();
  } catch {
    throw new RoutingError('通信エラー');
  }
  if (data.code !== 'Ok' || !data.distances) throw new RoutingError(`経路サービスのエラー（${data.code}）`);
  if (data.distances.some((row) => row.some((v) => v === null))) throw new RoutingError('道路でつながっていない地点があります');
  const matrix = data.distances.map((row) => row.map((v) => Math.round(v as number)));
  await putCache(key, matrix);
  return matrix;
}

/** 地図に描く経路（[lat, lng] の並び） */
export async function getRouteGeometry(points: LatLng[]): Promise<[number, number][]> {
  const coords = coordList(points);
  const key = `route:${coords}`;
  const cached = await getCache<[number, number][]>(key);
  if (cached) return cached;

  let data: { code: string; routes?: { geometry: { coordinates: [number, number][] } }[] };
  try {
    const res = await fetch(`${BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson`);
    data = await res.json();
  } catch {
    throw new RoutingError('通信エラー');
  }
  if (data.code !== 'Ok' || !data.routes?.length) throw new RoutingError(`経路サービスのエラー（${data.code}）`);
  const geometry = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
  await putCache(key, geometry);
  return geometry;
}
