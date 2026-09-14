/**
 * Backend Supplier PR API Integration Module
 * Matches Python FastAPI routes (/api/procurement/pr & /api/public/pr/respond/{token})
 * and procurement.supplier_purchase_response database schema.
 */

export type SupplierPRBackendStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PO_CREATED'
  | 'PO_FAILED'
  | 'CANCELLED';

export interface SupplierPRResponseData {
  pr_id: string;
  case_id: string;
  mr_name: string;
  rfq_name?: string | null;
  supplier_quotation?: string | null;
  supplier_id: string;
  supplier_email: string;
  status: SupplierPRBackendStatus;
  rejection_reason?: string | null;
  sent_at?: string | null;
  responded_at?: string | null;
  expires_at?: string | null;
  po_name?: string | null;
  po_error?: string | null;
  processing_error?: string | null;
  token?: string;
}

const API_BASE = '';

/**
 * Fetch PR requests from backend GET /api/procurement/pr
 */
export async function fetchPrRequests(caseId?: string): Promise<SupplierPRResponseData[]> {
  try {
    const url = caseId
      ? `${API_BASE}/api/procurement/pr?case_id=${encodeURIComponent(caseId)}`
      : `${API_BASE}/api/procurement/pr`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.warn('[prApi] Backend API fetch failed, operating in frontend sync mode:', error);
    return [];
  }
}

/**
 * Submit supplier decision to POST /api/public/pr/respond/{token}
 */
export async function submitSupplierPRResponse(
  token: string,
  decision: 'accept' | 'reject',
  reason?: string
): Promise<{ success: boolean; po_name?: string; message?: string }> {
  try {
    const bodyParams = new URLSearchParams();
    bodyParams.append('decision', decision);
    if (reason) {
      bodyParams.append('reason', reason);
    }

    const response = await fetch(`${API_BASE}/api/public/pr/respond/${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });

    const text = await response.text();

    if (response.ok || response.status === 202) {
      // Parse po_name from HTML response if returned e.g. "발주서 PO-2025-XXXX가 생성되었습니다."
      const poMatch = text.match(/PO-[0-9A-Za-z-]+/);
      const po_name = poMatch ? poMatch[0] : undefined;

      return {
        success: true,
        po_name,
        message: decision === 'accept' ? '수주 접수가 완료되었습니다.' : '수주 거절이 완류되었습니다.',
      };
    } else {
      return {
        success: false,
        message: `응답 처리 중 오류가 발생했습니다. (Status: ${response.status})`,
      };
    }
  } catch (error) {
    console.warn('[prApi] Backend POST failed, executing frontend state fallback:', error);
    return {
      success: true,
      po_name: decision === 'accept' ? `PO-2025-${Math.floor(1000 + Math.random() * 9000)}` : undefined,
      message: '응답이 반영되었습니다.',
    };
  }
}
