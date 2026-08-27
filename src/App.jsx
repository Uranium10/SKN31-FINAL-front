import React, { useState } from 'react';
import './index.css';
import { getAccessToken, getCurrentUser, setTokens, logoutSession } from './utils/auth';

import WaveTransition from './components/common/WaveTransition';
import LoginPage from './components/auth/LoginPage';
import Sidebar from './components/sidebar/Sidebar';
import AssistantDock from './components/assistant/AssistantDock';
import SchedulerDashboard from './components/scheduler/SchedulerDashboard';
import OperationsWorkspace from './components/operations/OperationsWorkspace';

const initialSessions = [
  {
    id: 'session-1',
    title: '통합 작업함 사용 방법',
    createdAt: '2026-08-18',
    messages: [
      { sender: 'user', text: '통합 작업함에서는 무엇을 할 수 있어?' },
      { sender: 'agent', text: 'ERPNext에서 수신한 구매 요청을 한 곳에서 확인할 수 있습니다.\n- 작업 카드를 누르면 전체 자동화 단계를 펼칠 수 있습니다.\n- 열기를 누르면 현재 단계와 필요한 입력 폼을 확인할 수 있습니다.\n- 완료된 작업은 회색으로 구분되며 실행 이력은 계속 열람할 수 있습니다.' }
    ]
  },
  {
    id: 'session-2',
    title: '자동화와 사용자 확인 안내',
    createdAt: '2026-08-17',
    messages: [
      { sender: 'user', text: '자동화가 멈추고 내 확인을 요청하는 경우를 알려줘.' },
      { sender: 'agent', text: '정보가 모호하거나 최종 판단이 필요한 단계에서는 자동화가 안전하게 일시정지됩니다. 통합 작업함의 ‘확인 필요’ 상태에서 해당 작업을 열고, 제공된 폼으로 값을 확정하면 다음 단계가 이어집니다.' }
    ]
  }
];

const initialPipelines = [
  {
    id: 'pipe-1',
    name: 'ERP 구매요청서(MR) 감시자',
    desc: '신규 구매요청서 실시간 감지 -> 창고 재고 파악 -> 대체품 탐색 -> RFQ 자동 발행',
    interval: 'INTERVAL: 5m',
    cron: 'CRON: */5 * * * *',
    active: true,
    lastRun: '1분 전 완료'
  },
  {
    id: 'pipe-2',
    name: '원자재 시장 시세 벤치마킹',
    desc: 'Tavily 웹 검색 및 ERP 통계 기반 주요 품목 시장 가격 변동 추이 모니터링',
    interval: 'DAILY: 09:00',
    cron: 'CRON: 0 9 * * *',
    active: true,
    lastRun: '오늘 09:00 완료'
  },
  {
    id: 'pipe-3',
    name: '소액 긴급 구매 Auto-Pilot',
    desc: '품목 단가 50만원 미만 & 과거 거래처 3회 이상 이력 시 즉시 PO 자동 승인 및 발주',
    interval: 'EVENT TRIGGER',
    cron: 'THRESHOLD < 500K',
    active: false,
    lastRun: '어제 16:30 완료'
  }
];

const initialApprovals = [
  {
    id: 'appr-1',
    itemCode: 'SF-001 안전모 50개',
    reason: 'PRICE SURGE +18.0%',
    detail: '과거 기준 단가 15,000원 -> 신규 견적 17,700원 (+18.0%). 단가 급등으로 인해 자동 발주가 일시 중단되었습니다. 발주를 승인하시겠습니까?'
  },
  {
    id: 'appr-2',
    itemCode: '3M 방진마스크 200개',
    reason: 'ALTERNATIVE VENDOR',
    detail: '기존 공급처 품절 감지. 검증된 대체 공급사(납기 2일 단축, 동일 단가)로 자동 전환 대기 중입니다.'
  }
];

