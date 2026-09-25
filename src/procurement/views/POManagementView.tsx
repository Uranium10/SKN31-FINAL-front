import React, { useMemo, useState } from 'react';
import type { POItem, POScorecardScores, SupplierScores, StageMovePlaceholder } from '../types';
import { SmartTableContainer } from '../components/SmartTableContainer';
import { StageMovePlaceholderRow } from '../components/StageMovePlaceholderRow';
import { WorkflowInterruptForm } from '../components/WorkflowInterruptForm';
import { ExcelColumnHeader } from '../components/ExcelColumnHeader';
import {
  matchesTableRange,
  normalizeTableFilterValue,
  useSessionStoredState,
  useSessionTableState,
  type TableColumnRangeFilter,
  type TableColumnDefinition,
} from '../hooks/useSessionTableState';
import {
  CheckCircle2,
  Clock,
  FileText,
  X,
  AlertTriangle,
  PackageCheck,
  ClipboardList,
  Star,
  Mail,
  XCircle,
  ShoppingCart,
  CircleDollarSign,
  Send,
} from 'lucide-react';

type POColumnKey = 'poNo' | 'mrNo' | 'item' | 'supplier' | 'amount' | 'promisedDate' | 'receivedDate' | 'payment' | 'status' | 'action';

const PO_COLUMNS: readonly TableColumnDefinition<POColumnKey>[] = [
  { key: 'poNo', label: 'PO 번호', defaultWidth: 175, minWidth: 130 },
  { key: 'mrNo', label: 'MR 번호', defaultWidth: 175, minWidth: 135 },
  { key: 'item', label: '품목명 및 아이템코드', defaultWidth: 250, minWidth: 180 },
  { key: 'supplier', label: '협력사', defaultWidth: 190, minWidth: 140 },
  { key: 'amount', label: '발주금액', defaultWidth: 145, minWidth: 110, align: 'right', filterMode: 'number-range' },
  { key: 'promisedDate', label: '약정 납기일', defaultWidth: 145, minWidth: 115, filterMode: 'date-range' },
  { key: 'receivedDate', label: '실제 수령일', defaultWidth: 145, minWidth: 115, filterMode: 'date-range' },
  { key: 'payment', label: '대금결제', defaultWidth: 165, minWidth: 130 },
  { key: 'status', label: '현재 단계', defaultWidth: 190, minWidth: 150 },
  // ⚠️ 예전엔 이 컬럼 자리에 배지랑 버튼이 한꺼번에 쌓여 있었다(구매팀
  // 피드백: "컬럼에 너무 많은 정보"). 바이어가 실제로 클릭하는 버튼만
  // 이 별도 컬럼으로 분리한다 - 입고 확인/대금결제는 ERPNext 웹훅으로
  // 자동 갱신되고 버튼이 없으므로(아래 표 본문 참고) 이 컬럼에도
  // 나타나지 않는다.
  { key: 'action', label: '다음 행동', defaultWidth: 200, minWidth: 160, filterMode: 'none' },
] as const;

type PORangeFilters = Partial<Record<POColumnKey, TableColumnRangeFilter>>;

interface POManagementViewProps {
  poItems: POItem[];
  movePlaceholders?: StageMovePlaceholder[];
  onDismissMovePlaceholder?: (id: string) => void;
  onNavigateMovePlaceholder?: (placeholder: StageMovePlaceholder) => void;
  onCreatePO: (poId: string) => void;
  onStartOrder: (poId: string) => void;
  onRequestPR: (poId: string) => void;
  onSupplierAcceptOrder: (poId: string, decision?: 'accept' | 'reject', reason?: string) => void;
  onReturnToVendorSelection: (poId: string) => void;
  onSelectNextSupplier?: (poId: string, supplierId: string) => void;
  onCancelMR: (poId: string) => void;
  onMarkArrived: (poId: string) => void;
  onSubmitScorecard: (poId: string, scores: POScorecardScores) => void;
  onAnswerTask?: (taskId: string, answer: Record<string, unknown>, version?: number) => Promise<void> | void;
  isApiMode?: boolean;
}

const SCORECARD_CRITERIA: { key: keyof SupplierScores; label: string }[] = [
  { key: 'service', label: '대응력' },
  { key: 'communication', label: '커뮤니케이션' },
  { key: 'quality', label: '품질' },
];

const getScoreAverage = (scores: POScorecardScores) => (
  (scores.quality + scores.leadTime + (scores.price ?? 0) + scores.service + scores.communication)
  / (scores.price == null ? 4 : 5)
);

