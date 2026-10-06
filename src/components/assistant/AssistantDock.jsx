import { useEffect, useRef } from 'react';
import SailboatIcon from '../common/SailboatIcon';
import './AssistantDock.css';

const QUICK_ACTIONS = [
  { label: '승인 대기 MR', prompt: '내 담당 MR 중 승인 대기 항목을 보여줘' },
  { label: 'RFQ 사용법', prompt: 'RFQ 협력사를 선택하고 발송하는 방법을 알려줘' },
  { label: '물품 도착', prompt: '물품 도착 여부는 어디서 확인해?' },
  { label: '현재 화면', prompt: '현재 화면에서 무엇을 할 수 있어?' },
];

export default function AssistantDock({
  isOpen,
  setIsOpen,
  currentSession,
  sending,
  currentSending = sending,
  sessions = [],
  onSessionList,
  onSelectSession,
  canCreateSession = true,
  loading = false,
  error = '',
  onRetry,
  onRequestDelete,
  deleteTarget,
  deleting = false,
  onCancelDelete,
  onConfirmDelete,
  input,
  setInput,
  onSend,
  onNewSession,
  onAction,
  context,
}) {
  const streamRef = useRef(null);
  const cancelRef = useRef(null);
  const showingList = !currentSession;
  useEffect(() => { if (deleteTarget) cancelRef.current?.focus(); }, [deleteTarget]);

  useEffect(() => {
    if (!isOpen || !streamRef.current) return;
    streamRef.current.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' });
  }, [currentSession?.messages, isOpen, sending]);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <div className={`assistant-dock ${isOpen ? 'is-open' : ''}`}>
      {isOpen && (
        <section className={`assistant-panel${showingList ? ' assistant-panel--sessions' : ''}`} role="dialog" aria-label="BiddingFlow 업무 코파일럿">
          <header className="assistant-panel__header">
            <div className="assistant-panel__brand">
              <span><SailboatIcon /></span>
              <div><strong>업무 코파일럿</strong><small>읽기 전용 · 작업 조회 · 화면 안내</small></div>
            </div>
            <div className="assistant-panel__header-actions">
              <button type="button" onClick={showingList ? onNewSession : onSessionList}
                disabled={showingList && !canCreateSession}
                title={showingList ? '새 세션' : '세션 목록'} aria-label={showingList ? '새 세션' : '세션 목록'}>
                <svg viewBox="0 0 24 24"><path d={showingList ? 'M12 5v14M5 12h14' : 'M8 6h12M8 12h12M8 18h12M3 6h1M3 12h1M3 18h1'} /></svg>
              </button>
              <button type="button" onClick={() => setIsOpen(false)} title="닫기" aria-label="코파일럿 닫기">
                <svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>
          </header>
          {showingList ? <>
            <div className="assistant-session-list">
              <h3>세션 목록 <span>{sessions.length}</span></h3>
              <p>이어서 질문할 대화를 선택하세요.</p>
              {error && <p className="assistant-session-error" role="alert">{error} <button type="button" onClick={onRetry}>다시 불러오기</button></p>}
              {loading && <p role="status">대화를 불러오는 중입니다.</p>}
              {!sessions.length && !loading && !error && <p>저장된 대화가 없습니다. 오른쪽 위 + 버튼으로 시작하세요.</p>}
              {sessions.map((session) => <div className="assistant-session-row" key={session.id}>
                <button type="button" className="assistant-session-item" onClick={() => onSelectSession(session.id)} disabled={deleting}>
                <strong>{session.title}</strong>
                <span>{session.messages?.at(-1)?.text || session.preview || '궁금한 업무나 화면을 물어보세요.'}</span>
                <small>{new Date(session.updatedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
                </button>
                <button type="button" className="assistant-session-delete" title="대화 삭제" aria-label={`${session.title} 대화 삭제`}
                  disabled={deleting} onClick={() => onRequestDelete(session)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                </button>
              </div>)}
              {sessions.length >= 20 && <p>최대 20개 세션입니다. 필요 없는 대화를 삭제한 뒤 추가해 주세요.</p>}
              {sending && !loading && <p role="status">요청한 세션에 답변을 준비하고 있습니다.</p>}
            </div>
            <p className="assistant-safety">내 계정에 저장된 대화 · 삭제하면 대화 내용도 서버에서 삭제됩니다.</p>
          </> : <>
          <div className="assistant-context" aria-label="현재 코파일럿 문맥">
            <span>{context?.eyebrow || 'CURRENT VIEW'}</span>
            <strong>{context?.title || 'BiddingFlow'}</strong>
            {context?.detail && <small>{context.detail}</small>}
          </div>

          <div className="assistant-stream" ref={streamRef}>
            {error && <p className="assistant-session-error" role="alert">{error} <button type="button" onClick={onRetry}>세션 목록</button></p>}
            {!currentSession.messages.length && <div className="assistant-empty">
              <strong>어떤 업무를 찾으시나요?</strong>
              <p>“외부 응답 대기 작업 보여줘”<br />“무선 마우스 구매 작업은 몇 건이야?”<br />“PO 승인은 어디서 해?”</p>
              <small>조회한 목록에서 “그중 납기가 가까운 건”, “첫 번째 건”처럼 이어서 물어보세요.</small>
            </div>}
            {(currentSession?.messages || []).map((message, index) => (
              <div className={`assistant-message assistant-message--${message.sender}`} key={`${message.sender}-${index}`}>
                {message.sender === 'agent' && <span className="assistant-message__avatar"><SailboatIcon /></span>}
                <div className={`assistant-message__content${message.isError ? ' is-error' : ''}`}>
                  <p>{message.text}</p>
                  {/* Record cards navigate only when the backend supplied a
                      matching, allowlisted action. */}
                  {(message.response?.records || []).length > 0 && (
                    <div className="assistant-record-list" aria-label="조회된 구매 요청">
                      {message.response.records.map((record) => {
                        const action = message.response.actions?.find(
                          (candidate) => candidate.highlight_reference === record.reference,
                        );
                        return (
                          <button
                            type="button"
                            className="assistant-record-card"
                            key={record.case_id}
                            onClick={() => action && onAction(action)}
                            disabled={!action}
                          >
                            <span className="assistant-record-card__topline">
                              <strong>{record.reference}</strong>
                              <em>{record.status_label}</em>
                            </span>
                            <span className="assistant-record-card__item">{record.item_name}</span>
                            <span className="assistant-record-card__stage">{record.stage_label}</span>
                            {record.schedule_date && <small>납기 {record.schedule_date}</small>}
                            <small>{record.waiting_on} · {record.next_action}</small>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {/* Feature-guide actions switch screens only; they never
                      call approval, rejection, RFQ, or PO mutation APIs. */}
                  {(message.response?.actions || []).some((action) => !action.highlight_reference) && (
                    <div className="assistant-response-actions">
                      {message.response.actions
                        .filter((action) => !action.highlight_reference)
                        .map((action) => (
                          <button type="button" key={`${action.target}-${action.label}`} onClick={() => onAction(action)}>
                            {action.label}
                            <span aria-hidden="true">→</span>
                          </button>
                        ))}
                    </div>
                  )}
                  {index === currentSession.messages.length - 1 && (message.response?.followups || []).length > 0 && (
                    <div className="assistant-followups" aria-label="이어 묻기">
                      {message.response.followups.map((followup) => (
                        <button type="button" key={followup} onClick={() => onSend(followup)} disabled={sending}>
                          {followup}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {currentSending && (
              <div className="assistant-message assistant-message--agent">
                <span className="assistant-message__avatar"><SailboatIcon /></span>
                <div className="assistant-message__content">
                  <p className="assistant-thinking" role="status" aria-label="조회 및 안내 준비 중"><i /><i /><i /></p>
                </div>
              </div>
            )}
          </div>

          <div className="assistant-quick-actions" aria-label="빠른 질문">
            {QUICK_ACTIONS.map((action) => (
              <button type="button" key={action.label} onClick={() => onSend(action.prompt)} disabled={sending}>
                {action.label}
              </button>
            ))}
          </div>

          <footer className="assistant-composer">
            <textarea
              rows="1"
              maxLength={3000}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="화면 이동이나 작업 조회를 요청하세요"
              aria-label="코파일럿에게 요청"
              autoFocus
            />
            <button type="button" onClick={() => onSend()} disabled={!input.trim() || sending} aria-label="요청 전송">
              <svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </footer>
          <p className="assistant-safety">읽기 전용 안내 · 승인·반려·발송은 해당 업무 화면에서 직접 진행합니다.</p>
          </>}
          {deleteTarget && <div className="assistant-confirm-backdrop">
            <div className="assistant-confirm" role="alertdialog" aria-modal="true" aria-labelledby="assistant-delete-title" aria-describedby="assistant-delete-detail"
              onKeyDown={event => {
                if (event.key === 'Escape' && !deleting) { event.stopPropagation(); onCancelDelete(); }
                if (event.key === 'Tab') {
                  const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
                  if (buttons.length) { event.preventDefault(); buttons[(buttons.indexOf(document.activeElement) + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus(); }
                }
              }}>
              <h3 id="assistant-delete-title">이 대화를 삭제할까요?</h3>
              <p id="assistant-delete-detail">‘{deleteTarget.title}’의 대화 내용이 서버에서 삭제되며 되돌릴 수 없습니다. 구매 요청과 업무 기록은 삭제되지 않습니다.</p>
              {error && <p role="alert">{error}</p>}
              <div><button ref={cancelRef} type="button" onClick={onCancelDelete} disabled={deleting}>취소</button>
                <button type="button" onClick={onConfirmDelete} disabled={deleting}>{deleting ? '삭제 중…' : '삭제'}</button></div>
            </div>
          </div>}
        </section>
      )}

      <button
        type="button"
        className="assistant-launcher"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label={isOpen ? '업무 코파일럿 닫기' : '업무 코파일럿 열기'}
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>
        ) : (
          <><SailboatIcon /><span>도움이 필요하신가요?</span></>
        )}
      </button>
    </div>
  );
}
