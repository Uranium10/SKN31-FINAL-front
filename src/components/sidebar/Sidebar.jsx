import React from 'react';
import SailboatIcon from '../common/SailboatIcon';

export const Sidebar = ({
  sidebarCollapsed,
  setSidebarCollapsed,
  currentMode,
  pipelinesCount,
  approvalsCount,
  operationCounts,
  currentUser,
  handleLogout
}) => {
  const displayName = currentUser?.full_name || currentUser?.username || currentUser?.email || currentUser?.id || 'ERPNext 사용자';
  const accountId = currentUser?.id || currentUser?.username || currentUser?.email || '';
  const accountLabel = accountId && accountId !== displayName ? accountId : 'ERPNext 계정';
  const avatarLabel = displayName.trim().slice(0, 1).toUpperCase() || 'U';

  return (
  <aside className={`gemini-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
    <div className="sidebar-top">
      {/* Brand Header */}
      <div className="sidebar-brand-row">
        {!sidebarCollapsed && (
          <div className="brand-badge">
            <SailboatIcon className="sidebar-boat-icon" />
            <span>BiddingFlow</span>
          </div>
        )}
        <button
          className="toggle-sidebar-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {currentMode === 'scheduler' ? (
        /* Scheduler Mode Sidebar */
        <>
          <button className="new-chat-btn" onClick={() => alert('새 파이프라인 생성 마법사를 시작합니다.')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {!sidebarCollapsed && <span>새 스케줄러 등록</span>}
          </button>

          {!sidebarCollapsed && (
            <div className="sidebar-quick-nav">
              <div className="quick-nav-item active">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
                <span>전체 파이프라인 ({pipelinesCount})</span>
              </div>
              <div className="quick-nav-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>인간 승인 대기 ({approvalsCount})</span>
              </div>
              <div className="quick-nav-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
                <span>실시간 로그</span>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Operations Mode Sidebar */
        <>
          <div className="operations-listener">
            <i />
            {!sidebarCollapsed && <span><strong>MR 자동 수신 중</strong><small>ERPNext Webhook</small></span>}
          </div>

          {!sidebarCollapsed && (
            <div className="sidebar-quick-nav operations-nav">
              <div className="quick-nav-item active">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M7 8h10M7 12h7M7 16h5" />
                </svg>
                <span>통합 작업함</span>
                <small>{operationCounts.total}</small>
              </div>
              <div className="quick-nav-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                <span>확인 필요</span>
                <small>{operationCounts.needsAction}</small>
              </div>
              <div className="quick-nav-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M15 8l4 4-4 4" />
                </svg>
                <span>외부 응답 대기</span>
                <small>{operationCounts.waiting}</small>
              </div>
              <div className="quick-nav-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>최근 완료</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>

    {/* Sidebar Footer */}
    <div className="sidebar-footer">
      {!sidebarCollapsed ? (
        <>
          <div className="user-profile-info">
            <div className="user-avatar">{avatarLabel}</div>
            <div className="user-meta">
              <span className="user-email-text" title={displayName}>{displayName}</span>
              <span className="user-role-badge" title={`${accountLabel} · 구매 담당자`}>{accountLabel} · 구매 담당자</span>
            </div>
          </div>
          <button className="logout-icon-btn" onClick={handleLogout} title="로그아웃">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </>
      ) : (
        <button className="logout-icon-btn" onClick={handleLogout} title="로그아웃">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      )}
    </div>
  </aside>
  );
};

export default Sidebar;
