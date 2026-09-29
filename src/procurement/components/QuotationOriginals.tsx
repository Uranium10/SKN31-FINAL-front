import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { listQuotationOriginals, downloadQuotationOriginal, type QuotationOriginalFile } from '../api/cases';
import './QuotationOriginals.css';

/** Private ERP URLs/credentials never reach the browser; every download checks case access. */
export function QuotationOriginals({caseId, quotationId}: {caseId: string; quotationId: string}) {
  const [files, setFiles] = useState<QuotationOriginalFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    setBusy(true); setError('');
    try { setFiles(await listQuotationOriginals(caseId, quotationId)); }
    catch (e) { setError(e instanceof Error ? e.message : '원본 목록을 가져오지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const download = async (file: QuotationOriginalFile) => {
    setBusy(true); setError('');
    try {
      const blob = await downloadQuotationOriginal(caseId, quotationId, file.file_id);
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = file.file_name; document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : '다운로드에 실패했습니다.'); }
    finally { setBusy(false); }
  };
  return <div className="quotation-originals">
    {files === null && <button type="button" className="btn-sm btn-outline quotation-original-button" disabled={busy} onClick={() => void load()}><Paperclip size={12}/><span className="quotation-original-name">{busy ? '확인 중' : '원본 확인'}</span></button>}
    {files?.map(file => <button key={file.file_id} type="button" className="btn-sm btn-outline quotation-original-button" disabled={busy} onClick={() => void download(file)} title={file.file_name} aria-label={`${file.file_name} 다운로드`}><Paperclip size={12}/><span className="quotation-original-name">{file.file_name}</span></button>)}
    {files?.length === 0 && <span className="quotation-original-message">등록된 원본 첨부 없음</span>}
    {error && <span role="alert" className="quotation-original-message" style={{color: 'var(--danger)'}}>{error}</span>}
  </div>;
}
