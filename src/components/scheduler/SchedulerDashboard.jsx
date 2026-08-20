import React from 'react';

export const SchedulerDashboard = ({
  pipelines,
  approvals,
  logs,
  handleTogglePipeline,
  handleRunNow,
  handleResolveApproval
}) => (
  <div className="scheduler-dashboard-container">
    <div className="scheduler-content-wrapper">
      {/* 1. Minimalist KPI Metric Row */}
      <div className="kpi-metric-grid">
        <div className="kpi-card">
          <span className="kpi-label">Active Pipelines</span>
          <span className="kpi-value">{pipelines.filter((p) => p.active).length} / {pipelines.length}</span>
          <span className="kpi-subtext">스케줄러 자동 가동 중</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Auto Processed</span>
          <span className="kpi-value">18</span>
          <span className="kpi-subtext">금일 자동 발주 완료</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Pending Reviews</span>
          <span className="kpi-value">{approvals.length}</span>
          <span className="kpi-subtext">인간 승인 대기 중</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Estimated Savings</span>
          <span className="kpi-value">₩1.42M</span>
          <span className="kpi-subtext">최적가 벤치마킹 효과</span>
        </div>
      </div>

      {/* 2. Pipelines Section */}
      <div className="scheduler-section">
        <div className="section-header-row">
          <div className="section-title-group">
            <h2 className="section-heading">자율 구매 파이프라인</h2>
            <span className="count-pill">{pipelines.length}</span>
          </div>
          <button className="run-now-btn" onClick={() => alert('새 파이프라인 추가')}>
            + 파이프라인 추가
          </button>
        </div>

        <div className="pipeline-cards-grid">
          {pipelines.map((pipe) => (
            <div key={pipe.id} className="pipeline-card">
              <div className="pipeline-card-top">
                <div className="card-header-line">
                  <div>
                    <h3 className="card-name">{pipe.name}</h3>
                    <p className="card-desc">{pipe.desc}</p>
                  </div>
                  <label className="switch-toggle">
                    <input
                      type="checkbox"
                      checked={pipe.active}
                      onChange={() => handleTogglePipeline(pipe.id)}
                    />
                    <span className="slider-round" />
                  </label>
                </div>

                <div className="pipeline-tags-row">
                  <span className="tag-badge">{pipe.interval}</span>
                  <span className="tag-badge">{pipe.cron}</span>
                </div>
              </div>

              <div className="pipeline-card-bottom">
                <span className="last-run-text">{pipe.lastRun}</span>
                <button
                  className="run-now-btn"
                  onClick={() => handleRunNow(pipe)}
                  title="즉시 실행"
                >
                  Run Now
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. HITL Review Queue Section */}
      <div className="scheduler-section">
        <div className="section-header-row">
          <div className="section-title-group">
            <h2 className="section-heading">인간 승인 대기 큐 (LangGraph Interrupts)</h2>
            <span className="count-pill">{approvals.length} PENDING</span>
          </div>
        </div>

        {approvals.length > 0 ? (
          <div className="hitl-queue-grid">
            {approvals.map((appr) => (
              <div key={appr.id} className="hitl-card">
                <div className="hitl-header">
                  <span className="hitl-title">{appr.itemCode}</span>
                  <span className="hitl-reason-badge">{appr.reason}</span>
                </div>
                <div className="hitl-detail-box">
                  {appr.detail}
                </div>
                <div className="hitl-actions-row">
                  <button
                    className="hitl-btn reject"
                    onClick={() => handleResolveApproval(appr.id, false)}
                  >
                    반려
                  </button>
                  <button
                    className="hitl-btn approve"
                    onClick={() => handleResolveApproval(appr.id, true)}
                  >
                    승인 및 RFQ 발행
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '32px', background: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            모든 자동화 작업이 정상 완료되었습니다. 현재 보류 중인 승인 항목이 없습니다.
          </div>
        )}
      </div>

      {/* 4. Color Syntax-Highlighted Execution Terminal */}
      <div className="scheduler-section">
        <div className="section-header-row">
          <div className="section-title-group">
            <h2 className="section-heading">실시간 실행 로그 터미널</h2>
          </div>
        </div>
        <div className="terminal-window-wrapper">
          <div className="terminal-header-bar">
            <div className="terminal-window-dots">
              <div className="dot red" />
              <div className="dot yellow" />
              <div className="dot green" />
            </div>
            <span className="terminal-title">biddingflow-daemon:~/watcher</span>
            <div style={{ width: '40px' }} />
          </div>
          <div className="live-log-terminal">
            {logs.map((l, idx) => (
              <div key={idx} className="log-line">
                <span className="log-time">[{l.time}]</span>
                <span className={`log-tag ${l.tag}`}>{l.tag.toUpperCase()}</span>
                <span className="log-msg">{l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default SchedulerDashboard;
