// ③ マスタ：世帯・選手・会場の登録、編集、表示。住所から座標を求め、地図のピンで確認・修正する。CSV 取り込み。

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../storage/db';
import { decodeCsv, importPlayersCsv } from '../storage/csv';
import { geocode } from '../services/geocode';
import type { Household, LatLng, Player, Venue } from '../domain/types';
import { PinEditor } from './maps';
import { byLabel } from './format';

const hasCoords = (x: { lat?: number; lng?: number }) => typeof x.lat === 'number' && typeof x.lng === 'number';

async function locate<T extends Household | Venue>(item: T): Promise<T> {
  const r = await geocode(item.address);
  return { ...item, lat: r.lat, lng: r.lng, geocodedAt: new Date().toISOString() };
}

export default function MasterPage() {
  const households = useLiveQuery(() => db.households.toArray(), []);
  const players = useLiveQuery(() => db.players.toArray(), []);
  const venues = useLiveQuery(() => db.venues.toArray(), []);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!households || !players || !venues) return <p className="muted">読み込み中…</p>;
  const missing = [...households, ...venues].filter((x) => !hasCoords(x));

  const locateAll = async () => {
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const h of households.filter((x) => !hasCoords(x))) {
      try {
        await db.households.put(await locate(h));
        ok++;
      } catch {
        failed.push(h.label);
      }
      await new Promise((r) => setTimeout(r, 300)); // 外部 API に連続で負荷をかけない
    }
    for (const v of venues.filter((x) => !hasCoords(x))) {
      try {
        await db.venues.put(await locate(v));
        ok++;
      } catch {
        failed.push(v.name);
      }
    }
    setBusy(false);
    setMessage(
      failed.length
        ? { kind: 'error', text: `${ok} 件の位置を求めました。見つからなかった住所：${failed.join('、')}（住所を直すか、地図でピンを置いてください）` }
        : { kind: 'info', text: `${ok} 件の位置を求めました。地図でピンの位置を確認してください。` },
    );
  };

  const onCsv = async (file: File) => {
    try {
      const text = decodeCsv(await file.arrayBuffer());
      const s = await importPlayersCsv(text);
      setMessage({
        kind: 'info',
        text: `世帯 ${s.households} 件・選手 ${s.players} 人を登録しました${s.skipped ? `（重複・空行 ${s.skipped} 行はスキップ）` : ''}。位置の取得を行ってください。`,
      });
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
  };

  return (
    <>
      <h1>マスタ</h1>
      {message && <div className={`msg ${message.kind}`}>{message.text}</div>}

      <div className="card">
        <h2>一括操作</h2>
        <div className="row">
          <label className="field grow">
            CSV 取り込み（見出し：世帯名,住所,選手名／UTF-8・Shift_JIS）
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onCsv(f);
                e.target.value = '';
              }}
            />
          </label>
          <button onClick={locateAll} disabled={busy || missing.length === 0}>
            {busy ? '位置を取得中…' : `位置が未確認の ${missing.length} 件をまとめて取得`}
          </button>
        </div>
        <p className="muted">住所は位置を求めるために国土地理院の住所検索サービスへ送信します。名前は送信しません。</p>
      </div>

      <HouseholdSection households={households} players={players} />
      <VenueSection venues={venues} />
    </>
  );
}

// ---------------- 世帯・選手 ----------------

