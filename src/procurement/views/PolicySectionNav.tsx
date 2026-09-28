import { useEffect, useRef, useState } from 'react';

const POLICY_SECTIONS = [
  ['policy-runtime', '모델 서버'], ['policy-mail', '메일 수신 제한'], ['policy-sources', '공급사 탐색'],
  ['policy-rules', '구매 판단 기준'], ['policy-weights', '견적 평가 가중치'], ['policy-automation', '자동 진행'],
  ['policy-guidance', 'AI 판단 지침'], ['policy-publish', '변경 검토'], ['policy-history', '게시 이력'],
] as const;

/** Follows the actual scroll container, including manual scrolling and nested sections. */
export function PolicySectionNav({ active, ready }: { active: boolean; ready: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState<string>(POLICY_SECTIONS[0][0]);
  useEffect(() => {
    if (!active || !ready) return;
    const root = ref.current?.closest('.company-policy');
    const scroller = root?.closest('.view-content') as HTMLElement | null;
    const target = scroller ?? window;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = (scroller?.getBoundingClientRect().top ?? 0) + 100;
      let selected: string = POLICY_SECTIONS[0][0];
      for (const [id] of POLICY_SECTIONS) {
        const section = root?.querySelector('#' + id);
        if (section && section.getBoundingClientRect().top <= top) selected = id;
      }
      // A short last section cannot always reach the top of the viewport.
      if (scroller && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) selected = 'policy-history';
      setCurrent(selected);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    target.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    if (root) observer.observe(root);
    measure();
    return () => { target.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); observer.disconnect(); cancelAnimationFrame(frame); };
  }, [active, ready]);
  return <nav ref={ref} className="policy-section-nav" aria-label="구매 정책 섹션 이동">
    <span className="policy-nav-caption">ON THIS PAGE</span>
    {POLICY_SECTIONS.map(([id, label], index) => <button type="button" key={id} disabled={!ready}
      aria-current={current === id ? 'location' : undefined} onClick={() => {
        ref.current?.closest('.company-policy')?.querySelector('#' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}><span className="policy-nav-marker" aria-hidden="true" /><small>{String(index + 1).padStart(2, '0')}</small>{label}</button>)}
  </nav>;
}
