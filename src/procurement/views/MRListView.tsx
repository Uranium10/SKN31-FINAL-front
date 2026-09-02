import React, { useEffect, useMemo, useState } from 'react';
import type { MaterialRequest, MRReviewHistoryEntry } from '../types';
import { MRReasonHistoryModal } from '../components/MRReasonHistoryModal';
import {
  Paperclip,
  Eye,
  Search,
  Filter,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface MRListViewProps {
  requests: MaterialRequest[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onOpenSpecModalByItemCode: (itemCode: string) => void;
  onApprove: (id: string) => void;
  onOpenRejectModal: (id: string, mrNo: string) => void;
  onOpenAttachmentsModal: (files: string[]) => void;
  onStartSubstituteCheck: (id: string) => void;
  onSubstituteSelectedInErp: (id: string) => void;
  onConfirmSubstituteUnused: (id: string) => void;
}

const PAGE_SIZE = 25;

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
}) => {
  // 4-0) 필터링 (상태별)
  const [statusFilter, setStatusFilter] = useState<string>('전체');
  const [deptFilter, setDeptFilter] = useState<string>('전체');
  const [draftQuery, setDraftQuery] = useState(searchQuery);
  const [currentPage, setCurrentPage] = useState(1);
  const [historySelection, setHistorySelection] = useState<HistorySelection | null>(null);

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
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [deptFilter, requests, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(sortedRequests.length / PAGE_SIZE));
  const pageRequests = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedRequests.slice(start, start + PAGE_SIZE);
  }, [currentPage, sortedRequests]);

  useEffect(() => {
    setCurrentPage(1);
  }, [deptFilter, searchQuery, statusFilter]);

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
          <span>4-0) 목록 자동 정렬 기준: <strong>납기요청일 (급한 순 / D-Day 순)</strong>으로 자동 정렬되어 표시됩니다.</span>
        </div>
        <span>조회 건수: {sortedRequests.length}건</span>
      </div>

      {/* 4-2) MR 목록 표 (Table) */}
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>요청부서</th>
              <th>요청자</th>
              <th>MR번호</th>
              <th>아이템코드</th>
              <th>아이템그룹(카테고리)</th>
              <th>아이템명</th>
              <th>규격(클릭 시 전체보기)</th>
              <th>첨부파일</th>
              <th>단가</th>
              <th>금액</th>
              <th>납기요청일 (급한순)</th>
              <th style={{ textAlign: 'center' }}>차수</th>
              <th>진행여부</th>
            </tr>
          </thead>
          <tbody>
            {pageRequests.map((req) => (
              <tr key={req.id}>
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
                  <button className="spec-clickable-btn" onClick={() => onOpenSpecModalByItemCode(req.itemCode)}>
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
                    {req.status === '승인' && (
                      <div className="mr-stage-row">
                        <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle size={13} /> 승인 완료
                        </span>
                      </div>
                    )}
                    {req.status === '반려' && (
                      <div className="mr-stage-row">
                        <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <XCircle size={13} /> 반려됨
                        </span>
                      </div>
                    )}
                    {req.status === '승인대기' && (!req.substituteStage || req.substituteStage === 'not_started') && (
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
                    {req.status === '승인대기' && req.substituteStage === 'notified_waiting' && (
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
                    {req.status === '승인대기' && req.substituteStage === 'not_used_confirmed' && (
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
