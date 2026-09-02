import { fetchWithAuth } from '../../utils/auth';
import type { ProcurementNotification } from '../types';

interface NotificationDTO {
  notification_id: string;
  notification_type: string;
  title: string;
  message: string;
  payload?: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

const formatRelativeTime = (value: string): string => {
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return '방금 전';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}분 전`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}시간 전`;
  return new Date(value).toLocaleDateString('ko-KR');
};

export const listProcurementNotifications = async (): Promise<ProcurementNotification[]> => {
  const response = await fetchWithAuth('/api/procurement/notifications?limit=50');
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || '알림을 불러오지 못했습니다.');
  return ((body.items ?? []) as NotificationDTO[]).map((item) => {
    const stage = typeof item.payload?.stage === 'string' ? item.payload.stage : '';
    const workflowTarget = ['SUPPLIER_RECOMMENDATION', 'RFQ_TARGET_SELECTION', 'RFQ_SENDING', 'QUOTATION_COLLECTION', 'SUPPLIER_SELECTION', 'ORDER_START'].includes(stage)
      ? 'vendor-select'
      : ['PRE_PO_APPROVAL', 'PO_CREATION', 'DELIVERY', 'SCORECARD'].includes(stage)
        ? 'po-manage'
        : 'mr-list';
    return ({
    id: item.notification_id,
    title: item.title,
    detail: item.message,
    time: formatRelativeTime(item.created_at),
    unread: !item.is_read,
    targetTab: item.notification_type.startsWith('ITEM_')
      ? 'item-register'
      : item.notification_type === 'MATERIAL_REQUEST_CREATED'
        || item.notification_type === 'WORKFLOW_FAILED'
        || item.notification_type === 'SUBSTITUTE_SELECTED'
        ? 'mr-list'
      : item.notification_type === 'SUBSTITUTE_NEW_PURCHASE_REQUESTED'
        ? workflowTarget
      : item.notification_type.startsWith('PURCHASE_RECEIPT')
        ? 'po-manage'
      : item.notification_type === 'PURCHASE_ORDER_CANCELLED'
        ? 'po-manage'
      : item.notification_type.startsWith('QUOTATION_')
          ? 'vendor-select'
          : item.notification_type === 'WORKFLOW_INPUT_REQUIRED'
            ? workflowTarget
            : 'dashboard',
    reference: typeof item.payload?.item_code === 'string'
      ? item.payload.item_code
      : typeof item.payload?.po_name === 'string'
        ? item.payload.po_name
        : typeof item.payload?.mr_name === 'string'
          ? item.payload.mr_name
          : undefined,
    tone: ['PURCHASE_RECEIPT_COMPLETED', 'ITEM_VALIDATION_APPROVED', 'SUBSTITUTE_SELECTED'].includes(item.notification_type)
      ? 'success'
      : ['WORKFLOW_FAILED', 'PURCHASE_RECEIPT_REVERSED', 'PURCHASE_ORDER_CANCELLED'].includes(item.notification_type)
        ? 'danger'
      : ['ITEM_VALIDATION_REVIEW', 'WORKFLOW_INPUT_REQUIRED', 'SUBSTITUTE_NEW_PURCHASE_REQUESTED'].includes(item.notification_type)
        ? 'warning'
        : 'info',
    });
  });
};

export const deleteProcurementNotification = async (notificationId: string): Promise<void> => {
  const response = await fetchWithAuth(
    `/api/procurement/notifications/${encodeURIComponent(notificationId)}`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || '알림 삭제에 실패했습니다.');
  }
};

export const deleteAllProcurementNotifications = async (): Promise<void> => {
  const response = await fetchWithAuth('/api/procurement/notifications', { method: 'DELETE' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || '알림 전체 삭제에 실패했습니다.');
  }
};

export interface ProcurementEvent {
  notification_id: string;
  case_id?: string | null;
  notification_type: string;
  title: string;
  message: string;
}

export const subscribeProcurementEvents = async (
  signal: AbortSignal,
  onEvent: (event: ProcurementEvent) => void,
): Promise<void> => {
  const response = await fetchWithAuth('/api/procurement/events', {
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error('실시간 알림 채널에 연결하지 못했습니다.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const eventType = block.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim();
      const data = block.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim();
      if (eventType === 'notification' && data) {
        try {
          onEvent(JSON.parse(data) as ProcurementEvent);
        } catch {
          // Ignore one malformed frame and keep the long-lived stream alive.
        }
      }
      boundary = buffer.indexOf('\n\n');
    }
  }
};
