import type { WorkProgress } from '../api/workProgress';

/** Elapsed since an observed update, NOT elapsed model execution time. */
export function progressAge(value?: string | null, now = Date.now()): string {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp) || timestamp > now) return '확인 시각 없음';
  const minutes = Math.floor((now - timestamp) / 60_000);
  return minutes < 1 ? '1분 미만' : minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

export function progressReason(progress?: WorkProgress): string | undefined {
  if (!progress || !['QUOTATION_COLLECTION', 'SUPPLIER_SELECTION'].includes(progress.stage)) return undefined;
  return progress.waiting_reason || undefined;
}

export function needsProgressReview(progress?: WorkProgress): boolean {
  return !!progress && ['QUOTATION_COLLECTION', 'SUPPLIER_SELECTION'].includes(progress.stage)
    && ['BLOCKED', 'UNCERTAIN'].includes(progress.deadline_status || '');
}

export function progressStepLabel(step: string): string {
  const labels: Record<string, string> = {
    checking_mr_item: '품목·규격 확인', awaiting_substitute_selection: '요청부서 대체품 선택 대기',
    deciding_bidding: '견적 경쟁 여부 확인', resolving_supplier_pool: '기존 공급사 확인',
    searching_suppliers: '신규 공급사 탐색', supplier_search_completed: '공급사 탐색 완료',
    awaiting_rfq_selection: '견적 요청 대상 선택 대기', rfq_created: '견적 요청 생성 완료',
    awaiting_quotation_check: '견적 회신·평가 대기', awaiting_final_selection: '최종 업체 선택 대기',
    awaiting_po_approval: '발주 승인 대기', awaiting_supplier_pr_response: '공급사 발주 확인 대기',
    po_created: '발주서 생성 완료', human_review: '담당자 확인 필요',
  };
  return labels[step] || '단계 처리 기록';
}
