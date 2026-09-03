import React, { useEffect, useRef } from 'react';

interface SmartTableContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * 넓은 표의 실제 가로 스크롤바가 화면 아래로 내려간 동안에만,
 * 현재 뷰포트 하단에 동기화된 보조 스크롤바를 표시한다.
 *
 * 표 자체와 보조 바는 scrollLeft만 공유하며 행/셀 DOM은 복제하지 않는다.
 * ResizeObserver와 requestAnimationFrame으로 측정을 묶어 큰 목록에서도
 * React 재렌더링 없이 브라우저 레이아웃만 갱신한다.
 */
export const SmartTableContainer: React.FC<SmartTableContainerProps> = ({
  children,
  className = '',
  ...props
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const content = contentRef.current;
    const floating = floatingRef.current;
    const spacer = spacerRef.current;
    if (!content || !floating || !spacer) return undefined;

    let frame = 0;
    let syncingFromFloating = false;
    const verticalScroller = content.closest<HTMLElement>('.view-content') ?? window;

    const measure = () => {
      frame = 0;
      const rect = content.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const overflowing = content.scrollWidth > content.clientWidth + 1;
      const nativeScrollbarBelowViewport = rect.bottom > viewportHeight;
      const tableIsVisible = rect.top < viewportHeight - 24 && rect.bottom > 24;
      const show = overflowing && nativeScrollbarBelowViewport && tableIsVisible;

      floating.classList.toggle('is-visible', show);
      spacer.style.width = `${content.scrollWidth}px`;
      if (show) {
        const left = Math.max(0, rect.left);
        const right = Math.min(viewportWidth, rect.right);
        floating.style.left = `${left}px`;
        floating.style.width = `${Math.max(0, right - left)}px`;
        if (!syncingFromFloating) floating.scrollLeft = content.scrollLeft;
      }
    };

    const scheduleMeasure = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    const syncFromContent = () => {
      if (!syncingFromFloating) floating.scrollLeft = content.scrollLeft;
      scheduleMeasure();
    };
    const syncFromFloating = () => {
      syncingFromFloating = true;
      content.scrollLeft = floating.scrollLeft;
      window.requestAnimationFrame(() => { syncingFromFloating = false; });
    };

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(content);
    if (content.firstElementChild) observer.observe(content.firstElementChild);
    content.addEventListener('scroll', syncFromContent, { passive: true });
    floating.addEventListener('scroll', syncFromFloating, { passive: true });
    verticalScroller.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('resize', scheduleMeasure, { passive: true });
    measure();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      content.removeEventListener('scroll', syncFromContent);
      floating.removeEventListener('scroll', syncFromFloating);
      verticalScroller.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, []);

  return (
    <>
      <div ref={contentRef} className={`table-container ${className}`.trim()} {...props}>
        {children}
      </div>
      <div ref={floatingRef} className="smart-horizontal-scroll" aria-hidden="true">
        <div ref={spacerRef} className="smart-horizontal-scroll-spacer" />
      </div>
    </>
  );
};
