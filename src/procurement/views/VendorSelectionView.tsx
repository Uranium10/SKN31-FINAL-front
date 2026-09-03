import React, { useMemo, useState } from 'react';
import type {
  VendorSelectionGroup,
  MaterialRequest,
  SupplierQuotation,
  SupplierScores,
  StageMovePlaceholder,
} from '../types';
import { SmartTableContainer } from '../components/SmartTableContainer';
import { StageMovePlaceholderRow } from '../components/StageMovePlaceholderRow';
import { ExcelColumnHeader } from '../components/ExcelColumnHeader';
import {
  matchesTableFilters,
  useSessionTableState,
  type TableColumnDefinition,
} from '../hooks/useSessionTableState';
import {
  Sparkles,
  FileText,
  X,
  Paperclip,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  LoaderCircle,
  AlertTriangle,
  Send,
  Building2,
  ExternalLink,
  Award
} from 'lucide-react';

type VendorColumnKey = 'mr' | 'dueDate' | 'suppliers' | 'deadline' | 'response' | 'status' | 'order';

const VENDOR_COLUMNS: readonly TableColumnDefinition<VendorColumnKey>[] = [
  { key: 'mr', label: 'MR 번호', defaultWidth: 205, minWidth: 150 },
  { key: 'dueDate', label: '납기요청일', defaultWidth: 180, minWidth: 135 },
  { key: 'suppliers', label: 'RFQ 협력사', defaultWidth: 230, minWidth: 170 },
  { key: 'deadline', label: '마감시간 (마감연장)', defaultWidth: 225, minWidth: 175 },
  { key: 'response', label: '견적 회신율 (%)', defaultWidth: 185, minWidth: 145, align: 'center' },
  { key: 'status', label: '진행상태', defaultWidth: 175, minWidth: 135 },
  { key: 'order', label: '발주 시작', defaultWidth: 155, minWidth: 120 },
] as const;

const responsePercent = (group: VendorSelectionGroup): number => {
  const responded = group.quotations.filter((quotation) => quotation.isResponded).length;
  return group.quotations.length > 0 ? Math.round((responded / group.quotations.length) * 100) : 0;
};

const vendorFilterValue = (group: VendorSelectionGroup, key: VendorColumnKey): string | number => {
  const selected = group.quotations.find((quotation) => quotation.supplierId === group.selectedSupplierId);
  switch (key) {
    case 'mr': return `${group.mrNo} · ${group.itemName}`;
    case 'dueDate': return `${group.targetDueDate} · ${group.department}`;
    case 'suppliers': return `${group.quotations.length}개사`;
    case 'deadline': return !group.rfqSent ? 'RFQ 발송 전' : selected ? '마감 완료' : `${group.deadlineDate} ${group.deadlineTime}`;
    case 'response': return `${responsePercent(group)}%`;
    case 'status': return selected ? '업체 선정완료' : '견적 요청상태';
    case 'order': return selected && (!group.workflowStage || group.workflowStage === 'ORDER_START') ? '발주 가능' : '대기';
  }
};

interface VendorSelectionViewProps {
  vendorGroups: VendorSelectionGroup[];
  movePlaceholders?: StageMovePlaceholder[];
  onDismissMovePlaceholder?: (id: string) => void;
  onNavigateMovePlaceholder?: (placeholder: StageMovePlaceholder) => void;
  requests?: MaterialRequest[];
  onSelectSupplier: (groupId: string, supplierId: string) => Promise<boolean> | boolean;
  onSendPO: (groupId: string) => void;
  onWithdrawSupplierSelection: (groupId: string, reason: string) => void;
  onOpenSpecModalByItemCode: (itemCode: string) => void;
  onExtendDeadline: (groupId: string, newDate: string, newTime: string) => Promise<boolean> | boolean;
  onSendRFQ: (
    groupId: string,
    supplierIds: string[],
    supplierEmails: Record<string, string>,
    deadlineDate: string,
    deadlineTime: string,
  ) => Promise<boolean> | boolean;
  onCheckQuotations: (groupId: string) => void;
}

interface RfqCandidateRow extends Omit<SupplierQuotation, 'scores'> {
  scores: SupplierScores | null;
  count5: number | null;
  rank: number | null;
  isManual: boolean;
}

// AI 5대 항목 평가 점수 생성 헬퍼 함수 (납기, 품질, 가격, 응대, 의사소통 각 5점 만점)
const getSupplierScores = (quotation: SupplierQuotation): SupplierScores => {
  if (quotation.scores) return quotation.scores;
  if (quotation.aiRank === 1) {
    return { leadTime: 5, quality: 5, price: 5, service: 4, communication: 5 };
  } else if (quotation.aiRank === 2) {
    return { leadTime: 5, quality: 4, price: 4, service: 5, communication: 5 };
  } else {
    return { leadTime: 4, quality: 5, price: 4, service: 4, communication: 5 };
  }
};

// 5점 만점 개수 산출 헬퍼
const getCountOf5 = (scores: SupplierScores): number => {
  return Object.values(scores).filter((v) => v === 5).length;
};

