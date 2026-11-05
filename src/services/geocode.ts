// 国土地理院 住所検索 API。住所だけを送り、名前は送らない（設計書 6 章）。

import type { LatLng } from '../domain/types';

const ENDPOINT = 'https://msearch.gsi.go.jp/address-search/AddressSearch';

export type GeocodeResult = LatLng & { title: string };

export async function geocode(address: string): Promise<GeocodeResult> {
  const res = await fetch(`${ENDPOINT}?q=${encodeURIComponent(address)}`);
  if (!res.ok) throw new Error(`住所検索に失敗しました（${res.status}）`);
  const data = (await res.json()) as { geometry: { coordinates: [number, number] }; properties: { title: string } }[];
  if (!Array.isArray(data) || data.length === 0) throw new Error('住所が見つかりませんでした');
  const [lng, lat] = data[0].geometry.coordinates;
  return { lat, lng, title: data[0].properties.title };
}
