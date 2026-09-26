import React, { useMemo, useRef } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  ShoppingCart,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
import type {
  MaterialRequest,
  NavigationTab,
  POItem,
  VendorSelectionGroup,
} from '../types';

interface DashboardViewProps {
  requests: MaterialRequest[];
  poItems?: POItem[];
  vendorGroups?: VendorSelectionGroup[];
  onApprove: (id: string) => void;
  onOpenRejectModal: (id: string, mrNo: string) => void;
  onOpenSpecModal: (itemCode: string, requestSpecification?: string) => void;
  setCurrentTab: (tab: NavigationTab) => void;
}

const isAutomationLive = (group: VendorSelectionGroup): boolean => Boolean(
  group.autoProgress?.enabled && group.autoProgress.mode !== 'off',
);

const isBlocked = (group: VendorSelectionGroup): boolean => Boolean(
  isAutomationLive(group)
  && group.autoProgress
  && !group.autoProgress.allowed
  && !group.automationHold?.held
  && !group.selectedSupplierId,
);

const blockedReason = (group: VendorSelectionGroup): string => {
  const blocker = group.autoProgress?.checks.find((check) => check.status === 'blocked');
  return blocker?.detail ?? group.autoProgress?.summary ?? '조건 확인이 필요합니다.';
};

/**
 * 대시보드 - "오늘 내가 손댈 것"만 남긴다.
 *
 * 구매는 조건을 통과하면 자동으로 진행되므로, 여기 뜬다는 건 사람이
 * 개입해야 한다는 뜻이다. 진행 현황을 총망라하던 예전 표는 각 화면이
 * 훨씬 자세히 보여주므로 뺐다.
 */
