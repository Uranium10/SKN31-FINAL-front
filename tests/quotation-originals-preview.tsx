// Development-only fixture: no network, ERP, email, or GPU calls.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import '../src/procurement/ProcurementWorkspace.css';
import { QuotationOriginals } from '../src/procurement/components/QuotationOriginals';

const filenames = [
  '2026년_최종_공급업체_견적서_기술규격및특약사항_수정본_최최종_20260929.pdf',
  'Quotation_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.repeat(4) + '.xlsx',
  '짧은 견적.pdf',
];
window.fetch = async (input) => {
  const url = String(input);
  if (url.includes('/quotation-attachments/download')) return new Response('fixture only');
  if (url.includes('/quotation-attachments?')) return Response.json({items: filenames.map((file_name, i) => ({file_name, file_id: String(i)}))});
  throw new Error('Network disabled in layout fixture');
};

export function AttachmentPreview() {
  const [width, setWidth] = useState(160);
  const [result, setResult] = useState('아직 검사 전');
  const check = () => {
    const cell = document.querySelector('[data-attachment-cell]')!.getBoundingClientRect();
    const buttons = [...document.querySelectorAll('.quotation-original-button')];
    const bounded = buttons.every(el => { const r = el.getBoundingClientRect(); return r.left >= cell.left && r.right <= cell.right; });
    const labels = [...document.querySelectorAll('.quotation-original-name')];
    const fullNames = buttons.length === filenames.length && buttons.every((el, i) => el.getAttribute('title') === filenames[i]);
    setResult(`${bounded && fullNames ? 'PASS' : 'FAIL'} · 파일 ${buttons.length}개 · 줄임표 ${labels.filter(el => el.scrollWidth > el.clientWidth).length}개 · 전체 파일명 title ${fullNames ? '보존' : '누락'}`);
  };
  return <div className="procurement-shell" style={{display:'block', padding: 32, minHeight:'100vh', boxSizing:'border-box'}}>
    <h2>제출 첨부자료 · 긴 파일명 검증</h2>
    <p>실제 컴포넌트 / 모의 파일 / 외부 요청 차단</p>
    <button onClick={() => setWidth(160)}>기본 160px</button>{' '}
    <button onClick={() => setWidth(110)}>좁은 110px</button>{' '}
    <button onClick={check}>겹침 검사</button><p role="status">{result}</p>
    <table className="custom-table" style={{width:'100%', tableLayout:'fixed'}}>
      <thead><tr><th style={{width:120}}>협력사</th><th style={{width}}>제출 첨부자료</th><th>회신 요약 및 AI 평가</th></tr></thead>
      <tbody><tr><td>테스트 협력사</td><td data-attachment-cell><QuotationOriginals caseId="QA" quotationId="SQ-QA"/></td><td>규격과 수량이 일치합니다. 파일명이 이 평가 영역을 침범하면 안 됩니다.</td></tr></tbody>
    </table>
  </div>;
}
createRoot(document.getElementById('root')!).render(<AttachmentPreview/>);
