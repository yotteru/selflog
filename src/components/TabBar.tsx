export type Tab = 'home' | 'entries' | 'period' | 'settings';

const ICONS: Record<Tab, string> = {
  home: 'M4 11l8-7 8 7v9h-5v-6h-6v6H4z',
  entries: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  period: 'M3 20h18M6 16v-5M11 16V6M16 16v-8M21 16v-3',
  settings: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
};
const LABELS: Record<Tab, string> = { home: 'ホーム', entries: '記録一覧', period: '期間', settings: '設定' };

function TabButton({ tab, active, onSelect }: { tab: Tab; active: boolean; onSelect: (t: Tab) => void }) {
  return (
    <button type="button" className={`tab ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => onSelect(tab)}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICONS[tab]} />
      </svg>
      {LABELS[tab]}
    </button>
  );
}

/** 画面下の固定タブ：ホーム／記録一覧／＋記録（真ん中・大きい）／期間／設定 */
export function TabBar({ tab, onSelect, onRecord }: { tab: Tab; onSelect: (t: Tab) => void; onRecord: () => void }) {
  return (
    <nav className="tabbar" aria-label="メニュー">
      <TabButton tab="home" active={tab === 'home'} onSelect={onSelect} />
      <TabButton tab="entries" active={tab === 'entries'} onSelect={onSelect} />
      <button type="button" className="tab record" aria-label="記録を追加" onClick={onRecord}>
        <span className="record-circle">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        記録
      </button>
      <TabButton tab="period" active={tab === 'period'} onSelect={onSelect} />
      <TabButton tab="settings" active={tab === 'settings'} onSelect={onSelect} />
    </nav>
  );
}
