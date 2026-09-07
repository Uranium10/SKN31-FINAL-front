import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteAllProcurementNotifications,
  deleteProcurementNotification,
  listProcurementNotifications,
  subscribeProcurementEvents,
  type ProcurementEvent,
} from '../api/notifications';
import type { ProcurementNotification } from '../types';

interface UseProcurementNotificationsOptions {
  enabled: boolean;
  mockNotifications: ProcurementNotification[];
  onRealtimeEvent: (event: ProcurementEvent) => void;
}

/**
 * 서버의 PostgreSQL 알림함을 단일 원본으로 사용하는 프론트 알림 수신기입니다.
 * SSE는 목록 데이터를 직접 만들어내지 않고 변경 신호로만 사용합니다. 따라서
 * 재연결, 중복 이벤트, 접속 중단 후 복귀에도 최종 화면은 서버 목록과 일치합니다.
 */
export function useProcurementNotifications({
  enabled,
  mockNotifications,
  onRealtimeEvent,
}: UseProcurementNotificationsOptions) {
  const [notifications, setNotifications] = useState<ProcurementNotification[]>(
    enabled ? [] : mockNotifications,
  );
  const latestRequestRef = useRef(0);
  const refreshTimerRef = useRef<number | undefined>(undefined);
  const handledEventIdsRef = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const requestId = ++latestRequestRef.current;
    const next = await listProcurementNotifications();
    if (requestId === latestRequestRef.current) setNotifications(next);
  }, [enabled]);

  const scheduleRefresh = useCallback((delay = 100) => {
    if (!enabled) return;
    if (refreshTimerRef.current !== undefined) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = undefined;
      void refresh().catch(() => {
        // The durable inbox is retried by reconnect/focus without disrupting work.
      });
    }, delay);
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) {
      setNotifications(mockNotifications);
      return undefined;
    }

    void refresh().catch(() => {
      // The surrounding data loader already presents API availability errors.
    });
    return undefined;
  }, [enabled, mockNotifications, refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    let disposed = false;
    let controller: AbortController | null = null;
    let retryDelay = 1_000;
    let retryTimer: number | undefined;
    let finishRetryWait: (() => void) | undefined;

    const connect = async () => {
      while (!disposed) {
        controller = new AbortController();
        let connected = false;
        try {
          await subscribeProcurementEvents(
            controller.signal,
            (event) => {
              if (handledEventIdsRef.current.has(event.notification_id)) return;
              handledEventIdsRef.current.add(event.notification_id);
              if (handledEventIdsRef.current.size > 200) {
                const oldest = handledEventIdsRef.current.values().next().value;
                if (oldest) handledEventIdsRef.current.delete(oldest);
              }
              onRealtimeEvent(event);
              scheduleRefresh();
            },
            () => {
              connected = true;
              retryDelay = 1_000;
              scheduleRefresh(0);
            },
          );
        } catch {
          if (controller.signal.aborted || disposed) break;
        }
        if (disposed) break;
        const delay = connected ? 1_000 : retryDelay;
        retryDelay = Math.min(retryDelay * 2, 15_000);
        await new Promise<void>((resolve) => {
          finishRetryWait = resolve;
          retryTimer = window.setTimeout(resolve, delay);
        });
        finishRetryWait = undefined;
      }
    };

    void connect();
    return () => {
      disposed = true;
      controller?.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      finishRetryWait?.();
    };
  }, [enabled, onRealtimeEvent, scheduleRefresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    const recoverMissedNotifications = () => {
      if (document.visibilityState === 'visible') scheduleRefresh(0);
    };
    document.addEventListener('visibilitychange', recoverMissedNotifications);
    window.addEventListener('focus', recoverMissedNotifications);
    return () => {
      document.removeEventListener('visibilitychange', recoverMissedNotifications);
      window.removeEventListener('focus', recoverMissedNotifications);
      if (refreshTimerRef.current !== undefined) window.clearTimeout(refreshTimerRef.current);
    };
  }, [enabled, scheduleRefresh]);

  const remove = useCallback(async (notification: ProcurementNotification) => {
    const previous = notifications;
    latestRequestRef.current += 1;
    setNotifications((current) => current.filter((item) => item.id !== notification.id));
    if (!enabled) return;
    try {
      await deleteProcurementNotification(notification.id);
      scheduleRefresh(0);
    } catch (error) {
      setNotifications(previous);
      scheduleRefresh(0);
      throw error;
    }
  }, [enabled, notifications, scheduleRefresh]);

  const clearAll = useCallback(async () => {
    const previous = notifications;
    latestRequestRef.current += 1;
    setNotifications([]);
    if (!enabled) return;
    try {
      await deleteAllProcurementNotifications();
      scheduleRefresh(0);
    } catch (error) {
      setNotifications(previous);
      scheduleRefresh(0);
      throw error;
    }
  }, [enabled, notifications, scheduleRefresh]);

  const clearForReference = useCallback((reference: string) => {
    latestRequestRef.current += 1;
    setNotifications((current) => current.filter((notification) => (
      notification.reference !== reference && !notification.detail.includes(reference)
    )));
    // Workflow actions remove the matching case notifications transactionally.
    // Re-read shortly afterwards to cover PO-number notices and concurrent events.
    scheduleRefresh(100);
  }, [scheduleRefresh]);

  const pushMock = useCallback((
    notification: Omit<ProcurementNotification, 'id' | 'time' | 'unread'>,
  ) => {
    if (enabled) return;
    setNotifications((current) => [{
      ...notification,
      id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time: '방금 전',
      createdAt: new Date().toISOString(),
      unread: true,
    }, ...current]);
  }, [enabled]);

  return {
    notifications,
    refreshNotifications: refresh,
    removeNotification: remove,
    clearAllNotifications: clearAll,
    clearNotificationsForReference: clearForReference,
    pushMockNotification: pushMock,
  };
}
