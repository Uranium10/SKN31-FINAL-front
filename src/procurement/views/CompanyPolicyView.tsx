import { useEffect, useRef, useState } from 'react';
import { Download, History, Save, ShieldCheck, RotateCcw } from 'lucide-react';
import {
  getCompanyPolicy, publishCompanyPolicy,
  type CompanyPolicy, type PolicyResponse,
} from '../api/companyPolicy';
import './CompanyPolicyView.css';
import { EmailAllowlistEditor } from './EmailAllowlistEditor';
import { RunpodWorkerControl } from './RunpodWorkerControl';

type NumericRule = Exclude<keyof CompanyPolicy['rules'], 'quotation_priority'>;
// Display the team's original rule names so operators can reconcile settings
// with the purchasing-agent implementation without editing code.
const ruleNames: Record<NumericRule, string> = {
  urgent_lead_days: 'URGENT_LEAD_TIME_DAYS', bidding_amount: 'AMOUNT_THRESHOLD',
  pattern_min_orders: 'MIN_ORDERS_FOR_PATTERN', irregular_cv: 'IRREGULAR_CV_THRESHOLD',
  cycle_overdue_multiplier: 'CYCLE_OVERDUE_MULTIPLIER', inactive_months: 'INACTIVE_MONTHS',
  min_competing_suppliers: 'MIN_COMPETING_SUPPLIERS', supplier_refresh_years: 'SUPPLIER_POOL_REFRESH_YEARS',
};
const fields: { key: NumericRule; label: string; unit: string; min: number; max: number; step: number; hint: string }[] = [
  { key: 'urgent_lead_days', label: '긴급구매 기준', unit: '일 이하', min: 0, max: 90, step: 1,
    hint: '납기가 이 기간 이내면 긴급으로 분류합니다. 최근 확정 거래가 없으면 구매가 중단될 수 있습니다.' },
  { key: 'bidding_amount', label: '경쟁입찰 금액 기준', unit: '원 이상', min: 1, max: 1_000_000_000_000, step: 1,
    hint: '최근 확정 단가 × 요청 수량으로 계산합니다. 기존처럼 긴급구매 판단이 금액 기준보다 먼저 적용됩니다.' },
  { key: 'min_competing_suppliers', label: '최소 경쟁 협력사 수', unit: '곳', min: 1, max: 20, step: 1,
    hint: '기존 협력사가 이 수보다 적으면 신규 협력사를 탐색합니다. 강제 RFQ 발송 수는 아닙니다.' },
  { key: 'supplier_refresh_years', label: '협력사 재탐색 주기', unit: '년', min: 1, max: 20, step: 1,
    hint: '가장 최근 협력사 등록일에서 이 기간이 지나면 다시 탐색합니다. 1년은 365일로 계산합니다.' },
  { key: 'pattern_min_orders', label: '구매주기 분석 최소 이력', unit: '건', min: 3, max: 100, step: 1,
    hint: '확정된 과거 발주가 이 수 이상일 때 구매 간격을 분석합니다.' },
  { key: 'irregular_cv', label: '구매주기 불규칙 기준', unit: '이상', min: 0.01, max: 10, step: 0.01,
    hint: '구매 간격의 표준편차 ÷ 평균입니다. 낮출수록 입찰 대상으로 분류되기 쉽습니다.' },
  { key: 'cycle_overdue_multiplier', label: '구매주기 초과 기준', unit: '배', min: 1, max: 20, step: 0.1,
    hint: '마지막 구매 이후 경과일이 평균 구매 간격 × 이 배수를 넘으면 입찰합니다.' },
  { key: 'inactive_months', label: '장기 미거래 기준', unit: '개월', min: 1, max: 120, step: 1,
    hint: '분석 이력이 부족할 때 사용합니다. 마지막 구매가 이 기간을 넘으면 입찰합니다.' },
];
const errorText = (error: unknown) => error instanceof Error ? error.message : '요청 처리에 실패했습니다.';

