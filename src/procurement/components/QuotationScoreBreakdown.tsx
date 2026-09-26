import type { QuotationScoreBreakdown as Breakdown } from '../types';

const FACTORS: { key: 'price' | 'delivery' | 'specification' | 'scorecard'; label: string }[] = [
  { key: 'price', label: '가격' },
  { key: 'delivery', label: '납기' },
  { key: 'specification', label: '규격' },
  { key: 'scorecard', label: '평가이력' },
];

const scoreOf = (breakdown: Breakdown, key: typeof FACTORS[number]['key']): number | undefined => {
  switch (key) {
    case 'price': return breakdown.priceScore;
    case 'delivery': return breakdown.deliveryScore;
    case 'specification': return breakdown.specificationScore;
    default: return breakdown.scorecardScore;
  }
};

const scoreColor = (score: number): string => (
  score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)'
);

/**
 * 견적 1건의 종합점수 내역. 백엔드 quotation_ranker가 계산한 4항목 점수와
 * 실제 적용된 가중치, 빠진 항목(단독 응찰의 가격·신규 협력사의 평가이력 등),
 * 페널티를 그대로 보여준다 - "왜 이 순위인지"를 사람이 바로 검증할 수 있게.
 */
export function QuotationScoreBreakdown({ breakdown, compact = false }: { breakdown: Breakdown; compact?: boolean }) {
  const missing = new Map(breakdown.missingFactors.map((row) => [row.factor, row.reason]));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '5px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {FACTORS.map(({ key, label }) => {
          const score = scoreOf(breakdown, key);
          const weight = breakdown.appliedWeights[key];
          const missingReason = missing.get(key);
          if (missingReason || score === undefined || weight === undefined) {
            return (
              <span
                key={key}
                title={missingReason ?? '이 항목은 이번 계산에서 제외되었습니다.'}
                style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', border: '1px dashed var(--border-color)', color: 'var(--text-dim)' }}
              >
                {label} 제외
              </span>
            );
          }
          return (
            <span
              key={key}
              title={`${label} ${score.toFixed(1)}점 × 가중치 ${(weight * 100).toFixed(0)}%${key === 'scorecard' && breakdown.scorecardCount ? ` (평가 ${breakdown.scorecardCount}건 평균)` : ''}`}
              style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
            >
              {label} <b style={{ color: scoreColor(score) }}>{score.toFixed(0)}</b>
              <span style={{ color: 'var(--text-dim)' }}> ×{(weight * 100).toFixed(0)}%</span>
            </span>
          );
        })}
      </div>
      {breakdown.penalties.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {breakdown.penalties.map((penalty) => (
            <span
              key={penalty.code}
              className={`badge ${penalty.requiresConfirmation ? 'badge-red' : 'badge-yellow'}`}
              style={{ fontSize: '10px' }}
              title={penalty.evidence.join(' / ') || undefined}
            >
              −{penalty.points} {penalty.label}{penalty.requiresConfirmation ? ' · 선정 시 확인' : ''}
            </span>
          ))}
        </div>
      )}
      {!compact && breakdown.missingFactors.length > 0 && (
        <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
          {breakdown.missingFactors.map((row) => row.reason).join(' · ')} → 나머지 항목 비율로 다시 계산
        </div>
      )}
      {!compact && breakdown.warnings.length > 0 && (
        <div style={{ fontSize: '10px', color: 'var(--warning)' }}>참고: {breakdown.warnings.join(' / ')}</div>
      )}
    </div>
  );
}
