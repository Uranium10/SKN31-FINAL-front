import { useEffect, useRef, useState, type CSSProperties } from 'react';

interface HoverMarqueeTextProps {
  text: string;
  className?: string;
}

type MarqueeStyle = CSSProperties & {
  '--marquee-distance'?: string;
  '--marquee-duration'?: string;
};

/**
 * 긴 규격은 첫 부분을 고정해 보여주고, 마우스를 올린 동안에만 끝까지
 * 천천히 이동합니다. DOM 폭을 한 번 측정해 transform만 애니메이션하므로
 * 매 프레임 React 렌더링이나 layout 갱신을 일으키지 않습니다.
 */
export const HoverMarqueeText = ({ text, className = '' }: HoverMarqueeTextProps) => {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [metrics, setMetrics] = useState({ distance: 0, duration: 8 });

  useEffect(() => {
    const measure = () => {
      const viewport = viewportRef.current;
      const content = contentRef.current;
      if (!viewport || !content) return;
      const distance = Math.max(0, Math.ceil(content.scrollWidth - viewport.clientWidth));
      // 기존보다 빠른 약 52px/s로 이동하되, 시작과 끝을 읽을 짧은 정지는 유지합니다.
      const duration = Math.min(17, Math.max(5.5, distance / 52 + 3));
      setMetrics((previous) => (
        previous.distance === distance && previous.duration === duration
          ? previous
          : { distance, duration }
      ));
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (viewportRef.current) observer?.observe(viewportRef.current);
    if (contentRef.current) observer?.observe(contentRef.current);
    return () => observer?.disconnect();
  }, [text]);

  const style: MarqueeStyle = {
    '--marquee-distance': `${metrics.distance}px`,
    '--marquee-duration': `${metrics.duration}s`,
  };

  return (
    <span
      ref={viewportRef}
      className={`hover-marquee-text ${metrics.distance > 0 ? 'is-overflowing' : ''} ${className}`.trim()}
      style={style}
    >
      <span ref={contentRef} className="hover-marquee-text-content">{text}</span>
    </span>
  );
};
