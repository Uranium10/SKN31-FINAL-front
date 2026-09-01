import type {
  ERPItemSpecificationResponse,
  Item,
  ItemSpecificationField,
  ItemSpecificationValue,
} from '../types';

const hasValue = (value: ItemSpecificationValue) => (
  value !== null && value !== ''
);

const legacySpecificationFields = (item: Item): ItemSpecificationField[] => [
  { key: 'dimensions', label: '치수 및 규격', value: item.fullSpec.dimensions, group: '기본 규격', order: 10, source: 'legacy' },
  { key: 'material', label: '재질 / 소재', value: item.fullSpec.material, group: '기본 규격', order: 20, source: 'legacy' },
  { key: 'operating_temp', label: '작동 온도 범위', value: item.fullSpec.operatingTemp, group: '성능 조건', order: 30, source: 'legacy' },
  { key: 'pressure_rating', label: '정격 압력 / 등급', value: item.fullSpec.pressureRating, group: '성능 조건', order: 40, source: 'legacy' },
  { key: 'manufacturer', label: '권장 제조사', value: item.fullSpec.manufacturer, group: '조달 정보', order: 50, source: 'legacy' },
  { key: 'notes', label: '비고 및 요청사항', value: item.fullSpec.notes, group: '조달 정보', order: 60, source: 'legacy' },
];

const legacyAttributeFields = (item: Item): ItemSpecificationField[] => [
  { key: 'heat_resistant', label: '내열성', value: item.attributes.heatResistant, group: 'Item Attributes', order: 110, source: 'legacy' },
  { key: 'high_pressure', label: '고압용', value: item.attributes.highPressure, group: 'Item Attributes', order: 120, source: 'legacy' },
  { key: 'iso_certified', label: 'ISO 인증', value: item.attributes.isoCertified, group: 'Item Attributes', order: 130, source: 'legacy' },
  { key: 'waterproof', label: '방수', value: item.attributes.waterproof, group: 'Item Attributes', order: 140, source: 'legacy' },
  { key: 'customizable', label: '맞춤 제작', value: item.attributes.customizable, group: 'Item Attributes', order: 150, source: 'legacy' },
];

/** 동적 규격이 아직 없는 기존 목업도 동일한 UI에서 보이도록 변환합니다. */
export const getItemSpecificationFields = (item: Item): ItemSpecificationField[] => {
  const fields = item.specifications?.length
    ? item.specifications
    : [...legacySpecificationFields(item), ...legacyAttributeFields(item).filter((field) => field.value === true)];

  return [...fields]
    .filter((field) => hasValue(field.value) || field.required)
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
};

export const formatSpecificationValue = (field: ItemSpecificationField): string => {
  if (!hasValue(field.value)) return '미입력';
  if (typeof field.value === 'boolean') return field.value ? 'Yes' : 'No';
  const value = String(field.value);
  return field.unit ? `${value} ${field.unit}` : value;
};

export const getSpecificationSearchText = (item: Item): string => (
  getItemSpecificationFields(item)
    .flatMap((field) => [field.key, field.label, formatSpecificationValue(field), field.group ?? ''])
    .join(' ')
);

export const serializeItemSpecifications = (item: Item): string => (
  getItemSpecificationFields(item)
    .filter((field) => field.group !== 'Item Attributes' || field.value === true)
    .map((field) => `${field.label}: ${formatSpecificationValue(field)}`)
    .join('\n')
);

export const groupItemSpecifications = (item: Item) => {
  const groups = new Map<string, ItemSpecificationField[]>();
  getItemSpecificationFields(item).forEach((field) => {
    const group = field.group || '기타 규격';
    groups.set(group, [...(groups.get(group) ?? []), field]);
  });
  return Array.from(groups, ([name, fields]) => ({ name, fields }));
};

/** 백엔드의 규격 응답을 기존 Item 화면 모델로 바꾸는 단일 진입점입니다. */
export const mapERPItemSpecificationResponse = (
  payload: ERPItemSpecificationResponse,
  fallback?: Partial<Item>,
): Item => {
  const specifications: ItemSpecificationField[] = payload.specification_fields.map((field) => ({
    key: field.fieldname,
    label: field.label,
    value: field.value,
    valueType: field.fieldtype,
    unit: field.unit,
    group: field.section,
    order: field.display_order,
    required: field.required,
    source: 'erpnext',
  }));
  const byKey = new Map(specifications.map((field) => [field.key, formatSpecificationValue(field)]));

  return {
    id: fallback?.id ?? payload.item_code,
    itemCode: payload.item_code,
    department: payload.department ?? fallback?.department ?? '-',
    itemName: payload.item_name,
    specSummary: fallback?.specSummary ?? payload.description ?? specifications.slice(0, 3).map(formatSpecificationValue).join(' / '),
    specifications,
    // 레거시 화면을 제거하기 전까지 최소 호환값을 함께 유지합니다.
    fullSpec: fallback?.fullSpec ?? {
      dimensions: byKey.get('dimensions') ?? byKey.get('custom_dimensions') ?? '-',
      material: byKey.get('material') ?? byKey.get('custom_material') ?? '-',
      operatingTemp: byKey.get('operating_temp') ?? byKey.get('custom_operating_temp') ?? '-',
      pressureRating: byKey.get('pressure_rating') ?? byKey.get('custom_pressure_rating') ?? '-',
      manufacturer: byKey.get('manufacturer') ?? byKey.get('brand') ?? '-',
      notes: payload.description ?? '-',
    },
    maintainStock: payload.maintain_stock ?? fallback?.maintainStock ?? false,
    isFixedAsset: payload.is_fixed_asset ?? fallback?.isFixedAsset ?? false,
    attributes: fallback?.attributes ?? {
      heatResistant: false,
      highPressure: false,
      isoCertified: false,
      waterproof: false,
      customizable: false,
    },
    registeredDate: payload.registered_date ?? fallback?.registeredDate ?? '',
    status: fallback?.status ?? '승인대기',
    rejectReason: fallback?.rejectReason,
  };
};
