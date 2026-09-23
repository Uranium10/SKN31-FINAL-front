import { fetchWithAuth } from '../../utils/auth';
import type {
  MaterialRequest,
  MaterialRequestAttachment,
  POItem,
  RfqRoundHistoryEntry,
  RfqRoundSnapshot,
  SupplierQuotation,
  SupplierRecommendation,
  VendorSelectionGroup,
} from '../types';

export type ProcurementDataMode = 'mock' | 'hybrid' | 'api';

export interface ProcurementCaseDTO {
  case_id: string;
  mr_name: string;
  status: string;
  stage: string;
  item_code?: string | null;
  item_name?: string | null;
  summary?: Record<string, unknown>;
  supplier_recommendations?: Record<string, {
    scores: NonNullable<SupplierQuotation['scores']>;
    average_score: number;
    evaluation_count: number;
  }>;
  workflow_snapshot?: Record<string, unknown>;
  quotation_snapshot?: {
    rfq_name?: string;
    recipient_suppliers?: string[];
    responded_suppliers?: string[];
    recipient_count?: number;
    responded_count?: number;
    response_rate?: number;
    quotations?: Array<Record<string, unknown>>;
  };
  last_error?: string | null;
  quotation_deadline_at?: string | null;
  pending_task_count?: number;
  pending_task?: {
    task_id: string;
    task_type: string;
    title?: string;
    description?: string | null;
    audience?: string;
    channel?: string;
    input_schema?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    version?: number;
  } | null;
  delivery?: {
    po_name?: string;
    supplier?: string;
    promised_delivery_date?: string;
    ordered_qty?: number | string;
    received_qty?: number | string;
    delivery_status?: 'NOT_RECEIVED' | 'PARTIAL' | 'FULL';
    first_receipt_date?: string;
    full_receipt_date?: string;
    scorecard_status?: 'LOCKED' | 'AVAILABLE' | 'COMPLETED';
    scorecard?: Record<string, unknown> | null;
    automatic_scorecard?: POItem['automaticScorecard'];
    invoice_count?: number;
    latest_invoice_name?: string;
    invoice_total?: number | string;
    outstanding_amount?: number | string;
    payment_status?: 'NOT_INVOICED' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
    paid_amount?: number | string;
    latest_payment_entry?: string;
    last_payment_date?: string;
  } | null;
  version: number;
  updated_at: string;
}

interface CaseListResponse {
  items: ProcurementCaseDTO[];
  count: number;
}

const LEGACY_CASE_STATE: Record<string, Pick<ProcurementCaseDTO, 'status' | 'stage'>> = {
  started: { status: 'RUNNING', stage: 'MR_REVIEW' },
  checking_mr_item: { status: 'RUNNING', stage: 'ITEM_CHECK' },
  awaiting_substitute_selection: { status: 'WAITING_INPUT', stage: 'SUBSTITUTE_DECISION' },
  substitute_selected: { status: 'CANCELLED', stage: 'SUBSTITUTE_SELECTED' },
  urgent_no_supplier_cancelled: { status: 'REJECTED', stage: 'CANCELLED' },
  checking_bidding: { status: 'RUNNING', stage: 'BIDDING_DECISION' },
  // Legacy checkpoints created before the direct-purchase node was connected
  // remain recoverable from HUMAN_REVIEW and are restarted at bidding decision.
  catalog_purchase_required: { status: 'FAILED', stage: 'HUMAN_REVIEW' },
  resolving_suppliers: { status: 'RUNNING', stage: 'SUPPLIER_RECOMMENDATION' },
  resolving_supplier_pool: { status: 'RUNNING', stage: 'SUPPLIER_RECOMMENDATION' },
  searching: { status: 'RUNNING', stage: 'SUPPLIER_RECOMMENDATION' },
  collected: { status: 'RUNNING', stage: 'SUPPLIER_RECOMMENDATION' },
  search_completed: { status: 'RUNNING', stage: 'SUPPLIER_RECOMMENDATION' },
  searching_suppliers: { status: 'RUNNING', stage: 'SUPPLIER_RECOMMENDATION' },
  supplier_search_completed: { status: 'RUNNING', stage: 'SUPPLIER_RECOMMENDATION' },
  suppliers_registered: { status: 'RUNNING', stage: 'RFQ_SENDING' },
  awaiting_supplier_approval: { status: 'WAITING_INPUT', stage: 'RFQ_TARGET_SELECTION' },
  creating_rfq: { status: 'RUNNING', stage: 'RFQ_SENDING' },
  awaiting_quotation_check: { status: 'WAITING_INPUT', stage: 'QUOTATION_COLLECTION' },
  awaiting_final_selection: { status: 'WAITING_INPUT', stage: 'SUPPLIER_SELECTION' },
  supplier_selected: { status: 'WAITING_INPUT', stage: 'ORDER_START' },
  awaiting_po_approval: { status: 'WAITING_INPUT', stage: 'PRE_PO_APPROVAL' },
  awaiting_pr_request: { status: 'WAITING_INPUT', stage: 'PR_REQUEST' },
  creating_pr: { status: 'RUNNING', stage: 'PR_SENDING' },
  awaiting_supplier_pr_response: { status: 'WAITING_INPUT', stage: 'PR_RESPONSE_WAITING' },
  supplier_pr_rejected: { status: 'WAITING_INPUT', stage: 'PR_REJECTED' },
  creating_po: { status: 'RUNNING', stage: 'PO_CREATION' },
  po_sent: { status: 'RUNNING', stage: 'DELIVERY' },
  human_review: { status: 'FAILED', stage: 'HUMAN_REVIEW' },
};

