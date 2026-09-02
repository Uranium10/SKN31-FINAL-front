import type {
  ERPItemSpecificationResponse,
  Item,
  ItemSpecificationField,
  ItemSpecificationValue,
} from '../types';

export interface ParsedSpecificationItem {
  label?: string;
  value: string;
}

export interface ParsedSpecificationSection {
  title?: string;
  items: ParsedSpecificationItem[];
}

const decodeHtmlEntities = (value: string): string => {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#')) {
      const isHex = code[1]?.toLowerCase() === 'x';
      const parsed = Number.parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
    }
    return namedEntities[code.toLowerCase()] ?? entity;
  });
};

/** ERPNext Text Editor 값과 일반 문자열을 같은 파서에 넣기 위한 정규화 단계입니다. */
export const normalizeSpecificationText = (value: string): string => decodeHtmlEntities(value)
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<\/(?:div|p|li|ul|ol|section)>/gi, '\n')
  .replace(/<li(?:\s[^>]*)?>/gi, '- ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\r/g, '')
  .replace(/[\t\f\v]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .replace(/ {2,}/g, ' ')
  .replace(/\n{2,}/g, '\n')
  .trim();

const cleanSpecificationToken = (value: string): string => value
  .replace(/^\s*[-–—•·]+\s*/, '')
  .replace(/^규격\s*[:：]\s*/i, '')
  .replace(/\s+/g, ' ')
  .trim();

const parseSpecificationToken = (value: string): ParsedSpecificationItem | null => {
  const cleaned = cleanSpecificationToken(value);
  if (!cleaned) return null;

  // 짧은 "항목: 값" 표현만 레이블로 분리합니다. URL·시각·긴 문장은 그대로 둡니다.
  const labelled = cleaned.match(/^([^:：]{1,24})\s*[:：]\s*(.+)$/);
  if (labelled && !/^https?$/i.test(labelled[1])) {
    return { label: labelled[1].trim(), value: labelled[2].trim() };
  }
  return { value: cleaned };
};

const splitSpecificationChunk = (value: string): ParsedSpecificationItem[] => {
  // 괄호 안의 "피치 8mm / 길이 720mm / 폭 20mm" 형식만 목록 구분자로 승격합니다.
  const expandedParentheses = value.replace(/\(([^()]*)\)/g, (whole, inner: string) => (
    inner.includes('/') ? `, ${inner.replace(/\s*\/\s*/g, ', ')}` : whole
  ));

  return expandedParentheses
    .split(/\n|;|,(?!\d{3}\b)/)
    .map(parseSpecificationToken)
    .filter((item): item is ParsedSpecificationItem => item !== null);
};

/**
 * MR/Item 설명에 혼재하는 세 형식을 화면 표시용으로만 구조화합니다.
 * - 규격: A, B, C
 * - 제품 설명 (피치 8mm / 길이 720mm)
 * - [규격] ... [재질/구성] ... 형태의 ERPNext HTML 설명
 */
export const parseSpecificationText = (rawValue: string): ParsedSpecificationSection[] => {
  const value = normalizeSpecificationText(rawValue);
  if (!value) return [];

  const headingPattern = /\[([^\]\n]{1,40})\]/g;
  const headings = [...value.matchAll(headingPattern)];
  const sections: ParsedSpecificationSection[] = [];

  if (headings.length === 0) {
    const items = splitSpecificationChunk(value);
    return items.length ? [{ items }] : [];
  }

  const prefix = value.slice(0, headings[0].index).trim();
  if (prefix) {
    const items = splitSpecificationChunk(prefix);
    if (items.length) sections.push({ items });
  }

  headings.forEach((heading, index) => {
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? value.length;
    const items = splitSpecificationChunk(value.slice(start, end));
    if (items.length) sections.push({ title: heading[1].trim(), items });
  });

  const seen = new Set<string>();
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const key = `${section.title ?? ''}\u0000${item.label ?? ''}\u0000${item.value}`.toLocaleLowerCase('ko-KR');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);
};

export const countParsedSpecificationItems = (sections: ParsedSpecificationSection[]): number => (
  sections.reduce((count, section) => count + section.items.length, 0)
);

export const summarizeSpecificationText = (value: string, limit = 4): string => {
  const parts = parseSpecificationText(value)
    .flatMap((section) => section.items)
    .map((item) => item.label ? `${item.label} ${item.value}` : item.value);
  if (!parts.length) return '등록된 규격 정보 없음';
  const summary = parts.slice(0, limit).join(' · ');
  return parts.length > limit ? `${summary} 외 ${parts.length - limit}개` : summary;
};

const hasValue = (value: ItemSpecificationValue) => {
  if (value === null) return false;
  if (typeof value !== 'string') return true;
  return !['', '-', '미입력', '규격 정보 없음', '등록된 규격 정보 없음'].includes(value.trim());
};

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

  const seenLegacyValues = new Set<string>();
  return [...fields]
    .filter((field) => hasValue(field.value) || field.required)
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
    .filter((field) => {
      if (field.source !== 'legacy' || field.required || typeof field.value !== 'string') return true;
      const normalized = normalizeSpecificationText(field.value).toLocaleLowerCase('ko-KR');
      if (!normalized || seenLegacyValues.has(normalized)) return false;
      seenLegacyValues.add(normalized);
      return true;
    });
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
