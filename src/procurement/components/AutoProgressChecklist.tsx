import type { AutoProgressVerdict } from '../types';

const STATUS_STYLE: Record<string, { color: string; background: string; label: string }> = {
  passed: { color: 'var(--success)', background: 'var(--success-bg)', label: '통과' },
  blocked: { color: 'var(--danger)', background: 'var(--danger-bg)', label: '걸림' },
  unknown: { color: 'var(--text-muted)', background: 'var(--bg-input)', label: '판단 불가' },
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'passed') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (status === 'blocked') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/**
 * 자동 진행 조건을 체크리스트로 보여준다.
 *
 * 걸린 항목만 문장으로 알려주면 "왜 멈췄지"에서 생각이 끝나는데, 통과한
 * 항목까지 함께 보여주면 "이것만 해결하면 되는구나"가 바로 읽힌다. 이
 * 화면이 자동화 설계 전체에서 사람이 가장 자주 마주치는 지점이다.
 */
export function AutoProgressChecklist({ verdict }: { verdict: AutoProgressVerdict }) {
  if (verdict.checks.length === 0) return null;
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
      {verdict.checks.map((check, index) => {
        const style = STATUS_STYLE[check.status] ?? STATUS_STYLE.unknown;
        return (
          <div
            key={check.code}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
              borderTop: index === 0 ? 'none' : '1px solid var(--border-color)',
              backgroundColor: check.status === 'blocked' ? 'var(--danger-bg)' : 'transparent',
            }}
          >
            <span style={{ flexShrink: 0, color: style.color, display: 'inline-flex' }}>
              <StatusIcon status={check.status} />
            </span>
            <span style={{
              width: '200px', flexShrink: 0, fontSize: '13px',
              fontWeight: check.status === 'blocked' ? 700 : 400,
              color: check.status === 'unknown' ? 'var(--text-muted)' : 'var(--text-main)',
            }}>
              {check.label}
            </span>
            <span style={{
              flexGrow: 1, fontSize: '12px', lineHeight: 1.5,
              color: check.status === 'blocked' ? 'var(--danger)' : 'var(--text-muted)',
              fontWeight: check.status === 'blocked' ? 600 : 400,
            }}>
              {check.detail}
            </span>
            <span style={{
              flexShrink: 0, fontSize: '11px', fontWeight: 700, color: style.color,
              padding: '2px 8px', borderRadius: '5px', backgroundColor: style.background,
            }}>
              {style.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
