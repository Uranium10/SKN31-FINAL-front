import { ArrowRight, CheckCircle2, X } from 'lucide-react';
import type { StageMovePlaceholder } from '../types';

interface StageMovePlaceholderRowProps {
  placeholder: StageMovePlaceholder;
  colSpan: number;
  onNavigate: (placeholder: StageMovePlaceholder) => void;
  onDismiss: (id: string) => void;
}

/** 원래 작업 행의 자리를 보존하면서 다음 위치를 알려주는 일회성 안내 행. */
export const StageMovePlaceholderRow = ({
  placeholder,
  colSpan,
  onNavigate,
  onDismiss,
}: StageMovePlaceholderRowProps) => (
  <tr className="stage-move-placeholder-row">
    <td colSpan={colSpan}>
      <div
        className="stage-move-placeholder"
        role="button"
        tabIndex={0}
        onClick={() => onNavigate(placeholder)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onNavigate(placeholder);
          }
        }}
      >
        <button
          type="button"
          className="stage-move-placeholder-close"
          aria-label={`${placeholder.mrNo} 이동 안내 닫기`}
          onClick={(event) => {
            event.stopPropagation();
            onDismiss(placeholder.id);
          }}
        >
          <X size={15} />
        </button>
        <span className="stage-move-placeholder-icon"><CheckCircle2 size={16} /></span>
        <span className="stage-move-placeholder-copy">
          <strong>{placeholder.mrNo}</strong>
          <span>{placeholder.itemName} 작업이 {placeholder.destinationLabel}(으)로 이동했습니다.</span>
        </span>
        {placeholder.destinationTab && (
          <span className="stage-move-placeholder-link">
            바로 가기 <ArrowRight size={14} />
          </span>
        )}
      </div>
    </td>
  </tr>
);
