// Development-only fixture page. No backend calls and no authenticated actions.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardView } from '../src/procurement/views/DashboardView';
import { initialMaterialRequests, initialPOItems, initialNotifications } from '../src/procurement/mock/data';
const stages = ['MR_REVIEW', 'RFQ_TARGET_SELECTION', 'SUPPLIER_SELECTION', 'PRE_PO_APPROVAL', 'SUPPLIER_RECOMMENDATION', 'PO_CREATION', 'SUBSTITUTE_DECISION', 'QUOTATION_COLLECTION', 'PR_RESPONSE_WAITING', 'DELIVERY'];
const qaNow = Date.now();
const dateKst = (days: number) => new Date(qaNow + (days * 24 + 9) * 3600000).toISOString().slice(0, 10);
const requests = stages.map((stage, index) => ({
  ...initialMaterialRequests[index % initialMaterialRequests.length], id: String(index), mrNo: 'QA-MR-' + index,
  workflowStage: stage, workflowStatus: index === 4 || index === 5 ? 'RUNNING' : 'WAITING_INPUT',
  dueDate: dateKst(3),
  quotationDeadlineAt: index === 7 ? new Date(qaNow + 3600000).toISOString() : undefined,
  workflowError: index === 0 ? '요청 규격 확인이 필요합니다.' : undefined,
}));
// All timeline requests stay inside this fixture: never contact real APIs.
window.fetch = async () => new Response(JSON.stringify({ count: 2, items: [
  { id: 'qa-2', node: 'quotation_specification_evaluation', quotation_id: 'QA-SQ-2', reason: '요청한 소재와 크기가 견적서에 모두 포함되어 있습니다.', created_at: new Date().toISOString() },
  { id: 'qa-1', node: 'site_selection', reason: '공식 홈페이지의 사업자 정보와 품목 공급 가능 여부를 확인했습니다.', created_at: new Date(Date.now() - 180000).toISOString() },
] }), { headers: { 'Content-Type': 'application/json' } });
const progress = {
  error: '', checkedAt: new Date().toISOString(), truncated: false, refresh: () => {},
  items: requests.map(r => ({ case_id: r.id, mr_name: r.mrNo, status: r.workflowStatus,
    stage: r.workflowStage, version: 1, updated_at: new Date(qaNow - (r.id === '4' ? 5 * 3600000 : 180000)).toISOString(),
    ...(r.workflowStage === 'QUOTATION_COLLECTION' ? { deadline_status: 'WAITING', waiting_reason: '마감 전 제출 견적 2건의 규격 평가가 끝나지 않았습니다. 평가 완료 후 조건을 다시 확인합니다.', checked_at: new Date().toISOString(), metrics: { elapsed_ms: 850, erp_calls: 4 } } : {}),
  })),
};
export function Preview() {
  const [action, setAction] = useState('상세 정보를 펼쳐 이동 버튼을 확인하세요.');
  return <main style={{ maxWidth: 1440, margin: 'auto', padding: 28 }}>
    <p style={{ fontSize: 12 }}>로컬 검증용 · {action}</p>
    <DashboardView requests={requests} poItems={initialPOItems} notifications={initialNotifications}
      progress={progress}
      setCurrentTab={tab => setAction(tab)} onOpenTask={(tab, mr) => setAction(tab + ' / ' + mr)} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