const normalizeProcurementCase = (entry: ProcurementCaseDTO): ProcurementCaseDTO => {
  const normalized = LEGACY_CASE_STATE[entry.status];
  return normalized ? { ...entry, ...normalized } : entry;
};

const parseJson = async <T>(response: Response): Promise<T> => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.detail;
    const validationMessage = Array.isArray(detail)
      ? detail
        .map((issue) => issue && typeof issue === 'object' ? issue.msg : null)
        .filter((message): message is string => Boolean(message))
        .join(' · ')
      : '';
    const message = typeof detail === 'string'
      ? detail
      : validationMessage || '구매 작업 API 요청에 실패했습니다.';
    throw new Error(message);
  }
  return body as T;
};

export const listProcurementCases = async (): Promise<ProcurementCaseDTO[]> => {
  const response = await fetchWithAuth('/api/procurement/cases?include_closed=true&limit=200');
  const body = await parseJson<CaseListResponse>(response);
  return (Array.isArray(body.items) ? body.items : []).map(normalizeProcurementCase);
};

export const syncDraftProcurementCases = async (
  reconcileMissing = true,
): Promise<void> => {
  const query = new URLSearchParams({
    reconcile_missing: String(reconcileMissing),
  });
  const response = await fetchWithAuth(`/api/procurement/cases/sync-drafts?${query}`, { method: 'POST' });
  await parseJson(response);
};

export const startProcurementCase = async (caseId: string): Promise<void> => {
  const response = await fetchWithAuth(`/api/procurement/cases/${encodeURIComponent(caseId)}/start`, {
    method: 'POST',
  });
  await parseJson(response);
};

export const rejectProcurementCase = async (caseId: string, reason: string): Promise<void> => {
  const response = await fetchWithAuth(`/api/procurement/cases/${encodeURIComponent(caseId)}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  await parseJson(response);
};

export const answerProcurementTask = async (
  taskId: string,
  answer: Record<string, unknown>,
  version?: number,
): Promise<Record<string, unknown>> => {
  const response = await fetchWithAuth(`/api/procurement/tasks/${encodeURIComponent(taskId)}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer, version }),
  });
  return parseJson<Record<string, unknown>>(response);
};

// 차수(라운드) 팝업 전용 - 지난(또는 현재) 라운드 RFQ 하나에 실제로 제출된
// Supplier Quotation을 그때그때 다시 조회한다. 재비딩해도 ERPNext의
// RFQ/SQ 문서를 취소하지 않고 그대로 두기 때문에 언제든 rfqName으로
// 다시 조회할 수 있다.
export const fetchRfqRoundQuotations = async (
  caseId: string,
  rfqName: string,
): Promise<RfqRoundSnapshot> => {
  const response = await fetchWithAuth(
    `/api/procurement/cases/${encodeURIComponent(caseId)}/rfq-rounds/${encodeURIComponent(rfqName)}/quotations`,
  );
  const data = await parseJson<Record<string, unknown>>(response);
  const quotations = rows(data.quotations).map((row) => ({
    name: text(row.name),
    supplier: supplierName(row),
    transactionDate: text(row.transaction_date) || undefined,
    validTill: text(row.valid_till) || undefined,
    grandTotal: numberValue(row.grand_total ?? row.base_grand_total) || undefined,
    items: rows(row.items).map((item) => ({
      itemCode: text(item.item_code) || undefined,
      itemName: text(item.item_name) || undefined,
      description: text(item.description) || undefined,
      qty: numberValue(item.qty) || undefined,
      uom: text(item.uom) || undefined,
      rate: numberValue(item.rate) || undefined,
      amount: numberValue(item.amount) || undefined,
      expectedDeliveryDate: text(item.expected_delivery_date) || undefined,
      leadTimeDays: numberValue(item.lead_time_days) || undefined,
    })),
  }));
  return {
    rfqName: text(data.rfq_name, rfqName),
    recipientCount: numberValue(data.recipient_count),
    respondedCount: numberValue(data.responded_count),
    responseRate: numberValue(data.response_rate),
    quotations,
  };
};

