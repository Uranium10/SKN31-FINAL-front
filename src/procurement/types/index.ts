export type NavigationTab = 'dashboard' | 'item-register' | 'mr-list' | 'vendor-select' | 'po-manage' | 'company-policy' | 'ai-decision-log';

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

export interface MaterialRequestAttachment {
  fileName: string;
  /** ERPNext File 문서 ID. 인증된 다운로드 프록시 호출에 사용합니다. */
  fileId?: string;
  fileUrl?: string;
  isPrivate?: boolean;
}

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
  /** 목업 문자열도 허용하여 기존 시연 데이터와 실제 ERP 첨부를 함께 지원합니다. */
  attachmentFiles: Array<string | MaterialRequestAttachment>;
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
  /** Supplier Quotation 문서명. 재비딩으로 같은 공급사가 여러 차수에
   * 걸쳐 견적을 낼 수 있어, supplierId만으로는 행을 구분할 수 없다 -
   * 목록 key와 최종선정 제출 시 어느 견적인지 특정하는 데 쓴다. */
  quotationId?: string;
  /** 이 견적이 제출된 RFQ 문서명. */
  rfqName?: string;
  /** 이 견적이 몇 차 RFQ에서 나왔는지 (재비딩 이력 배지 표시용). 한 번도
   * 재비딩하지 않은 최초 라운드가 0차입니다. */
  rfqRound?: number;
  /** 협력사가 견적서에 제시한 유효기간(YYYY-MM-DD). 지나면 최종 선정에
   * 쓸 수 없습니다. */
  validTill?: string;
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
  /** quotation_ranker의 가격·납기 규칙 점수(0~100). */
  numericScore?: number;
  /** quotation_ranker의 규격 적합도 점수(0~100). */
  specificationScore?: number;
  /** 두 점수를 환경변수 가중치로 합산한 최종 점수(0~100). */
  overallScore?: number;
  /** 규격 평가에 실제 사용된 모델명. */
  evaluationSource?: string;
  currency?: string;
  /** 현재 SQ 집계본에 실제 AI 견적 평가 결과가 결합됐는지 여부입니다. */
  aiEvaluated?: boolean;
  /** AI가 확인한 규격 일치 여부입니다. 평가 전에는 undefined입니다. */
  specMatch?: boolean;
  /** AI가 확인한 요청 수량 충족 여부입니다. 평가 전에는 undefined입니다. */
  fulfillsQuantity?: boolean;
  /** 최종 선정 전 사람이 확인해야 할 AI 지적 사항입니다. */
  aiIssues?: string[];
  isSelected: boolean;
  email?: string;
  /** AI/ERP 공급사 탐색에서 확인한 대표 연락처입니다. 화면에서는 읽기 전용입니다. */
  phone?: string;
  /** 공급사 정보를 확인한 원문 페이지입니다. */
  sourceUrl?: string;
  /** ERPNext, 나라장터, 웹 검색 등 후보가 유입된 경로입니다. */
  source?: string;
  scores?: POScorecardScores;
  recommendationScore?: number;
  evaluationCount?: number;
}

/** ranking(quotation_ranking)에 있는 AI 평가 결과 1건 - 지난 라운드
 * 견적을 최종선정 모달에 보여줄 때, quotationId로 매칭해서 AI 평가
 * 정보를 보강하는 데 쓴다(그 견적이 "AI 분석"으로 이미 평가됐다면). */
export interface QuotationAiEvaluation {
  quotationId: string;
  /** 이 견적을 낸 협력사명. quotation_ranking 행의 supplier_name이며, 지난
   * 라운드 견적까지 포함한 'AI 추천 1순위'를 표시할 때 쓴다(현재 라운드
   * 목록에 없는 견적은 이름을 알아낼 다른 방법이 없다). */
  supplierName?: string;
  aiRank: number;
  aiScore: number;
  aiReason: string;
  numericScore?: number;
  specificationScore?: number;
  overallScore?: number;
  evaluationSource?: string;
  specMatch?: boolean;
  fulfillsQuantity?: boolean;
  aiIssues: string[];
}

/** 규격/정합성 검증에서 순위에 들지 못한 견적과 그 사유.
 * "AI 평가가 아직 안 끝난 견적"과 "검증에서 탈락해 평가 대상이 아닌 견적"을
 * 화면에서 구분하기 위해 백엔드 quotation_excluded를 그대로 받는다. */
