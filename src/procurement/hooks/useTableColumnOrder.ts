import { useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useSessionStoredState, type TableColumnDefinition } from './useSessionTableState';
import { moveColumn, normalizeColumnOrder } from '../utils/tableLayout';

/** Reorder definitions, colgroup, headers and cells together, before measuring adjacent widths. */
export const useTableColumnOrder = <K extends string>(id: string, columns: readonly TableColumnDefinition<K>[]) => {
  const [stored, setStored] = useSessionStoredState<K[]>(`biddingflow.table.${id}.order`, []);
  const [dragging, setDragging] = useState<K | null>(null);
  const [target, setTarget] = useState<{ key: K; after: boolean } | null>(null);
  const keys = useMemo(() => normalizeColumnOrder(stored, columns.map(column => column.key)), [stored, columns]);
  const orderedColumns = useMemo(() => keys.map(key => columns.find(column => column.key === key)!), [keys, columns]);
  const clearDrag = () => { setDragging(null); setTarget(null); };
  const headerProps = (key: K) => ({
    draggable: true,
    dragState: (dragging === key ? 'dragging' : target?.key === key ? (target.after ? 'after' : 'before') : undefined) as 'dragging' | 'after' | 'before' | undefined,
    onDragStart: (event: DragEvent<HTMLTableCellElement>) => {
      if ((event.target as HTMLElement).closest('.excel-column-resizer')) { event.preventDefault(); return; }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', key);
      setDragging(key);
    },
    onDragOver: (event: DragEvent<HTMLTableCellElement>) => {
      if (!dragging) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = event.currentTarget.getBoundingClientRect();
      const after = event.clientX > rect.left + rect.width / 2;
      setTarget(current => current?.key === key && current.after === after ? current : { key, after });
    },
    onDrop: (event: DragEvent<HTMLTableCellElement>) => {
      event.preventDefault();
      if (dragging) {
        const rect = event.currentTarget.getBoundingClientRect();
        setStored(moveColumn(keys, dragging, key, event.clientX > rect.left + rect.width / 2));
      }
      clearDrag();
    },
    onDragEnd: clearDrag,
    onKeyDown: (event: KeyboardEvent<HTMLTableCellElement>) => {
      if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const after = event.key === 'ArrowRight';
      const neighbor = keys[keys.indexOf(key) + (after ? 1 : -1)];
      if (!neighbor) return;
      event.preventDefault();
      setStored(moveColumn(keys, key, neighbor, after));
    },
  });
  return { keys, orderedColumns, headerProps, resetOrder: () => setStored([]) };
};
