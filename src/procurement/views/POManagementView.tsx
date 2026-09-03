import React, { useMemo, useState } from 'react';
import type { POItem, SupplierScores, StageMovePlaceholder } from '../types';
import { SmartTableContainer } from '../components/SmartTableContainer';
import { StageMovePlaceholderRow } from '../components/StageMovePlaceholderRow';
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
  ShoppingCart,
  CheckCircle2,
  Clock,
  FileText,
  X,
  AlertTriangle,
  PackageCheck,
  ClipboardList,
  Star,
  CircleDollarSign
} from 'lucide-react';

type POColumnKey = 'poNo' | 'mrNo' | 'item' | 'amount' | 'promisedDate' | 'receivedDate' | 'payment' | 'status';

const PO_COLUMNS: readonly TableColumnDefinition<POColumnKey>[] = [
  { key: 'poNo', label: 'PO 번호', defaultWidth: 175, minWidth: 130 },
  { key: 'mrNo', label: 'MR 번호', defaultWidth: 175, minWidth: 135 },
  { key: 'item', label: '품목명 및 아이템코드', defaultWidth: 250, minWidth: 180 },
  { key: 'amount', label: '발주금액', defaultWidth: 145, minWidth: 110, align: 'right', filterMode: 'number-range' },
  { key: 'promisedDate', label: '약정 납기일', defaultWidth: 145, minWidth: 115, filterMode: 'date-range' },
  { key: 'receivedDate', label: '실제 수령일', defaultWidth: 145, minWidth: 115, filterMode: 'date-range' },
  { key: 'payment', label: '대금결제', defaultWidth: 165, minWidth: 130 },
  { key: 'status', label: '진행상태', defaultWidth: 265, minWidth: 190 },
] as const;

type PORangeFilters = Partial<Record<POColumnKey, TableColumnRangeFilter>>;

interface POManagementViewProps {
  poItems: POItem[];
  movePlaceholders?: StageMovePlaceholder[];
  onDismissMovePlaceholder?: (id: string) => void;
  onNavigateMovePlaceholder?: (placeholder: StageMovePlaceholder) => void;
  onCreatePO: (poId: string) => void;
  onReturnToMR: (poId: string) => void;
  onMarkArrived: (poId: string) => void;
  onSubmitScorecard: (poId: string, scores: SupplierScores) => void;
  isApiMode?: boolean;
}

const SCORECARD_CRITERIA: { key: keyof SupplierScores; label: string }[] = [
  { key: 'quality', label: '품질' },
  { key: 'leadTime', label: '납기 준수' },
  { key: 'price', label: '가격 경쟁력' },
  { key: 'service', label: '대응력' },
  { key: 'communication', label: '커뮤니케이션' },
];

const getScoreAverage = (scores: SupplierScores) => (
  (scores.quality + scores.leadTime + scores.price + scores.service + scores.communication) / 5
);

const getOverallProgress = (item: POItem) => {
  if (!item.poCreated) return { label: 'PO 최종 승인 대기', className: 'badge-yellow' };
  if (item.deliveryStatus === 'PARTIAL') return { label: '부분 입고 진행 중', className: 'badge-yellow' };
  if (!item.arrived) return { label: '입고 대기', className: 'badge-gray' };
  if (item.paymentStatus === 'PARTIALLY_PAID') return { label: '부분 결제 진행 중', className: 'badge-yellow' };
  if (item.paymentStatus !== 'PAID') return { label: '물품 도착', className: 'badge-green' };
  if (!item.scorecardCompleted) return { label: '협력사 평가 대기', className: 'badge-yellow' };
  return { label: '구매 업무 완료', className: 'badge-green' };
};

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
    case 'amount': return item.totalAmount;
    case 'promisedDate': return item.promisedDeliveryDate ?? item.dueDate;
    case 'receivedDate': return item.fullReceiptDate ?? item.arrivedDate ?? item.firstReceiptDate ?? '-';
    case 'payment': return paymentLabel(item);
    case 'status': return getOverallProgress(item).label;
  }
};

