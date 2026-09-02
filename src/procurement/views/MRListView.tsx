import React, { useEffect, useMemo, useState } from 'react';
import type { MaterialRequest, MRReviewHistoryEntry } from '../types';
import { MRReasonHistoryModal } from '../components/MRReasonHistoryModal';
import { WorkflowInterruptForm } from '../components/WorkflowInterruptForm';
import {
  Paperclip,
  Eye,
  Search,
  Filter,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
} from 'lucide-react';

interface MRListViewProps {
  requests: MaterialRequest[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onOpenSpecModalByItemCode: (itemCode: string, requestSpecification?: string) => void;
  onApprove: (id: string) => void;
  onOpenRejectModal: (id: string, mrNo: string) => void;
  onOpenAttachmentsModal: (files: string[]) => void;
  onStartSubstituteCheck: (id: string) => void;
  onSubstituteSelectedInErp: (id: string) => void;
  onConfirmSubstituteUnused: (id: string) => void;
  isApiMode?: boolean;
  isLoading?: boolean;
  loadError?: string | null;
  onRefresh?: () => void;
  onAnswerTask?: (taskId: string, answer: Record<string, unknown>, version?: number) => Promise<void>;
}

const PAGE_SIZE = 25;

type MRSortKey =
  | 'department' | 'requester' | 'mrNo' | 'itemCode' | 'category'
  | 'itemName' | 'specSummary' | 'attachmentCount' | 'unitPrice'
  | 'totalPrice' | 'dueDate' | 'revisionRound' | 'workflowStatus';

const workflowStageLabel = (stage?: string): string => ({
  MR_REVIEW: 'MR 시작 준비',
  ITEM_CHECK: '품목·대체품 확인',
  BIDDING_DECISION: '구매 방식 판단',
  SUPPLIER_RECOMMENDATION: '협력사 탐색',
  RFQ_TARGET_SELECTION: 'RFQ 대상 구성',
  RFQ_SENDING: 'RFQ 생성·발송',
  QUOTATION_COLLECTION: '견적 회신 확인',
  SUPPLIER_SELECTION: '견적 비교·순위 산정',
  ORDER_START: '발주 전환 준비',
  PRE_PO_APPROVAL: 'PO 최종 승인 준비',
  PO_CREATION: 'PO 생성·발송',
}[stage ?? ''] ?? '구매 흐름 확인');

const sortableValue = (request: MaterialRequest, key: MRSortKey): string | number => {
  switch (key) {
    case 'attachmentCount': return request.attachmentCount;
    case 'unitPrice': return request.unitPrice;
    case 'totalPrice': return request.totalPrice;
    case 'revisionRound': return request.revisionRound ?? 0;
    case 'workflowStatus': return `${request.workflowStatus ?? ''} ${request.workflowStage ?? ''}`;
    default: return request[key];
  }
};

interface SortableHeaderProps {
  sortKey: MRSortKey;
  label: string;
  activeKey: MRSortKey;
  direction: 'asc' | 'desc';
  onSort: (key: MRSortKey) => void;
  align?: 'left' | 'center' | 'right';
}

const SortableHeader: React.FC<SortableHeaderProps> = ({
  sortKey,
  label,
  activeKey,
  direction,
  onSort,
  align = 'left',
}) => {
  const active = activeKey === sortKey;
  return (
    <th style={{ textAlign: align }} aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`mr-sort-button align-${align}`} onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        {active
          ? direction === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
          : <ChevronsUpDown size={13} />}
      </button>
    </th>
  );
};

const getReviewHistory = (request: MaterialRequest): MRReviewHistoryEntry[] => {
  if (request.reviewHistory?.length) return request.reviewHistory;

  const latestRound = Math.max(request.revisionRound ?? 1, 1);
  const history: MRReviewHistoryEntry[] = [];

  if (request.rejectReason) {
    history.push({
      id: `${request.id}-legacy-buyer-rejection`,
      round: request.returnReason ? Math.max(1, latestRound - 1) : latestRound,
      type: 'buyer_rejection',
      reason: request.rejectReason,
      source: '구매 담당자',
      occurredAt: '기록 시각 없음',
    });
  }

  if (request.returnReason) {
    history.push({
      id: `${request.id}-legacy-supplier-return`,
      round: latestRound,
      type: 'supplier_return',
      reason: request.returnReason,
      source: '협력사',
      occurredAt: '기록 시각 없음',
    });
  }

  return history;
};

