import { useEffect, useState } from 'react';
import { fetchWithAuth } from '../../utils/auth';
import type { AiDecisionLogEntry } from '../api/aiDecisions';

const labels: Record<string, string> = {
  site_selection: '공식 사이트 선택', contact_extraction: '연락처 확인',
  company_name_extraction: '공급사 정보 확인', item_group_spec_definition: '필수 규격 정의',
  quotation_specification_evaluation: '견적 규격 평가',
};

/** Loaded only when explicitly opened; no per-row polling, global audit access,
 * or model calls. React renders stored reasons as plain text, not HTML. */
export function CaseDecisionTimeline({ caseId }: { caseId: string }) {
  const [opened, setOpened] = useState(false);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<AiDecisionLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    void (async () => {
      try {
        const response = await fetchWithAuth(`/api/procurement/cases/${encodeURIComponent(caseId)}/decisions?limit=30&offset=${page * 30}`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 403 ? '이 구매 건의 판단 기록을 볼 권한이 없습니다.' : '판단 기록을 불러오지 못했습니다.');
        const body = await response.json();
        if (!controller.signal.aborted) { setItems(body.items); setTotal(body.count); }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '기록 조회 실패');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [caseId, opened, page, revision]);
  return <section className="work-decisions">
    <button type="button" className="work-link" aria-expanded={opened} onClick={() => setOpened(!opened)}>AI 판단 기록 {opened ? '접기' : '보기'}</button>
    {opened && <div aria-busy={loading}>
      <div className="work-decisions-toolbar"><span>최근 기록부터 · {total}건</span><button type="button" className="work-link" disabled={loading} onClick={() => setRevision(n => n + 1)}>새로고침</button></div>
      {error && <p role="alert">{error}</p>}
      {loading ? <p role="status">판단 기록을 불러오는 중입니다.</p> : !error && <>
        <ol className="work-timeline">{items.map(item => <li key={item.id}>
          <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('ko-KR')}</time>
          <strong>{labels[item.node] || 'AI 판단'}{item.quotation_id && ` · ${item.quotation_id}`}</strong>
          <p>{item.reason || '저장된 판단 근거가 없습니다.'}</p>
        </li>)}</ol>
        {!items.length && <p>아직 저장된 AI 판단 기록이 없습니다.</p>}
        <div className="work-decisions-toolbar"><button type="button" className="work-link" disabled={page === 0} onClick={() => setPage(n => n - 1)}>이전 기록</button>
          <span>{page + 1} / {Math.max(1, Math.ceil(total / 30))}</span><button type="button" className="work-link" disabled={(page + 1) * 30 >= total} onClick={() => setPage(n => n + 1)}>다음 기록</button></div>
      </>}
    </div>}
  </section>;
}