/** Draft stays mounted while navigating tabs; only explicit publish changes DB. */
export function CompanyPolicyView({ roles = [], active = true }: { roles?: string[]; active?: boolean }) {
  const [data, setData] = useState<PolicyResponse | null>(null);
  const [draft, setDraft] = useState<CompanyPolicy | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const confirmation = useRef<HTMLElement>(null);
  const dirty = Boolean(data && draft && JSON.stringify(data.active.policy) !== JSON.stringify(draft));

  async function load() {
    setBusy(true); setError('');
    try {
      const next = await getCompanyPolicy();
      setData(next); setDraft(structuredClone(next.active.policy)); setReason(''); setConfirming(false);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (error || message) feedback.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [error, message]);
  useEffect(() => {
    if (confirming) confirmation.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [confirming]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function publish() {
    if (!data || !draft || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const active = await publishCompanyPolicy(draft, data.active.version, reason.trim());
      setData({ active, history: [active, ...data.history].slice(0, 100) });
      setDraft(structuredClone(active.policy)); setReason(''); setConfirming(false);
      setMessage(`정책 v${active.version}을 게시했습니다. 서비스 재시작 없이 새 작업부터 적용됩니다.`);
    } catch (e) { setError(errorText(e)); setConfirming(false); }
    finally { setBusy(false); }
  }

  function exportPolicy() {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data.active, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `company-policy-v${data.active.version}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="company-policy" aria-busy={busy}>
    <header className="policy-heading">
      <div><p className="policy-eyebrow"><ShieldCheck size={15} /> 관리자 환경설정</p>
        <h2>회사 구매 정책</h2><p>구매 기준은 숫자로, AI 판단 지침은 문장으로 관리합니다.</p></div>
      <div className="policy-actions">
        <button type="button" disabled={!data || busy} onClick={exportPolicy}><Download size={16} /> 게시본 JSON</button>
        <button type="button" disabled={busy} onClick={() => {
          if (!dirty || window.confirm('게시하지 않은 수정을 버리고 최신 설정을 불러올까요?')) void load();
        }}><RotateCcw size={16} /> 다시 불러오기</button>
      </div>
    </header>
    <div className="policy-notice">
      <strong>{data ? `현재 적용 v${data.active.version}` : '정책 불러오는 중'}</strong>
      <span>진행 중인 MR은 시작 시점의 정책을 유지합니다. 기존 품목군 규격은 자동 재생성하지 않습니다.</span>
      <span>메일 발송 제한·필수 승인·규격 검증은 유지됩니다. 현재 연결된 회사 전체에 적용됩니다.</span>
      <details><summary>ERPNext에서 확인한 내 역할 ({roles.length}개)</summary>
        <p>{roles.join(' · ') || 'Administrator 계정 권한으로 접근'}</p>
      </details>
    </div>
    <div ref={feedback}>
      {error && <p role="alert" className="policy-error">{error}</p>}
      {message && <p role="status" className="policy-success">{message}</p>}
    </div>
    {draft && data && <>
      <RunpodWorkerControl active={active} />
      <EmailAllowlistEditor />
      <form ref={form} onSubmit={e => { e.preventDefault(); if (form.current?.reportValidity()) setConfirming(true); }}>
        <fieldset disabled={busy || confirming}>
          <section className="policy-section"><h3>신규 공급사 탐색 소스</h3>
            <p>복수 선택할 수 있습니다. 최소 1개를 선택하세요. 기존 ERP 협력사 조회는 그대로 유지됩니다.</p>
            <div className="policy-source-options">{([
              ['tavily', 'Tavily', '웹 검색 기반 공급사 탐색'],
              ['narajangteo', '나라장터', '나라장터 실시간 API 조회'],
              ['db', 'DB', '저장된 나라장터 업체 데이터 조회'],
            ] as const).map(([key, label, hint]) => <label className="policy-source-option" key={key}>
              <input type="checkbox" checked={(draft.supplier_sources || ['tavily']).includes(key)}
                onChange={e => {
                  const sources = draft.supplier_sources || ['tavily'];
                  const next = e.target.checked ? [...sources, key] : sources.filter(source => source !== key);
                  if (!next.length) { setError('탐색 소스를 최소 1개 선택하세요.'); return; }
                  setError(''); setDraft({ ...draft, supplier_sources: next.sort() });
                }} /><span><strong>{label}</strong><small>{hint}</small></span>
            </label>)}</div>
            <p>선택한 소스에서 후보를 모은 뒤 기존 검증·연락처 보완 과정을 거칩니다. DB만 선택해도 연락처 보완 등에 외부 API가 사용될 수 있습니다.</p>
          </section>
          <section className="policy-section"><h3>구매 판단 기준</h3>
            <div className="policy-grid">{fields.map(field => <label className="policy-field" key={field.key}>
              <strong>{field.label}</strong><code className="policy-rule-name">{ruleNames[field.key]}</code><div className="policy-number">
                <input type="number" required min={field.min} max={field.max} step={field.step}
                  value={Number.isFinite(draft.rules[field.key]) ? draft.rules[field.key] : ''}
                  onChange={e => setDraft({ ...draft, rules: { ...draft.rules, [field.key]: e.target.valueAsNumber } })} />
                <span>{field.unit}</span></div><small>{field.hint}</small>
            </label>)}</div>
            <label className="policy-field policy-priority"><strong>견적 비교 우선순위</strong>
              <select value={draft.rules.quotation_priority} onChange={e => setDraft({ ...draft, rules: {
                ...draft.rules, quotation_priority: e.target.value as CompanyPolicy['rules']['quotation_priority'],
              } })}><option value="price_then_delivery">금액 우선 → 같은 금액이면 납기 비교</option>
                <option value="delivery_then_price">납기 우선 → 같은 납기이면 금액 비교</option></select>
              <small>규격·수량 검증을 통과한 견적만 비교합니다. 가격과 납기가 모두 같으면 기존 공급사 평가를 보조 기준으로 사용합니다.</small>
            </label>
          </section>
          <section className="policy-section"><h3>AI 보조 판단 지침</h3>
            <p>회사별 용도·검토 관점을 입력하세요. 필수 검증을 없애거나 응답 형식을 변경하는 명령은 넣지 않습니다.</p>
            <div className="policy-grid">{([
              ['item_specification', '품목 규격 검토', '예: 전기 부품은 정격 전압과 사용 환경을 중점적으로 확인합니다.'],
              ['substitute_selection', '대체품 추천', '예: 생산 설비용 부품은 장착 치수와 호환성 근거를 추천 이유에 명시합니다.'],
            ] as const).map(([key, label, placeholder]) => <label className="policy-field" key={key}>
              <strong>{label}</strong><textarea rows={5} maxLength={2000} value={draft.guidance[key]} placeholder={placeholder}
                onChange={e => setDraft({ ...draft, guidance: { ...draft.guidance, [key]: e.target.value } })} />
              <small>{draft.guidance[key].length} / 2,000자 · 비워두면 기존 지침만 사용</small>
            </label>)}</div>
          </section>
          <section className="policy-section policy-publish">
            <label className="policy-field"><strong>변경 사유</strong><input required minLength={3} maxLength={500}
              value={reason} onChange={e => setReason(e.target.value)} placeholder="예: 긴급구매 기준을 운영팀 합의에 따라 조정" /></label>
            <button className="policy-primary" type="submit" disabled={!dirty || reason.trim().length < 3}>
              <Save size={16} /> 변경 내용 검토</button>
          </section>
        </fieldset>
      </form>
      {confirming && <section ref={confirmation} className="policy-confirm" role="region" aria-label="정책 게시 확인">
        <h3>v{data.active.version + 1}으로 게시할까요?</h3>
        <ul>{fields.filter(f => draft.rules[f.key] !== data.active.policy.rules[f.key]).map(f =>
          <li key={f.key}>{f.label}: {data.active.policy.rules[f.key].toLocaleString()} → {draft.rules[f.key].toLocaleString()} {f.unit}</li>)}
          {JSON.stringify(draft.supplier_sources) !== JSON.stringify(data.active.policy.supplier_sources) &&
            <li>공급사 탐색 소스: {draft.supplier_sources.join(' · ')}</li>}
          {draft.rules.quotation_priority !== data.active.policy.rules.quotation_priority && <li>견적 비교 우선순위 변경</li>}
          {draft.guidance.item_specification !== data.active.policy.guidance.item_specification && <li>품목 규격 검토 지침 변경</li>}
          {draft.guidance.substitute_selection !== data.active.policy.guidance.substitute_selection && <li>대체품 추천 지침 변경</li>}
        </ul><p>게시 후 새 작업에 적용됩니다. 진행 중인 MR에는 소급 적용하지 않습니다.</p>
        <div className="policy-actions"><button disabled={busy} onClick={() => setConfirming(false)}>계속 수정</button>
          <button className="policy-primary" disabled={busy} onClick={() => void publish()}>{busy ? '게시 중…' : '정책 게시'}</button></div>
      </section>}
      <section className="policy-section"><h3><History size={18} /> 게시 이력</h3>
        <p>이전 버전을 불러온 뒤 다시 게시하면 새 버전으로 복원됩니다. 기존 이력은 삭제되지 않습니다.</p>
        <div className="policy-history">{data.history.map(row => <article key={row.version}>
          <strong>v{row.version}</strong><div><b>{row.reason}</b><small>{row.published_by} · {new Date(row.published_at).toLocaleString('ko-KR')}</small></div>
          <button disabled={busy || confirming || row.version === data.active.version} onClick={() => {
            if (dirty && !window.confirm('현재 수정 내용을 버리고 이 버전을 불러올까요?')) return;
            setDraft(structuredClone(row.policy)); setReason(`정책 v${row.version} 기준으로 복원`); setMessage('');
          }}>초안으로 불러오기</button>
        </article>)}</div>
      </section>
    </>}
  </section>;
}
