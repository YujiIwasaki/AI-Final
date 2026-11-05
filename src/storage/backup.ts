// JSON バックアップの書き出し・読み込みと全削除（設計書 3.3）

import type { Household, PlanInput, PlanResult, Player, Settings, Venue } from '../domain/types';
import { db, getSettings, saveSettings } from './db';

export type BackupFile = {
  app: 'carpool-optimizer';
  version: 1;
  exportedAt: string;
  households: Household[];
  players: Player[];
  venues: Venue[];
  planInputs: PlanInput[];
  planResults: PlanResult[];
  settings: Settings;
};

const tables = () => [db.households, db.players, db.venues, db.planInputs, db.planResults, db.settings];

export async function exportAll(): Promise<BackupFile> {
  return {
    app: 'carpool-optimizer',
    version: 1,
    exportedAt: new Date().toISOString(),
    households: await db.households.toArray(),
    players: await db.players.toArray(),
    venues: await db.venues.toArray(),
    planInputs: await db.planInputs.toArray(),
    planResults: await db.planResults.toArray(),
    settings: await getSettings(),
  };
}

export function parseBackup(text: string): BackupFile {
  const data = JSON.parse(text);
  if (data?.app !== 'carpool-optimizer' || data.version !== 1) {
    throw new Error('このアプリのバックアップファイルではありません');
  }
  for (const k of ['households', 'players', 'venues', 'planInputs', 'planResults'] as const) {
    if (!Array.isArray(data[k])) throw new Error(`バックアップの ${k} が読み取れません`);
  }
  return data as BackupFile;
}

/** 今のデータをすべて置き換える */
export async function importAll(data: BackupFile) {
  await db.transaction('rw', tables(), async () => {
    await Promise.all(tables().map((t) => t.clear()));
    await db.households.bulkPut(data.households);
    await db.players.bulkPut(data.players);
    await db.venues.bulkPut(data.venues);
    await db.planInputs.bulkPut(data.planInputs);
    await db.planResults.bulkPut(data.planResults);
    if (data.settings) await saveSettings(data.settings);
  });
}

export async function deleteAll() {
  await db.transaction('rw', [...tables(), db.cache], async () => {
    await Promise.all([...tables(), db.cache].map((t) => t.clear()));
  });
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
