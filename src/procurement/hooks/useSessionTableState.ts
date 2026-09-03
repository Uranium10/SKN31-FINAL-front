import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';

export type TableFilterMode = 'none' | 'values' | 'number-range' | 'date-range';

export interface TableColumnRangeFilter {
  start?: string;
  end?: string;
}

export interface TableColumnDefinition<Key extends string> {
  key: Key;
  label: string;
  defaultWidth: number;
  minWidth: number;
  align?: 'left' | 'center' | 'right';
  filterMode?: TableFilterMode;
}

export type TableColumnFilters<Key extends string> = Partial<Record<Key, string[]>>;

const readSessionValue = <Value,>(key: string, fallback: Value): Value => {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.sessionStorage.getItem(key);
    return stored ? JSON.parse(stored) as Value : fallback;
  } catch {
    return fallback;
  }
};

export const useSessionStoredState = <Value,>(key: string, fallback: Value) => {
  const [value, setValue] = useState<Value>(() => readSessionValue(key, fallback));

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 사생활 보호 모드처럼 sessionStorage가 막힌 환경에서도 표는 정상 동작합니다.
    }
  }, [key, value]);

  return [value, setValue] as const;
};

export const normalizeTableFilterValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '(빈 값)';
  return String(value);
};

export const matchesTableFilters = <Row, Key extends string>(
  row: Row,
  filters: TableColumnFilters<Key>,
  getValue: (row: Row, key: Key) => unknown,
): boolean => (
  (Object.entries(filters) as Array<[Key, string[]]>).every(([key, selected]) => (
    selected === undefined || selected.includes(normalizeTableFilterValue(getValue(row, key)))
  ))
);

/** 숫자 및 ISO 날짜 값을 시작/끝 범위와 비교합니다. 빈 입력은 해당 방향을 제한하지 않습니다. */
export const matchesTableRange = (
  value: unknown,
  range: TableColumnRangeFilter | undefined,
  mode: 'number-range' | 'date-range',
): boolean => {
  if (!range?.start && !range?.end) return true;

  if (mode === 'date-range') {
    const comparable = String(value ?? '').slice(0, 10);
    if (!comparable) return false;
    return (!range.start || comparable >= range.start) && (!range.end || comparable <= range.end);
  }

  const comparable = Number(value);
  const start = range.start === undefined ? undefined : Number(range.start);
  const end = range.end === undefined ? undefined : Number(range.end);
  if (!Number.isFinite(comparable)) return false;
  return (start === undefined || comparable >= start) && (end === undefined || comparable <= end);
};

/**
 * 표의 열 폭과 헤더 필터를 브라우저 탭(sessionStorage)에 저장합니다.
 * 서버 데이터에는 UI 취향값을 섞지 않으며, 새 탭에서는 기본 레이아웃으로 시작합니다.
 */
export const useSessionTableState = <Key extends string>(
  tableId: string,
  columns: readonly TableColumnDefinition<Key>[],
) => {
  const defaultWidths = useMemo(() => Object.fromEntries(
    columns.map((column) => [column.key, column.defaultWidth]),
  ) as Record<Key, number>, [columns]);
  const minimumWidths = useMemo(() => Object.fromEntries(
    columns.map((column) => [column.key, column.minWidth]),
  ) as Record<Key, number>, [columns]);

  const [storedWidths, setStoredWidths] = useSessionStoredState<Partial<Record<Key, number>>>(
    `biddingflow.table.${tableId}.widths`,
    {},
  );
  const [filters, setFilters] = useSessionStoredState<TableColumnFilters<Key>>(
    `biddingflow.table.${tableId}.filters`,
    {},
  );

  const widths = useMemo(() => Object.fromEntries(columns.map((column) => {
    const stored = Number(storedWidths[column.key]);
    const width = Number.isFinite(stored)
      ? Math.max(column.minWidth, stored)
      : defaultWidths[column.key];
    return [column.key, width];
  })) as Record<Key, number>, [columns, defaultWidths, storedWidths]);

  const setFilter = useCallback((key: Key, selected: string[] | undefined) => {
    setFilters((current) => {
      const next = { ...current };
      if (selected === undefined) delete next[key];
      else next[key] = selected;
      return next;
    });
  }, [setFilters]);

  const beginResize = useCallback((
    key: Key,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widths[key];
    const minimum = minimumWidths[key];
    document.body.classList.add('is-resizing-table-column');

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(minimum, Math.round(startWidth + moveEvent.clientX - startX));
      setStoredWidths((current) => ({ ...current, [key]: nextWidth }));
    };
    const handlePointerUp = () => {
      document.body.classList.remove('is-resizing-table-column');
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  }, [minimumWidths, setStoredWidths, widths]);

  const resetWidths = useCallback(() => setStoredWidths({}), [setStoredWidths]);
  const clearFilters = useCallback(() => setFilters({}), [setFilters]);
  const totalWidth = columns.reduce((sum, column) => sum + widths[column.key], 0);

  return {
    widths,
    filters,
    setFilter,
    beginResize,
    resetWidths,
    clearFilters,
    totalWidth,
  };
};
