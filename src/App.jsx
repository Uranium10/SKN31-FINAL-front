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
import AssistantController from './components/assistant/AssistantController';
import { assistantNavigationCommand } from './components/assistant/assistantNavigation';
import ProcurementWorkspace from './procurement/ProcurementWorkspace';

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

  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantCommand, setAssistantCommand] = useState(null);
  const [assistantContext, setAssistantContext] = useState(defaultWorkspaceContext);

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

  const handleAssistantAction = useCallback((action) => {
    // Treat model-assisted output as untrusted at the UI boundary too. Only
    // known BiddingFlow tabs can become navigation commands.
    const command = assistantNavigationCommand(action);
    if (!command) return;
    setAssistantCommand({
      id: Date.now(),
      ...command,
    });
  }, []);

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
          <AssistantController
            key={currentUser?.id || currentUser?.email || 'authenticated'}
            isOpen={assistantOpen}
            setIsOpen={setAssistantOpen}
            onAction={handleAssistantAction}
            context={assistantContext}
          />
        </>
      )}
    </>
  );
}

export default App;
