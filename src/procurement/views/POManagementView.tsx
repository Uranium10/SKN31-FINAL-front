import React, { useState } from 'react';
import type { POItem, SupplierScores } from '../types';
import {
  ShoppingCart,
  CheckCircle2,
  Clock,
  FileText,
  X,
  AlertTriangle,
  PackageCheck,
  ClipboardList,
  Star
} from 'lucide-react';

interface POManagementViewProps {
  poItems: POItem[];
  onCreatePO: (poId: string) => void;
  onReturnToMR: (poId: string) => void;
  onMarkArrived: (poId: string) => void;
  onSubmitScorecard: (poId: string, scores: SupplierScores) => void;
}

const SCORECARD_CRITERIA: { key: keyof SupplierScores; label: string }[] = [
  { key: 'quality', label: '품질' },
  { key: 'leadTime', label: '납기 준수' },
  { key: 'price', label: '가격 경쟁력' },
  { key: 'service', label: '대응력' },
  { key: 'communication', label: '커뮤니케이션' },
];

const getScoreAverage = (scores: SupplierScores) => (
  (scores.quality + scores.leadTime + scores.price + scores.service + scores.communication) / 5
);

export const POManagementView: React.FC<POManagementViewProps> = ({
  poItems,
  onCreatePO,
  onReturnToMR,
  onMarkArrived,
  onSubmitScorecard,
}) => {
  const [selectedMRDetail, setSelectedMRDetail] = useState<POItem | null>(null);
  const [selectedRejectReason, setSelectedRejectReason] = useState<POItem | null>(null);
  const [approvalModalItem, setApprovalModalItem] = useState<POItem | null>(null);
  const [scorecardItem, setScorecardItem] = useState<POItem | null>(null);
  const [draftScores, setDraftScores] = useState<Partial<SupplierScores>>({});

  const openScorecard = (item: POItem) => {
    setScorecardItem(item);
    setDraftScores(item.scorecardScores ?? {});
  };

  const closeScorecard = () => {
    setScorecardItem(null);
    setDraftScores({});
  };

  const isDraftComplete = SCORECARD_CRITERIA.every((criterion) => draftScores[criterion.key]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        style={{
          backgroundColor: 'var(--success-bg)',
          border: '1px solid rgba(36, 138, 61, 0.14)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 18px',
          fontSize: '13px',
          color: 'var(--success)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}
      >
        <PackageCheck size={18} color="var(--success)" />
        <span>
          발주된 물품의 <strong>도착 여부를 확인</strong>하고, 도착 확인 후 <strong>Supplier Scorecard 평가</strong>를 완료하면 해당 건의 구매 프로세스가 종료됩니다.
        </span>
      </div>

      {/* PO Management Table */}
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>PO 번호</th>
              <th>MR 번호</th>
              <th>품목명 및 아이템코드</th>
              <th>도착여부</th>
            </tr>
          </thead>
          <tbody>
            {poItems.map((item) => (
              <tr key={item.id}>
                {/* PO 번호 */}
                <td>
                  {item.poCreated ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                        {item.poNo}
                      </span>
                      {item.createdDate && (
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{item.createdDate}</span>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-dim)' }}>발주 대기</span>
                  )}
                </td>
                {/* MR 번호 */}
                <td>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                    {item.mrNo}
                  </span>
                </td>
                {/* 품목명 및 아이템코드 (클릭 시 MR/PR 상세 확인) */}
                <td>
                  <button
                    className="spec-clickable-btn"
                    onClick={() => setSelectedMRDetail(item)}
                    title="클릭 시 요청부서, 선정 협력사, 발주 금액 등 상세 확인"
                  >
                    <FileText size={13} />
                    <span>
                      {item.itemName} ({item.itemCode})
                    </span>
                  </button>
                </td>
                {/* 도착여부: 협력사 승인 대기 -> PO 생성 -> 도착 확인 -> Supplier Scorecard 평가 순으로 진행 */}
                <td>
                  <div className="mr-stage-cell">
                    {item.supplierApprovalStatus === 'pending' && (
                      <span className="badge badge-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} /> 협력사 승인 대기중
                      </span>
                    )}
                    {item.supplierApprovalStatus === 'rejected' && !item.poCreated && (
                      <button className="btn-sm btn-reject" onClick={() => setSelectedRejectReason(item)}>
                        <AlertTriangle size={14} />
                        <span>거절 사유 확인</span>
                      </button>
                    )}
                    {item.supplierApprovalStatus === 'approved' && !item.poCreated && (
                      <button className="btn-sm btn-primary" onClick={() => setApprovalModalItem(item)}>
                        <ShoppingCart size={14} />
                        <span>PO 생성 (결재 진행)</span>
                      </button>
                    )}
                    {item.poCreated && !item.arrived && (
                      <button className="btn-sm btn-approve" onClick={() => onMarkArrived(item.id)}>
                        <PackageCheck size={14} />
                        <span>도착 확인</span>
                      </button>
                    )}
                    {item.poCreated && item.arrived && !item.scorecardCompleted && (
                      <>
                        <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={12} /> 도착 완료
                        </span>
                        <button className="btn-sm btn-primary" onClick={() => openScorecard(item)}>
                          <ClipboardList size={14} />
                          <span>Supplier Scorecard 작성</span>
                        </button>
                      </>
                    )}
                    {item.scorecardCompleted && item.scorecardScores && (
                      <span className="badge badge-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={12} /> 평가 완료 · 평균 {getScoreAverage(item.scorecardScores).toFixed(1)}점
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {poItems.length === 0 && (
              <tr>
                <td colSpan={4} className="table-empty-state">
                  PR 발송 또는 협력사 승인 대기 중인 건이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MR/PR 상세 확인 Modal */}
      {selectedMRDetail && (
        <div className="modal-overlay" onClick={() => setSelectedMRDetail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={20} color="var(--primary)" />
                <h3>MR 및 발주 상세 내역 ({selectedMRDetail.mrNo})</h3>
              </div>
              <button className="icon-btn" onClick={() => setSelectedMRDetail(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ backgroundColor: 'var(--bg-input)', padding: '14px', borderRadius: '8px' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                  {selectedMRDetail.itemName} ({selectedMRDetail.itemCode})
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  요청부서: {selectedMRDetail.department} | 희망 납기일: {selectedMRDetail.dueDate}
                </div>
              </div>
              <div style={{ backgroundColor: 'var(--bg-input)', padding: '14px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>선정 공급사 및 발주 금액</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--success)' }}>
                  {selectedMRDetail.selectedSupplier} · Total ₩{selectedMRDetail.totalAmount.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setSelectedMRDetail(null)}>
                확인 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PR 거절 사유 확인 Modal */}
      {selectedRejectReason && (
        <div className="modal-overlay" onClick={() => setSelectedRejectReason(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={20} color="var(--danger)" />
                <h3>협력사 PR 거절 사유 확인 ({selectedRejectReason.mrNo})</h3>
              </div>
              <button className="icon-btn" onClick={() => setSelectedRejectReason(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                공급사: <strong style={{ color: 'var(--text-main)' }}>{selectedRejectReason.selectedSupplier}</strong>
              </div>
              <div
                style={{
                  backgroundColor: 'var(--danger-bg)',
                  borderLeft: '2px solid var(--danger)',
                  padding: '14px',
                  borderRadius: '6px',
                  color: 'var(--danger)',
                  fontSize: '13px',
                  lineHeight: '1.5'
                }}
              >
                {selectedRejectReason.rejectReason || '사유가 작성되지 않았습니다.'}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setSelectedRejectReason(null)}>
                닫기
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  onReturnToMR(selectedRejectReason.id);
                  setSelectedRejectReason(null);
                }}
              >
                MR 재검토로 보내기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PO 생성 (결재권자 결재) Modal */}
      {approvalModalItem && (
        <div className="modal-overlay" onClick={() => setApprovalModalItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '500px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShoppingCart size={20} color="var(--success)" />
                <h3>PO 생성 및 전자 결재 요청</h3>
              </div>
              <button className="icon-btn" onClick={() => setApprovalModalItem(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                협력사({approvalModalItem.selectedSupplier})의 PR 승인이 완료된 항목입니다. 결재권자 승인 후 PO를 최종 생성하시겠습니까?
              </p>
              <div style={{ backgroundColor: 'var(--bg-input)', padding: '12px', borderRadius: '6px', fontSize: '13px' }}>
                <div>발주 품목: <strong>{approvalModalItem.itemName}</strong></div>
                <div>발주 금액: <strong style={{ color: 'var(--success)' }}>₩{approvalModalItem.totalAmount.toLocaleString()}</strong></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setApprovalModalItem(null)}>
                취소
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  onCreatePO(approvalModalItem.id);
                  setApprovalModalItem(null);
                }}
              >
                결재 승인 및 PO 생성
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Scorecard 평가 Modal */}
      {scorecardItem && (
        <div className="modal-overlay" onClick={closeScorecard}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ClipboardList size={20} color="var(--primary)" />
                <h3>Supplier Scorecard ({scorecardItem.selectedSupplier})</h3>
              </div>
              <button className="icon-btn" onClick={closeScorecard}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {scorecardItem.poNo} · {scorecardItem.mrNo} · {scorecardItem.itemName} 건에 대해 아래 5개 항목을 5점 만점으로 평가해 주세요.
              </p>
              {SCORECARD_CRITERIA.map((criterion) => (
                <div key={criterion.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{criterion.label}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3, 4, 5].map((value) => {
                      const isFilled = (draftScores[criterion.key] ?? 0) >= value;
                      return (
                        <button
                          key={value}
                          type="button"
                          className="icon-btn"
                          aria-label={`${criterion.label} ${value}점`}
                          onClick={() => setDraftScores((previous) => ({ ...previous, [criterion.key]: value }))}
                          style={{ padding: '2px' }}
                        >
                          <Star
                            size={20}
                            color={isFilled ? 'var(--warning)' : 'var(--text-dim)'}
                            fill={isFilled ? 'var(--warning)' : 'none'}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={closeScorecard}>
                취소
              </button>
              <button
                className="btn-primary"
                disabled={!isDraftComplete}
                onClick={() => {
                  if (!isDraftComplete) return;
                  onSubmitScorecard(scorecardItem.id, draftScores as SupplierScores);
                  closeScorecard();
                }}
              >
                평가 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
