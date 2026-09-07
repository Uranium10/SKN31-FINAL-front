import React, { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, FileText, PackageSearch, Plus, Search, X } from 'lucide-react';
import type {
  GlobalSearchResult,
  NavigationTab,
  ProcurementNotification,
} from '../types';

interface HeaderProps {
  currentTab: NavigationTab;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: GlobalSearchResult[];
  notifications: ProcurementNotification[];
  onSelectSearchResult: (result: GlobalSearchResult) => void;
  onSelectNotification: (notification: ProcurementNotification) => void;
  onDismissNotification: (notification: ProcurementNotification) => void;
  onClearAllNotifications: () => void;
  onOpenNewMRModal: () => void;
}

const tabTitles: Record<NavigationTab, string> = {
  dashboard: '대시보드',
  'item-register': '아이템 목록',
  'mr-list': 'MR 목록',
  'vendor-select': '협력사 선정 (견적 비교 & AI 추천)',
  'po-manage': 'PO 관리',
};

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  searchQuery,
  setSearchQuery,
  searchResults,
  notifications,
  onSelectSearchResult,
  onSelectNotification,
  onDismissNotification,
  onClearAllNotifications,
  onOpenNewMRModal,
}) => {
  const [draftQuery, setDraftQuery] = useState(searchQuery);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((notification) => notification.unread).length;

  useEffect(() => {
    setDraftQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (draftQuery === searchQuery) return undefined;
    const timer = window.setTimeout(() => setSearchQuery(draftQuery), 200);
    return () => window.clearTimeout(timer);
  }, [draftQuery, searchQuery, setSearchQuery]);

  useEffect(() => {
    const closeFloatingMenus = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!searchRef.current?.contains(target)) setSearchOpen(false);
      if (!notificationRef.current?.contains(target)) setNotificationsOpen(false);
    };

    document.addEventListener('mousedown', closeFloatingMenus);
    return () => document.removeEventListener('mousedown', closeFloatingMenus);
  }, []);

  return (
    <header className="top-header">
      <div className="header-title-container">
        <h2>{tabTitles[currentTab]}</h2>
      </div>

      <div className="global-search" ref={searchRef}>
        <div className="search-box">
          <Search size={16} color="var(--text-muted)" />
          <input
            type="search"
            aria-label="MR 및 아이템 통합 검색"
            placeholder="MR / 품목명 / 아이템코드 검색..."
            value={draftQuery}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => {
              setDraftQuery(event.target.value);
              setSearchOpen(true);
            }}
          />
        </div>

        {searchOpen && draftQuery.trim() && (
          <div className="search-result-menu" role="listbox" aria-label="통합 검색 결과">
            <div className="floating-menu-head">
              <strong>검색 결과</strong>
              <span>{searchResults.length}건</span>
            </div>
            {searchResults.length > 0 ? (
              searchResults.map((result) => (
                <button
                  type="button"
                  className="search-result-item"
                  key={result.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSelectSearchResult(result);
                    setSearchOpen(false);
                  }}
                >
                  <span className="search-result-icon">
                    {result.type === 'item' ? <PackageSearch size={16} /> : <FileText size={16} />}
                  </span>
                  <span>
                    <strong>{result.title}</strong>
                    <small>{result.subtitle}</small>
                  </span>
                  <em>{result.type === 'item' ? 'ITEM' : 'MR'}</em>
                </button>
              ))
            ) : (
              <div className="floating-menu-empty">일치하는 아이템이나 MR이 없습니다.</div>
            )}
          </div>
        )}
      </div>

      <div className="header-actions">
        <div className="notification-center" ref={notificationRef}>
          <button
            type="button"
            className="icon-btn"
            title={`알림 (${unreadCount}건 안 읽음)`}
            aria-label={`알림 ${unreadCount}건 안 읽음`}
            aria-expanded={notificationsOpen}
            onClick={() => setNotificationsOpen((open) => !open)}
          >
            <Bell size={18} />
            {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}
          </button>

          {notificationsOpen && (
            <div className="notification-menu">
              <div className="floating-menu-head">
                <div>
                  <strong>알림</strong>
                  <span>{unreadCount}개 안 읽음</span>
                </div>
                {notifications.length > 0 && (
                  <button type="button" onClick={onClearAllNotifications}>
                    <CheckCheck size={14} /> 모두 지우기
                  </button>
                )}
              </div>
              <div className="notification-list">
                {notifications.length === 0 ? (
                  <div className="floating-menu-empty">새 알림이 없습니다.</div>
                ) : notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`notification-item ${notification.unread ? 'is-unread' : ''}`}
                  >
                    <button
                      type="button"
                      className="notification-item-main"
                      onClick={() => {
                        onSelectNotification(notification);
                        setNotificationsOpen(false);
                      }}
                    >
                      <i data-tone={notification.tone} />
                      <span>
                        <strong>{notification.title}</strong>
                        <small>{notification.detail}</small>
                        <time>{notification.time}</time>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="notification-dismiss"
                      aria-label={`${notification.title} 알림 삭제`}
                      title="알림 삭제"
                      onClick={() => onDismissNotification(notification)}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button className="btn-primary" onClick={onOpenNewMRModal}>
          <Plus size={16} />
          <span>신규 MR</span>
        </button>
      </div>
    </header>
  );
};
