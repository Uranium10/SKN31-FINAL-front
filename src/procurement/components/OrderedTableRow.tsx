import { Children, isValidElement, type HTMLAttributes, type ReactElement } from 'react';

/** Actual DOM cells follow the header order; no CSS-only visual ordering or duplicate actions. */
export const OrderedTableRow = ({ columnOrder, children, ...props }: HTMLAttributes<HTMLTableRowElement> & { columnOrder: readonly string[] }) => {
  const cells = Children.toArray(children).filter(isValidElement) as ReactElement<{ 'data-column-key': string }>[];
  return <tr {...props}>{[...cells].sort((a, b) => columnOrder.indexOf(a.props['data-column-key']) - columnOrder.indexOf(b.props['data-column-key']))}</tr>;
};
