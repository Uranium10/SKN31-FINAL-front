import { useCallback, useEffect, useRef, useState } from 'react';
import { listWorkProgress, type WorkProgress } from '../api/workProgress';

/** SSE is an invalidation signal, not business state. A slow DB-only recovery
 * read covers reconnects/missed signals; node events never reload 200 cases.
 * One request at a time and a bounded trailing refresh absorb event bursts. */
export function useWorkProgress(enabled: boolean, onCasesChanged: () => Promise<void>) {
  const [items, setItems] = useState<WorkProgress[]>([]);
  const [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState('');
  const [truncated, setTruncated] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const invalidateRef = useRef<() => void>(() => {});
  const onChangedRef = useRef(onCasesChanged);
  useEffect(() => { onChangedRef.current = onCasesChanged; }, [onCasesChanged]);
  const refresh = useCallback(() => refreshRef.current(), []);
  const invalidateCases = useCallback(() => invalidateRef.current(), []);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let busy = false;
    let dirty = false;
    let timer: number | undefined;
    let revision: string | undefined;
    let forceCases = false;
    const schedule = () => {
      dirty = true;
      if (disposed || busy || timer !== undefined || document.visibilityState === 'hidden') return;
      timer = window.setTimeout(() => { timer = undefined; void load(); }, 750);
    };
    const load = async () => {
      if (disposed || busy) return;
      busy = true; dirty = false;
      try {
        const result = await listWorkProgress();
        if (disposed) return;
        // History/readiness updates affect only the small dashboard projection.
        // Business-state changes alone invalidate the authoritative case list.
        const nextRevision = JSON.stringify(result.items.map(r => [r.case_id, r.version, r.updated_at]).sort());
        const changed = forceCases || (revision !== undefined && revision !== nextRevision);
        forceCases = false;
        setItems(result.items); setTruncated(result.truncated);
        setCheckedAt(new Date().toISOString()); setError('');
        if (changed) {
          try { await onChangedRef.current(); }
          catch (e) { forceCases = true; throw e; }
        }
        revision = nextRevision;
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : '진행 현황을 확인하지 못했습니다.');
      } finally {
        busy = false;
        if (dirty && !disposed) schedule();
      }
    };
    refreshRef.current = schedule;
    invalidateRef.current = () => { forceCases = true; schedule(); };
    void load();
    const recovery = window.setInterval(schedule, 30_000);
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('focus', schedule);
    return () => {
      disposed = true; refreshRef.current = () => {}; invalidateRef.current = () => {};
      if (timer !== undefined) window.clearTimeout(timer);
      window.clearInterval(recovery);
      document.removeEventListener('visibilitychange', schedule);
      window.removeEventListener('focus', schedule);
    };
  }, [enabled]);
  return { items, error, checkedAt, truncated, refresh, invalidateCases };
}
