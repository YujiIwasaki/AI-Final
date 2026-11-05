// Leaflet ＋ 地理院タイル。出典の表示が必要（設計書 2.2、6 章）。

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { LatLng } from '../domain/types';

const GSI_TILE = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';
const GSI_ATTRIBUTION = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';
const OSRM_ATTRIBUTION = '経路: <a href="https://project-osrm.org/" target="_blank" rel="noopener">OSRM</a> / © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';

function createMap(el: HTMLElement, withRouteAttribution: boolean) {
  const map = L.map(el, { zoomControl: true });
  L.tileLayer(GSI_TILE, {
    maxZoom: 18,
    attribution: withRouteAttribution ? `${GSI_ATTRIBUTION} | ${OSRM_ATTRIBUTION}` : GSI_ATTRIBUTION,
  }).addTo(map);
  return map;
}

export function pinIcon(text: string, color: string, size = 26, venue = false) {
  return L.divIcon({
    className: '',
    html: `<div class="pin${venue ? ' venue' : ''}" style="width:${size}px;height:${size}px;background:${color}">${text}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export type RouteMapCar = {
  color: string;
  geometry: [number, number][];
  /** 運転手宅を先頭にした立ち寄り順 */
  points: (LatLng & { label: string })[];
};

/** 結果画面：車ごとに色を分けた経路と、自宅（番号つき）と会場のピン */
export function RouteMap({ cars, venue }: { cars: RouteMapCar[]; venue: LatLng & { label: string } }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const map = createMap(el.current, true);
    const bounds = L.latLngBounds([[venue.lat, venue.lng]]);
    cars.forEach((car, ci) => {
      if (car.geometry.length > 1) {
        L.polyline(car.geometry, { color: car.color, weight: 5, opacity: 0.8 }).addTo(map);
        car.geometry.forEach((p) => bounds.extend(p));
      }
      car.points.forEach((p, i) => {
        const text = i === 0 ? `${ci + 1}` : `${ci + 1}-${i}`;
        L.marker([p.lat, p.lng], { icon: pinIcon(text, car.color, i === 0 ? 30 : 26) })
          .bindTooltip(i === 0 ? `${ci + 1}号車 ${p.label}（運転）` : `${ci + 1}号車 ${i}番目 ${p.label}`)
          .addTo(map);
        bounds.extend([p.lat, p.lng]);
      });
    });
    L.marker([venue.lat, venue.lng], { icon: pinIcon('会', '#222', 30, true) }).bindTooltip(venue.label).addTo(map);
    map.fitBounds(bounds, { padding: [24, 24] });
    return () => {
      map.remove();
    };
  }, [cars, venue]);
  return <div ref={el} className="map" />;
}

/** マスタ画面：ピンをドラッグして位置を修正する */
export function PinEditor({ value, onChange }: { value: LatLng; onChange: (p: LatLng) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!el.current) return;
    const map = createMap(el.current, false);
    map.setView([value.lat, value.lng], 16);
    const marker = L.marker([value.lat, value.lng], { draggable: true, icon: pinIcon('●', '#1e6b3a', 26) }).addTo(map);
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      onChangeRef.current({ lat: p.lat, lng: p.lng });
    });
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    return () => {
      map.remove();
    };
    // 初期位置だけで地図をつくる（ドラッグのたびに作り直さない）
  }, []);
  return <div ref={el} className="map small" />;
}
