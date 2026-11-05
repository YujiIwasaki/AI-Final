// ④ 設定：費用単価、バックアップの書き出しと読み込み、全データ削除、外部サービスの出典表示

import { useEffect, useState } from 'react';
import { getSettings, saveSettings } from '../storage/db';
import { DEFAULT_SETTINGS, type Settings } from '../domain/types';
import { deleteAll, downloadJson, exportAll, importAll, parseBackup } from '../storage/backup';
import sample from '../../sample_data/sample.json';
import { todayIso } from './format';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const doImport = async (file: File) => {
    try {
      const data = parseBackup(await file.text());
      if (!confirm('今のデータはすべて置き換えられます。読み込みますか？')) return;
      await importAll(data);
      setSettings(await getSettings());
      setMessage({ kind: 'info', text: `読み込みました（世帯 ${data.households.length}・選手 ${data.players.length}・計画 ${data.planResults.length}）` });
    } catch (e) {
      setMessage({ kind: 'error', text: `読み込めませんでした：${(e as Error).message}` });
    }
  };

  const loadSample = async () => {
    if (!confirm('今のデータはすべてサンプルデータに置き換えられます。よろしいですか？')) return;
    await importAll(parseBackup(JSON.stringify(sample)));
    setSettings(await getSettings());
    setMessage({ kind: 'info', text: 'サンプルデータを読み込みました（架空の名前と町丁目までの住所です）' });
  };

  return (
    <>
      <h1>設定</h1>
      {message && <div className={`msg ${message.kind}`}>{message.text}</div>}

      {settings && (
        <>
          <div className="card">
            <h2>費用負担の単価</h2>
            <NumberSetting
              settings={settings}
              onChange={setSettings}
              field="unitPriceYenPerKm"
              unit="円/km"
              help="負担額 = 区間の往復距離(km) × 単価。初期値 17 円/km はガソリン 170 円/L・燃費 10 km/L の想定です。"
            />
          </div>

          <div className="card">
            <h2>出発時刻の計算</h2>
            <NumberSetting
              settings={settings}
              onChange={setSettings}
              field="durationFactor"
              label="補正係数"
              unit="倍"
              step={0.1}
              help="地図サービスの所要時間は信号待ちや渋滞を含まず短めに出るため、この倍率を掛けます。実際にかかった時間と比べて調整してください。"
            />
            <NumberSetting
              settings={settings}
              onChange={setSettings}
              field="dwellMin"
              label="乗車時間"
              unit="分"
              help="子を乗せる家 1 か所あたりに見込む時間です。"
            />
            <NumberSetting
              settings={settings}
              onChange={setSettings}
              field="bufferMin"
              label="余裕時間"
              unit="分"
              help="会場到着の目標 = 集合時間 − 余裕時間。配車計画の画面で試合ごとに変えることもできます。"
            />
            <button
              className="small"
              onClick={async () => {
                const next = { ...settings, durationFactor: DEFAULT_SETTINGS.durationFactor, dwellMin: DEFAULT_SETTINGS.dwellMin, bufferMin: DEFAULT_SETTINGS.bufferMin };
                setSettings(next);
                await saveSettings(next);
              }}
            >
              初期値（1.3 倍・5 分・15 分）に戻す
            </button>
            <p className="muted">設定は新しく作る計画から反映されます。</p>
          </div>
        </>
      )}

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

function NumberSetting({
  settings,
  onChange,
  field,
  label,
  unit,
  step = 1,
  help,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  field: keyof Settings;
  label?: string;
  unit: string;
  step?: number;
  help: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row">
        {label && <span style={{ minWidth: '5em' }}>{label}</span>}
        <input
          type="number"
          min={0}
          step={step}
          value={settings[field]}
          onChange={(e) => onChange({ ...settings, [field]: Number(e.target.value) })}
          onBlur={() => saveSettings(settings)}
        />
        {unit}
      </div>
      <p className="muted" style={{ margin: '2px 0 0' }}>
        {help}
      </p>
    </div>
  );
}
