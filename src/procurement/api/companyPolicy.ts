import { fetchWithAuth } from '../../utils/auth';

export interface CompanyPolicy {
  supplier_sources: ('tavily' | 'narajangteo' | 'db')[];
  rules: {
    urgent_lead_days: number;
    bidding_amount: number;
    pattern_min_orders: number;
    irregular_cv: number;
    cycle_overdue_multiplier: number;
    inactive_months: number;
    min_competing_suppliers: number;
    supplier_refresh_years: number;
    quotation_priority: 'price_then_delivery' | 'delivery_then_price';
    /** 견적 종합점수 4항목 가중치(%) - 합계 100. 없는 항목은 백엔드가 나머지로 재정규화한다. */
    quotation_price_weight: number;
    quotation_delivery_weight: number;
    quotation_specification_weight: number;
    quotation_scorecard_weight: number;
    /** off: 모든 체크포인트에서 사람 대기 · shadow: 판단만 기록 · on: 조건 통과 시 자동 진행 */
    automation_mode: 'off' | 'shadow' | 'on';
    auto_rfq_dispatch: boolean;
    auto_final_selection: boolean;
    auto_selection_score_gap: number;
    auto_selection_max_amount: number;
    auto_deadline_extension_days: number;
    auto_deadline_extension_min_lead_days: number;
  };
  guidance: { item_specification: string; substitute_selection: string };
}
export const AUTOMATION_DEFAULTS = {
  automation_mode: 'off',
  auto_rfq_dispatch: true,
  auto_final_selection: true,
  auto_selection_score_gap: 10,
  auto_selection_max_amount: 50_000_000,
  auto_deadline_extension_days: 3,
  auto_deadline_extension_min_lead_days: 7,
} as const;

export const QUOTATION_WEIGHT_KEYS = [
  'quotation_price_weight',
  'quotation_delivery_weight',
  'quotation_specification_weight',
  'quotation_scorecard_weight',
] as const;
export type QuotationWeightKey = typeof QUOTATION_WEIGHT_KEYS[number];
export const DEFAULT_QUOTATION_WEIGHTS: Record<QuotationWeightKey, number> = {
  quotation_price_weight: 35,
  quotation_delivery_weight: 20,
  quotation_specification_weight: 30,
  quotation_scorecard_weight: 15,
};

/**
 * 예전 2항목 가중치(가격·납기 / 규격)만 있는 정책이 내려와도 편집기가
 * 깨지지 않게 4항목 기본값을 채우고 옛 키는 버린다. 백엔드는 옛 키가 섞인
 * 게시 요청을 거부하므로(extra=forbid) 반드시 새 키만 보내야 한다.
 */
export function normalizePolicy(policy: CompanyPolicy): CompanyPolicy {
  const rules = { ...(policy.rules as CompanyPolicy['rules'] & Record<string, unknown>) };
  delete rules.quotation_numeric_score_weight;
  delete rules.quotation_spec_score_weight;
  for (const key of QUOTATION_WEIGHT_KEYS) {
    if (!Number.isFinite(rules[key])) rules[key] = DEFAULT_QUOTATION_WEIGHTS[key];
  }
  // 자동 진행 설정이 없는 옛 정책은 '꺼짐'으로 채운다 - 진행 중인 케이스가
  // 자동화를 켠 순간 갑자기 움직이지 않도록 백엔드도 같은 기본값을 쓴다.
  for (const [key, value] of Object.entries(AUTOMATION_DEFAULTS)) {
    if (rules[key] === undefined || rules[key] === null) rules[key] = value;
  }
  return { ...policy, rules };
}

export interface PolicyVersion {
  version: number;
  policy: CompanyPolicy;
  reason: string;
  published_by: string;
  published_at: string;
}
export interface PolicyResponse { active: PolicyVersion; history: PolicyVersion[] }
export interface EmailAllowlist {
  revision: string; recipients: string[];
  delivery_mode: 'custom_only' | 'send_all' | 'block_all'; enabled: boolean; editable: boolean;
}

export interface RunpodWorkerState {
  enabled: boolean; default_minutes: number; message?: string;
  revision?: number; owned?: boolean; expires_at?: string | null;
  updated_by?: string | null; model_status?: string; last_error?: string | null;
  remote_known?: boolean; workers_min?: number | null; workers_max?: number | null;
  workers?: { running?: number; ready?: number; initializing?: number; idle?: number; unhealthy?: number };
}

async function read<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(`/api/company-policy${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.detail === 'string' ? body.detail : '설정값을 확인한 뒤 다시 시도해주세요.');
  }
  return body as T;
}
export const getPolicyCapabilities = () => read<{ can_manage: boolean; roles: string[]; source: 'erpnext'; enabled: boolean }>('/capabilities');
export const getCompanyPolicy = async (): Promise<PolicyResponse> => {
  const response = await read<PolicyResponse>('');
  return {
    active: { ...response.active, policy: normalizePolicy(response.active.policy) },
    history: response.history.map((row) => ({ ...row, policy: normalizePolicy(row.policy) })),
  };
};
export const getRunpodWorker = () => read<RunpodWorkerState>('/runpod-worker');
export const changeRunpodWorker = (action: 'start' | 'extend' | 'stop', revision: number, minutes = 60) =>
  read<RunpodWorkerState>('/runpod-worker', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, expected_revision: revision, minutes }),
  });
export const getEmailAllowlist = () => read<EmailAllowlist>('/email-allowlist');
export const saveEmailAllowlist = (recipients: string[], revision: string, reason: string) =>
  read<EmailAllowlist>('/email-allowlist', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipients, expected_revision: revision, reason }) });
export const publishCompanyPolicy = (policy: CompanyPolicy, version: number, reason: string) =>
  read<PolicyVersion>('/publish', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy, expected_version: version, reason }),
  });
