import { fetchWithAuth } from '../../utils/auth';
import type { ERPItemSpecificationResponse, Item } from '../types';
import { mapERPItemSpecificationResponse } from '../utils/itemSpecifications';

type ItemSpecificationAPIResponse = ERPItemSpecificationResponse & {
  schema_source: 'item_group_spec' | 'erp_custom_fields_fallback';
  missing_required_fields: string[];
  warning?: string;
};

/**
 * 로그인 세션의 Access Token을 사용해 ERPNext 품목과 전체 규격 컬럼을 읽습니다.
 * 목업을 실제 데이터로 전환할 때 상세 버튼의 이벤트에서 이 함수만 호출하면 됩니다.
 */
export const fetchItemWithSpecifications = async (item: Item): Promise<Item> => {
  const response = await fetchWithAuth(
    `/purchase/items/${encodeURIComponent(item.itemCode)}/specifications`,
    { headers: { Accept: 'application/json' } },
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.detail || `품목 규격 조회에 실패했습니다. (${response.status})`);
  }

  return mapERPItemSpecificationResponse(payload as ItemSpecificationAPIResponse, item);
};
