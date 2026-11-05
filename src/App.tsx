import { useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import PlanPage from './ui/PlanPage';
import ResultPage from './ui/ResultPage';
import MasterPage from './ui/MasterPage';
import SettingsPage from './ui/SettingsPage';

registerSW({ immediate: true });

type Tab = 'plan' | 'result' | 'master' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'plan', label: '配車計画', icon: '🗓' },
  { id: 'result', label: '結果', icon: '🚗' },
  { id: 'master', label: 'マスタ', icon: '👪' },
  { id: 'settings', label: '設定', icon: '⚙' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('plan');
  const [resultId, setResultId] = useState<string | undefined>();

  return (
    <>
      <main className="app">
        {tab === 'plan' && (
          <PlanPage
            onCreated={(id) => {
              setResultId(id);
              setTab('result');
            }}
            onGoMaster={() => setTab('master')}
          />
        )}
        {tab === 'result' && <ResultPage resultId={resultId} onSelect={setResultId} />}
        {tab === 'master' && <MasterPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span className="icon" aria-hidden>
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
