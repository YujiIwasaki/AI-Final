// 選手と世帯の CSV 一括登録（UTF-8 と Shift_JIS の両方に対応）
// 形式：1 行目は見出し「世帯名,住所,選手名」。兄弟は同じ世帯名・住所で複数行にする。

import type { Household, Player } from '../domain/types';
import { db, newId } from './db';

export function decodeCsv(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('shift_jis').decode(buffer);
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export type CsvImportSummary = { households: number; players: number; skipped: number };

export async function importPlayersCsv(text: string): Promise<CsvImportSummary> {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('CSV が空です');
  const header = rows[0].map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const [iHousehold, iAddress, iPlayer] = [col('世帯名'), col('住所'), col('選手名')];
  if (iHousehold < 0 || iAddress < 0 || iPlayer < 0) {
    throw new Error('1 行目に「世帯名,住所,選手名」の見出しが必要です');
  }

  const households = await db.households.toArray();
  const players = await db.players.toArray();
  const newHouseholds: Household[] = [];
  const newPlayers: Player[] = [];
  let skipped = 0;

  for (const r of rows.slice(1)) {
    const label = r[iHousehold]?.trim() ?? '';
    const address = r[iAddress]?.trim() ?? '';
    const name = r[iPlayer]?.trim() ?? '';
    if (!label || !name) {
      skipped++;
      continue;
    }
    let h = [...households, ...newHouseholds].find((x) => x.label === label && x.address === address);
    if (!h) {
      h = { id: newId(), label, address };
      newHouseholds.push(h);
    }
    const hid = h.id;
    if ([...players, ...newPlayers].some((p) => p.householdId === hid && p.name === name)) {
      skipped++;
      continue;
    }
    newPlayers.push({ id: newId(), name, householdId: hid, active: true });
  }

  await db.transaction('rw', db.households, db.players, async () => {
    await db.households.bulkAdd(newHouseholds);
    await db.players.bulkAdd(newPlayers);
  });
  return { households: newHouseholds.length, players: newPlayers.length, skipped };
}
