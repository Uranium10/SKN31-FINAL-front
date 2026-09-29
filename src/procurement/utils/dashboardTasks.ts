import type { MaterialRequest, NavigationTab, POItem } from '../types';
import type { WorkProgress } from '../api/workProgress';

export type TaskBucket = 'blocked' | 'attention' | 'processing' | 'waiting' | 'other';
export interface DashboardTask {
  request: MaterialRequest; bucket: TaskBucket; label: string; detail: string; tab: NavigationTab;
  priority: 0 | 1 | 2; urgency: 'danger' | 'warning' | 'neutral'; urgencyLabel: string;
  deadlineLabel: string; elapsedLabel: string; deadlineAt: number;
  /** 자동 진행이 멈춘 이유. AI 판단 기록과 같은 문구를 행에서 바로 보여준다. */
  autoBlockers: { code: string; label: string; detail: string }[];
}

/** 화면 표시 기준일 뿐, 워크플로 타임아웃이나 독촉 규칙이 아니다.
 *  독촉 메일은 이미 자동으로 나가므로 평소에는 알리지 않고, 마감이 코앞인데
 *  회신이 모자랄 때만 띄운다 - 그때는 마감 연장이나 재비딩이라는 할 일이 있다. */
export const QUOTATION_RISK_WINDOW_MS = 24 * 60 * 60_000;
export const QUOTATION_RISK_RATE = 0.7;
export const QUOTATION_RISK_MISSING = 2;

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
  SUPPLIER_DOCUMENT_REVIEW: '신규 협력사 서류 확인',
  ORDER_START: '발주 진행 확인', PRE_PO_APPROVAL: '발주 승인', PR_REQUEST: '발주 확인 요청', PR_SENDING: '발주 확인 요청 발송',
  PR_RESPONSE_WAITING: '공급사 응답 대기', PR_REJECTED: '공급사 반려 확인', PO_CREATION: '발주서 생성',
  PO_CREATION_FAILED: '발주서 생성 실패', DELIVERY: '입고 대기', SCORECARD: '협력사 평가',
  SUBSTITUTE_SELECTED: '대체품 선택 완료', PROCESSING: '자동 처리 중', HUMAN_REVIEW: '예외 확인 필요',
};
/** 단계 -> 그 건을 실제로 처리할 수 있는 화면.
 *
 *  ProcurementWorkspace가 vendorGroups / poItems를 채우는 단계 목록과 같아야
 *  한다. 행이 없는 탭으로 보내면 화면만 바뀌고 할 일은 못 한다. 여기 없는
 *  단계는 MR 목록으로 보낸다 - MR 목록만이 모든 건을 담는다. */
const stageTabs: Record<string, NavigationTab> = {
  SUPPLIER_RECOMMENDATION: 'vendor-select', RFQ_TARGET_SELECTION: 'vendor-select',
  RFQ_SENDING: 'vendor-select', QUOTATION_COLLECTION: 'vendor-select',
  SUPPLIER_SELECTION: 'vendor-select', ORDER_START: 'vendor-select',
  PRE_PO_APPROVAL: 'po-manage', PR_REQUEST: 'po-manage', PR_SENDING: 'po-manage',
  PR_RESPONSE_WAITING: 'po-manage', PR_REJECTED: 'po-manage', PO_CREATION: 'po-manage',
  PO_CREATION_FAILED: 'po-manage', DELIVERY: 'po-manage', SCORECARD: 'po-manage',
};
/** 재시도까지 발주 승인 권한(Purchase Manager)이 필요한 단계. 서버도
 *  po_approval과 po_creation_failed 두 작업에서 같은 역할을 요구한다. */
const poApproverStages = new Set(['PRE_PO_APPROVAL', 'PO_CREATION_FAILED']);
const waits = new Set(['SUBSTITUTE_DECISION', 'QUOTATION_COLLECTION', 'PR_RESPONSE_WAITING', 'DELIVERY']);

export function dashboardStageLabel(stage?: string): string {
  return labels[stage || ''] || '상태 확인';
}

