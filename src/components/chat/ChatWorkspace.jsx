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
                자율 구매 파이프라인 분석 중...
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="gemini-hero-view">
          <h1 className="hero-title-greeting">무엇을 구매해 드릴까요?</h1>
          <div className="suggestion-chips-grid">
            <div
              className="suggestion-chip-card"
              onClick={() => handleSendMessage('SF-001 안전모 50개 재고 확인 및 발주 진행해줘')}
            >
              <div className="chip-card-title">자재 재고 파악</div>
              <div className="chip-card-desc">SF-001 안전모 50개 재고 및 부족 수량 확인</div>
            </div>
            <div
              className="suggestion-chip-card"
              onClick={() => handleSendMessage('기존 공급사 단가와 최신 시장 견적 비교해줘')}
            >
              <div className="chip-card-title">대체 공급사 견적</div>
              <div className="chip-card-desc">Tavily 웹 검색 및 ERP 가격 통계 비교</div>
            </div>
            <div
              className="suggestion-chip-card"
              onClick={() => handleSendMessage('승인 대기 중인 구매 요청서(MR) 분석해줘')}
            >
              <div className="chip-card-title">구매 요청서 검토</div>
              <div className="chip-card-desc">자동 발주 승인 및 RFQ 발송 프로세스 진행</div>
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
            placeholder="구매 요청 또는 ERP 재고 관련 질문을 입력하세요..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="chat-textarea"
            autoFocus
          />
        </div>
        <div className="input-actions-row">
          <div className="input-tools-left">
            <button className="tool-chip-btn">
              자재 코드
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
        BiddingFlow Autonomous Procurement Engine
      </div>
    </div>
  </>
);

export default ChatWorkspace;
