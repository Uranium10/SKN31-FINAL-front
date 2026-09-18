import { fetchWithAuth } from '../../utils/auth';

export interface AiDecisionLogEntry {
  id: number;
  case_id: string | null;
  node: string;
  reason: string | null;
  created_at: string;
}

export interface AiDecisionLogResponse {
  items: AiDecisionLogEntry[];
  count: number;
  nodes: string[];
  limit: number;
  offset: number;
}

export async function listAiDecisions(options: {
  node?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AiDecisionLogResponse> {
  const query = new URLSearchParams({
    limit: String(options.limit ?? 100),
    offset: String(options.offset ?? 0),
  });
  if (options.node) query.set('node', options.node);

  const response = await fetchWithAuth(`/api/company-policy/ai-decisions?${query}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.detail === 'string' ? body.detail : 'AI 판단 로그를 불러오지 못했습니다.');
  }
  return body as AiDecisionLogResponse;
}
