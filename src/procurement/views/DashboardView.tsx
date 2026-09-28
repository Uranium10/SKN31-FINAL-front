import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ClipboardCheck, Cpu, Hourglass, FileText, Activity, CircleCheck } from 'lucide-react';
import type { MaterialRequest, NavigationTab, POItem, ProcurementNotification } from '../types';
import { dashboardTasks, issuedPurchaseOrders } from '../utils/dashboardTasks';
import type { DashboardTask, TaskBucket } from '../utils/dashboardTasks';
import './DashboardView.css';
import type { WorkProgress } from '../api/workProgress';
import { progressAge, progressReason, needsProgressReview, progressStepLabel } from '../utils/workProgress';
import { CaseDecisionTimeline } from '../components/CaseDecisionTimeline';

interface DashboardViewProps {
  progress?: { items: WorkProgress[]; error: string; checkedAt: string; truncated: boolean; refresh: () => void };
  requests: MaterialRequest[];
  poItems?: POItem[];
  notifications?: ProcurementNotification[];
  setCurrentTab: (tab: NavigationTab) => void;
  onOpenTask: (tab: NavigationTab, mrNo: string) => void;
}
const groupInfo = {
  attention: { title: '지금 확인해야 할 작업', icon: ClipboardCheck, empty: '지금 확인할 작업이 없습니다.' },
  processing: { title: 'AI · 시스템이 처리 중', icon: Cpu, empty: '현재 실행 중인 작업이 없습니다.' },
  waiting: { title: '외부 응답 · 입고 대기', icon: Hourglass, empty: '외부 응답을 기다리는 작업이 없습니다.' },
  other: { title: '그 밖의 진행 작업', icon: FileText, empty: '추가 작업이 없습니다.' },
};

function TaskSection({ bucket, tasks, onOpenTask, progress }: {
  bucket: TaskBucket; tasks: DashboardTask[]; onOpenTask: DashboardViewProps['onOpenTask'];
  progress?: DashboardViewProps['progress'];
}) {
  const [expanded, setExpanded] = useState(false);
  const group = groupInfo[bucket];
  const Icon = group.icon;
  const visible = expanded ? tasks : tasks.slice(0, 3);
  return <section className={`work-section work-section-${bucket}`} id={`work-${bucket}`} aria-labelledby={`work-title-${bucket}`}>
    <header className="work-section-header">
      <h2 id={`work-title-${bucket}`}><Icon size={18} /><span>{group.title}</span><span className="work-count">{tasks.length}건</span></h2>
      {tasks.length > 3 && <button className="work-link" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={`work-list-${bucket}`}>
        {expanded ? '접기' : `더보기 (${tasks.length - 3})`}<ChevronDown size={15} className={expanded ? 'is-expanded' : ''} />
      </button>}
    </header>
    <div id={`work-list-${bucket}`} className="work-task-list">
      {visible.map(({ request, label, detail, tab }) => {
        const state = progress?.items.find(p => p.case_id === request.id);
        // Never reuse a previous stage's waiting reason while list refresh catches up.
        const matched = state?.stage === request.workflowStage ? state : undefined;
        const reason = request.workflowError || request.workflowStatus === 'FAILED' ? undefined : progressReason(matched);
        return <article className={`work-task ${needsProgressReview(matched) ? 'work-task-review' : ''}`} key={request.mrNo}>
        <button type="button" className="work-task-main work-task-link" onClick={() => onOpenTask(tab, request.mrNo)} aria-label={`${request.mrNo} ${label} 작업 열기`}>
          <span className="work-stage">{label}</span>
          <span className="work-item"><strong>{request.itemName}</strong><span>{request.mrNo}</span></span>
          <span className="work-task-description">{reason || detail}
            {needsProgressReview(matched) && <strong className="work-review-label">담당자 점검 필요 · 자동 재실행하지 않습니다</strong>}
            {matched && <small className="work-observed-time">구매 건 최근 갱신 후 {progressAge(matched.updated_at)}</small>}
          </span><ArrowRight className="work-task-arrow" size={16} aria-hidden="true" />
        </button>
        <details className="work-detail">
          <summary>상세 정보 <ChevronDown size={14} /></summary>
          <dl><div><dt>요청부서 · 요청자</dt><dd>{request.department} · {request.requester}</dd></div>
            <div><dt>요청 납기일</dt><dd>{request.dueDate || '미지정'}</dd></div>
            <div><dt>품목 코드</dt><dd>{request.itemCode}</dd></div>
            <div><dt>요청 금액</dt><dd>₩{request.totalPrice.toLocaleString()}</dd></div></dl>
          <button className="work-open" onClick={() => onOpenTask(tab, request.mrNo)}>해당 작업 열기 <ArrowRight size={14} /></button>
          {matched?.last_step && <p className="work-check-note">최근 단계 기록: {progressStepLabel(matched.last_step)} · {progressAge(matched.last_step_at)} 전</p>}
          {matched?.checked_at && <p className="work-check-note">마감 조건 확인: {new Date(matched.checked_at).toLocaleString('ko-KR')}
            {typeof matched.metrics?.elapsed_ms === 'number' && ` · ${(matched.metrics.elapsed_ms / 1000).toFixed(1)}초`}
            {typeof matched.metrics?.erp_calls === 'number' && ` · ERP 조회 ${matched.metrics.erp_calls}회`}</p>}
          {progress && <CaseDecisionTimeline caseId={request.id} />}
        </details>
      </article>; })}
      {!tasks.length && <div className="work-empty"><CircleCheck size={20} /><span>{group.empty}</span></div>}
    </div>
  </section>;
}

