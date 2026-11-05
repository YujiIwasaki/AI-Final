// ④ 設定：費用単価、バックアップの書き出しと読み込み、全データ削除、外部サービスの出典表示

import { useEffect, useState } from 'react';
import { getSettings, saveSettings } from '../storage/db';
import { deleteAll, downloadJson, exportAll, importAll, parseBackup } from '../storage/backup';
import sample from '../../sample_data/sample.json';
import { todayIso } from './format';

export default function SettingsPage() {
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getSettings().then((s) => setUnitPrice(s.unitPriceYenPerKm));
  }, []);

  const doImport = async (file: File) => {
    try {
      const data = parseBackup(await file.text());
      if (!confirm('今のデータはすべて置き換えられます。読み込みますか？')) return;
      await importAll(data);
      setUnitPrice(data.settings?.unitPriceYenPerKm ?? unitPrice);
      setMessage({ kind: 'info', text: `読み込みました（世帯 ${data.households.length}・選手 ${data.players.length}・計画 ${data.planResults.length}）` });
    } catch (e) {
      setMessage({ kind: 'error', text: `読み込めませんでした：${(e as Error).message}` });
    }
  };

  const loadSample = async () => {
    if (!confirm('今のデータはすべてサンプルデータに置き換えられます。よろしいですか？')) return;
    await importAll(parseBackup(JSON.stringify(sample)));
    setUnitPrice(sample.settings.unitPriceYenPerKm);
    setMessage({ kind: 'info', text: 'サンプルデータを読み込みました（架空の名前と町丁目までの住所です）' });
  };

  return (
    <>
      <h1>設定</h1>
      {message && <div className={`msg ${message.kind}`}>{message.text}</div>}

      <div className="card">
        <h2>費用負担の単価</h2>
        <div className="row">
          <input
            type="number"
            min={0}
            value={unitPrice ?? ''}
            onChange={(e) => setUnitPrice(Number(e.target.value))}
            onBlur={() => unitPrice !== null && saveSettings({ unitPriceYenPerKm: unitPrice })}
          />
          円/km
        </div>
        <p className="muted">
          負担額 = 区間の往復距離(km) × 単価。初期値 17 円/km はガソリン 170 円/L・燃費 10 km/L の想定です。新しく作る計画から反映されます。
        </p>
      </div>

      <div className="card">
        <h2>バックアップ</h2>
        <p className="muted">
          データはこの端末のブラウザの中だけに保存されています。機種変更や PC との受け渡しは、バックアップファイルで行ってください。
        </p>
        <div className="row">
          <button
            className="primary"
            onClick={async () => downloadJson(await exportAll(), `carpool-backup-${todayIso()}.json`)}
          >
            書き出す
          </button>
          <label className="field">
            読み込む
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) doImport(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <div className="msg warn">
          iPhone の Safari は、サイトを 7 日間使わないと保存データを消すことがあります。共有ボタンから「ホーム画面に追加」して使い、定期的にバックアップを書き出してください。
        </div>
      </div>

      <div className="card">
        <h2>サンプルデータ</h2>
        <p className="muted">動作確認用に、架空の 12 世帯・14 人と会場を読み込みます。</p>
        <button onClick={loadSample}>サンプルデータを読み込む</button>
      </div>

      <div className="card">
        <h2>全データ削除</h2>
        <button
          className="danger"
          onClick={async () => {
            if (!confirm('この端末に保存したすべてのデータ（世帯・選手・会場・計画）を削除します。元に戻せません。')) return;
            if (!confirm('本当に削除しますか？')) return;
            await deleteAll();
            setMessage({ kind: 'info', text: 'すべてのデータを削除しました' });
          }}
        >
          すべて削除する
        </button>
      </div>

      <div className="card">
        <h2>外部サービスと出典</h2>
        <ul className="muted">
          <li>
            地図：<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>（国土地理院）
          </li>
          <li>住所検索：国土地理院 住所検索 API（住所だけを送信します）</li>
          <li>
            道路距離・経路：<a href="https://project-osrm.org/" target="_blank" rel="noopener">OSRM</a> 公開サーバー、地図データ ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>（座標だけを送信します）
          </li>
          <li>名前は外部に一切送信しません。渋滞は考慮していません。</li>
        </ul>
      </div>
    </>
  );
}