function HouseholdSection({ households, players }: { households: Household[]; players: Player[] }) {
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');

  const add = async () => {
    if (!label.trim() || !address.trim()) return;
    const h: Household = { id: newId(), label: label.trim(), address: address.trim() };
    await db.households.add(h);
    setLabel('');
    setAddress('');
    try {
      await db.households.put(await locate(h));
      setError('');
    } catch (e) {
      setError(`${h.label}：${(e as Error).message}。住所を直すか、地図でピンを置いてください。`);
    }
  };

  return (
    <div className="card">
      <h2>世帯と選手（{households.length} 世帯・{players.filter((p) => p.active).length} 人）</h2>
      <p className="muted">兄弟は同じ世帯に登録します。同じ世帯の子は同じ車に乗ります。</p>
      <div className="row">
        <input type="text" placeholder="表示名（例：山田家）" value={label} onChange={(e) => setLabel(e.target.value)} className="grow" />
        <input type="text" placeholder="自宅住所" value={address} onChange={(e) => setAddress(e.target.value)} className="grow" />
        <button className="primary" onClick={add} disabled={!label.trim() || !address.trim()}>
          世帯を追加
        </button>
      </div>
      {error && <div className="msg error">{error}</div>}
      <div style={{ marginTop: 8 }}>
        {households
          .slice()
          .sort(byLabel)
          .map((h) => (
            <HouseholdItem key={h.id} household={h} players={players.filter((p) => p.householdId === h.id)} />
          ))}
      </div>
    </div>
  );
}