export const extendQuotationDeadline = async (caseId: string, deadlineAt: string): Promise<void> => {
  const response = await fetchWithAuth(
    `/api/procurement/cases/${encodeURIComponent(caseId)}/quotation-deadline`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deadline_at: deadlineAt }),
    },
  );
  await parseJson(response);
};

export interface SupplierSearchResult {
  name: string;
  supplierName: string;
  email: string | null;
  phone: string | null;
  recommendation?: SupplierRecommendation | null;
}

interface SupplierSearchResponse {
  items: Array<{
    name?: string;
    supplier_name?: string;
    email?: string | null;
    phone?: string | null;
    recommendation?: SupplierRecommendation | null;
  }>;
}

/**
 * '협력사 직접 입력' 자동완성 드롭다운이 호출하는 기존 supplier 풀 검색.
 * field='name'이면 협력사명만, field='email'이면 이메일만 대조해서
 * 이름란/이메일란 드롭다운에 서로 다른 결과가 뜨게 한다.
 */
export const searchSuppliers = async (
  query: string,
  field: 'name' | 'email' = 'name',
): Promise<SupplierSearchResult[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const response = await fetchWithAuth(
    `/api/procurement/suppliers/search?q=${encodeURIComponent(trimmed)}&field=${field}`,
  );
  const body = await parseJson<SupplierSearchResponse>(response);
  return (Array.isArray(body.items) ? body.items : []).map((row) => ({
    name: row.name || row.supplier_name || '',
    supplierName: row.supplier_name || row.name || '',
    email: row.email ?? null,
    phone: row.phone ?? null,
    recommendation: row.recommendation,
  }));
};

export const getSupplierEvaluations = async (names: string[]): Promise<Record<string, SupplierRecommendation>> => {
  const response = await fetchWithAuth('/api/procurement/suppliers/evaluations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  });
  const body = await parseJson<{ items: Record<string, SupplierRecommendation> }>(response);
  return body.items;
};

const text = (value: unknown, fallback = ''): string => (
  typeof value === 'string' && value.trim() ? value : fallback
);

const numberValue = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const stripHtml = (value: string): string => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const pendingTask = (entry: ProcurementCaseDTO) => {
  const task = entry.pending_task;
  if (!task) return undefined;
  return {
    taskId: task.task_id,
    taskType: task.task_type,
    title: task.title || '확인이 필요한 구매 작업입니다',
    description: task.description || undefined,
    audience: task.audience,
    channel: task.channel,
    inputSchema: task.input_schema ?? {},
    payload: task.payload ?? {},
    version: task.version,
  };
};

export const friendlyWorkflowError = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const normalized = value.toLocaleLowerCase('en-US');
  if (normalized.includes('insufficient_quota') || normalized.includes('credit_balance_exhausted')) {
    return 'AI API 크레딧이 소진되었습니다. 결제 또는 API 프로젝트 설정을 확인해주세요.';
  }
  if (normalized.includes('rate_limit')) {
    return 'AI API 요청이 일시적으로 많습니다. 잠시 후 다시 시도해주세요.';
  }
  if (normalized.includes('authentication') || normalized.includes('invalid_api_key')) {
    return 'AI API 인증 정보를 확인해주세요.';
  }
  return value.length > 180 ? `${value.slice(0, 180)}…` : value;
};

const calculateDDay = (dueDate: string): number => {
  const due = new Date(`${dueDate}T23:59:59`);
  const now = new Date();
  if (Number.isNaN(due.getTime())) return 999;
  return Math.max(0, Math.ceil((due.getTime() - now.getTime()) / 86_400_000));
};

const attachmentsFromSummary = (summary: Record<string, unknown>): MaterialRequestAttachment[] => {
  const attachments = Array.isArray(summary.attachments) ? summary.attachments : [];
  return attachments.map((item) => {
    if (typeof item === 'string') return { fileName: item };
    if (item && typeof item === 'object') {
      const row = item as Record<string, unknown>;
      return {
        fileName: text(row.file_name) || text(row.file_url) || '첨부파일',
        fileId: text(row.name) || undefined,
        fileUrl: text(row.file_url) || undefined,
        isPrivate: Boolean(Number(row.is_private) || row.is_private === true),
      };
    }
    return { fileName: '첨부파일' };
  });
};

