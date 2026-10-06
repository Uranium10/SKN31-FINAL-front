// Dev-only actual workspace fixture. No production network or mutations.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProcurementWorkspace from '../src/procurement/ProcurementWorkspace';
import { assistantNavigationCommand } from '../src/components/assistant/assistantNavigation.js';
import { initialMaterialRequests, initialVendorGroups, initialPOItems } from '../src/procurement/mock/data';
import '../src/index.css';
const numbers = new Map<string,string>();
for (const row of [...initialMaterialRequests, ...initialVendorGroups, ...initialPOItems]) {
  if (!numbers.has(row.mrNo)) numbers.set(row.mrNo, `MAT-MR-2026-${98001 + numbers.size}`);
  row.mrNo = numbers.get(row.mrNo)!;
}
window.fetch = async (url) => String(url).endsWith('/capabilities')
  ? Response.json({ can_manage:false, can_approve_po:false, roles:[] })
  : Response.json({ detail:'Fixture: network blocked' }, { status:403 });
export function Preview() {
  const [command, setCommand] = useState(null);
  return <><div style={{ padding:10, position:'relative', zIndex:1000, background:'white' }}>
    <strong>모의 화면 · 외부 통신 차단 </strong>
    {(['mr-list','vendor-select','po-manage'] as const).map((target,i) => <button key={target} onClick={() => setCommand({
      ...assistantNavigationCommand({ type:'navigate_with_filters', target, highlight_reference:[initialMaterialRequests[5].mrNo,initialVendorGroups[1].mrNo,initialPOItems[0].mrNo][i] }), id:Date.now(),
    })}>챗봇 {target} 바로가기</button>)}
  </div><ProcurementWorkspace currentUser={{ id:'synthetic-ui-user' }} onLogout={() => {}} assistantCommand={command} /></>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
