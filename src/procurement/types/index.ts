export type NavigationTab = 'dashboard' | 'item-register' | 'mr-list' | 'vendor-select' | 'po-manage';

export type ItemSpecificationValue = string | number | boolean | null;

/**
 * ERPNext 품목 및 품목군마다 달라지는 규격 컬럼의 공통 표현입니다.
 * key는 ERPNext fieldname을 그대로 유지하여 저장/수정 API와 재사용합니다.
 */
export interface ItemSpecificationField {
  key: string;
  label: string;
  value: ItemSpecificationValue;
  valueType?: 'text' | 'number' | 'boolean' | 'date' | 'link' | 'select';
  unit?: string;
  group?: string;
  order?: number;
  required?: boolean;
  source?: 'erpnext' | 'item_group_spec' | 'legacy' | 'mock';
}

/** 향후 GET /purchase/items/{item_code}/specifications 응답에 사용할 계약입니다. */
export interface ERPItemSpecificationResponse {
  item_code: string;
  item_name: string;
  item_group?: string;
  department?: string;
  stock_uom?: string;
  description?: string | null;
  maintain_stock?: boolean;
  is_fixed_asset?: boolean;
  registered_date?: string;
  specification_fields: Array<{
    fieldname: string;
    label: string;
    value: ItemSpecificationValue;
    fieldtype?: ItemSpecificationField['valueType'];
    unit?: string;
    section?: string;
    display_order?: number;
    required?: boolean;
  }>;
}

export interface Item {
  id: string;
  itemCode: string;
  department: string;
  itemName: string;
  specSummary: string;
  /** 품목별 동적 규격. 없으면 fullSpec/attributes를 레거시 규격으로 변환합니다. */
  specifications?: ItemSpecificationField[];
  fullSpec: {
    dimensions: string;
    material: string;
    operatingTemp: string;
    pressureRating: string;
    manufacturer: string;
    notes: string;
  };
  maintainStock: boolean;
  isFixedAsset: boolean;
  attributes: {
    heatResistant: boolean;
    highPressure: boolean;
    isoCertified: boolean;
    waterproof: boolean;
    customizable: boolean;
  };
  registeredDate: string;
  status: '승인' | '승인대기' | '반려';
  rejectReason?: string;
}

export type MRSubstituteStage = 'not_started' | 'notified_waiting' | 'not_used_confirmed';

export type WorkflowTransitionPhase = 'entering' | 'stable' | 'exiting';

export interface PendingHumanTask {
  taskId: string;
  taskType: string;
  title: string;
  description?: string;
  audience?: string;
  channel?: string;
  inputSchema: Record<string, unknown>;
  payload: Record<string, unknown>;
  version?: number;
}

export interface MaterialRequest {
  id: string;
  mrNo: string;
  department: string;
  requester: string;
  itemCode: string;
  category: string;
  itemName: string;
  specSummary: string;
  fullSpecText: string;
  hasAttachment: boolean;
  attachmentCount: number;
  attachmentFiles: string[];
  unitPrice: number;
  totalPrice: number;
  quantity?: number;
  dueDate: string; // YYYY-MM-DD
  dDay: number;
  isUrgent: boolean;
  status: '승인' | '승인대기' | '반려';
  rejectReason?: string;
  revisionRound?: number;
  returnedFromSupplier?: boolean;
  returnReason?: string;
  reviewHistory?: MRReviewHistoryEntry[];
  // 승인 후 대체품 확인 진행 상태: 대체품 후보 존재 여부와 진행 단계
  hasSubstituteCandidates?: boolean;
  substituteStage?: MRSubstituteStage;
  /** PostgreSQL/LangGraph 연동 모드에서만 채워지는 안정적인 서버 상태입니다. */
  workflowStatus?: string;
  workflowStage?: string;
  workflowError?: string;
  /** 실패한 그래프가 실행 가능한 next 체크포인트를 보유한 경우에만 true입니다. */
  canRetry?: boolean;
  pendingTaskCount?: number;
  pendingTask?: PendingHumanTask;
  erpStatus?: string;
  transitionPhase?: WorkflowTransitionPhase;
  // Progress stages
  processStage: {
    approval: '완료' | '진행중' | '대기';
    quotationProgressPercent: number; // e.g. 75 (%)
    prSupplierApproved: '승인' | '거절' | '대기';
    poCreated: boolean;
  };
}

export type MRReviewHistoryType = 'buyer_rejection' | 'supplier_return';

export interface MRReviewHistoryEntry {
  id: string;
  round: number;
  type: MRReviewHistoryType;
  reason: string;
  source: string;
  occurredAt: string;
}

export interface SupplierScores {
  leadTime: number; // 납기 (1~5)
  quality: number; // 품질 (1~5)
  price: number; // 가격 (1~5)
  service: number; // 응대 (1~5)
  communication: number; // 의사소통 (1~5)
}