export const DashboardView: React.FC<DashboardViewProps> = ({
  requests,
  poItems = [],
  vendorGroups = [],
  onApprove,
  onOpenRejectModal,
  onOpenSpecModal,
  setCurrentTab,
}) => {
  const stoppedRef = useRef<HTMLDivElement>(null);
  const myTurnRef = useRef<HTMLDivElement>(null);

  const scrollTo = (target: React.RefObject<HTMLDivElement | null>) => {
    target.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const {
    blockedGroups, failedRequests, pendingRequests, poApprovals, scorecardDue,
    deadlineRisks, dueDateRisks, waitingExternal, autoRunning, recentAuto, issuedPOAmount, issuedPOCount,
  } = useMemo(() => {
    const blocked = vendorGroups.filter(isBlocked);
    const failed = requests.filter((request) => (
      request.workflowStatus === 'FAILED' || Boolean(request.workflowError)
    ));
    const pending = requests.filter((request) => request.status === '승인대기');
    const approvals = poItems.filter((item) => item.approvalStatus === 'pending' && !item.poCreated);
    const scorecards = poItems.filter((item) => item.arrived && !item.scorecardCompleted);

    const deadline = vendorGroups.filter((group) => (
      group.rfqSent
      && !group.selectedSupplierId
      && group.deadlineDDay >= 0
      && group.deadlineDDay <= 1
      && group.quotations.filter((quotation) => quotation.isResponded).length * 2
         < group.quotations.length
    ));
    const dueSoon = vendorGroups.filter((group) => (
      !group.orderStarted && group.rfqSent && group.targetDueDate
      && Math.ceil((new Date(`${group.targetDueDate}T00:00:00`).getTime() - Date.now()) / 86_400_000) <= 5
      && Math.ceil((new Date(`${group.targetDueDate}T00:00:00`).getTime() - Date.now()) / 86_400_000) >= 0
    ));
    const external = vendorGroups.filter((group) => (
      group.rfqSent && !group.selectedSupplierId && !isBlocked(group) && group.deadlineDDay > 1
    ));
    const running = vendorGroups.filter((group) => (
      isAutomationLive(group) && group.autoProgress?.allowed && !group.automationHold?.held
    ));
    const auto = vendorGroups
      .filter((group) => group.selectionMode === 'auto' && group.selectedSupplierId)
      .slice(0, 5);

    const issued = poItems.filter((item) => item.poCreated);
    return {
      blockedGroups: blocked,
      failedRequests: failed,
      pendingRequests: pending,
      poApprovals: approvals,
      scorecardDue: scorecards,
      deadlineRisks: deadline,
      dueDateRisks: dueSoon,
      waitingExternal: external,
      autoRunning: running,
      recentAuto: auto,
      issuedPOAmount: issued.reduce((sum, item) => sum + item.totalAmount, 0),
      issuedPOCount: issued.length,
    };
  }, [requests, poItems, vendorGroups]);

  const stoppedCount = blockedGroups.length + failedRequests.length;
  const myTurnCount = pendingRequests.length + poApprovals.length + scorecardDue.length;
  const riskCount = deadlineRisks.length + dueDateRisks.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 22px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
        <span style={{ fontSize: '30px', fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
          {stoppedCount + myTurnCount}건
        </span>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-main)', lineHeight: 1.6 }}>
          {stoppedCount + myTurnCount === 0
            ? '지금 사람 손이 필요한 건이 없습니다. 나머지는 자동으로 진행되고 있습니다.'
            : <>오늘 사람 손이 필요한 건입니다 — 멈춘 것 {stoppedCount}건, 내 차례 {myTurnCount}건.{' '}
              <span style={{ color: 'var(--text-muted)' }}>
                나머지 {autoRunning.length}건은 조건을 통과해 자동으로 진행 중입니다.
              </span></>}
        </p>
      </div>

      <div className="kpi-grid">
        <button type="button" className="kpi-card kpi-card-action" onClick={() => scrollTo(stoppedRef)} style={stoppedCount > 0 ? { borderColor: 'var(--danger)' } : undefined}>
          <span className="kpi-top">
            <span className="kpi-title">멈춤 · 결정 필요</span>
            <span className="kpi-icon warning"><AlertTriangle size={18} /></span>
          </span>
          <span className="kpi-value">{stoppedCount} <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>건</span></span>
          <span className="kpi-sub"><span>결정해야 다시 움직입니다</span><ChevronRight className="kpi-action-arrow" size={14} aria-hidden="true" /></span>
        </button>

        <button type="button" className="kpi-card kpi-card-action" onClick={() => scrollTo(myTurnRef)}>
          <span className="kpi-top">
            <span className="kpi-title">내 차례</span>
            <span className="kpi-icon info"><Bell size={18} /></span>
          </span>
          <span className="kpi-value">{myTurnCount} <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>건</span></span>
          <span className="kpi-sub"><span>처리 시작 · PO 승인 · 협력사 평가</span><ChevronRight className="kpi-action-arrow" size={14} aria-hidden="true" /></span>
        </button>

        <button type="button" className="kpi-card kpi-card-action" onClick={() => setCurrentTab('vendor-select')}>
          <span className="kpi-top">
            <span className="kpi-title">외부 응답 대기</span>
            <span className="kpi-icon info"><Clock size={18} /></span>
          </span>
          <span className="kpi-value">{waitingExternal.length} <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>건</span></span>
          <span className="kpi-sub"><span>협력사 회신을 기다리는 중</span><ChevronRight className="kpi-action-arrow" size={14} aria-hidden="true" /></span>
        </button>

        <button type="button" className="kpi-card kpi-card-action" onClick={() => setCurrentTab('po-manage')}>
          <span className="kpi-top">
            <span className="kpi-title">발행 PO</span>
            <span className="kpi-icon success"><ShoppingCart size={18} /></span>
          </span>
          <span className="kpi-value" style={{ color: 'var(--success)' }}>₩{issuedPOAmount.toLocaleString()}</span>
          <span className="kpi-sub"><span>{issuedPOCount}건 발행 완료</span><ChevronRight className="kpi-action-arrow" size={14} aria-hidden="true" /></span>
        </button>
      </div>

      <section ref={stoppedRef} id="dashboard-stopped">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={17} color="var(--danger)" />
            멈춤 — 조건에 걸려 자동 진행을 세웠습니다
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>결정해야 다시 움직입니다</span>
        </div>

        {stoppedCount === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '10px', fontSize: '13px' }}>
            멈춘 건이 없습니다.
          </div>
        ) : (
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--danger)', borderRadius: '12px', overflow: 'hidden' }}>
            {blockedGroups.map((group, index) => (
              <div key={group.id} style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '14px 20px', borderTop: index === 0 ? 'none' : '1px solid var(--border-color)' }}>
                <div style={{ width: '280px', flexShrink: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)' }}>{group.mrNo}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{group.itemName}</div>
                </div>
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--danger)' }}>{blockedReason(group)}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    마감 {group.deadlineDate} {group.deadlineTime}
                    {group.deadlineDDay <= 0 ? ' 경과' : ` · D-${group.deadlineDDay}`}
                  </div>
                </div>
                <button type="button" className="btn-sm btn-reject" style={{ flexShrink: 0 }} onClick={() => setCurrentTab('vendor-select')}>
                  결정하기
                </button>
              </div>
            ))}
            {failedRequests.map((request, index) => (
              <div key={request.id} style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '14px 20px', borderTop: index === 0 && blockedGroups.length === 0 ? 'none' : '1px solid var(--border-color)' }}>
                <div style={{ width: '280px', flexShrink: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)' }}>{request.mrNo}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{request.itemName}</div>
                </div>
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--danger)' }}>
                    {request.workflowError || '워크플로가 멈췄습니다'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    현재 단계: {request.workflowStage ?? '확인 필요'}
                  </div>
                </div>
                <button type="button" className="btn-sm btn-outline" style={{ flexShrink: 0 }} onClick={() => setCurrentTab('mr-list')}>
                  직접 확인
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section ref={myTurnRef} id="dashboard-my-turn">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={17} color="var(--primary)" />
            내 차례 — 이 세 가지만 사람이 확인합니다
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>나머지 단계는 자동으로 진행됩니다</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '14px' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ alignSelf: 'flex-start', padding: '3px 9px', borderRadius: '6px', backgroundColor: 'var(--primary-soft)', color: 'var(--primary-hover)', fontSize: '11px', fontWeight: 700 }}>
              ① 처리 시작 · {pendingRequests.length}건
            </span>
            {pendingRequests.length === 0 ? (
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-dim)' }}>승인 대기 중인 구매요청이 없습니다.</p>
            ) : (
              <>
                {pendingRequests.slice(0, 2).map((request) => (
                  <div key={request.id} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                      {request.mrNo} · {request.itemName}
                    </div>
                    <div style={{ fontSize: '11px', color: request.isUrgent ? 'var(--danger)' : 'var(--text-muted)', marginTop: '2px' }}>
                      {request.department} · 납기 {request.dueDate} (D-{request.dDay}){request.isUrgent ? ' · 긴급' : ''}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                      <button type="button" className="btn-sm btn-approve" onClick={() => onApprove(request.id)}>
                        <CheckCircle size={13} /> 승인
                      </button>
                      <button type="button" className="btn-sm btn-reject" onClick={() => onOpenRejectModal(request.id, request.mrNo)}>
                        <XCircle size={13} /> 반려
                      </button>
                      <button type="button" className="btn-sm btn-outline" onClick={() => onOpenSpecModal(request.itemCode, request.fullSpecText)}>
                        <Eye size={13} /> 규격
                      </button>
                    </div>
                  </div>
                ))}
                {pendingRequests.length > 2 && (
                  <button type="button" className="btn-sm btn-outline" style={{ alignSelf: 'flex-start' }} onClick={() => setCurrentTab('mr-list')}>
                    나머지 {pendingRequests.length - 2}건 보기 →
                  </button>
                )}
              </>
            )}
          </div>

          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ alignSelf: 'flex-start', padding: '3px 9px', borderRadius: '6px', backgroundColor: 'var(--primary-soft)', color: 'var(--primary-hover)', fontSize: '11px', fontWeight: 700 }}>
              ② PO 승인 · {poApprovals.length}건
            </span>
            {poApprovals.length === 0 ? (
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-dim)' }}>발주 전 승인을 기다리는 건이 없습니다.</p>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                  협력사가 수주를 수락했습니다. 승인하면 발주서가 나갑니다 — 자동 선정된 건도 여기서 한 번 더 확인합니다.
                </p>
                {poApprovals.slice(0, 2).map((item) => (
                  <div key={item.id} style={{ fontSize: '12px', color: 'var(--text-main)', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                    <b>{item.mrNo}</b> · {item.selectedSupplier} · ₩{item.totalAmount.toLocaleString()}
                  </div>
                ))}
                <button type="button" className="btn-sm btn-approve" style={{ alignSelf: 'flex-start' }} onClick={() => setCurrentTab('po-manage')}>
                  근거 확인 · 승인 →
                </button>
              </>
            )}
          </div>

          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ alignSelf: 'flex-start', padding: '3px 9px', borderRadius: '6px', backgroundColor: 'var(--primary-soft)', color: 'var(--primary-hover)', fontSize: '11px', fontWeight: 700 }}>
              ③ 협력사 평가 · {scorecardDue.length}건
            </span>
            {scorecardDue.length === 0 ? (
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-dim)' }}>작성할 평가가 없습니다.</p>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                  평가가 없는 협력사는 다음 비딩에서 신규 업체처럼 점수가 매겨집니다. 미룰수록 자동 선정이 부정확해집니다.
                </p>
                {scorecardDue.slice(0, 2).map((item) => (
                  <div key={item.id} style={{ fontSize: '12px', color: 'var(--text-main)', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                    <b>{item.poNo ?? item.mrNo}</b> · {item.selectedSupplier}
                  </div>
                ))}
                <button type="button" className="btn-sm btn-outline" style={{ alignSelf: 'flex-start' }} onClick={() => setCurrentTab('po-manage')}>
                  평가 작성 →
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {riskCount > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CalendarClock size={17} color="var(--warning)" />
              놓치면 손해 — 멈추지는 않았지만 봐두셔야 합니다
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>그냥 두면 자동으로 진행됩니다</span>
          </div>
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
            {deadlineRisks.map((group, index) => (
              <div key={`deadline-${group.id}`} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 20px', borderTop: index === 0 ? 'none' : '1px solid var(--border-color)' }}>
                <span className="badge badge-yellow" style={{ flexShrink: 0, fontSize: '11px' }}>마감 D-{group.deadlineDDay}</span>
                <p style={{ flexGrow: 1, margin: 0, fontSize: '13px', color: 'var(--text-main)' }}>
                  <b style={{ color: 'var(--primary)' }}>{group.mrNo}</b>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {' '}· {group.itemName} — {group.quotations.length}곳 중{' '}
                    {group.quotations.filter((quotation) => quotation.isResponded).length}곳만 회신했습니다.
                    마감 후 그대로 자동 선정합니다.
                  </span>
                </p>
                <button type="button" className="btn-sm btn-outline" style={{ flexShrink: 0 }} onClick={() => setCurrentTab('vendor-select')}>
                  마감 연장
                </button>
              </div>
            ))}
            {dueDateRisks.map((group) => (
              <div key={`due-${group.id}`} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 20px', borderTop: '1px solid var(--border-color)' }}>
                <span className="badge badge-red" style={{ flexShrink: 0, fontSize: '11px' }}>납기 임박</span>
                <p style={{ flexGrow: 1, margin: 0, fontSize: '13px', color: 'var(--text-main)' }}>
                  <b style={{ color: 'var(--primary)' }}>{group.mrNo}</b>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {' '}· {group.itemName} — 납기요청일({group.targetDueDate})이 코앞인데 아직 발주 전입니다.
                  </span>
                </p>
                <button type="button" className="btn-sm btn-outline" style={{ flexShrink: 0 }} onClick={() => setCurrentTab('vendor-select')}>
                  확인
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {recentAuto.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={17} color="var(--primary)" />
              자동으로 처리했습니다
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>사람 확인 없이 조건을 통과한 건</span>
          </div>
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
            {recentAuto.map((group, index) => (
              <div key={group.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', borderTop: index === 0 ? 'none' : '1px solid var(--border-color)' }}>
                <CheckCircle2 size={15} color="var(--success)" style={{ flexShrink: 0 }} />
                <p style={{ flexGrow: 1, margin: 0, fontSize: '13px', color: 'var(--text-main)' }}>
                  <b style={{ color: 'var(--primary)' }}>{group.mrNo}</b>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {' '}— {group.selectedSupplierId} 자동 선정
                    {group.autoProgress?.summary ? ` · ${group.autoProgress.summary}` : ''}
                  </span>
                </p>
                <Sparkles size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
