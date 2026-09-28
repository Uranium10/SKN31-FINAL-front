/** Stored layouts survive column additions/removals without duplicating or losing cells. */
export const normalizeColumnOrder = <K extends string>(stored: unknown, keys: readonly K[]): K[] => {
  const valid = Array.isArray(stored) ? stored.filter((key): key is K => keys.includes(key)) : [];
  return [...new Set([...valid, ...keys])];
};

export const moveColumn = <K extends string>(keys: readonly K[], source: K, target: K, after = false): K[] => {
  if (source === target || !keys.includes(source) || !keys.includes(target)) return [...keys];
  const next = keys.filter(key => key !== source);
  next.splice(next.indexOf(target) + Number(after), 0, source);
  return next;
};

/** Keep the original, interactive header inside both its table and scrolling viewport. */
export const stickyHeaderOffset = (top: number, bottom: number, height: number, viewportTop: number): number =>
  Math.max(0, Math.min(viewportTop - top, bottom - top - height));

/** ERP date-only values stay date-only; timestamps explicitly carrying a timezone use Korea time. */
export const formatDeliveryDateTime = (value?: string | null): string => {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) {
    if (/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(date).map(part => [part.type, part.value]));
        return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
      }
    }
    return value.slice(0, 16).replace('T', ' ');
  }
  return value;
};