const hasSupplierReturnHistory = (request: MaterialRequest) =>
  getReviewHistory(request).some((entry) => entry.type === 'supplier_return');

interface HistorySelection {
  request: MaterialRequest;
}

export const MRListView: React.FC<MRListViewProps> = ({
  requests,
  searchQuery,
  setSearchQuery,
  onOpenSpecModalByItemCode,
  onApprove,
  onOpenRejectModal,
  onOpenAttachmentsModal,
  onStartSubstituteCheck,
  onSubstituteSelectedInErp,
  onConfirmSubstituteUnused,
  isApiMode = false,
  isLoading = false,
  loadError = null,
  onRefresh,
  onAnswerTask,
}) => {
  // 4-0) 필터링 (상태별)
  const [statusFilter, setStatusFilter] = useState<string>('전체');
  const [deptFilter, setDeptFilter] = useState<string>('전체');
  const [draftQuery, setDraftQuery] = useState(searchQuery);
  const [currentPage, setCurrentPage] = useState(1);
  const [historySelection, setHistorySelection] = useState<HistorySelection | null>(null);
  const [sortKey, setSortKey] = useState<MRSortKey>('dueDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: MRSortKey) => {
    if (key === sortKey) {
      setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  useEffect(() => {
    setDraftQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (draftQuery === searchQuery) return undefined;
    const timer = window.setTimeout(() => setSearchQuery(draftQuery), 200);
    return () => window.clearTimeout(timer);
  }, [draftQuery, searchQuery, setSearchQuery]);

  // 4-1) 검색어 필터링: MR번호, 품목명, 요청부서, 요청자, 아이템코드, 카테고리 등 모든 필드 대상
  const sortedRequests = useMemo(() => {
    const query = searchQuery.toLocaleLowerCase('ko-KR');
    return requests
      .filter((request) => {
        const matchesSearch = [
          request.mrNo,
          request.itemName,
          request.itemCode,
          request.department,
          request.requester,
          request.category,
          request.specSummary,
        ].some((value) => value.toLocaleLowerCase('ko-KR').includes(query));
        const matchesStatus = statusFilter === '전체' || request.status === statusFilter;
        const matchesDept = deptFilter === '전체' || request.department === deptFilter;
        return matchesSearch && matchesStatus && matchesDept;
      })
      .sort((a, b) => {
        const left = sortableValue(a, sortKey);
        const right = sortableValue(b, sortKey);
        const compared = typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), 'ko-KR', { numeric: true });
        return sortDirection === 'asc' ? compared : -compared;
      });
  }, [deptFilter, requests, searchQuery, sortDirection, sortKey, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(sortedRequests.length / PAGE_SIZE));
  const pageRequests = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedRequests.slice(start, start + PAGE_SIZE);
  }, [currentPage, sortedRequests]);

  useEffect(() => {
    setCurrentPage(1);
  }, [deptFilter, searchQuery, sortDirection, sortKey, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 4-1) 상단 검색창 & 4-0) 필터링 바 */}
      <div className="filter-toolbar">
        {/* 4-1) 검색창 */}
        <div className="search-box" style={{ width: '420px' }}>
          <Search size={16} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="4-1) MR번호, 품목명, 요청자, 요청부서, 카테고리 등 전체 검색..."
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
          />
        </div>

        {/* 4-0) 필터링 옵션 */}
        <div className="filter-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
            <Filter size={15} />
            <span>단계 필터:</span>
          </div>
          <select className="select-box" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="전체">전체 단계</option>
            <option value="승인대기">승인대기</option>
            <option value="승인">승인완료</option>
            <option value="반려">반려됨</option>
          </select>

          <select className="select-box" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="전체">전체 부서</option>
            <option value="생산1팀">생산1팀</option>
            <option value="설비관리팀">설비관리팀</option>
            <option value="전기제어팀">전기제어팀</option>
            <option value="품질보증팀">품질보증팀</option>
          </select>
        </div>
      </div>

      {isApiMode && (isLoading || loadError) && (
        <div className={`mr-api-state ${loadError ? 'is-error' : ''}`} role={loadError ? 'alert' : 'status'}>
          <div>
            {loadError ? <AlertCircle size={16} /> : <RefreshCw size={16} className="spin-icon" />}
            <span>{loadError ?? 'ERPNext와 구매 작업 저장소에서 MR을 불러오는 중입니다.'}</span>
          </div>
          {loadError && onRefresh && (
            <button type="button" className="btn-sm btn-outline" onClick={onRefresh}>
              다시 불러오기
            </button>
          )}
        </div>
      )}

      {/* 4-0) 정렬 안내 바 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--warning-bg)',
          border: '1px solid rgba(184, 93, 0, 0.14)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 16px',
          fontSize: '12px',
          color: 'var(--warning)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={16} />
          <span>컬럼명을 눌러 정렬할 수 있습니다. 현재 기준: <strong>{sortKey} ({sortDirection === 'asc' ? '오름차순' : '내림차순'})</strong></span>
        </div>
        <span>조회 건수: {sortedRequests.length}건</span>
      </div>

      {/* 4-2) MR 목록 표 (Table) */}
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <SortableHeader sortKey="department" label="요청부서" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader sortKey="requester" label="요청자" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader sortKey="mrNo" label="MR번호" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader sortKey="itemCode" label="아이템코드" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader sortKey="category" label="아이템그룹(카테고리)" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader sortKey="itemName" label="아이템명" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader sortKey="specSummary" label="규격(클릭 시 전체보기)" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader sortKey="attachmentCount" label="첨부파일" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader sortKey="unitPrice" label="단가" activeKey={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
              <SortableHeader sortKey="totalPrice" label="금액" activeKey={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
              <SortableHeader sortKey="dueDate" label="납기요청일" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader sortKey="revisionRound" label="차수" activeKey={sortKey} direction={sortDirection} onSort={handleSort} align="center" />
              <SortableHeader sortKey="workflowStatus" label="진행여부" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {pageRequests.map((req) => (
              <tr key={req.id} className={`workflow-transition-${req.transitionPhase ?? 'stable'}`}>
                {/* 요청부서 */}
                <td>{req.department}</td>
                {/* 요청자 */}
                <td style={{ fontWeight: 500 }}>{req.requester}</td>
                {/* MR번호 */}
                <td>
                  <div className="mr-number-cell">
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                      {req.mrNo}
                    </span>
                    {hasSupplierReturnHistory(req) && (
                      <span className="badge badge-red mr-supplier-return-indicator">
                        협력사 거절
                      </span>
                    )}
                  </div>
                </td>
                {/* 아이템코드 */}
                <td>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                    {req.itemCode}
                  </span>
                </td>
                {/* 아이템그룹(카테고리) */}
                <td>
                  <span className="badge badge-gray">{req.category}</span>
                </td>
                {/* 아이템명 */}
                <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{req.itemName}</td>
                {/* 규격(클릭 시 전체 내용 확인할 수 있게) */}
                <td>
                  <button
                    className="spec-clickable-btn"
                    onClick={() => onOpenSpecModalByItemCode(req.itemCode, req.fullSpecText)}
                  >
                    <Eye size={13} />
                    <span>{req.specSummary}</span>
                  </button>
                </td>
                {/* 첨부파일 이모티콘: 색깔로 표시되면 첨부파일 있는 거, 색깔 없으면 없는 거 */}
                <td>
                  {req.hasAttachment ? (
                    <div
                      className="attachment-icon has-file"
                      onClick={() => onOpenAttachmentsModal(req.attachmentFiles)}
                      title={`첨부파일 ${req.attachmentCount}개 있음 (클릭 시 확인)`}
                      style={{ cursor: 'pointer' }}
                    >
                      <Paperclip size={16} color="var(--primary)" />
                      <span>{req.attachmentCount}</span>
                    </div>
                  ) : (
                    <div className="attachment-icon no-file" title="첨부파일 없음">
                      <Paperclip size={16} color="var(--text-dim)" />
                      <span>0</span>
                    </div>
                  )}
                </td>
                {/* 단가 */}
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  ₩{req.unitPrice.toLocaleString()}
                </td>
                {/* 금액 */}
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                  ₩{req.totalPrice.toLocaleString()}
                </td>
                {/* 납기요청일 */}
                <td>
                  <div className="due-date-cell">
                    {req.isUrgent && <span className="urgent-date-badge">🔥 긴급</span>}
                    <span style={{ fontWeight: 600, color: req.dDay <= 3 ? 'var(--danger)' : 'var(--text-main)' }}>
                      {req.dueDate}
                    </span>
                    <span style={{ fontSize: '11px', color: req.dDay <= 3 ? 'var(--danger)' : 'var(--text-dim)' }}>
                      D-{req.dDay}
                    </span>
                  </div>
                </td>
                {/* 초회는 -, 반려·협력사 거절 후 재검토부터 차수를 표시 */}
                <td style={{ textAlign: 'center' }}>
                  <div className="mr-revision-cell">
                    <span className="mr-revision-value">
                      {req.revisionRound && req.revisionRound > 0 ? req.revisionRound : '-'}
                    </span>
                    {getReviewHistory(req).length > 0 && (
                      <button
                        type="button"
                        className="revision-history-button"
                        onClick={() => setHistorySelection({ request: req })}
                        aria-label={`${req.mrNo} 회차별 사유 보기`}
                        title="회차별 사유 보기"
                      >
                        <Search size={13} />
                      </button>
                    )}
                  </div>
                </td>
                {/* 진행여부: 승인대기 건은 시작 → 대체품 확인 → MR Submit 순으로 단계가 진행됨 */}
                <td>
                  <div className="mr-stage-cell">
                    {req.workflowStatus === 'AWAITING_MR_REVIEW' && (
                      <div className="mr-stage-row">
                        <div className="action-btn-group">
                          <button className="btn-sm btn-approve" onClick={() => onStartSubstituteCheck(req.id)}>
                            시작
                          </button>
                          <button className="btn-sm btn-reject" onClick={() => onOpenRejectModal(req.id, req.mrNo)}>
                            반려
                          </button>
                        </div>
                      </div>
                    )}
                    {req.workflowStatus === 'QUEUED' && (
                      <div className="mr-stage-row">
                        <span className="badge badge-gray"><Clock size={13} /> 처리 시작 대기</span>
                      </div>
                    )}
                    {req.workflowStatus === 'RUNNING' && (
                      <div className="mr-stage-row">
                        <span className="badge badge-blue">
                          <RefreshCw size={13} className="spin-icon" />
                          자동 처리 · {workflowStageLabel(req.workflowStage)} 중
                        </span>
                      </div>
                    )}
                    {req.workflowStatus === 'WAITING_INPUT' && req.workflowStage === 'SUBSTITUTE_DECISION' && (
                      <div className="mr-stage-row">
                        <span className="badge badge-yellow"><Clock size={13} /> 요청자 대체품 응답 대기</span>
                      </div>
                    )}
                    {req.workflowStatus === 'WAITING_INPUT' && req.workflowStage !== 'SUBSTITUTE_DECISION' && (
                      <div className="mr-stage-row">
                        <span className="badge badge-yellow">
                          <Clock size={13} />
                          {req.workflowStage === 'HUMAN_REVIEW'
                            ? '예외 발생 · 구매 담당자 수동 검토 필요'
                            : req.workflowStage === 'MR_REVIEW'
                              ? 'MR 내용 확인 필요'
                              : '구매 담당자 확인 필요'}
                        </span>
                      </div>
                    )}
                    {req.workflowStatus === 'FAILED' && (
                      <>
                        <div className="mr-stage-row">
                          <span className="badge badge-red"><AlertCircle size={13} /> 처리 확인 필요</span>
                        </div>
                        {req.workflowError && <span className="mr-workflow-error" title={req.workflowError}>{req.workflowError}</span>}
                        <div className="mr-stage-row">
                          <div className="action-btn-group">
                            {req.canRetry ? (
                              <button className="btn-sm btn-outline" onClick={() => onStartSubstituteCheck(req.id)}>다시 시도</button>
                            ) : (
                              <span className="mr-workflow-error">자동 재시도 지점 없음</span>
                            )}
                            <button className="btn-sm btn-reject" onClick={() => onOpenRejectModal(req.id, req.mrNo)}>반려</button>
                          </div>
                        </div>
                      </>
                    )}
                    {req.workflowStatus === 'REJECTED' && (
                      <div className="mr-stage-row">
                        <span className="badge badge-red"><XCircle size={13} /> 반려됨</span>
                      </div>
                    )}
                    {req.workflowStatus
                      && !['AWAITING_MR_REVIEW', 'QUEUED', 'RUNNING', 'WAITING_INPUT', 'FAILED', 'REJECTED'].includes(req.workflowStatus)
                      && (
                        <div className="mr-stage-row">
                          <span className="badge badge-gray">
                            <Clock size={13} /> 상태 확인 필요 · {req.workflowStatus}
                          </span>
                        </div>
                      )}
                    {req.pendingTask && onAnswerTask && (
                      <WorkflowInterruptForm task={req.pendingTask} onSubmit={onAnswerTask} />
                    )}
                    {!req.workflowStatus && req.status === '승인' && (
                      <div className="mr-stage-row">
                        <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle size={13} /> 승인 완료
                        </span>
                      </div>
                    )}
                    {!req.workflowStatus && req.status === '반려' && (
                      <div className="mr-stage-row">
                        <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <XCircle size={13} /> 반려됨
                        </span>
                      </div>
                    )}
                    {!req.workflowStatus && req.status === '승인대기' && (!req.substituteStage || req.substituteStage === 'not_started') && (
                      <div className="mr-stage-row">
                        <div className="action-btn-group">
                          <button className="btn-sm btn-approve" onClick={() => onStartSubstituteCheck(req.id)}>
                            시작
                          </button>
                          <button className="btn-sm btn-reject" onClick={() => onOpenRejectModal(req.id, req.mrNo)}>
                            반려
                          </button>
                        </div>
                      </div>
                    )}
                    {!req.workflowStatus && req.status === '승인대기' && req.substituteStage === 'notified_waiting' && (
                      <>
                        <div className="mr-stage-row">
                          <span className="badge badge-yellow" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={13} /> 요청부서에 대체품 안내완료 · 대기중
                          </span>
                        </div>
                        <div className="mr-stage-row">
                          <div className="action-btn-group">
                            <button className="btn-sm btn-outline" onClick={() => onSubstituteSelectedInErp(req.id)}>
                              ERP 대체품 선택됨
                            </button>
                            <button className="btn-sm btn-approve" onClick={() => onConfirmSubstituteUnused(req.id)}>
                              신규구매 진행
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                    {!req.workflowStatus && req.status === '승인대기' && req.substituteStage === 'not_used_confirmed' && (
                      <>
                        <div className="mr-stage-row">
                          <span className="badge badge-gray">대체품 미사용 확정</span>
                        </div>
                        <div className="mr-stage-row">
                          <button className="btn-sm btn-approve" onClick={() => onApprove(req.id)}>
                            MR Submit
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {sortedRequests.length === 0 && (
              <tr>
                <td colSpan={13} className="table-empty-state">
                  현재 검색 및 필터 조건에 일치하는 MR이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sortedRequests.length > 0 && (
        <div className="pagination-bar" aria-label="MR 목록 페이지 이동">
          <span>페이지 {currentPage} / {totalPages} · 페이지당 {PAGE_SIZE}건</span>
          <div>
            <button type="button" className="btn-outline" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => page - 1)}>
              이전
            </button>
            <button type="button" className="btn-outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => page + 1)}>
              다음
            </button>
          </div>
        </div>
      )}

      {historySelection && (
        <MRReasonHistoryModal
          request={historySelection.request}
          history={getReviewHistory(historySelection.request)}
          onClose={() => setHistorySelection(null)}
        />
      )}
    </div>
  );
};