const getOverallProgress = (item: POItem) => {
  if (item.pendingTask?.taskType === 'po_creation_failed') {
    return { label: 'PO 생성 실패 · 확인 필요', className: 'badge-red' };
  }
  if (item.pendingTask?.taskType === 'order_start') {
    return { label: '긴급발주 · 발주 시작 대기', className: 'badge-yellow' };
  }
  if (item.pendingTask?.taskType === 'pr_request' || item.supplierApprovalStatus === 'pending') {
    return { label: 'PR 요청 대기', className: 'badge-yellow' };
  }
  if (item.prStatus === 'SENT' || item.supplierApprovalStatus === 'pr_requested') {
    return { label: 'PR 요청 · 수주접수 대기', className: 'badge-gray' };
  }
  if (
    (item.prStatus === 'ACCEPTED' || item.supplierApprovalStatus === 'accepted' || item.supplierApprovalStatus === 'approved')
    && !item.poCreated
  ) {
    return { label: '수주접수 · PO 생성 중', className: 'badge-green' };
  }
  if (item.prStatus === 'REJECTED' || item.supplierApprovalStatus === 'rejected') {
    return { label: '수주 거절', className: 'badge-red' };
  }
  if (!item.poCreated) return { label: 'PO 최종 승인 대기', className: 'badge-yellow' };
  if (item.deliveryStatus === 'PARTIAL') return { label: '부분 입고 진행 중', className: 'badge-yellow' };
  if (!item.arrived) return { label: `PO 생성 완료 · ${item.poNo}`, className: 'badge-blue' };
  if (item.paymentStatus === 'PARTIALLY_PAID') return { label: '부분 결제 진행 중', className: 'badge-yellow' };
  if (item.paymentStatus !== 'PAID') return { label: '물품 도착', className: 'badge-green' };
  if (!item.scorecardCompleted) return { label: '협력사 평가 대기', className: 'badge-yellow' };
  return { label: '구매 업무 완료', className: 'badge-green' };
};

// 진행중/완료 탭 분리 기준: getOverallProgress()가 내려주는 마지막 상태
// ('구매 업무 완료' - PO 생성+입고+결제+평가가 전부 끝난 상태)를 그대로
// 재사용한다. 새 판정 로직이 아니라 이미 있는 상태 계산을 탭 분리에도
// 그대로 쓰는 것.
const isPoComplete = (item: POItem): boolean => getOverallProgress(item).label === '구매 업무 완료';

const paymentLabel = (item: POItem): string => ({
  PAID: '결제 완료',
  PARTIALLY_PAID: '부분 결제',
  UNPAID: '결제 대기',
  NOT_INVOICED: '매입송장 대기',
}[item.paymentStatus ?? 'NOT_INVOICED']);

const poFilterValue = (item: POItem, key: POColumnKey): string | number => {
  switch (key) {
    case 'poNo': return item.poNo ?? '발주 대기';
    case 'mrNo': return item.mrNo;
    case 'item': return `${item.itemName} · ${item.itemCode}`;
    case 'supplier': return item.selectedSupplier || '협력사 미지정';
    case 'amount': return item.totalAmount;
    case 'promisedDate': return item.promisedDeliveryDate ?? item.dueDate;
    case 'receivedDate': return item.fullReceiptDate ?? item.arrivedDate ?? item.firstReceiptDate ?? '-';
    case 'payment': return paymentLabel(item);
    case 'status': return getOverallProgress(item).label;
    case 'action': return '';
  }
};

