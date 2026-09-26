import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface RowActionMenuItem {
  key: string;
  label: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface RowActionMenuProps {
  items: RowActionMenuItem[];
  /** 스크린리더용 - 어떤 행의 더보기 메뉴인지 */
  ariaLabel?: string;
}

/**
 * 표의 각 행마다 두는 '⋯' 더보기 버튼. 그 행 상태에 실제로 해당하는
 * 부가 액션만 items로 받아서 보여준다 - 새 기능을 만드는 게 아니라
 * 기존에 여러 컬럼/여러 버튼으로 흩어져 있던 것들을 한 곳으로 모으는
 * 용도다. items가 비어 있으면 버튼 자체를 렌더링하지 않는다(그 행엔
 * 부가 액션이 없다는 뜻).
 *
 * ExcelColumnHeader의 필터 드롭다운과 같은 방식(createPortal + 버튼
 * 기준 위치 계산 + mousedown/Escape로 닫기)을 그대로 따른다 - 표
 * 컨테이너가 overflow: auto라 일반 absolute로는 잘려 보이기 때문.
 */
export function RowActionMenu({ items, ariaLabel }: RowActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const menuWidth = 200;
    const estimatedMenuHeight = items.length * 38 + 12;
    const positionMenu = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = rect.bottom + 6;
      setPosition({
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
  }, [open, items.length]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn row-action-menu-trigger"
        aria-label={ariaLabel ?? '더보기'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          width: '28px',
          height: '28px',
          fontSize: '16px',
          lineHeight: 1,
          color: open ? 'var(--text-main)' : 'var(--text-muted)',
          backgroundColor: open ? 'var(--bg-input)' : 'transparent',
        }}
      >
        ⋯
      </button>
      {open && position && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            width: '200px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: '6px',
            zIndex: 200,
          }}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="row-action-menu-item"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '9px 12px',
                fontSize: '13px',
                fontFamily: 'inherit',
                border: 'none',
                background: 'transparent',
                borderRadius: 'var(--radius-sm)',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                color: item.disabled ? 'var(--text-dim)' : item.danger ? 'var(--danger)' : 'var(--text-main)',
                opacity: item.disabled ? 0.6 : 1,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
