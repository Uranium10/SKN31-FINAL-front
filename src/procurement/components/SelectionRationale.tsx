import { Sparkles, UserCheck } from 'lucide-react';
import type { PendingHumanTask } from '../types';

interface RankingRow {
  supplier: string;
  quotationId: string;
  amount: number | null;
  overall: number | null;
  price: number | null;
  delivery: number | null;
  specification: number | null;
  scorecard: number | null;
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const score = (value: number | null): string => (value === null ? '-' : value.toFixed(1));

/**
 * PO 발송 전 승인 화면의 선정 근거.
 *
 * 자동 선정이 기본이 되면 이 승인이 사람이 보는 마지막 관문이라, 금액과
 * 협력사만 보여주면 판단할 근거가 없다. 왜 이 협력사가 뽑혔는지, 2순위와
 * 뭐가 달랐는지가 같이 있어야 승인이든 반려든 결정할 수 있다.
 */
export function SelectionRationale({
  task,
  selectedSupplier,
}: {
  task?: PendingHumanTask;
  selectedSupplier: string;
}) {
  const payload = (task?.payload ?? {}) as Record<string, unknown>;
  const rawRanking = Array.isArray(payload.quotation_ranking) ? payload.quotation_ranking : [];
  const ranking: RankingRow[] = rawRanking
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map((row) => {
      const weights = (row.applied_weights && typeof row.applied_weights === 'object'
        ? row.applied_weights
        : {}) as Record<string, unknown>;
      return {
        supplier: str(row.supplier_name) || str(row.supplier) || '-',
        quotationId: str(row.quotation_id) || str(row.name),
        amount: num(row.total_amount ?? row.grand_total),
        overall: num(row.overall_score),
        price: weights.price === undefined ? null : num(row.price_score),
        delivery: weights.delivery === undefined ? null : num(row.delivery_score),
        specification: weights.specification === undefined ? null : num(row.specification_score),
        scorecard: weights.scorecard === undefined ? null : num(row.scorecard_score),
      };
    })
    .sort((left, right) => (right.overall ?? 0) - (left.overall ?? 0));

  if (ranking.length === 0) return null;

  const isAuto = str(payload.selection_mode) === 'auto';
  const chosen = ranking.find((row) => row.supplier === selectedSupplier) ?? ranking[0];
  const runnerUp = ranking.find((row) => row !== chosen);
  const amountGap = chosen.amount !== null && runnerUp?.amount != null
    ? runnerUp.amount - chosen.amount
    : null;
  const scoreGap = chosen.overall !== null && runnerUp?.overall != null
    ? chosen.overall - runnerUp.overall
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', borderRadius: '8px',
        backgroundColor: isAuto ? 'var(--primary-soft)' : 'var(--bg-input)',
      }}>
        <span style={{ flexShrink: 0, color: isAuto ? 'var(--primary-hover)' : 'var(--text-muted)', marginTop: '1px' }}>
          {isAuto ? <Sparkles size={15} /> : <UserCheck size={15} />}
        </span>
        <span style={{ fontSize: '12px', lineHeight: 1.6, color: 'var(--text-main)' }}>
          {isAuto
            ? <><b>이 건은 사람 확인 없이 자동 선정됐습니다.</b> RFQ 발송부터 견적 평가·선정·수주 접수 요청까지 조건을 통과해 진행됐습니다. 아래 근거를 확인하고 승인 여부를 정해 주세요.</>
            : <>담당자가 직접 선정한 건입니다. 발주 전 마지막 확인입니다.</>}
        </span>
      </div>

      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
          왜 이 협력사인지 — 종합점수 비교
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: '8px', padding: '7px 12px', backgroundColor: 'var(--bg-input)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
            <span style={{ width: '104px', flexShrink: 0 }}>협력사</span>
            <span style={{ width: '104px', flexShrink: 0, textAlign: 'right' }}>견적금액</span>
            <span style={{ flexGrow: 1 }}>가격·납기·규격·이력</span>
            <span style={{ width: '46px', flexShrink: 0, textAlign: 'right' }}>종합</span>
          </div>
          {ranking.slice(0, 4).map((row) => {
            const picked = row === chosen;
            return (
              <div
                key={row.quotationId || row.supplier}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px',
                  borderTop: '1px solid var(--border-color)',
                  backgroundColor: picked ? 'var(--success-bg)' : 'transparent',
                }}
              >
                <span style={{ width: '104px', flexShrink: 0, fontSize: '12px', fontWeight: picked ? 700 : 500, color: 'var(--text-main)' }}>
                  {row.supplier}
                  {picked && <span style={{ display: 'block', fontSize: '10px', color: 'var(--success)', fontWeight: 700 }}>선정</span>}
                </span>
                <span style={{ width: '104px', flexShrink: 0, textAlign: 'right', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-main)' }}>
                  {row.amount === null ? '-' : `₩${row.amount.toLocaleString()}`}
                </span>
                <span style={{ flexGrow: 1, fontSize: '11px', color: 'var(--text-muted)' }}>
                  {score(row.price)} · {score(row.delivery)} · {score(row.specification)} · {score(row.scorecard)}
                </span>
                <span style={{ width: '46px', flexShrink: 0, textAlign: 'right', fontSize: '13px', fontWeight: 700, color: picked ? 'var(--success)' : 'var(--text-main)' }}>
                  {score(row.overall)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {runnerUp && (
        <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-input)', borderRadius: '8px', fontSize: '12px', lineHeight: 1.6, color: 'var(--text-main)' }}>
          <b>2순위와의 차이</b> — {chosen.supplier}가 {runnerUp.supplier}보다{' '}
          {amountGap !== null && amountGap !== 0
            ? <>{amountGap > 0 ? '₩' : '-₩'}{Math.abs(amountGap).toLocaleString()} {amountGap > 0 ? '저렴하고' : '비싸고'} </>
            : ''}
          종합점수가 {scoreGap === null ? '-' : `${scoreGap.toFixed(1)}점`} 높습니다.
          {scoreGap !== null && scoreGap < 5 && (
            <span style={{ color: 'var(--warning)', fontWeight: 600 }}> 두 곳이 박빙이라 한 번 더 살펴보시길 권합니다.</span>
          )}
        </div>
      )}
    </div>
  );
}
