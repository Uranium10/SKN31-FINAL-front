import React from 'react';
import {
  LayoutDashboard,
  PackagePlus,
  FileText,
  Users,
  ShoppingCart,
  Layers,
  LogOut,
  ChevronLeft,
  PanelLeftOpen,
} from 'lucide-react';
import SailboatIcon from '../../components/common/SailboatIcon';
import type { NavigationTab } from '../types';

interface SidebarProps {
  currentTab: NavigationTab;
  setCurrentTab: (tab: NavigationTab) => void;
  pendingCount: number;
  stageTaskCounts: {
    mr: number;
    vendor: number;
    po: number;
  };
  flashingStages: {
    mr: boolean;
    vendor: boolean;
    po: boolean;
  };
  currentUser: {
    id?: string;
    email?: string;
    username?: string;
    full_name?: string;
    user_type?: string;
  } | null;
  onLogout: () => void | Promise<void>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  pendingCount,
  stageTaskCounts,
  flashingStages,
  currentUser,
  onLogout,
  collapsed,
  onToggleCollapsed,
}) => {
  const displayName = currentUser?.full_name || currentUser?.username || currentUser?.id || 'ERPNext 사용자';
  const accountLabel = currentUser?.email || currentUser?.username || currentUser?.user_type || 'System User';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'U';

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      {!collapsed && (
        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={onToggleCollapsed}
          aria-label="사이드바 접기"
          title="사이드바 접기"
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {/* App Branding */}
      <div className="sidebar-header">
        <div className="logo-badge">
          <SailboatIcon className="sidebar-logo-icon" />
        </div>
        <div className="logo-text">
          <h1>BiddingFlow</h1>
          <span>AI Autonomous Procurement</span>
        </div>
        {collapsed && (
          <button
            type="button"
            className="sidebar-logo-reopen"
            onClick={onToggleCollapsed}
            aria-label="사이드바 펼치기"
            title="사이드바 펼치기"
          >
            <PanelLeftOpen size={18} />
          </button>
        )}
      </div>

      {/* Main Navigation Menu */}
      <div className="sidebar-section-label">메뉴</div>
      <ul className="nav-list">
        {/* 1-1) 대시보드 (MR 전체 단계 안내 포함) */}
        <li
          className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setCurrentTab('dashboard')}
          title="대시보드 - MR 전체 단계 (승인여부, 견적 진행율 %, PR 승인, PO 생성) 확인"
        >
          <div className="nav-item-left">
            <LayoutDashboard size={18} />
            <span>대시보드</span>
          </div>
          {pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
        </li>

        {/* ERPNext에 등록된 아이템 및 AI 규격 검증 결과 */}
        <li
          className={`nav-item ${currentTab === 'item-register' ? 'active' : ''}`}
          onClick={() => setCurrentTab('item-register')}
          title="아이템 목록"
        >
          <div className="nav-item-left">
            <PackagePlus size={18} />
            <span>아이템 목록</span>
          </div>
        </li>

        {/* 1-3) MR 목록 */}
        <li
          className={`nav-item ${currentTab === 'mr-list' ? 'active' : ''} ${flashingStages.mr ? 'has-new-work' : ''}`}
          onClick={() => setCurrentTab('mr-list')}
          title="MR 목록"
        >
          <div className="nav-item-left">
            <FileText size={18} />
            <span>MR 목록</span>
          </div>
          {stageTaskCounts.mr > 0 && (
            <span className="nav-badge" aria-label={`MR 새 작업 ${stageTaskCounts.mr}건`}>
              {stageTaskCounts.mr}
            </span>
          )}
        </li>

        {/* 1-4) 협력사 선정 */}
        <li
          className={`nav-item ${currentTab === 'vendor-select' ? 'active' : ''} ${flashingStages.vendor ? 'has-new-work' : ''}`}
          onClick={() => setCurrentTab('vendor-select')}
          title="협력사 선정"
        >
          <div className="nav-item-left">
            <Users size={18} />
            <span>협력사 선정</span>
          </div>
          {stageTaskCounts.vendor > 0 && (
            <span className="nav-badge" aria-label={`협력사 선정 새 작업 ${stageTaskCounts.vendor}건`}>
              {stageTaskCounts.vendor}
            </span>
          )}
        </li>

        {/* 1-5) PO 관리 */}
        <li
          className={`nav-item ${currentTab === 'po-manage' ? 'active' : ''} ${flashingStages.po ? 'has-new-work' : ''}`}
          onClick={() => setCurrentTab('po-manage')}
          title="PO 관리"
        >
          <div className="nav-item-left">
            <ShoppingCart size={18} />
            <span>PO 관리</span>
          </div>
          {stageTaskCounts.po > 0 && (
            <span className="nav-badge" aria-label={`PO 관리 새 작업 ${stageTaskCounts.po}건`}>
              {stageTaskCounts.po}
            </span>
          )}
        </li>
      </ul>

      {/* Process Stages Mini Indicator inside Sidebar */}
      {!collapsed && (
        <>
          <div className="sidebar-section-label">MR 단계 트래킹 시스템</div>
          <div
            className="sidebar-process-card"
            style={{
              backgroundColor: 'rgba(255,255,255,0.58)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontWeight: 600 }}>
              <Layers size={13} />
              <span>전체 프로세스 4단계</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div>1. 내 승인 여부</div>
              <div>2. 견적 회신 진행율 (%)</div>
              <div>3. 협력사 최종 선정</div>
              <div>4. PO 결재 및 생성</div>
            </div>
          </div>
        </>
      )}

      {/* User Info Footer */}
      <div className="sidebar-user">
        <div className="user-avatar">{initial}</div>
        <div className="user-info">
          <h4 title={displayName}>{displayName}</h4>
          <p title={accountLabel}>{accountLabel}</p>
        </div>
        <button
          type="button"
          className="sidebar-logout"
          onClick={() => void onLogout()}
          title="로그아웃"
          aria-label="로그아웃"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
};