const formatExpectedDelivery = (quotation: SupplierQuotation): string => {
  if (quotation.expectedDeliveryDate) {
    const date = new Date(`${quotation.expectedDeliveryDate.slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? quotation.expectedDeliveryDate
      : date.toLocaleDateString('ko-KR');
  }
  return quotation.leadTimeDays > 0 ? `${quotation.leadTimeDays}일 소요` : '미기재';
};

const safeExternalUrl = (value?: string): string | null => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
};

export const VendorSelectionView: React.FC<VendorSelectionViewProps> = ({
  vendorGroups,
  movePlaceholders = [],
  onDismissMovePlaceholder = () => undefined,
  onNavigateMovePlaceholder = () => undefined,
  requests = [],
  onSelectSupplier,
  onSendPO,
  onWithdrawSupplierSelection,
  onExtendDeadline,
  onSendRFQ,
  onCheckQuotations,
}) => {
  // 모달 상태
  const [selectedGroup, setSelectedGroup] = useState<VendorSelectionGroup | null>(null);
  
  // 1. MR 번호 클릭 시 상세 모달
  const [showMRModal, setShowMRModal] = useState<boolean>(false);
  const [activeMR, setActiveMR] = useState<MaterialRequest | null>(null);

  // 2. RFQ 협력사 클릭 시 AI 추천 & 마감일 설정 모달
  const [showRfqModal, setShowRfqModal] = useState<boolean>(false);
  const [rfqSelectedSuppliers, setRfqSelectedSuppliers] = useState<Record<string, boolean>>({});
  const [rfqDeadlineDate, setRfqDeadlineDate] = useState<string>('');
  const [rfqDeadlineTime, setRfqDeadlineTime] = useState<string>('18:00');
  const [rfqSupplierEmails, setRfqSupplierEmails] = useState<Record<string, string>>({});
  const [rfqManualSuppliers, setRfqManualSuppliers] = useState<string[]>([]);
  const [rfqManualSupplierName, setRfqManualSupplierName] = useState('');
  const [rfqManualSupplierEmail, setRfqManualSupplierEmail] = useState('');
  const [rfqEmailErrors, setRfqEmailErrors] = useState<Record<string, boolean>>({});
  const [rfqValidationMessage, setRfqValidationMessage] = useState<string | null>(null);

  // 3. 견적 회신율 퍼센트 클릭 시 회신 상세 & 업체 선정 모달
  const [showQuotationModal, setShowQuotationModal] = useState<boolean>(false);
  const [selectedSupplierForApproval, setSelectedSupplierForApproval] = useState<string | null>(null);

  // 4. 마감시간 연장 모달
  const [extendingGroup, setExtendingGroup] = useState<VendorSelectionGroup | null>(null);
  const [extDate, setExtDate] = useState<string>('2025-01-25');
  const [extTime, setExtTime] = useState<string>('18:00');

  // 5. 선정 철회/변경 모달
  const [changingGroup, setChangingGroup] = useState<VendorSelectionGroup | null>(null);
  const [changeReason, setChangeReason] = useState('');
  const [selectingSupplierId, setSelectingSupplierId] = useState<string | null>(null);
  const [resultModal, setResultModal] = useState<{
    title: string;
    message: string;
    tone: 'success' | 'warning';
  } | null>(null);
  const tableState = useSessionTableState('vendor-selection', VENDOR_COLUMNS);
  const [sortColumn, setSortColumn] = useState<VendorColumnKey>('dueDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const vendorFilterOptions = useMemo(() => Object.fromEntries(VENDOR_COLUMNS.map((column) => [
    column.key,
    vendorGroups.map((group) => String(vendorFilterValue(group, column.key))),
  ])) as Record<VendorColumnKey, string[]>, [vendorGroups]);

  const visibleVendorGroups = useMemo(() => vendorGroups
    .filter((group) => matchesTableFilters(group, tableState.filters, vendorFilterValue))
    .sort((left, right) => {
      const leftValue = vendorFilterValue(left, sortColumn);
      const rightValue = vendorFilterValue(right, sortColumn);
      const compared = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'ko-KR', { numeric: true });
      return sortDirection === 'asc' ? compared : -compared;
    }), [sortColumn, sortDirection, tableState.filters, vendorGroups]);

  const rfqCandidateRows = useMemo<RfqCandidateRow[]>(() => {
    if (!selectedGroup) return [];
    const ranked = [...selectedGroup.quotations]
      .map((quotation) => {
        const scores = getSupplierScores(quotation);
        return { quotation, scores, count5: getCountOf5(scores) };
      })
      .sort((left, right) => right.count5 - left.count5)
      .map(({ quotation, scores, count5 }, index) => ({
        ...quotation,
        scores,
        count5,
        rank: index + 1,
        isManual: false,
      }));
    const manual = rfqManualSuppliers.map((name) => ({
      supplierId: name,
      supplierName: name,
      quoteUnitPrice: 0,
      quoteTotalPrice: 0,
      leadTimeDays: 0,
      isResponded: false,
      resContent: '사용자가 직접 추가한 RFQ 대상입니다.',
      resAttachments: [],
      aiRank: 0,
      aiScore: 0,
      aiReason: '직접 추가',
      isSelected: false,
      email: rfqSupplierEmails[name] || undefined,
      source: 'manual',
      scores: null,
      count5: null,
      rank: null,
      isManual: true,
    } satisfies RfqCandidateRow));
    return [...ranked, ...manual];
  }, [rfqManualSuppliers, rfqSupplierEmails, selectedGroup]);

  const selectedRfqCandidateCount = rfqCandidateRows.filter(
    (candidate) => rfqSelectedSuppliers[candidate.supplierId],
  ).length;

  // 1. MR 번호 클릭 처리 (MR 목록 내용 다 확인 가능하도록 설정)
  const handleOpenMRDetail = (group: VendorSelectionGroup) => {
    setSelectedGroup(group);
    const matchedMR = requests.find((r) => r.mrNo === group.mrNo) || null;
    setActiveMR(matchedMR);
    setShowMRModal(true);
  };

  // 2. RFQ 협력사 클릭 처리 (AI 순위/평가표/체크박스/마감일 모달)
  const handleOpenRfqModal = (group: VendorSelectionGroup) => {
    setSelectedGroup(group);
    setRfqDeadlineDate(group.deadlineDate || '2025-01-22');
    setRfqDeadlineTime(group.deadlineTime || '18:00');

    // 사람의 최종 확인 없이 RFQ 대상이 암묵적으로 선택되지 않도록 기본은 전체 해제합니다.
    setRfqSelectedSuppliers({});
    setRfqSupplierEmails(Object.fromEntries(
      group.quotations.map((quotation) => [quotation.supplierId, quotation.email ?? ''])
    ));
    setRfqManualSuppliers([]);
    setRfqManualSupplierName('');
    setRfqManualSupplierEmail('');
    setRfqEmailErrors({});
    setRfqValidationMessage(null);
    setShowRfqModal(true);
  };

  const handleAddManualSupplier = () => {
    const name = rfqManualSupplierName.trim();
    const email = rfqManualSupplierEmail.trim();
    if (!name || !email) {
      setResultModal({
        title: '직접 입력 정보를 확인해주세요',
        message: '협력사명과 RFQ 수신 이메일을 모두 입력해야 합니다.',
        tone: 'warning',
      });
      return;
    }
    if (
      selectedGroup?.quotations.some((quotation) => quotation.supplierName === name)
      || rfqManualSuppliers.includes(name)
    ) {
      setResultModal({
        title: '이미 포함된 협력사입니다',
        message: `${name}은(는) 현재 RFQ 대상 목록에 있습니다.`,
        tone: 'warning',
      });
      return;
    }
    setRfqManualSuppliers((previous) => [...previous, name]);
    setRfqSelectedSuppliers((previous) => ({ ...previous, [name]: true }));
    setRfqSupplierEmails((previous) => ({ ...previous, [name]: email }));
    setRfqEmailErrors((previous) => ({ ...previous, [name]: false }));
    setRfqValidationMessage(null);
    setRfqManualSupplierName('');
    setRfqManualSupplierEmail('');
  };

  const handleToggleRfqSupplier = (supplierId: string) => {
    setRfqSelectedSuppliers((prev) => ({
      ...prev,
      [supplierId]: !prev[supplierId],
    }));
    setRfqEmailErrors((previous) => ({ ...previous, [supplierId]: false }));
    setRfqValidationMessage(null);
  };

  const handleRemoveManualSupplier = (supplierId: string) => {
    setRfqManualSuppliers((previous) => previous.filter((name) => name !== supplierId));
    setRfqSelectedSuppliers((previous) => {
      const next = { ...previous };
      delete next[supplierId];
      return next;
    });
    setRfqSupplierEmails((previous) => {
      const next = { ...previous };
      delete next[supplierId];
      return next;
    });
    setRfqEmailErrors((previous) => {
      const next = { ...previous };
      delete next[supplierId];
      return next;
    });
    setRfqValidationMessage(null);
  };

  const handleSelectAllRfqSuppliers = () => {
    setRfqSelectedSuppliers(Object.fromEntries(
      rfqCandidateRows.map((candidate) => [candidate.supplierId, true]),
    ));
    setRfqValidationMessage(null);
  };

  const handleClearAllRfqSuppliers = () => {
    setRfqSelectedSuppliers({});
    setRfqEmailErrors({});
    setRfqValidationMessage(null);
  };

  const handleSendRfq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;

    const selectedSupplierIds = rfqCandidateRows
      .filter((candidate) => rfqSelectedSuppliers[candidate.supplierId])
      .map((candidate) => candidate.supplierId);
    const checkedCount = selectedSupplierIds.length;
    if (checkedCount === 0) {
      setRfqValidationMessage('RFQ를 발송할 협력사를 최소 1개 이상 선택해 주세요.');
      return;
    }

    const missingEmailIds = selectedSupplierIds.filter((supplierId) => (
      !(rfqSupplierEmails[supplierId] ?? '').trim()
    ));
    if (missingEmailIds.length > 0) {
      setRfqEmailErrors(Object.fromEntries(
        missingEmailIds.map((supplierId) => [supplierId, true]),
      ));
      setRfqValidationMessage(
        `선택한 협력사 ${missingEmailIds.length}곳의 이메일을 입력해야 RFQ를 발송할 수 있습니다.`,
      );
      return;
    }

    setRfqEmailErrors({});
    setRfqValidationMessage(null);
    const sent = await onSendRFQ(
      selectedGroup.id,
      selectedSupplierIds,
      rfqSupplierEmails,
      rfqDeadlineDate,
      rfqDeadlineTime,
    );
    if (!sent) return;
    setShowRfqModal(false);
    setResultModal({
      title: 'RFQ 발송을 시작했습니다',
      message: `[${selectedGroup.mrNo}] 선택한 ${checkedCount}개 협력사 · 견적 마감 ${rfqDeadlineDate} ${rfqDeadlineTime}`,
      tone: 'success',
    });
  };

  // 3. 견적 회신율(%) 클릭 처리 (상세사항 확인 & 체크박스 업체 선정)
  const handleOpenQuotationModal = (group: VendorSelectionGroup) => {
    setSelectedGroup(group);
    // 미회신 업체는 순위가 있더라도 선택할 수 없다. 기존 선정 업체 또는
    // 실제 회신 업체 중 AI 순위가 가장 높은 업체만 기본 선택한다.
    const currentSelected = group.selectedSupplierId
      || [...group.quotations]
        .filter((quotation) => quotation.isResponded)
        .sort((a, b) => a.aiRank - b.aiRank)[0]?.supplierId
      || null;
    setSelectedSupplierForApproval(currentSelected);
    setShowQuotationModal(true);
  };

  const handleConfirmSupplierSelection = async () => {
    if (!selectedGroup || !selectedSupplierForApproval || selectingSupplierId) return;
    const selectedQuotation = selectedGroup.quotations.find(
      (quotation) => quotation.supplierId === selectedSupplierForApproval,
    );
    if (!selectedQuotation?.isResponded) {
      setResultModal({
        title: '회신된 견적을 선택해주세요',
        message: '미회신 협력사는 최종 업체로 선정할 수 없습니다.',
        tone: 'warning',
      });
      return;
    }

    const groupId = selectedGroup.id;
    const supplierId = selectedSupplierForApproval;

    setSelectingSupplierId(supplierId);

    await new Promise((resolve) => window.setTimeout(resolve, 350));
    const selected = await onSelectSupplier(groupId, supplierId);
    if (selected) {
      setSelectedGroup((current) => {
        if (!current || current.id !== groupId) return current;
        return {
          ...current,
          selectedSupplierId: supplierId,
          quotations: current.quotations.map((q) => ({
            ...q,
            isSelected: q.supplierId === supplierId,
          })),
        };
      });
      setSelectingSupplierId(null);
      setShowQuotationModal(false);
      setResultModal({
        title: '최종 협력사 선정 완료',
        message: "표의 '발주 시작' 버튼을 눌러 PO 관리의 최종 승인 단계로 이동해 주세요.",
        tone: 'success',
      });
      return;
    }
    setSelectingSupplierId(null);
  };

  // 6. 진행상태 → 발주 시작 버튼 클릭 처리
  const handleSendPOClick = (group: VendorSelectionGroup) => {
    onSendPO(group.id);
  };

  // 4. 마감시간 연장 처리
  const handleOpenExtendModal = (group: VendorSelectionGroup) => {
    setExtendingGroup(group);
    setExtDate(group.deadlineDate || '2025-01-25');
    setExtTime(group.deadlineTime || '18:00');
  };

  const handleConfirmExtension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendingGroup) return;
    const extended = await onExtendDeadline(extendingGroup.id, extDate, extTime);
    if (!extended) return;
    setExtendingGroup(null);
    setResultModal({
      title: '견적 마감시간 연장 완료',
      message: `${extDate} ${extTime}까지 마감시간만 변경했습니다. 독촉 메일은 재발송하지 않았습니다.`,
      tone: 'success',
    });
  };

  // 5. 선정 변경 철회 처리
  const handleConfirmSelectionChange = (event: React.FormEvent) => {
    event.preventDefault();
    if (!changingGroup || !changeReason.trim()) return;

    onWithdrawSupplierSelection(changingGroup.id, changeReason.trim());
    setSelectedGroup(changingGroup);
    setChangingGroup(null);
    setChangeReason('');
    setShowQuotationModal(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 안내 상단 바 */}
      <div
        style={{
          backgroundColor: 'var(--primary-soft)',
          border: '1px solid rgba(60, 60, 67, 0.12)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 20px',
          fontSize: '13px',
          color: 'var(--primary-hover)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <Sparkles size={20} color="var(--accent)" />
        <span>
          <strong>협력사 선정 및 비교 관리 (표 형식)</strong>: 
          MR 번호 클릭 시 <strong>MR 상세정보 확인</strong>, RFQ 협력사 클릭 시 <strong>AI 5대 평가표 및 마감일 설정</strong>, 
          회신율 클릭 시 <strong>견적 상세비교 및 체크박스 업체 선정</strong>이 가능합니다.
        </span>
      </div>

      {/* 요구사항 핵심: 협력사 선정 표 (Table) */}
      <SmartTableContainer style={{ border: '1px solid var(--border-color)', borderRadius: '10px', backgroundColor: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)' }}>
        <table
          className="custom-table configurable-table"
          style={{ width: `${tableState.totalWidth}px`, minWidth: '100%' }}
        >
          <colgroup>
            {VENDOR_COLUMNS.map((column) => (
              <col key={column.key} style={{ width: tableState.widths[column.key] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {VENDOR_COLUMNS.map((column) => (
                <ExcelColumnHeader
                  key={column.key}
                  columnKey={column.key}
                  label={column.label}
                  width={tableState.widths[column.key]}
                  minWidth={column.minWidth}
                  align={column.align}
                  values={vendorFilterOptions[column.key]}
                  selectedValues={tableState.filters[column.key]}
                  onFilterChange={(selected) => tableState.setFilter(column.key, selected)}
                  onResizeStart={(event) => tableState.beginResize(column.key, event)}
                  activeSort={sortColumn === column.key ? sortDirection : undefined}
                  onSort={(direction) => { setSortColumn(column.key); setSortDirection(direction); }}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleVendorGroups.map((group, rowIndex) => {
              const respondedCount = group.quotations.filter((q) => q.isResponded).length;
              const totalSuppliers = group.quotations.length;
              const percent = totalSuppliers > 0 ? Math.round((respondedCount / totalSuppliers) * 100) : 0;
              const selectedQuotation = group.quotations.find((q) => q.supplierId === group.selectedSupplierId);
              const hasSelection = Boolean(group.selectedSupplierId);
              const rfqActive = Boolean(group.rfqSent);
              const canConfigureRFQ = !group.workflowStage
                || group.workflowStage === 'RFQ_TARGET_SELECTION';
              const canReviewQuotations = !group.workflowStage
                || ['QUOTATION_COLLECTION', 'SUPPLIER_SELECTION'].includes(group.workflowStage);
              const canStartOrder = hasSelection && (
                !group.workflowStage || group.workflowStage === 'ORDER_START'
              );

              return (
                <React.Fragment key={group.id}>
                  {movePlaceholders
                    .filter((placeholder) => placeholder.index === rowIndex)
                    .map((placeholder) => (
                      <StageMovePlaceholderRow
                        key={placeholder.id}
                        placeholder={placeholder}
                        colSpan={7}
                        onNavigate={onNavigateMovePlaceholder}
                        onDismiss={onDismissMovePlaceholder}
                      />
                    ))}
                  <tr
                  className={`workflow-transition-${group.transitionPhase ?? 'stable'}`}
                  style={{ height: '64px' }}
                >
                  {/* 1. MR 번호 (클릭 시 MR 목록 내용 다 확인 가능) */}
                  <td>
                    <button
                      type="button"
                      onClick={() => handleOpenMRDetail(group)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary)',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                      title="클릭하여 MR 상세 내용 확인"
                    >
                      <span>{group.mrNo}</span>
                      <ExternalLink size={13} color="var(--primary)" />
                    </button>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {group.itemName}
                    </div>
                  </td>

                  {/* 2. 납기요청일 (요청부서에서 요청한 납기일자) */}
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '13px' }}>
                        📅 {group.targetDueDate}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        요청부서: {group.department}
                      </span>
                    </div>
                  </td>

                  {/* 3. RFQ 협력사 (클릭 시 AI 추천 순위/평가표/체크박스/마감일 설정 창) */}
                  <td>
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      disabled={!canConfigureRFQ}
                      onClick={() => handleOpenRfqModal(group)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 600,
                        fontSize: '12px',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--primary)',
                        color: 'var(--primary)',
                        backgroundColor: 'var(--primary-soft)',
                        cursor: canConfigureRFQ ? 'pointer' : 'not-allowed',
                        opacity: canConfigureRFQ ? 1 : 0.55,
                      }}
                      title={canConfigureRFQ
                        ? 'AI 추천 협력사 순위, 이메일 확인 및 RFQ 발송'
                        : '협력사 추천이 끝나고 RFQ 대상 선택 단계가 되면 활성화됩니다.'}
                    >
                      <Building2 size={14} color="var(--primary)" />
                      <span>RFQ 협력사 추천 ({totalSuppliers}개사)</span>
                    </button>
                  </td>

                  {/* 4. 마감시간 (마감연장도 가능한) - RFQ 발송 전에는 흐리게 비활성화 */}
                  <td>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                        opacity: rfqActive ? 1 : 0.4,
                        pointerEvents: rfqActive ? 'auto' : 'none',
                      }}
                      title={rfqActive ? undefined : 'RFQ 발송 후 이용할 수 있습니다.'}
                    >
                      {hasSelection ? (
                        <span className="badge badge-gray" style={{ fontSize: '11px' }}>
                          <CheckCircle2 size={11} /> 마감 완료
                        </span>
                      ) : (
                        <>
                          <div style={{ fontSize: '12px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column' }}>
                            <span>{group.deadlineDate} {group.deadlineTime}</span>
                            <span style={{ fontSize: '11px', color: 'var(--warning)', fontWeight: 600 }}>
                              (D-{group.deadlineDDay}일 마감)
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn-sm btn-warning"
                            disabled={!rfqActive}
                            onClick={() => handleOpenExtendModal(group)}
                            style={{ fontSize: '11px', padding: '3px 8px', height: '26px' }}
                            title="협력사 메일 재발송 없이 견적 마감시간만 연장합니다."
                          >
                            <Calendar size={11} />
                            <span>연장</span>
                          </button>
                        </>
                      )}
                    </div>
                  </td>

                  {/* 5. 견적 회신율(%) (클릭 시 상세사항 확인 및 체크박스 업체 선정) - RFQ 발송 전에는 흐리게 비활성화 */}
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      disabled={!canReviewQuotations}
                      onClick={() => handleOpenQuotationModal(group)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: canReviewQuotations ? 'pointer' : 'not-allowed',
                        display: 'inline-flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        opacity: canReviewQuotations ? 1 : 0.4,
                      }}
                      title={canReviewQuotations ? '클릭하여 공급사별 견적 상세 비교 및 업체 선정' : '견적 수집/선정 단계에서 이용할 수 있습니다.'}
                    >
                      <span
                        className={`badge ${percent === 100 ? 'badge-green' : percent > 0 ? 'badge-purple' : 'badge-yellow'}`}
                        style={{ fontSize: '12px', fontWeight: 700, padding: '5px 10px', textDecoration: 'underline' }}
                      >
                        {percent}% ({respondedCount}/{totalSuppliers}개사)
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                        [상세보기 & 업체선정]
                      </span>
                    </button>
                    {group.workflowStage === 'QUOTATION_COLLECTION' && (
                      <button
                        type="button"
                        className="btn-sm btn-outline"
                        onClick={() => onCheckQuotations(group.id)}
                        style={{ marginTop: '5px', fontSize: '10px' }}
                      >
                        <LoaderCircle size={11} /> 회신 새로 확인
                      </button>
                    )}
                  </td>

                  {/* 6. 진행상태 (RFQ 진행 중이면 견적 요청상태, 업체 선정 완료면 업체 선정완료) */}
                  <td>
                    {selectedQuotation ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, width: 'fit-content' }}>
                          <CheckCircle2 size={13} /> 업체 선정완료
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {selectedQuotation.supplierName}
                        </span>
                        {group.supplierApprovalStatus === 'pending' && (
                          <button
                            type="button"
                            className="btn-outline"
                            style={{ fontSize: '10px', padding: '2px 6px', marginTop: '2px', width: 'fit-content' }}
                            onClick={() => {
                              setChangingGroup(group);
                              setChangeReason('');
                            }}
                          >
                            선정 변경
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="badge badge-yellow" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                        <Clock size={11} /> 견적 요청상태
                      </span>
                    )}
                  </td>

                  {/* 7. 발주 시작 (업체 선정이 완료된 건만 가능) */}
                  <td>
                    {canStartOrder ? (
                      <button
                        type="button"
                        className="btn-sm btn-primary"
                        onClick={() => handleSendPOClick(group)}
                        style={{ fontSize: '11px', padding: '5px 10px' }}
                        title="선정 결과를 확정하고 PO 관리의 발송 전 최종 승인 단계로 넘깁니다."
                      >
                        <Send size={12} />
                        <span>발주 시작</span>
                      </button>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                        -
                      </span>
                    )}
                  </td>
                  </tr>
                </React.Fragment>
              );
            })}

            {movePlaceholders
              .filter((placeholder) => placeholder.index >= visibleVendorGroups.length)
              .map((placeholder) => (
                <StageMovePlaceholderRow
                  key={placeholder.id}
                  placeholder={placeholder}
                  colSpan={7}
                  onNavigate={onNavigateMovePlaceholder}
                  onDismiss={onDismissMovePlaceholder}
                />
              ))}

            {visibleVendorGroups.length === 0 && movePlaceholders.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  현재 협력사 선정 대기 건이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </SmartTableContainer>

      {/* ========================================================================= */}
      {/* 팝업 모달 1: MR 번호 클릭 시 -> MR 상세 정보 모달 */}
      {/* ========================================================================= */}
      {showMRModal && selectedGroup && (
        <div className="modal-overlay" onClick={() => setShowMRModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '800px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={22} color="var(--primary)" />
                <div>
                  <h3 style={{ margin: 0 }}>MR 상세 내역 ({selectedGroup.mrNo})</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    MR 목록의 모든 요청 사양 및 첨부파일을 확인합니다.
                  </span>
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => setShowMRModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* 기본 요약 카드 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', backgroundColor: 'var(--bg-input)', padding: '16px', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>MR 번호</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary)' }}>
                    {selectedGroup.mrNo}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>품목명 / 아이템코드</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
                    {selectedGroup.itemName} <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>({selectedGroup.itemCode})</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>요청 부서 및 요청자</div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>
                    {selectedGroup.department} {activeMR?.requester ? `· ${activeMR.requester}` : ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>납기요청일</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--danger)' }}>
                    📅 {selectedGroup.targetDueDate} (D-{selectedGroup.deadlineDDay}일)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>요청 수량 / 단가</div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>
                    {selectedGroup.quantity} {selectedGroup.unit} {activeMR ? `(₩${activeMR.unitPrice.toLocaleString()} / EA)` : ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>총 금액</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>
                    {activeMR ? `₩${activeMR.totalPrice.toLocaleString()}` : '-'}
                  </div>
                </div>
              </div>

              {/* 규격 및 상세 사양 */}
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)' }}>
                  규격 및 상세 사양 (Full Spec)
                </h4>
                <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px 16px', fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {activeMR?.fullSpecText || activeMR?.specSummary || '상세 사양 데이터가 존재하지 않습니다.'}
                </div>
              </div>

              {/* 첨부파일 */}
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)' }}>
                  첨부파일 ({activeMR?.attachmentCount || 0}개)
                </h4>
                {activeMR?.attachmentFiles && activeMR.attachmentFiles.length > 0 ? (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {activeMR.attachmentFiles.map((file, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: '12px',
                          color: 'var(--primary)',
                          backgroundColor: 'var(--primary-soft)',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          border: '1px solid rgba(60,60,67,0.1)',
                        }}
                      >
                        <Paperclip size={13} /> {file}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>첨부된 파일이 없습니다.</div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-primary" onClick={() => setShowMRModal(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 팝업 모달 2: RFQ 협력사 클릭 시 -> AI 추천 순위 / 5대 평가표 / 체크박스 / 마감일 설정 */}
      {/* ========================================================================= */}
      {showRfqModal && selectedGroup && (
        <div className="modal-overlay" onClick={() => setShowRfqModal(false)}>
          <div className="modal-content rfq-target-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Building2 size={22} color="var(--accent)" />
                <div>
                  <h3 style={{ margin: 0 }}>AI 추천 RFQ 협력사 및 견적마감일 설정</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    MR 번호: {selectedGroup.mrNo} · 품목: {selectedGroup.itemName}
                  </span>
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => setShowRfqModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSendRfq} className="rfq-target-form">
              <div className="modal-body rfq-target-modal-body">
                {/* AI 추천 안내 */}
                <div
                  style={{
                    backgroundColor: 'var(--primary-soft)',
                    borderLeft: '3px solid var(--accent)',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: 'var(--primary-hover)',
                  }}
                >
                  <Sparkles size={14} style={{ display: 'inline', marginRight: '6px' }} />
                  AI가 <strong>납기, 품질, 가격, 응대, 의사소통</strong> 5개 항목을 5점 만점으로 평가하여 <strong>5점이 많은 순위</strong>대로 랭킹을 산출했습니다. RFQ를 발송할 업체를 체크해 주세요.
                </div>

                <div className="rfq-selection-toolbar">
                  <span>
                    후보 {rfqCandidateRows.length}개사 · <strong>{selectedRfqCandidateCount}개사 선택</strong>
                  </span>
                  <div>
                    <button
                      type="button"
                      className="btn-sm btn-outline"
                      onClick={handleSelectAllRfqSuppliers}
                      disabled={rfqCandidateRows.length === 0}
                    >
                      후보 전체 선택
                    </button>
                    <button
                      type="button"
                      className="btn-sm btn-outline"
                      onClick={handleClearAllRfqSuppliers}
                      disabled={selectedRfqCandidateCount === 0}
                    >
                      전체 해제
                    </button>
                  </div>
                </div>

                {rfqValidationMessage && (
                  <div className="rfq-validation-banner" role="alert">
                    <AlertTriangle size={15} />
                    <span>{rfqValidationMessage}</span>
                  </div>
                )}

                {/* 5대 항목 평가표 (Table) */}
                <div className="table-container rfq-candidate-list">
                  <table className="custom-table rfq-candidate-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>선택</th>
                        <th style={{ width: '60px', textAlign: 'center' }}>순위</th>
                        <th>협력사 정보</th>
                        <th style={{ textAlign: 'center' }}>납기 (5점)</th>
                        <th style={{ textAlign: 'center' }}>품질 (5점)</th>
                        <th style={{ textAlign: 'center' }}>가격 (5점)</th>
                        <th style={{ textAlign: 'center' }}>응대 (5점)</th>
                        <th style={{ textAlign: 'center' }}>의사소통 (5점)</th>
                        <th style={{ textAlign: 'center', width: '90px' }}>5점 개수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rfqCandidateRows
                        .map((q) => {
                          const rank = q.rank;
                          const isChecked = Boolean(rfqSelectedSuppliers[q.supplierId]);
                          const sourceUrl = safeExternalUrl(q.sourceUrl);

                          return (
                            <tr key={q.supplierId} style={{ backgroundColor: isChecked ? 'rgba(60,60,67,0.02)' : 'transparent' }}>
                              {/* 체크박스 */}
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleRfqSupplier(q.supplierId)}
                                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                />
                              </td>
                              {/* 순위 */}
                              <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                {rank ? (
                                  <span className={`rank-badge rank-${rank}`} style={{ display: 'inline-block', width: '22px', height: '22px', lineHeight: '22px', fontSize: '11px' }}>
                                    {rank}
                                  </span>
                                ) : <span className="badge badge-gray">직접</span>}
                              </td>
                              {/* 협력사명·이메일·연락처·출처 */}
                              <td className="rfq-supplier-info-cell">
                                <div className="rfq-supplier-info-name">
                                  <span>
                                    {q.supplierName}
                                    {rank === 1 && (
                                      <span style={{ fontSize: '10px', color: 'var(--accent)', marginLeft: '6px' }}>[AI 1위 최우수]</span>
                                    )}
                                  </span>
                                  {q.isManual && (
                                    <span className="rfq-manual-actions">
                                      <span className="badge badge-gray">사용자 추가</span>
                                      <button
                                        type="button"
                                        className="icon-btn"
                                        onClick={() => handleRemoveManualSupplier(q.supplierId)}
                                        aria-label={`${q.supplierName} 후보에서 제거`}
                                        title="직접 추가 후보 제거"
                                      >
                                        <X size={11} />
                                      </button>
                                    </span>
                                  )}
                                </div>
                                <div className="rfq-email-field">
                                  <input
                                    type="email"
                                    className={`form-input ${rfqEmailErrors[q.supplierId] ? 'is-error' : ''}`}
                                    value={rfqSupplierEmails[q.supplierId] ?? ''}
                                    onChange={(event) => {
                                      setRfqSupplierEmails((previous) => ({
                                        ...previous,
                                        [q.supplierId]: event.target.value,
                                      }));
                                      setRfqEmailErrors((previous) => ({
                                        ...previous,
                                        [q.supplierId]: false,
                                      }));
                                      setRfqValidationMessage(null);
                                    }}
                                    placeholder="이메일 없음 · 직접 입력 가능"
                                    aria-label={`${q.supplierName} 이메일`}
                                    aria-invalid={Boolean(rfqEmailErrors[q.supplierId])}
                                  />
                                  {rfqEmailErrors[q.supplierId] && (
                                    <small>* 이메일을 입력하세요</small>
                                  )}
                                </div>
                                <div className="rfq-supplier-info-meta">
                                  <span>연락처: {q.phone || '없음'}</span>
                                  {sourceUrl ? (
                                    <a href={sourceUrl} target="_blank" rel="noreferrer">
                                      출처 URL <ExternalLink size={11} />
                                    </a>
                                  ) : <span>출처 URL: 없음</span>}
                                  {q.source && <span>출처: {q.source}</span>}
                                </div>
                              </td>
                              {/* 납기 */}
                              <td style={{ textAlign: 'center', color: q.scores?.leadTime === 5 ? 'var(--accent)' : 'var(--text-main)', fontWeight: q.scores?.leadTime === 5 ? 700 : 400 }}>
                                {q.scores ? `⭐ ${q.scores.leadTime}점` : '—'}
                              </td>
                              {/* 품질 */}
                              <td style={{ textAlign: 'center', color: q.scores?.quality === 5 ? 'var(--accent)' : 'var(--text-main)', fontWeight: q.scores?.quality === 5 ? 700 : 400 }}>
                                {q.scores ? `⭐ ${q.scores.quality}점` : '—'}
                              </td>
                              {/* 가격 */}
                              <td style={{ textAlign: 'center', color: q.scores?.price === 5 ? 'var(--accent)' : 'var(--text-main)', fontWeight: q.scores?.price === 5 ? 700 : 400 }}>
                                {q.scores ? `⭐ ${q.scores.price}점` : '—'}
                              </td>
                              {/* 응대 */}
                              <td style={{ textAlign: 'center', color: q.scores?.service === 5 ? 'var(--accent)' : 'var(--text-main)', fontWeight: q.scores?.service === 5 ? 700 : 400 }}>
                                {q.scores ? `⭐ ${q.scores.service}점` : '—'}
                              </td>
                              {/* 의사소통 */}
                              <td style={{ textAlign: 'center', color: q.scores?.communication === 5 ? 'var(--accent)' : 'var(--text-main)', fontWeight: q.scores?.communication === 5 ? 700 : 400 }}>
                                {q.scores ? `⭐ ${q.scores.communication}점` : '—'}
                              </td>
                              {/* 5점 개수 */}
                              <td style={{ textAlign: 'center' }}>
                                {q.count5 === null ? '—' : (
                                  <span className="badge badge-purple" style={{ fontWeight: 700 }}>
                                    {q.count5}개 보유
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      {rfqCandidateRows.length === 0 && (
                        <tr>
                          <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                            AI가 찾은 협력사가 없습니다. 아래에서 RFQ 수신 협력사를 직접 입력해 주세요.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ backgroundColor: 'var(--bg-input)', padding: '16px', borderRadius: '8px', display: 'grid', gap: '10px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>협력사 직접 입력</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(220px, 1.4fr) auto', gap: '8px' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={rfqManualSupplierName}
                      onChange={(event) => setRfqManualSupplierName(event.target.value)}
                      placeholder="협력사명"
                      aria-label="직접 입력 협력사명"
                    />
                    <input
                      type="email"
                      className="form-input"
                      value={rfqManualSupplierEmail}
                      onChange={(event) => setRfqManualSupplierEmail(event.target.value)}
                      placeholder="contact@example.com"
                      aria-label="직접 입력 협력사 이메일"
                    />
                    <button type="button" className="btn-outline" onClick={handleAddManualSupplier}>
                      + 대상 추가
                    </button>
                  </div>
                </div>

                {/* 창 아래쪽: '견적마감일' 선택 (날짜-달력 / 시간) */}
                <div style={{ backgroundColor: 'var(--bg-input)', padding: '16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={14} color="var(--primary)" />
                    견적 마감일시 지정
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '12px' }}>마감 날짜 (달력 선택)</label>
                      <input
                        type="date"
                        className="form-input"
                        value={rfqDeadlineDate}
                        onChange={(e) => setRfqDeadlineDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '12px' }}>마감 시간</label>
                      <input
                        type="time"
                        className="form-input"
                        value={rfqDeadlineTime}
                        onChange={(e) => setRfqDeadlineTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setShowRfqModal(false)}>
                  취소
                </button>
                <button type="submit" className="btn-primary">
                  <Send size={14} />
                  선택한 협력사로 RFQ 발송
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 팝업 모달 3: 견적 회신율(%) 클릭 시 -> 상세사항 확인 및 체크박스 업체 선정 */}
      {/* ========================================================================= */}
      {showQuotationModal && selectedGroup && (
        <div className="modal-overlay" onClick={() => setShowQuotationModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 'min(1500px, 95vw)' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Award size={22} color="var(--primary)" />
                <div>
                  <h3 style={{ margin: 0 }}>공급사 견적 상세 비교 및 최종 업체 선정 ({selectedGroup.mrNo})</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    회신된 견적을 비교하고 체크박스로 선택하여 업체를 최종 선정합니다.
                  </span>
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => setShowQuotationModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* 회신 현황 상세 표 (Table) */}
              <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflowX: 'visible' }}>
                <table className="custom-table" style={{ fontSize: '12px', width: '100%', minWidth: 0, tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '50px', textAlign: 'center' }}>선택</th>
                      <th style={{ width: '150px' }}>협력사명</th>
                      <th style={{ textAlign: 'center', width: '90px' }}>회신 상태</th>
                      <th style={{ textAlign: 'right', width: '110px' }}>견적 단가</th>
                      <th style={{ textAlign: 'right', width: '120px' }}>총 견적금액</th>
                      <th style={{ textAlign: 'center', width: '90px' }}>제시 납기</th>
                      <th style={{ width: '160px' }}>제출 첨부자료</th>
                      <th>회신 요약 및 AI 분석</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...selectedGroup.quotations]
                      .sort((a, b) => {
                        // 회신 여부가 AI 순위보다 우선이다. 미회신 업체에 과거
                        // 후보 순위가 남아 있어도 상세 비교표의 맨 아래로 보낸다.
                        if (a.isResponded !== b.isResponded) return a.isResponded ? -1 : 1;
                        return a.aiRank - b.aiRank;
                      })
                      .map((q) => {
                      const isChecked = selectedSupplierForApproval === q.supplierId;

                      return (
                        <tr key={q.supplierId} style={{ backgroundColor: isChecked ? 'var(--success-bg)' : 'transparent' }}>
                          {/* 라디오/체크박스 */}
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="radio"
                              name="selected_supplier_radio"
                              disabled={!q.isResponded}
                              checked={isChecked}
                              onChange={() => setSelectedSupplierForApproval(q.supplierId)}
                              style={{ width: '16px', height: '16px', cursor: q.isResponded ? 'pointer' : 'not-allowed' }}
                            />
                          </td>
                          {/* 협력사명 */}
                          <td style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                            {q.supplierName}
                            {q.isResponded && q.aiRank === 1 && (
                              <span style={{ fontSize: '10px', color: 'var(--accent)', marginLeft: '6px' }}>[AI 1위 추천]</span>
                            )}
                          </td>
                          {/* 회신 상태 */}
                          <td style={{ textAlign: 'center' }}>
                            {q.isResponded ? (
                              <span className="badge badge-green" style={{ fontSize: '11px' }}>
                                <CheckCircle2 size={11} /> 회신완료
                              </span>
                            ) : (
                              <span className="badge badge-red" style={{ fontSize: '11px' }}>
                                <XCircle size={11} /> 미회신
                              </span>
                            )}
                          </td>
                          {/* 견적 단가 */}
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                            {q.isResponded ? `₩${q.quoteUnitPrice.toLocaleString()}` : '-'}
                          </td>
                          {/* 총 견적금액 */}
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: q.isResponded ? 'var(--primary)' : 'var(--text-dim)' }}>
                            {q.isResponded ? `₩${q.quoteTotalPrice.toLocaleString()}` : '-'}
                          </td>
                          {/* 제시 납기 */}
                          <td style={{ textAlign: 'center' }}>
                            {q.isResponded ? formatExpectedDelivery(q) : '-'}
                          </td>
                          {/* 제출 첨부자료 */}
                          <td>
                            {q.resAttachments.length > 0 ? (
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {q.resAttachments.map((f, i) => (
                                  <span key={i} style={{ fontSize: '11px', color: 'var(--primary)', backgroundColor: 'var(--primary-soft)', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <Paperclip size={10} /> {f}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-dim)' }}>없음</span>
                            )}
                          </td>
                          {/* 회신 요약 및 AI 분석 */}
                          <td style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.4, whiteSpace: 'normal', wordBreak: 'keep-all' }}>
                            {q.resContent}
                            {q.aiReason && (
                              <div style={{ color: 'var(--primary-hover)', marginTop: '4px', fontWeight: 500 }}>
                                💡 {q.aiReason}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-outline" onClick={() => setShowQuotationModal(false)}>
                닫기
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!selectedSupplierForApproval || Boolean(selectingSupplierId)}
                onClick={handleConfirmSupplierSelection}
              >
                {selectingSupplierId ? (
                  <>
                    <LoaderCircle size={14} /> 업체 선정 중...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    선택한 업체로 최종 선정
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 팝업 모달 4: 마감시간 연장 모달 */}
      {/* ========================================================================= */}
      {extendingGroup && (
        <div className="modal-overlay" onClick={() => setExtendingGroup(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '500px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Calendar size={22} color="var(--warning)" />
                <div>
                  <h3 style={{ margin: 0 }}>견적 제출 마감시간 연장</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {extendingGroup.mrNo} · {extendingGroup.itemName}
                  </span>
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => setExtendingGroup(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmExtension}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                  style={{
                    backgroundColor: 'var(--warning-bg)',
                    borderLeft: '2px solid var(--warning)',
                    padding: '12px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: 'var(--warning)',
                    lineHeight: '1.5',
                  }}
                >
                  <Calendar size={14} style={{ display: 'inline', marginRight: '6px' }} />
                  마감시간만 변경합니다. <strong>미회신 협력사 독촉 메일은 재발송하지 않습니다.</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={13} color="var(--primary)" />
                      연장할 마감 날짜
                    </label>
                    <input
                      type="date"
                      className="form-input"
                      value={extDate}
                      onChange={(e) => setExtDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={13} color="var(--primary)" />
                      연장할 마감 시간
                    </label>
                    <input
                      type="time"
                      className="form-input"
                      value={extTime}
                      onChange={(e) => setExtTime(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setExtendingGroup(null)}>
                  취소
                </button>
                <button type="submit" className="btn-warning">
                  <Calendar size={14} />
                  마감시간 연장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 팝업 모달 5: 선정 변경 철회 모달 */}
      {/* ========================================================================= */}
      {changingGroup && (
        <div className="modal-overlay" onClick={() => setChangingGroup(null)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()} style={{ width: '520px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={22} color="var(--warning)" />
                <div>
                  <h3 style={{ margin: 0 }}>협력사 선정 변경</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {changingGroup.mrNo} · 기존 PR을 철회한 뒤 새 업체를 선정합니다.
                  </span>
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => setChangingGroup(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmSelectionChange}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-main)', backgroundColor: 'var(--warning-bg)', padding: '12px', borderRadius: '6px' }}>
                  현재 선정 업체 <strong>
                    {changingGroup.quotations.find((q) => q.supplierId === changingGroup.selectedSupplierId)?.supplierName}
                  </strong>의 {changingGroup.prNo} 요청을 철회합니다.
                </div>
                <div className="form-group">
                  <label htmlFor="vendor-change-reason">선정 변경 사유</label>
                  <textarea
                    id="vendor-change-reason"
                    className="form-input"
                    rows={4}
                    value={changeReason}
                    onChange={(event) => setChangeReason(event.target.value)}
                    placeholder="납기 대응 불가, 조건 변경 등 철회 사유를 입력하세요."
                    autoFocus
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setChangingGroup(null)}>
                  취소
                </button>
                <button type="submit" className="btn-warning" disabled={!changeReason.trim()}>
                  기존 요청 철회 후 재선정
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 작업 모달을 닫은 뒤 표시하는 독립 결과 모달 */}
      {resultModal && (
        <div className="modal-overlay" onClick={() => setResultModal(null)}>
          <div
            className="modal-content"
            onClick={(event) => event.stopPropagation()}
            style={{ width: 'min(440px, calc(100vw - 32px))' }}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {resultModal.tone === 'success'
                  ? <CheckCircle2 size={22} color="var(--success)" />
                  : <AlertTriangle size={22} color="var(--warning)" />}
                <h3 style={{ margin: 0 }}>{resultModal.title}</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setResultModal(null)} aria-label="결과 닫기">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ lineHeight: 1.65, color: 'var(--text-muted)' }}>
              {resultModal.message}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-primary" onClick={() => setResultModal(null)}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
