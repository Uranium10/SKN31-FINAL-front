import { fetchWithAuth } from '../../utils/auth';

const readError = async (response) => {
  const payload = await response.json().catch(() => ({}));
  return payload.detail || payload.message || '업무 안내 응답을 불러오지 못했습니다.';
};

export const sendAssistantMessage = async ({ message, context, conversation }) => {
  // Reuse the normal session-refresh wrapper. The assistant endpoint returns
  // server-validated navigation targets, not arbitrary URLs or mutation calls.
  const response = await fetchWithAuth('/api/assistant/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context, conversation }),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
};
