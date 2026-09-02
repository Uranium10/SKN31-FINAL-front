import React, { useRef } from 'react';
import {
  Clock,
  Users,
  Scale,
  ShoppingCart,
  CheckCircle,
  XCircle,
  Eye,
  AlertTriangle,
  Layers,
  CheckCircle2,
  MinusCircle,
  ChevronRight
} from 'lucide-react';
import type { MaterialRequest, NavigationTab, POItem } from '../types';

interface DashboardViewProps {
  requests: MaterialRequest[];
  poItems?: POItem[];
  onApprove: (id: string) => void;
  onOpenRejectModal: (id: string, mrNo: string) => void;
  onOpenSpecModal: (itemCode: string, requestSpecification?: string) => void;
  setCurrentTab: (tab: NavigationTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  requests,
  poItems = [],
  onApprove,
  onOpenRejectModal,
  onOpenSpecModal,
  setCurrentTab,
}) => {
  const processTrackerRef = useRef<HTMLDivElement>(null);
  const pendingActionsRef = useRef<HTMLDivElement>(null);

  const scrollToSection = (target: React.RefObject<HTMLDivElement | null>) => {
    target.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 2-1) 내 승인 대기 건수
  const pendingRequests = requests.filter((r) => r.status === '승인대기');
  const pendingCount = pendingRequests.length;
  const urgentPendingCount = pendingRequests.filter((r) => r.isUrgent).length;

  // 2-2) 우리팀 건수 총 몇개인지
  const teamTotalCount = requests.length;
  const activeAIWorkCount = requests.filter((request) => (
    request.workflowStatus === 'QUEUED' || request.workflowStatus === 'RUNNING'
  )).length;

  // 견적 비교 대기 & PO 건수 (KPI stats)
  const quotationWaitCount = requests.filter((request) => (
    ['QUOTATION_COLLECTION', 'SUPPLIER_SELECTION'].includes(request.workflowStage ?? '')
    && request.processStage.prSupplierApproved !== '승인'
  )).length;
  const issuedPOItems = poItems.filter((item) => item.poCreated);
  const issuedPOAmount = issuedPOItems.reduce((sum, item) => sum + item.totalAmount, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 2-1 & 2-2) Top KPI Summary Cards */}
      <div className="kpi-grid">
        {/* Card 1: 내 승인 대기 */}
        <button
          type="button"
          className="kpi-card kpi-card-action"
          onClick={() => scrollToSection(pendingActionsRef)}
          aria-controls="dashboard-pending-actions"
          aria-label={`내 승인 대기 ${pendingCount}건 보기`}
        >
          <span className="kpi-top">
            <span className="kpi-title">내 승인 대기</span>
            <span className="kpi-icon warning">
              <Clock size={18} />
            </span>
          </span>
          <span className="kpi-value">
            {pendingCount} <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>건</span>
          </span>
          <span className="kpi-sub" style={{ color: urgentPendingCount > 0 ? 'var(--danger)' : 'var(--text-dim)', fontWeight: urgentPendingCount > 0 ? 600 : 400 }}>
            <span>{urgentPendingCount > 0 ? `🔥 긴급 ${urgentPendingCount}건 포함` : '긴급 건 없음'}</span>
            <ChevronRight className="kpi-action-arrow" size={14} aria-hidden="true" />
          </span>
        </button>

        {/* Card 2: 우리팀 총 건수 */}
        <button
          type="button"
          className="kpi-card kpi-card-action"
          onClick={() => scrollToSection(processTrackerRef)}
          aria-controls="dashboard-process-tracker"
          aria-label={`우리팀 전체 MR ${teamTotalCount}건 진행 현황 보기`}
        >
          <span className="kpi-top">
            <span className="kpi-title">우리팀 총 건수</span>
            <span className="kpi-icon info">
              <Users size={18} />
            </span>
          </span>
          <span className="kpi-value">
            {teamTotalCount} <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>건</span>
          </span>
          <span className="kpi-sub">
            <span>AI 자동 처리 진행 중 {activeAIWorkCount}건</span>
            <ChevronRight className="kpi-action-arrow" size={14} aria-hidden="true" />
          </span>
        </button>

        {/* Card 3: 협력사 미선정 건 */}
        <button
          type="button"
          className="kpi-card kpi-card-action"
          onClick={() => setCurrentTab('vendor-select')}
          aria-label={`협력사 미선정 ${quotationWaitCount}건 목록으로 이동`}
        >
          <span className="kpi-top">
            <span className="kpi-title">협력사 미선정 건</span>
            <span className="kpi-icon warning">
              <Scale size={18} />
            </span>
          </span>
          <span className="kpi-value">
            {quotationWaitCount} <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>건</span>
          </span>
          <span className="kpi-sub" style={{ color: 'var(--warning)' }}>
            <span>오늘 마감 1건 포함</span>
            <ChevronRight className="kpi-action-arrow" size={14} aria-hidden="true" />
          </span>
        </button>

        {/* Card 4: 실제 API/목업 상태에서 생성된 PO */}
        <button
          type="button"
          className="kpi-card kpi-card-action"
          onClick={() => setCurrentTab('po-manage')}
          aria-label="발행 PO 목록으로 이동"
        >
          <span className="kpi-top">
            <span className="kpi-title">발행 PO</span>
            <span className="kpi-icon success">
              <ShoppingCart size={18} />
            </span>
          </span>
          <span className="kpi-value" style={{ color: 'var(--success)' }}>
            ₩{issuedPOAmount.toLocaleString()}
          </span>
          <span className="kpi-sub">
            <span>{issuedPOItems.length}건 발행 완료</span>
            <ChevronRight className="kpi-action-arrow" size={14} aria-hidden="true" />
          </span>
        </button>
      </div>

      {/* 세번째 이미지 반영: MR 번호별 체크표시 단계 진행 현황 표 (Table Trackers) */}
      <div id="dashboard-process-tracker" ref={processTrackerRef} className="process-tracker-card">
        <div className="process-header">
          <h3>
            <Layers size={18} color="var(--primary)" />
            <span>MR 번호별 4단계 진행 현황 (체크표시 트래커)</span>
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
            체크(✓) 표시로 각 MR의 진행 단계를 한눈에 모니터링합니다.
          </span>
        </div>

        {/* MR Progress Table */}
        <div className="table-container" style={{ border: 'none' }}>
          <table className="custom-table" style={{ minWidth: '950px' }}>
            <thead>
              <tr>
                <th>MR 번호</th>
                <th>요청부서 / 품목명</th>
                <th style={{ textAlign: 'center' }}>1단계: 내 승인 여부</th>
                <th style={{ textAlign: 'center' }}>2단계: 견적 회신 진행율</th>
                <th style={{ textAlign: 'center' }}>3단계: 협력사 최종 선정</th>
                <th style={{ textAlign: 'center' }}>4단계: PO 결재·발행</th>
                <th style={{ textAlign: 'center' }}>전체 진행 상태</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => {
                // Calculate step progress
                const step1Done = req.status === '승인';
                const step1Rejected = req.status === '반려';
                const step2Done = req.processStage.quotationProgressPercent === 100;
                const step2Percent = req.processStage.quotationProgressPercent;
                const step3Done = req.processStage.prSupplierApproved === '승인';
                const step3Rejected = req.processStage.prSupplierApproved === '거절';
                const step4Done = req.processStage.poCreated;

                let completedSteps = 0;
                if (step1Done) completedSteps++;
                if (step2Done) completedSteps++;
                if (step3Done) completedSteps++;
                if (step4Done) completedSteps++;

                return (
                  <tr key={req.id}>
                    {/* MR 번호 */}
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                        {req.mrNo}
                      </span>
                    </td>

                    {/* 요청부서 / 품목명 */}
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{req.itemName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                        {req.department} · {req.requester}
                      </div>
                    </td>

                    {/* 1단계: 내 승인 여부 */}
                    <td style={{ textAlign: 'center' }}>
                      {step1Done ? (
                        <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} color="var(--success)" /> 승인 완료 ✓
                        </span>
                      ) : step1Rejected ? (
                        <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <XCircle size={13} color="var(--danger)" /> 반려됨 ✕
                        </span>
                      ) : (
                        <span className="badge badge-yellow" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={13} color="var(--warning)" /> 승인 대기
                        </span>
                      )}
                    </td>

                    {/* 2단계: 견적 회신 진행율 */}
                    <td style={{ textAlign: 'center' }}>
                      {step2Done ? (
                        <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} color="var(--success)" /> 100% 완료 ✓
                        </span>
                      ) : step2Percent > 0 ? (
                        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                          <span className="badge badge-progress">
                            {step2Percent}% 회신 중
                          </span>
                        </div>
                      ) : (
                        <span className="badge badge-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <MinusCircle size={13} color="var(--text-dim)" /> 0% 회신 대기
                        </span>
                      )}
                    </td>

                    {/* 3단계: 협력사 최종 선정 */}
                    <td style={{ textAlign: 'center' }}>
                      {step3Done ? (
                        <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} color="var(--success)" /> 선정 완료 ✓
                        </span>
                      ) : step3Rejected ? (
                        <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <XCircle size={13} color="var(--danger)" /> 선정 취소 ✕
                        </span>
                      ) : (
                        <span className="badge badge-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={13} color="var(--text-muted)" /> 대기
                        </span>
                      )}
                    </td>

                    {/* 4단계: PO 결재·발행 */}
                    <td style={{ textAlign: 'center' }}>
                      {step4Done ? (
                        <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} color="var(--success)" /> PO 발행 완료 ✓
                        </span>
                      ) : (
                        <span className="badge badge-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <MinusCircle size={13} color="var(--text-dim)" /> 발행 대기
                        </span>
                      )}
                    </td>

                    {/* 전체 진행 상태 */}
                    <td style={{ textAlign: 'center' }}>
                      {step1Rejected || step3Rejected ? (
                        <span className="badge badge-red">중단 (반려)</span>
                      ) : completedSteps === 4 ? (
                        <span className="badge badge-green">4/4단계 최종 완료</span>
                      ) : (
                        <span className="badge badge-progress">{completedSteps}/4단계 진행 중</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2-3) 내가 처리해야 할 항목 (간단하게 표시) */}
      <div id="dashboard-pending-actions" ref={pendingActionsRef} className="todo-section">
        <div className="todo-header">
          <h3>
            <AlertTriangle size={18} color="var(--warning)" />
            <span>내가 처리해야 할 항목</span>
            <span className="count-badge">{pendingCount}건</span>
          </h3>
          <button className="btn-sm btn-outline" onClick={() => setCurrentTab('mr-list')}>
            전체 목록 보기 →
          </button>
        </div>

        <div className="todo-card-list">
          {pendingRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              <CheckCircle size={36} color="var(--success)" style={{ marginBottom: '10px' }} />
              <p>모든 결재 및 처리 항목이 완료되었습니다.</p>
            </div>
          ) : (
            pendingRequests.map((req) => (
              <div key={req.id} className="todo-card">
                <div className="todo-top">
                  <span className={`badge ${req.isUrgent ? 'badge-red' : 'badge-yellow'}`}>
                    {req.isUrgent ? '🔥 긴급 승인대기' : '일반 승인대기'}
                  </span>
                  <span className="mr-code">{req.mrNo}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: 'auto' }}>
                    납기요청일: {req.dueDate} (D-{req.dDay})
                  </span>
                </div>

                <div className="todo-title">{req.itemName}</div>
                <div className="todo-subtitle">
                  {req.department} · {req.requester} 담당 · 수량: {req.quantity ?? 0} · 예상금액: ₩{req.totalPrice.toLocaleString()}
                </div>

                <div className="ai-summary-box">
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>AI 에이전트 요약 · </span>
                  {req.fullSpecText.split('\n')[1] || req.specSummary}. 현재 단계: {req.workflowStage ?? 'MR 검토'}.
                </div>

                <div className="todo-footer">
                  <div className="todo-meta">
                    <span>견적 진행률: {req.processStage.quotationProgressPercent}%</span>
                  </div>

                  <div className="action-btn-group">
                    <button className="btn-sm btn-approve" onClick={() => onApprove(req.id)}>
                      <CheckCircle size={14} /> 승인
                    </button>
                    <button className="btn-sm btn-reject" onClick={() => onOpenRejectModal(req.id, req.mrNo)}>
                      <XCircle size={14} /> 반려
                    </button>
                    <button
                      className="btn-sm btn-outline"
                      onClick={() => onOpenSpecModal(req.itemCode, req.fullSpecText)}
                    >
                      <Eye size={14} /> 상세 규격
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
