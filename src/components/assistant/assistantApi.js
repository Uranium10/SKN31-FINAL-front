import { fetchWithAuth } from '../../utils/auth';

const readError = async (response) => {
  const payload = await response.json().catch(() => ({}));
  return payload.detail || payload.message || '업무 안내 응답을 불러오지 못했습니다.';
};

export const sendAssistantMessage = async ({ message, context, conversation, dialogue, sessionId, sessionVersion, signal }) => {
  // Reuse the normal session-refresh wrapper. The assistant endpoint returns
  // server-validated navigation targets, not arbitrary URLs or mutation calls.
  const response = await fetchWithAuth('/api/assistant/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context, conversation, dialogue, session_id: sessionId, session_version: sessionVersion }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
};

const sessionRequest = async (path = '', options = {}) => {
  const response = await fetchWithAuth(`/api/assistant/sessions${path}`, options);
  if (options.method === 'DELETE' && response.status === 404) return null;
  if (!response.ok) throw new Error(await readError(response));
  return response.status === 204 ? null : response.json();
};
export const listAssistantSessions = (signal) => sessionRequest('', { signal });
export const getAssistantSession = (id, signal) => sessionRequest(`/${encodeURIComponent(id)}`, { signal });
export const createAssistantSession = (id, signal) => sessionRequest('', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), signal,
});
export const deleteAssistantSession = (id, signal) => sessionRequest(`/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