/** Classify once per MR. A human task for an external recipient is not buyer work. */
export function dashboardTasks(
  requests: MaterialRequest[],
  progress: WorkProgress[] = [],
  now = Date.now(),
  { canApprovePO = false }: { canApprovePO?: boolean } = {},
): DashboardTask[] {
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
    // 긴급발주로 비딩을 건너뛴 건은 견적 데이터가 없어 협력사 선정 화면에
    // 행이 아예 없다(isDirectPurchaseOrderStart). PO 관리에만 있다.
    const tab: NavigationTab = stage === 'ORDER_START' && request.directPurchase
      ? 'po-manage' : stageTabs[stage] ?? 'mr-list';
    const time = timeEvidence(request, now);
    // 자동 진행이 조건에 걸려 멈춘 것은 '고장'이 아니라 설계대로 사람을 부른
    // 것이다. last_error에도 판정 요약이 들어가므로 그것만 보면 시스템 오류와
    // 구분되지 않는다. 판정 원본으로 갈라서 결정 대기로 보낸다.
    const autoBlockers = status === 'FAILED' ? [] : (request.autoProgress?.checks ?? [])
      .filter((check) => check.status === 'blocked')
      .map(({ code, label, detail: reason }) => ({ code, label, detail: reason }));
    const autoHeld = autoBlockers.length > 0;
    // PO 승인은 Purchase Manager 권한이 있어야 누를 수 있다. 권한이 없는
    // 담당자에게는 '내 할 일'이 아니라 '승인 대기'로 보여야 한다.
    const approvalOnly = poApproverStages.has(stage) && !canApprovePO;
    const missing = Math.max(0, (request.quotationRecipientCount ?? 0) - (request.quotationRespondedCount ?? 0));
    const quotationRisk = stage === 'QUOTATION_COLLECTION' && !autoHeld
      && (request.quotationRecipientCount ?? 0) > 0
      && Number.isFinite(time.deadlineAt) && time.deadlineAt > now
      && time.deadlineAt - now <= QUOTATION_RISK_WINDOW_MS
      && (request.quotationRespondedCount ?? 0) < (request.quotationRecipientCount ?? 0) * QUOTATION_RISK_RATE
      && missing >= QUOTATION_RISK_MISSING;

    let bucket: TaskBucket = 'other';
    let detail = request.pendingTask?.description || '상세 화면에서 현재 상태를 확인하세요.';
    // 기한과 별개로 '오늘 봐야 하는' 결정. 고장은 아니지만 미루면 건 전체가 선다.
    let pressing = autoHeld || quotationRisk;
    if (stage === 'PO_CREATION_FAILED') {
      // ERPNext에서 원인을 고친 뒤 재시도해야 하는 진짜 실패다. 다만 재시도도
      // 발주 승인 권한자만 할 수 있어서, 권한이 없으면 내가 볼 일이 아니다.
      bucket = approvalOnly ? 'waiting' : 'blocked';
      detail = approvalOnly
        ? '발주서 생성이 실패했습니다. 발주 승인 권한자의 재처리를 기다립니다.'
        : request.workflowError || 'ERPNext에서 원인을 확인하고 고친 뒤 재시도해 주세요.';
    } else if (autoHeld) {
      bucket = 'attention';
      detail = request.autoProgress?.summary || autoBlockers[0].detail;
    } else if (status === 'FAILED' || stage === 'HUMAN_REVIEW' || (request.workflowError && !waits.has(stage))) {
      bucket = 'blocked'; detail = request.workflowError || '진행이 멈췄습니다. 사유를 확인해 주세요.';
    } else if (review || stale) {
      bucket = 'blocked'; detail = review ? observed?.waiting_reason || '자동 판정이 멈췄습니다. 실행 상태를 확인해 주세요.'
        : '상태가 오랫동안 갱신되지 않았습니다. 실제 실행 상태를 확인해 주세요.';
    } else if (stage === 'PR_REJECTED') {
      // 공급사가 반려한 것은 고장이 아니라 사람이 수습해야 하는 결정이다.
      bucket = 'attention'; pressing = true;
      detail = request.workflowError || '공급사가 발주를 반려했습니다. 다른 공급사 선정 또는 재비딩이 필요합니다.';
    } else if (approvalOnly) {
      bucket = 'waiting'; detail = '발주 승인 권한자의 확인을 기다립니다.';
    } else if (stage === 'DELIVERY' || (status === 'WAITING_INPUT' && waits.has(stage))) {
      bucket = 'waiting';
      detail = stage === 'QUOTATION_COLLECTION'
        ? (quotationRisk
          ? `마감이 하루도 남지 않았는데 ${missing}곳이 미회신입니다 (회신 ${request.quotationRespondedCount}/${request.quotationRecipientCount}). 마감 연장이나 재비딩을 검토하세요.`
          : `견적 회신율 ${Math.round(request.processStage.quotationProgressPercent)}% · 회신과 마감 조건 확인 중`)
        : stage === 'SUBSTITUTE_DECISION' ? '요청부서의 대체품 사용 여부를 기다립니다.'
        : stage === 'DELIVERY' ? '발주 후 입고를 기다립니다.' : '공급사의 발주 확인 응답을 기다립니다.';
    } else if (stage === 'SCORECARD') {
      // 백엔드 문구("전체 입고가 확인되었습니다")는 알림이라 할 일이 안 보인다.
      bucket = 'attention'; pressing = true;
      detail = '전체 입고가 확인됐습니다. 협력사 평가를 작성해 주세요.';
    } else if (['RUNNING', 'QUEUED'].includes(status)) {
      // '처리 중'만으로는 무엇을 하는지 알 수 없다. 단계 이름을 그대로 보여준다.
      bucket = 'processing';
      detail = status === 'QUEUED' ? '실행 순서를 기다리고 있습니다.'
        : `${labels[stage] || '워크플로'} 진행 중입니다. 완료되면 상태가 갱신됩니다.`;
    } else if (request.pendingTask || status === 'WAITING_INPUT' || request.status === '승인대기') {
      bucket = 'attention'; detail = request.pendingTask?.description || '담당자의 검토 또는 선택이 필요합니다.';
    }
    // 고장이 0순위. 조건 미달과 회신 부족은 사람이 오늘 봐야 하는 일이라 1순위.
    const priority: 0 | 1 | 2 = bucket === 'blocked' ? 0 : (pressing || time.urgent) ? 1 : 2;
    const urgencyLabel = bucket === 'blocked'
      ? (stale && !request.workflowError && status !== 'FAILED' ? '장시간 미갱신 · 점검 필요' : '막힘 · 확인 필요')
      : autoHeld ? '조건 미달 · 확인 필요'
      : quotationRisk ? '회신 부족 · 마감 임박'
      : stage === 'PR_REJECTED' ? '공급사 반려 · 확인 필요'
      : stage === 'SCORECARD' ? '입고 완료 · 평가 필요'
      : time.overdue ? '기한 경과' : time.urgent ? '오늘 안에'
      : bucket === 'attention' ? '결정 대기' : '진행 중';
    return [{ request, bucket, label: labels[stage] || (request.status === '승인대기' ? '구매 요청 검토' : '상태 확인'), detail, tab,
      priority, urgency: (priority === 0 || time.overdue ? 'danger' : priority === 1 ? 'warning' : 'neutral') as DashboardTask['urgency'],
      urgencyLabel, autoBlockers,
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