export const POManagementView: React.FC<POManagementViewProps> = ({
  poItems,
  movePlaceholders = [],
  onDismissMovePlaceholder = () => undefined,
  onNavigateMovePlaceholder = () => undefined,
  onCreatePO,
  onReturnToMR,
  onMarkArrived,
  onSubmitScorecard,
  isApiMode = false,
}) => {
  const [selectedMRDetail, setSelectedMRDetail] = useState<POItem | null>(null);
  const [selectedRejectReason, setSelectedRejectReason] = useState<POItem | null>(null);
  const [approvalModalItem, setApprovalModalItem] = useState<POItem | null>(null);
  const [scorecardItem, setScorecardItem] = useState<POItem | null>(null);
  const [draftScores, setDraftScores] = useState<Partial<SupplierScores>>({});
  const tableState = useSessionTableState('po-management', PO_COLUMNS);
  const [rangeFilters, setRangeFilters] = useSessionStoredState<PORangeFilters>(
    'biddingflow.table.po-management.ranges',
    {},
  );
  const [sortColumn, setSortColumn] = useState<POColumnKey>('mrNo');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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

  const openScorecard = (item: POItem) => {
    setScorecardItem(item);
    setDraftScores(item.scorecardScores ?? {});
  };

  const closeScorecard = () => {
    setScorecardItem(null);
    setDraftScores({});
  };

  const isDraftComplete = SCORECARD_CRITERIA.every((criterion) => draftScores[criterion.key]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        style={{
          backgroundColor: 'var(--success-bg)',
          border: '1px solid rgba(36, 138, 61, 0.14)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 18px',
          fontSize: '13px',
          color: 'var(--success)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}
      >
        <PackageCheck size={18} color="var(--success)" />
        <span>
          PO 발송 전 최종 승인부터 입고·대금결제·협력사 평가까지 관리합니다. ERPNext의 <strong>Purchase Receipt, Purchase Invoice, Payment Entry</strong>를 기준으로 진행상태를 자동 갱신합니다.
        </span>
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
            {visiblePOItems.map((item, rowIndex) => (
              <React.Fragment key={item.id}>
                {movePlaceholders
                  .filter((placeholder) => placeholder.index === rowIndex)
                  .map((placeholder) => (
                    <StageMovePlaceholderRow
                      key={placeholder.id}
                      placeholder={placeholder}
                      colSpan={8}
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
                {/* 최종 승인 -> PO -> 입고 -> 결제 -> Scorecard */}
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
                    {!item.poCreated && (item.approvalStatus ?? 'pending') === 'pending' && (
                      <button className="btn-sm btn-primary" onClick={() => setApprovalModalItem(item)}>
                        <ShoppingCart size={14} />
                        <span>PO 발송 최종 승인</span>
                      </button>
                    )}
                    {item.poCreated && !item.arrived && (
                      <>
                        <span className={item.deliveryStatus === 'PARTIAL' ? 'badge badge-yellow' : 'badge badge-gray'}>
                          <Clock size={12} /> {item.deliveryStatus === 'PARTIAL'
                            ? `부분 입고 ${item.receivedQty ?? 0}/${item.orderedQty ?? 0}`
                            : 'Purchase Receipt 입고 대기'}
                        </span>
                        {!isApiMode && (
                          <button className="btn-sm btn-outline" onClick={() => onMarkArrived(item.id)}>
                            <PackageCheck size={14} />
                            <span>목업: 입고 웹훅 수신</span>
                          </button>
                        )}
                      </>
                    )}
                    {item.poCreated && item.arrived && !item.scorecardCompleted && (
                      <>
                        <button className="btn-sm btn-primary" onClick={() => openScorecard(item)}>
                          <ClipboardList size={14} />
                          <span>Supplier Scorecard 작성</span>
                        </button>
                      </>
                    )}
                    {item.scorecardCompleted && (
                      <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={12} /> 평가 완료
                        {item.scorecardScores && ` · 평균 ${getScoreAverage(item.scorecardScores).toFixed(1)}점`}
                      </span>
                    )}
                  </div>
                </td>
                </tr>
              </React.Fragment>
            ))}
            {movePlaceholders
              .filter((placeholder) => placeholder.index >= visiblePOItems.length)
              .map((placeholder) => (
                <StageMovePlaceholderRow
                  key={placeholder.id}
                  placeholder={placeholder}
                  colSpan={8}
                  onNavigate={onNavigateMovePlaceholder}
                  onDismiss={onDismissMovePlaceholder}
                />
              ))}
            {visiblePOItems.length === 0 && movePlaceholders.length === 0 && (
              <tr>
                <td colSpan={8} className="table-empty-state">
                  발주 시작 또는 입고 진행 중인 건이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </SmartTableContainer>

      {/* MR/PR 상세 확인 Modal */}
      {selectedMRDetail && (
        <div className="modal-overlay" onClick={() => setSelectedMRDetail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={20} color="var(--primary)" />
                <h3>MR 및 발주 상세 내역 ({selectedMRDetail.mrNo})</h3>
              </div>
              <button className="icon-btn" onClick={() => setSelectedMRDetail(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ backgroundColor: 'var(--bg-input)', padding: '14px', borderRadius: '8px' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                  {selectedMRDetail.itemName} ({selectedMRDetail.itemCode})
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  요청부서: {selectedMRDetail.department} | 희망 납기일: {selectedMRDetail.dueDate}
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
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--success)' }}>
                  {selectedMRDetail.selectedSupplier} · Total ₩{selectedMRDetail.totalAmount.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setSelectedMRDetail(null)}>
                확인 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PR 거절 사유 확인 Modal */}
      {selectedRejectReason && (
        <div className="modal-overlay" onClick={() => setSelectedRejectReason(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={20} color="var(--danger)" />
                <h3>협력사 PR 거절 사유 확인 ({selectedRejectReason.mrNo})</h3>
              </div>
              <button className="icon-btn" onClick={() => setSelectedRejectReason(null)}>
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
                {selectedRejectReason.rejectReason || '사유가 작성되지 않았습니다.'}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setSelectedRejectReason(null)}>
                닫기
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  onReturnToMR(selectedRejectReason.id);
                  setSelectedRejectReason(null);
                }}
              >
                MR 재검토로 보내기
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
              <button className="icon-btn" onClick={closeScorecard}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {scorecardItem.poNo} · {scorecardItem.mrNo} · {scorecardItem.itemName} 건에 대해 아래 5개 항목을 5점 만점으로 평가해 주세요.
              </p>
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
              <button className="btn-outline" onClick={closeScorecard}>
                취소
              </button>
              <button
                className="btn-primary"
                disabled={!isDraftComplete}
                onClick={() => {
                  if (!isDraftComplete) return;
                  onSubmitScorecard(scorecardItem.id, draftScores as SupplierScores);
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
