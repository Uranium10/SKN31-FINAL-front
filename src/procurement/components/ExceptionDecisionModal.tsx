import { AlertTriangle, X } from 'lucide-react';
import { AutoProgressChecklist } from './AutoProgressChecklist';
import type { VendorSelectionGroup } from '../types';

interface ExceptionDecisionModalProps {
  group: VendorSelectionGroup;
  onClose: () => void;
  /** 견적 비교·선정 화면으로 (이대로 선정) */
  onCompareAndSelect: () => void;
  /** 마감 연장 모달로 */
  onExtendDeadline: () => void;
  /** 새 차수 시작 */
  onRebid: () => void;
  rebidding: boolean;
}

const evidenceLabels: Record<string, string> = {
  competition_count: '유효 견적',
  score_gap: '1-2위 점수차',
  top_supplier: '1순위',
  top_score: '1순위 종합점수',
  parse_failed_count: '읽지 못한 견적서',
  specification_status: '규격 평가',
  candidate_count: '후보 협력사',
  new_supplier_count: '신규 협력사',
  missing_email_count: '이메일 없는 후보',
};

/**
 * 자동 진행이 멈췄을 때 담당자가 결정하는 화면.
 *
 * 선정·연장·재비딩은 원래 표의 버튼과 ⋯ 메뉴에 흩어져 있던 것들인데,
 * 예외가 떴을 때는 이 셋이 한 자리에서 비교돼야 고를 수 있어서 모았다.
 * 실제 동작은 기존 흐름을 그대로 부른다.
 */
export function ExceptionDecisionModal({
  group,
  onClose,
  onCompareAndSelect,
  onExtendDeadline,
  onRebid,
  rebidding,
}: ExceptionDecisionModalProps) {
  const verdict = group.autoProgress;
  if (!verdict) return null;
  const blockers = verdict.checks.filter((check) => check.status !== 'passed');
  const evidence = Object.entries(verdict.evidence ?? {}).filter(
    ([key, value]) => evidenceLabels[key] && value !== null && value !== undefined && value !== '',
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(920px, calc(100vw - 32px))' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <span style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '34px', height: '34px', borderRadius: '8px',
              backgroundColor: 'var(--danger-bg)', color: 'var(--danger)',
            }}>
              <AlertTriangle size={18} />
            </span>
            <div>
              <h3 style={{ margin: 0 }}>자동 진행을 멈췄습니다 — 결정이 필요합니다</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {group.mrNo} · {group.itemName} · {(group.rfqRounds?.length ?? 0) + (group.rfqSent ? 1 : 0)}차
                {group.deadlineDDay <= 0 ? ` · 마감 ${group.deadlineDate} ${group.deadlineTime} 경과` : ''}
              </span>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {blockers.length > 0 && (
            <div
              role="alert"
              style={{
                padding: '12px 16px', borderRadius: '10px',
                border: '1px solid var(--danger)', backgroundColor: 'var(--danger-bg)',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--danger)' }}>
                {blockers[0].detail}
              </div>
              {blockers.length > 1 && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  이 밖에 {blockers.length - 1}개 조건이 더 걸렸습니다. 아래에서 확인하세요.
                </div>
              )}
            </div>
          )}

          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
              자동 진행 조건 — 걸린 항목만 사람이 봅니다
            </div>
            <AutoProgressChecklist verdict={verdict} />
          </div>

          {evidence.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', padding: '10px 14px', backgroundColor: 'var(--bg-input)', borderRadius: '8px' }}>
              {evidence.map(([key, value]) => (
                <div key={key}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{evidenceLabels[key]}</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{String(value)}</div>
                </div>
              ))}
            </div>
          )}

          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
              어떻게 할까요
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>견적 보고 선정</div>
                <p style={{ margin: 0, flexGrow: 1, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                  받은 견적을 비교하고 직접 고릅니다. 확정하면 수주 접수 요청 메일이 바로 나갑니다.
                </p>
                <button type="button" className="btn-sm btn-approve" onClick={onCompareAndSelect} style={{ justifyContent: 'center', height: '36px' }}>
                  견적 비교 · 선정
                </button>
              </div>

              <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>마감 연장</div>
                <p style={{ margin: 0, flexGrow: 1, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                  마감을 미뤄 견적을 더 받습니다. 새 마감 뒤에 조건을 다시 보고 자동으로 진행합니다.
                </p>
                <button type="button" className="btn-sm btn-outline" onClick={onExtendDeadline} style={{ justifyContent: 'center', height: '36px' }}>
                  마감 연장
                </button>
              </div>

              <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>재비딩</div>
                <p style={{ margin: 0, flexGrow: 1, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                  새 차수를 시작합니다. 지금까지 받은 견적은 후보로 그대로 남습니다.
                </p>
                <button type="button" className="btn-sm btn-outline" disabled={rebidding} onClick={onRebid} style={{ justifyContent: 'center', height: '36px' }}>
                  {rebidding ? '재비딩 중...' : '새 차수 시작'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            결정하기 전까지 이 건은 더 진행되지 않습니다. 조건 기준은 회사 정책에서 바꿀 수 있습니다.
          </span>
          <button type="button" className="btn-outline" onClick={onClose}>나중에</button>
        </div>
      </div>
    </div>
  );
}
