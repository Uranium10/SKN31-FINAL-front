import React, { useState } from 'react';
import type { POItem, SupplierScores } from '../types';
import {
  CheckCircle2,
  Clock,
  FileText,
  X,
  AlertTriangle,
  PackageCheck,
  ClipboardList,
  Star,
  Mail,
  XCircle,
  ShoppingCart,
} from 'lucide-react';

interface POManagementViewProps {
  poItems: POItem[];
  onRequestPR: (poId: string) => void;
  onSupplierAcceptOrder: (poId: string, decision?: 'accept' | 'reject', reason?: string) => void;
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
  onRequestPR,
  onSupplierAcceptOrder,
  onReturnToMR,
  onMarkArrived,
  onSubmitScorecard,
}) => {
  const [selectedMRDetail, setSelectedMRDetail] = useState<POItem | null>(null);
  const [selectedRejectReason, setSelectedRejectReason] = useState<POItem | null>(null);
  const [emailModalItem, setEmailModalItem] = useState<POItem | null>(null);
  const [scorecardItem, setScorecardItem] = useState<POItem | null>(null);
  const [draftScores, setDraftScores] = useState<Partial<SupplierScores>>({});
  const [showRejectInput, setShowRejectInput] = useState<boolean>(false);
  const [rejectReasonText, setRejectReasonText] = useState<string>('');

  const openScorecard = (item: POItem) => {
    setScorecardItem(item);
    setDraftScores(item.scorecardScores ?? {});
  };

  const closeScorecard = () => {
    setScorecardItem(null);
    setDraftScores({});
  };

  const handleRequestPRClick = (item: POItem) => {
    if (item.supplierApprovalStatus === 'pending') {
      onRequestPR(item.id);
    }
    setEmailModalItem(item);
  };

  const handleSupplierAcceptClick = (item: POItem) => {
    onSupplierAcceptOrder(item.id, 'accept');
    setEmailModalItem(null);
    setShowRejectInput(false);
  };

  const handleSupplierRejectSubmit = (item: POItem) => {
    if (!rejectReasonText.trim() || rejectReasonText.trim().length < 2) {
      alert('거절 사유를 2자 이상 입력해 주세요.');
      return;
    }
    onSupplierAcceptOrder(item.id, 'reject', rejectReasonText.trim());
    setEmailModalItem(null);
    setShowRejectInput(false);
    setRejectReasonText('');
  };

  const isDraftComplete = SCORECARD_CRITERIA.every((criterion) => draftScores[criterion.key]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner Guide (Matching Screenshot 1 exactly) */}
      <div
        style={{
          backgroundColor: '#e6f4ea',
          border: '1px solid #ceead6',
          borderRadius: '8px',
          padding: '14px 20px',
          fontSize: '13px',
          color: '#137333',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <PackageCheck size={20} color="#137333" />
        <span>
          <strong>PO 발송 전 최종 승인부터 입고·대금결제·협력사 평가까지 관리합니다.</strong> ERPNext의 <strong>Purchase Receipt, Purchase Invoice, Payment Entry</strong>를 기준으로 진행상태를 자동 갱신합니다.
        </span>
      </div>

      {/* PO Management Table (Matching Screenshot 1 Columns and Layout) */}
      <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '10px', backgroundColor: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)' }}>
        <table className="custom-table" style={{ width: '100%', minWidth: '980px' }}>
          <thead>
            <tr>
              <th style={{ width: '120px' }}>PO / MR 번호</th>
              <th style={{ width: '250px' }}>품목명 및 아이템코드</th>
              <th style={{ width: '130px', textAlign: 'right' }}>발주금액</th>
              <th style={{ width: '130px', textAlign: 'center' }}>약정 납기일</th>
              <th style={{ width: '120px', textAlign: 'center' }}>실제 수령일</th>
              <th style={{ width: '140px', textAlign: 'center' }}>대금결제</th>
              <th style={{ width: '220px', textAlign: 'center' }}>진행상태</th>
            </tr>
          </thead>
          <tbody>
            {poItems.map((item) => {
              const isPRRequested = item.supplierApprovalStatus === 'pr_requested';
              const isPending = item.supplierApprovalStatus === 'pending';
              const isAccepted = item.supplierApprovalStatus === 'accepted' || item.supplierApprovalStatus === 'approved';
              const isRejected = item.supplierApprovalStatus === 'rejected';

              return (
                <tr key={item.id} style={{ height: '68px' }}>
                  {/* 1. PO / MR 번호 */}
                  <td>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-muted)', fontSize: '13px' }}>
                      {item.poNo || item.mrNo}
                    </span>
                  </td>

                  {/* 2. 품목명 및 아이템코드 */}
                  <td>
                    <button
                      type="button"
                      onClick={() => setSelectedMRDetail(item)}
                      title="클릭 시 MR 및 발주 상세 정보 확인"
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid rgba(60,60,67,0.12)',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        color: 'var(--text-main)',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <FileText size={14} color="var(--primary)" />
                      <span>{item.itemName}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                        ({item.itemCode})
                      </span>
                    </button>
                  </td>

                  {/* 3. 발주금액 */}
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: '14px', color: 'var(--text-main)' }}>
                    ₩{item.totalAmount.toLocaleString()}
                  </td>

                  {/* 4. 약정 납기일 */}
                  <td style={{ textAlign: 'center', fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                    {item.dueDate}
                  </td>

                  {/* 5. 실제 수령일 */}
                  <td style={{ textAlign: 'center', fontSize: '13px', color: item.actualDeliveryDate && item.actualDeliveryDate !== '-' ? 'var(--success)' : 'var(--text-dim)' }}>
                    {item.actualDeliveryDate || '-'}
                  </td>

                  {/* 6. 대금결제 */}
                  <td style={{ textAlign: 'center' }}>
                    <span className="badge badge-gray" style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '12px' }}>
                      {item.paymentStatus || '매입송장 대기'}
                    </span>
                  </td>

                  {/* 7. 진행상태 (Screenshot 1 matching Badges & Actions) */}
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      {/* Case 1: PR 요청 대기 (발주 시작 직후) */}
                      {isPending && (
                        <>
                          <span style={{ fontSize: '11px', color: 'var(--warning)', fontWeight: 700 }}>
                            PO 최종 승인 대기
                          </span>
                          <button
                            type="button"
                            className="btn-sm btn-primary"
                            onClick={() => handleRequestPRClick(item)}
                            style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '6px', backgroundColor: '#172033', color: '#fff', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            title="PR 요청 메일을 공급사로 발송합니다."
                          >
                            <ShoppingCart size={14} />
                            <span>PR 요청</span>
                          </button>
                        </>
                      )}

                      {/* Case 2: PR 요청 완료되어 공급사 이메일 수주대기 중 */}
                      {isPRRequested && (
                        <>
                          <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700 }}>
                            PR 요청 완료 (공급사 이메일 발송됨)
                          </span>
                          <button
                            type="button"
                            className="btn-sm btn-outline"
                            onClick={() => setEmailModalItem(item)}
                            style={{ fontSize: '11px', padding: '4px 10px' }}
                            title="공급사 이메일 수주접수 미리보기"
                          >
                            <Mail size={12} />
                            <span>이메일/수주접수</span>
                          </button>
                        </>
                      )}

                      {/* Case 3: 공급사 수주 거절 */}
                      {isRejected && (
                        <button
                          type="button"
                          className="btn-sm btn-reject"
                          onClick={() => setSelectedRejectReason(item)}
                          style={{ fontSize: '11px', padding: '5px 10px' }}
                        >
                          <AlertTriangle size={13} />
                          <span>수주거절 사유 확인</span>
                        </button>
                      )}

                      {/* Case 4: 수주 접수 완료 ➔ ERPNext PO 생성/Submit ➔ 입고 대기 */}
                      {(isAccepted || item.poCreated) && (
                        <>
                          <span className="badge badge-gray" style={{ fontSize: '11px', fontWeight: 600 }}>
                            입고 대기
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={11} /> Purchase Receipt 입고 대기
                          </span>

                          {!item.arrived && (
                            <button
                              type="button"
                              className="btn-sm btn-approve"
                              onClick={() => onMarkArrived(item.id)}
                              style={{ fontSize: '10px', padding: '2px 8px', marginTop: '2px' }}
                            >
                              도착/입고 확인
                            </button>
                          )}

                          {item.arrived && !item.scorecardCompleted && (
                            <button
                              type="button"
                              className="btn-sm btn-primary"
                              onClick={() => openScorecard(item)}
                              style={{ fontSize: '10px', padding: '2px 8px', marginTop: '2px' }}
                            >
                              Scorecard 평가
                            </button>
                          )}

                          {item.scorecardCompleted && item.scorecardScores && (
                            <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 700 }}>
                              Scorecard {getScoreAverage(item.scorecardScores).toFixed(1)}점
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {poItems.length === 0 && (
              <tr>
                <td colSpan={7} className="table-empty-state" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  현재 PO 관리 대상 물품이 없습니다. 협력사 선정 화면에서 '발주 시작'을 실행해 주세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ========================================================================= */}
      {/* 공급사 발송 메일 및 수주접수 미리보기 Modal */}
      {/* ========================================================================= */}
      {emailModalItem && (
        <div className="modal-overlay" onClick={() => setEmailModalItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '720px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Mail size={22} color="var(--primary)" />
                <div>
                  <h3 style={{ margin: 0 }}>공급사 발송 이메일 (PO 예정 내용 확인 및 수주접수)</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    공급사({emailModalItem.selectedSupplier}) 이메일에서 수주접수 클릭 시 BiddingFlow 상태가 수주접수로 변경되고 ERPNext PO가 생성/Submit 됩니다.
                  </span>
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => setEmailModalItem(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 메일 헤더 메타정보 */}
              <div style={{ backgroundColor: 'var(--bg-input)', borderRadius: '8px', padding: '14px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div><strong>수신자 (To):</strong> {emailModalItem.selectedSupplier} 영업담당자 &lt;sales@{emailModalItem.selectedSupplier.replaceAll(' ', '').toLowerCase()}.com&gt;</div>
                <div><strong>발신자 (From):</strong> 구매팀 &lt;procurement@company.com&gt;</div>
                <div><strong>제목 (Subject):</strong> <span style={{ color: 'var(--primary)', fontWeight: 700 }}>[PO 예정 안내] {emailModalItem.itemName} - 발주 예정 내용 확인 및 수주접수 요청</span></div>
              </div>

              {/* 메일 본문 카드 (Email Body Card) */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px', backgroundColor: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: 'var(--text-main)' }}>
                  안녕하세요, <strong>{emailModalItem.selectedSupplier}</strong> 귀중.<br />
                  귀사와 협의 완료된 구매 요청 건에 대한 PO 예정 내역을 전달드립니다.<br />
                  아래 내용을 확인하신 후 <strong>[수주 접수]</strong> 버튼을 클릭하여 수주 확정을 진행해 주시기 바랍니다.
                </p>

                {/* PO 상세 내역 */}
                <div style={{ backgroundColor: 'var(--bg-input)', padding: '14px', borderRadius: '6px', fontSize: '13px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div><strong>MR 번호:</strong> {emailModalItem.mrNo}</div>
                  <div><strong>PR 번호:</strong> {emailModalItem.prNo}</div>
                  <div><strong>CASE ID:</strong> {emailModalItem.caseId || 'CASE-2026-001'}</div>
                  <div><strong>RFQ 번호:</strong> {emailModalItem.rfqName || 'RFQ-2026-0891'}</div>
                  <div><strong>품목명:</strong> {emailModalItem.itemName}</div>
                  <div><strong>아이템코드:</strong> {emailModalItem.itemCode}</div>
                  <div><strong>요청 부서:</strong> {emailModalItem.department}</div>
                  <div><strong>약정 납기일:</strong> <span style={{ color: 'var(--danger)', fontWeight: 700 }}>📅 {emailModalItem.dueDate}</span></div>
                  <div><strong>응답 기한:</strong> {emailModalItem.expiresAt || '발송 후 72시간 내'}</div>
                  <div style={{ gridColumn: 'span 2', marginTop: '4px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)', fontSize: '14px' }}>
                    <strong>최종 발주 공급가액:</strong> <span style={{ color: 'var(--primary)', fontWeight: 700, fontFamily: 'monospace', fontSize: '16px' }}>₩{emailModalItem.totalAmount.toLocaleString()}</span>
                  </div>
                </div>

                {/* 메일 내부 수주접수 액션 영역 */}
                <div style={{ border: '2px dashed var(--primary)', borderRadius: '8px', padding: '16px', backgroundColor: 'var(--primary-soft)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary-hover)' }}>
                    [공급사 수주접수 확정 링크]
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    수주 접수 클릭 시: BiddingFlow 상태가 <strong>'수주 접수'</strong>로 변경 ➔ ERPNext PO 자동 생성 & Submit ➔ 공식 PO 이메일 발송
                  </div>

                  {!showRejectInput ? (
                    <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleSupplierAcceptClick(emailModalItem)}
                        style={{ padding: '10px 24px', fontSize: '14px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--success)', borderColor: 'var(--success)' }}
                      >
                        <CheckCircle2 size={18} />
                        수주 접수 (Order Accept)
                      </button>
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => setShowRejectInput(true)}
                        style={{ padding: '10px 16px', fontSize: '13px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      >
                        <XCircle size={16} />
                        수주 거절 (Reject)
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '480px', marginTop: '6px' }}>
                      <textarea
                        className="form-input"
                        rows={3}
                        placeholder="수주 거절 사유를 2자 이상 입력해 주세요..."
                        value={rejectReasonText}
                        onChange={(e) => setRejectReasonText(e.target.value)}
                        style={{ fontSize: '13px' }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => setShowRejectInput(false)}
                          style={{ fontSize: '12px' }}
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          className="btn-reject"
                          onClick={() => handleSupplierRejectSubmit(emailModalItem)}
                          style={{ fontSize: '12px', padding: '6px 14px' }}
                        >
                          거절 확정 제출
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-outline" onClick={() => setEmailModalItem(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MR/PR 상세 확인 Modal */}
      {selectedMRDetail && (
        <div className="modal-overlay" onClick={() => setSelectedMRDetail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={20} color="var(--primary)" />
                <h3>MR 및 발주 상세 내역 ({selectedMRDetail.mrNo})</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setSelectedMRDetail(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ backgroundColor: 'var(--bg-input)', padding: '14px', borderRadius: '8px' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                  {selectedMRDetail.itemName} ({selectedMRDetail.itemCode})
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  요청부서: {selectedMRDetail.department} | 약정 납기일: {selectedMRDetail.dueDate}
                </div>
              </div>
              <div style={{ backgroundColor: 'var(--bg-input)', padding: '14px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>선정 공급사 및 발주 금액</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary)' }}>
                  {selectedMRDetail.selectedSupplier} · Total ₩{selectedMRDetail.totalAmount.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-primary" onClick={() => setSelectedMRDetail(null)}>
                확인 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PR / 수주 거절 사유 확인 Modal */}
      {selectedRejectReason && (
        <div className="modal-overlay" onClick={() => setSelectedRejectReason(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={20} color="var(--danger)" />
                <h3>공급사 수주 거절 사유 확인 ({selectedRejectReason.mrNo})</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setSelectedRejectReason(null)}>
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
              <button type="button" className="btn-outline" onClick={() => setSelectedRejectReason(null)}>
                닫기
              </button>
              <button
                type="button"
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

      {/* Supplier Scorecard 평가 Modal */}
      {scorecardItem && (
        <div className="modal-overlay" onClick={closeScorecard}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ClipboardList size={20} color="var(--primary)" />
                <h3>Supplier Scorecard ({scorecardItem.selectedSupplier})</h3>
              </div>
              <button type="button" className="icon-btn" onClick={closeScorecard}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {scorecardItem.poNo || scorecardItem.mrNo} · {scorecardItem.itemName} 건에 대해 아래 5개 항목을 5점 만점으로 평가해 주세요.
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
              <button type="button" className="btn-outline" onClick={closeScorecard}>
                취소
              </button>
              <button
                type="button"
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
