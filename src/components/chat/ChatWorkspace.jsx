import React from 'react';
import SailboatIcon from '../common/SailboatIcon';

export const ChatWorkspace = ({
  currentSession,
  sending,
  input,
  setInput,
  handleSendMessage,
  handleKeyDown,
  setCurrentMode
}) => (
  <>
    <div className="messages-container">
      {currentSession && currentSession.messages.length > 0 ? (
        <div className="message-stream-inner">
          {currentSession.messages.map((msg, idx) => (
            <div key={idx} className={`chat-row ${msg.sender}`}>
              {msg.sender === 'agent' && (
                <div className="agent-icon-avatar">
                  <SailboatIcon className="agent-icon-svg" />
                </div>
              )}
              <div className={msg.sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-agent'}>
                {msg.text.split('\n').map((line, lIdx) => (
                  <React.Fragment key={lIdx}>
                    {line}
                    {lIdx < msg.text.split('\n').length - 1 && <br />}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
          {sending && (
            <div className="chat-row agent">
              <div className="agent-icon-avatar">
                <SailboatIcon className="agent-icon-svg" />
              </div>
              <div className="chat-bubble-agent" style={{ color: 'var(--text-muted)' }}>
                안내 내용을 정리하고 있습니다...
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="gemini-hero-view">
          <span className="guide-hero-kicker">BIDDINGFLOW GUIDE</span>
          <h1 className="hero-title-greeting">무엇이 궁금하신가요?</h1>
          <p className="guide-hero-description">화면 사용법과 구매 자동화 흐름을 안내합니다. 실제 구매 작업은 통합 작업함에서 진행됩니다.</p>
          <div className="suggestion-chips-grid">
            <div
              className="suggestion-chip-card"
              onClick={() => handleSendMessage('통합 작업함 사용 방법을 알려줘')}
            >
              <div className="chip-card-title">통합 작업함</div>
              <div className="chip-card-desc">작업 카드, 상태 필터와 실행 단계 확인 방법</div>
            </div>
            <div
              className="suggestion-chip-card"
              onClick={() => handleSendMessage('확인 필요 상태와 인터럽트 폼을 설명해줘')}
            >
              <div className="chip-card-title">사용자 확인</div>
              <div className="chip-card-desc">자동화가 멈추는 조건과 폼 처리 방법</div>
            </div>
            <div
              className="suggestion-chip-card"
              onClick={() => handleSendMessage('RFQ부터 PO 발주까지 자동화 단계를 알려줘')}
            >
              <div className="chip-card-title">구매 자동화 흐름</div>
              <div className="chip-card-desc">MR 접수부터 견적 비교와 발주까지</div>
            </div>
          </div>
        </div>
      )}
    </div>

    <div className="bottom-input-container">
      <div className="input-box-wrapper">
        <div className="input-textarea-row">
          <textarea
            rows="1"
            placeholder="BiddingFlow 기능이나 사용 방법을 물어보세요..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="chat-textarea"
            autoFocus
          />
        </div>
        <div className="input-actions-row">
          <div className="input-tools-left">
            <button className="tool-chip-btn" onClick={() => setCurrentMode('operations')}>
              통합 작업함
            </button>
            <button className="tool-chip-btn" onClick={() => setCurrentMode('scheduler')}>
              Flow Scheduler
            </button>
          </div>
          <button
            className="send-round-btn"
            onClick={() => handleSendMessage()}
            disabled={!input.trim() || sending}
            title="전송"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="footer-disclaimer-text">
        제품 안내 챗봇 · 실제 구매 작업을 실행하지 않습니다
      </div>
    </div>
  </>
);

export default ChatWorkspace;
