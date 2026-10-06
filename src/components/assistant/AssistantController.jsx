import { useEffect, useReducer, useRef, useState } from 'react';
import AssistantDock from './AssistantDock';
import { sendAssistantMessage, listAssistantSessions, getAssistantSession, createAssistantSession, deleteAssistantSession } from './assistantApi';
import { initialSessionState, sessionReducer, MAX_SESSIONS } from './assistantSessions';

// Keyed by authenticated account. All writes target the chat API only.
export default function AssistantController({ isOpen, setIsOpen, context, onAction }) {
  const [state, dispatch] = useReducer(sessionReducer, undefined, initialSessionState);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const pending = useRef(null);
  const navigation = useRef(null);
  const deletion = useRef(null);
  const currentSession = state.sessions.find((session) => session.id === state.activeId);

  const navigate = async (operation) => {
    navigation.current?.abort();
    const controller = new AbortController();
    navigation.current = controller;
    setLoading(true); setError('');
    try {
      const action = await operation(controller.signal);
      if (!controller.signal.aborted) dispatch(action);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '대화를 불러오지 못했습니다.');
    } finally {
      if (navigation.current === controller) {
        navigation.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  };
  const showList = () => {
    dispatch({ type: 'list' });
    void navigate(async signal => ({ type: 'loadList', sessions: (await listAssistantSessions(signal)).sessions }));
  };
  useEffect(() => () => {
    pending.current?.controller.abort(); navigation.current?.abort(); deletion.current?.abort();
    loaded.current = false;
  }, []);
  const loaded = useRef(false);
  useEffect(() => {
    if (isOpen && !loaded.current) {
      loaded.current = true;
      showList();
    }
  }, [isOpen]);

  const remove = async () => {
    if (!deleteTarget || deletion.current) return;
    const id = deleteTarget.id;
    navigation.current?.abort();
    setLoading(false);
    const controller = new AbortController();
    deletion.current = controller;
    setDeleting(true); setError('');
    try {
      await deleteAssistantSession(id, controller.signal);
      if (controller.signal.aborted) return;
      if (pending.current?.id === id) { pending.current.controller.abort(); pending.current = null; }
      dispatch({ type: 'delete', id }); setDeleteTarget(null);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '대화를 삭제하지 못했습니다.');
    } finally {
      deletion.current = null;
      if (!controller.signal.aborted) setDeleting(false);
    }
  };

  const send = async (customText) => {
    const text = (customText || currentSession?.draft || '').trim();
    if (!text || !currentSession || pending.current || loading) return;
    const id = currentSession.id;
    const controller = new AbortController();
    pending.current = { id, controller };
    dispatch({ type: 'send', id, text, at: new Date().toISOString() });
    setError('');
    try {
      const response = await sendAssistantMessage({
        message: text, sessionId: id, sessionVersion: currentSession.version,
        context: { current_tab: context.currentTab || 'dashboard', title: context.title, detail: context.detail },
        signal: controller.signal,
      });
      if (!controller.signal.aborted) dispatch({ type: 'receive', id, text: response.answer, response, at: new Date().toISOString() });
    } catch (err) {
      if (!controller.signal.aborted) dispatch({ type: 'receive', id, text: err instanceof Error ? err.message : '안내 응답을 불러오지 못했습니다.', isError: true, at: new Date().toISOString() });
    } finally {
      if (pending.current?.controller === controller) pending.current = null;
    }
  };

  return <AssistantDock
    isOpen={isOpen} setIsOpen={setIsOpen} context={context} onAction={onAction}
    sessions={state.sessions} currentSession={currentSession}
    sending={Boolean(state.pendingId) || loading} currentSending={Boolean(state.pendingId) && state.pendingId === state.activeId}
    loading={loading} error={error} onRetry={showList}
    onSessionList={showList}
    onSelectSession={(id) => { if (!deleting) void navigate(async signal => ({ type: 'hydrate', session: await getAssistantSession(id, signal) })); }}
    onNewSession={() => { if (!loading) void navigate(async signal => ({ type: 'hydrate', session: await createAssistantSession(crypto.randomUUID(), signal) })); }}
    canCreateSession={!loading && !deleting && state.sessions.length < MAX_SESSIONS}
    onRequestDelete={setDeleteTarget} deleteTarget={deleteTarget} deleting={deleting}
    onCancelDelete={() => { if (!deleting) setDeleteTarget(null); }} onConfirmDelete={remove}
    input={currentSession?.draft || ''}
    setInput={(text) => dispatch({ type: 'draft', id: state.activeId, text })}
    onSend={send}
  />;
}
