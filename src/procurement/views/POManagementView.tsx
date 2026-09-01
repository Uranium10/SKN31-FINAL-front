import React, { useState } from 'react';
import type { POItem } from '../types';
import {
  ShoppingCart,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  X,
  AlertTriangle,
  FileCheck,
  Link2,
  RotateCcw
} from 'lucide-react';

interface POManagementViewProps {
  poItems: POItem[];
  onCreatePO: (poId: string) => void;
  onReturnToMR: (poId: string) => void;
  onResolvePOIssue: (poId: string, supplierInfo: { erpSupplierId?: string; email: string }) => void;
}

export const POManagementView: React.FC<POManagementViewProps> = ({
  poItems,
  onCreatePO,
  onReturnToMR,
  onResolvePOIssue,
}) => {
  const [selectedMRDetail, setSelectedMRDetail] = useState<POItem | null>(null);
  const [selectedRejectReason, setSelectedRejectReason] = useState<POItem | null>(null);
  const [approvalModalItem, setApprovalModalItem] = useState<POItem | null>(null);
  const [issueModalItem, setIssueModalItem] = useState<POItem | null>(null);
  const [erpSupplierId, setErpSupplierId] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');

  const handleOpenIssueModal = (item: POItem) => {
    setIssueModalItem(item);
    setErpSupplierId('');
    setSupplierEmail('');
  };

  const handleResolveIssue = (event: React.FormEvent) => {
    event.preventDefault();
    if (!issueModalItem || !supplierEmail.trim()) return;
    if (issueModalItem.processingIssue?.code !== 'email_send_failed' && !erpSupplierId.trim()) return;
    onResolvePOIssue(issueModalItem.id, {
      erpSupplierId: erpSupplierId.trim(),
      email: supplierEmail.trim(),
    });
    setIssueModalItem(null);
    setErpSupplierId('');
    setSupplierEmail('');
  };

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
        <FileCheck size={18} color="var(--success)" />
        <span>
          6-1) <strong>PR 협력사 승인여부</strong>를 확인하고, 6-2) <strong>승인 완료 항목에 한해 PO 생성(결재권자 결재)</strong>을 진행할 수 있습니다.
        </span>
      </div>

      {/* PO Management Table */}
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>PR 번호</th>
              <th>연동 MR 번호</th>
              <th>요청 부서</th>
              <th>품목명 및 아이템코드</th>
              <th>MR 상세 확인 (6-1)</th>
              <th>선정 협력사</th>
              <th>총 금액</th>
              <th>PR 협력사 승인 여부 (6-1)</th>
              <th>PO 생성 / 거절 사유 확인 (6-2)</th>
            </tr>
          </thead>
          <tbody>
            {poItems.map((item) => (
              <tr
                key={item.id}
                className={item.processingIssue
                  ? item.processingIssue.code === 'email_send_failed'
                    ? 'po-row-has-warning'
                    : 'po-row-has-error'
                  : undefined}
              >
                {/* PR 번호 */}
                <td>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                    {item.prNo}
                  </span>
                </td>
                {/* MR 번호 */}
                <td>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                    {item.mrNo}
                  </span>
                </td>
                {/* 요청 부서 */}
                <td>{item.department}</td>
                {/* 품목명 */}
                <td>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.itemName}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                    {item.itemCode}
                  </div>
                </td>
                {/* 6-1) MR 내용 전체 확인 가능 버튼 */}
                <td>
                  <button
                    className="spec-clickable-btn"
                    onClick={() => setSelectedMRDetail(item)}
                  >
                    <FileText size={13} />
                    <span>MR 전체 확인</span>
                  </button>
                </td>
                {/* 선정 협력사 */}
                <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.selectedSupplier}</td>
                {/* 총 금액 */}
                <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-main)' }}>
                  ₩{item.totalAmount.toLocaleString()}
                </td>
                {/* 6-1) PR에 대한 협력사 승인 여부 */}
                <td>
                  {item.supplierApprovalStatus === 'approved' && (
                    <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} /> 협력사 승인 완료
                    </span>
                  )}
                  {item.supplierApprovalStatus === 'rejected' && (
                    <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <XCircle size={12} /> 협력사 거절
                    </span>
                  )}
                  {item.supplierApprovalStatus === 'pending' && (
                    <span className="badge badge-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} /> 승인 확인 대기 중
                    </span>
                  )}
                </td>
                {/* 6-2) 협력사 PR 승인된 것만 PO 생성 버튼 (결재권자 결재) / 거절 시 사유 기재란 확인 */}
                <td>
                  {item.processingIssue ? (
                    <div className="po-processing-issue">
                      <span className={`badge ${item.processingIssue.code === 'email_send_failed' ? 'badge-yellow' : 'badge-red'}`}>
                        <AlertTriangle size={12} />
                        {item.processingIssue.code === 'email_send_failed' ? 'PO 발송 실패' : 'PO 생성 실패'}
                      </span>
                      <button
                        type="button"
                        className="po-issue-action"
                        onClick={() => handleOpenIssueModal(item)}
                      >
                        조치 및 재시도
                      </button>
                    </div>
                  ) : item.supplierApprovalStatus === 'approved' ? (
                    item.poCreated ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span className="badge badge-blue">
                          ✓ {item.poNo} 생성 완료
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                          {item.createdDate}
                        </span>
                      </div>
                    ) : (
                      <button
                        className="btn-sm btn-primary"
                        onClick={() => setApprovalModalItem(item)}
                      >
                        <ShoppingCart size={14} />
                        <span>PO 생성 (결재 진행)</span>
                      </button>
                    )
                  ) : item.supplierApprovalStatus === 'rejected' ? (
                    <button
                      className="btn-sm btn-reject"
                      onClick={() => setSelectedRejectReason(item)}
                    >
                      <AlertTriangle size={14} />
                      <span>거절 사유 확인</span>
                    </button>
                  ) : (
                    <button
                      className="btn-sm btn-outline"
                      disabled
                    >
                      승인 대기중
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {poItems.length === 0 && (
              <tr>
                <td colSpan={9} className="table-empty-state">
                  PR 발송 또는 협력사 승인 대기 중인 건이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 6-1) MR 내용 전체 확인 Modal */}
      {selectedMRDetail && (
        <div className="modal-overlay" onClick={() => setSelectedMRDetail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={20} color="var(--primary)" />
                <h3>MR 및 PR 상세 내역 ({selectedMRDetail.prNo})</h3>
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
                  연동 MR: {selectedMRDetail.mrNo} | 요청부서: {selectedMRDetail.department} | 희망 납기일: {selectedMRDetail.dueDate}
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

      {/* 6-2) PR 거절 사유 확인 Modal */}
      {selectedRejectReason && (
        <div className="modal-overlay" onClick={() => setSelectedRejectReason(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={20} color="var(--danger)" />
                <h3>협력사 PR 거절 사유 확인 ({selectedRejectReason.prNo})</h3>
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

      {issueModalItem?.processingIssue && (
        <div className="modal-overlay" onClick={() => setIssueModalItem(null)}>
          <div className="modal-content po-issue-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-with-icon po-issue-modal-title">
                <AlertTriangle size={20} />
                <div>
                  <h3>{issueModalItem.processingIssue.title}</h3>
                  <p>{issueModalItem.mrNo} · {issueModalItem.selectedSupplier}</p>
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIssueModalItem(null)} aria-label="PO 오류 조치 창 닫기">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleResolveIssue}>
              <div className="modal-body po-issue-modal-body">
                <div className="po-issue-summary" role="alert">
                  <strong>{issueModalItem.processingIssue.detail}</strong>
                  <span>실패 시각 {issueModalItem.processingIssue.failedAt}</span>
                </div>

                <div className="po-recovery-steps">
                  <span><b>1</b> ERPNext Supplier 문서와 선정 협력사의 연결 정보를 확인합니다.</span>
                  <span><b>2</b> 아래 식별자와 수신 이메일을 보완합니다.</span>
                  <span><b>3</b> 기존 PR을 유지한 채 PO 생성만 다시 시도합니다.</span>
                </div>

                {issueModalItem.processingIssue.code !== 'email_send_failed' && (
                  <div className="form-group">
                    <label htmlFor="erp-supplier-id">ERPNext Supplier ID</label>
                    <div className="input-with-icon">
                      <Link2 size={15} />
                      <input
                        id="erp-supplier-id"
                        className="form-input"
                        value={erpSupplierId}
                        onChange={(event) => setErpSupplierId(event.target.value)}
                        placeholder="예: SUP-HD-001"
                        autoFocus
                        required
                      />
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="po-supplier-email">PO 수신 이메일</label>
                  <input
                    id="po-supplier-email"
                    className="form-input"
                    type="email"
                    value={supplierEmail}
                    onChange={(event) => setSupplierEmail(event.target.value)}
                    placeholder="orders@example.com"
                    autoFocus={issueModalItem.processingIssue.code === 'email_send_failed'}
                    required
                  />
                  <small>실제 연동에서는 저장 전에 ERPNext Supplier 조회 API로 ID와 이메일을 다시 검증합니다.</small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setIssueModalItem(null)}>닫기</button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!supplierEmail.trim() || (
                    issueModalItem.processingIssue.code !== 'email_send_failed' && !erpSupplierId.trim()
                  )}
                >
                  <RotateCcw size={15} /> 정보 저장 후 재시도
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6-2) PO 생성 (결재권자 결재) Modal */}
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
                  alert(`PO 결재가 승인되었습니다!\n새로운 발주서 번호 [PO-2025-00${Math.floor(Math.random() * 90 + 10)}]가 성공적으로 발행되었습니다.`);
                  setApprovalModalItem(null);
                }}
              >
                결재 승인 및 PO 생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
