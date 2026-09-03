import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  ChevronDown,
  Filter,
  Search,
} from 'lucide-react';

interface ExcelColumnHeaderProps<Key extends string> {
  columnKey: Key;
  label: string;
  width: number;
  minWidth: number;
  values: string[];
  selectedValues?: string[];
  onFilterChange: (selected: string[] | undefined) => void;
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  align?: 'left' | 'center' | 'right';
  order?: number;
  activeSort?: 'asc' | 'desc';
  onSort?: (direction: 'asc' | 'desc') => void;
  draggable?: boolean;
  dragState?: 'dragging' | 'before' | 'after';
  onDragStart?: (event: DragEvent<HTMLTableCellElement>) => void;
  onDragOver?: (event: DragEvent<HTMLTableCellElement>) => void;
  onDrop?: (event: DragEvent<HTMLTableCellElement>) => void;
  onDragEnd?: () => void;
}

const sameSelection = (left: string[], right: string[]) => (
  left.length === right.length && left.every((value) => right.includes(value))
);

/** 엑셀식 고유값 필터 메뉴와 폭 조절 손잡이를 제공하는 공통 표 헤더입니다. */
export const ExcelColumnHeader = <Key extends string>({
  label,
  width,
  minWidth,
  values,
  selectedValues,
  onFilterChange,
  onResizeStart,
  align = 'left',
  order,
  activeSort,
  onSort,
  draggable = false,
  dragState,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: ExcelColumnHeaderProps<Key>) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draftSelection, setDraftSelection] = useState<string[]>(selectedValues ?? values);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const uniqueValues = useMemo(
    () => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'ko-KR', { numeric: true })),
    [values],
  );
  const visibleValues = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ko-KR');
    return normalized
      ? uniqueValues.filter((value) => value.toLocaleLowerCase('ko-KR').includes(normalized))
      : uniqueValues;
  }, [query, uniqueValues]);
  const filterActive = selectedValues !== undefined;

  useEffect(() => {
    if (!open) return undefined;
    setDraftSelection(selectedValues ?? uniqueValues);
    setQuery('');

    const positionMenu = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 286;
      const estimatedMenuHeight = 410;
      const below = rect.bottom + 6;
      setMenuPosition({
        top: below + estimatedMenuHeight <= window.innerHeight - 10
          ? below
          : Math.max(10, rect.top - estimatedMenuHeight - 6),
        left: Math.max(10, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 10)),
      });
    };
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    positionMenu();
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open, selectedValues, uniqueValues]);

  const allVisibleSelected = visibleValues.length > 0
    && visibleValues.every((value) => draftSelection.includes(value));
  const toggleVisible = () => {
    setDraftSelection((current) => allVisibleSelected
      ? current.filter((value) => !visibleValues.includes(value))
      : [...new Set([...current, ...visibleValues])]);
  };
  const apply = () => {
    onFilterChange(sameSelection(draftSelection, uniqueValues) ? undefined : draftSelection);
    setOpen(false);
  };

  return (
    <th
      className={`excel-table-header${dragState ? ` is-${dragState}` : ''}`}
      style={{ width, minWidth, textAlign: align, order }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      title={draggable ? '드래그하여 열 위치 변경' : undefined}
    >
      <div className={`excel-table-header-content align-${align}`}>
        <button
          type="button"
          className="excel-header-label"
          onClick={() => onSort?.(activeSort === 'asc' ? 'desc' : 'asc')}
          disabled={!onSort}
        >
          <span>{label}</span>
          {activeSort === 'asc' && <ArrowUpAZ size={13} />}
          {activeSort === 'desc' && <ArrowDownAZ size={13} />}
        </button>
        <button
          ref={buttonRef}
          type="button"
          className={`excel-filter-trigger${filterActive ? ' is-active' : ''}`}
          aria-label={`${label} 필터 열기`}
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((current) => !current);
          }}
        >
          {filterActive ? <Filter size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>
      <div
        className="excel-column-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={`${label} 열 너비 조절`}
        onPointerDown={onResizeStart}
        onDragStart={(event) => event.preventDefault()}
      />
      {open && createPortal(
        <div
          ref={menuRef}
          className="excel-filter-menu"
          style={{ top: menuPosition.top, left: menuPosition.left }}
          role="dialog"
          aria-label={`${label} 필터`}
        >
          {onSort && (
            <div className="excel-filter-sort-actions">
              <button type="button" onClick={() => { onSort('asc'); setOpen(false); }}>
                <ArrowUpAZ size={15} /> 오름차순 정렬
              </button>
              <button type="button" onClick={() => { onSort('desc'); setOpen(false); }}>
                <ArrowDownAZ size={15} /> 내림차순 정렬
              </button>
            </div>
          )}
          <div className="excel-filter-search">
            <Search size={14} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="목록에서 검색" autoFocus />
          </div>
          <div className="excel-filter-values">
            <label>
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} />
              <span className="excel-checkbox-mark">{allVisibleSelected && <Check size={12} />}</span>
              <strong>(모두 선택)</strong>
            </label>
            {visibleValues.map((value) => {
              const checked = draftSelection.includes(value);
              return (
                <label key={value} title={value}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setDraftSelection((current) => checked
                      ? current.filter((item) => item !== value)
                      : [...current, value])}
                  />
                  <span className="excel-checkbox-mark">{checked && <Check size={12} />}</span>
                  <span>{value}</span>
                </label>
              );
            })}
            {visibleValues.length === 0 && <p>일치하는 값이 없습니다.</p>}
          </div>
          <div className="excel-filter-footer">
            <button type="button" className="btn-outline" onClick={() => { onFilterChange(undefined); setOpen(false); }}>필터 해제</button>
            <button type="button" className="btn-primary" onClick={apply}>확인</button>
          </div>
        </div>,
        document.body,
      )}
    </th>
  );
};
