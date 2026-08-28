import { useEffect, useRef } from 'react';
import SailboatIcon from '../common/SailboatIcon';
import './AssistantDock.css';

const QUICK_ACTIONS = [
  { label: 'MR 승인 대기', prompt: 'MR 승인 대기 목록으로 이동해줘' },
  { label: '협력사 선정', prompt: '협력사 선정 화면으로 이동해줘' },
  { label: 'PO 관리', prompt: 'PO 관리 화면으로 이동해줘' },
  { label: '현재 화면 설명', prompt: '현재 화면과 작업 상태를 설명해줘' },
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
                <p>{message.text}</p>
              </div>
            ))}
            {sending && (
              <div className="assistant-message assistant-message--agent">
                <span className="assistant-message__avatar"><SailboatIcon /></span>
                <p className="assistant-thinking"><i /><i /><i /></p>
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
          <p className="assistant-safety">승인·반려·발송처럼 결과를 바꾸는 작업은 실행 전에 다시 확인합니다.</p>
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
