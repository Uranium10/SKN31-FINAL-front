import React, { useState, useEffect } from 'react';
import SailboatIcon from '../common/SailboatIcon';

const initialTaskStrips = [
  {
    id: 'op-1',
    mrCode: 'MR-2026-003',
    title: '3M 방진마스크 200개 긴급 조달',
    category: '안전보호구',
    qty: 200,
    status: 'pending', // 'pending' | 'running' | 'quoted' | 'completed'
    currentStepIndex: 2, // 0: 재고, 1: 비딩판정, 2: 대체품선택, 3: 벤더발굴, 4: RFQ발송, 5: 견적대기, 6: PO발주
    steps: ['재고확인', '비딩판정', '대체품선택', '벤더발굴', 'RFQ발송', '견적대기', 'PO발주'],
    interruptReason: '기존 공급사 품절로 인한 대체품 승인 대기',
    updatedAt: '10분 전'
  },
  {
    id: 'op-2',
    mrCode: 'MR-2026-001',
    title: '고전압 절연장갑 100켤레 정기 구매',
    category: '전기자재',
    qty: 100,
    status: 'quoted',
    currentStepIndex: 5,
    steps: ['재고확인', '비딩판정', '대체품확정', '벤더10곳', 'RFQ완료', '견적비교', 'PO발주'],
    interruptReason: '10개사 견적 도착 완료 (AI 최적 단가 랭킹 분석됨)',
    updatedAt: '35분 전'
  },
  {
    id: 'op-3',
    mrCode: 'MR-2025-992',
    title: '용접 보안경 50개 소액 구매',
    category: '안전용품',
    qty: 50,
    status: 'completed',
    currentStepIndex: 6,
    steps: ['재고확인', '비딩생략', '기존공급사', '단가검증', 'PO자동생성', '발주완료', '납기준수'],
    interruptReason: '발주서 #PO-2026-088 발행 완료',
    updatedAt: '어제 16:30'
  }
];