function HouseholdItem({ household: h, players }: { household: Household; players: Player[] }) {
  const [editing, setEditing] = useState(false);
  const [newPlayer, setNewPlayer] = useState('');

  const addPlayer = async () => {
    if (!newPlayer.trim()) return;
    await db.players.add({ id: newId(), name: newPlayer.trim(), householdId: h.id, active: true });
    setNewPlayer('');
  };
  const remove = async () => {
    if (!confirm(`${h.label}と、その選手 ${players.length} 人を削除しますか？`)) return;
    await db.transaction('rw', db.households, db.players, async () => {
      await db.players.where('householdId').equals(h.id).delete();
      await db.households.delete(h.id);
    });
  };

  return (
    <div className="household">
      <div className="household-head">
        <span className="household-name">{h.label}</span>
        {hasCoords(h) ? <span className="badge">位置確認済</span> : <span className="badge warn">位置未確認</span>}
        <span className="muted grow">{h.address}</span>
        <button className="small" onClick={() => setEditing(!editing)}>
          {editing ? '閉じる' : '編集・地図'}
        </button>
      </div>
      <div className="kids">
        {players
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
          .map((p) => (
            <span key={p.id} className="check" style={{ opacity: p.active ? 1 : 0.5 }}>
              {p.name}
              {!p.active && '（退団）'}
              {editing && (
                <>
                  <button className="small" onClick={() => db.players.update(p.id, { active: !p.active })}>
                    {p.active ? '退団にする' : '在籍に戻す'}
                  </button>
                  <button
                    className="small danger"
                    onClick={() => confirm(`${p.name}を削除しますか？`) && db.players.delete(p.id)}
                  >
                    削除
                  </button>
                </>
              )}
            </span>
          ))}
      </div>
      {editing && (
        <div style={{ marginTop: 8 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <input type="text" placeholder="選手の名前" value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)} className="grow" />
            <button onClick={addPlayer} disabled={!newPlayer.trim()}>
              選手を追加
            </button>
          </div>
          <LocationEditor
            item={h}
            nameLabel="表示名"
            onSave={(patch) => db.households.update(h.id, patch)}
          />
          <button className="small danger" onClick={remove} style={{ marginTop: 8 }}>
            この世帯を削除
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------- 会場 ----------------

function VenueSection({ venues }: { venues: Venue[] }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [parking, setParking] = useState(4);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const add = async () => {
    if (!name.trim() || !address.trim()) return;
    const v: Venue = { id: newId(), name: name.trim(), address: address.trim(), defaultParking: parking };
    await db.venues.add(v);
    setName('');
    setAddress('');
    try {
      await db.venues.put(await locate(v));
      setError('');
    } catch (e) {
      setError(`${v.name}：${(e as Error).message}。住所を直すか、地図でピンを置いてください。`);
    }
  };

  return (
    <div className="card">
      <h2>会場（{venues.length} 件）</h2>
      <div className="row">
        <input type="text" placeholder="会場名" value={name} onChange={(e) => setName(e.target.value)} className="grow" />
        <input type="text" placeholder="住所" value={address} onChange={(e) => setAddress(e.target.value)} className="grow" />
        <label className="check">
          駐車
          <input type="number" min={0} value={parking} onChange={(e) => setParking(Number(e.target.value))} />台
        </label>
        <button className="primary" onClick={add} disabled={!name.trim() || !address.trim()}>
          会場を追加
        </button>
      </div>
      {error && <div className="msg error">{error}</div>}
      {venues.map((v) => (
        <div className="household" key={v.id}>
          <div className="household-head">
            <span className="household-name">{v.name}</span>
            {hasCoords(v) ? <span className="badge">位置確認済</span> : <span className="badge warn">位置未確認</span>}
            <span className="muted grow">
              {v.address}（駐車 {v.defaultParking} 台）
            </span>
            <button className="small" onClick={() => setEditingId(editingId === v.id ? null : v.id)}>
              {editingId === v.id ? '閉じる' : '編集・地図'}
            </button>
          </div>
          {editingId === v.id && (
            <div style={{ marginTop: 8 }}>
              <label className="check" style={{ marginBottom: 8 }}>
                駐車可能台数の初期値
                <input
                  type="number"
                  min={0}
                  defaultValue={v.defaultParking}
                  onBlur={(e) => db.venues.update(v.id, { defaultParking: Number(e.target.value) })}
                />
                台
              </label>
              <LocationEditor
                item={{ ...v, label: v.name }}
                nameLabel="会場名"
                onSave={(patch) => {
                  const { label, ...rest } = patch;
                  return db.venues.update(v.id, label !== undefined ? { ...rest, name: label } : rest);
                }}
              />
              <button
                className="small danger"
                style={{ marginTop: 8 }}
                onClick={() => confirm(`${v.name}を削除しますか？`) && db.venues.delete(v.id)}
              >
                この会場を削除
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------- 名前・住所・位置の編集（世帯と会場で共通） ----------------

type Locatable = { label: string; address: string; lat?: number; lng?: number };
type LocationPatch = Partial<Pick<Household, 'label' | 'address' | 'lat' | 'lng' | 'geocodedAt'>>;

function LocationEditor({ item, nameLabel, onSave }: { item: Locatable; nameLabel: string; onSave: (patch: LocationPatch) => unknown }) {
  const [label, setLabel] = useState(item.label);
  const [address, setAddress] = useState(item.address);
  const [status, setStatus] = useState('');
  const [mapKey, setMapKey] = useState(0);

  const relocate = async () => {
    setStatus('位置を求めています…');
    try {
      const r = await geocode(address);
      await onSave({ address, lat: r.lat, lng: r.lng, geocodedAt: new Date().toISOString() });
      setStatus(`「${r.title}」の位置に置きました。ずれていればピンを動かしてください。`);
      setMapKey((k) => k + 1);
    } catch (e) {
      setStatus(`${(e as Error).message}。地図をタップしてピンを置くこともできます。`);
    }
  };

  const fallback: LatLng = { lat: 35.681236, lng: 139.767125 }; // 位置未確認なら東京駅付近から
  const position = hasCoords(item) ? { lat: item.lat!, lng: item.lng! } : fallback;

  return (
    <div>
      <div className="row">
        <label className="field grow">
          {nameLabel}
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label.trim() && onSave({ label: label.trim() })} />
        </label>
        <label className="field grow">
          住所
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <button onClick={relocate} disabled={!address.trim()} style={{ alignSelf: 'flex-end' }}>
          住所から位置を求める
        </button>
      </div>
      {status && <p className="muted">{status}</p>}
      <p className="muted">ピンをドラッグするか、地図をタップして位置を修正できます。</p>
      <PinEditor
        key={mapKey}
        value={position}
        onChange={(p: LatLng) => onSave({ lat: p.lat, lng: p.lng, geocodedAt: new Date().toISOString() })}
      />
    </div>
  );
}
