import React, { useState } from 'react';
import './index.css';
import { getAccessToken, setTokens, clearTokens, fetchWithAuth } from './utils/auth';

import WaveTransition from './components/common/WaveTransition';
import LoginPage from './components/auth/LoginPage';
import Sidebar from './components/sidebar/Sidebar';
import ChatWorkspace from './components/chat/ChatWorkspace';
import SchedulerDashboard from './components/scheduler/SchedulerDashboard';
import OperationsWorkspace from './components/operations/OperationsWorkspace';

const initialSessions = [
  {
    id: 'session-1',
    title: 'SF-001 안전모 50개 재고 확인',
    createdAt: '2026-08-18',
    messages: [
      { sender: 'user', text: 'SF-001 안전모 50개 재고 확인 및 구매 요청 현황 알려줘.' },
      { sender: 'agent', text: 'ERPNext 창고 재고 확인 결과:\n- 현재 창고 수량: 12개\n- 부족 수량: 38개\n- 승인 대기 중인 구매 요청서(MR-2026-003)가 확인되었습니다. 최적 공급사 단가 비교를 시작할까요?' }
    ]
  },
  {
    id: 'session-2',
    title: '3M 방진마스크 대체품 견적 비교',
    createdAt: '2026-08-17',
    messages: [
      { sender: 'user', text: '기존 방진마스크 공급사 납기가 지연되는데 대체 공급업체 있어?' },
      { sender: 'agent', text: 'Tavily 시장 조사 및 ERP 과거 이력 분석 결과:\n- [공급사 A] 단가 1,200원 / 납기 2일\n- [공급사 B] 단가 1,150원 / 납기 3일\n공급사 A가 긴급 납기에 적합합니다.' }
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isWiping, setIsWiping] = useState(false);

  // Workspace Mode: 'chat' | 'scheduler' | 'operations'
  const [currentMode, setCurrentMode] = useState('operations'); // Default to 'operations' to showcase new tab immediately

  // Chat State
  const [sessions, setSessions] = useState(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState('session-1');
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

      if (data.success) {
        setTokens(data.access_token, data.refresh_token);
        setIsWiping(true);

        setTimeout(() => {
          setTokenState(data.access_token);
        }, 550);

        setTimeout(() => {
          setIsWiping(false);
        }, 1300);
      } else {
        setError(data.message || '로그인에 실패했습니다. 계정 정보를 확인해주세요.');
      }
    } catch (err) {
      setError('서버와 통신할 수 없습니다. 백엔드 서버 상태를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewSession = () => {
    const newId = `session-${Date.now()}`;
    const newSession = {
      id: newId,
      title: '새로운 구매 대화',
      createdAt: new Date().toISOString().split('T')[0],
      messages: []
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newId);
    setInput('');
    setCurrentMode('chat');
  };

  const handleDeleteSession = (sessionId, e) => {
    e.stopPropagation();
    const filtered = sessions.filter((s) => s.id !== sessionId);
    setSessions(filtered);
    if (activeSessionId === sessionId) {
      if (filtered.length > 0) {
        setActiveSessionId(filtered[0].id);
      } else {
        handleCreateNewSession();
      }
    }
  };

  const handleSendMessage = async (customText = null) => {
    const messageText = (customText || input).trim();
    if (!messageText || sending) return;

    setInput('');
    setSending(true);

    const userMsg = { sender: 'user', text: messageText };
    const updatedMessages = [...(currentSession?.messages || []), userMsg];

    const updatedTitle = (currentSession?.messages.length === 0 || currentSession?.title === '새로운 구매 대화')
      ? (messageText.length > 18 ? messageText.slice(0, 18) + '...' : messageText)
      : currentSession.title;

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? { ...s, title: updatedTitle, messages: updatedMessages }
          : s
      )
    );

    try {
      const res = await fetchWithAuth('/api/health');
      if (res.ok) {
        setTimeout(() => {
          const agentMsg = {
            sender: 'agent',
            text: `"${messageText}" 요청을 접수했습니다. ERP 재고 확인 및 자율 구매 파이프라인 분석을 진행 중입니다.`
          };
          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeSessionId
                ? { ...s, messages: [...updatedMessages, agentMsg] }
                : s
            )
          );
          setSending(false);
        }, 600);
      }
    } catch (err) {
      setTimeout(() => {
        const errorMsg = { sender: 'agent', text: '서버와 통신 중 오류가 발생했습니다.' };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? { ...s, messages: [...updatedMessages, errorMsg] }
              : s
          )
        );
        setSending(false);
      }, 400);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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

  const handleNavigateToChat = (promptTitle) => {
    handleCreateNewSession();
    setTimeout(() => {
      handleSendMessage(`${promptTitle} 진행 현황 및 상세 분석 요청`);
    }, 100);
  };

  const handleLogout = () => {
    clearTokens();
    setTokenState(null);
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
        <div className="gemini-container">
          <Sidebar
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
            currentMode={currentMode}
            setCurrentMode={setCurrentMode}
            sessions={sessions}
            activeSessionId={activeSessionId}
            setActiveSessionId={setActiveSessionId}
            handleCreateNewSession={handleCreateNewSession}
            handleDeleteSession={handleDeleteSession}
            pipelinesCount={pipelines.length}
            approvalsCount={approvals.length}
            handleLogout={handleLogout}
          />

          <main className="gemini-main">
            {/* Topbar Mode Switcher with 3 Tabs */}
            <div className="main-topbar">
              <div className="mode-switcher-group">
                <button
                  className={`mode-tab-btn ${currentMode === 'chat' ? 'active' : ''}`}
                  onClick={() => setCurrentMode('chat')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>대화형 구매 에이전트</span>
                </button>
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
                  <span>작업 (Operations)</span>
                </button>
              </div>

              <div className="live-status-pill">
                <div className="status-dot" />
                <span>ERP SYSTEM CONNECTED</span>
              </div>
            </div>

            {/* Mode Content Views */}
            {currentMode === 'chat' ? (
              <ChatWorkspace
                currentSession={currentSession}
                sending={sending}
                input={input}
                setInput={setInput}
                handleSendMessage={handleSendMessage}
                handleKeyDown={handleKeyDown}
                setCurrentMode={setCurrentMode}
              />
            ) : currentMode === 'scheduler' ? (
              <SchedulerDashboard
                pipelines={pipelines}
                approvals={approvals}
                logs={logs}
                handleTogglePipeline={handleTogglePipeline}
                handleRunNow={handleRunNow}
                handleResolveApproval={handleResolveApproval}
              />
            ) : (
              <OperationsWorkspace onNavigateToChat={handleNavigateToChat} />
            )}
          </main>
        </div>
      )}
    </>
  );
}

export default App;