export const POManagementView: React.FC<POManagementViewProps> = ({
  poItems,
  movePlaceholders = [],
  onDismissMovePlaceholder = () => undefined,
  onNavigateMovePlaceholder = () => undefined,
  onCreatePO,
  onStartOrder,
  onRequestPR,
  onSupplierAcceptOrder,
  onReturnToVendorSelection,
  onSelectNextSupplier,
  onCancelMR,
  onMarkArrived,
  onSubmitScorecard,
  onAnswerTask,
  isApiMode = false,
}) => {
  const [selectedMRDetail, setSelectedMRDetail] = useState<POItem | null>(null);
  // MRListView와 동일하게, 에러문구 클릭하면 펼쳐서 전체 보이게 (요청별 토글).
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const toggleErrorExpanded = (id: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const [selectedRejectReason, setSelectedRejectReason] = useState<POItem | null>(null);
  const [showReselectList, setShowReselectList] = useState<boolean>(false);
  const [emailModalItem, setEmailModalItem] = useState<POItem | null>(null);
  const [approvalModalItem, setApprovalModalItem] = useState<POItem | null>(null);
  const [scorecardItem, setScorecardItem] = useState<POItem | null>(null);
  const [draftScores, setDraftScores] = useState<Partial<SupplierScores>>({});
  const [showRejectInput, setShowRejectInput] = useState<boolean>(false);
  const [rejectReasonText, setRejectReasonText] = useState<string>('');
  const tableState = useSessionTableState('po-management', PO_COLUMNS);
  const [rangeFilters, setRangeFilters] = useSessionStoredState<PORangeFilters>(
    'biddingflow.table.po-management.ranges',
    {},
  );
  const [sortColumn, setSortColumn] = useState<POColumnKey>('mrNo');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  // 진행중/완료 탭 - 결제·평가까지 다 끝난(구매 업무 완료) 건을 목록에서
  // 분리해서, 아직 바이어가 볼 일이 있는 건만 기본으로 보이게 한다.
  const [activeTab, setActiveTab] = useState<'progress' | 'completed'>('progress');

  const poFilterOptions = useMemo(() => Object.fromEntries(PO_COLUMNS.map((column) => [
    column.key,
    poItems.map((item) => column.key === 'amount'
      ? `₩${item.totalAmount.toLocaleString()}`
      : String(poFilterValue(item, column.key))),
  ])) as Record<POColumnKey, string[]>, [poItems]);

  const visiblePOItems = useMemo(() => poItems
    .filter((item) => PO_COLUMNS.every((column) => {
      if (column.filterMode === 'number-range' || column.filterMode === 'date-range') {
        return matchesTableRange(
          poFilterValue(item, column.key),
          rangeFilters[column.key],
          column.filterMode,
        );
      }
      if (column.filterMode === 'none') return true;
      const selected = tableState.filters[column.key];
      return selected === undefined
        || selected.includes(normalizeTableFilterValue(poFilterValue(item, column.key)));
    }))
    .sort((left, right) => {
      const leftValue = poFilterValue(left, sortColumn);
      const rightValue = poFilterValue(right, sortColumn);
      const compared = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'ko-KR', { numeric: true });
      return sortDirection === 'asc' ? compared : -compared;
    }), [poItems, rangeFilters, sortColumn, sortDirection, tableState.filters]);

  const progressCount = useMemo(() => poItems.filter((item) => !isPoComplete(item)).length, [poItems]);
  const completedCount = useMemo(() => poItems.filter((item) => isPoComplete(item)).length, [poItems]);
  const tabFilteredPOItems = useMemo(
    () => visiblePOItems.filter((item) => (activeTab === 'completed' ? isPoComplete(item) : !isPoComplete(item))),
    [visiblePOItems, activeTab],
  );

  const openScorecard = (item: POItem) => {
    setScorecardItem(item);
    setDraftScores({ ...item.scorecardScores, ...item.automaticScorecard?.scores });
  };

  const closeScorecard = () => {
    setScorecardItem(null);
    setDraftScores({});
  };

  const handleRequestPRClick = (item: POItem) => {
    onRequestPR(item.id);
    if (!isApiMode) {
      setEmailModalItem(item);
    }
  };

  const handleSupplierAcceptClick = (item: POItem) => {
    onSupplierAcceptOrder(item.id, 'accept');
    setEmailModalItem(null);
    setShowRejectInput(false);
  };

  const handleSupplierRejectSubmit = (item: POItem) => {
    if (!rejectReasonText.trim() || rejectReasonText.trim().length < 2) {
      alert('거절 사유를 2자 이상 입력해 주세요.');
      return;
    }
    onSupplierAcceptOrder(item.id, 'reject', rejectReasonText.trim());
    setEmailModalItem(null);
    setShowRejectInput(false);
    setRejectReasonText('');
  };

  const currentScorecardItem = poItems.find((item) => item.id === scorecardItem?.id) ?? scorecardItem;
  const automaticScorecard = currentScorecardItem?.automaticScorecard;
  const isDraftComplete = SCORECARD_CRITERIA.every((criterion) => draftScores[criterion.key])
    && automaticScorecard?.scores.leadTime != null;

  // 수주 거절(pr_rejection_review) 대기 작업의 payload에는 백엔드가
  // "이 거절된 공급사 말고 아직 견적을 제출한 다른 협력사가 남아있는지"
  // (remaining_suppliers)와 "이 MR에서 지금까지 수주를 거절한 협력사
  // 누적 이력"(rejected_suppliers)을 함께 내려준다. 후자는 여러 라운드에
  // 걸쳐 재선택을 반복할 때 예전에 거절했던 협력사가 남은 후보에 다시
  // 나타날 수 있어서(A거절->B선택->B도거절 시 remaining에 A가 재등장)
  // 그런 협력사를 빨간 배지로 표시하는 데 쓴다.
  const canReselectFromQuotations = selectedRejectReason?.pendingTask?.taskType === 'pr_rejection_review';
  const remainingQuotationSuppliers = useMemo<Array<{ name?: string; supplier?: string; reason?: string }>>(() => {
    if (!canReselectFromQuotations) return [];
    const payload = selectedRejectReason?.pendingTask?.payload as Record<string, unknown> | undefined;
    const raw = payload?.remaining_suppliers;
    return Array.isArray(raw) ? (raw as Array<{ name?: string; supplier?: string; reason?: string }>) : [];
  }, [canReselectFromQuotations, selectedRejectReason]);
  const previouslyRejectedSupplierKeys = useMemo<Set<string>>(() => {
    const payload = selectedRejectReason?.pendingTask?.payload as Record<string, unknown> | undefined;
    const raw = payload?.rejected_suppliers;
    const keys = new Set<string>();
    if (Array.isArray(raw)) {
      (raw as Array<{ supplier?: string }>).forEach((entry) => {
        if (entry?.supplier) keys.add(entry.supplier);
      });
    }
    return keys;
  }, [selectedRejectReason]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner Guide (Matching Screenshot 1 exactly) */}
      <div
        style={{
          backgroundColor: '#e6f4ea',
          border: '1px solid #ceead6',
          borderRadius: '8px',
          padding: '14px 20px',
          fontSize: '13px',
          color: '#137333',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <PackageCheck size={20} color="#137333" />
        <span>
          <strong>PO 발송 전 최종 승인부터 입고·대금결제·협력사 평가까지 관리합니다.</strong> ERPNext의 <strong>Purchase Receipt, Purchase Invoice, Payment Entry</strong>를 기준으로 진행상태를 자동 갱신합니다.
        </span>
      </div>

      {/* 진행중 / 완료 탭 */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={() => setActiveTab('progress')}
          style={{
            padding: '10px 18px',
            fontSize: '14px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: activeTab === 'progress' ? 'var(--primary)' : 'var(--text-dim)',
            borderBottom: activeTab === 'progress' ? '2px solid var(--primary)' : '2px solid transparent',
          }}
        >
          진행중 &nbsp;{progressCount}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          style={{
            padding: '10px 18px',
            fontSize: '14px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: activeTab === 'completed' ? 'var(--primary)' : 'var(--text-dim)',
            borderBottom: activeTab === 'completed' ? '2px solid var(--primary)' : '2px solid transparent',
          }}
        >
          완료 &nbsp;{completedCount}
        </button>
      </div>

      {/* PO Management Table */}
      <SmartTableContainer>
        <table
          className="custom-table configurable-table"
          style={{ width: `${tableState.totalWidth}px`, minWidth: '100%' }}
        >
          <colgroup>
            {PO_COLUMNS.map((column) => (
              <col key={column.key} style={{ width: tableState.widths[column.key] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {PO_COLUMNS.map((column) => (
                <ExcelColumnHeader
                  key={column.key}
                  columnKey={column.key}
                  label={column.label}
                  width={tableState.widths[column.key]}
                  minWidth={column.minWidth}
                  align={column.align}
                  values={poFilterOptions[column.key]}
                  selectedValues={column.filterMode ? undefined : tableState.filters[column.key]}
                  onFilterChange={(selected) => tableState.setFilter(column.key, selected)}
                  filterMode={column.filterMode}
                  rangeValue={rangeFilters[column.key]}
                  onRangeFilterChange={(range) => setRangeFilters((current) => {
                    const next = { ...current };
                    if (range) next[column.key] = range;
                    else delete next[column.key];
                    return next;
                  })}
                  onResizeStart={(event) => tableState.beginResize(column.key, event)}
                  activeSort={sortColumn === column.key ? sortDirection : undefined}
                  onSort={(direction) => { setSortColumn(column.key); setSortDirection(direction); }}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {tabFilteredPOItems.map((item, rowIndex) => (
              <React.Fragment key={item.id}>
                {movePlaceholders
                  .filter((placeholder) => placeholder.index === rowIndex)
                  .map((placeholder) => (
                    <StageMovePlaceholderRow
                      key={placeholder.id}
                      placeholder={placeholder}
                      colSpan={10}
                      onNavigate={onNavigateMovePlaceholder}
                      onDismiss={onDismissMovePlaceholder}
                    />
                  ))}
                <tr className={`workflow-transition-${item.transitionPhase ?? 'stable'}`}>
                {/* PO 번호 */}
                <td>
                  {item.poCreated ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                        {item.poNo}
                      </span>
                      {item.createdDate && (
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{item.createdDate}</span>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-dim)' }}>발주 대기</span>
                  )}
                </td>
                {/* MR 번호 */}
                <td>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                    {item.mrNo}
                  </span>
                </td>
                {/* 품목명 및 아이템코드 (클릭 시 MR/PR 상세 확인) */}
                <td>
                  <button
                    className="spec-clickable-btn"
                    onClick={() => setSelectedMRDetail(item)}
                    title="클릭 시 요청부서, 선정 협력사, 발주 금액 등 상세 확인"
                  >
                    <FileText size={13} />
                    <span>
                      {item.itemName} ({item.itemCode})
                    </span>
                  </button>
                </td>
                {/* 협력사 (선정된 공급사명 + 이메일) */}
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                      {item.selectedSupplier || '협력사 미지정'}
                    </span>
                    {item.supplierEmail && (
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                        {item.supplierEmail}
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                  {item.totalAmount > 0 ? `₩${item.totalAmount.toLocaleString()}` : '금액 확인 중'}
                </td>
                <td>
                  <span style={{ fontWeight: 600 }}>{item.promisedDeliveryDate ?? item.dueDate}</span>
                </td>
                <td>
                  {item.fullReceiptDate ?? item.arrivedDate ?? item.firstReceiptDate ?? '-'}
                  {item.deliveryStatus === 'PARTIAL' && item.firstReceiptDate && (
                    <div style={{ marginTop: '3px', fontSize: '10px', color: 'var(--warning)' }}>
                      부분 입고 시작일
                    </div>
                  )}
                </td>
                <td>
                  {item.paymentStatus === 'PAID' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span className="badge badge-green">
                        <CheckCircle2 size={12} /> 결제 완료
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                        {item.lastPaymentDate ?? item.latestInvoiceName ?? ''}
                      </span>
                    </div>
                  ) : item.paymentStatus === 'PARTIALLY_PAID' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span className="badge badge-yellow">
                        <CircleDollarSign size={12} /> 부분 결제
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                        ₩{(item.paidAmount ?? 0).toLocaleString()} / ₩{(item.invoiceTotal ?? 0).toLocaleString()}
                      </span>
                    </div>
                  ) : item.paymentStatus === 'UNPAID' ? (
                    <span className="badge badge-yellow">
                      <Clock size={12} /> 결제 대기
                    </span>
                  ) : (
                    <span className="badge badge-gray">
                      <FileText size={12} /> 매입송장 대기
                    </span>
                  )}
                </td>
                {/* 현재 단계 - 상태 배지/에러만. 실제로 클릭하는 버튼은 전부
                    바로 다음 '다음 행동' 컬럼으로 옮겼다(예전엔 이 셀 하나에
                    배지+버튼이 전부 쌓여 있었음 - 구매팀 피드백). */}
                <td>
                  <div className="mr-stage-cell">
                    {(() => {
                      const progress = getOverallProgress(item);
                      return (
                        <span className={`badge ${progress.className}`}>
                          {progress.label}
                        </span>
                      );
                    })()}
                    {item.pendingTask?.taskType === 'po_creation_failed' && item.workflowError && (
                      <span
                        className={`mr-workflow-error is-clickable${expandedErrors.has(item.id) ? ' is-expanded' : ''}`}
                        title={item.workflowError}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleErrorExpanded(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleErrorExpanded(item.id);
                          }
                        }}
                      >
                        {item.workflowError}
                      </span>
                    )}
                    {item.poCreated && !item.arrived && (
                      <span className={item.deliveryStatus === 'PARTIAL' ? 'badge badge-yellow' : 'badge badge-gray'}>
                        <Clock size={12} /> {item.deliveryStatus === 'PARTIAL'
                          ? `부분 입고 ${item.receivedQty ?? 0}/${item.orderedQty ?? 0}`
                          : 'Purchase Receipt 입고 대기'}
                      </span>
                    )}
                    {item.scorecardCompleted && (
                      <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={12} /> 평가 완료
                        {item.scorecardScores && ` · 평균 ${getScoreAverage(item.scorecardScores).toFixed(1)}점`}
                        {item.scorecardScores && item.scorecardScores.price == null && ' (가격 제외)'}
                      </span>
                    )}
                  </div>
                </td>
                {/* 다음 행동 - 바이어가 실제로 클릭해서 처리하는 것만 여기
                    있다. 입고 확인/대금결제는 ERPNext(Purchase Receipt,
                    Purchase Invoice, Payment Entry) 웹훅으로 자동 갱신되고
                    이 화면에서 직접 처리하는 버튼이 없으므로(위 배너 문구
                    그대로) 여기에도 나타나지 않는다 - "목업: 입고 웹훅 수신"
                    버튼은 실제 서비스(isApiMode)에서는 아예 렌더링되지 않는
                    데모 전용 버튼이다. */}
                <td>
                  <div className="mr-stage-cell">
                    {item.pendingTask?.taskType === 'po_creation_failed' && onAnswerTask && (
                      <WorkflowInterruptForm task={item.pendingTask} onSubmit={onAnswerTask} />
                    )}
                    {!item.poCreated && item.pendingTask?.taskType === 'order_start' && (
                      <button className="btn-sm btn-primary" onClick={() => onStartOrder(item.id)}>
                        <Send size={14} />
                        <span>발주 시작</span>
                      </button>
                    )}
                    {!item.poCreated && (item.pendingTask?.taskType === 'pr_request' || item.supplierApprovalStatus === 'pending') && (
                      <button className="btn-sm btn-primary" onClick={() => handleRequestPRClick(item)}>
                        <ShoppingCart size={14} />
                        <span>PR 요청</span>
                      </button>
                    )}
                    {/* ⚠️ 위 '현재 단계' 컬럼이 이미 'PR 요청 · 수주접수 대기'
                        배지를 보여주고 있으므로, 여기서는 그 상태에서 취할 수
                        있는 액션(이메일/수주접수 버튼)만 보여준다. */}
                    {!item.poCreated && (item.prStatus === 'SENT' || item.supplierApprovalStatus === 'pr_requested') && !isApiMode && (
                      <button className="btn-sm btn-outline" onClick={() => setEmailModalItem(item)}>
                        <Mail size={12} />
                        <span>이메일/수주접수</span>
                      </button>
                    )}
                    {!item.poCreated && (item.prStatus === 'REJECTED' || item.supplierApprovalStatus === 'rejected') && (
                      <button
                        className="btn-sm btn-reject"
                        onClick={() => { setSelectedRejectReason(item); setShowReselectList(false); }}
                      >
                        <AlertTriangle size={14} />
                        <span>수주 거절 사유</span>
                      </button>
                    )}
                    {!item.poCreated && item.pendingTask?.taskType === 'po_approval' && (
                      <button className="btn-sm btn-primary" onClick={() => setApprovalModalItem(item)}>
                        <ShoppingCart size={14} />
                        <span>PO 발송 최종 승인</span>
                      </button>
                    )}
                    {item.poCreated && !item.arrived && !isApiMode && (
                      <button className="btn-sm btn-outline" onClick={() => onMarkArrived(item.id)}>
                        <PackageCheck size={14} />
                        <span>목업: 입고 웹훅 수신</span>
                      </button>
                    )}
                    {item.poCreated && item.arrived && !item.scorecardCompleted && (
                      <button className="btn-sm btn-primary" onClick={() => openScorecard(item)}>
                        <ClipboardList size={14} />
                        <span>Supplier Scorecard 작성</span>
                      </button>
                    )}
                  </div>
                </td>
                </tr>
              </React.Fragment>
            ))}
            {movePlaceholders
              .filter((placeholder) => placeholder.index >= tabFilteredPOItems.length)
              .map((placeholder) => (
                <StageMovePlaceholderRow
                  key={placeholder.id}
                  placeholder={placeholder}
                  colSpan={10}
                  onNavigate={onNavigateMovePlaceholder}
                  onDismiss={onDismissMovePlaceholder}
                />
              ))}
            {tabFilteredPOItems.length === 0 && movePlaceholders.length === 0 && (
              <tr>
                <td colSpan={10} className="table-empty-state">
                  {activeTab === 'completed' ? '완료된 건이 없습니다.' : '발주 시작 또는 입고 진행 중인 건이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </SmartTableContainer>

      {/* ========================================================================= */}
      {/* 공급사 발송 메일 및 수주접수 미리보기 Modal */}
      {/* ========================================================================= */}
      {emailModalItem && (
        <div className="modal-overlay" onClick={() => setEmailModalItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '720px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Mail size={22} color="var(--primary)" />
                <div>
                  <h3 style={{ margin: 0 }}>공급사 발송 이메일 (PO 예정 내용 확인 및 수주접수)</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    공급사({emailModalItem.selectedSupplier}) 이메일에서 수주접수 클릭 시 BiddingFlow 상태가 수주접수로 변경되고 ERPNext PO가 생성/Submit 됩니다.
                  </span>
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => setEmailModalItem(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 메일 헤더 메타정보 */}
              <div style={{ backgroundColor: 'var(--bg-input)', borderRadius: '8px', padding: '14px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div><strong>수신자 (To):</strong> {emailModalItem.selectedSupplier} 영업담당자 &lt;sales@{emailModalItem.selectedSupplier.replaceAll(' ', '').toLowerCase()}.com&gt;</div>
                <div><strong>발신자 (From):</strong> 구매팀 &lt;procurement@company.com&gt;</div>
                <div><strong>제목 (Subject):</strong> <span style={{ color: 'var(--primary)', fontWeight: 700 }}>[PO 예정 안내] {emailModalItem.itemName} - 발주 예정 내용 확인 및 수주접수 요청</span></div>
              </div>

              {/* 메일 본문 카드 (Email Body Card) */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px', backgroundColor: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: 'var(--text-main)' }}>
                  안녕하세요, <strong>{emailModalItem.selectedSupplier}</strong> 귀중.<br />
                  귀사와 협의 완료된 구매 요청 건에 대한 PO 예정 내역을 전달드립니다.<br />
                  아래 내용을 확인하신 후 <strong>[수주 접수]</strong> 버튼을 클릭하여 수주 확정을 진행해 주시기 바랍니다.
                </p>

                {/* PO 상세 내역 */}
                <div style={{ backgroundColor: 'var(--bg-input)', padding: '14px', borderRadius: '6px', fontSize: '13px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div><strong>MR 번호:</strong> {emailModalItem.mrNo}</div>
                  <div><strong>PR 번호:</strong> {emailModalItem.prNo}</div>
                  <div><strong>CASE ID:</strong> {emailModalItem.caseId || 'CASE-2026-001'}</div>
                  <div><strong>RFQ 번호:</strong> {emailModalItem.rfqName || 'RFQ-2026-0891'}</div>
                  <div><strong>품목명:</strong> {emailModalItem.itemName}</div>
                  <div><strong>아이템코드:</strong> {emailModalItem.itemCode}</div>
                  <div><strong>요청 부서:</strong> {emailModalItem.department}</div>
                  <div><strong>약정 납기일:</strong> <span style={{ color: 'var(--danger)', fontWeight: 700 }}>📅 {emailModalItem.dueDate}</span></div>
                  <div><strong>응답 기한:</strong> {emailModalItem.expiresAt || '발송 후 72시간 내'}</div>
                  <div style={{ gridColumn: 'span 2', marginTop: '4px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)', fontSize: '14px' }}>
                    <strong>최종 발주 공급가액:</strong> <span style={{ color: 'var(--primary)', fontWeight: 700, fontFamily: 'monospace', fontSize: '16px' }}>₩{emailModalItem.totalAmount.toLocaleString()}</span>
                  </div>
                </div>

                {/* 메일 내부 수주접수 액션 영역 */}
                <div style={{ border: '2px dashed var(--primary)', borderRadius: '8px', padding: '16px', backgroundColor: 'var(--primary-soft)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary-hover)' }}>
                    [공급사 수주접수 확정 링크]
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    수주 접수 클릭 시: BiddingFlow 상태가 <strong>'수주 접수'</strong>로 변경 ➔ ERPNext PO 자동 생성 & Submit ➔ 공식 PO 이메일 발송
                  </div>

                  {!showRejectInput ? (
                    <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleSupplierAcceptClick(emailModalItem)}
                        style={{ padding: '10px 24px', fontSize: '14px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--success)', borderColor: 'var(--success)' }}
                      >
                        <CheckCircle2 size={18} />
                        수주 접수 (Order Accept)
                      </button>
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => setShowRejectInput(true)}
                        style={{ padding: '10px 16px', fontSize: '13px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      >
                        <XCircle size={16} />
                        수주 거절 (Reject)
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '480px', marginTop: '6px' }}>
                      <textarea
                        className="form-input"
                        rows={3}
                        placeholder="수주 거절 사유를 2자 이상 입력해 주세요..."
                        value={rejectReasonText}
                        onChange={(e) => setRejectReasonText(e.target.value)}
                        style={{ fontSize: '13px' }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => setShowRejectInput(false)}
                          style={{ fontSize: '12px' }}
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          className="btn-reject"
                          onClick={() => handleSupplierRejectSubmit(emailModalItem)}
                          style={{ fontSize: '12px', padding: '6px 14px' }}
                        >
                          거절 확정 제출
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-outline" onClick={() => setEmailModalItem(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MR/PR 상세 확인 Modal */}
      {selectedMRDetail && (
        <div className="modal-overlay" onClick={() => setSelectedMRDetail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={20} color="var(--primary)" />
                <h3>MR 및 발주 상세 내역 ({selectedMRDetail.mrNo})</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setSelectedMRDetail(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ backgroundColor: 'var(--bg-input)', padding: '14px', borderRadius: '8px' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                  {selectedMRDetail.itemName} ({selectedMRDetail.itemCode})
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  요청부서: {selectedMRDetail.department} | 약정 납기일: {selectedMRDetail.dueDate}
                </div>
              </div>
              {selectedMRDetail.poCreated && (
                <div style={{ backgroundColor: 'var(--bg-input)', padding: '14px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px' }}>ERP 후속 문서</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '6px 12px', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Purchase Receipt</span>
                    <strong>{selectedMRDetail.fullReceiptDate ? `입고 완료 · ${selectedMRDetail.fullReceiptDate}` : '입고 대기'}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>Purchase Invoice</span>
                    <strong>{selectedMRDetail.latestInvoiceName ?? '생성 대기'}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>Payment Entry</span>
                    <strong>{selectedMRDetail.latestPaymentEntry ?? (selectedMRDetail.paymentStatus === 'PAID' ? '결제 완료' : '결제 대기')}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>결제 금액</span>
                    <strong>
                      ₩{(selectedMRDetail.paidAmount ?? 0).toLocaleString()}
                      {selectedMRDetail.invoiceTotal ? ` / ₩${selectedMRDetail.invoiceTotal.toLocaleString()}` : ''}
                    </strong>
                  </div>
                </div>
              )}
              <div style={{ backgroundColor: 'var(--bg-input)', padding: '14px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>선정 공급사 및 발주 금액</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary)' }}>
                  {selectedMRDetail.selectedSupplier} · Total ₩{selectedMRDetail.totalAmount.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-primary" onClick={() => setSelectedMRDetail(null)}>
                확인 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PR / 수주 거절 사유 확인 Modal */}
      {selectedRejectReason && (
        <div className="modal-overlay" onClick={() => { setSelectedRejectReason(null); setShowReselectList(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={20} color="var(--danger)" />
                <h3>공급사 수주 거절 사유 확인 ({selectedRejectReason.mrNo})</h3>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => { setSelectedRejectReason(null); setShowReselectList(false); }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                공급사: <strong style={{ color: 'var(--text-main)' }}>{selectedRejectReason.selectedSupplier}</strong>
              </div>
              <div
                style={{
                  backgroundColor: 'var(--danger-bg)',
                  borderLeft: '2px solid var(--danger)',
                  padding: '14px',
                  borderRadius: '6px',
                  color: 'var(--danger)',
                  fontSize: '13px',
                  lineHeight: '1.5'
                }}
              >
                {selectedRejectReason.prRejectionReason || selectedRejectReason.rejectReason || '사유가 작성되지 않았습니다.'}
              </div>

              {canReselectFromQuotations && remainingQuotationSuppliers.length > 0 && (
                <div style={{ marginTop: '14px' }}>
                  <button
                    type="button"
                    className="btn-outline"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setShowReselectList((prev) => !prev)}
                  >
                    {showReselectList
                      ? '접기'
                      : `기존 견적서에서 재선택 (남은 협력사 ${remainingQuotationSuppliers.length}곳)`}
                  </button>
                  {showReselectList && (
                    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {remainingQuotationSuppliers.map((row) => {
                        const supplierId = row.supplier || '';
                        const wasRejectedBefore = previouslyRejectedSupplierKeys.has(supplierId);
                        return (
                          <div
                            key={supplierId || row.name}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '10px',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              padding: '8px 10px',
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)' }}>
                                {supplierId || '이름 미상'}
                                {wasRejectedBefore && (
                                  <span
                                    className="badge badge-red"
                                    style={{ fontSize: '10px', marginLeft: '6px' }}
                                    title="이 MR에서 예전에 수주를 거절했던 협력사입니다."
                                  >
                                    거절됨
                                  </span>
                                )}
                              </span>
                              {row.reason && (
                                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{row.reason}</span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="btn-sm btn-primary"
                              disabled={!supplierId}
                              onClick={() => {
                                onSelectNextSupplier?.(selectedRejectReason.id, supplierId);
                                setSelectedRejectReason(null);
                                setShowReselectList(false);
                              }}
                            >
                              이 업체로 재선정
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-outline"
                onClick={() => { setSelectedRejectReason(null); setShowReselectList(false); }}
              >
                닫기
              </button>
              <button
                type="button"
                className="btn-outline"
                title="협력사 선택부터 마감일 지정까지 RFQ 전체를 다시 진행합니다."
                onClick={() => {
                  onReturnToVendorSelection(selectedRejectReason.id);
                  setSelectedRejectReason(null);
                  setShowReselectList(false);
                }}
              >
                재비딩
              </button>
              <button
                type="button"
                className="btn-reject"
                onClick={() => {
                  if (!window.confirm(`${selectedRejectReason.mrNo} 건을 취소하시겠습니까?\nERP에서 MR이 취소(Cancel/Discard) 처리되며 되돌릴 수 없습니다.`)) return;
                  onCancelMR(selectedRejectReason.id);
                  setSelectedRejectReason(null);
                  setShowReselectList(false);
                }}
              >
                MR 취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PO 생성 (결재권자 결재) Modal */}
      {approvalModalItem && (
        <div className="modal-overlay" onClick={() => setApprovalModalItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '500px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShoppingCart size={20} color="var(--success)" />
                <h3>PO 생성 및 전자 결재 요청</h3>
              </div>
              <button className="icon-btn" onClick={() => setApprovalModalItem(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                협력사, 금액과 납기를 최종 확인했습니다. 승인하면 법적 효력이 있는 PO를 생성·Submit하고 협력사에 발송합니다.
              </p>
              <div style={{ backgroundColor: 'var(--bg-input)', padding: '12px', borderRadius: '6px', fontSize: '13px' }}>
                <div>발주 품목: <strong>{approvalModalItem.itemName}</strong></div>
                <div>선정 협력사: <strong>{approvalModalItem.selectedSupplier}</strong></div>
                <div>발주 금액: <strong style={{ color: 'var(--success)' }}>₩{approvalModalItem.totalAmount.toLocaleString()}</strong></div>
                {approvalModalItem.purchaseMode === 'direct' && (
                  <div style={{ marginTop: '8px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    카탈로그식 직접구매 · 최근 거래
                    {approvalModalItem.referencePO ? ` ${approvalModalItem.referencePO}` : ''}
                    {approvalModalItem.referenceUnitPrice
                      ? ` · 단가 ₩${approvalModalItem.referenceUnitPrice.toLocaleString()}`
                      : ''}
                    를 기준으로 생성합니다.
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setApprovalModalItem(null)}>
                취소
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  onCreatePO(approvalModalItem.id);
                  setApprovalModalItem(null);
                }}
              >
                최종 승인 및 PO 발송
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Scorecard 평가 Modal */}
      {scorecardItem && (
        <div className="modal-overlay" onClick={closeScorecard}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ClipboardList size={20} color="var(--primary)" />
                <h3>Supplier Scorecard ({scorecardItem.selectedSupplier})</h3>
              </div>
              <button type="button" className="icon-btn" onClick={closeScorecard}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {scorecardItem.poNo || scorecardItem.mrNo} · {scorecardItem.itemName} 건의 납기와 가격은 자동 계산됩니다. 대응력, 커뮤니케이션, 품질을 5점 만점으로 평가해 주세요.
              </p>
              <strong style={{ fontSize: '13px' }}>자동 평가</strong>
              {(['leadTime', 'price'] as const).map((key) => (
                <div key={key} style={{ padding: '12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13px' }}>
                    <strong>{key === 'leadTime' ? '납기 준수' : '가격 경쟁력'}</strong>
                    <strong>{automaticScorecard?.scores[key] != null ? `${automaticScorecard.scores[key]} / 5점` : key === 'price' ? '평가 제외' : '계산 불가'}</strong>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {automaticScorecard?.reasons[key] ?? '자동 평가에 필요한 정보를 확인해주세요.'}
                    {key === 'price' && automaticScorecard?.scores.price == null && ' 가격을 제외한 4개 항목으로 평가를 완료합니다.'}
                  </p>
                </div>
              ))}
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                납기: 2일 이상 조기 5점 · 1일 조기 4점 · 당일 3점 · 1일 지연 2점 · 2일 이상 지연 1점<br />
                가격: 최고 견적 단가 5점 기준 비례 계산 (최소 1점)
              </p>
              <strong style={{ fontSize: '13px', marginTop: '4px' }}>직접 평가</strong>
              {SCORECARD_CRITERIA.map((criterion) => (
                <div key={criterion.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{criterion.label}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3, 4, 5].map((value) => {
                      const isFilled = (draftScores[criterion.key] ?? 0) >= value;
                      return (
                        <button
                          key={value}
                          type="button"
                          className="icon-btn"
                          aria-label={`${criterion.label} ${value}점`}
                          onClick={() => setDraftScores((previous) => ({ ...previous, [criterion.key]: value }))}
                          style={{ padding: '2px' }}
                        >
                          <Star
                            size={20}
                            color={isFilled ? 'var(--warning)' : 'var(--text-dim)'}
                            fill={isFilled ? 'var(--warning)' : 'none'}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-outline" onClick={closeScorecard}>
                취소
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!isDraftComplete}
                onClick={() => {
                  if (!isDraftComplete) return;
                  onSubmitScorecard(scorecardItem.id, { ...draftScores, ...automaticScorecard?.scores, price: automaticScorecard?.scores.price } as POScorecardScores);
                  closeScorecard();
                }}
              >
                평가 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
