import type { MaterialRequest, NavigationTab, POItem } from '../types';

export type TaskBucket = 'attention' | 'processing' | 'waiting' | 'other';
export interface DashboardTask { request: MaterialRequest; bucket: TaskBucket; label: string; detail: string; tab: NavigationTab }
const labels: Record<string, string> = {
  MR_REVIEW: '구매 요청 검토', ITEM_CHECK: '품목 확인', SUBSTITUTE_DECISION: '요청부서 응답 대기',
  BIDDING_DECISION: '구매 방식 확인', SUPPLIER_RECOMMENDATION: '공급사 탐색', RFQ_TARGET_SELECTION: '견적 요청 대상 선택',
  RFQ_SENDING: '견적 요청 발송', QUOTATION_COLLECTION: '견적 회신 대기', SUPPLIER_SELECTION: '최종 협력사 선택',
  ORDER_START: '발주 진행 확인', PRE_PO_APPROVAL: '발주 승인', PR_REQUEST: '발주 확인 요청', PR_SENDING: '발주 확인 요청 발송',
  PR_RESPONSE_WAITING: '공급사 응답 대기', PR_REJECTED: '공급사 반려 확인', PO_CREATION: '발주서 생성', DELIVERY: '입고 대기', HUMAN_REVIEW: '예외 확인 필요',
};
const poStages = new Set(['ORDER_START', 'PRE_PO_APPROVAL', 'PR_REQUEST', 'PR_SENDING', 'PR_RESPONSE_WAITING', 'PR_REJECTED', 'PO_CREATION', 'DELIVERY']);
const waits = new Set(['SUBSTITUTE_DECISION', 'QUOTATION_COLLECTION', 'PR_RESPONSE_WAITING', 'DELIVERY']);

/** Classify once per MR. A human task for an external recipient is not buyer work. */
export function dashboardTasks(requests: MaterialRequest[]): DashboardTask[] {
  const seen = new Set<string>();
  return requests.flatMap(request => {
    const status = request.workflowStatus ?? '';
    if (seen.has(request.mrNo) || ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(status) || (!status && request.status === '반려')) return [];
    seen.add(request.mrNo);
    const stage = request.workflowStage ?? '';
    const tab: NavigationTab = poStages.has(stage) ? 'po-manage' : ['QUOTATION_COLLECTION', 'SUPPLIER_SELECTION'].includes(stage) ? 'vendor-select' : 'mr-list';
    let bucket: TaskBucket = 'other';
    let detail = request.pendingTask?.description || '상세 화면에서 현재 상태를 확인하세요.';
    if (request.workflowError || status === 'FAILED' || ['HUMAN_REVIEW', 'PR_REJECTED'].includes(stage)) {
      bucket = 'attention'; detail = request.workflowError || '진행이 멈췄습니다. 사유를 확인해 주세요.';
    } else if (stage === 'DELIVERY' || (status === 'WAITING_INPUT' && waits.has(stage))) {
      bucket = 'waiting'; detail = stage === 'QUOTATION_COLLECTION' ? `견적 회신율 ${Math.round(request.processStage.quotationProgressPercent)}% · 회신과 마감 조건 확인 중`
        : stage === 'SUBSTITUTE_DECISION' ? '요청부서의 대체품 사용 여부를 기다립니다.' : stage === 'DELIVERY' ? '발주 후 입고를 기다립니다.' : '공급사의 발주 확인 응답을 기다립니다.';
    } else if (['RUNNING', 'QUEUED'].includes(status)) {
      bucket = 'processing'; detail = status === 'QUEUED' ? '실행 순서를 기다리고 있습니다.' : '시스템이 처리 중입니다. 완료되면 상태가 갱신됩니다.';
    } else if (request.pendingTask || status === 'WAITING_INPUT' || request.status === '승인대기') {
      bucket = 'attention'; detail = request.pendingTask?.description || '담당자의 검토 또는 선택이 필요합니다.';
    }
    return [{ request, bucket, label: labels[stage] || (request.status === '승인대기' ? '구매 요청 검토' : '상태 확인'), detail, tab }];
  });
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
