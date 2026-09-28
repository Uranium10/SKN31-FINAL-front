// Local fixture entry, not imported by the production build. All HTTP is mocked;
// policy publishing, email, workflow and GPU operations cannot reach a server.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import '../src/procurement/ProcurementWorkspace.css';
import { CompanyPolicyView } from '../src/procurement/views/CompanyPolicyView';
import { POManagementView } from '../src/procurement/views/POManagementView';
import { VendorSelectionView } from '../src/procurement/views/VendorSelectionView';
import { MRListView } from '../src/procurement/views/MRListView';
import type { VendorSelectionGroup } from '../src/procurement/types';
import { DEFAULT_AUTOMATION, DEFAULT_QUOTATION_WEIGHTS, type CompanyPolicy } from '../src/procurement/api/companyPolicy';
import { initialPOItems, initialVendorGroups, initialMaterialRequests } from '../src/procurement/mock/data';
const policy: CompanyPolicy = {
  supplier_sources: ['tavily', 'narajangteo', 'db'],
  rules: { urgent_lead_days: 3, bidding_amount: 1000000, pattern_min_orders: 3,
    irregular_cv: .5, cycle_overdue_multiplier: 1.5, inactive_months: 6,
    min_competing_suppliers: 3, supplier_refresh_years: 2, quotation_priority: 'price_then_delivery',
    ...DEFAULT_AUTOMATION, ...DEFAULT_QUOTATION_WEIGHTS },
  guidance: { item_specification: '누락된 필수 규격을 확인합니다.', substitute_selection: '요청한 용도에 맞는 재고만 추천합니다.' },
};
const version = { version: 1, policy, reason: '레이아웃 검증용', published_by: 'QA', published_at: '2026-09-28T00:00:00Z' };
window.fetch = async (input, options) => {
  if ((options?.method ?? 'GET') !== 'GET') return Response.json({ detail: '검증용 화면에서는 저장하지 않습니다.' }, { status: 403 });
  const url = String(input);
  if (url.endsWith('/company-policy')) return Response.json({ active: version, history: [version] });
  if (url.endsWith('/runpod-worker')) return Response.json({ enabled: false, default_minutes: 60, message: '모의 화면 · GPU 호출 없음' });
  if (url.endsWith('/email-allowlist')) return Response.json({ revision: 'fixture', recipients: ['qa@example.invalid'], delivery_mode: 'custom_only', enabled: true, editable: true });
  return Response.json({ detail: 'Network disabled in preview' }, { status: 403 });
};
const noop = () => {};
const vendorColorCases: VendorSelectionGroup[] = [
  ...initialVendorGroups,
  { ...initialVendorGroups[0], id: 'qa-prepare', mrNo: 'QA-RFQ-PREPARE', selectedSupplierId: undefined,
    rfqSent: false, workflowStage: 'RFQ_TARGET_SELECTION', targetDueDate: '2099-10-10' },
  { ...initialVendorGroups[0], id: 'qa-selection', mrNo: 'QA-RFQ-SELECTION', selectedSupplierId: undefined,
    rfqSent: true, workflowStage: 'SUPPLIER_SELECTION', deadlineDDay: 0, isExtended: true },
];
// Exported for Fast Refresh lint; this is a development-only entry.
export function LayoutPreview() {
  const [tab, setTab] = useState('policy');
  const [approver, setApprover] = useState(false);
  const [manyRows, setManyRows] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const vendorRows = manyRows ? Array.from({ length: 24 }, (_, i) => ({ ...vendorColorCases[i % vendorColorCases.length], id: `qa-vendor-${i}`, mrNo: `QA-MR-${i}` })) : vendorColorCases;
  const poRows = manyRows ? Array.from({ length: 24 }, (_, i) => ({ ...initialPOItems[i % initialPOItems.length], id: `qa-po-${i}`, mrNo: `QA-MR-${i}`, promisedDeliveryDate: i % 2 ? '2026-10-03T09:30:00Z' : '2026-10-03' })) : initialPOItems;
  const mrRows = Array.from({ length: manyRows ? 24 : 3 }, (_, i) => ({ ...initialMaterialRequests[0], id: `qa-mr-${i}`, mrNo: `QA-MR-${i}` }));
  return <div className="procurement-shell" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
    <header style={{ padding: 14, display: 'flex', gap: 12 }}><strong>로컬 레이아웃 검증 · 저장/발송 차단</strong>
      <button onClick={() => setTab('policy')}>정책 미리보기</button><button onClick={() => setTab('po')}>PO 미리보기</button>
      <button onClick={() => setTab('vendor')}>협력사 미리보기</button>
      <button onClick={() => setTab('mr')}>MR 미리보기</button>
      <button onClick={() => setManyRows(value => !value)}>많은 행: {manyRows ? 'ON' : 'OFF'}</button>
      <button onClick={() => setApprover(value => !value)}>모의 PO 승인 권한: {approver ? '있음' : '없음'}</button>
    </header>
    <main className="view-content" style={{ minHeight: 0, overflow: 'auto', flex: 1, padding: 28 }}>
      {tab === 'policy' ? <CompanyPolicyView roles={['Purchase Master Manager']} /> : tab === 'mr' ?
        <MRListView requests={mrRows} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          onOpenSpecModalByItemCode={noop} onApprove={noop} onOpenRejectModal={noop} onOpenAttachmentsModal={noop}
          onStartSubstituteCheck={noop} onSubstituteSelectedInErp={noop} onConfirmSubstituteUnused={noop} /> : tab === 'vendor' ?
        <VendorSelectionView vendorGroups={vendorRows} completedGroups={initialVendorGroups} onSelectSupplier={() => false}
          onSendPO={noop} onWithdrawSupplierSelection={noop} onCancelMR={() => false}
          onRebidQuotations={() => false} onOpenSpecModalByItemCode={noop} onExtendDeadline={() => false}
          onSendRFQ={() => false} onCheckQuotations={() => false} onAutoReview={() => false} /> :
        <POManagementView canApprovePO={approver} poItems={poRows.map((row, index) => ({ ...row, itemName: '긴 품목명이 좁은 컬럼에서 말줄임 되는지 확인하는 테스트 품목명', ...(index === 0 ? { poCreated: false, pendingTask: { taskId: 'qa', taskType: 'po_approval', title: '모의 승인', inputSchema: {}, payload: {} } } : {}) }))}
          onCreatePO={noop} onStartOrder={noop} onRequestPR={noop} onSupplierAcceptOrder={noop}
          onReturnToVendorSelection={noop} onCancelMR={noop} onMarkArrived={noop} onSubmitScorecard={noop} />}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<LayoutPreview />);
