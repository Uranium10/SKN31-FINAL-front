import { useEffect, useRef, useState } from 'react';
import { Clock, Power, RefreshCw } from 'lucide-react';
import { changeRunpodWorker, getRunpodWorker, type RunpodWorkerState } from '../api/companyPolicy';

const modelLabels: Record<string, string> = {
  unknown: '미확인 · 첫 요청에서 모델 로딩이 필요할 수 있습니다',
  submitting: '준비 요청 전송 중', loading: '모델 준비 중',
  ready: '최근 준비 요청 성공', failed: '준비 실패 · RunPod 로그를 확인하세요',
};

/** Timers are ONLY for display/refresh. The server owns the persisted expiry. */
export function RunpodWorkerControl({ active = true }: { active?: boolean }) {
  const [data, setData] = useState<RunpodWorkerState | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState<'start' | 'extend' | 'stop' | null>(null);
  const [now, setNow] = useState(Date.now());
  const inFlight = useRef(false);
  const alive = useRef(true);
  const expiry = data?.expires_at ? new Date(data.expires_at).getTime() : 0;
  const remaining = Math.max(0, Math.ceil((expiry - now) / 60000));
  const editable = data?.enabled && data.remote_known && !busy;
  const canStart = editable && !data.owned && data.workers_min === 0 && data.workers_max === 1;

  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await getRunpodWorker();
      if (alive.current) { setData(result); setError(''); }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : '워커 상태 조회 실패');
    } finally { inFlight.current = false; }
  }
  useEffect(() => {
    if (!active) return;
    alive.current = true;
    void refresh();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === 'visible') void refresh();
    }, 15000);
    return () => { alive.current = false; window.clearInterval(timer); };
  }, [active]);

  async function apply() {
    if (!confirming || data?.revision === undefined || inFlight.current) return;
    setBusy(true); inFlight.current = true; setError(''); setMessage('');
    try {
      const result = await changeRunpodWorker(confirming, data.revision, minutes);
      if (!alive.current) return;
      setData(result); setNow(Date.now());
      setMessage(result.last_error ? '요청은 저장되었지만 적용 확인이 필요합니다. 아래 오류를 확인하세요.' :
        confirming === 'stop' ? '상시 유지 해제를 요청했습니다. 새 요청은 기존 자동 실행 방식을 사용합니다.' :
        '유지 설정을 저장했습니다. 예정 시각에 서버가 상시 유지를 해제합니다.');
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : '워커 설정 실패');
    } finally {
      inFlight.current = false;
      if (alive.current) { setBusy(false); setConfirming(null); }
    }
  }

  return <section className="policy-section runpod-control" aria-label="견적서 AI 서버 시간제 유지" aria-busy={busy}>
    <h3><Power size={18} /> 견적서 AI 서버 시간제 유지</h3>
    <p>테스트·시연 중 GPU 워커 1개를 유지합니다. 사용하지 않는 시간에도 과금됩니다.</p>
    {error && <p className="policy-error" role="alert">{error}</p>}
    {message && <p className="policy-success" role="status">{message}</p>}
    {!data && <p>워커 설정을 불러오는 중입니다…</p>}
    {data && !data.enabled && <p className="policy-notice">{data.message}</p>}
    {data?.enabled && <>
      <div className="runpod-status-grid">
        <div><small>상시 유지 설정</small><strong>{!data.remote_known ? '확인 불가' : data.workers_min === 1 ? '1개 유지' :
          data.workers_min === 0 ? '자동 실행 모드' : `${data.workers_min}개 유지 (콘솔 설정)`}</strong></div>
        <div><small>자동 해제 예정</small><strong>{data.owned && expiry ?
          new Date(expiry).toLocaleString('ko-KR') : '예약 없음'}</strong>
          {data.owned && <small>{remaining > 0 ? `약 ${remaining}분 남음` : '해제 확인 중 · 지연 시 콘솔 확인'}</small>}</div>
        <div><small>설정한 관리자</small><strong>{data.updated_by || '—'}</strong></div>
      </div>
      <p>모델 준비: {modelLabels[data.model_status || 'unknown'] || '미확인'}</p>
      <p className="runpod-note">준비 성공은 최근 결과입니다. 재배포·워커 교체 시 다시 로딩될 수 있습니다.</p>
      {data.last_error && <p className="policy-error" role="alert">{data.last_error}</p>}
      {!data.owned && data.remote_known && !canStart && !busy &&
        <p>시작하려면 RunPod 콘솔에서 Active workers=0, Max workers=1로 설정해 주세요. 콘솔에서 켠 워커는 여기서 임의로 해제하지 않습니다.</p>}
      <div className="policy-actions">
        <label className="runpod-duration"><Clock size={16} /> 유지 시간
          <select aria-label="모델 서버 유지 시간" value={minutes} disabled={busy || !!confirming}
            onChange={e => setMinutes(Number(e.target.value))}>
            <option value={30}>30분</option><option value={60}>1시간 (기본)</option><option value={120}>2시간</option>
          </select></label>
        {!data.owned ? <button className="policy-primary" disabled={!canStart || !!confirming}
          onClick={() => setConfirming('start')}>모델 서버 준비</button> : <>
          <button disabled={!editable || remaining === 0 || !!confirming} onClick={() => setConfirming('extend')}>시간 연장</button>
          <button disabled={busy || !!confirming} onClick={() => setConfirming('stop')}>상시 유지 해제</button>
        </>}
      </div>
      <p className="runpod-note">일반 24GB 공개 단가 기준 약 $0.69/시간 (예시). 실제 GPU·계정 요금과 저장 공간 비용은 RunPod에서 확인하세요.
        연장은 지금부터 선택한 시간까지이며 기존 남은 시간을 단축하지 않습니다.</p>
      <p className="runpod-note">해제해도 진행 중 작업은 취소하지 않으며, 새 요청이 오면 자동 실행됩니다.
        브라우저를 닫아도 예약은 유지됩니다. 서버·DB·RunPod 연결 장애 시 해제가 지연될 수 있습니다.</p>
      {confirming && <div className="policy-confirm" role="region" aria-label="워커 유지 설정 확인">
        <h4>{confirming === 'stop' ? '상시 유지를 해제할까요?' : `${minutes}분 기준으로 ${confirming === 'start' ? '시작' : '연장'}할까요?`}</h4>
        <p>{confirming === 'stop' ? 'Active workers를 0으로 되돌립니다. 작업 및 유휴 시간에 따라 추가 비용이 발생할 수 있습니다.' :
          '확인하면 유료 GPU 워커를 유지합니다. 서버에 저장된 예정 시각에 자동 해제됩니다.'}</p>
        <div className="policy-actions"><button disabled={busy} onClick={() => setConfirming(null)}>취소</button>
          <button className="policy-primary" disabled={busy} onClick={() => void apply()}>{busy ? '처리 중…' : '확인'}</button></div>
      </div>}
    </>}
    <button className="runpod-refresh" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15} /> 상태 새로고침</button>
  </section>;
}
