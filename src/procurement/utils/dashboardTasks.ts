import type { MaterialRequest, NavigationTab, POItem } from '../types';
import type { WorkProgress } from '../api/workProgress';

export type TaskBucket = 'blocked' | 'attention' | 'processing' | 'waiting' | 'other';
export interface DashboardTask {
  request: MaterialRequest; bucket: TaskBucket; label: string; detail: string; tab: NavigationTab;
  priority: 0 | 1 | 2; urgency: 'danger' | 'warning' | 'neutral'; urgencyLabel: string;
  deadlineLabel: string; elapsedLabel: string; deadlineAt: number;
}

// UI observation threshold only, not a workflow timeout or automatic retry rule.
export const STALE_RUNNING_MS = 60 * 60_000;
const DAY = 86_400_000;
const KST = 9 * 60 * 60_000;
function timestamp(value?: string | null): number {
  if (!value) return NaN;
  const normalized = value.trim().replace(' ', 'T');
  // ERP datetime fields without an offset follow the site's Asia/Seoul timezone.
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : normalized + '+09:00');
}
function dayNumber(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const date = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value ? date / DAY : NaN;
}
function duration(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ''}`;
}

/** KST calendar dates and RFQ timestamps are kept distinct; no fabricated timers. */
function timeEvidence(request: MaterialRequest, now: number) {
  const today = Math.floor((now + KST) / DAY);
  const due = dayNumber(request.requestedDueDate ?? request.dueDate ?? '');
  const deadlines: { at: number; label: string; urgent: boolean; overdue: boolean }[] = [];
  if (Number.isFinite(due)) {
    const days = due - today;
    deadlines.push({ at: (due + 1) * DAY - KST - 1,
      label: days < 0 ? `납기 ${-days}일 지남` : days === 0 ? '납기 오늘' : `납기 D-${days}`,
      urgent: days <= 0, overdue: days < 0 });
  }
  // A previous round's deadline is irrelevant after supplier selection/order start.
  if (['QUOTATION_COLLECTION', 'SUPPLIER_SELECTION'].includes(request.workflowStage || '')) {
    const deadline = timestamp(request.quotationDeadlineAt);
    if (Number.isFinite(deadline)) deadlines.push({ at: deadline,
      label: deadline <= now ? `견적 마감 ${duration(now - deadline)} 경과` : `견적 마감 ${duration(deadline - now)} 남음`,
      urgent: Math.floor((deadline + KST) / DAY) <= today, overdue: deadline <= now });
  }
  deadlines.sort((a, b) => a.at - b.at);
  return { deadlineAt: deadlines[0]?.at ?? Infinity,
    deadlineLabel: deadlines.map(d => d.label).join(' · ') || '기한 미지정',
    urgent: deadlines.some(d => d.urgent), overdue: deadlines.some(d => d.overdue) };
}
const labels: Record<string, string> = {
  MR_REVIEW: '구매 요청 검토', ITEM_CHECK: '품목 확인', SUBSTITUTE_DECISION: '요청부서 응답 대기',
  BIDDING_DECISION: '구매 방식 확인', SUPPLIER_RECOMMENDATION: '공급사 탐색', RFQ_TARGET_SELECTION: '견적 요청 대상 선택',
  RFQ_SENDING: '견적 요청 발송', QUOTATION_COLLECTION: '견적 회신 대기', SUPPLIER_SELECTION: '최종 협력사 선택',
  ORDER_START: '발주 진행 확인', PRE_PO_APPROVAL: '발주 승인', PR_REQUEST: '발주 확인 요청', PR_SENDING: '발주 확인 요청 발송',
  PR_RESPONSE_WAITING: '공급사 응답 대기', PR_REJECTED: '공급사 반려 확인', PO_CREATION: '발주서 생성', DELIVERY: '입고 대기', HUMAN_REVIEW: '예외 확인 필요',
};
const poStages = new Set(['ORDER_START', 'PRE_PO_APPROVAL', 'PR_REQUEST', 'PR_SENDING', 'PR_RESPONSE_WAITING', 'PR_REJECTED', 'PO_CREATION', 'DELIVERY']);
const waits = new Set(['SUBSTITUTE_DECISION', 'QUOTATION_COLLECTION', 'PR_RESPONSE_WAITING', 'DELIVERY']);

export function dashboardStageLabel(stage?: string): string {
  return labels[stage || ''] || '상태 확인';
}

/** Classify once per MR. A human task for an external recipient is not buyer work. */
export function dashboardTasks(requests: MaterialRequest[], progress: WorkProgress[] = [], now = Date.now()): DashboardTask[] {
  const seen = new Set<string>();
  return requests.flatMap(request => {
    const status = request.workflowStatus ?? '';
    if (seen.has(request.mrNo) || ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(status) || (!status && request.status === '반려')) return [];
    seen.add(request.mrNo);
    const stage = request.workflowStage ?? '';
    const observed = progress.find(p => p.case_id === request.id && p.stage === stage && p.status === status);
    const updated = timestamp(observed?.updated_at || request.workflowUpdatedAt);
    const elapsed = Number.isFinite(updated) && updated <= now ? now - updated : undefined;
    const stale = ['RUNNING', 'QUEUED'].includes(status) && stage !== 'DELIVERY'
      && elapsed !== undefined && elapsed >= STALE_RUNNING_MS;
    const review = !!observed && ['QUOTATION_COLLECTION', 'SUPPLIER_SELECTION'].includes(stage)
      && ['BLOCKED', 'UNCERTAIN'].includes(observed.deadline_status || '');
    const tab: NavigationTab = poStages.has(stage) ? 'po-manage' : ['QUOTATION_COLLECTION', 'SUPPLIER_SELECTION'].includes(stage) ? 'vendor-select' : 'mr-list';
    let bucket: TaskBucket = 'other';
    let detail = request.pendingTask?.description || '상세 화면에서 현재 상태를 확인하세요.';
    if (request.workflowError || status === 'FAILED' || ['HUMAN_REVIEW', 'PR_REJECTED'].includes(stage)) {
      bucket = 'blocked'; detail = request.workflowError || '진행이 멈췄습니다. 사유를 확인해 주세요.';
    } else if (review || stale) {
      bucket = 'blocked'; detail = review ? observed?.waiting_reason || '자동 진행 조건을 점검해 주세요.'
        : '상태가 오랫동안 갱신되지 않았습니다. 실제 실행 상태를 확인해 주세요.';
    } else if (stage === 'DELIVERY' || (status === 'WAITING_INPUT' && waits.has(stage))) {
      bucket = 'waiting'; detail = stage === 'QUOTATION_COLLECTION' ? `견적 회신율 ${Math.round(request.processStage.quotationProgressPercent)}% · 회신과 마감 조건 확인 중`
        : stage === 'SUBSTITUTE_DECISION' ? '요청부서의 대체품 사용 여부를 기다립니다.' : stage === 'DELIVERY' ? '발주 후 입고를 기다립니다.' : '공급사의 발주 확인 응답을 기다립니다.';
    } else if (['RUNNING', 'QUEUED'].includes(status)) {
      bucket = 'processing'; detail = status === 'QUEUED' ? '실행 순서를 기다리고 있습니다.' : '시스템이 처리 중입니다. 완료되면 상태가 갱신됩니다.';
    } else if (request.pendingTask || status === 'WAITING_INPUT' || request.status === '승인대기') {
      bucket = 'attention'; detail = request.pendingTask?.description || '담당자의 검토 또는 선택이 필요합니다.';
    }
    const time = timeEvidence(request, now);
    const priority: 0 | 1 | 2 = bucket === 'blocked' ? 0 : time.urgent ? 1 : 2;
    return [{ request, bucket, label: labels[stage] || (request.status === '승인대기' ? '구매 요청 검토' : '상태 확인'), detail, tab,
      priority, urgency: (priority === 0 || time.overdue ? 'danger' : priority === 1 ? 'warning' : 'neutral') as DashboardTask['urgency'],
      urgencyLabel: bucket === 'blocked' ? (stale && !request.workflowError && status !== 'FAILED' ? '장시간 미갱신 · 점검 필요' : '막힘 · 확인 필요') : time.overdue ? '기한 경과' : time.urgent ? '오늘 안에' : bucket === 'attention' ? '결정 대기' : '진행 중',
      deadlineLabel: time.deadlineLabel, deadlineAt: time.deadlineAt,
      elapsedLabel: elapsed === undefined ? '최근 갱신 시각 없음' : `최근 갱신 후 ${duration(elapsed)}` }];
  }).sort((a, b) => a.priority - b.priority || (a.deadlineAt === b.deadlineAt ? 0 : a.deadlineAt - b.deadlineAt)
    || a.request.mrNo.localeCompare(b.request.mrNo, 'ko', { numeric: true }));
}

/** No monthly claim without issue dates, and no duplicate purchase order totals. */
export function issuedPurchaseOrders(items: POItem[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.officialPoNo || item.poNo || item.id;
    if (!item.poCreated || item.backendStatus === 'CANCELLED' || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
