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
  input,
  setInput,
  onSend,
  onNewSession,
  onAction,
  context,
}) {
  const streamRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !streamRef.current) return;
    streamRef.current.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' });
  }, [currentSession?.messages, isOpen, sending]);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <div className={`assistant-dock ${isOpen ? 'is-open' : ''}`}>
      {isOpen && (
        <section className="assistant-panel" role="dialog" aria-label="BiddingFlow 업무 코파일럿">
          <header className="assistant-panel__header">
            <div className="assistant-panel__brand">
              <span><SailboatIcon /></span>
              <div><strong>업무 코파일럿</strong><small>화면 안내 · 작업 탐색 · 실행 준비</small></div>
            </div>
            <div className="assistant-panel__header-actions">
              <button type="button" onClick={onNewSession} title="새 대화" aria-label="새 대화">
                <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
              </button>
              <button type="button" onClick={() => setIsOpen(false)} title="닫기" aria-label="코파일럿 닫기">
                <svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>
          </header>

          <div className="assistant-context" aria-label="현재 코파일럿 문맥">
            <span>{context?.eyebrow || 'CURRENT VIEW'}</span>
            <strong>{context?.title || 'BiddingFlow'}</strong>
            {context?.detail && <small>{context.detail}</small>}
          </div>

          <div className="assistant-stream" ref={streamRef}>
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
                  {(message.response?.followups || []).length > 0 && (
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
            {sending && (
              <div className="assistant-message assistant-message--agent">
                <span className="assistant-message__avatar"><SailboatIcon /></span>
                <div className="assistant-message__content">
                  <p className="assistant-thinking"><i /><i /><i /></p>
                </div>
              </div>
            )}
          </div>

          <div className="assistant-quick-actions" aria-label="빠른 실행">
            {QUICK_ACTIONS.map((action) => (
              <button type="button" key={action.label} onClick={() => onSend(action.prompt)} disabled={sending}>
                {action.label}
              </button>
            ))}
          </div>

          <footer className="assistant-composer">
            <textarea
              rows="1"
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
