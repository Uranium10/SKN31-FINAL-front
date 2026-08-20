import React from 'react';
import SailboatIcon from '../common/SailboatIcon';

export const Sidebar = ({
  sidebarCollapsed,
  setSidebarCollapsed,
  currentMode,
  setCurrentMode,
  sessions,
  activeSessionId,
  setActiveSessionId,
  handleCreateNewSession,
  handleDeleteSession,
  pipelinesCount,
  approvalsCount,
  handleLogout
}) => (
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

      {currentMode === 'chat' ? (
        /* Chat Mode Sidebar */
        <>
          <button className="new-chat-btn" onClick={handleCreateNewSession}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {!sidebarCollapsed && <span>새 채팅</span>}
          </button>

          {!sidebarCollapsed && (
            <div className="sidebar-quick-nav">
              <div className="quick-nav-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span>채팅 검색</span>
              </div>
              <div className="quick-nav-item" onClick={() => setCurrentMode('scheduler')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>Flow Scheduler</span>
              </div>
            </div>
          )}

          {!sidebarCollapsed && (
            <div className="sidebar-history-section">
              <div className="history-label">최근 대화</div>
              <div className="session-list">
                {sessions.map((sess) => (
                  <div
                    key={sess.id}
                    className={`session-item ${sess.id === activeSessionId ? 'active' : ''}`}
                    onClick={() => setActiveSessionId(sess.id)}
                  >
                    <span className="session-title-text">{sess.title}</span>
                    <button
                      className="session-delete-btn"
                      onClick={(e) => handleDeleteSession(sess.id, e)}
                      title="대화 삭제"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
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
      )}
    </div>

    {/* Sidebar Footer */}
    <div className="sidebar-footer">
      {!sidebarCollapsed ? (
        <>
          <div className="user-profile-info">
            <div className="user-avatar">A</div>
            <div className="user-meta">
              <span className="user-email-text">Administrator</span>
              <span className="user-role-badge">Procurement Team</span>
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

export default Sidebar;
