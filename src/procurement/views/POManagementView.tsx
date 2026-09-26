import React, { useMemo, useState } from 'react';
import type { POItem, POScorecardScores, SupplierScores, StageMovePlaceholder } from '../types';
import { SmartTableContainer } from '../components/SmartTableContainer';
import { StageMovePlaceholderRow } from '../components/StageMovePlaceholderRow';
import { SelectionRationale } from '../components/SelectionRationale';
import { WorkflowInterruptForm } from '../components/WorkflowInterruptForm';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Clock,
  FileText,
  Filter,
  Mail,
  PackageCheck,
  Plus,
  Send,
  ShoppingCart,
  Star,
  X,
  XCircle,
} from 'lucide-react';
import './POManagementView.css';

type POStageKey = 'reply' | 'rejected' | 'po' | 'receipt-wait' | 'received';
type POListTab = 'in-progress' | 'completed';

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

const PO_STAGES: Array<{ key: POStageKey; label: string }> = [
  { key: 'reply', label: '회신 대기' },
  { key: 'rejected', label: '거절' },
  { key: 'po', label: 'PO 생성' },
  { key: 'receipt-wait', label: '입고 대기' },
  { key: 'received', label: '입고 완료' },
];
const PO_PROGRESS_STEPS = ['선정', 'PO', '입고', '평가'];
const getPOStage = (item: POItem): POStageKey => {
  if (item.prStatus === 'REJECTED' || item.supplierApprovalStatus === 'rejected') return 'rejected';
  if (item.pendingTask?.taskType === 'po_creation_failed') return 'po';
  if (!item.poCreated && (
    item.prStatus === 'SENT'
    || item.supplierApprovalStatus === 'pr_requested'
    || item.pendingTask?.taskType === 'pr_request'
    || item.supplierApprovalStatus === 'pending'
  )) return 'reply';
  if (item.poCreated && (item.arrived || item.deliveryStatus === 'FULL' || item.scorecardCompleted)) return 'received';
  if (item.poCreated) return 'receipt-wait';
  if (item.pendingTask?.taskType === 'order_start' || item.pendingTask?.taskType === 'po_approval'
    || item.prStatus === 'ACCEPTED' || item.prStatus === 'PO_FAILED'
    || item.supplierApprovalStatus === 'accepted' || item.supplierApprovalStatus === 'approved'
    || item.approvalStatus === 'pending') return 'po';
  return 'reply';
};
const stageLabel = (stage: POStageKey) => ({ reply: '회신 대기', rejected: '거절', po: 'PO 생성', 'receipt-wait': '입고 대기', received: '입고 완료' })[stage];
const stageClass = (stage: POStageKey) => ({ reply: 'po-state-reply', rejected: 'po-state-rejected', po: 'po-state-po', 'receipt-wait': 'po-state-receipt', received: 'po-state-received' })[stage];
const formatShortDate = (value?: string) => {
  if (!value) return '—';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}/${match[3]}` : value;
};

const isPoComplete = (item: POItem): boolean => !!item.poCreated && !!item.arrived && !!item.scorecardCompleted;
const isPOCompleted = isPoComplete;

const paymentLabel = (item: POItem): string => ({
  PAID: '결제 완료',
  PARTIALLY_PAID: '부분 결제',
  UNPAID: '결제 대기',
  NOT_INVOICED: '매입송장 대기',
}[item.paymentStatus ?? 'NOT_INVOICED']);

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
  const [showReselectList, setShowReselectList] = useState(false);
  const [emailModalItem, setEmailModalItem] = useState<POItem | null>(null);
  const [approvalModalItem, setApprovalModalItem] = useState<POItem | null>(null);
  const [scorecardItem, setScorecardItem] = useState<POItem | null>(null);
  const [draftScores, setDraftScores] = useState<Partial<SupplierScores>>({});
  const [showRejectInput, setShowRejectInput] = useState<boolean>(false);
  const [rejectReasonText, setRejectReasonText] = useState<string>('');
  const [activeTab, setActiveTab] = useState<POListTab>('in-progress');
  const [activeStage, setActiveStage] = useState<POStageKey | 'all'>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [dueDateFrom, setDueDateFrom] = useState('');
  const [dueDateTo, setDueDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState<'latest' | 'due-date' | 'amount'>('latest');
  const [showCreatePOChooser, setShowCreatePOChooser] = useState(false);

  const tabItems = useMemo(() => poItems.filter((item) => (
    activeTab === 'completed' ? isPoComplete(item) : !isPoComplete(item)
  )), [activeTab, poItems]);
  const stageCounts = useMemo(() => Object.fromEntries(PO_STAGES.map(({ key }) => [
    key,
    tabItems.filter((item) => getPOStage(item) === key).length,
  ])) as Record<POStageKey, number>, [tabItems]);
  const visiblePOItems = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase('ko-KR');
    const minimum = minAmount === '' ? undefined : Number(minAmount);
    const maximum = maxAmount === '' ? undefined : Number(maxAmount);
    return tabItems
      .filter((item) => activeStage === 'all' || getPOStage(item) === activeStage)
      .filter((item) => !query || [item.mrNo, item.poNo, item.prNo, item.itemName, item.itemCode, item.selectedSupplier, item.department, paymentLabel(item)].some((value) => value?.toLocaleLowerCase('ko-KR').includes(query)))
      .filter((item) => minimum === undefined || item.totalAmount >= minimum)
      .filter((item) => maximum === undefined || item.totalAmount <= maximum)
      .filter((item) => !dueDateFrom || (item.promisedDeliveryDate ?? item.dueDate) >= dueDateFrom)
      .filter((item) => !dueDateTo || (item.promisedDeliveryDate ?? item.dueDate) <= dueDateTo)
      .sort((left, right) => sortOrder === 'amount'
        ? right.totalAmount - left.totalAmount
        : sortOrder === 'due-date'
          ? (left.promisedDeliveryDate ?? left.dueDate).localeCompare(right.promisedDeliveryDate ?? right.dueDate)
          : right.mrNo.localeCompare(left.mrNo, 'ko-KR', { numeric: true }));
  }, [activeStage, dueDateFrom, dueDateTo, maxAmount, minAmount, searchText, sortOrder, tabItems]);
  const poCreationCandidates = poItems.filter((item) => !item.poCreated && (
    item.pendingTask?.taskType === 'po_approval'
    || (!isApiMode && item.supplierApprovalStatus === 'approved')
  ));
  const progressCount = poItems.filter((item) => !isPoComplete(item)).length;
  const completedCount = poItems.filter(isPoComplete).length;

  const openScorecard = (item: POItem) => {
    setScorecardItem(item);
    setDraftScores({ ...item.scorecardScores, ...item.automaticScorecard?.scores });
  };
  const closeScorecard = () => { setScorecardItem(null); setDraftScores({}); };
  const handleRequestPRClick = (item: POItem) => {
    onRequestPR(item.id);
    if (!isApiMode) setEmailModalItem(item);
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
  const isDraftComplete = SCORECARD_CRITERIA.every((criterion) => draftScores[criterion.key]) && automaticScorecard?.scores.leadTime != null;
  const canReselectFromQuotations = selectedRejectReason?.pendingTask?.taskType === 'pr_rejection_review';
  const remainingQuotationSuppliers = useMemo<Array<{ name?: string; supplier?: string; reason?: string }>>(() => {
    if (!canReselectFromQuotations) return [];
    const raw = (selectedRejectReason?.pendingTask?.payload as Record<string, unknown> | undefined)?.remaining_suppliers;
    return Array.isArray(raw) ? raw as Array<{ name?: string; supplier?: string; reason?: string }> : [];
  }, [canReselectFromQuotations, selectedRejectReason]);
  const previouslyRejectedSupplierKeys = useMemo<Set<string>>(() => {
    const raw = (selectedRejectReason?.pendingTask?.payload as Record<string, unknown> | undefined)?.rejected_suppliers;
    const keys = new Set<string>();
    if (Array.isArray(raw)) (raw as Array<{ supplier?: string }>).forEach((entry) => { if (entry?.supplier) keys.add(entry.supplier); });
    return keys;
  }, [selectedRejectReason]);

  return (
    <div className="po-management-view">
      <header className="po-management-heading">
        <div><h2>PO 관리</h2><p>구매 요청(MR)부터 PO 발행, 입고까지 진행 현황을 확인할 수 있습니다.</p></div>
        <button type="button" className="po-create-button" disabled={poCreationCandidates.length === 0} onClick={() => setShowCreatePOChooser(true)}>
          <Plus size={17} /> PO 생성
        </button>
      </header>
      <div className="po-list-tabs" role="tablist" aria-label="PO 처리 구분">
        <button type="button" role="tab" aria-selected={activeTab === 'in-progress'} className={activeTab === 'in-progress' ? 'is-active' : ''} onClick={() => { setActiveTab('in-progress'); setActiveStage('all'); }}>
          진행중 <span>{progressCount}</span>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'completed'} className={activeTab === 'completed' ? 'is-active' : ''} onClick={() => { setActiveTab('completed'); setActiveStage('all'); }}>
          완료 <span>{completedCount}</span>
        </button>
      </div>

      {/* PO Management Table */}
      <div className="po-list-toolbar">
        <div className="po-stage-filters" aria-label="진행 상태 필터">
          <button type="button" className={`po-stage-filter ${activeStage === 'all' ? 'is-active' : ''}`} aria-pressed={activeStage === 'all'} onClick={() => setActiveStage('all')}>전체 <span>{tabItems.length}</span></button>
          {PO_STAGES.map(({ key, label }) => <button type="button" key={key} className={`po-stage-filter ${activeStage === key ? 'is-active' : ''}`} aria-pressed={activeStage === key} onClick={() => setActiveStage(key)}><span className={`po-stage-dot ${stageClass(key)}`} />{label} <span>{stageCounts[key]}</span></button>)}
        </div>
        <div className="po-toolbar-actions">
          <label className="po-sort-select"><span className="sr-only">PO 정렬</span><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}><option value="latest">요청 최신순</option><option value="due-date">납기 임박순</option><option value="amount">발주 금액순</option></select><ChevronDown size={15} aria-hidden="true" /></label>
          <button type="button" className={`po-filter-button ${searchOpen ? 'is-active' : ''}`} aria-label="PO 검색 필터" aria-expanded={searchOpen} onClick={() => { setSearchOpen((open) => !open); if (searchOpen) setSearchText(''); }}><Filter size={17} /></button>
        </div>
      </div>
      {searchOpen && (
        <div className="po-search-panel">
          <label className="po-search-field"><span className="sr-only">MR, 품목, 협력사 검색</span><input autoFocus value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="MR, PO, 품목, 협력사, 결제 상태 검색" /></label>
          <div className="po-range-filters">
            <label className="po-range-field">발주 금액 <span><input type="number" min="0" value={minAmount} onChange={(event) => setMinAmount(event.target.value)} placeholder="최소" aria-label="최소 발주 금액" /><input type="number" min="0" value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} placeholder="최대" aria-label="최대 발주 금액" /></span></label>
            <label className="po-range-field">납기일 <span><input type="date" value={dueDateFrom} onChange={(event) => setDueDateFrom(event.target.value)} aria-label="납기 시작일" /><input type="date" value={dueDateTo} onChange={(event) => setDueDateTo(event.target.value)} aria-label="납기 종료일" /></span></label>
            <button type="button" className="po-filter-reset" onClick={() => { setSearchText(''); setMinAmount(''); setMaxAmount(''); setDueDateFrom(''); setDueDateTo(''); setActiveStage('all'); }}>초기화</button>
          </div>
        </div>
      )}
      <SmartTableContainer>
        <table className="custom-table po-management-table">
          <thead><tr><th>구매 건</th><th>상태 / 진행</th><th>PO</th><th>납기일정</th></tr></thead>
          <tbody>
            {visiblePOItems.map((item, rowIndex) => {
              const stage = getPOStage(item);
              const stageIndex = stage === 'reply' || stage === 'rejected' ? 0 : stage === 'po' ? 1 : stage === 'receipt-wait' ? 2 : 3;
              const dueDate = item.promisedDeliveryDate ?? item.dueDate;
              return (
                <React.Fragment key={item.id}>
                  {movePlaceholders.filter((placeholder) => placeholder.index === rowIndex).map((placeholder) => <StageMovePlaceholderRow key={placeholder.id} placeholder={placeholder} colSpan={4} onNavigate={onNavigateMovePlaceholder} onDismiss={onDismissMovePlaceholder} />)}
                  <tr className={`workflow-transition-${item.transitionPhase ?? 'stable'}`}>
                    <td>
                      <div className="po-purchase-cell">
                        <button type="button" className="po-mr-link" onClick={() => setSelectedMRDetail(item)} title="MR 기본 정보와 선정 협력사 확인">{item.mrNo}</button>
                        <span className="po-item-summary">{item.itemName}{item.itemCode ? ` · ${item.itemCode}` : ''}</span>
                      </div>
                    </td>
                    <td>
                      <div className="po-workflow-cell">
                        <div className="po-state-line">
                          <span className={`po-state-badge ${stageClass(stage)}`}><span className="po-stage-dot" />{stageLabel(stage)}</span>
                          {stage === 'receipt-wait' && item.deliveryStatus === 'PARTIAL' && <span className="po-inline-note">부분 입고 {item.receivedQty ?? 0}/{item.orderedQty ?? 0}</span>}
                        </div>
                        {item.pendingTask?.taskType === 'po_creation_failed' && item.workflowError && (
                          <button type="button" className={`mr-workflow-error is-clickable${expandedErrors.has(item.id) ? ' is-expanded' : ''}`} title={item.workflowError} onClick={() => toggleErrorExpanded(item.id)}>
                            {item.workflowError}
                          </button>
                        )}
                        <div className={`po-progress-track stage-${stage} ${stage === 'rejected' ? 'has-rejection' : ''}`} aria-label={`진행 단계: ${stageLabel(stage)}`}>
                          {PO_PROGRESS_STEPS.map((label, index) => (
                            <div key={label} className={`po-progress-step ${index < stageIndex || isPOCompleted(item) ? 'is-complete' : ''} ${index === stageIndex && !isPOCompleted(item) ? 'is-current' : ''} ${stage === 'rejected' && index === 0 ? 'is-rejected' : ''}`}>
                              <span className="po-progress-node" /><span className="po-progress-label">{label}</span>
                            </div>
                          ))}
                        </div>
                        <div className="po-row-actions">
                          {item.pendingTask?.taskType === 'po_creation_failed' && onAnswerTask && <WorkflowInterruptForm task={item.pendingTask} onSubmit={onAnswerTask} />}
                          {!item.poCreated && item.pendingTask?.taskType === 'order_start' && <button className="btn-sm btn-primary" onClick={() => onStartOrder(item.id)}><Send size={13} />발주 시작</button>}
                          {!item.poCreated && (item.pendingTask?.taskType === 'pr_request' || item.supplierApprovalStatus === 'pending') && <button className="btn-sm btn-primary" onClick={() => handleRequestPRClick(item)}><ShoppingCart size={13} />PR 요청</button>}
                          {!item.poCreated && (item.prStatus === 'SENT' || item.supplierApprovalStatus === 'pr_requested') && !isApiMode && <button className="btn-sm btn-outline" onClick={() => setEmailModalItem(item)}><Mail size={12} />이메일/수주접수</button>}
                          {!item.poCreated && (item.prStatus === 'REJECTED' || item.supplierApprovalStatus === 'rejected') && <button className="btn-sm btn-reject" onClick={() => { setSelectedRejectReason(item); setShowReselectList(false); }}><AlertTriangle size={13} />사유 보기</button>}
                          {!item.poCreated && item.prStatus === 'PO_FAILED' && <button className="btn-sm btn-reject" onClick={() => setSelectedRejectReason(item)}><AlertTriangle size={13} />PO 오류 확인</button>}
                          {!item.poCreated && item.pendingTask?.taskType === 'po_approval' && <button className="btn-sm btn-primary" onClick={() => setApprovalModalItem(item)}><ShoppingCart size={13} />PO 발송 최종 승인</button>}
                          {item.poCreated && !item.arrived && !isApiMode && <button className="btn-sm btn-outline" onClick={() => onMarkArrived(item.id)}><PackageCheck size={13} />목업 입고 확인</button>}
                          {item.poCreated && item.arrived && !item.scorecardCompleted && <button className="btn-sm btn-primary" onClick={() => openScorecard(item)}><ClipboardList size={13} />평가하기</button>}
                          {item.scorecardCompleted && <span className="po-score-summary"><CheckCircle2 size={13} />평가 완료{item.scorecardScores && ` · 평균 ${getScoreAverage(item.scorecardScores).toFixed(1)}점`}{item.scorecardScores?.price == null && ' (가격 제외)'}</span>}
                          {!item.poCreated && stage === 'reply' && !item.pendingTask?.taskType && item.prStatus !== 'SENT' && <span className="po-inline-note">PR 회신 대기</span>}
                          {!item.poCreated && stage === 'po' && item.prStatus === 'ACCEPTED' && <span className="po-inline-note">수주 접수 · PO 생성 처리 중</span>}
                        </div>
                      </div>
                    </td>
                    <td><span className={item.poNo ? 'po-number' : 'po-number is-empty'}>{item.poNo ?? '—'}</span>{item.createdDate && <span className="po-created-date">{formatShortDate(item.createdDate)}</span>}</td>
                    <td>
                      <div className="po-date-cell">
                        <span className={item.isUrgent ? 'po-date-urgent' : ''}>{formatShortDate(dueDate)}</span>
                        {item.isUrgent && <span className="po-urgent-badge">긴급</span>}
                        {(item.fullReceiptDate ?? item.arrivedDate) && <span className="po-receipt-date">입고 {formatShortDate(item.fullReceiptDate ?? item.arrivedDate)}</span>}
                        {item.deliveryStatus === 'PARTIAL' && item.firstReceiptDate && <span className="po-receipt-date">부분 입고 {formatShortDate(item.firstReceiptDate)}</span>}
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
            {movePlaceholders
              .filter((placeholder) => placeholder.index >= visiblePOItems.length)
              .map((placeholder) => (
                <StageMovePlaceholderRow
                  key={placeholder.id}
                  placeholder={placeholder}
                  colSpan={4}
                  onNavigate={onNavigateMovePlaceholder}
                  onDismiss={onDismissMovePlaceholder}
                />
              ))}
            {visiblePOItems.length === 0 && movePlaceholders.length === 0 && (
              <tr>
                <td colSpan={4} className="table-empty-state">
                  {activeTab === 'completed' ? '완료된 건이 없습니다.' : '발주 시작 또는 입고 진행 중인 건이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </SmartTableContainer>

      {showCreatePOChooser && <div className="modal-overlay" onClick={() => setShowCreatePOChooser(false)}><div className="modal-content" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><ShoppingCart size={20} /><h3>PO 생성 대상</h3></div><button type="button" className="icon-btn" onClick={() => setShowCreatePOChooser(false)}><X size={18} /></button></div><div className="modal-body">{poCreationCandidates.map((item) => <button type="button" className="po-create-candidate" key={item.id} onClick={() => { setApprovalModalItem(item); setShowCreatePOChooser(false); }}><span><strong>{item.mrNo}</strong><small>{item.itemName} · {item.selectedSupplier}</small></span><ChevronDown size={16} /></button>)}</div><div className="modal-footer"><button type="button" className="btn-outline" onClick={() => setShowCreatePOChooser(false)}>닫기</button></div></div></div>}

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
                  {selectedMRDetail.orderedQty != null
                    && ` | 수량: ${selectedMRDetail.receivedQty ?? 0}/${selectedMRDetail.orderedQty}`}
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
                  <div className={`po-detail-payment ${selectedMRDetail.paymentStatus === 'PAID' ? 'is-paid' : selectedMRDetail.paymentStatus === 'PARTIALLY_PAID' ? 'is-partial' : ''}`}>
                    {selectedMRDetail.paymentStatus === 'PAID'
                      ? <CheckCircle2 size={14} />
                      : selectedMRDetail.paymentStatus === 'PARTIALLY_PAID'
                        ? <CircleDollarSign size={14} />
                        : <Clock size={14} />}
                    <span>{paymentLabel(selectedMRDetail)}</span>
                    {selectedMRDetail.paymentStatus === 'PARTIALLY_PAID' && (
                      <strong>₩{(selectedMRDetail.paidAmount ?? 0).toLocaleString()} / ₩{(selectedMRDetail.invoiceTotal ?? 0).toLocaleString()}</strong>
                    )}
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
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 'min(680px, calc(100vw - 32px))' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShoppingCart size={20} color="var(--success)" />
                <h3>PO 발송 전 마지막 확인</h3>
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
              <SelectionRationale
                task={approvalModalItem.pendingTask}
                selectedSupplier={approvalModalItem.selectedSupplier}
              />
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