export interface SupplierQuotation {
  supplierId: string;
  supplierName: string;
  quoteUnitPrice: number;
  quoteTotalPrice: number;
  leadTimeDays: number;
  /** Supplier Quotation 품목에 공급사가 직접 제시한 납기일(YYYY-MM-DD). */
  expectedDeliveryDate?: string;
  isResponded: boolean;
  resContent: string;
  resAttachments: string[];
  aiRank: number;
  aiScore: number;
  aiReason: string;
  isSelected: boolean;
  email?: string;
  /** AI/ERP 공급사 탐색에서 확인한 대표 연락처입니다. 화면에서는 읽기 전용입니다. */
  phone?: string;
  /** 공급사 정보를 확인한 원문 페이지입니다. */
  sourceUrl?: string;
  /** ERPNext, 나라장터, 웹 검색 등 후보가 유입된 경로입니다. */
  source?: string;
  scores?: SupplierScores;
}

export interface VendorSelectionHistoryEntry {
  id: string;
  round: number;
  supplierId: string;
  supplierName: string;
  prNo: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  selectedAt: string;
  withdrawnAt?: string;
  withdrawalReason?: string;
}

export interface VendorResolutionIssue {
  code: 'supplier_search_failed' | 'supplier_registration_failed';
  title: string;
  detail: string;
  failedAt: string;
}

export interface VendorSelectionGroup {
  id: string;
  mrNo: string;
  itemName: string;
  itemCode: string;
  department: string;
  quantity: number;
  unit: string;
  targetDueDate: string;
  deadlineDate: string; // YYYY-MM-DD
  deadlineTime: string; // HH:mm
  deadlineDDay: number;
  isExtended?: boolean;
  rfqSent?: boolean;
  quotations: SupplierQuotation[];
  selectedSupplierId?: string;
  supplierApprovalStatus?: 'approved' | 'rejected' | 'pending';
  selectionRound?: number;
  selectionHistory?: VendorSelectionHistoryEntry[];
  resolutionIssue?: VendorResolutionIssue;
  prSent: boolean;
  prNo?: string;
  backendCaseId?: string;
  pendingTaskId?: string;
  pendingTask?: PendingHumanTask;
  workflowStage?: string;
  orderStarted?: boolean;
  transitionPhase?: WorkflowTransitionPhase;
}

export interface POProcessingIssue {
  code: 'supplier_not_found' | 'po_creation_failed' | 'email_send_failed';
  title: string;
  detail: string;
  failedAt: string;
}

export interface POItem {
  id: string;
  prNo: string;
  mrNo: string;
  itemName: string;
  itemCode: string;
  department: string;
  selectedSupplier: string;
  totalAmount: number;
  purchaseMode?: 'direct' | 'quotation';
  referencePO?: string;
  referenceUnitPrice?: number;
  dueDate: string;
  supplierApprovalStatus: 'approved' | 'rejected' | 'pending';
  rejectReason?: string;
  poCreated: boolean;
  processingStatus?: 'ready' | 'created' | 'creation_failed' | 'email_failed';
  processingIssue?: POProcessingIssue;
  poNo?: string;
  createdDate?: string;
  // PO 발주 후 도착 확인 및 Supplier Scorecard 평가
  arrived?: boolean;
  arrivedDate?: string;
  scorecardScores?: SupplierScores;
  scorecardCompleted?: boolean;
  backendCaseId?: string;
  pendingTaskId?: string;
  pendingTask?: PendingHumanTask;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  orderedQty?: number;
  receivedQty?: number;
  deliveryStatus?: 'NOT_RECEIVED' | 'PARTIAL' | 'FULL';
  promisedDeliveryDate?: string;
  firstReceiptDate?: string;
  fullReceiptDate?: string;
  invoiceCount?: number;
  latestInvoiceName?: string;
  invoiceTotal?: number;
  outstandingAmount?: number;
  paymentStatus?: 'NOT_INVOICED' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  paidAmount?: number;
  latestPaymentEntry?: string;
  lastPaymentDate?: string;
  transitionPhase?: WorkflowTransitionPhase;
}

export interface AiLog {
  id: string;
  time: string;
  type: 'success' | 'warning' | 'info';
  title: string;
  detail: string;
  mrNo?: string;
}

export interface ProcurementNotification {
  id: string;
  title: string;
  detail: string;
  time: string;
  unread: boolean;
  targetTab: NavigationTab;
  reference?: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
}

export type WorkflowStageTab = 'mr-list' | 'vendor-select' | 'po-manage';

/** 단계 이동 직후 원래 행 자리에 잠시 남는 프론트 전용 안내입니다. */
export interface StageMovePlaceholder {
  id: string;
  mrNo: string;
  itemName: string;
  sourceTab: WorkflowStageTab;
  destinationTab?: NavigationTab;
  destinationLabel: string;
  index: number;
}

export interface GlobalSearchResult {
  id: string;
  type: 'item' | 'mr';
  title: string;
  subtitle: string;
  searchValue: string;
  targetTab: NavigationTab;
}
