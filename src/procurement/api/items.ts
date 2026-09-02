import { fetchWithAuth } from '../../utils/auth';
import type { ERPItemSpecificationResponse, Item } from '../types';
import { mapERPItemSpecificationResponse } from '../utils/itemSpecifications';

interface ERPItemSummary {
  item_code: string;
  item_name?: string;
  item_group?: string;
  description?: string | null;
  stock_uom?: string;
  is_stock_item?: number | boolean;
  is_fixed_asset?: number | boolean;
  disabled?: number | boolean;
  brand?: string;
  creation?: string;
}

interface ERPItemListResponse {
  items: ERPItemSummary[];
}

const parseJson = async <T>(response: Response): Promise<T> => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body?.detail === 'string' ? body.detail : 'ERPNext 아이템 조회에 실패했습니다.');
  }
  return body as T;
};

const stripHtml = (value?: string | null): string => (value ?? '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const itemSummaryToItem = (row: ERPItemSummary): Item => {
  const description = stripHtml(row.description) || '등록된 규격 정보 없음';
  return {
    id: row.item_code,
    itemCode: row.item_code,
    department: row.item_group || 'ERPNext',
    itemName: row.item_name || row.item_code,
    specSummary: description.length > 70 ? `${description.slice(0, 70)}…` : description,
    specifications: [],
    fullSpec: {
      dimensions: description,
      material: '-',
      operatingTemp: '-',
      pressureRating: '-',
      manufacturer: row.brand || '-',
      notes: `${row.item_group || '미분류'} · ${row.stock_uom || '단위 미지정'}`,
    },
    maintainStock: Boolean(row.is_stock_item),
    isFixedAsset: Boolean(row.is_fixed_asset),
    attributes: {
      heatResistant: false,
      highPressure: false,
      isoCertified: false,
      waterproof: false,
      customizable: false,
    },
    registeredDate: row.creation?.slice(0, 10) || '-',
    status: row.disabled ? '승인대기' : '승인',
  };
};

export const listERPItems = async (): Promise<Item[]> => {
  const response = await fetchWithAuth('/purchase/items?limit=500&offset=0');
  const body = await parseJson<ERPItemListResponse>(response);
  return (Array.isArray(body.items) ? body.items : []).map(itemSummaryToItem);
};

export const getERPItemSpecifications = async (
  item: Item,
): Promise<Item> => {
  const response = await fetchWithAuth(
    `/purchase/items/${encodeURIComponent(item.itemCode)}/specifications`,
  );
  const body = await parseJson<ERPItemSpecificationResponse>(response);
  return mapERPItemSpecificationResponse(body, {
    ...item,
    department: body.department || body.item_group || item.department,
    specSummary: stripHtml(body.description) || item.specSummary,
    registeredDate: body.registered_date?.slice(0, 10) || item.registeredDate,
  });
};

/** 기존 호출부 호환 이름. */
export const fetchItemWithSpecifications = getERPItemSpecifications;
