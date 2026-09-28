// Development-only fixture page. No backend calls and no authenticated actions.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardView } from '../src/procurement/views/DashboardView';
import { initialMaterialRequests, initialPOItems, initialNotifications } from '../src/procurement/mock/data';
const stages = ['MR_REVIEW', 'RFQ_TARGET_SELECTION', 'SUPPLIER_SELECTION', 'PRE_PO_APPROVAL', 'SUPPLIER_RECOMMENDATION', 'PO_CREATION', 'SUBSTITUTE_DECISION', 'QUOTATION_COLLECTION', 'PR_RESPONSE_WAITING', 'DELIVERY'];
const requests = stages.map((stage, index) => ({
  ...initialMaterialRequests[index % initialMaterialRequests.length], id: String(index), mrNo: 'QA-MR-' + index,
  workflowStage: stage, workflowStatus: index === 4 || index === 5 ? 'RUNNING' : 'WAITING_INPUT',
}));
function Preview() {
  const [action, setAction] = useState('상세 정보를 펼쳐 이동 버튼을 확인하세요.');
  return <main style={{ maxWidth: 1440, margin: 'auto', padding: 28 }}>
    <p style={{ fontSize: 12 }}>로컬 검증용 · {action}</p>
    <DashboardView requests={requests} poItems={initialPOItems} notifications={initialNotifications}
      setCurrentTab={tab => setAction(tab)} onOpenTask={(tab, mr) => setAction(tab + ' / ' + mr)} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
