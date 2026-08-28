import { History, RotateCcw, X, XCircle } from 'lucide-react';
import type { MaterialRequest, MRReviewHistoryEntry } from '../types';

interface MRReasonHistoryModalProps {
  request: MaterialRequest;
  history: MRReviewHistoryEntry[];
  onClose: () => void;
}

export function MRReasonHistoryModal({ request, history, onClose }: MRReasonHistoryModalProps) {
  const groupedHistory = [...history]
    .sort((a, b) => b.round - a.round)
    .reduce<Array<{ round: number; entries: MRReviewHistoryEntry[] }>>((groups, entry) => {
      const currentGroup = groups[groups.length - 1];
      if (currentGroup?.round === entry.round) {
        currentGroup.entries.push(entry);
      } else {
        groups.push({ round: entry.round, entries: [entry] });
      }
      return groups;
    }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content mr-history-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <History size={20} />
            <div>
              <h3>회차별 반려·복귀 사유</h3>
              <p>{request.mrNo} · {request.itemName} · {groupedHistory.length}개 차수</p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="이력 창 닫기">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body mr-history-list">
          {groupedHistory.map((group) => (
            <section className="mr-history-entry" key={group.round}>
              <div className="mr-history-marker">{group.round}</div>
              <div className="mr-history-content">
                <strong className="mr-history-round-title">{group.round}차 검토 이력</strong>
                <div className="mr-history-events">
                  {group.entries.map((entry) => {
                    const isSupplierReturn = entry.type === 'supplier_return';
                    return (
                      <article className="mr-history-event" key={entry.id}>
                        <div className="mr-history-head">
                          <span className={`badge ${isSupplierReturn ? 'badge-yellow' : 'badge-red'}`}>
                            {isSupplierReturn ? (
                              <><RotateCcw size={11} /> 협력사 거절·복귀</>
                            ) : (
                              <><XCircle size={11} /> 구매부서 반려</>
                            )}
                          </span>
                          <span>{entry.occurredAt}</span>
                        </div>
                        <p>{entry.reason}</p>
                        <small>처리 주체: {entry.source}</small>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-primary" onClick={onClose}>확인</button>
        </div>
      </div>
    </div>
  );
}
