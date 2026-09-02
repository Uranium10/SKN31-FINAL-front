import { fetchWithAuth } from '../../utils/auth';
import type { MaterialRequest, POItem, SupplierQuotation, VendorSelectionGroup } from '../types';

export type ProcurementDataMode = 'mock' | 'hybrid' | 'api';

export interface ProcurementCaseDTO {
  case_id: string;
  mr_name: string;
  status: string;
  stage: string;
  item_code?: string | null;
  item_name?: string | null;
  summary?: Record<string, unknown>;
  workflow_snapshot?: Record<string, unknown>;
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
  urgent_no_supplier_cancelled: { status: 'CANCELLED', stage: 'CANCELLED' },
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
): Promise<void> => {
  const response = await fetchWithAuth(`/api/procurement/tasks/${encodeURIComponent(taskId)}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer, version }),
  });
  await parseJson(response);
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

const attachmentsFromSummary = (summary: Record<string, unknown>): string[] => {
  const attachments = Array.isArray(summary.attachments) ? summary.attachments : [];
  return attachments.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const row = item as Record<string, unknown>;
      return text(row.file_name) || text(row.file_url) || '첨부파일';
    }
    return '첨부파일';
  });
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
  const respondedSuppliers = new Set(
    quotationRows
      .map((row) => text(row.supplier) || text(row.supplier_name) || text(row.name))
      .filter((name) => name && (rfqRecipients.size === 0 || rfqRecipients.has(name))),
  );
  const quotationProgressPercent = rfqRecipients.size > 0
    ? Math.min(100, Math.round((respondedSuppliers.size / rfqRecipients.size) * 100))
    : 0;
  const hasSelectedSupplier = Boolean(text(rawValues.selected_supplier));
  const hasCreatedPO = Boolean(
    text(rawValues.po_name) || text(entry.delivery?.po_name),
  );

  return {
    id: entry.case_id,
    mrNo: entry.mr_name,
    department: text(summary.department, '요청부서 미지정'),
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
    isUrgent: dDay <= 3,
    status: isRejected ? '반려' : isAwaitingMRApproval ? '승인대기' : '승인',
    rejectReason: isRejected ? entry.last_error ?? undefined : undefined,
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
  const rankingBySupplier = new Map(ranking.map((row) => [supplierName(row), row]));
  const candidateNames = new Set(recipientCandidates.map(supplierName));
  const source = [
    ...recipientCandidates.map((candidate) => ({
      ...candidate,
      ...(rankingBySupplier.get(supplierName(candidate)) ?? {}),
    })),
    ...ranking.filter((ranked) => (
      !candidateNames.has(supplierName(ranked))
      && (sentSupplierNames.size === 0 || sentSupplierNames.has(supplierName(ranked)))
    )),
  ];
  return source.map((row, index) => {
    const name = supplierName(row);
    const responded = rankingBySupplier.has(name);
    const unitPrice = numberValue(row.rate ?? row.unit_price ?? row.quote_unit_price);
    const totalPrice = numberValue(row.amount ?? row.total ?? row.total_price) || unitPrice;
    return {
      supplierId: name,
      supplierName: name,
      quoteUnitPrice: unitPrice,
      quoteTotalPrice: totalPrice,
      leadTimeDays: numberValue(row.lead_time_days ?? row.lead_time),
      isResponded: responded,
      resContent: text(row.reason ?? row.ai_reason, 'AI 및 거래 이력을 바탕으로 확인된 협력사입니다.'),
      resAttachments: [],
      aiRank: numberValue(row.rank) || index + 1,
      aiScore: numberValue(row.score ?? row.ai_score),
      aiReason: text(row.reason ?? row.ai_reason, '추천 근거를 준비 중입니다.'),
      isSelected: text(values.selected_supplier) === name,
      email: text(row.email ?? row.email_id) || undefined,
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
    'PRE_PO_APPROVAL', 'PO_CREATION', 'DELIVERY', 'SCORECARD', 'COMPLETED',
  ].includes(entry.stage);
  const deadline = entry.quotation_deadline_at
    ? new Date(entry.quotation_deadline_at)
    : null;
  const hasDeadline = deadline && !Number.isNaN(deadline.getTime());
  const deadlineDate = hasDeadline ? deadline.toISOString().slice(0, 10) : dateMinusDays(request.dueDate, 3);
  const deadlineTime = hasDeadline
    ? deadline.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '18:00';
  return {
    id: entry.case_id,
    backendCaseId: entry.case_id,
    pendingTaskId: entry.pending_task?.task_id,
    pendingTask: pendingTask(entry),
    workflowStage: entry.stage,
    orderStarted: ['PRE_PO_APPROVAL', 'PO_CREATION', 'DELIVERY', 'SCORECARD', 'COMPLETED'].includes(entry.stage),
    mrNo: entry.mr_name,
    itemName: request.itemName,
    itemCode: request.itemCode,
    department: request.department,
    quantity: request.quantity ?? 0,
    unit: text(entry.summary?.uom, 'EA'),
    targetDueDate: request.dueDate,
    deadlineDate,
    deadlineTime,
    deadlineDDay: Math.max(0, request.dDay - 3),
    rfqSent,
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
  const approvalStatus = entry.stage === 'PRE_PO_APPROVAL' ? 'pending' : 'approved';
  const fullReceipt = delivery?.delivery_status === 'FULL';
  const scorecard = delivery?.scorecard;
  const scorecardScores = scorecard && ['quality', 'leadTime', 'price', 'service', 'communication']
    .every((key) => typeof scorecard[key] === 'number')
    ? {
      quality: scorecard.quality as number,
      leadTime: scorecard.leadTime as number,
      price: scorecard.price as number,
      service: scorecard.service as number,
      communication: scorecard.communication as number,
    }
    : undefined;
  return {
    id: entry.case_id,
    backendCaseId: entry.case_id,
    pendingTaskId: entry.pending_task?.task_id,
    pendingTask: pendingTask(entry),
    prNo: poName || '발주 승인 대기',
    mrNo: entry.mr_name,
    itemName: request.itemName,
    itemCode: request.itemCode,
    department: request.department,
    selectedSupplier,
    totalAmount: directTotalAmount || request.totalPrice,
    purchaseMode: values.direct_purchase === true ? 'direct' : 'quotation',
    referencePO: text(directBasis.reference_po) || undefined,
    referenceUnitPrice: directUnitPrice || undefined,
    dueDate: request.dueDate,
    supplierApprovalStatus: 'approved',
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
