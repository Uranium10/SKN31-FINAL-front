import { fetchWithAuth } from '../../utils/auth';

export interface WorkProgress {
  case_id: string; mr_name: string; status: string; stage: string;
  version: number; updated_at: string;
  deadline_status?: string | null; waiting_reason?: string | null;
  checked_at?: string | null; last_step?: string | null; last_step_at?: string | null;
  metrics?: { elapsed_ms?: number; erp_calls?: number } | null;
}
export async function listWorkProgress(): Promise<{ items: WorkProgress[]; truncated: boolean }> {
  const response = await fetchWithAuth('/api/procurement/progress');
  if (!response.ok) throw new Error('진행 현황 연결이 지연되고 있습니다. 마지막 확인 내용을 표시합니다.');
  return response.json();
}
