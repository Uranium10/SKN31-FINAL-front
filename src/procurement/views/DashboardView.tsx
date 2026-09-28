import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ClipboardCheck, Cpu, Hourglass, FileText, Activity, CircleCheck } from 'lucide-react';
import type { MaterialRequest, NavigationTab, POItem, ProcurementNotification } from '../types';
import { dashboardTasks, issuedPurchaseOrders } from '../utils/dashboardTasks';
import type { DashboardTask, TaskBucket } from '../utils/dashboardTasks';
import './DashboardView.css';

interface DashboardViewProps {
  requests: MaterialRequest[];
  poItems?: POItem[];
  notifications?: ProcurementNotification[];
  setCurrentTab: (tab: NavigationTab) => void;
  onOpenTask: (tab: NavigationTab, mrNo: string) => void;
}
const groupInfo = {
  attention: { title: '지금 확인해야 할 작업', icon: ClipboardCheck, empty: '지금 확인할 작업이 없습니다.' },
  processing: { title: 'AI · 시스템이 처리 중이에요', icon: Cpu, empty: '현재 실행 중인 작업이 없습니다.' },
  waiting: { title: '외부 응답 · 입고를 기다려요', icon: Hourglass, empty: '외부 응답을 기다리는 작업이 없습니다.' },
  other: { title: '그 밖의 진행 작업', icon: FileText, empty: '추가 작업이 없습니다.' },
};

function TaskSection({ bucket, tasks, onOpenTask }: {
  bucket: TaskBucket; tasks: DashboardTask[]; onOpenTask: DashboardViewProps['onOpenTask'];
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
      {visible.map(({ request, label, detail, tab }) => <article className="work-task" key={request.mrNo}>
        <button type="button" className="work-task-main work-task-link" onClick={() => onOpenTask(tab, request.mrNo)} aria-label={`${request.mrNo} ${label} 작업 열기`}>
          <span className="work-stage">{label}</span>
          <span className="work-item"><strong>{request.itemName}</strong><span>{request.mrNo}</span></span>
          <span className="work-task-description">{detail}</span><ArrowRight className="work-task-arrow" size={16} aria-hidden="true" />
        </button>
        <details className="work-detail">
          <summary>상세 정보 <ChevronDown size={14} /></summary>
          <dl><div><dt>요청부서 · 요청자</dt><dd>{request.department} · {request.requester}</dd></div>
            <div><dt>요청 납기일</dt><dd>{request.dueDate || '미지정'}</dd></div>
            <div><dt>품목 코드</dt><dd>{request.itemCode}</dd></div>
            <div><dt>요청 금액</dt><dd>₩{request.totalPrice.toLocaleString()}</dd></div></dl>
          <button className="work-open" onClick={() => onOpenTask(tab, request.mrNo)}>해당 작업 열기 <ArrowRight size={14} /></button>
        </details>
      </article>)}
      {!tasks.length && <div className="work-empty"><CircleCheck size={20} /><span>{group.empty}</span></div>}
    </div>
  </section>;
}

export function DashboardView({ requests, poItems = [], notifications = [], setCurrentTab, onOpenTask }: DashboardViewProps) {
  const tasks = useMemo(() => dashboardTasks(requests), [requests]);
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
    <div className="work-kpis">
      {(['attention', 'processing', 'waiting'] as const).map(key => {
        const Icon = groupInfo[key].icon;
        return <button key={key} className={`work-kpi work-kpi-${key}`} onClick={() => document.getElementById(`work-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <span className="work-kpi-icon"><Icon size={23} /></span><span><span className="work-kpi-label">{key === 'attention' ? '사람 확인 필요' : key === 'processing' ? 'AI · 시스템 처리 중' : '외부 응답 · 입고 대기'}</span>
            <strong>{groups[key].length}<small>건</small></strong><span className="work-kpi-caption">{key === 'attention' ? '검토 · 선택 · 예외 확인' : key === 'processing' ? '실행 중 또는 실행 대기' : '공급사 · 요청부서 · 입고'}</span></span>
        </button>;
      })}
      <button className="work-kpi" onClick={() => setCurrentTab('po-manage')}><span className="work-kpi-icon"><FileText size={23} /></span>
        <span><span className="work-kpi-label">발행 PO 금액</span><strong className="work-amount">₩{issued.reduce((sum,p) => sum + p.totalAmount, 0).toLocaleString()}</strong><span className="work-kpi-caption">조회된 발주서 {issued.length}건 기준</span></span></button>
    </div>
    <TaskSection bucket="attention" tasks={groups.attention} onOpenTask={onOpenTask} />
    <div className="work-columns"><TaskSection bucket="processing" tasks={groups.processing} onOpenTask={onOpenTask} />
      <TaskSection bucket="waiting" tasks={groups.waiting} onOpenTask={onOpenTask} /></div>
    {!!groups.other.length && <TaskSection bucket="other" tasks={groups.other} onOpenTask={onOpenTask} />}
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
