// ① 配車計画：試合日・会場・駐車可能台数 → 参加可否 → 車出し可否と乗車可能人数 → 「計画を作成」

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, newId } from '../storage/db';
import type { PlanError, PlanInput } from '../domain/types';
import { maxCarriable, summarizeInput } from '../domain/validate';
import { createPlan, PROGRESS_LABEL, type Progress } from '../planner';
import { byLabel, todayIso } from './format';
import { formatTime, parseTime } from '../domain/schedule';

const arrivalLabel = (assemblyTime: string, bufferMin: number) => {
  try {
    return formatTime(parseTime(assemblyTime) - bufferMin);
  } catch {
    return '—';
  }
};

const DEFAULT_CAPACITY = 3;

const DEFAULT_ASSEMBLY_TIME = '09:00';

// 単価・乗車時間・補正係数は「計画を作成」を押した時点の設定値を使う
type Draft = Omit<PlanInput, 'id' | 'createdAt' | 'unitPriceYenPerKm' | 'dwellMin' | 'durationFactor'>;

export default function PlanPage({ onCreated, onGoMaster }: { onCreated: (resultId: string) => void; onGoMaster: () => void }) {
  const households = useLiveQuery(() => db.households.toArray(), []);
  const players = useLiveQuery(() => db.players.toArray(), []);
  const venues = useLiveQuery(() => db.venues.toArray(), []);
  // 読み込み中は undefined、前回の入力がなければ null
  const lastInput = useLiveQuery(async () => (await db.planInputs.orderBy('createdAt').last()) ?? null, []);
  const settings = useLiveQuery(() => getSettings(), []);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<PlanError | null>(null);

  // 初期値：全員参加、最初の会場とその駐車可能台数、前回の集合時間、設定画面の余裕時間
  useEffect(() => {
    if (draft || !players || !venues || !settings || lastInput === undefined) return;
    const venue = venues[0];
    setDraft({
      matchDate: todayIso(),
      venueId: venue?.id ?? '',
      parking: venue?.defaultParking ?? 1,
      attendance: Object.fromEntries(players.filter((p) => p.active).map((p) => [p.id, true])),
      drivers: {},
      assemblyTime: lastInput?.assemblyTime ?? DEFAULT_ASSEMBLY_TIME,
      bufferMin: settings.bufferMin,
    });
  }, [draft, players, venues, settings, lastInput]);

  const activePlayers = useMemo(() => (players ?? []).filter((p) => p.active), [players]);
  const groups = useMemo(
    () =>
      (households ?? [])
        .slice()
        .sort(byLabel)
        .map((h) => ({ household: h, kids: activePlayers.filter((p) => p.householdId === h.id).sort((a, b) => a.name.localeCompare(b.name, 'ja')) }))
        .filter((g) => g.kids.length > 0),
    [households, activePlayers],
  );

  if (!households || !players || !venues || !draft) return <p className="muted">読み込み中…</p>;

  if (activePlayers.length === 0 || venues.length === 0) {
    return (
      <>
        <h1>配車計画</h1>
        <div className="card">
          <p>はじめに、マスタで世帯・選手・会場を登録してください。</p>
          <p className="muted">設定画面から、動作確認用のサンプルデータを読み込むこともできます。</p>
          <button className="primary" onClick={onGoMaster}>
            マスタへ
          </button>
        </div>
      </>
    );
  }

  const summary = summarizeInput(draft, players);
  const carriable = maxCarriable(summary.eligibleDrivers, summary.kidsByHousehold, summary.k);
  const shortage = summary.participants - carriable;
  const running = progress !== null;

  const update = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setError(null);
  };
  const setAttend = (playerId: string, v: boolean) => update({ attendance: { ...draft.attendance, [playerId]: v } });
  const setDrive = (householdId: string, v: boolean) => {
    const drivers = { ...draft.drivers };
    if (v) drivers[householdId] = drivers[householdId] ?? DEFAULT_CAPACITY;
    else delete drivers[householdId];
    update({ drivers });
  };
  const setCapacity = (householdId: string, v: number) => update({ drivers: { ...draft.drivers, [householdId]: Math.max(0, v) } });

  const copyLast = () => {
    if (!lastInput) return;
    update({
      venueId: venues.some((v) => v.id === lastInput.venueId) ? lastInput.venueId : draft.venueId,
      parking: lastInput.parking,
      attendance: { ...lastInput.attendance },
      drivers: { ...lastInput.drivers },
      assemblyTime: lastInput.assemblyTime ?? draft.assemblyTime,
      bufferMin: lastInput.bufferMin ?? draft.bufferMin,
    });
  };

  const run = async () => {
    setError(null);
    const current = await getSettings();
    // 子が参加しない世帯の車出しは保存しない（D10）
    const drivers = Object.fromEntries(Object.entries(draft.drivers).filter(([hid]) => summary.kidsByHousehold.has(hid)));
    const input: PlanInput = {
      ...draft,
      drivers,
      id: newId(),
      unitPriceYenPerKm: current.unitPriceYenPerKm,
      dwellMin: current.dwellMin,
      durationFactor: current.durationFactor,
      createdAt: new Date().toISOString(),
    };
    try {
      const res = await createPlan(input, setProgress);
      if (res.ok) onCreated(res.result.id);
      else setError(res.error);
    } catch (e) {
      setError({ code: 'E06', message: `計画を作成できませんでした：${(e as Error).message}` });
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <h1>配車計画</h1>

      <div className="card">
        <div className="row">
          <label className="field">
            試合日
            <input type="date" value={draft.matchDate} onChange={(e) => update({ matchDate: e.target.value })} />
          </label>
          <label className="field grow">
            会場
            <select
              value={draft.venueId}
              onChange={(e) => {
                const v = venues.find((x) => x.id === e.target.value);
                update({ venueId: e.target.value, parking: v?.defaultParking ?? draft.parking });
              }}
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            駐車可能台数
            <input type="number" min={0} value={draft.parking} onChange={(e) => update({ parking: Number(e.target.value) })} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label className="field">
            集合時間
            <input type="time" value={draft.assemblyTime} onChange={(e) => update({ assemblyTime: e.target.value })} />
          </label>
          <label className="field">
            余裕時間（分）
            <input type="number" min={0} value={draft.bufferMin} onChange={(e) => update({ bufferMin: Math.max(0, Number(e.target.value)) })} />
          </label>
          <span className="muted grow" style={{ alignSelf: 'flex-end' }}>
            会場到着の目標：{arrivalLabel(draft.assemblyTime, draft.bufferMin)}
          </span>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="small" onClick={copyLast} disabled={!lastInput}>
            前回の入力を複製
          </button>
          <button className="small" onClick={() => update({ attendance: Object.fromEntries(activePlayers.map((p) => [p.id, true])) })}>
            全員参加
          </button>
          <button className="small" onClick={() => update({ attendance: {} })}>
            全員不参加
          </button>
        </div>
      </div>

      <div className="card">
        <h2>参加と車出し</h2>
        <p className="muted">乗車可能人数は、運転手と自分の子を除いた人数です。子が参加しない世帯は車を出せません。</p>
        {groups.map(({ household: h, kids }) => {
          const attending = kids.some((k) => draft.attendance[k.id]);
          const drives = h.id in draft.drivers;
          return (
            <div className="household" key={h.id}>
              <div className="household-head">
                <span className="household-name">{h.label}</span>
                <label className={`check${attending ? '' : ' disabled'}`}>
                  <input type="checkbox" checked={drives && attending} disabled={!attending} onChange={(e) => setDrive(h.id, e.target.checked)} />
                  車を出す
                </label>
                {drives && attending && (
                  <label className="check">
                    乗車可能
                    <input type="number" min={0} value={draft.drivers[h.id]} onChange={(e) => setCapacity(h.id, Number(e.target.value))} />人
                  </label>
                )}
                {(h.lat === undefined || h.lng === undefined) && <span className="badge warn">位置未確認</span>}
              </div>
              <div className="kids">
                {kids.map((k) => (
                  <label className="check" key={k.id}>
                    <input type="checkbox" checked={!!draft.attendance[k.id]} onChange={(e) => setAttend(k.id, e.target.checked)} />
                    {k.name}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="summary">
        <div>
          参加 <b>{summary.participants}</b>人 / 車出し可 <b>{summary.eligibleDrivers.length}</b>台（使うのは {summary.k} 台）/ 空席合計 <b>{summary.seats}</b>席
        </div>
        {summary.participants > 0 && summary.k > 0 && shortage > 0 && (
          <div className="msg warn">乗車可能人数が足りません（あと {shortage} 人分）。車出しや乗車可能人数を見直してください。</div>
        )}
        {error && (
          <div className="msg error">
            {error.message}（{error.code}）
          </div>
        )}
        {running && <div className="msg info">{PROGRESS_LABEL[progress]}</div>}
        <button className="primary big" onClick={run} disabled={running || !draft.venueId || !draft.assemblyTime}>
          計画を作成
        </button>
      </div>
    </>
  );
}