export const OperationsWorkspace = ({ onNavigateToChat }) => {
  const [filter, setFilter] = useState('all'); // 'all', 'pending', 'running', 'quoted', 'completed'
  const [strips, setStrips] = useState(initialTaskStrips);
  const [isCreating, setIsCreating] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  
  // Real-time interactive creation simulation state
  const [creationStage, setCreationStage] = useState(0); // 0: input, 1: running step 1, 2: step 2, 3: interrupt, 4: step 4, 5: done
  const [creationLogs, setCreationLogs] = useState([]);
  const [selectedSubstitute, setSelectedSubstitute] = useState(null);

  // Filtered strips
  const filteredStrips = strips.filter((s) => {
    if (filter === 'all') return true;
    return s.status === filter;
  });

  const handleOpenCreation = () => {
    setIsCreating(true);
    setCreationStage(0);
    setPromptInput('');
    setCreationLogs([]);
    setSelectedSubstitute(null);
  };

  const handleStartPipeline = (customCmd = null) => {
    const cmd = (customCmd || promptInput).trim();
    if (!cmd) return;

    setPromptInput(cmd);
    setCreationStage(1);
    setCreationLogs([
      { sender: 'user', text: cmd },
      { sender: 'agent', text: '자율 구매 파이프라인 스트립을 조립하고 실행을 시작합니다...' }
    ]);

    // Step 1: Stock Check (0.7s)
    setTimeout(() => {
      setCreationLogs((prev) => [
        ...prev,
        { sender: 'system', text: '📦 [재고 확인 노드] SF-001 현재 창고 재고 12개 확인 (요청 수량 50개 대비 부족 38개)' }
      ]);
      setCreationStage(2);
    }, 700);

    // Step 2: Bidding Decision & Substitute Check (1.6s) -> Trigger INTERRUPT
    setTimeout(() => {
      setCreationLogs((prev) => [
        ...prev,
        { sender: 'system', text: '🔍 [비딩 판정 노드] 비딩 대상 판정 완료 (대량 MRO 품목)' },
        { sender: 'agent', text: '⚠️ [사람 판단 필요] 기존 안전모 제조사 단종이 감지되었습니다. AI가 발굴한 최적 대체품 중 하나를 선택해 주세요.' }
      ]);
      setCreationStage(3); // Interrupt choice mode!
    }, 1600);
  };

  // User resolves interrupt inside the chat
  const handleResolveInterrupt = (choiceName, price) => {
    setSelectedSubstitute(choiceName);
    setCreationStage(4);
    setCreationLogs((prev) => [
      ...prev,
      { sender: 'user', text: `[대체품 선택 승인] ${choiceName} (${price})` },
      { sender: 'agent', text: `선택하신 '${choiceName}'으로 파이프라인을 계속 진행합니다.` },
      { sender: 'system', text: '🏢 [벤더 발굴 노드] RAG 과거 거래처 + Tavily 검색으로 10개 공급사 발굴 완료 (국세청 사업자등록 실시간 정상 검증)' }
    ]);

    // Step 4: RFQ Sending (1.2s)
    setTimeout(() => {
      setCreationLogs((prev) => [
        ...prev,
        { sender: 'system', text: '✉️ [RFQ 발송 노드] 10개 공급업체에 포털 로그인 계정 및 전자 견적의뢰서(RFQ) 발송 완료' },
        { sender: 'agent', text: '✅ 10개사에 RFQ 이메일 발송을 완료했습니다. 이제 공급업체들의 견적 회신을 대기 중입니다. 작업 대기열에 등록되었으니, 다른 작업을 위해선 채팅창을 잠시 나가계셔도 좋습니다.' }
      ]);
      setCreationStage(5); // Final handoff

      // Automatically append newly created strip to main operations list
      const newStrip = {
        id: `op-${Date.now()}`,
        mrCode: 'MR-2026-004',
        title: 'SF-001 안전모 50개 (대체품 A사 지정)',
        category: '안전보호구',
        qty: 50,
        status: 'quoted',
        currentStepIndex: 5,
        steps: ['재고확인', '비딩판정', '대체품A확정', '벤더10곳', 'RFQ완료', '견적대기', 'PO발주'],
        interruptReason: '10개사 견적 회신 대기 중 (스케줄러 모니터링 가동)',
        updatedAt: '방금 전'
      };
      setStrips((prev) => [newStrip, ...prev]);
    }, 1200);
  };

  return (
    <div className="operations-workspace-container">
      {/* 1. Header Toolbar: Title, Filter Chips, + New Task Button */}
      <div className="operations-top-toolbar">
        <div className="toolbar-left-group">
          <h2 className="operations-heading">구매 작업 스트립 파이프라인</h2>
          
          {/* Segmented Status Filters */}
          <div className="operations-filter-group">
            <button
              className={`filter-chip-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              전체 <span className="chip-num">{strips.length}</span>
            </button>
            <button
              className={`filter-chip-btn ${filter === 'pending' ? 'active' : ''}`}
              onClick={() => setFilter('pending')}
            >
              ⏳ 승인 대기 <span className="chip-num">{strips.filter(s => s.status === 'pending').length}</span>
            </button>
            <button
              className={`filter-chip-btn ${filter === 'running' ? 'active' : ''}`}
              onClick={() => setFilter('running')}
            >
              🟢 진행 중 <span className="chip-num">{strips.filter(s => s.status === 'running').length}</span>
            </button>
            <button
              className={`filter-chip-btn ${filter === 'quoted' ? 'active' : ''}`}
              onClick={() => setFilter('quoted')}
            >
              📊 견적 대기/도착 <span className="chip-num">{strips.filter(s => s.status === 'quoted').length}</span>
            </button>
            <button
              className={`filter-chip-btn ${filter === 'completed' ? 'active' : ''}`}
              onClick={() => setFilter('completed')}
            >
              ✅ 완료 <span className="chip-num">{strips.filter(s => s.status === 'completed').length}</span>
            </button>
          </div>
        </div>

        <button className="new-operation-btn" onClick={handleOpenCreation}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          + 새 작업 시작
        </button>
      </div>

      {/* 2. Interactive Creation Modal / In-line Console (when creating a new task) */}
      {isCreating && (
        <div className="creation-overlay-card">
          <div className="creation-card-header">
            <div className="creation-title-group">
              <SailboatIcon className="creation-boat-icon" />
              <div>
                <h3 className="creation-title">신규 자율 구매 작업 생성기</h3>
                <p className="creation-subtitle">명령을 입력하면 실시간으로 파이프라인 스트립이 조립되고 실행됩니다.</p>
              </div>
            </div>
            <button className="close-creation-btn" onClick={() => setIsCreating(false)} title="닫기">
              ✕
            </button>
          </div>

          {/* If pipeline is launched -> Top Dynamic Strip Animation */}
          {creationStage > 0 && (
            <div className="live-strip-preview-banner animate-slide-down">
              <div className="preview-strip-top">
                <span className="live-mr-tag">MR-2026-004 : SF-001 안전모 50개</span>
                <span className={`live-status-pill ${creationStage === 3 ? 'pending' : creationStage === 5 ? 'success' : 'running'}`}>
                  {creationStage === 3 ? '⏳ 승인 대기 (INTERRUPT)' : creationStage === 5 ? '⏱️ 견적 회신 대기 중' : '🟢 실행 중'}
                </span>
              </div>
              
              {/* Stepper with ±2 focus */}
              <div className="live-stepper-row">
                <div className={`step-node ${creationStage >= 1 ? 'completed' : ''}`}>1. 재고확인</div>
                <div className="step-arrow">➔</div>
                <div className={`step-node ${creationStage >= 2 ? 'completed' : ''}`}>2. 비딩판정</div>
                <div className="step-arrow">➔</div>
                <div className={`step-node ${creationStage === 3 ? 'active-interrupt' : creationStage > 3 ? 'completed' : ''}`}>
                  3. 대체품선택 {creationStage === 3 && '★'}
                </div>
                <div className="step-arrow">➔</div>
                <div className={`step-node ${creationStage >= 4 ? 'completed' : ''}`}>4. 벤더10곳+국세청</div>
                <div className="step-arrow">➔</div>
                <div className={`step-node ${creationStage >= 5 ? 'completed' : ''}`}>5. RFQ발송</div>
                <div className="step-arrow">➔</div>
                <div className={`step-node ${creationStage === 5 ? 'active-waiting' : ''}`}>6. 견적대기</div>
              </div>
            </div>
          )}

          {/* Interactive Chat Console below */}
          <div className="creation-console-body">
            {creationStage === 0 ? (
              <div className="empty-prompt-state">
                <div className="prompt-hero-text">어떤 구매 작업을 시작할까요?</div>
                <div className="sample-prompt-chips">
                  <div
                    className="sample-chip"
                    onClick={() => handleStartPipeline('SF-001 안전모 50개 재고 확인 및 10개사 RFQ 발송 파이프라인 시작')}
                  >
                    💡 SF-001 안전모 50개 재고 확인 및 10개사 RFQ 발송 파이프라인 시작
                  </div>
                  <div
                    className="sample-chip"
                    onClick={() => handleStartPipeline('3M 방진마스크 대체 공급사 발굴 및 시장 견적 수집')}
                  >
                    💡 3M 방진마스크 대체 공급사 발굴 및 시장 견적 수집
                  </div>
                </div>
              </div>
            ) : (
              <div className="live-creation-chat-feed">
                {creationLogs.map((log, idx) => (
                  <div key={idx} className={`creation-log-row ${log.sender}`}>
                    {log.sender === 'system' ? (
                      <div className="system-log-bubble">{log.text}</div>
                    ) : log.sender === 'agent' ? (
                      <div className="agent-msg-box">
                        <div className="agent-mini-avatar">⛵</div>
                        <div className="agent-msg-text">{log.text}</div>
                      </div>
                    ) : (
                      <div className="user-msg-box">{log.text}</div>
                    )}
                  </div>
                ))}

                {/* INTERRUPT Action Choice in Chat! */}
                {creationStage === 3 && (
                  <div className="interrupt-action-panel animate-fade-in">
                    <div className="interrupt-panel-title">대체품을 선택하여 계속 진행하세요:</div>
                    <div className="choice-cards-row">
                      <button
                        className="choice-card-btn recommended"
                        onClick={() => handleResolveInterrupt('A사 경량 안전모', '₩14,000 / 납기 2일')}
                      >
                        <div className="choice-header">
                          <span className="choice-name">🔘 A사 경량 안전모 (추천)</span>
                          <span className="choice-badge">유사도 94%</span>
                        </div>
                        <div className="choice-meta">단가 14,000원 | 납기 2일 | 국세청 인증 완료</div>
                      </button>
                      <button
                        className="choice-card-btn"
                        onClick={() => handleResolveInterrupt('B사 프리미엄형 안전모', '₩16,500 / 납기 1일')}
                      >
                        <div className="choice-header">
                          <span className="choice-name">⚪ B사 프리미엄형 안전모</span>
                          <span className="choice-badge">유사도 88%</span>
                        </div>
                        <div className="choice-meta">단가 16,500원 | 당일 즉시 출고</div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Creation Bottom Prompt Input */}
          {creationStage === 0 && (
            <div className="creation-input-bar">
              <input
                type="text"
                placeholder="구매 명령을 입력하세요 (예: SF-001 안전모 50개 재고 확인 및 발주)..."
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStartPipeline()}
                className="creation-prompt-input"
                autoFocus
              />
              <button
                className="creation-submit-btn"
                onClick={() => handleStartPipeline()}
                disabled={!promptInput.trim()}
              >
                파이프라인 가동
              </button>
            </div>
          )}

          {creationStage === 5 && (
            <div className="creation-finish-bar">
              <button className="finish-view-btn" onClick={() => setIsCreating(false)}>
                작업 리스트로 돌아가기
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3. Horizontal Operations Strips List */}
      <div className="operations-strips-list">
        {filteredStrips.length > 0 ? (
          filteredStrips.map((strip) => (
            <div key={strip.id} className={`operation-strip-card ${strip.status}`}>
              {/* Left Info: MR Code, Title, Qty */}
              <div className="strip-left-info">
                <div className="strip-code-line">
                  <span className="strip-mrcode">{strip.mrCode}</span>
                  <span className="strip-cat-badge">{strip.category}</span>
                  <span className="strip-qty-text">{strip.qty}개</span>
                </div>
                <div className="strip-title-text">{strip.title}</div>
                <div className="strip-update-text">{strip.updatedAt} 갱신</div>
              </div>

              {/* Center: ±2 Stepper Visualization */}
              <div className="strip-center-stepper">
                <div className="stepper-track">
                  {strip.steps.map((stepName, sIdx) => {
                    const isPassed = sIdx < strip.currentStepIndex;
                    const isCurrent = sIdx === strip.currentStepIndex;
                    
                    // Show compact window around current step
                    return (
                      <div
                        key={sIdx}
                        className={`stepper-node-pill ${isCurrent ? 'current' : isPassed ? 'passed' : 'upcoming'}`}
                      >
                        {isPassed && <span className="check-icon">✓</span>}
                        {isCurrent && <span className="active-dot" />}
                        <span className="node-label">{stepName}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="strip-interrupt-desc">{strip.interruptReason}</div>
              </div>

              {/* Right: Status Pill & Adaptive Quick Action */}
              <div className="strip-right-actions">
                <span className={`status-tag-badge ${strip.status}`}>
                  {strip.status === 'pending' && '⏳ 승인 대기'}
                  {strip.status === 'running' && '🟢 진행 중'}
                  {strip.status === 'quoted' && '📊 견적 대기/도착'}
                  {strip.status === 'completed' && '✅ 발주 완료'}
                </span>

                <div className="actions-button-row">
                  {strip.status === 'pending' && (
                    <button
                      className="strip-action-btn primary"
                      onClick={() => alert(`[승인 처리] ${strip.mrCode} - ${strip.interruptReason}`)}
                    >
                      승인하기
                    </button>
                  )}
                  {strip.status === 'quoted' && (
                    <button
                      className="strip-action-btn secondary"
                      onClick={() => alert(`[견적 비교 매트릭스] ${strip.mrCode} 10개 공급사 견적표를 엽니다.`)}
                    >
                      견적 비교표
                    </button>
                  )}
                  {strip.status === 'completed' && (
                    <button
                      className="strip-action-btn outline"
                      onClick={() => alert(`[ERP 발주서 조회] ${strip.mrCode} PO 문서를 엽니다.`)}
                    >
                      PO 조회
                    </button>
                  )}
                  <button
                    className="strip-action-btn ghost"
                    onClick={() => onNavigateToChat(strip.title)}
                    title="이 작업 에이전트와 대화"
                  >
                    💬
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-strips-placeholder">
            <p>해당 필터 조건에 해당하는 구매 작업이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OperationsWorkspace;
