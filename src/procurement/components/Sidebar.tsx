import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  PackagePlus,
  FileText,
  Users,
  ShoppingCart,
  Layers,
  LogOut,
  ChevronLeft,
  ChevronDown,
  PanelLeftOpen,
  Settings,
  BrainCircuit,
} from 'lucide-react';
import SailboatIcon from '../../components/common/SailboatIcon';
import type { NavigationTab } from '../types';
import './Sidebar.css';

const WORK_STAGES = [
  { tab: 'mr-list', key: 'mr', label: 'MR 목록', icon: FileText },
  { tab: 'vendor-select', key: 'vendor', label: 'RFQ·협력사 선정', icon: Users },
  { tab: 'po-manage', key: 'po', label: 'PO 관리', icon: ShoppingCart },
] as const;

interface SidebarProps {
  canManagePolicy?: boolean;
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
  canManagePolicy = false,
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
  const [workExpanded, setWorkExpanded] = useState(true);
  const isWorkTab = WORK_STAGES.some(stage => stage.tab === currentTab);
  const newWorkCount = stageTaskCounts.mr + stageTaskCounts.vendor + stageTaskCounts.po;
  // Dashboard/deep-link navigation also reveals the selected child screen.
  useEffect(() => {
    if (WORK_STAGES.some(stage => stage.tab === currentTab)) setWorkExpanded(true);
  }, [currentTab]);

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

        {/* One purchase workflow, three destinations. Numbering is navigation
            order, not a claim that every MR has completed the earlier stage. */}
        <li className={`sidebar-work-group${isWorkTab ? ' has-active-stage' : ''}`}>
          {!collapsed && <button type="button" className="sidebar-work-heading"
            aria-expanded={workExpanded} aria-controls="sidebar-work-stages"
            onClick={() => setWorkExpanded(open => !open)}>
            <Layers size={18} aria-hidden="true" /><span>작업 목록</span>
            {!workExpanded && newWorkCount > 0 && <span className="nav-badge" aria-label={`새 작업 ${newWorkCount}건`}>{newWorkCount}</span>}
            <ChevronDown size={15} className={workExpanded ? '' : 'is-folded'} aria-hidden="true" />
          </button>}
          <ol id="sidebar-work-stages" className="sidebar-work-stages" aria-label="작업 목록 · 구매 진행 단계" hidden={!collapsed && !workExpanded}>
            {WORK_STAGES.map(({ tab, key, label, icon: Icon }, index) => <li key={tab}>
              <button type="button"
                className={`nav-item sidebar-work-stage ${currentTab === tab ? 'active' : ''} ${flashingStages[key] ? 'has-new-work' : ''}`}
                onClick={() => setCurrentTab(tab)} aria-current={currentTab === tab ? 'page' : undefined}
                title={`${index + 1}단계 · ${label}`} aria-label={`${index + 1}단계 · ${label}`}>
                <span className="sidebar-stage-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <span className="nav-item-left"><Icon size={18} aria-hidden="true" /><span>{label}</span></span>
                {stageTaskCounts[key] > 0 && <span className="nav-badge" aria-label={`${label} 새 작업 ${stageTaskCounts[key]}건`}>{stageTaskCounts[key]}</span>}
              </button>
            </li>)}
          </ol>
        </li>
        {canManagePolicy && <li>
          <button type="button" className={`nav-item ${currentTab === 'ai-decision-log' ? 'active' : ''}`}
            style={{ width: '100%', border: 0, textAlign: 'left', font: 'inherit' }}
            onClick={() => setCurrentTab('ai-decision-log')} title="AI 판단 근거 감사 로그">
            <div className="nav-item-left"><BrainCircuit size={18} /><span>AI 판단 로그</span></div>
          </button>
        </li>}
      </ul>

      {/* Keep administrator settings next to the account, outside task navigation. */}
      <div className="sidebar-account-footer">
        {canManagePolicy && (
          <button
            type="button"
            className={`sidebar-policy-link ${currentTab === 'company-policy' ? 'is-active' : ''}`}
            onClick={() => setCurrentTab('company-policy')}
            aria-label="회사 구매 정책"
            aria-current={currentTab === 'company-policy' ? 'page' : undefined}
            title="관리자 환경설정 · 회사 구매 정책"
          >
            <Settings size={17} aria-hidden="true" />
            <span>회사 구매 정책</span>
          </button>
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
      </div>
    </aside>
  );
};
