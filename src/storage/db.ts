// 端末内保存（IndexedDB）。個人情報はこの端末の外には保存しない（設計書 6 章）。

import Dexie, { type Table } from 'dexie';
import { DEFAULT_SETTINGS, type Household, type PlanInput, type PlanResult, type Player, type Settings, type Venue } from '../domain/types';

type KeyValue = { key: string; value: unknown };

class AppDB extends Dexie {
  households!: Table<Household, string>;
  players!: Table<Player, string>;
  venues!: Table<Venue, string>;
  planInputs!: Table<PlanInput, string>;
  planResults!: Table<PlanResult, string>;
  /** 距離行列・ルート形状のキャッシュ（キーは座標の並び） */
  cache!: Table<KeyValue, string>;
  settings!: Table<KeyValue, string>;

  constructor() {
    super('carpool-optimizer');
    this.version(1).stores({
      households: 'id',
      players: 'id, householdId',
      venues: 'id',
      planInputs: 'id, createdAt',
      planResults: 'id, createdAt, inputId',
      cache: 'key',
      settings: 'key',
    });
  }
}

export const db = new AppDB();

// randomUUID は https か localhost でしか使えないため、LAN 内の http で試すとき用に代わりの作り方を用意する
export const newId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
        (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
      );

export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function saveSettings(settings: Settings) {
  await db.settings.put({ key: 'settings', value: settings });
}

export async function getCache<T>(key: string): Promise<T | undefined> {
  return (await db.cache.get(key))?.value as T | undefined;
}

export async function putCache(key: string, value: unknown) {
  await db.cache.put({ key, value });
}
