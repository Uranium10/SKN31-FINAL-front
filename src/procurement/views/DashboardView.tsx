import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, ClipboardCheck, Cpu, Hourglass, FileText, Activity, CircleCheck, AlertTriangle, Clock } from 'lucide-react';
import type { MaterialRequest, NavigationTab, POItem, ProcurementNotification } from '../types';
import { dashboardStageLabel, dashboardTasks } from '../utils/dashboardTasks';
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
  /** ERPNext Purchase Manager 권한. 발주 승인이 '내 할 일'인지 '승인 대기'인지를 가른다. */
  canApprovePO?: boolean;
}
const groupInfo = {
  blocked: { title: '막힌 작업 · 점검 필요', icon: AlertTriangle,
    empty: '중단되거나 실패한 작업이 없습니다.' },
  attention: { title: '내가 결정할 작업', icon: ClipboardCheck,
    empty: '지금 결정할 작업이 없습니다.' },
  processing: { title: 'AI · 시스템이 처리 중', icon: Cpu, empty: '현재 실행 중인 작업이 없습니다.' },
  waiting: { title: '외부 · 상위 응답 대기', icon: Hourglass, empty: '응답을 기다리는 작업이 없습니다.' },
  other: { title: '그 밖의 진행 작업', icon: FileText, empty: '추가 작업이 없습니다.' },
};
type TaskSectionKey = TaskBucket;

