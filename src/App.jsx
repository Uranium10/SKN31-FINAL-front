import React, { useCallback, useEffect, useState } from 'react';
import './index.css';
import {
  clearTokens,
  fetchWithAuth,
  getAccessToken,
  getCurrentUser,
  logoutSession,
  setTokens,
} from './utils/auth';

import WaveTransition from './components/common/WaveTransition';
import LoginPage from './components/auth/LoginPage';
import AssistantDock from './components/assistant/AssistantDock';
import { sendAssistantMessage } from './components/assistant/assistantApi';
import ProcurementWorkspace from './procurement/ProcurementWorkspace';

const initialHelpSessions = [
  {
    id: 'help-session-1',
    title: '구매 업무 화면 안내',
    createdAt: '2026-08-28',
    messages: [
      {
        sender: 'agent',
        text: '구매 업무 화면의 기능과 진행 단계를 안내해 드립니다. MR 승인, 아이템 등록, 협력사 선정, PO 관리 화면으로 이동할 수도 있습니다.',
      },
    ],
  },
];

const defaultWorkspaceContext = {
  currentTab: 'dashboard',
  eyebrow: 'PURCHASE OPERATIONS',
  title: '구매 대시보드',
  detail: '승인 대기, 견적 회신, 협력사 승인과 PO 생성 현황을 확인합니다.',
};

export function App() {
  const [authState, setAuthState] = useState(getAccessToken() ? 'checking' : 'guest');
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isWiping, setIsWiping] = useState(false);

  // Conversation display state stays in the browser. Procurement facts are
  // fetched afresh by the authenticated backend for every assistant turn.
  const [sessions, setSessions] = useState(initialHelpSessions);
  const [activeSessionId, setActiveSessionId] = useState(initialHelpSessions[0].id);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantCommand, setAssistantCommand] = useState(null);
  const [assistantContext, setAssistantContext] = useState(defaultWorkspaceContext);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      setAuthState('guest');
      return undefined;
    }

    let cancelled = false;

    const restoreSession = async () => {
      try {
        const response = await fetchWithAuth('/api/me');
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success || !data.user) {
          throw new Error(data.detail || '세션을 확인할 수 없습니다.');
        }

        if (!cancelled) {
          setTokens(getAccessToken(), null, data.user);
          setCurrentUser(getCurrentUser());
          setAuthState('authenticated');
        }
      } catch {
        if (!cancelled) {
          clearTokens();
          setCurrentUser(null);
          setAuthState('guest');
        }
      }
    };

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('ERPNext 계정 ID와 비밀번호를 모두 입력해 주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.detail || '로그인에 실패했습니다.');
      }

      setTokens(data.access_token, data.refresh_token, data.user);
      setCurrentUser(getCurrentUser());
      setIsWiping(true);

      window.setTimeout(() => setAuthState('authenticated'), 450);
      window.setTimeout(() => setIsWiping(false), 1100);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '서버와 통신할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = useCallback(async () => {
    await logoutSession().catch(() => {});
    setAuthState('guest');
    setCurrentUser(null);
    setEmail('');
    setPassword('');
    setAssistantOpen(false);
  }, []);

  const currentSession = sessions.find((session) => session.id === activeSessionId) || sessions[0];

  const handleCreateNewSession = () => {
    const newSession = {
      id: `help-session-${Date.now()}`,
      title: '새 도움말 대화',
      createdAt: new Date().toISOString().slice(0, 10),
      messages: [],
    };
    setSessions((previous) => [newSession, ...previous]);
    setActiveSessionId(newSession.id);
    setInput('');
  };

  const handleAssistantAction = useCallback((action) => {
    // Treat model-assisted output as untrusted at the UI boundary too. Only
    // known BiddingFlow tabs can become navigation commands.
    const allowedTargets = new Set([
      'dashboard', 'item-register', 'mr-list', 'vendor-select', 'po-manage',
    ]);
    if (!action || !allowedTargets.has(action.target)) return;
    setAssistantCommand({
      id: Date.now(),
      type: 'navigate',
      value: action.target,
      searchQuery: action.search_query || action.highlight_reference || '',
    });
  }, []);

  const handleSendMessage = async (customText = null) => {
    const messageText = (customText || input).trim();
    if (!messageText || sending) return;

    // Capture the target session before awaiting the API so a new chat opened
    // in the meantime does not receive the previous request's answer.
    const targetSessionId = activeSessionId;
    const userMessage = { sender: 'user', text: messageText };
    const conversation = (currentSession?.messages || []).slice(-8).map((message) => ({
      role: message.sender === 'user' ? 'user' : 'assistant',
      content: message.text,
    }));

    setInput('');
    setSending(true);
    setSessions((previous) => previous.map((session) => (
      session.id === targetSessionId
        ? {
            ...session,
            title: session.messages.length === 0
              ? `${messageText.slice(0, 22)}${messageText.length > 22 ? '…' : ''}`
              : session.title,
            messages: [...session.messages, userMessage],
          }
        : session
    )));

    try {
      // The backend decides whether this is feature guidance, help search, or
      // a permission-scoped MR lookup. The frontend only renders its contract.
      const response = await sendAssistantMessage({
        message: messageText,
        context: {
          current_tab: assistantContext.currentTab || 'dashboard',
          title: assistantContext.title,
          detail: assistantContext.detail,
        },
        conversation,
      });
      setSessions((previous) => previous.map((session) => (
        session.id === targetSessionId
          ? {
              ...session,
              messages: [...session.messages, {
                sender: 'agent',
                text: response.answer,
                response,
              }],
            }
          : session
      )));
    } catch (assistantError) {
      const responseText = assistantError instanceof Error
        ? assistantError.message
        : '업무 안내 응답을 불러오지 못했습니다.';
      setSessions((previous) => previous.map((session) => (
        session.id === targetSessionId
          ? { ...session, messages: [...session.messages, { sender: 'agent', text: responseText, isError: true }] }
          : session
      )));
    } finally {
      setSending(false);
    }
  };

  if (authState === 'checking') {
    return (
      <div className="session-loading-page" role="status" aria-live="polite">
        <div className="session-loading-mark" />
        <strong>BiddingFlow</strong>
        <span>ERPNext 로그인 세션을 확인하고 있습니다.</span>
      </div>
    );
  }

  return (
    <>
      {isWiping && <WaveTransition />}

      {authState === 'guest' ? (
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
        <>
          <ProcurementWorkspace
            currentUser={currentUser}
            onLogout={handleLogout}
            assistantCommand={assistantCommand}
            onAssistantContextChange={setAssistantContext}
          />
          <AssistantDock
            isOpen={assistantOpen}
            setIsOpen={setAssistantOpen}
            currentSession={currentSession}
            sending={sending}
            input={input}
            setInput={setInput}
            onSend={handleSendMessage}
            onNewSession={handleCreateNewSession}
            onAction={handleAssistantAction}
            context={assistantContext}
          />
        </>
      )}
    </>
  );
}

export default App;
