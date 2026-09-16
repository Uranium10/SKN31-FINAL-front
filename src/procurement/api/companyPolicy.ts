import { fetchWithAuth } from '../../utils/auth';

export interface CompanyPolicy {
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
  };
  guidance: { item_specification: string; substitute_selection: string };
}
export interface PolicyVersion {
  version: number;
  policy: CompanyPolicy;
  reason: string;
  published_by: string;
  published_at: string;
}
export interface PolicyResponse { active: PolicyVersion; history: PolicyVersion[] }

async function read<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(`/api/company-policy${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.detail === 'string' ? body.detail : '설정값을 확인한 뒤 다시 시도해주세요.');
  }
  return body as T;
}
export const getPolicyCapabilities = () => read<{ can_manage: boolean }>('/capabilities');
export const getCompanyPolicy = () => read<PolicyResponse>('');
export const publishCompanyPolicy = (policy: CompanyPolicy, version: number, reason: string) =>
  read<PolicyVersion>('/publish', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy, expected_version: version, reason }),
  });
