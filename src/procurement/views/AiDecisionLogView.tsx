import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Database, RefreshCw, Search } from 'lucide-react';
import {
  listAiDecisions,
  type AiDecisionLogEntry,
} from '../api/aiDecisions';
import './AiDecisionLogView.css';

const PAGE_SIZE = 100;
const nodeLabels: Record<string, string> = {
  site_selection: '공식 사이트 선택',
  contact_extraction: '연락처 추출',
  company_name_extraction: '회사명 추출',
  item_group_spec_definition: '품목군 필수 규격 정의',
  quotation_specification_evaluation: '견적 규격 평가',
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR', { hour12: false });
};

export function AiDecisionLogView({ active }: { active: boolean }) {
  const [items, setItems] = useState<AiDecisionLogEntry[]>([]);
  const [nodes, setNodes] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (nextOffset: number) => {
    setLoading(true);
    setError('');
    try {
      const result = await listAiDecisions({
        node: selectedNode || undefined,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setItems(result.items);
      setNodes(result.nodes);
      setCount(result.count);
      setOffset(result.offset);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'AI 판단 로그를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [selectedNode]);

  useEffect(() => {
    if (active) void load(0);
  }, [active, load]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ko-KR');
    if (!normalized) return items;
    return items.filter((item) => [
      item.node,
      nodeLabels[item.node] ?? '',
      item.reason ?? '',
      item.case_id ?? '',
      item.mr_name ?? '',
      item.rfq_name ?? '',
      item.quotation_id ?? '',
      item.evaluation_source ?? '',
    ].some((value) => value.toLocaleLowerCase('ko-KR').includes(normalized)));
  }, [items, query]);

  return (
    <section className="ai-decision-log-view" aria-busy={loading}>
      <div className="ai-log-summary-card">
        <div className="ai-log-summary-icon"><BrainCircuit size={24} /></div>
        <div>
          <h3>AI 판단 로그</h3>
          <p>구매 자동화 과정에서 AI가 내린 판단과 근거를 최신순으로 확인합니다.</p>
        </div>
        <div className="ai-log-count"><Database size={15} /> 총 {count.toLocaleString()}건</div>
      </div>

      <div className="ai-log-toolbar">
        <label>
          <span>판단 단계</span>
          <select
            value={selectedNode}
            onChange={(event) => {
              setSelectedNode(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">전체 단계</option>
            {nodes.map((node) => <option key={node} value={node}>{nodeLabels[node] ?? node}</option>)}
          </select>
        </label>
        <label className="ai-log-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="근거, MR, RFQ, 견적 번호 검색"
          />
        </label>
        <button type="button" className="btn-outline" disabled={loading} onClick={() => void load(offset)}>
          <RefreshCw size={14} className={loading ? 'spin-icon' : undefined} /> 새로고침
        </button>
      </div>

      {error && <div className="ai-log-error" role="alert">{error}</div>}

      <div className="table-container ai-log-table-wrap">
        <table className="custom-table ai-log-table">
          <thead><tr><th>기록 시각</th><th>판단 단계</th><th>구매 건</th><th>평가 대상</th><th>점수 / 모델</th><th>판단 근거</th></tr></thead>
          <tbody>
            {!loading && visibleItems.length === 0 && (
              <tr><td colSpan={6} className="ai-log-empty">표시할 AI 판단 로그가 없습니다.</td></tr>
            )}
            {visibleItems.map((item) => (
              <tr key={item.id}>
                <td className="ai-log-date">{formatDateTime(item.created_at)}</td>
                <td><span className="ai-log-node">{nodeLabels[item.node] ?? item.node}</span><small>{item.node}</small></td>
                <td className="ai-log-case">
                  <strong>{item.mr_name ?? '연결 없음'}</strong>
                  {item.case_id && <small>{item.case_id}</small>}
                </td>
                <td className="ai-log-target">
                  {item.rfq_name ? <span>RFQ {item.rfq_name}</span> : <span>-</span>}
                  {item.quotation_id && <small>견적 {item.quotation_id}</small>}
                </td>
                <td className="ai-log-evaluation">
                  {item.score !== null ? <strong>{item.score.toFixed(1)}점</strong> : <span>-</span>}
                  {item.evaluation_source && <small>{item.evaluation_source}</small>}
                </td>
                <td className="ai-log-reason">{item.reason || '근거가 기록되지 않았습니다.'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ai-log-pagination">
        <span>{count === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE_SIZE, count)} / {count}</span>
        <button type="button" className="btn-outline" disabled={loading || offset === 0} onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}>이전</button>
        <button type="button" className="btn-outline" disabled={loading || offset + PAGE_SIZE >= count} onClick={() => void load(offset + PAGE_SIZE)}>다음</button>
      </div>
    </section>
  );
}