function TaskSection({ bucket, tasks, onOpenTask, progress, onMore, fullList = false, totalCount }: {
  bucket: TaskSectionKey; tasks: DashboardTask[]; onOpenTask: DashboardViewProps['onOpenTask'];
  progress?: DashboardViewProps['progress'];
  onMore?: () => void; fullList?: boolean; totalCount?: number;
}) {
  const group = groupInfo[bucket];
  const Icon = group.icon;
  const visible = fullList ? tasks : tasks.slice(0, 3);
  return <section className={`work-section work-section-${bucket}`} id={`work-${bucket}`} aria-labelledby={`work-title-${bucket}`}>
    <header className="work-section-header">
      <h2 id={`work-title-${bucket}`}><Icon size={18} /><span>{group.title}</span><span className="work-count">{totalCount ?? tasks.length}건</span></h2>
      {onMore && <button className="work-link" onClick={onMore}>
        더보기 <ArrowRight size={15} />
      </button>}
    </header>
    <div id={`work-list-${bucket}`} className="work-task-list">
      {visible.map(({ request, label, detail, tab, bucket: taskBucket, urgency, urgencyLabel, deadlineLabel, elapsedLabel, autoBlockers }) => {
        const state = progress?.items.find(p => p.case_id === request.id);
        // Never reuse a previous stage's waiting reason while list refresh catches up.
        const matched = state && state.stage === request.workflowStage && state.status === request.workflowStatus ? state : undefined;
        // 조건 미달로 멈춘 건은 판정 요약이 가장 정확하다. 목록 갱신이 늦어
        // 이전 단계의 대기 사유가 덮어쓰는 일이 없게 여기서는 쓰지 않는다.
        const reason = autoBlockers.length || request.workflowError || request.workflowStatus === 'FAILED'
          ? undefined : progressReason(matched);
        return <article className={`work-task work-urgency-${urgency}${urgency !== 'danger' && (taskBucket === 'attention' || taskBucket === 'waiting') ? ' work-waiting-tag' : ''}`} key={request.mrNo}>
        <button type="button" className="work-task-main work-task-link" onClick={() => onOpenTask(tab, request.mrNo)} aria-label={`${request.mrNo} ${label} 작업 열기`}>
          <span className="work-stage">{label}</span>
          <span className="work-item"><strong>{request.itemName}</strong><span>{request.mrNo}</span></span>
          <span className="work-task-description">{reason || detail}
            <span className="work-time-evidence"><strong>{urgency === 'danger' ? <AlertTriangle size={13} /> : <Clock size={13} />}{urgencyLabel}</strong><span>{deadlineLabel}</span><span>{elapsedLabel}</span></span>
            {needsProgressReview(matched) && <strong className="work-review-label">담당자 점검 필요 · 자동 재실행하지 않습니다</strong>}
          </span><ArrowRight className="work-task-arrow" size={16} aria-hidden="true" />
        </button>
        {!!autoBlockers.length && <div className="work-blockers">
          <strong>자동 진행 조건 미달</strong>
          <ul>{autoBlockers.slice(0, 2).map(blocker => <li key={blocker.code}>
            <span>{blocker.label}</span>{blocker.detail && <em>{blocker.detail}</em>}</li>)}</ul>
          {autoBlockers.length > 2 && <details className="work-blockers-more">
            <summary>외 {autoBlockers.length - 2}건 보기 <ChevronDown size={13} /></summary>
            <ul>{autoBlockers.slice(2).map(blocker => <li key={blocker.code}>
              <span>{blocker.label}</span>{blocker.detail && <em>{blocker.detail}</em>}</li>)}</ul>
          </details>}
        </div>}
        <details className="work-detail">
          <summary>상세 정보 <ChevronDown size={14} /></summary>
          <dl><div><dt>요청부서 · 요청자</dt><dd>{request.department} · {request.requester}</dd></div>
            <div><dt>요청 납기일</dt><dd>{(request.requestedDueDate ?? request.dueDate) || '미지정'}</dd></div>
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
      {!tasks.length && <div className={`work-empty ${!fullList ? 'work-empty-success' : ''}`}><CircleCheck size={20} /><span>{fullList ? '조건에 맞는 작업이 없습니다. 필터를 변경해 주세요.' : group.empty}</span></div>}
    </div>
  </section>;
}

export function DashboardView({ requests, poItems = [], notifications = [], setCurrentTab, onOpenTask, progress, canApprovePO = false }: DashboardViewProps) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    // Clock-only refresh; never add ERP/API polling to keep countdowns fresh.
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const tasks = useMemo(() => dashboardTasks(requests, progress?.items, now, { canApprovePO }),
    [requests, progress?.items, now, canApprovePO]);
  // A dedicated list view replaces the overview; more never stretches its cards.
  const [listView, setListView] = useState<TaskSectionKey | 'activity' | null>(null);
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('');
  const [sort, setSort] = useState('default');
  const [page, setPage] = useState(1);
  const openList = (view: typeof listView) => {
    setListView(view); setQuery(''); setStage(''); setSort('default'); setPage(1);
    requestAnimationFrame(() => {
      const top = document.getElementById('dashboard-view-top');
      top?.scrollIntoView({ block: 'start' }); top?.focus({ preventScroll: true });
    });
  };
  const groups = {
    blocked: tasks.filter(t => t.bucket === 'blocked'),
    attention: tasks.filter(t => t.bucket === 'attention'),
    processing: tasks.filter(t => t.bucket === 'processing'),
    waiting: tasks.filter(t => t.bucket === 'waiting'),
    other: tasks.filter(t => t.bucket === 'other'),
  };
  // 사람이 지금 손대야 하는 것: 막힌 것, 내가 결정할 것, 그리고 기한이 급해
  // 마감 연장이나 재비딩 같은 할 일이 생긴 대기 건.
  const needsAttention = tasks.filter(t => t.bucket === 'blocked' || t.bucket === 'attention' || t.priority < 2);
  const firstTask = needsAttention[0];
  // Actual notification records, not invented "AI completed" events.
  const activity = [...notifications].sort((a,b) => (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0));
  const activityList = (rows: ProcurementNotification[]) => <div className="work-activity">
    {rows.map(n => <button key={n.id} onClick={() => {
      const mrNo = requests.find(r => r.mrNo === n.reference)?.mrNo
        ?? poItems.find(p => p.mrNo === n.reference || p.poNo === n.reference)?.mrNo;
      if (mrNo) onOpenTask(n.targetTab, mrNo); else setCurrentTab(n.targetTab);
    }}><span>{n.time}</span><strong>{n.title}</strong><p>{n.detail}</p></button>)}
    {!rows.length && <p className="work-empty">조건에 맞는 알림이 없습니다.</p>}
  </div>;
  if (listView) {
    const isActivity = listView === 'activity';
    const source = isActivity ? [] : groups[listView];
    const needle = query.trim().toLocaleLowerCase();
    const filtered = source.filter(t => (!stage || (t.request.workflowStage || 'UNKNOWN') === stage)
      && [t.request.mrNo, t.request.itemName, t.request.itemCode, t.request.department, t.request.requester, t.label]
        .some(value => String(value ?? '').toLocaleLowerCase().includes(needle)));
    if (sort === 'asc' || sort === 'desc') filtered.sort((a, b) =>
      a.request.mrNo.localeCompare(b.request.mrNo, 'ko', { numeric: true }) * (sort === 'asc' ? 1 : -1));
    if (sort === 'due') filtered.sort((a, b) => ((a.request.requestedDueDate ?? a.request.dueDate) || '9999').localeCompare((b.request.requestedDueDate ?? b.request.dueDate) || '9999'));
    const filteredActivity = activity.filter(n => (!stage || n.targetTab === stage)
      && [n.title, n.detail, n.reference].some(value => String(value ?? '').toLocaleLowerCase().includes(needle)));
    if (sort === 'oldest') filteredActivity.reverse();
    const total = isActivity ? filteredActivity.length : filtered.length;
    const pages = Math.max(1, Math.ceil(total / 25));
    const currentPage = Math.min(page, pages);
    const start = (currentPage - 1) * 25;
    const stages = [...new Map(source.map(t => [t.request.workflowStage || 'UNKNOWN', dashboardStageLabel(t.request.workflowStage)])).entries()];
    const tabs: Partial<Record<NavigationTab, string>> = { 'mr-list': 'MR 목록', 'vendor-select': '협력사 선정', 'po-manage': 'PO 관리', 'item-register': '아이템 목록', dashboard: '대시보드', 'company-policy': '회사 구매 정책', 'ai-decision-log': 'AI 판단 기록' };
    return <div className="work-dashboard work-list-page" id="dashboard-view-top" tabIndex={-1}>
      <button type="button" className="work-back" onClick={() => openList(null)}><ArrowLeft size={17} /> 대시보드로 돌아가기</button>
      <header className="work-list-heading"><span className="work-eyebrow">WORK LIST</span><h1>{isActivity ? '최근 처리 알림' : groupInfo[listView].title}</h1>
        <p>현재 조회된 {isActivity ? '알림' : '작업'} 중 {total}건 · 행을 누르면 해당 작업 화면으로 이동합니다.</p></header>
      <div className="work-list-filters">
        <label>검색<input type="search" value={query} placeholder={isActivity ? '알림 내용 · 문서 번호' : 'MR 번호 · 품목 · 요청부서'} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label>
        <label>{isActivity ? '업무 화면' : '단계'}<select value={stage} onChange={e => { setStage(e.target.value); setPage(1); }}>
          <option value="">전체</option>{isActivity
            ? [...new Set(activity.map(n => n.targetTab))].map(tab => <option key={tab} value={tab}>{tabs[tab] || tab}</option>)
            : stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>정렬<select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>
          <option value="default">{isActivity ? '최신 알림순' : '긴급도 → 기한순'}</option>
          {isActivity ? <option value="oldest">오래된 알림순</option> : <><option value="asc">MR 번호 오름차순</option><option value="desc">MR 번호 내림차순</option><option value="due">요청 납기일순</option></>}
        </select></label>
        <button className="work-link" onClick={() => { setQuery(''); setStage(''); setSort('default'); setPage(1); }}>필터 초기화</button>
      </div>
      {isActivity ? <section className="work-section">{activityList(filteredActivity.slice(start, start + 25))}</section>
        : <TaskSection bucket={listView} tasks={filtered.slice(start, start + 25)} totalCount={total} onOpenTask={onOpenTask} progress={progress} fullList />}
      <nav className="work-pagination" aria-label="목록 페이지"><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>이전</button>
        <span>{currentPage} / {pages} · 페이지당 25건</span><button disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>다음</button></nav>
    </div>;
  }
  return <div className="work-dashboard" id="dashboard-view-top" tabIndex={-1}>
    <div className="work-intro"><div><span className="work-eyebrow">WORK OVERVIEW</span><p>필요한 결정은 한곳에서, 진행 상황은 한눈에.</p></div>
      <button className="work-link" onClick={() => setCurrentTab('mr-list')}>전체 구매 현황 <ArrowRight size={16} /></button></div>
    {progress && <section className="work-live-strip" aria-label="진행 현황 동기화">
      <div><strong>구매 작업 현황</strong><span>처리 상태 {requests.filter(r => r.workflowStatus === 'RUNNING').length}건 · 실행 대기 {requests.filter(r => r.workflowStatus === 'QUEUED').length}건</span></div>
      <div><span>{progress.error || (progress.checkedAt ? `마지막 확인 ${new Date(progress.checkedAt).toLocaleTimeString('ko-KR')}` : '진행 현황 연결 중')}{progress.truncated ? ' · 최근 200건 기준' : ''}</span>
        <button type="button" className="work-link" onClick={progress.refresh}>현황 새로고침</button></div>
    </section>}
    <section className="work-today" aria-label="오늘의 한 줄">
      <div><span className="work-eyebrow">오늘의 한 줄</span>
        <h1>{firstTask ? `지금 우선 확인할 작업은 ${needsAttention.length}건입니다.` : tasks.length ? '지금 필요한 결정은 모두 처리됐습니다.' : '모든 작업이 처리됐습니다.'}</h1>
        <p>{firstTask ? <><strong>{firstTask.request.mrNo}</strong> — {firstTask.urgencyLabel} · {firstTask.deadlineLabel} · {firstTask.label}</> : tasks.length ? `${tasks.length}건의 처리 또는 외부 응답을 기다리고 있습니다.` : <><CircleCheck size={16} /> 새로운 요청이 들어오면 이곳에서 안내합니다.</>}</p>
        <small>막힌 작업 → 내가 결정할 작업 → 처리 중 · 대기 · 각 목록 안에서는 급한 기한순</small>
      </div>
      {firstTask && <button className="work-open" onClick={() => onOpenTask(firstTask.tab, firstTask.request.mrNo)}>바로 열기 <ArrowRight size={15} /></button>}
    </section>
    {!!groups.blocked.length && <TaskSection bucket="blocked" tasks={groups.blocked} onOpenTask={onOpenTask} progress={progress} onMore={() => openList('blocked')} />}
    <TaskSection bucket="attention" tasks={groups.attention} onOpenTask={onOpenTask} progress={progress} onMore={() => openList('attention')} />
    <div className="work-columns"><TaskSection bucket="processing" tasks={groups.processing} onOpenTask={onOpenTask} progress={progress} onMore={() => openList('processing')} />
      <TaskSection bucket="waiting" tasks={groups.waiting} onOpenTask={onOpenTask} progress={progress} onMore={() => openList('waiting')} /></div>
    {!!groups.other.length && <TaskSection bucket="other" tasks={groups.other} onOpenTask={onOpenTask} progress={progress} onMore={() => openList('other')} />}
    <section className="work-section" aria-labelledby="work-activity-title"><header className="work-section-header">
      <h2 id="work-activity-title"><Activity size={18} />최근 처리 알림</h2>
      <button className="work-link" onClick={() => openList('activity')}>더보기 <ArrowRight size={15} /></button>
    </header>{activityList(activity.slice(0,3))}</section>
  </div>;
}
