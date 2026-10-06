import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AssistantController from '../src/components/assistant/AssistantController';

// Local-only fixture: every request is intercepted; never calls production.
let release;
const sessions = new Map();
window.fetch = async (url, options) => {
  if (url === '/api/assistant/sessions' && options.method === 'POST') {
    const { id } = JSON.parse(options.body);
    const session = { id, title: '새 대화', updatedAt: new Date().toISOString(), version: 0, messages: [], dialogue: null };
    sessions.set(id, session); return Response.json(session, { status: 201 });
  }
  if (url === '/api/assistant/sessions') return Response.json({ sessions: [...sessions.values()] });
  if (url.startsWith('/api/assistant/sessions/')) {
    const id = url.split('/').at(-1);
    if (!sessions.has(id)) return Response.json({ detail: '대화 없음' }, { status: 404 });
    if (options.method === 'DELETE') { sessions.delete(id); return new Response(null, { status: 204 }); }
    return Response.json(sessions.get(id));
  }
  if (url !== '/api/assistant/messages') throw new Error('Network disabled in fixture');
  const request = JSON.parse(options.body);
  return new Promise((resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    release = () => {
      const response = {
      answer: `모의 응답: ${request.message}`, intent: 'case_query',
      dialogue: { filters: { keyword: '마우스' }, references: ['MAT-MR-2026-00999'] },
      records: [{ case_id: 'qa', reference: 'MAT-MR-2026-00999', item_name: '무선 마우스', stage_label: '견적 회신 대기', status_label: '외부 응답 대기', schedule_date: '2026-10-10', waiting_on: '공급사', next_action: '회신 현황을 확인합니다.' }],
      actions: [{ type: 'navigate_with_filters', label: '열기', target: 'vendor-select', highlight_reference: 'MAT-MR-2026-00999' }],
      followups: ['그중 납기가 가까운 건', '첫 번째 건 알려줘'],
      };
      const session = sessions.get(request.session_id);
      if (!session) { resolve(Response.json({ detail: '삭제된 대화' }, { status: 409 })); return; }
      session.title = request.message;
      session.version += 1;
      response.meta = { session_version: session.version };
      session.dialogue = response.dialogue;
      session.messages.push({ sender: 'user', text: request.message }, { sender: 'agent', text: response.answer, response });
      resolve(Response.json(response));
    };
  });
};
export function Preview() {
  const [account, setAccount] = useState(1);
  const [open, setOpen] = useState(true);
  const [action, setAction] = useState('없음');
  return <main style={{ fontFamily: 'sans-serif', padding: 30 }}>
    <h1>챗봇 세션 UI 검증</h1><p>외부 통신 없음 · 구매 작업 실행 없음 · 계정 {account}</p>
    <button onClick={() => release?.()}>모의 응답 반환</button>{' '}
    <button onClick={() => { sessions.clear(); setAccount(value => value + 1); }}>계정 전환</button>
    <p>바로가기: {action}</p>
    <AssistantController key={account} isOpen={open} setIsOpen={setOpen}
      context={{ currentTab: 'dashboard', title: '구매 대시보드' }} onAction={value => setAction(value.target)} />
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
