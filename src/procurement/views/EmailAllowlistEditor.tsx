import { useEffect, useState } from 'react';
import { getEmailAllowlist, saveEmailAllowlist, type EmailAllowlist } from '../api/companyPolicy';

/** This edits recipients only, never TEST_MODE or the server file path. */
export function EmailAllowlistEditor() {
  const [data, setData] = useState<EmailAllowlist | null>(null);
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const addresses = [...new Set(text.split(/\r?\n/).map(v => v.trim().toLowerCase()).filter(Boolean))].sort();
  const dirty = Boolean(data && JSON.stringify(addresses) !== JSON.stringify(data.recipients));
  const editable = data?.editable && data.enabled && data.delivery_mode === 'custom_only';
  const added = addresses.filter(a => !data?.recipients.includes(a));
  const removed = data?.recipients.filter(a => !addresses.includes(a)) || [];
  const errorText = (e: unknown) => e instanceof Error ? e.message : '화이트리스트 처리에 실패했습니다.';
  async function load() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await getEmailAllowlist(); setData(result); setText(result.recipients.join('\n'));
      setReason(''); setConfirming(false);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function save() {
    if (!data || busy || !editable) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await saveEmailAllowlist(addresses, data.revision, reason.trim());
      setData(result); setText(result.recipients.join('\n')); setReason(''); setConfirming(false);
      setMessage('화이트리스트를 저장했습니다. 다음 발송 판단부터 적용됩니다. 테스트 메일은 보내지 않았습니다.');
    } catch (e) { setError(errorText(e)); setConfirming(false); }
    finally { setBusy(false); }
  }
  return <section className="policy-section" aria-label="메일 수신 화이트리스트">
    <h3>메일 수신 화이트리스트</h3>
    <p>여기에 등록된 정확한 이메일 주소에만 실제 발송을 허용합니다. 저장 전 목록은 서버에 자동 백업합니다.</p>
    {data && <p><strong>현재 발송 모드: {data.delivery_mode === 'custom_only' ? '화이트리스트만 허용' : data.delivery_mode === 'send_all' ? '전체 발송 허용 — 화이트리스트로 제한되지 않음' : '전체 발송 차단'}</strong>
      {!editable && <span> · 현재 상태에서는 편집할 수 없습니다. 서버 설정·파일 권한을 확인해주세요.</span>}</p>}
    {error && <p role="alert" className="policy-error">{error}</p>}
    {message && <p role="status" className="policy-success">{message}</p>}
    <form onSubmit={e => { e.preventDefault(); setConfirming(true); }}>
      <fieldset disabled={busy || !editable || confirming}>
        <div className="policy-grid">
          <label className="policy-field"><strong>허용할 이메일 주소</strong><textarea rows={7} value={text}
            onChange={e => setText(e.target.value)} placeholder={'buyer@example.com\nsupplier@example.com'} />
            <small>한 줄에 한 주소 · 최대 500개 · 중복 제거 · 도메인 와일드카드 불가 · 빈 목록은 전체 차단</small></label>
          <label className="policy-field"><strong>화이트리스트 변경 사유</strong><textarea required minLength={3} maxLength={500}
            rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="예: 테스트 협력업체 담당자 추가" />
            <small>이 목록은 MR별 정책 버전과 별개인 전역 발송 제한입니다. 진행 중인 MR에도 다음 발송부터 적용됩니다.</small></label>
        </div>
        <div className="policy-actions" style={{ marginTop: 16 }}><button className="policy-primary" type="submit"
          disabled={!dirty || reason.trim().length < 3 || addresses.length > 500}>수신 목록 변경 검토</button></div>
      </fieldset>
    </form>
    <button type="button" disabled={busy} style={{ marginTop: 12 }} onClick={() => {
      if (!dirty || window.confirm('저장하지 않은 수신 목록을 버리고 다시 불러올까요?')) void load();
    }}>화이트리스트 다시 불러오기</button>
    {confirming && <div className="policy-confirm" role="region" aria-label="화이트리스트 저장 확인">
      <h4>저장 후 {addresses.length}개 주소에 발송을 허용합니다.</h4>
      {!addresses.length && <p><strong>모든 실제 메일 발송이 차단됩니다.</strong></p>}
      <p style={{ overflowWrap: 'anywhere' }}>추가: {added.join(', ') || '없음'}</p>
      <p style={{ overflowWrap: 'anywhere' }}>삭제: {removed.join(', ') || '없음'}</p>
      <div className="policy-actions"><button disabled={busy} onClick={() => setConfirming(false)}>계속 수정</button>
        <button className="policy-primary" disabled={busy} onClick={() => void save()}>{busy ? '저장 중…' : '화이트리스트 저장'}</button></div>
    </div>}
  </section>;
}