export function DashboardView({ requests, poItems = [], notifications = [], setCurrentTab, onOpenTask, progress }: DashboardViewProps) {
  const tasks = useMemo(() => dashboardTasks(requests).map(task => {
    const state = progress?.items.find(p => p.case_id === task.request.id && p.stage === task.request.workflowStage);
    return needsProgressReview(state) && task.bucket !== 'attention'
      ? { ...task, bucket: 'attention' as const, label: '자동 진행 점검 필요' }
      : task;
  }), [requests, progress?.items]);
  const issued = useMemo(() => issuedPurchaseOrders(poItems), [poItems]);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const groups = {
    attention: tasks.filter(t => t.bucket === 'attention'),
    processing: tasks.filter(t => t.bucket === 'processing'),
    waiting: tasks.filter(t => t.bucket === 'waiting'),
    other: tasks.filter(t => t.bucket === 'other'),
  };
  // Actual notification records, not invented "AI completed" events.
  const activity = [...notifications].sort((a,b) => (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0));
  return <div className="work-dashboard">
    <div className="work-intro"><div><span className="work-eyebrow">WORK OVERVIEW</span><p>필요한 결정은 한곳에서, 진행 상황은 한눈에.</p></div>
      <button className="work-link" onClick={() => setCurrentTab('mr-list')}>전체 구매 현황 <ArrowRight size={16} /></button></div>
    {progress && <section className="work-live-strip" aria-label="진행 현황 동기화">
      <div><strong>구매 작업 현황</strong><span>처리 상태 {requests.filter(r => r.workflowStatus === 'RUNNING').length}건 · 실행 대기 {requests.filter(r => r.workflowStatus === 'QUEUED').length}건</span></div>
      <div><span>{progress.error || (progress.checkedAt ? `마지막 확인 ${new Date(progress.checkedAt).toLocaleTimeString('ko-KR')}` : '진행 현황 연결 중')}{progress.truncated ? ' · 최근 200건 기준' : ''}</span>
        <button type="button" className="work-link" onClick={progress.refresh}>현황 새로고침</button></div>
    </section>}
    <div className="work-kpis">
      {(['attention', 'processing', 'waiting'] as const).map(key => {
        const Icon = groupInfo[key].icon;
        return <button key={key} className={`work-kpi work-kpi-${key}`} onClick={() => document.getElementById(`work-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <span className="work-kpi-icon"><Icon size={23} /></span><span><span className="work-kpi-label">{key === 'attention' ? '사람 확인 필요' : key === 'processing' ? 'AI · 시스템이 처리 중' : '외부 응답 · 입고 대기'}</span>
            <strong>{groups[key].length}<small>건</small></strong><span className="work-kpi-caption">{key === 'attention' ? '검토 · 선택 · 예외 확인' : key === 'processing' ? '실행 중 또는 실행 대기' : '공급사 · 요청부서 · 입고'}</span></span>
        </button>;
      })}
      <button className="work-kpi" onClick={() => setCurrentTab('po-manage')}><span className="work-kpi-icon"><FileText size={23} /></span>
        <span><span className="work-kpi-label">발행 PO 금액</span><strong className="work-amount">₩{issued.reduce((sum,p) => sum + p.totalAmount, 0).toLocaleString()}</strong><span className="work-kpi-caption">조회된 발주서 {issued.length}건 기준</span></span></button>
    </div>
    <TaskSection bucket="attention" tasks={groups.attention} onOpenTask={onOpenTask} progress={progress} />
    <div className="work-columns"><TaskSection bucket="processing" tasks={groups.processing} onOpenTask={onOpenTask} progress={progress} />
      <TaskSection bucket="waiting" tasks={groups.waiting} onOpenTask={onOpenTask} progress={progress} /></div>
    {!!groups.other.length && <TaskSection bucket="other" tasks={groups.other} onOpenTask={onOpenTask} progress={progress} />}
    <section className="work-section" aria-labelledby="work-activity-title"><header className="work-section-header">
      <h2 id="work-activity-title"><Activity size={18} />최근 처리 알림</h2>
      {activity.length > 3 && <button className="work-link" onClick={() => setShowAllActivity(!showAllActivity)} aria-expanded={showAllActivity}>{showAllActivity ? '접기' : '더보기'}<ChevronDown size={15} /></button>}
    </header><div className="work-activity">
      {(showAllActivity ? activity : activity.slice(0,3)).map(n => <button key={n.id} onClick={() => {
        const mrNo = requests.find(r => r.mrNo === n.reference)?.mrNo
          ?? poItems.find(p => p.mrNo === n.reference || p.poNo === n.reference)?.mrNo;
        // Item / PO references are not MR identifiers. Avoid an empty MR filter.
        if (mrNo) onOpenTask(n.targetTab, mrNo); else setCurrentTab(n.targetTab);
      }}>
        <span>{n.time}</span><strong>{n.title}</strong><p>{n.detail}</p></button>)}
      {!activity.length && <p className="work-empty">표시할 최근 알림이 없습니다.</p>}
    </div></section>
  </div>;
}