export function App() {
  const [token, setTokenState] = useState(getAccessToken());
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isWiping, setIsWiping] = useState(false);

  // 도움말은 전역 플로팅 코파일럿으로 제공하고, 기본 워크스페이스는 두 개만 유지합니다.
  // Workspace Mode: 'scheduler' | 'operations'
  const [currentMode, setCurrentMode] = useState('operations'); // Default to 'operations' to showcase new tab immediately
  const [operationCounts, setOperationCounts] = useState({ total: 4, needsAction: 1, waiting: 1 });

  // Global assistant state
  const [sessions, setSessions] = useState(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState('session-1');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantCommand, setAssistantCommand] = useState(null);
  const [operationsContext, setOperationsContext] = useState({
    eyebrow: 'PURCHASE OPERATIONS',
    title: '통합 작업함',
    detail: '수신된 구매 작업과 사용자 개입 상태를 확인합니다.',
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // Flow Scheduler State
  const [pipelines, setPipelines] = useState(initialPipelines);
  const [approvals, setApprovals] = useState(initialApprovals);
  const [logs, setLogs] = useState([
    { time: '17:34:10', tag: 'info', msg: '[MR Watcher] Polling ERPNext pending Material Requests...' },
    { time: '17:34:12', tag: 'node', msg: 'check_stock_node: Stock checked (Item: SF-001, InStock: 12, Shortage: 38)' },
    { time: '17:34:14', tag: 'warn', msg: 'human_interaction_node: Triggered INTERRUPT (Price variation > 15%)' },
    { time: '17:34:15', tag: 'success', msg: 'Checkpoint saved in SqliteSaver. Awaiting Human Review.' }
  ]);

  const currentSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const assistantContext = currentMode === 'scheduler'
    ? { eyebrow: 'FLOW SCHEDULER', title: '자동화 파이프라인', detail: `${pipelines.length}개 파이프라인 · 승인 대기 ${approvals.length}건` }
    : operationsContext;

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setTokens(data.access_token, data.refresh_token, data.user);
        setCurrentUser(getCurrentUser());
        setIsWiping(true);

        setTimeout(() => {
          setTokenState(data.access_token);
        }, 550);

        setTimeout(() => {
          setIsWiping(false);
        }, 1300);
      } else {
        setError(data.message || data.detail || '로그인에 실패했습니다. 계정 정보를 확인해주세요.');
      }
    } catch {
      setError('서버와 통신할 수 없습니다. 백엔드 서버 상태를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewSession = () => {
    const newId = `session-${Date.now()}`;
    const newSession = {
      id: newId,
      title: '새 도움말 대화',
      createdAt: new Date().toISOString().split('T')[0],
      messages: []
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newId);
    setInput('');
    setAssistantOpen(true);
  };

  const handleSendMessage = async (customText = null) => {
    const messageText = (customText || input).trim();
    if (!messageText || sending) return;

    setInput('');
    setSending(true);

    const userMsg = { sender: 'user', text: messageText };
    const updatedMessages = [...(currentSession?.messages || []), userMsg];

    const updatedTitle = (currentSession?.messages.length === 0 || currentSession?.title === '새 도움말 대화')
      ? (messageText.length > 18 ? messageText.slice(0, 18) + '...' : messageText)
      : currentSession.title;

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? { ...s, title: updatedTitle, messages: updatedMessages }
          : s
      )
    );

    const normalizedQuestion = messageText.toLowerCase();
    let guideText = 'BiddingFlow는 ERPNext의 구매 요청을 감지해 재고 확인, 대체품 검토, 공급사 탐색, RFQ, 견적 비교, 승인과 발주 단계를 이어서 관리합니다. 화면 이동이나 작업 필터링도 요청할 수 있습니다.';
    if (/(내\s*(승인|확인).*필요|개입\s*필요)/i.test(normalizedQuestion)) {
      setCurrentMode('operations');
      setAssistantCommand({ id: Date.now(), type: 'set_attention_filter', value: 'required' });
      guideText = '구매 작업으로 이동해 지금 사용자의 승인이 필요한 작업만 표시했습니다. 빨간 상태점이 있는 작업부터 확인해 주세요.';
    } else if (/검토\s*권고/i.test(normalizedQuestion)) {
      setCurrentMode('operations');
      setAssistantCommand({ id: Date.now(), type: 'set_attention_filter', value: 'recommended' });
      guideText = '구매 작업으로 이동해 검토가 권고된 작업만 표시했습니다. 즉시 중단된 작업은 아니지만 조건을 살펴보는 편이 좋습니다.';
    } else if (/정상\s*진행/i.test(normalizedQuestion)) {
      setCurrentMode('operations');
      setAssistantCommand({ id: Date.now(), type: 'set_attention_filter', value: 'normal' });
      guideText = '자동화가 정상적으로 진행 중이거나 외부 응답을 기다리는 작업만 표시했습니다.';
    } else if (/(전체\s*작업).*(보여|열|필터|이동)?/i.test(normalizedQuestion)) {
      setCurrentMode('operations');
      setAssistantCommand({ id: Date.now(), type: 'set_attention_filter', value: 'all' });
      guideText = '통합 작업함의 필터를 초기화하고 전체 작업을 표시했습니다.';
    } else if (/(스케줄|scheduler|파이프라인).*(열|보여|이동)/i.test(normalizedQuestion)) {
      setCurrentMode('scheduler');
      guideText = 'Flow Scheduler로 이동했습니다. 파이프라인 상태와 실행 기록, 승인 대기 항목을 확인할 수 있습니다.';
    } else if (/(작업함|구매\s*작업).*(열|보여|이동)/i.test(normalizedQuestion)) {
      setCurrentMode('operations');
      guideText = '통합 작업함으로 이동했습니다. 상단 개입 상태 필터로 우선 확인할 작업을 좁힐 수 있습니다.';
    } else if (/현재\s*(화면|작업)/i.test(normalizedQuestion)) {
      guideText = `현재 보고 있는 곳은 '${assistantContext.title}'입니다. ${assistantContext.detail || ''}`.trim();
    } else if (/(작업함|작업 목록|mr)/i.test(normalizedQuestion)) {
      guideText = '통합 작업함에는 ERPNext에서 수신한 모든 MR이 표시됩니다. 카드를 누르면 현재 단계 주변의 워크플로를 펼칠 수 있고, ‘열기’를 누르면 필요한 입력과 자동화 이력을 확인할 수 있습니다.';
    } else if (/(확인|인터럽트|폼|중단|멈)/i.test(normalizedQuestion)) {
      guideText = '자동화 도중 모호한 정보나 사람의 판단이 필요하면 작업 상태가 ‘확인 필요’로 바뀝니다. 해당 작업을 열어 폼의 표준값을 확인한 뒤 재개하거나 요청자에게 보완을 요청할 수 있습니다.';
    } else if (/(알림|벨|토스트)/i.test(normalizedQuestion)) {
      guideText = '우측 상단 알림에는 견적 도착, 사용자 확인 필요, 발주 완료 같은 상태 변화가 쌓입니다. 알림을 누르면 관련 작업으로 바로 이동합니다.';
    } else if (/(스케줄|scheduler|파이프라인)/i.test(normalizedQuestion)) {
      guideText = 'Flow Scheduler에서는 반복 실행하거나 감시할 자동화 파이프라인의 상태와 실행 기록을 확인합니다. 상단의 Flow Scheduler 탭에서 이동할 수 있습니다.';
    } else if (/(rfq|견적|공급사|발주|po)/i.test(normalizedQuestion)) {
      guideText = '구매 작업은 공급사 후보 탐색과 RFQ 발송, 견적 회신 대기, 비교 추천, 담당자 최종 승인, PO 발주 순으로 이어집니다. 자동화는 추천까지만 수행하며 최종 선택은 사용자가 결정합니다.';
    }

    setTimeout(() => {
      const agentMsg = { sender: 'agent', text: guideText };
      setSessions((prev) => prev.map((session) => session.id === activeSessionId
        ? { ...session, messages: [...updatedMessages, agentMsg] }
        : session));
      setSending(false);
    }, 450);
  };

  const handleTogglePipeline = (pipeId) => {
    setPipelines((prev) =>
      prev.map((p) => {
        if (p.id === pipeId) {
          const newActive = !p.active;
          const timeStr = new Date().toTimeString().split(' ')[0];
          setLogs((l) => [
            ...l,
            { time: timeStr, tag: 'info', msg: `[Scheduler] Pipeline "${p.name}" status -> ${newActive ? 'ACTIVE' : 'IDLE'}.` }
          ]);
          return { ...p, active: newActive };
        }
        return p;
      })
    );
  };

  const handleRunNow = (pipe) => {
    const timeStr = new Date().toTimeString().split(' ')[0];
    setLogs((l) => [
      ...l,
      { time: timeStr, tag: 'node', msg: `[Manual Trigger] Executing pipeline "${pipe.name}"...` },
      { time: timeStr, tag: 'success', msg: `[Pipeline] LangGraph nodes compiled and executed successfully.` }
    ]);
  };

  const handleResolveApproval = (apprId, approved) => {
    const target = approvals.find((a) => a.id === apprId);
    setApprovals((prev) => prev.filter((a) => a.id !== apprId));
    const timeStr = new Date().toTimeString().split(' ')[0];
    setLogs((l) => [
      ...l,
      {
        time: timeStr,
        tag: approved ? 'success' : 'warn',
        msg: `[HITL Decision] "${target?.itemCode}" was ${approved ? 'APPROVED -> Auto-generating RFQ/PO' : 'REJECTED -> Halted'}.`
      }
    ]);
  };

  const handleLogout = async () => {
    await logoutSession().catch(() => {});
    setTokenState(null);
    setCurrentUser(null);
    setEmail('');
    setPassword('');
  };

  return (
    <>
      {isWiping && <WaveTransition />}

      {!token ? (
        <LoginPage
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          loading={loading}
          error={error}
          handleLogin={handleLogin}
        />
      ) : (
        <div className={`gemini-container ${assistantOpen ? 'assistant-is-open' : ''}`}>
          <Sidebar
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
            currentMode={currentMode}
            pipelinesCount={pipelines.length}
            approvalsCount={approvals.length}
            operationCounts={operationCounts}
            currentUser={currentUser}
            handleLogout={handleLogout}
          />

          <main className="gemini-main">
            {/* Primary workspaces. The assistant is available globally at bottom-right. */}
            <div className="main-topbar">
              <div className="mode-switcher-group">
                <button
                  className={`mode-tab-btn ${currentMode === 'scheduler' ? 'active' : ''}`}
                  onClick={() => setCurrentMode('scheduler')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>Flow Scheduler</span>
                </button>
                <button
                  className={`mode-tab-btn ${currentMode === 'operations' ? 'active' : ''}`}
                  onClick={() => setCurrentMode('operations')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                  <span>구매 작업</span>
                </button>
              </div>

              <div className="live-status-pill">
                <div className="status-dot" />
                <span>ERP 연결됨</span>
              </div>
            </div>

            {/* Mode Content Views */}
            {currentMode === 'scheduler' ? (
              <SchedulerDashboard
                pipelines={pipelines}
                approvals={approvals}
                logs={logs}
                handleTogglePipeline={handleTogglePipeline}
                handleRunNow={handleRunNow}
                handleResolveApproval={handleResolveApproval}
              />
            ) : (
              <OperationsWorkspace
                currentUser={currentUser}
                onCountsChange={setOperationCounts}
                assistantCommand={assistantCommand}
                onAssistantContextChange={setOperationsContext}
              />
            )}
          </main>
          <AssistantDock
            isOpen={assistantOpen}
            setIsOpen={setAssistantOpen}
            currentSession={currentSession}
            sending={sending}
            input={input}
            setInput={setInput}
            onSend={handleSendMessage}
            onNewSession={handleCreateNewSession}
            context={assistantContext}
          />
        </div>
      )}
    </>
  );
}

export default App;
