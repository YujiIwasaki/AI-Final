// ② 結果：地図・車ごとの立ち寄り順と距離・子どもごとの区間往復距離と負担額・共有テキスト

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../storage/db';
import type { PlanResult } from '../domain/types';
import { RouteMap, type RouteMapCar } from './maps';
import { carColor, dateJa, km, yen } from './format';

export default function ResultPage({ resultId, onSelect }: { resultId?: string; onSelect: (id: string) => void }) {
  const results = useLiveQuery(() => db.planResults.orderBy('createdAt').reverse().toArray(), []);
  if (!results) return <p className="muted">読み込み中…</p>;
  if (results.length === 0) {
    return (
      <>
        <h1>結果</h1>
        <div className="card">まだ計画がありません。「配車計画」で計画を作成してください。</div>
      </>
    );
  }
  const result = results.find((r) => r.id === resultId) ?? results[0];
  return (
    <>
      <h1>結果</h1>
      <div className="card row">
        <label className="field grow">
          計画の履歴
          <select value={result.id} onChange={(e) => onSelect(e.target.value)}>
            {results.map((r) => (
              <option key={r.id} value={r.id}>
                {dateJa(r.inputSnapshot.input.matchDate)} {r.inputSnapshot.venue.name}（{new Date(r.createdAt).toLocaleString('ja-JP')} 作成）
              </option>
            ))}
          </select>
        </label>
        <button
          className="small danger"
          onClick={async () => {
            if (confirm('この計画を削除しますか？')) await db.planResults.delete(result.id);
          }}
        >
          削除
        </button>
      </div>
      <ResultView key={result.id} result={result} />
    </>
  );
}

function ResultView({ result }: { result: PlanResult }) {
  const { inputSnapshot: snap } = result;
  const household = useMemo(() => new Map(snap.households.map((h) => [h.id, h])), [snap]);
  const player = useMemo(() => new Map(snap.players.map((p) => [p.id, p])), [snap]);
  const label = (hid: string) => household.get(hid)?.label ?? '（削除された世帯）';
  const kidsOf = (hid: string) =>
    result.riders.filter((r) => player.get(r.playerId)?.householdId === hid).map((r) => player.get(r.playerId)?.name ?? '');
  const carNo = new Map(result.cars.map((c, i) => [c.driverHouseholdId, i]));

  const mapCars: RouteMapCar[] = useMemo(
    () =>
      result.cars.map((c, i) => ({
        color: carColor(i),
        geometry: c.geometry,
        points: [c.driverHouseholdId, ...c.stops].map((hid) => {
          const h = household.get(hid)!;
          return { lat: h.lat!, lng: h.lng!, label: h.label };
        }),
      })),
    [result, household],
  );
  const venuePoint = useMemo(() => ({ lat: snap.venue.lat!, lng: snap.venue.lng!, label: snap.venue.name }), [snap]);

  // 兄弟は子ごとに表示し、世帯合計も併記する
  const householdTotals = new Map<string, { count: number; cost: number }>();
  for (const r of result.riders) {
    const hid = player.get(r.playerId)?.householdId ?? '';
    const t = householdTotals.get(hid) ?? { count: 0, cost: 0 };
    householdTotals.set(hid, { count: t.count + 1, cost: t.cost + r.costYen });
  }
  const ridersSorted = result.riders.slice().sort((a, b) => {
    const ca = carNo.get(a.driverHouseholdId)! - carNo.get(b.driverHouseholdId)!;
    if (ca !== 0) return ca;
    if (a.isOwnCar !== b.isOwnCar) return a.isOwnCar ? -1 : 1;
    return b.sectionDistanceM - a.sectionDistanceM;
  });

  const shareText = buildShareText(result, label, kidsOf);
  const [copied, setCopied] = useState(false);

  return (
    <>
      {result.timedOut && <div className="msg warn">時間打ち切りのため再現性が保証されません。</div>}
      <div className="card">
        <h2>
          {dateJa(snap.input.matchDate)} {snap.venue.name}
        </h2>
        <div className="stats">
          <Stat label="合計走行距離（片道）" value={km(result.totalDistanceM)} />
          <Stat label="使った台数" value={`${result.cars.length} 台`} />
          <Stat label="計算方法" value={result.method === 'exact' ? '厳密解' : '近似解'} />
          <Stat label="計算時間" value={`${(result.computeMs / 1000).toFixed(1)} 秒`} />
        </div>
      </div>

      <div className="card">
        <RouteMap cars={mapCars} venue={venuePoint} />
      </div>

      <div className="card">
        <h2>車ごと</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>車</th>
                <th>立ち寄り順</th>
                <th className="num">片道距離</th>
                <th className="num">乗車 / 定員</th>
              </tr>
            </thead>
            <tbody>
              {result.cars.map((c, i) => (
                <tr key={c.driverHouseholdId}>
                  <td>
                    <span className="swatch" style={{ background: carColor(i) }} />
                    {i + 1}号車
                  </td>
                  <td style={{ whiteSpace: 'normal' }}>
                    <b>{label(c.driverHouseholdId)}</b>（運転） → {c.stops.map((s) => `${label(s)} → `).join('')}会場
                  </td>
                  <td className="num">{km(c.distanceM)}</td>
                  <td className="num">
                    {c.load} / {c.capacity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>子どもごと</h2>
        <p className="muted">
          区間距離は乗車地点から会場までの走行距離。負担額 = 往復距離 × {snap.input.unitPriceYenPerKm} 円/km（仮ルール）
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>名前</th>
                <th>車</th>
                <th className="num">
                  区間<span className="sub">片道 / 往復</span>
                </th>
                <th className="num">負担額</th>
              </tr>
            </thead>
            <tbody>
              {ridersSorted.map((r) => {
                const p = player.get(r.playerId);
                const total = householdTotals.get(p?.householdId ?? '');
                return (
                  <tr key={r.playerId}>
                    <td className="wrap">
                      {p?.name ?? '（削除された選手）'}
                      {r.isOwnCar && <span className="sub">自分の家の車</span>}
                    </td>
                    <td>
                      <span className="swatch" style={{ background: carColor(carNo.get(r.driverHouseholdId)!) }} />
                      {carNo.get(r.driverHouseholdId)! + 1}
                    </td>
                    <td className="num">
                      {km(r.sectionDistanceM)}
                      <span className="sub">往復 {km(r.roundTripDistanceM)}</span>
                    </td>
                    <td className="num">
                      {yen(r.costYen)}
                      {total && total.count > 1 && !r.isOwnCar && <span className="sub">世帯計 {yen(total.cost)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>共有用テキスト</h2>
        <p className="muted">LINE などに貼り付けられます。住所は含めていません。</p>
        <pre className="share">{shareText}</pre>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(shareText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? 'コピーしました' : 'テキストをコピー'}
        </button>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

/** 共有テキストには名前と立ち寄り順だけを載せ、住所は載せない（設計書 6 章） */
function buildShareText(result: PlanResult, label: (hid: string) => string, kidsOf: (hid: string) => string[]) {
  const snap = result.inputSnapshot;
  const lines = [`【配車計画】${dateJa(snap.input.matchDate)} ${snap.venue.name}`];
  result.cars.forEach((c, i) => {
    lines.push('', `■ ${i + 1}号車　運転：${label(c.driverHouseholdId)}（${kidsOf(c.driverHouseholdId).join('・')}）`);
    c.stops.forEach((s, j) => lines.push(`  ${j + 1}. ${label(s)}（${kidsOf(s).join('・')}）`));
    lines.push('  → 会場');
  });
  return lines.join('\n');
}