export interface QuotationExclusion {
  quotationId: string;
  supplierName?: string;
  /** ACCEPTED / EXCLUDED / REEXTRACT / HUMAN_REVIEW / RFQ_REWRITE 등 검토 상태 */
  status?: string;
  /** 사람이 읽을 수 있는 탈락 근거(수량 부족, 금액 불일치, 유효기간 만료 등) */
  evidence: string[];
  specificationScore?: number;
  specificationReason?: string;
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

/** 재비딩으로 이미 마감된 지난 RFQ 라운드("차수") 1건의 이력입니다.
 * 재비딩해도 ERPNext의 RFQ/Supplier Quotation은 취소하지 않고 그대로
 * 남겨두므로, rfqName으로 언제든 그 라운드의 견적을 다시 조회할 수
 * 있습니다. */
export interface RfqRoundHistoryEntry {
  round: number;
  rfqName: string;
  deadline?: string;
  closedAt?: string;
}

/** 차수 팝업에서 보여줄, 특정 RFQ 1건에 실제로 제출된 견적 품목 1줄. */
export interface RfqRoundQuotationItem {
  itemCode?: string;
  itemName?: string;
  description?: string;
  qty?: number;
  uom?: string;
  rate?: number;
  amount?: number;
  expectedDeliveryDate?: string;
  leadTimeDays?: number;
}

/** 차수 팝업에서 보여줄, 특정 RFQ 1건에 제출된 Supplier Quotation 1건. */
export interface RfqRoundQuotation {
  name: string;
  supplier: string;
  transactionDate?: string;
  validTill?: string;
  grandTotal?: number;
  items: RfqRoundQuotationItem[];
}

/** GET /cases/{caseId}/rfq-rounds/{rfqName}/quotations 응답 - 특정 차수의
 * 견적 회신 현황 스냅샷입니다. */
export interface RfqRoundSnapshot {
  rfqName: string;
  recipientCount: number;
  respondedCount: number;
  responseRate: number;
  quotations: RfqRoundQuotation[];
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
  /** 지금 진행 중인(마감되지 않은) 라운드의 RFQ 문서명입니다. 아직 RFQ를
   * 한 번도 안 보냈으면 undefined입니다. */
  rfqName?: string;
  /** 재비딩으로 이미 마감된 지난 라운드들의 이력(오래된 순). 총 차수는
   * rfqRounds.length + (rfqName이 있으면 1)입니다. */
  rfqRounds?: RfqRoundHistoryEntry[];
  quotations: SupplierQuotation[];
  /** quotation_ranking 전체(라운드 무관)의 AI 평가 결과 - 최종선정 모달이
   * 지난 라운드 견적(별도로 직접 조회해온)에 AI 평가를 매칭해 보여줄 때 쓴다. */
  quotationAiEvaluations?: QuotationAiEvaluation[];
  /** 순위에서 제외된 견적과 사유(quotation_excluded). */
  quotationExclusions?: QuotationExclusion[];
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
  workflowStatus?: string;
  workflowStage?: string;
  workflowError?: string;
  orderStarted?: boolean;
  transitionPhase?: WorkflowTransitionPhase;
}

export interface POProcessingIssue {
  code: 'supplier_not_found' | 'po_creation_failed' | 'email_send_failed';
  title: string;
  detail: string;
  failedAt: string;
}

export type POScorecardScores = Omit<SupplierScores, 'price'> & { price?: number };

export interface SupplierRecommendation {
  scores: POScorecardScores;
  average_score: number;
  evaluation_count: number;
}

export interface POItem {
  id: string;
  prNo: string;
  mrNo: string;
  caseId?: string;
  rfqName?: string;
  itemName: string;
  itemCode: string;
  department: string;
  selectedSupplier: string;
  supplierEmail?: string;
  totalAmount: number;
  dueDate: string; // 약정 납기일 (YYYY-MM-DD)
  actualDeliveryDate?: string; // 실제 수령일 (기본 '-')
  supplierApprovalStatus: 'pending' | 'pr_requested' | 'accepted' | 'rejected' | 'approved';
  backendStatus?: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'PO_CREATED' | 'PO_FAILED' | 'CANCELLED';
  token?: string;
  expiresAt?: string;
  purchaseMode?: 'direct' | 'quotation';
  referencePO?: string;
  referenceUnitPrice?: number;
  prStatus?: string;
  prRejectionReason?: string;
  prSupplierEmail?: string;
  rejectReason?: string;
  poCreated: boolean;
  processingStatus?: 'ready' | 'created' | 'creation_failed' | 'email_failed';
  processingIssue?: POProcessingIssue;
  poNo?: string;
  createdDate?: string;
  officialPoSent?: boolean; // 공식 PO 이메일 발송 여부
  officialPoNo?: string; // ERPNext Submit 완료된 공식 PO 번호
  // PO 발주 후 입고 확인 및 Supplier Scorecard 평가
  arrived?: boolean;
  arrivedDate?: string;
  scorecardScores?: POScorecardScores;
  automaticScorecard?: {
    scores: Partial<Pick<SupplierScores, 'leadTime' | 'price'>>;
    reasons: Partial<Record<'leadTime' | 'price', string>>;
  };
  scorecardCompleted?: boolean;
  backendCaseId?: string;
  pendingTaskId?: string;
  pendingTask?: PendingHumanTask;
  // PO 생성 실패(po_creation_failed) 등 워크플로 예외 상태를 PO 관리
  // 화면에서도 보여주기 위한 필드. caseToMaterialRequest의 workflowError와
  // 동일하게 friendlyWorkflowError(last_error)로 채워진다.
  workflowStage?: string;
  workflowError?: string;
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
  caseId?: string;
  notificationType?: string;
  title: string;
  detail: string;
  time: string;
  createdAt?: string;
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