export const downloadMaterialRequestAttachment = async (fileId: string): Promise<Blob> => {
  const response = await fetchWithAuth(
    `/api/procurement/attachments/download?file_id=${encodeURIComponent(fileId)}`,
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body?.detail === 'string' ? body.detail : '첨부파일 다운로드에 실패했습니다.');
  }
  return response.blob();
};

export const caseToMaterialRequest = (entry: ProcurementCaseDTO): MaterialRequest => {
  const summary = entry.summary ?? {};
  const dueDate = text(summary.schedule_date, new Date().toISOString().slice(0, 10));
  const dDay = calculateDDay(dueDate);
  const attachmentFiles = attachmentsFromSummary(summary);
  const description = stripHtml(text(summary.description, '규격 정보 없음'));
  const unitPrice = numberValue(summary.rate);
  const quantity = numberValue(summary.qty);
  const totalPrice = numberValue(summary.amount) || unitPrice * quantity;
  const isRejected = ['REJECTED', 'CANCELLED'].includes(entry.status);
  const isCompleted = entry.status === 'COMPLETED';
  // `WAITING_INPUT`은 MR 승인뿐 아니라 대체품 선택, RFQ 대상 선택,
  // PO 승인 등 모든 사람 개입 지점에서 사용됩니다. 따라서 미완료 건을
  // 전부 "승인대기"로 표시하면 이미 협력사 선정 단계로 넘어간 MR까지
  // 대시보드의 MR 승인 대기 건수에 섞이게 됩니다.
  const isAwaitingMRApproval = (
    entry.status === 'AWAITING_MR_REVIEW'
    && entry.stage === 'MR_REVIEW'
  );
  const rawValues = (
    entry.workflow_snapshot?.values
    && typeof entry.workflow_snapshot.values === 'object'
  ) ? entry.workflow_snapshot.values as Record<string, unknown> : {};
  const checkpointNext = entry.workflow_snapshot?.next;
  const canRetry = entry.workflow_snapshot?.can_retry === true
    || (Array.isArray(checkpointNext) && checkpointNext.length > 0)
    || text(rawValues.status) === 'catalog_purchase_required';
  const rfqRecipients = new Set(
    (Array.isArray(rawValues.selected_suppliers) ? rawValues.selected_suppliers : [])
      .map((value) => text(value))
      .filter(Boolean),
  );
  const quotationRows = Array.isArray(rawValues.quotation_ranking)
    ? rawValues.quotation_ranking.filter(
      (value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object',
    )
    : [];
  const liveQuotationRows = Array.isArray(entry.quotation_snapshot?.quotations)
    ? entry.quotation_snapshot.quotations
    : null;
  const responseRows = liveQuotationRows ?? quotationRows;
  const respondedSuppliers = new Set(
    responseRows
      .map((row) => text(row.supplier) || text(row.supplier_name) || text(row.name))
      .filter((name) => name && (rfqRecipients.size === 0 || rfqRecipients.has(name))),
  );
  const snapshotResponseRate = entry.quotation_snapshot?.response_rate;
  const quotationProgressPercent = typeof snapshotResponseRate === 'number'
    ? Math.min(100, Math.max(0, snapshotResponseRate))
    : rfqRecipients.size > 0
      ? Math.min(100, Math.round((respondedSuppliers.size / rfqRecipients.size) * 100))
      : 0;
  const hasSelectedSupplier = Boolean(text(rawValues.selected_supplier));
  const hasCreatedPO = Boolean(
    text(rawValues.po_name) || text(entry.delivery?.po_name),
  );

  return {
    id: entry.case_id,
    mrNo: entry.mr_name,
    department: text(summary.department, '미지정'),
    requester: text(summary.requester, '요청자 미지정'),
    itemCode: text(entry.item_code ?? summary.item_code, '미등록 품목'),
    category: text(summary.item_group, '미분류'),
    itemName: text(entry.item_name ?? summary.item_name, '품목명 미지정'),
    specSummary: description.length > 48 ? `${description.slice(0, 48)}…` : description,
    fullSpecText: description,
    hasAttachment: attachmentFiles.length > 0,
    attachmentCount: attachmentFiles.length,
    attachmentFiles,
    unitPrice,
    totalPrice,
    quantity,
    dueDate,
    dDay,
    // 백엔드 decide_bidding.py의 URGENT_LEAD_TIME_DAYS(7일)과 동일한 기준.
    isUrgent: dDay <= 7,
    status: isRejected ? '반려' : isAwaitingMRApproval ? '승인대기' : '승인',
    rejectReason: isRejected
      ? text(rawValues.cancellation_reason) || entry.last_error || undefined
      : undefined,
    hasSubstituteCandidates: entry.stage === 'SUBSTITUTE_DECISION',
    substituteStage: entry.stage === 'SUBSTITUTE_DECISION' ? 'notified_waiting' : 'not_started',
    workflowStatus: entry.status,
    workflowStage: entry.stage,
    workflowError: friendlyWorkflowError(entry.last_error),
    canRetry,
    pendingTaskCount: entry.pending_task_count ?? 0,
    pendingTask: pendingTask(entry),
    erpStatus: text(summary.erp_status),
    processStage: {
      approval: isAwaitingMRApproval ? '대기' : '완료',
      quotationProgressPercent,
      // 기존 필드명은 목업 호환을 위해 유지하지만 의미는 PR 승인이 아니라
      // 실제 최종 협력사 선정 여부입니다.
      prSupplierApproved: hasSelectedSupplier ? '승인' : '대기',
      poCreated: hasCreatedPO || isCompleted,
    },
  };
};

const valuesOf = (entry: ProcurementCaseDTO): Record<string, unknown> => {
  const values = entry.workflow_snapshot?.values;
  return values && typeof values === 'object' ? values as Record<string, unknown> : {};
};

// 긴급발주(납기 7일 이내)로 비딩을 생략하고 이전 PO 공급사를 그대로 쓰는
// 케이스는 RFQ/견적 데이터가 전혀 없어 협력사 선정 화면(quotations 기반
// UI)에서는 항상 "견적 대기중"으로 잘못 보인다. ORDER_START 단계에서 이
// 플래그가 켜져 있으면 협력사 선정 화면 대신 PO 관리 화면으로 보낸다.
export const isDirectPurchaseOrderStart = (entry: ProcurementCaseDTO): boolean => (
  entry.stage === 'ORDER_START' && valuesOf(entry).direct_purchase === true
);

const rows = (value: unknown): Array<Record<string, unknown>> => (
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : []
);

const supplierName = (row: Record<string, unknown>): string => (
  text(row.supplier) || text(row.supplier_name) || text(row.name) || '협력사 미지정'
);

const supplierQuotations = (entry: ProcurementCaseDTO): SupplierQuotation[] => {
  const values = valuesOf(entry);
  const ranking = rows(values.quotation_ranking);
  const liveQuotations = rows(entry.quotation_snapshot?.quotations);
  const candidates = rows(values.supplier_candidates ?? values.existing_supplier_candidates);
  const sentSupplierNames = new Set(
    (Array.isArray(values.selected_suppliers) ? values.selected_suppliers : [])
      .map((value) => text(value))
      .filter(Boolean),
  );
  // After RFQ creation, response rate must use the actual recipients as its
  // denominator. Supplier search candidates that were not selected are no
  // longer part of this RFQ and must not appear as "not responded".
  const recipientCandidates = sentSupplierNames.size > 0
    ? candidates.filter((candidate) => sentSupplierNames.has(supplierName(candidate)))
    : candidates;
  // 재비딩으로 같은 공급사가 여러 차수에 걸쳐 견적을 낼 수 있어, 공급사
  // 이름 하나로 ranking 행을 묶으면 마지막 차수 견적만 남고 이전 차수
  // 견적은 조용히 사라진다(이전 차수도 최종선정 가능해야 하므로 문제).
  // 차수별 ranking 행을 모두 모아두고, 후보/실시간 견적과 병합할 "대표"
  // 행(가장 최근 차수)만 rankingBySupplier에 남긴 뒤, 나머지 차수 행은
  // extraRankingRows로 별도 행으로 추가한다.
  const rankingGroupsBySupplier = new Map<string, Array<Record<string, unknown>>>();
  ranking.forEach((row) => {
    const name = supplierName(row);
    const group = rankingGroupsBySupplier.get(name) ?? [];
    group.push(row);
    rankingGroupsBySupplier.set(name, group);
  });
  const rankingBySupplier = new Map(
    Array.from(rankingGroupsBySupplier.entries()).map(([name, group]) => [name, group[group.length - 1]]),
  );
  const liveBySupplier = new Map(liveQuotations.map((row) => [supplierName(row), row]));
  const candidateNames = new Set(recipientCandidates.map(supplierName));
  const liveNames = new Set(liveQuotations.map(supplierName));
  // 후보/실시간 견적과 병합되는 공급사(대표 행 하나로 합쳐짐)에 한해서만
  // "나머지 차수" 행을 별도로 보충한다. 후보/실시간에 없는 공급사는 아래
  // 세 번째 항목(ranking.filter)에서 이미 차수별로 전부 개별 행으로
  // 들어가므로 여기서 또 추가하면 중복된다.
  const extraRankingRows = Array.from(rankingGroupsBySupplier.entries())
    .filter(([name, group]) => group.length > 1 && (candidateNames.has(name) || liveNames.has(name)))
    .flatMap(([, group]) => group.slice(0, -1));
  const source = [
    ...recipientCandidates.map((candidate) => ({
      ...candidate,
      ...(rankingBySupplier.get(supplierName(candidate)) ?? {}),
      ...(liveBySupplier.get(supplierName(candidate)) ?? {}),
    })),
    ...liveQuotations.filter((quotation) => !candidateNames.has(supplierName(quotation))),
    ...ranking.filter((ranked) => (
      !candidateNames.has(supplierName(ranked))
      && !liveNames.has(supplierName(ranked))
      && (sentSupplierNames.size === 0 || sentSupplierNames.has(supplierName(ranked)))
    )),
    ...extraRankingRows,
  ];
  return source.map((row, index) => {
    const name = supplierName(row);
    const responded = liveBySupplier.has(name) || rankingBySupplier.has(name);
    const aiEvaluated = rankingBySupplier.has(name);
    const quotationItems = rows(row.items);
    const quotationItem = quotationItems.find((item) => (
      !entry.item_code || text(item.item_code) === entry.item_code
    )) ?? quotationItems[0] ?? {};
    const unitPrice = numberValue(
      row.rate
      ?? row.unit_price
      ?? row.net_rate
      ?? row.quote_unit_price
      ?? quotationItem.rate
      ?? quotationItem.net_rate,
    );
    const totalPrice = numberValue(
      row.total_amount
      ?? row.grand_total
      ?? row.rounded_total
      ?? row.amount
      ?? row.net_amount
      ?? row.total
      ?? row.total_price
      ?? quotationItem.amount
      ?? quotationItem.net_amount,
    ) || unitPrice;
    return {
      quotationId: text(row.quotation_id ?? row.name) || undefined,
      rfqName: text(row.rfq_name) || undefined,
      rfqRound: row.rfq_round != null ? numberValue(row.rfq_round) : undefined,
      validTill: text(row.valid_till ?? row.valid_until) || undefined,
      supplierId: name,
      supplierName: name,
      scores: entry.supplier_recommendations?.[name]?.scores,
      recommendationScore: entry.supplier_recommendations?.[name]?.average_score,
      evaluationCount: entry.supplier_recommendations?.[name]?.evaluation_count,
      quoteUnitPrice: unitPrice,
      quoteTotalPrice: totalPrice,
      leadTimeDays: numberValue(row.lead_time_days ?? row.lead_time),
      expectedDeliveryDate: text(
        row.expected_delivery_date
        ?? row.schedule_date
        ?? row.delivery_date
        ?? quotationItem.expected_delivery_date
        ?? quotationItem.schedule_date
        ?? quotationItem.delivery_date,
      ) || undefined,
      isResponded: responded,
      resContent: text(
        row.response_summary ?? row.remarks ?? row.supplier_response ?? row.terms,
        responded ? '견적 단가와 제시 납기 정보를 수신했습니다.' : '아직 견적을 회신하지 않았습니다.',
      ),
      resAttachments: [],
      aiRank: numberValue(row.rank) || index + 1,
      aiScore: numberValue(row.overall_score ?? row.score ?? row.ai_score),
      aiReason: aiEvaluated ? text(row.reason ?? row.ai_reason) : '',
      numericScore: aiEvaluated && row.numeric_score != null
        ? numberValue(row.numeric_score)
        : undefined,
      specificationScore: aiEvaluated && row.specification_score != null
        ? numberValue(row.specification_score)
        : undefined,
      overallScore: aiEvaluated && (row.overall_score ?? row.score ?? row.ai_score) != null
        ? numberValue(row.overall_score ?? row.score ?? row.ai_score)
        : undefined,
      evaluationSource: aiEvaluated ? text(row.evaluation_source) || undefined : undefined,
      currency: text(row.currency) || undefined,
      aiEvaluated,
      specMatch: typeof row.spec_match === 'boolean' ? row.spec_match : undefined,
      fulfillsQuantity: typeof row.fulfills_qty === 'boolean' ? row.fulfills_qty : undefined,
      aiIssues: Array.isArray(row.issues)
        ? row.issues.map((issue) => text(issue)).filter(Boolean)
        : [],
      isSelected: text(values.selected_supplier) === name,
      email: text(row.email ?? row.email_id) || undefined,
      phone: text(
        row.phone ?? row.phone_no ?? row.telephone ?? row.mobile_no ?? row.contact,
      ) || undefined,
      sourceUrl: text(
        row.site_url ?? row.source_url ?? row.website ?? row.url,
      ) || (text(row.source).startsWith('http') ? text(row.source) : undefined),
      source: text(row.source ?? row.operation) || undefined,
    };
  });
};

const dateMinusDays = (value: string, days: number): string => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

export const caseToVendorSelectionGroup = (entry: ProcurementCaseDTO): VendorSelectionGroup => {
  const request = caseToMaterialRequest(entry);
  const values = valuesOf(entry);
  const quotations = supplierQuotations(entry);
  const selected = text(values.selected_supplier);
  const rfqSent = [
    'QUOTATION_COLLECTION', 'SUPPLIER_SELECTION', 'ORDER_START',
    'PRE_PO_APPROVAL', 'PR_REQUEST', 'PR_SENDING', 'PR_RESPONSE_WAITING', 'PR_REJECTED',
    'PO_CREATION', 'DELIVERY', 'SCORECARD', 'COMPLETED',
  ].includes(entry.stage);
  const deadline = entry.quotation_deadline_at
    ? new Date(entry.quotation_deadline_at)
    : null;
  const hasDeadline = deadline && !Number.isNaN(deadline.getTime());
  const deadlineDate = hasDeadline ? deadline.toISOString().slice(0, 10) : dateMinusDays(request.dueDate, 3);
  const deadlineTime = hasDeadline
    ? deadline.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '18:00';
  // ⚠️ 예전에는 실제 견적 마감시각(quotation_deadline_at)과 무관하게
  // "납기요청일 D-day - 3"으로 대충 계산해서, 마감시각이 오늘이어도
  // 납기요청일이 열흘 뒤면 D-7처럼 완전히 틀린 값이 떴다. 실제 마감
  // 시각(deadline)을 "지금"과 직접 비교해서 계산해야 한다 - 마감이
  // 이미 지났으면 0 이하(음수 포함)가 나와야 연장 버튼 숨김/재비딩
  // 분기(deadlineDDay <= 0)가 정확히 동작한다.
  const deadlineDDay = hasDeadline
    ? Math.ceil((deadline.getTime() - Date.now()) / 86_400_000)
    : Math.max(0, request.dDay - 3);
  // 재비딩해도 지난 RFQ를 취소하지 않고 그대로 둔 채 새 RFQ를 하나 더
  // 만드는 방식으로 바뀌면서, 백엔드가 마감된 지난 라운드들을
  // workflow_snapshot.values.rfq_rounds에 쌓아준다. 지금 진행 중인
  // 라운드(rfq_name)는 이 목록에 없고 별도 필드로 내려온다 - 총 차수는
  // rfqRounds.length + (rfqName이 있으면 1)이다.
  const rfqRounds: RfqRoundHistoryEntry[] = rows(values.rfq_rounds)
    .map((row, index) => ({
      round: numberValue(row.round) || index + 1,
      rfqName: text(row.rfq_name),
      deadline: text(row.deadline) || undefined,
      closedAt: text(row.closed_at) || undefined,
    }))
    .filter((round) => round.rfqName);
  return {
    id: entry.case_id,
    backendCaseId: entry.case_id,
    pendingTaskId: entry.pending_task?.task_id,
    pendingTask: pendingTask(entry),
    workflowStatus: entry.status,
    workflowStage: entry.stage,
    workflowError: friendlyWorkflowError(entry.last_error),
    orderStarted: ['PRE_PO_APPROVAL', 'PR_REQUEST', 'PR_SENDING', 'PR_RESPONSE_WAITING', 'PR_REJECTED', 'PO_CREATION', 'DELIVERY', 'SCORECARD', 'COMPLETED'].includes(entry.stage),
    mrNo: entry.mr_name,
    itemName: request.itemName,
    itemCode: request.itemCode,
    department: request.department,
    quantity: request.quantity ?? 0,
    unit: text(entry.summary?.uom, 'EA'),
    targetDueDate: request.dueDate,
    deadlineDate,
    deadlineTime,
    deadlineDDay,
    rfqSent,
    rfqName: text(values.rfq_name) || undefined,
    rfqRounds,
    prSent: false,
    quotations,
    selectedSupplierId: selected || undefined,
  };
};

export const caseToPOItem = (entry: ProcurementCaseDTO): POItem => {
  const request = caseToMaterialRequest(entry);
  const values = valuesOf(entry);
  const delivery = entry.delivery;
  const poName = text(delivery?.po_name ?? values.po_name);
  const selectedSupplier = text(delivery?.supplier ?? values.selected_supplier, '협력사 미지정');
  const directPurchaseItems = (
    values.direct_purchase_items
    && typeof values.direct_purchase_items === 'object'
  ) ? values.direct_purchase_items as Record<string, Record<string, unknown>> : {};
  const directBasis = directPurchaseItems[request.itemCode] ?? {};
  const directUnitPrice = numberValue(directBasis.rate);
  const directTotalAmount = directUnitPrice > 0
    ? directUnitPrice * (request.quantity ?? 0)
    : 0;
  // 견적구매의 발주금액은 MR의 요청 당시 예상금액이 아니라 사람이
  // 최종 선택한 Supplier Quotation의 세금 포함 총액을 사용해야 합니다.
  // 신규 MR은 rate/amount가 0인 채 시작할 수 있으므로 이 우선순위가
  // 없으면 실제 견적이 있어도 PO 화면에 0원으로 표시됩니다.
  const selectedQuotation = supplierQuotations(entry).find((quotation) => (
    quotation.isSelected || quotation.supplierName === selectedSupplier
  ));
  const quotationTotalAmount = selectedQuotation?.quoteTotalPrice ?? 0;
  const projectedInvoiceTotal = numberValue(delivery?.invoice_total);
  const approvalStatus = entry.stage === 'PRE_PO_APPROVAL' ? 'pending' : 'approved';
  const prStatus = text(values.pr_status) || (
    entry.stage === 'PR_RESPONSE_WAITING' ? 'SENT'
      : entry.stage === 'PR_REJECTED' ? 'REJECTED'
        : undefined
  );
  const fullReceipt = delivery?.delivery_status === 'FULL';
  const scorecard = delivery?.scorecard;
  const scorecardScores = scorecard && ['quality', 'leadTime', 'service', 'communication']
    .every((key) => typeof scorecard[key] === 'number')
    ? {
      quality: scorecard.quality as number,
      leadTime: scorecard.leadTime as number,
      price: typeof scorecard.price === 'number' ? scorecard.price : undefined,
      service: scorecard.service as number,
      communication: scorecard.communication as number,
    }
    : undefined;
  return {
    id: entry.case_id,
    backendCaseId: entry.case_id,
    pendingTaskId: entry.pending_task?.task_id,
    pendingTask: pendingTask(entry),
    workflowStage: entry.stage,
    workflowError: friendlyWorkflowError(entry.last_error),
    prNo: poName || '발주 승인 대기',
    mrNo: entry.mr_name,
    itemName: request.itemName,
    itemCode: request.itemCode,
    department: request.department,
    selectedSupplier,
    // ⚠️ 예전에는 이 필드가 아예 채워지지 않아서(타입에는 있는데 여기서
    // 한 번도 값을 안 넣어줌) PO 관리 화면에 협력사 이메일을 보여줄 수가
    // 없었다. 이미 위에서 최종 선정된 Supplier Quotation을 찾아놨으니
    // 거기서 이메일을 가져온다 - PR 발송 전이라 prSupplierEmail이 아직
    // 없는 경우에도 협력사 이메일을 바로 볼 수 있다.
    supplierEmail: selectedQuotation?.email || text(values.pr_supplier_email) || undefined,
    totalAmount: directTotalAmount
      || quotationTotalAmount
      || request.totalPrice
      || projectedInvoiceTotal,
    purchaseMode: values.direct_purchase === true ? 'direct' : 'quotation',
    referencePO: text(directBasis.reference_po) || undefined,
    referenceUnitPrice: directUnitPrice || undefined,
    dueDate: request.dueDate,
    supplierApprovalStatus: 'approved',
    prStatus,
    prRejectionReason: text(values.pr_rejection_reason) || undefined,
    prSupplierEmail: text(values.pr_supplier_email) || undefined,
    approvalStatus,
    poCreated: Boolean(poName),
    poNo: poName || undefined,
    arrived: fullReceipt,
    arrivedDate: delivery?.full_receipt_date,
    orderedQty: numberValue(delivery?.ordered_qty),
    receivedQty: numberValue(delivery?.received_qty),
    deliveryStatus: delivery?.delivery_status ?? 'NOT_RECEIVED',
    promisedDeliveryDate: delivery?.promised_delivery_date ?? request.dueDate,
    firstReceiptDate: delivery?.first_receipt_date,
    fullReceiptDate: delivery?.full_receipt_date,
    scorecardCompleted: delivery?.scorecard_status === 'COMPLETED',
    scorecardScores,
    automaticScorecard: delivery?.automatic_scorecard,
    invoiceCount: numberValue(delivery?.invoice_count),
    latestInvoiceName: delivery?.latest_invoice_name,
    invoiceTotal: numberValue(delivery?.invoice_total),
    outstandingAmount: numberValue(delivery?.outstanding_amount),
    paymentStatus: delivery?.payment_status ?? 'NOT_INVOICED',
    paidAmount: numberValue(delivery?.paid_amount),
    latestPaymentEntry: delivery?.latest_payment_entry,
    lastPaymentDate: delivery?.last_payment_date,
  };
};
