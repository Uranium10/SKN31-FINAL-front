// UI-only navigation fixture: no API requests, approvals or server writes.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import '../src/procurement/ProcurementWorkspace.css';
import { Sidebar } from '../src/procurement/components/Sidebar';
import { DashboardView } from '../src/procurement/views/DashboardView';
import { initialMaterialRequests } from '../src/procurement/mock/data';
import type { NavigationTab } from '../src/procurement/types';
export function SidebarPreview() {
  const [tab, setTab] = useState<NavigationTab>('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  return <div className="procurement-shell">
    <Sidebar currentTab={tab} setCurrentTab={setTab} collapsed={collapsed} onToggleCollapsed={() => setCollapsed(value => !value)}
      pendingCount={0} stageTaskCounts={{ mr: 2, vendor: 3, po: 1 }} flashingStages={{ mr: false, vendor: false, po: false }}
      currentUser={{ full_name: '레이아웃 검증', email: 'qa@example.invalid' }} onLogout={() => {}} canManagePolicy />
    <main className="view-content" style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
      <p style={{ marginBottom: 20 }}>검증용 선택 화면: {tab}</p>
      <button type="button" onClick={() => setTab('vendor-select')}>외부에서 선정 화면 열기</button>
      {tab === 'dashboard' && <DashboardView requests={initialMaterialRequests} setCurrentTab={setTab} onOpenTask={target => setTab(target)} />}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<SidebarPreview />);
