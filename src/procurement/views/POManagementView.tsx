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
  Star,
  CircleDollarSign
} from 'lucide-react';

interface POManagementViewProps {
  poItems: POItem[];
  onCreatePO: (poId: string) => void;
  onReturnToMR: (poId: string) => void;
  onMarkArrived: (poId: string) => void;
  onSubmitScorecard: (poId: string, scores: SupplierScores) => void;
  isApiMode?: boolean;
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

const getOverallProgress = (item: POItem) => {
  if (!item.poCreated) return { label: 'PO 최종 승인 대기', className: 'badge-yellow' };
  if (item.deliveryStatus === 'PARTIAL') return { label: '부분 입고 진행 중', className: 'badge-yellow' };
  if (!item.arrived) return { label: '입고 대기', className: 'badge-gray' };
  if (item.paymentStatus === 'PARTIALLY_PAID') return { label: '부분 결제 진행 중', className: 'badge-yellow' };
  if (item.paymentStatus !== 'PAID') return { label: '대금 결제 대기', className: 'badge-yellow' };
  if (!item.scorecardCompleted) return { label: '협력사 평가 대기', className: 'badge-yellow' };
  return { label: '구매 업무 완료', className: 'badge-green' };
};

export const POManagementView: React.FC<POManagementViewProps> = ({
  poItems,
  onCreatePO,
  onReturnToMR,
  onMarkArrived,
  onSubmitScorecard,
  isApiMode = false,
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
          PO 발송 전 최종 승인부터 입고·대금결제·협력사 평가까지 관리합니다. ERPNext의 <strong>Purchase Receipt, Purchase Invoice, Payment Entry</strong>를 기준으로 진행상태를 자동 갱신합니다.
        </span>
      </div>

      {/* PO Management Table */}
      <div className="table-container">
        <table className="custom-table" style={{ minWidth: '1180px' }}>
          <thead>
            <tr>
              <th>PO 번호</th>
              <th>MR 번호</th>
              <th>품목명 및 아이템코드</th>
              <th>약정 납기일</th>
              <th>실제 수령일</th>
              <th>대금결제</th>
              <th>진행상태</th>
            </tr>
          </thead>
          <tbody>
            {poItems.map((item) => (
              <tr key={item.id} className={`workflow-transition-${item.transitionPhase ?? 'stable'}`}>
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
                <td>
                  <span style={{ fontWeight: 600 }}>{item.promisedDeliveryDate ?? item.dueDate}</span>
                </td>
                <td>
                  {item.fullReceiptDate ?? item.arrivedDate ?? item.firstReceiptDate ?? '-'}
                  {item.deliveryStatus === 'PARTIAL' && item.firstReceiptDate && (
                    <div style={{ marginTop: '3px', fontSize: '10px', color: 'var(--warning)' }}>
                      부분 입고 시작일
                    </div>
                  )}
                </td>
                <td>
                  {item.paymentStatus === 'PAID' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span className="badge badge-green">
                        <CheckCircle2 size={12} /> 결제 완료
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                        {item.lastPaymentDate ?? item.latestInvoiceName ?? ''}
                      </span>
                    </div>
                  ) : item.paymentStatus === 'PARTIALLY_PAID' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span className="badge badge-yellow">
                        <CircleDollarSign size={12} /> 부분 결제
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                        ₩{(item.paidAmount ?? 0).toLocaleString()} / ₩{(item.invoiceTotal ?? 0).toLocaleString()}
                      </span>
                    </div>
                  ) : item.paymentStatus === 'UNPAID' ? (
                    <span className="badge badge-yellow">
                      <Clock size={12} /> 결제 대기
                    </span>
                  ) : (
                    <span className="badge badge-gray">
                      <FileText size={12} /> 매입송장 대기
                    </span>
                  )}
                </td>
                {/* 최종 승인 -> PO -> 입고 -> 결제 -> Scorecard */}
                <td>
                  <div className="mr-stage-cell">
                    {(() => {
                      const progress = getOverallProgress(item);
                      return (
                        <span className={`badge ${progress.className}`}>
                          {progress.label}
                        </span>
                      );
                    })()}
                    {!item.poCreated && (item.approvalStatus ?? 'pending') === 'pending' && (
                      <button className="btn-sm btn-primary" onClick={() => setApprovalModalItem(item)}>
                        <ShoppingCart size={14} />
                        <span>PO 발송 최종 승인</span>
                      </button>
                    )}
                    {item.poCreated && !item.arrived && (
                      <>
                        <span className={item.deliveryStatus === 'PARTIAL' ? 'badge badge-yellow' : 'badge badge-gray'}>
                          <Clock size={12} /> {item.deliveryStatus === 'PARTIAL'
                            ? `부분 입고 ${item.receivedQty ?? 0}/${item.orderedQty ?? 0}`
                            : 'Purchase Receipt 입고 대기'}
                        </span>
                        {!isApiMode && (
                          <button className="btn-sm btn-outline" onClick={() => onMarkArrived(item.id)}>
                            <PackageCheck size={14} />
                            <span>목업: 입고 웹훅 수신</span>
                          </button>
                        )}
                      </>
                    )}
                    {item.poCreated && item.arrived && !item.scorecardCompleted && (
                      <>
                        <button className="btn-sm btn-primary" onClick={() => openScorecard(item)}>
                          <ClipboardList size={14} />
                          <span>Supplier Scorecard 작성</span>
                        </button>
                      </>
                    )}
                    {item.scorecardCompleted && (
                      <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={12} /> 평가 완료
                        {item.scorecardScores && ` · 평균 ${getScoreAverage(item.scorecardScores).toFixed(1)}점`}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {poItems.length === 0 && (
              <tr>
                <td colSpan={7} className="table-empty-state">
                  발주 시작 또는 입고 진행 중인 건이 없습니다.
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
              {selectedMRDetail.poCreated && (
                <div style={{ backgroundColor: 'var(--bg-input)', padding: '14px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px' }}>ERP 후속 문서</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '6px 12px', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Purchase Receipt</span>
                    <strong>{selectedMRDetail.fullReceiptDate ? `입고 완료 · ${selectedMRDetail.fullReceiptDate}` : '입고 대기'}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>Purchase Invoice</span>
                    <strong>{selectedMRDetail.latestInvoiceName ?? '생성 대기'}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>Payment Entry</span>
                    <strong>{selectedMRDetail.latestPaymentEntry ?? (selectedMRDetail.paymentStatus === 'PAID' ? '결제 완료' : '결제 대기')}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>결제 금액</span>
                    <strong>
                      ₩{(selectedMRDetail.paidAmount ?? 0).toLocaleString()}
                      {selectedMRDetail.invoiceTotal ? ` / ₩${selectedMRDetail.invoiceTotal.toLocaleString()}` : ''}
                    </strong>
                  </div>
                </div>
              )}
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
                협력사, 금액과 납기를 최종 확인했습니다. 승인하면 법적 효력이 있는 PO를 생성·Submit하고 협력사에 발송합니다.
              </p>
              <div style={{ backgroundColor: 'var(--bg-input)', padding: '12px', borderRadius: '6px', fontSize: '13px' }}>
                <div>발주 품목: <strong>{approvalModalItem.itemName}</strong></div>
                <div>선정 협력사: <strong>{approvalModalItem.selectedSupplier}</strong></div>
                <div>발주 금액: <strong style={{ color: 'var(--success)' }}>₩{approvalModalItem.totalAmount.toLocaleString()}</strong></div>
                {approvalModalItem.purchaseMode === 'direct' && (
                  <div style={{ marginTop: '8px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    카탈로그식 직접구매 · 최근 거래
                    {approvalModalItem.referencePO ? ` ${approvalModalItem.referencePO}` : ''}
                    {approvalModalItem.referenceUnitPrice
                      ? ` · 단가 ₩${approvalModalItem.referenceUnitPrice.toLocaleString()}`
                      : ''}
                    를 기준으로 생성합니다.
                  </div>
                )}
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
                최종 승인 및 PO 발송
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
