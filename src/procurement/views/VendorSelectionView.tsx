import React, { useEffect, useMemo, useState } from 'react';
import type {
  VendorSelectionGroup,
  MaterialRequest,
  RfqRoundSnapshot,
  RfqRoundQuotation,
  SupplierQuotation,
  QuotationAiEvaluation,
  POScorecardScores,
  SupplierRecommendation,
  StageMovePlaceholder,
} from '../types';
import { fetchQuotationDeadlineHistory, type QuotationDeadlineChange } from '../api/cases';
import { SmartTableContainer } from '../components/SmartTableContainer';
import { StageMovePlaceholderRow } from '../components/StageMovePlaceholderRow';
import { ExcelColumnHeader } from '../components/ExcelColumnHeader';
import { RowActionMenu, type RowActionMenuItem } from '../components/RowActionMenu';
import {
  matchesTableRange,
  normalizeTableFilterValue,
  useSessionStoredState,
  useSessionTableState,
  type TableColumnRangeFilter,
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

type VendorColumnKey = 'mr' | 'roundDeadline' | 'response' | 'status' | 'detail' | 'action' | 'more';

// v2 컬럼 정리 - 예전엔 납기요청일/RFQ협력사/차수/마감시간이 각각 컬럼
// 하나씩 차지하고 '다음 행동'엔 버튼이 최대 3개까지 쌓여 있었다(구매팀
// 피드백: 컬럼도 너무 많고 행동 버튼도 한 행에 여러 개라 뭘 먼저 봐야
// 할지 안 보임). 납기요청일/RFQ협력사 개수 같은 부가정보는 '상세'
// 패널(RFQ 상세 요약)로 옮기고, 차수+마감시간은 '차수·마감' 한 컬럼으로
// 합쳤다. 그리고 그 행에서 지금 당장 할 일 하나(또는 진짜 갈림길이 있는
// 행만 둘)만 '주 액션'에 남기고, 나머지 부가 액션(마감연장·회신 새로
// 확인·선정 변경 등)은 '⋯' 메뉴로 모았다 - 버튼 자체를 없앤 게 아니라
// 위치만 정리한 것, 조건/핸들러는 전부 그대로다.
const VENDOR_COLUMNS: readonly TableColumnDefinition<VendorColumnKey>[] = [
  { key: 'mr', label: 'MR / 품목', defaultWidth: 260, minWidth: 190 },
  { key: 'roundDeadline', label: '차수 · 마감', defaultWidth: 165, minWidth: 140, filterMode: 'date-range' },
  { key: 'response', label: '견적 회신율 (%)', defaultWidth: 185, minWidth: 145, align: 'center' },
  { key: 'status', label: '진행상태', defaultWidth: 175, minWidth: 135 },
  // 와이어프레임의 '상세보기 패널' 아이디어 - MR번호/차수/회신율 클릭으로
  // 나뉘어 있던 기존 상세 정보(기본정보/RFQ 협력사 현황/마감정보/차수이력)를
  // 한 화면에서 요약해서 보여주는 통합 패널을 여는 버튼. 기존 3개 모달은
  // 그대로 남겨두고(각자 실제 조작 기능이 있어서 제거하지 않음), 빠르게
  // 훑어보기용 요약 + 각 상세 모달로 바로가기를 추가한 것.
  { key: 'detail', label: '상세', defaultWidth: 90, minWidth: 70, align: 'center', filterMode: 'none' },
  { key: 'action', label: '주 액션', defaultWidth: 220, minWidth: 170, filterMode: 'none' },
  { key: 'more', label: '', defaultWidth: 52, minWidth: 52, align: 'center', filterMode: 'none' },
] as const;

type VendorRangeFilters = Partial<Record<VendorColumnKey, TableColumnRangeFilter>>;

// 재비딩으로 지난 라운드 견적도 group.quotations에 함께 들어있을 수 있어,
// "이번 RFQ 건 회신율"을 구할 때는 그 중 지금 진행 중인 라운드에 해당하는
// 행(또는 아직 견적을 안 낸 후보라 rfqName이 없는 행)만 세야 한다. 지난
// 라운드 행(rfqName이 지금 라운드와 다름)을 섞으면 이미 다 끝난 옛날
// 회신율이 이번 라운드 것처럼 보인다.
const isCurrentRoundQuotation = (group: VendorSelectionGroup, quotation: SupplierQuotation): boolean => (
  !quotation.rfqName || !group.rfqName || quotation.rfqName === group.rfqName
);

const currentRoundQuotations = (group: VendorSelectionGroup): SupplierQuotation[] => (
  group.quotations.filter((quotation) => isCurrentRoundQuotation(group, quotation))
);

const responsePercent = (group: VendorSelectionGroup): number => {
  const current = currentRoundQuotations(group);
  const responded = current.filter((quotation) => quotation.isResponded).length;
  return current.length > 0 ? Math.round((responded / current.length) * 100) : 0;
};

// "차수"는 재비딩으로 이미 마감된 지난 RFQ 라운드의 개수다 - 첫 RFQ를
// 보내고 아직 한 번도 재비딩하지 않았으면 0차, 한 번 재비딩하면(지난
// RFQ 1건이 마감 처리됨) 1차, 두 번이면 2차인 식이다. 지금 한창 진행
// 중인(아직 마감 안 된) RFQ는 여기 포함하지 않는다 - 그 정보는 이미
// '견적 회신율' 쪽에서 보여주고 있다.
const closedRoundCount = (group: VendorSelectionGroup): number => group.rfqRounds?.length ?? 0;


// 이력 표기는 '2026-09-26 18시'까지만 - 분/초까지 붙으면 타임라인에서
// 숫자만 길어지고 한눈에 안 들어온다는 피드백.
const formatStampToHour = (value?: string | null): string => {
  if (!value) return '-';
  // ⚠️ 백엔드가 남긴 일부 타임스탬프(차수 종료시각 등)는 시간대 표기가
  // 없는 UTC 문자열이다. new Date()는 그런 문자열을 '로컬(KST) 시각'으로
  // 해석해서 9시간 어긋나 보였다(12:50 종료가 03:50으로 표시). 시간대
  // 표기가 없으면 UTC로 간주하고 붙여준다.
  const raw = String(value).trim();
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
  const normalized = hasZone || !raw.includes('T') ? raw : `${raw}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    // 'YYYY-MM-DD HH:mm' 같은 문자열이 그대로 오는 경우도 있어 앞부분만 쓴다.
    const text = String(value).replace('T', ' ');
    const [datePart, timePart] = text.split(' ');
    if (!timePart) return datePart;
    return `${datePart} ${timePart.slice(0, 2)}시`;
  }
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${String(parsed.getHours()).padStart(2, '0')}시`;
};

const vendorFilterValue = (group: VendorSelectionGroup, key: VendorColumnKey): string | number => {
  const selected = group.quotations.find((quotation) => quotation.supplierId === group.selectedSupplierId);
  switch (key) {
    case 'mr': return `${group.mrNo} · ${group.itemName}`;
    // 차수 + 마감시간을 한 컬럼으로 합쳤다(둘 다 '지금 몇 차수, 언제까지'라는
    // 같은 맥락의 정보라 따로 컬럼을 나눌 필요가 없었음 - 나머지 정보인
    // 납기요청일/RFQ협력사 수는 '상세' 패널로 옮겼다).
    case 'roundDeadline': return `${closedRoundCount(group)}차 · ${!group.rfqSent ? 'RFQ 발송 전' : selected ? '마감 완료' : `${group.deadlineDate} ${group.deadlineTime}`}`;
    case 'response': return responsePercent(group) >= 50 ? '50% 이상' : '50% 미만';
    case 'status': return selected ? '업체 선정완료' : '견적 요청상태';
    case 'detail': return '';
    case 'action': return selected && (!group.workflowStage || group.workflowStage === 'ORDER_START') ? '발주 가능' : '대기';
    case 'more': return '';
  }
};

const vendorRangeValue = (group: VendorSelectionGroup, key: VendorColumnKey): string | number => {
  switch (key) {
    case 'roundDeadline': return group.rfqSent ? group.deadlineDate : '';
    default: return vendorFilterValue(group, key);
  }
};

const vendorSortValue = (group: VendorSelectionGroup, key: VendorColumnKey): string | number => {
  if (key === 'response') return responsePercent(group);
  return vendorFilterValue(group, key);
};

interface VendorSelectionViewProps {
  vendorGroups: VendorSelectionGroup[];
  /** '완료' 탭에 보여줄 건들 - 발주 시작을 눌러 PO 관리로 넘어간 케이스.
   * 진행중 목록(vendorGroups)은 백엔드 stage가 ORDER_START까지인 건만
   * 담고 있어서, 선정이 끝난 건은 이 목록으로 따로 받는다. */
  completedGroups?: VendorSelectionGroup[];
  movePlaceholders?: StageMovePlaceholder[];
  onDismissMovePlaceholder?: (id: string) => void;
  onNavigateMovePlaceholder?: (placeholder: StageMovePlaceholder) => void;
  requests?: MaterialRequest[];
  onSelectSupplier: (groupId: string, supplierId: string, quotationId?: string) => Promise<boolean> | boolean;
  onSendPO: (groupId: string) => void;
  onWithdrawSupplierSelection: (groupId: string, reason: string) => void;
  /** 견적 마감이 지났는데 아직 업체를 선정하지 않은 상태에서 'MR 취소'를 선택했을 때. */
  onCancelMR: (groupId: string, reason: string) => Promise<boolean> | boolean;
  /** 같은 상태에서 '재비딩'을 선택했을 때 - 지금까지 들어온 견적은 버리고
   * 새 마감일로 RFQ를 다시 보낼 수 있도록 RFQ 대상 선택 단계로 되돌린다. */
  onRebidQuotations: (groupId: string) => Promise<boolean> | boolean;
  onOpenSpecModalByItemCode: (itemCode: string) => void;
  onExtendDeadline: (groupId: string, newDate: string, newTime: string) => Promise<boolean> | boolean;
  onSendRFQ: (
    groupId: string,
    supplierIds: string[],
    supplierEmails: Record<string, string>,
    deadlineDate: string,
    deadlineTime: string,
  ) => Promise<boolean> | boolean;
  onCheckQuotations: (groupId: string) => Promise<boolean> | boolean;
  onDownloadAttachment?: (attachment: MaterialRequest['attachmentFiles'][number]) => void;
  /** '협력사 직접 입력' 자동완성 드롭다운 - 이름/이메일 각 입력란에서 기존
   * supplier 풀을 필드별로 검색한다(field='name'이면 이름만, 'email'이면
   * 이메일만 대조된 결과). 안 넘기면 드롭다운 없이 지금처럼 순수 텍스트
   * 입력으로 동작한다. */
  onSearchSuppliers?: (query: string, field: 'name' | 'email') => Promise<ManualSupplierSuggestion[]>;
  onLoadSupplierEvaluations?: (names: string[]) => Promise<Record<string, SupplierRecommendation>>;
  /** 차수(라운드) 팝업에서 특정 RFQ 1건에 실제로 제출된 견적을 다시
   * 조회한다. 재비딩해도 지난 RFQ를 취소하지 않고 그대로 두기 때문에
   * 언제든 조회 가능하다. */
  onFetchRfqRoundQuotations?: (caseId: string, rfqName: string) => Promise<RfqRoundSnapshot>;
}

export interface ManualSupplierSuggestion {
  name: string;
  supplierName: string;
  email: string | null;
  phone: string | null;
  recommendation?: SupplierRecommendation | null;
}

interface RfqCandidateRow extends Omit<SupplierQuotation, 'scores'> {
  scores: POScorecardScores | null;
  averageScore: number | null;
  rank: number | null;
  isManual: boolean;
}

interface RfqDraftCache {
  version: 1;
  selectedSuppliers: Record<string, boolean>;
  supplierEmails: Record<string, string>;
  manualSuppliers: string[];
  manualSupplierName: string;
  manualSupplierEmail: string;
  deadlineDate: string;
  deadlineTime: string;
}

const RFQ_DRAFT_CACHE_PREFIX = 'biddingflow.rfq-draft.';

const rfqDraftCacheKey = (mrNo: string): string => (
  `${RFQ_DRAFT_CACHE_PREFIX}${encodeURIComponent(mrNo)}`
);

const stringRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
};

const booleanRecord = (value: unknown): Record<string, boolean> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
  );
};

const readRfqDraftCache = (mrNo: string): RfqDraftCache | null => {
  try {
    const raw = window.sessionStorage.getItem(rfqDraftCacheKey(mrNo));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RfqDraftCache>;
    if (parsed.version !== 1) return null;
    return {
      version: 1,
      selectedSuppliers: booleanRecord(parsed.selectedSuppliers),
      supplierEmails: stringRecord(parsed.supplierEmails),
      manualSuppliers: Array.isArray(parsed.manualSuppliers)
        ? parsed.manualSuppliers.filter((name): name is string => typeof name === 'string')
        : [],
      manualSupplierName: typeof parsed.manualSupplierName === 'string' ? parsed.manualSupplierName : '',
      manualSupplierEmail: typeof parsed.manualSupplierEmail === 'string' ? parsed.manualSupplierEmail : '',
      deadlineDate: typeof parsed.deadlineDate === 'string' ? parsed.deadlineDate : '',
      deadlineTime: typeof parsed.deadlineTime === 'string' ? parsed.deadlineTime : '',
    };
  } catch {
    return null;
  }
};

const removeRfqDraftCache = (mrNo: string): void => {
  try {
    window.sessionStorage.removeItem(rfqDraftCacheKey(mrNo));
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
};

const hasQuotationAiEvaluation = (quotation: SupplierQuotation): boolean => (
  quotation.aiEvaluated ?? Boolean(quotation.aiReason.trim())
);

const formatExpectedDelivery = (quotation: SupplierQuotation): string => {
  if (quotation.expectedDeliveryDate) {
    const date = new Date(`${quotation.expectedDeliveryDate.slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? quotation.expectedDeliveryDate
      : date.toLocaleDateString('ko-KR');
  }
  return quotation.leadTimeDays > 0 ? `${quotation.leadTimeDays}일 소요` : '미기재';
};

// 'YYYY-MM-DD' 날짜 문자열을 오늘 기준 D-day 텍스트로 바꾼다. 이미 지난
// 날짜는 음수 대신 '지남'으로 보여준다(예: 'D-3일' / '오늘 마감' / '지남').
const formatDDayLabel = (dateStr: string): string => {
  const due = new Date(`${dateStr}T23:59:59`);
  if (Number.isNaN(due.getTime())) return '';
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  if (days > 0) return `D-${days}일`;
  if (days === 0) return '오늘 마감';
  return `${Math.abs(days)}일 지남`;
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
  completedGroups = [],
  movePlaceholders = [],
  onDismissMovePlaceholder = () => undefined,
  onNavigateMovePlaceholder = () => undefined,
  requests = [],
  onSelectSupplier,
  onSendPO,
  onWithdrawSupplierSelection,
  onCancelMR,
  onRebidQuotations,
  onExtendDeadline,
  onSendRFQ,
  onCheckQuotations,
  onDownloadAttachment,
  onSearchSuppliers,
  onLoadSupplierEvaluations,
  onFetchRfqRoundQuotations,
}) => {
  // 모달 상태
  const [selectedGroup, setSelectedGroup] = useState<VendorSelectionGroup | null>(null);

  // RFQ 미발송 + 납기요청일 초과 건을 '확인 후 MR 취소'할 때 버튼 로딩 표시용.
  const [isCancellingOverdue, setIsCancellingOverdue] = useState<string | null>(null);
  // 오늘 날짜(YYYY-MM-DD) - targetDueDate와 사전식 비교로 납기 초과 여부를 판단.
  // 로컬(KST) 기준 오늘 - toISOString()은 UTC라서 오전 9시 이전엔 어제
  // 날짜가 나오고, 그 값으로 납기초과(isPastTargetDueDate)를 판정하면
  // 초과 판정이 하루 늦게 뜬다.
  const todayIso = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  const handleConfirmOverdueCancel = async (group: VendorSelectionGroup) => {
    const confirmed = window.confirm(
      `${group.mrNo} 건: 납기요청일(${group.targetDueDate})이 지났고 RFQ도 보내지 않았습니다. 이 MR을 취소할까요?`,
    );
    if (!confirmed) return;
    setIsCancellingOverdue(group.id);
    try {
      await onCancelMR(
        group.id,
        `납기요청일(${group.targetDueDate}) 초과 및 RFQ 미발송으로 자동 취소`,
      );
    } finally {
      setIsCancellingOverdue((current) => (current === group.id ? null : current));
    }
  };

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
  const [manualEvaluations, setManualEvaluations] = useState<Record<string, SupplierRecommendation>>({});
  const [manualEvaluationError, setManualEvaluationError] = useState(false);
  const [rfqManualSupplierName, setRfqManualSupplierName] = useState('');
  const [rfqManualSupplierEmail, setRfqManualSupplierEmail] = useState('');
  const [manualSupplierSuggestions, setManualSupplierSuggestions] = useState<ManualSupplierSuggestion[]>([]);
  const [isSearchingSuppliers, setIsSearchingSuppliers] = useState(false);
  const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);
  const [emailSupplierSuggestions, setEmailSupplierSuggestions] = useState<ManualSupplierSuggestion[]>([]);
  const [isSearchingSupplierEmails, setIsSearchingSupplierEmails] = useState(false);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
  const [rfqEmailErrors, setRfqEmailErrors] = useState<Record<string, boolean>>({});
  const [rfqValidationMessage, setRfqValidationMessage] = useState<string | null>(null);

  // 3. 견적 회신율 퍼센트 클릭 시 회신 상세 & 업체 선정 모달
  const [showQuotationModal, setShowQuotationModal] = useState<boolean>(false);
  // 와이어프레임 '상세보기 패널' 요약 모달 - MR번호/차수/회신율 각각에
  // 흩어져 있던 정보를 한 곳에서 훑어보기용으로 요약. 실제 조작(선정 변경,
  // RFQ 설정 등)은 기존 모달들이 그대로 담당하므로 이 상태는 읽기전용이다.
  const [detailGroup, setDetailGroup] = useState<VendorSelectionGroup | null>(null);
  // 상세 패널의 '연장 이력' - 케이스 목록에 매번 조인을 걸지 않으려고
  // 패널을 열 때만 따로 불러온다(차수별 견적 조회와 같은 방식).
  const [deadlineHistory, setDeadlineHistory] = useState<QuotationDeadlineChange[] | 'loading' | 'error'>('loading');
  const [selectedSupplierForApproval, setSelectedSupplierForApproval] = useState<string | null>(null);
  // 같은 공급사가 재비딩으로 여러 차수에 걸쳐 견적을 냈을 수 있어
  // supplierId만으로는 어떤 견적을 고른 건지 특정할 수 없다 - 행별로
  // 고유한 key(quotationId, 없으면 supplierId+차수)로 정확히 어느
  // 견적인지 기억해둔다.
  const [selectedQuotationKey, setSelectedQuotationKey] = useState<string | null>(null);
  const [isAnalyzingQuotations, setIsAnalyzingQuotations] = useState(false);

  // 4. 마감시간 연장 모달
  const [extendingGroup, setExtendingGroup] = useState<VendorSelectionGroup | null>(null);
  const [extDate, setExtDate] = useState<string>('2025-01-25');
  const [extTime, setExtTime] = useState<string>('18:00');
  const [extValidationMessage, setExtValidationMessage] = useState<string | null>(null);

  // 5. 선정 철회/변경 모달
  const [changingGroup, setChangingGroup] = useState<VendorSelectionGroup | null>(null);
  const [changeReason, setChangeReason] = useState('');

  // 6. 마감 지남 + 미선정 상태에서 'MR 취소' 모달 (재비딩은 확인창 하나로 바로 실행)
  const [cancellingGroup, setCancellingGroup] = useState<VendorSelectionGroup | null>(null);
  const [cancelMrReason, setCancelMrReason] = useState('');

  // 7. 차수(라운드) 배지 클릭 시 지난/현재 라운드별 견적 조회 팝업.
  // 재비딩해도 ERPNext의 RFQ/Supplier Quotation을 취소하지 않고 그대로
  // 두기 때문에, rfqName만 있으면 언제든 그 라운드의 견적을 다시 조회할
  // 수 있다 - roundSnapshotCache는 이미 불러온 라운드를 rfqName 기준으로
  // 캐싱해서 탭을 왔다갔다 해도 매번 다시 안 부르게 한다.
  const [roundsGroup, setRoundsGroup] = useState<VendorSelectionGroup | null>(null);
  const [activeRoundIndex, setActiveRoundIndex] = useState<number>(0);
  const [roundSnapshotCache, setRoundSnapshotCache] = useState<
    Record<string, RfqRoundSnapshot | 'loading' | 'error'>
  >({});

  // "차수"는 재비딩으로 이미 마감된 지난 라운드만 센다(오래된 순) - 지금
  // 한창 진행 중인 RFQ는 아직 "차수"에 포함되지 않고, 그 정보는 이미
  // '견적 회신율' 쪽에서 따로 보여주고 있어서 이 팝업에는 넣지 않는다.
  const roundsForGroup = (group: VendorSelectionGroup): Array<{ round: number; rfqName: string; deadline?: string }> => (
    (group.rfqRounds ?? []).map((entry) => ({
      round: entry.round,
      rfqName: entry.rfqName,
      deadline: entry.deadline,
    }))
  );

  const handleOpenRoundsModal = (group: VendorSelectionGroup) => {
    const list = roundsForGroup(group);
    if (list.length === 0) return;
    setRoundsGroup(group);
    setActiveRoundIndex(list.length - 1);
  };

  useEffect(() => {
    if (!roundsGroup || !onFetchRfqRoundQuotations) return;
    const list = roundsForGroup(roundsGroup);
    const target = list[activeRoundIndex];
    if (!target || !roundsGroup.backendCaseId) return;
    if (roundSnapshotCache[target.rfqName]) return;
    setRoundSnapshotCache((prev) => ({ ...prev, [target.rfqName]: 'loading' }));
    let cancelled = false;
    onFetchRfqRoundQuotations(roundsGroup.backendCaseId, target.rfqName)
      .then((snapshot) => {
        if (cancelled) return;
        setRoundSnapshotCache((prev) => ({ ...prev, [target.rfqName]: snapshot }));
      })
      .catch(() => {
        if (cancelled) return;
        setRoundSnapshotCache((prev) => ({ ...prev, [target.rfqName]: 'error' }));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundsGroup, activeRoundIndex, onFetchRfqRoundQuotations]);
  const [isRebidding, setIsRebidding] = useState<string | null>(null);
  const [selectingSupplierId, setSelectingSupplierId] = useState<string | null>(null);
  const [resultModal, setResultModal] = useState<{
    title: string;
    message: string;
    tone: 'success' | 'warning';
  } | null>(null);
  const tableState = useSessionTableState('vendor-selection', VENDOR_COLUMNS);
  const [rangeFilters, setRangeFilters] = useSessionStoredState<VendorRangeFilters>(
    'biddingflow.table.vendor-selection.ranges',
    {},
  );
  const [sortColumn, setSortColumn] = useState<VendorColumnKey>('roundDeadline');
  const [activeTab, setActiveTab] = useState<'progress' | 'completed'>('progress');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (!showRfqModal || !selectedGroup) return;
    const draft: RfqDraftCache = {
      version: 1,
      selectedSuppliers: rfqSelectedSuppliers,
      supplierEmails: rfqSupplierEmails,
      manualSuppliers: rfqManualSuppliers,
      manualSupplierName: rfqManualSupplierName,
      manualSupplierEmail: rfqManualSupplierEmail,
      deadlineDate: rfqDeadlineDate,
      deadlineTime: rfqDeadlineTime,
    };
    try {
      window.sessionStorage.setItem(rfqDraftCacheKey(selectedGroup.mrNo), JSON.stringify(draft));
    } catch {
      // Keep the modal usable even when browser storage is disabled or full.
    }
  }, [
    rfqDeadlineDate,
    rfqDeadlineTime,
    rfqManualSupplierEmail,
    rfqManualSupplierName,
    rfqManualSuppliers,
    rfqSelectedSuppliers,
    rfqSupplierEmails,
    selectedGroup,
    showRfqModal,
  ]);

  useEffect(() => {
    if (!selectedGroup) return;
    const refreshedGroup = vendorGroups.find((group) => group.id === selectedGroup.id);
    if (refreshedGroup && refreshedGroup !== selectedGroup) {
      setSelectedGroup(refreshedGroup);
    }
  }, [selectedGroup, vendorGroups]);

  // '협력사 직접 입력' 이름란에 타이핑하면 기존 supplier 풀에서 디바운스
  // 검색해 드롭다운 후보를 채운다. Tavily 등으로 못 찾은 협력사를 수동
  // 등록할 때, 이미 등록된 협력사가 있으면 그걸 먼저 골라 쓸 수 있게 하는
  // 용도라 - 후보가 없으면 그냥 지금처럼 신규 등록으로 진행하면 된다.
  useEffect(() => {
    if (!onSearchSuppliers) return;
    const query = rfqManualSupplierName.trim();
    if (query.length < 1) {
      setManualSupplierSuggestions([]);
      setIsSearchingSuppliers(false);
      return;
    }
    let cancelled = false;
    setIsSearchingSuppliers(true);
    const timer = window.setTimeout(() => {
      onSearchSuppliers(query, 'name')
        .then((results) => {
          if (cancelled) return;
          setManualSupplierSuggestions(results);
        })
        .catch(() => {
          if (!cancelled) setManualSupplierSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setIsSearchingSuppliers(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rfqManualSupplierName, onSearchSuppliers]);

  // '협력사 직접 입력' 이메일란도 이름란과 똑같은 방식으로, 다만 이메일
  // 필드만 대조한 결과를 별도로 디바운스 검색해 이메일란 전용 드롭다운에
  // 채운다 - 이름란 드롭다운과 결과가 섞이면 안 된다.
  useEffect(() => {
    if (!onSearchSuppliers) return;
    const query = rfqManualSupplierEmail.trim();
    if (query.length < 1) {
      setEmailSupplierSuggestions([]);
      setIsSearchingSupplierEmails(false);
      return;
    }
    let cancelled = false;
    setIsSearchingSupplierEmails(true);
    const timer = window.setTimeout(() => {
      onSearchSuppliers(query, 'email')
        .then((results) => {
          if (cancelled) return;
          setEmailSupplierSuggestions(results);
        })
        .catch(() => {
          if (!cancelled) setEmailSupplierSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setIsSearchingSupplierEmails(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rfqManualSupplierEmail, onSearchSuppliers]);

  useEffect(() => {
    if (!showRfqModal || !onLoadSupplierEvaluations || !rfqManualSuppliers.length) return;
    let cancelled = false;
    setManualEvaluationError(false);
    onLoadSupplierEvaluations(rfqManualSuppliers).then((evaluations) => {
      if (!cancelled) setManualEvaluations(evaluations);
    }).catch(() => {
      if (!cancelled) setManualEvaluationError(true);
    });
    return () => { cancelled = true; };
  }, [rfqManualSuppliers, showRfqModal, onLoadSupplierEvaluations]);

  const handlePickSupplierSuggestion = (suggestion: ManualSupplierSuggestion) => {
    setRfqManualSupplierName(suggestion.name);
    if (suggestion.recommendation) {
      setManualEvaluations((previous) => ({ ...previous, [suggestion.name]: suggestion.recommendation! }));
    }
    setRfqManualSupplierEmail(suggestion.email || '');
    setShowSupplierSuggestions(false);
    setShowEmailSuggestions(false);
  };

  // 표에 실제로 들어갈 원본 목록 - 탭에 따라 진행중/완료 목록을 바꿔 끼운다.
  const sourceGroups = activeTab === 'completed' ? completedGroups : vendorGroups;

  const vendorFilterOptions = useMemo(() => Object.fromEntries(VENDOR_COLUMNS.map((column) => [
    column.key,
    sourceGroups.map((group) => String(vendorFilterValue(group, column.key))),
  ])) as Record<VendorColumnKey, string[]>, [sourceGroups]);

  const visibleVendorGroups = useMemo(() => sourceGroups
    .filter((group) => VENDOR_COLUMNS.every((column) => {
      if (column.filterMode === 'number-range' || column.filterMode === 'date-range') {
        return matchesTableRange(
          vendorRangeValue(group, column.key),
          rangeFilters[column.key],
          column.filterMode,
        );
      }
      if (column.filterMode === 'none') return true;
      const selected = tableState.filters[column.key];
      return selected === undefined
        || selected.includes(normalizeTableFilterValue(vendorFilterValue(group, column.key)));
    }))
    .sort((left, right) => {
      const leftValue = vendorSortValue(left, sortColumn);
      const rightValue = vendorSortValue(right, sortColumn);
      const compared = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'ko-KR', { numeric: true });
      return sortDirection === 'asc' ? compared : -compared;
    }), [rangeFilters, sortColumn, sortDirection, tableState.filters, sourceGroups]);

  // 진행중 / 완료 탭 - PO 관리 페이지와 같은 방식. 발주까지 넘어간 건을
  // 목록에서 분리해서, 아직 구매팀이 손볼 게 남은 건만 기본으로 보인다.
  const progressCount = vendorGroups.length;
  const completedCount = completedGroups.length;
  // 필터/정렬은 이미 sourceGroups(=활성 탭 목록) 기준으로 적용돼 있다.
  const tabFilteredGroups = visibleVendorGroups;
  // 완료 탭 요약 - 끝난 건들 중 AI 추천 1순위를 그대로 선정한 비율.
  // (aiRank는 견적 랭킹 결과라 이미 내려오는 값이고, 새로 계산하는 건 없다.)
  const completedAiFollow = useMemo(() => {
    const decided = completedGroups
      .map((group) => group.quotations.find((quotation) => quotation.supplierId === group.selectedSupplierId))
      .filter((quotation): quotation is SupplierQuotation => Boolean(quotation));
    return {
      total: decided.length,
      followed: decided.filter((quotation) => quotation.aiRank === 1).length,
    };
  }, [completedGroups]);

  const rfqCandidateRows = useMemo<RfqCandidateRow[]>(() => {
    if (!selectedGroup) return [];
    const ranked = [...selectedGroup.quotations]
      .map((quotation) => {
        const scores = quotation.scores ?? null;
        return { quotation, scores, averageScore: quotation.recommendationScore ?? null };
      })
      .sort((left, right) => (right.averageScore ?? -1) - (left.averageScore ?? -1))
      .map(({ quotation, scores, averageScore }, _index, sorted) => ({
        ...quotation,
        scores,
        averageScore,
        rank: averageScore == null ? null : sorted.findIndex((row) => row.averageScore === averageScore) + 1,
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
      scores: manualEvaluations[name]?.scores ?? null,
      averageScore: manualEvaluations[name]?.average_score ?? null,
      evaluationCount: manualEvaluations[name]?.evaluation_count,
      rank: null,
      isManual: true,
    } satisfies RfqCandidateRow));
    const combined = [...ranked, ...manual].sort((left, right) => (right.averageScore ?? -1) - (left.averageScore ?? -1));
    return combined.map((row) => ({ ...row, rank: row.averageScore == null ? null : combined.findIndex((candidate) => candidate.averageScore === row.averageScore) + 1 }));
  }, [rfqManualSuppliers, rfqSupplierEmails, selectedGroup, manualEvaluations]);

  // 이 MR(선택된 그룹) 안에서 과거 라운드에 수주 접수를 거절한 협력사 -
  // id와 name 둘 다로 대조한다(직접 입력한 협력사는 RFQ 후보 쪽에서
  // 원본 이름 문자열을 그대로 supplierId로 쓰기 때문).
  const rejectedSupplierKeys = useMemo<Set<string>>(() => {
    const entries = selectedGroup?.selectionHistory ?? [];
    const keys = new Set<string>();
    entries
      .filter((entry) => entry.status === 'rejected')
      .forEach((entry) => {
        if (entry.supplierId) keys.add(entry.supplierId);
        if (entry.supplierName) keys.add(entry.supplierName);
      });
    return keys;
  }, [selectedGroup]);

  const isRejectedSupplier = (candidate: RfqCandidateRow): boolean => (
    rejectedSupplierKeys.has(candidate.supplierId) || rejectedSupplierKeys.has(candidate.supplierName)
  );

  // ⚠️ '거절됨'은 정보 표시용 배지일 뿐, 선택 자체를 막지는 않는다(재비딩
  // 때는 과거에 거절했던 협력사에게도 RFQ를 다시 보낼 수 있어야 함).
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
    const cachedDraft = readRfqDraftCache(group.mrNo);
    const manualSuppliers = [...new Set(cachedDraft?.manualSuppliers ?? [])];
    const validSupplierIds = new Set([
      ...group.quotations.map((quotation) => quotation.supplierId),
      ...manualSuppliers,
    ]);
    const defaultSupplierEmails = Object.fromEntries(
      group.quotations.map((quotation) => [quotation.supplierId, quotation.email ?? ''])
    );

    setRfqDeadlineDate(cachedDraft?.deadlineDate || group.deadlineDate || '2025-01-22');
    setRfqDeadlineTime(cachedDraft?.deadlineTime || group.deadlineTime || '18:00');

    // 사람의 최종 확인 없이 RFQ 대상이 암묵적으로 선택되지 않도록 기본은 전체 해제합니다.
    setRfqSelectedSuppliers(Object.fromEntries(
      Object.entries(cachedDraft?.selectedSuppliers ?? {})
        .filter(([supplierId]) => validSupplierIds.has(supplierId)),
    ));
    setRfqSupplierEmails({
      ...defaultSupplierEmails,
      ...Object.fromEntries(
        Object.entries(cachedDraft?.supplierEmails ?? {})
          .filter(([supplierId]) => validSupplierIds.has(supplierId)),
      ),
    });
    setRfqManualSuppliers(manualSuppliers);
    setRfqManualSupplierName(cachedDraft?.manualSupplierName ?? '');
    setRfqManualSupplierEmail(cachedDraft?.manualSupplierEmail ?? '');
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

    // 마감일이 요청부서가 원한 납기요청일보다 늦으면 안 됨 - 달력의
    // max 속성으로 대부분 막히지만, 직접 타이핑 등으로 우회될 수 있어
    // 제출 시점에 한 번 더 확인한다.
    if (rfqDeadlineDate && rfqDeadlineDate > selectedGroup.targetDueDate) {
      setRfqValidationMessage(
        `견적 마감일은 납기요청일(${selectedGroup.targetDueDate})보다 늦을 수 없습니다.`,
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
    removeRfqDraftCache(selectedGroup.mrNo);
    setShowRfqModal(false);
    setResultModal({
      title: 'RFQ 발송을 시작했습니다',
      message: `[${selectedGroup.mrNo}] 선택한 ${checkedCount}개 협력사 · 견적 마감 ${rfqDeadlineDate} ${rfqDeadlineTime}`,
      tone: 'success',
    });
  };

  // 재비딩으로 같은 공급사가 여러 차수 견적을 낼 수 있어, 상세 비교표
  // 행의 key/선택 상태는 supplierId가 아니라 견적 1건 단위로 잡는다.
  const quotationRowKey = (q: SupplierQuotation): string => (
    q.quotationId ?? `${q.supplierId}-${q.rfqRound ?? 0}`
  );

  // 협력사가 견적서에 제시한 유효기간이 지났는지 확인한다. validTill이
  // 없는 견적(레거시 데이터 등)은 만료 여부를 판단할 근거가 없으므로
  // 만료로 취급하지 않는다.
  const isQuotationExpired = (q: SupplierQuotation): boolean => {
    if (!q.validTill) return false;
    const todayStr = new Date().toISOString().slice(0, 10);
    return q.validTill < todayStr;
  };

  // 3. 견적 회신율(%) 클릭 처리 (상세사항 확인 & 체크박스 업체 선정)
  const handleOpenQuotationModal = (group: VendorSelectionGroup) => {
    setSelectedGroup(group);
    // AI 1위도 자동 선택하지 않는다. 순위는 추천이며 최종 선택은 사람의
    // 명시적인 라디오 선택으로만 결정한다.
    setSelectedSupplierForApproval(group.selectedSupplierId || null);
    const preselected = group.quotations.find((q) => q.supplierId === group.selectedSupplierId);
    setSelectedQuotationKey(preselected ? quotationRowKey(preselected) : null);
    setShowQuotationModal(true);
  };

  // '회신 새로 확인 · 남은 견적 분석' - 견적은 도착할 때마다 백엔드가
  // 규격 평가를 미리 걸어두지만(웹훅 -> 캐시), RunPod 호출이 실패했거나
  // 아직 안 돌아간 견적이 남아 있을 수 있어 사람이 한 번에 몰아서
  // 처리할 수 있는 경로를 남겨둔다. 이미 평가된 견적은 캐시 히트로
  // 다시 계산하지 않는다.
  const handleCheckQuotations = async (group: VendorSelectionGroup) => {
    if (isAnalyzingQuotations) return;
    setIsAnalyzingQuotations(true);
    try {
      await onCheckQuotations(group.id);
    } finally {
      setIsAnalyzingQuotations(false);
    }
  };

  const handleConfirmSupplierSelection = async () => {
    if (!selectedGroup || !selectedSupplierForApproval || selectingSupplierId) return;
    const selectedQuotation = selectedQuotationKey
      ? allSelectableQuotations.find((quotation) => quotationRowKey(quotation) === selectedQuotationKey)
      : allSelectableQuotations.find((quotation) => quotation.supplierId === selectedSupplierForApproval);
    if (!selectedQuotation?.isResponded) {
      setResultModal({
        title: '회신된 견적을 선택해주세요',
        message: '미회신 협력사는 최종 업체로 선정할 수 없습니다.',
        tone: 'warning',
      });
      return;
    }
    if (isQuotationExpired(selectedQuotation)) {
      setResultModal({
        title: '만료된 견적서입니다',
        message: `이 견적의 유효기간(${selectedQuotation.validTill})이 지났습니다. 다른 견적을 선택하거나 재비딩해 주세요.`,
        tone: 'warning',
      });
      return;
    }

    const groupId = selectedGroup.id;
    const supplierId = selectedSupplierForApproval;
    const quotationId = selectedQuotation.quotationId;

    setSelectingSupplierId(supplierId);

    await new Promise((resolve) => window.setTimeout(resolve, 350));
    const selected = await onSelectSupplier(groupId, supplierId, quotationId);
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

  // 상세 패널이 열릴 때마다 그 케이스의 마감일 연장 이력을 불러온다.
  useEffect(() => {
    if (!detailGroup) return undefined;
    const caseId = detailGroup.backendCaseId;
    if (!caseId) {
      // 목업 데이터에는 백엔드 케이스가 없다 - isExtended 플래그로만 표시.
      setDeadlineHistory([]);
      return undefined;
    }
    let cancelled = false;
    setDeadlineHistory('loading');
    fetchQuotationDeadlineHistory(caseId)
      .then((items) => { if (!cancelled) setDeadlineHistory(items); })
      .catch(() => { if (!cancelled) setDeadlineHistory('error'); });
    return () => { cancelled = true; };
  }, [detailGroup]);

  // 4. 마감시간 연장 처리
  const handleOpenExtendModal = (group: VendorSelectionGroup) => {
    setExtendingGroup(group);
    // 백엔드는 '새 마감일 > 기존 마감일' 이고 '지금 이후'일 때만 연장을
    // 받아준다. 기존 마감일을 그대로 채워두면(특히 이미 지난 마감일)
    // 사용자가 날짜를 안 건드리고 확정을 눌러 409로 거절당하므로,
    // 기본값을 '기존 마감일 다음날'(단 납기요청일 이내)로 제안한다.
    const currentDeadline = group.deadlineDate || todayIso;
    const base = new Date(`${currentDeadline}T00:00:00`);
    const suggestion = new Date(Math.max(base.getTime(), new Date(`${todayIso}T00:00:00`).getTime()));
    suggestion.setDate(suggestion.getDate() + 1);
    const suggested = `${suggestion.getFullYear()}-${String(suggestion.getMonth() + 1).padStart(2, '0')}-${String(suggestion.getDate()).padStart(2, '0')}`;
    setExtDate(suggested > group.targetDueDate ? group.targetDueDate : suggested);
    setExtTime(group.deadlineTime || '18:00');
    setExtValidationMessage(null);
  };

  const handleConfirmExtension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendingGroup) return;
    // 연장한 마감일도 RFQ 최초 발송 때와 마찬가지로 납기요청일보다
    // 늦어질 수 없다 - 달력 max 속성으로 대부분 막히지만 제출 시점에
    // 한 번 더 확인한다.
    if (extDate > extendingGroup.targetDueDate) {
      setExtValidationMessage(
        `견적 마감일은 납기요청일(${extendingGroup.targetDueDate})보다 늦을 수 없습니다.`,
      );
      return;
    }
    setExtValidationMessage(null);
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

  // 6. 마감 지남 + 미선정 상태 - 'MR 취소' 처리
  const handleConfirmCancelMR = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cancellingGroup || !cancelMrReason.trim()) return;
    const ok = await onCancelMR(cancellingGroup.id, cancelMrReason.trim());
    if (ok) {
      setCancellingGroup(null);
      setCancelMrReason('');
    }
  };

  // 마감 전(적극 수집 중)이든 마감 지남 + 미선정 상태든 공통으로 쓰는
  // '재비딩' 처리. 지금까지 받은 견적은 버리지 않고 rfq_rounds 이력으로
  // 남긴 채, 새 마감일의 RFQ를 추가로 보내는 새 차수로 넘어간다 - 최종
  // 선정 때는 이전 차수 견적도 후보 풀에 그대로 남아있다.
  const handleRebid = async (group: VendorSelectionGroup) => {
    const unrespondedCount = group.quotations.filter((quotation) => !quotation.isResponded).length;
    const baseMessage = `${group.mrNo} 건: 지금까지 들어온 견적은 그대로 후보로 유지하고, 새 마감일로 RFQ를 추가로 보냅니다.`;
    const confirmMessage = unrespondedCount > 0
      ? `${baseMessage}\n\n아직 ${unrespondedCount}개 협력사가 견적을 회신하지 않았습니다. 아직 다 견적을 받지 못했는데, 정말 재비딩하시겠어요?`
      : `${baseMessage} 계속할까요?`;
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;
    setIsRebidding(group.id);
    try {
      const rebid = await onRebidQuotations(group.id);
      // 재비딩이 성공하면 이 MR은 곧바로 "RFQ 대상 선택" 단계로 넘어가서
      // rfq_name/선택 협력사 목록이 리셋된다 - 지금 열려있는 "최종 업체
      // 선정" 모달은 그 이전 라운드 스냅샷 기준으로 그려진 것이라 그대로
      // 두면 옛 데이터가 뒤섞여 보인다. 성공 시 모달을 닫아서, 새로고침된
      // 목록에서 "RFQ 대상 선택" 버튼으로 다음 단계를 이어가게 한다.
      if (rebid) {
        setShowQuotationModal(false);
      }
    } finally {
      setIsRebidding((current) => (current === group.id ? null : current));
    }
  };

  // 8. 최종선정 모달("상세보기/업체선정")은 가장 최근 RFQ(이번 라운드)
  // 견적을 기본으로 보여주되, 지난 라운드들의 SQ도 추가로 보여줘야 한다
  // ("차수별로 받은 sq도 추가적으로 보여주는거야"). 이번 라운드 견적은
  // group.quotations로 이미 내려오지만, 지난 라운드는 이미 있는
  // "차수별 견적 조회" 전용 엔드포인트(onFetchRfqRoundQuotations)로 직접
  // 다시 불러온다 - AI 분석 여부와 무관하게 항상 정확하기 때문이다.
  // roundSnapshotCache는 "차수별 견적 조회" 팝업과 공유해서 중복 요청을
  // 피한다.
  useEffect(() => {
    if (!showQuotationModal || !selectedGroup || !onFetchRfqRoundQuotations || !selectedGroup.backendCaseId) return;
    const caseId = selectedGroup.backendCaseId;
    const rounds = selectedGroup.rfqRounds ?? [];
    let cancelled = false;
    rounds.forEach((round) => {
      if (roundSnapshotCache[round.rfqName]) return;
      setRoundSnapshotCache((prev) => (prev[round.rfqName] ? prev : { ...prev, [round.rfqName]: 'loading' }));
      onFetchRfqRoundQuotations(caseId, round.rfqName)
        .then((snapshot) => {
          if (cancelled) return;
          setRoundSnapshotCache((prev) => ({ ...prev, [round.rfqName]: snapshot }));
        })
        .catch(() => {
          if (cancelled) return;
          setRoundSnapshotCache((prev) => ({ ...prev, [round.rfqName]: 'error' }));
        });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQuotationModal, selectedGroup, onFetchRfqRoundQuotations]);

  // quotation_ranking(라운드 무관 전체)에서 quotationId로 AI 평가 결과를
  // 찾기 위한 조회용 Map. 지난 라운드 견적도 "AI 분석"을 실행하면
  // evaluate_quotations_for_rfqs가 모든 라운드를 합쳐 평가하므로, 이미
  // 평가된 지난 라운드 견적은 여기서 매칭되어 선택 가능해진다.
  const aiEvaluationByQuotationId = useMemo(() => {
    const map = new Map<string, QuotationAiEvaluation>();
    (selectedGroup?.quotationAiEvaluations ?? []).forEach((evalRow) => {
      if (evalRow.quotationId) map.set(evalRow.quotationId, evalRow);
    });
    return map;
  }, [selectedGroup?.quotationAiEvaluations]);

  // 차수 팝업과 같은 RfqRoundQuotation 모양을, 상세 비교표가 쓰는
  // SupplierQuotation 모양으로 바꾼다. AI 평가가 이미 있으면 붙이고,
  // 없으면 "AI 미평가"로 남겨 선택을 막는다(백엔드가 quotation_ranking에
  // 없는 견적은 최종선정에서 거부하기 때문).
  const toHistoricalSupplierQuotation = (
    q: RfqRoundQuotation,
    round: { round: number; rfqName: string },
    itemCode: string | undefined,
  ): SupplierQuotation => {
    const matchedItem = q.items.find((item) => !itemCode || item.itemCode === itemCode) ?? q.items[0];
    const aiEval = aiEvaluationByQuotationId.get(q.name);
    return {
      quotationId: q.name,
      rfqName: round.rfqName,
      rfqRound: round.round,
      validTill: q.validTill,
      supplierId: q.supplier,
      supplierName: q.supplier,
      quoteUnitPrice: matchedItem?.rate ?? 0,
      quoteTotalPrice: matchedItem?.amount ?? q.grandTotal ?? 0,
      leadTimeDays: matchedItem?.leadTimeDays ?? 0,
      expectedDeliveryDate: matchedItem?.expectedDeliveryDate,
      isResponded: true,
      resContent: aiEval?.aiReason || '지난 라운드에 제출된 견적입니다.',
      resAttachments: [],
      aiRank: aiEval?.aiRank ?? 0,
      aiScore: aiEval?.aiScore ?? 0,
      aiReason: aiEval?.aiReason ?? '',
      numericScore: aiEval?.numericScore,
      specificationScore: aiEval?.specificationScore,
      overallScore: aiEval?.overallScore,
      evaluationSource: aiEval?.evaluationSource,
      aiEvaluated: Boolean(aiEval),
      specMatch: aiEval?.specMatch,
      fulfillsQuantity: aiEval?.fulfillsQuantity,
      aiIssues: aiEval?.aiIssues,
      isSelected: false,
    };
  };

  // 이번 라운드(selectedGroup.quotations)와 겹치지 않는, 지난 라운드들의
  // SQ 목록. rfqRounds에 있는 라운드 수만큼 roundSnapshotCache에서 꺼내 합친다.
  const historicalQuotations = useMemo((): SupplierQuotation[] => {
    if (!selectedGroup) return [];
    const currentIds = new Set(
      selectedGroup.quotations.map((q) => q.quotationId).filter((id): id is string => Boolean(id)),
    );
    const out: SupplierQuotation[] = [];
    (selectedGroup.rfqRounds ?? []).forEach((round) => {
      const snapshot = roundSnapshotCache[round.rfqName];
      if (!snapshot || snapshot === 'loading' || snapshot === 'error') return;
      snapshot.quotations.forEach((q) => {
        if (currentIds.has(q.name)) return;
        out.push(toHistoricalSupplierQuotation(q, round, selectedGroup.itemCode));
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup, roundSnapshotCache, aiEvaluationByQuotationId]);

  // 상세 비교표/최종선정에서 실제로 고를 수 있는 전체 목록(이번 라운드 +
  // 지난 라운드). 라디오 선택, 선택 확정 검증 모두 이 목록 기준으로 찾는다.
  const allSelectableQuotations = useMemo((): SupplierQuotation[] => (
    selectedGroup ? [...selectedGroup.quotations, ...historicalQuotations] : []
  ), [selectedGroup, historicalQuotations]);

  const selectedApprovalQuotation = selectedQuotationKey
    ? allSelectableQuotations.find((quotation) => quotationRowKey(quotation) === selectedQuotationKey)
    : allSelectableQuotations.find((quotation) => quotation.supplierId === selectedSupplierForApproval);
  const selectedApprovalHasAiEvaluation = selectedApprovalQuotation
    ? hasQuotationAiEvaluation(selectedApprovalQuotation)
    : false;
  const selectedApprovalExpired = selectedApprovalQuotation
    ? isQuotationExpired(selectedApprovalQuotation)
    : false;
  const quotationAnalysisRunning = selectedGroup?.workflowStatus === 'RUNNING';

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
          <strong>RFQ 발송·협력사 선정 관리 (표 형식)</strong>: 각 행에서 지금 해야 할 일은{' '}
          <strong>주 액션</strong> 한 곳에 모았고, 마감 연장·회신 새로 확인·선정 변경 같은 부가 액션은{' '}
          <strong>⋯</strong> 메뉴에 있습니다. <strong>상세</strong>를 누르면 AI 추천 근거·협력사 회신 현황·차수 이력을 한 번에 볼 수 있습니다.
        </span>
      </div>

      {/* 진행중 / 완료 탭 - 발주 시작까지 끝난 건은 완료 탭으로 분리 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('progress')}
            style={{
              padding: '10px 18px',
              fontSize: '14px',
              fontWeight: 700,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: activeTab === 'progress' ? 'var(--primary)' : 'var(--text-dim)',
              borderBottom: activeTab === 'progress' ? '2px solid var(--primary)' : '2px solid transparent',
            }}
          >
            진행중 &nbsp;{progressCount}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            style={{
              padding: '10px 18px',
              fontSize: '14px',
              fontWeight: 700,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: activeTab === 'completed' ? 'var(--primary)' : 'var(--text-dim)',
              borderBottom: activeTab === 'completed' ? '2px solid var(--primary)' : '2px solid transparent',
            }}
          >
            완료 &nbsp;{completedCount}
          </button>
        </div>
        {activeTab === 'completed' && completedAiFollow.total > 0 && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', paddingBottom: '10px' }}>
            완료 {completedAiFollow.total}건 중{' '}
            <strong style={{ color: 'var(--primary-hover)' }}>
              {Math.round((completedAiFollow.followed / completedAiFollow.total) * 100)}%
            </strong>
            {' '}({completedAiFollow.followed}건)는 AI 추천 1순위를 그대로 선정
          </div>
        )}
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
                  selectedValues={column.filterMode ? undefined : tableState.filters[column.key]}
                  onFilterChange={(selected) => tableState.setFilter(column.key, selected)}
                  filterMode={column.filterMode}
                  rangeValue={rangeFilters[column.key]}
                  onRangeFilterChange={(range) => setRangeFilters((current) => {
                    const next = { ...current };
                    if (range) next[column.key] = range;
                    else delete next[column.key];
                    return next;
                  })}
                  onResizeStart={(event) => tableState.beginResize(column.key, event)}
                  activeSort={sortColumn === column.key ? sortDirection : undefined}
                  onSort={(direction) => { setSortColumn(column.key); setSortDirection(direction); }}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {tabFilteredGroups.map((group, rowIndex) => {
              // 이번 라운드 회신율이므로 지난 라운드 견적 행은 분모/분자에서 뺀다.
              const currentRound = currentRoundQuotations(group);
              const respondedCount = currentRound.filter((q) => q.isResponded).length;
              const cachedManualSuppliers = selectedGroup?.mrNo === group.mrNo
                ? rfqManualSuppliers
                : readRfqDraftCache(group.mrNo)?.manualSuppliers ?? [];
              const existingSupplierNames = new Set(
                currentRound.map((quotation) => quotation.supplierName.trim()),
              );
              const manualSupplierCount = new Set(
                cachedManualSuppliers
                  .map((name) => name.trim())
                  .filter((name) => name && !existingSupplierNames.has(name)),
              ).size;
              const totalSuppliers = currentRound.length + manualSupplierCount;
              const percent = totalSuppliers > 0 ? Math.round((respondedCount / totalSuppliers) * 100) : 0;
              const selectedQuotation = group.quotations.find((q) => q.supplierId === group.selectedSupplierId);
              const hasSelection = Boolean(group.selectedSupplierId);
              const rfqActive = Boolean(group.rfqSent);
              // RFQ를 아직 안 보낸 상태에서 요청부서가 원한 납기요청일까지
              // 지나버리면 더 이상 의미가 없는 건이므로 자동취소 대상으로
              // 안내한다(오늘 날짜 문자열과 그냥 비교 - targetDueDate가
              // 'YYYY-MM-DD' 형식이라 사전식 비교로 충분함).
              const isPastTargetDueDate = group.targetDueDate < todayIso;
              const isOverdueUnsentRfq = !rfqActive && isPastTargetDueDate;
              // 납기요청일이 이미 지난 건은 RFQ를 새로 보내는 것 자체가
              // 의미가 없으므로(제때 납품이 불가능) 대상 선택 버튼을 막는다.
              const canConfigureRFQ = (
                !group.workflowStage || group.workflowStage === 'RFQ_TARGET_SELECTION'
              ) && !isPastTargetDueDate;
              const canReviewQuotations = !group.workflowStage
                || ['QUOTATION_COLLECTION', 'SUPPLIER_SELECTION'].includes(group.workflowStage);
              const canStartOrder = hasSelection && (
                !group.workflowStage || group.workflowStage === 'ORDER_START'
              );

              // v2 '주 액션 + ⋯' 패턴 - 아래 overflowItems는 예전에 이
              // 컬럼 저 컬럼에 독립적으로 흩어져 있던 버튼들을 그대로
              // 옮겨온 것뿐이다(조건도 원래 조건 그대로). '주 액션'은
              // 그 중에서 지금 이 행에서 가장 먼저 해야 할 일(또는 진짜
              // 갈림길이 있으면 둘)만 고르는 것 - 나머지는 전부 ⋯로.
              const overflowItems: RowActionMenuItem[] = [];
              if (hasSelection && group.supplierApprovalStatus === 'pending') {
                overflowItems.push({
                  key: 'change-selection',
                  label: '선정 변경',
                  onClick: () => { setChangingGroup(group); setChangeReason(''); },
                });
              }
              // ⚠️ 예전엔 deadlineDDay > 0(마감 전)일 때만 연장 버튼을 보여줘서,
              // 마감이 이미 지난 건은 연장할 방법이 화면에 아예 없었다. 백엔드
              // (workflow_service.extend_quotation_deadline)는 stage가 견적
              // 수집/선정이고 새 마감일이 '지금 이후 + 기존 마감일보다 늦음'이면
              // 마감이 지난 뒤에도 연장을 허용하므로, 조건을 백엔드와 맞춘다.
              const canExtendDeadline = !hasSelection && (
                !group.workflowStage
                || ['QUOTATION_COLLECTION', 'SUPPLIER_SELECTION'].includes(group.workflowStage)
              );
              if (canExtendDeadline) {
                overflowItems.push({
                  key: 'extend-deadline',
                  label: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={13} /> 마감 연장{group.deadlineDDay <= 0 ? ' (마감 지남)' : ''}
                    </span>
                  ),
                  onClick: () => handleOpenExtendModal(group),
                  disabled: !rfqActive,
                });
              }
              // 재비딩은 마감 후 '주 액션'으로도 뜨지만, 마감 전에도 필요할
              // 수 있어(예: 대상 협력사를 다시 구성하고 싶을 때) ⋯에도 둔다.
              // 조건/핸들러는 기존 재비딩 버튼과 같다.
              if (!hasSelection && group.workflowStage === 'QUOTATION_COLLECTION') {
                overflowItems.push({
                  key: 'rebid',
                  label: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Send size={13} /> 재비딩 (차수 추가)
                    </span>
                  ),
                  onClick: () => { void handleRebid(group); },
                  disabled: isRebidding === group.id,
                });
              }
              if (group.workflowStage === 'QUOTATION_COLLECTION') {
                overflowItems.push({
                  key: 'check-quotations',
                  label: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <LoaderCircle size={13} /> 회신 새로 확인 · 남은 견적 분석
                    </span>
                  ),
                  onClick: () => { void handleCheckQuotations(group); },
                });
              }

              return (
                <React.Fragment key={group.id}>
                  {(activeTab === 'progress' ? movePlaceholders : [])
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

                  {/* 2. 차수 · 마감 - 예전엔 '차수'와 '마감시간 (마감연장)'이
                      각각 컬럼 하나씩이었는데, '지금 몇 차수인지 / 언제까지
                      받는지'는 같은 맥락이라 한 셀로 합쳤다. 차수 배지 클릭 =
                      지난 라운드별 견적 보기(원래 동작 그대로), 마감 연장
                      버튼은 '⋯' 메뉴로 옮겼다. 납기요청일 · 요청부서 ·
                      RFQ 협력사 수는 '상세' 패널(RFQ 상세 요약)로 옮겼다. */}
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                      {(() => {
                        const rounds = closedRoundCount(group);
                        return (
                          <button
                            type="button"
                            className="badge badge-purple"
                            disabled={rounds === 0}
                            onClick={() => handleOpenRoundsModal(group)}
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              border: 'none',
                              cursor: rounds === 0 ? 'not-allowed' : 'pointer',
                              opacity: rounds === 0 ? 0.4 : 1,
                            }}
                            title={rounds === 0
                              ? '아직 재비딩한 적이 없어 지난 차수 기록이 없습니다.'
                              : `재비딩으로 마감된 지난 라운드가 ${rounds}건 있습니다. 클릭하면 차수별로 받았던 견적을 볼 수 있습니다.`}
                          >
                            {rounds}차
                          </button>
                        );
                      })()}
                      <div
                        style={{ opacity: rfqActive ? 1 : 0.4 }}
                        title={rfqActive ? undefined : 'RFQ 발송 후 이용할 수 있습니다.'}
                      >
                        {hasSelection ? (
                          <span className="badge badge-gray" style={{ fontSize: '11px' }}>
                            <CheckCircle2 size={11} /> 마감 완료
                          </span>
                        ) : group.deadlineDDay <= 0 ? (
                          <div style={{ fontSize: '12px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span>{rfqActive ? `${group.deadlineDate} ${group.deadlineTime}` : 'RFQ 발송 전'}</span>
                            {rfqActive && (
                              <span className="badge badge-red" style={{ fontSize: '11px', fontWeight: 600, width: 'fit-content' }}>
                                마감 지남
                              </span>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: '12px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span>{rfqActive ? `${group.deadlineDate} ${group.deadlineTime}` : 'RFQ 발송 전'}</span>
                            {rfqActive && (
                              <span style={{ fontSize: '11px', color: 'var(--warning)', fontWeight: 600 }}>
                                (D-{group.deadlineDDay}일 마감){group.isExtended ? ' · 연장됨' : ''}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 5. 견적 회신율(%) - 클릭 시 상세사항 확인 및 업체 선정.
                      '회신 새로 확인' 버튼은 '다음 행동' 컬럼으로 옮겼다. */}
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
                      <div style={{ width: '84px', height: '5px', borderRadius: '3px', backgroundColor: 'var(--border-color)', overflow: 'hidden', marginTop: '4px' }}>
                        <div
                          style={{
                            width: `${percent}%`,
                            height: '100%',
                            backgroundColor: percent === 100 ? 'var(--success)' : percent > 0 ? 'var(--primary)' : 'var(--warning)',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                        [상세보기 & 업체선정]
                      </span>
                    </button>
                  </td>

                  {/* 6. 진행상태 - 배지/공급사명만. '선정 변경' 버튼은
                      '다음 행동' 컬럼으로 옮겼다. */}
                  <td>
                    {selectedQuotation ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, width: 'fit-content' }}>
                          <CheckCircle2 size={13} /> 업체 선정완료
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {selectedQuotation.supplierName}
                        </span>
                      </div>
                    ) : isOverdueUnsentRfq ? (
                      <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', width: 'fit-content' }}>
                        <AlertTriangle size={11} /> 납기 초과 · RFQ 미발송
                      </span>
                    ) : !rfqActive ? (
                      <span className="badge badge-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                        <Clock size={11} /> RFQ 미발송
                      </span>
                    ) : (
                      <span className="badge badge-yellow" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                        <Clock size={11} /> 견적 요청상태
                      </span>
                    )}
                  </td>

                  {/* 6.5. 상세 - MR번호/차수/회신율 클릭으로 나뉘어 있던 정보를
                      한 화면에서 요약해서 보여주는 통합 패널. 와이어프레임의
                      '상세보기' 버튼에 대응한다. */}
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={() => setDetailGroup(group)}
                      style={{ fontSize: '11px', padding: '5px 10px' }}
                      title="기본정보·RFQ 협력사 현황·마감정보·차수이력 요약 보기"
                    >
                      <FileText size={12} />
                      <span>상세</span>
                    </button>
                  </td>

                  {/* 6. 주 액션 - 예전 '다음 행동' 컬럼. 조건과 핸들러는 전부
                      그대로 두고, 이 행에서 지금 당장 해야 할 일 하나만
                      남긴다. 단 마감 후 '이대로 선정 진행 vs 재비딩'처럼
                      실제로 갈림길인 상태는 둘 다 보여준다(하나로 줄이면
                      바이어가 다른 선택지를 아예 모르게 됨). 마감연장 ·
                      회신 새로 확인 · 선정 변경 같은 부가 액션은 옆
                      '⋯' 메뉴(overflowItems)로 옮겼다. */}
                  <td>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {activeTab === 'completed' ? (
                        // 완료 탭 - 더 누를 버튼이 없는 대신, 이 건이 AI 추천
                        // 1순위를 그대로 따른 건지 담당자가 직접 바꾼 건지를
                        // 보여준다(선정 근거는 회신율 클릭 → 비교 모달).
                        selectedQuotation ? (
                          selectedQuotation.aiRank === 1 ? (
                            <span className="badge badge-blue" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Sparkles size={11} /> AI 추천 그대로
                            </span>
                          ) : (
                            <span className="badge badge-gray" style={{ fontSize: '11px' }}>
                              담당자 직접 선정{selectedQuotation.aiRank > 0 ? ` (AI ${selectedQuotation.aiRank}순위)` : ''}
                            </span>
                          )
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>—</span>
                        )
                      ) : isOverdueUnsentRfq ? (
                        <button
                          type="button"
                          className="btn-sm btn-reject"
                          disabled={isCancellingOverdue === group.id}
                          onClick={() => handleConfirmOverdueCancel(group)}
                          style={{ fontSize: '11px', padding: '5px 10px' }}
                          title={`납기요청일(${group.targetDueDate})이 지났고 RFQ도 보내지 않아 자동 취소 대상입니다. 확인을 누르면 이 MR을 취소합니다.`}
                        >
                          {isCancellingOverdue === group.id ? '취소 처리 중...' : '확인 · MR 취소'}
                        </button>
                      ) : !rfqActive ? (
                        <button
                          type="button"
                          className="btn-sm btn-primary"
                          disabled={!canConfigureRFQ}
                          onClick={() => handleOpenRfqModal(group)}
                          style={{
                            fontSize: '11px',
                            padding: '5px 10px',
                            opacity: canConfigureRFQ ? 1 : 0.55,
                            cursor: canConfigureRFQ ? 'pointer' : 'not-allowed',
                          }}
                          title={canConfigureRFQ
                            ? 'AI 추천 협력사 순위, 이메일 확인 및 RFQ 발송'
                            : '협력사 추천이 끝나고 RFQ 대상 선택 단계가 되면 활성화됩니다.'}
                        >
                          <Building2 size={13} />
                          <span>RFQ 협력사 구성 · 발송 ({totalSuppliers}개사)</span>
                        </button>
                      ) : canStartOrder ? (
                        <button
                          type="button"
                          className="btn-sm btn-approve"
                          onClick={() => handleSendPOClick(group)}
                          style={{ fontSize: '11px', padding: '5px 10px' }}
                          title="선정 결과를 확정하고 PO 관리의 발송 전 최종 승인 단계로 넘깁니다."
                        >
                          <Send size={12} />
                          <span>발주 시작</span>
                        </button>
                      ) : (!hasSelection && group.deadlineDDay <= 0 && group.workflowStage === 'QUOTATION_COLLECTION') ? (
                        isPastTargetDueDate ? (
                          // 납기요청일까지 이미 지나버리면 더 손쓸 도리가 없는
                          // 건이므로 재비딩/이대로 선정 진행 같은 선택지는 다
                          // 없애고 MR 취소만 남긴다.
                          <button
                            type="button"
                            className="btn-sm btn-reject"
                            disabled={isCancellingOverdue === group.id}
                            onClick={() => handleConfirmOverdueCancel(group)}
                            style={{ fontSize: '11px', padding: '5px 10px' }}
                            title={`납기요청일(${group.targetDueDate})이 지나 더 이상 진행할 수 없습니다. 확인을 누르면 이 MR을 취소합니다.`}
                          >
                            {isCancellingOverdue === group.id ? '취소 처리 중...' : '확인 · MR 취소'}
                          </button>
                        ) : (
                          <>
                            {respondedCount === 0 ? (
                              <button
                                type="button"
                                className="btn-sm btn-reject"
                                onClick={() => { setCancellingGroup(group); setCancelMrReason(''); }}
                                style={{ fontSize: '11px', padding: '5px 10px' }}
                                title="제출된 견적이 없어 이 MR을 취소합니다."
                              >
                                MR 취소
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn-sm btn-primary"
                                onClick={() => handleOpenQuotationModal(group)}
                                style={{ fontSize: '11px', padding: '5px 10px' }}
                                title="지금까지 들어온 견적으로 업체 선정을 진행합니다."
                              >
                                이대로 선정 진행
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-sm btn-outline"
                              disabled={isRebidding === group.id}
                              onClick={() => handleRebid(group)}
                              style={{ fontSize: '11px', padding: '5px 10px' }}
                              title="지금까지 들어온 견적은 유지한 채 새 마감일로 RFQ를 추가로 보냅니다."
                            >
                              {isRebidding === group.id ? '처리 중...' : '재비딩'}
                            </button>
                          </>
                        )
                      ) : (hasSelection && group.supplierApprovalStatus === 'pending') ? (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          협력사 승인 대기중
                        </span>
                      ) : (!hasSelection && group.deadlineDDay > 0) ? (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          마감 전 · 회신 대기중
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>—</span>
                      )}
                    </div>
                  </td>

                  {/* 7. ⋯ 더보기 - 그 행 상태에 해당하는 부가 액션만 담긴다.
                      담길 게 없으면 버튼 자체가 안 보인다(RowActionMenu). */}
                  <td style={{ textAlign: 'center' }}>
                    <RowActionMenu items={overflowItems} ariaLabel={`${group.mrNo} 부가 액션`} />
                  </td>
                  </tr>
                </React.Fragment>
              );
            })}

            {(activeTab === 'progress' ? movePlaceholders : [])
              .filter((placeholder) => placeholder.index >= tabFilteredGroups.length)
              .map((placeholder) => (
                <StageMovePlaceholderRow
                  key={placeholder.id}
                  placeholder={placeholder}
                  colSpan={7}
                  onNavigate={onNavigateMovePlaceholder}
                  onDismiss={onDismissMovePlaceholder}
                />
              ))}

            {tabFilteredGroups.length === 0 && (activeTab === 'completed' || movePlaceholders.length === 0) && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  {activeTab === 'completed'
                    ? '아직 발주 시작까지 넘어간 건이 없습니다.'
                    : '현재 협력사 선정 대기 건이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </SmartTableContainer>

      {/* ========================================================================= */}
      {/* 팝업 모달 1: MR 번호 클릭 시 -> MR 상세 정보 모달 */}
      {/* ========================================================================= */}
      {/* 차수(라운드) 클릭 시 - 재비딩으로 지금까지 보낸 RFQ 라운드별로
          실제 받았던 견적(단가/납기일 등)을 다시 볼 수 있는 팝업.
          여러 차수가 있으면 탭/화살표로 옆 라운드로 넘어간다. */}
      {roundsGroup && (() => {
        const list = roundsForGroup(roundsGroup);
        if (list.length === 0) return null;
        const clampedIndex = Math.min(activeRoundIndex, list.length - 1);
        const active = list[clampedIndex];
        const snapshot = roundSnapshotCache[active.rfqName];
        return (
          <div className="modal-overlay" onClick={() => setRoundsGroup(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '720px' }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileText size={20} color="var(--primary)" />
                  <div>
                    <h3 style={{ margin: 0 }}>차수별 견적 조회 ({roundsGroup.mrNo})</h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      재비딩해도 지난 RFQ는 지우지 않으므로 차수별로 받았던 견적을 다시 볼 수 있습니다.
                    </span>
                  </div>
                </div>
                <button type="button" className="icon-btn" onClick={() => setRoundsGroup(null)}>
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* 차수 탭 + 이전/다음 버튼 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-sm btn-outline"
                    disabled={clampedIndex === 0}
                    onClick={() => setActiveRoundIndex((idx) => Math.max(0, idx - 1))}
                    title="이전 차수"
                  >
                    ‹
                  </button>
                  {list.map((round, index) => (
                    <button
                      key={round.rfqName}
                      type="button"
                      className={`badge ${index === clampedIndex ? 'badge-purple' : 'badge-gray'}`}
                      onClick={() => setActiveRoundIndex(index)}
                      style={{
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: index === clampedIndex ? 700 : 500,
                        fontSize: '12px',
                      }}
                    >
                      {round.round}차
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn-sm btn-outline"
                    disabled={clampedIndex === list.length - 1}
                    onClick={() => setActiveRoundIndex((idx) => Math.min(list.length - 1, idx + 1))}
                    title="다음 차수"
                  >
                    ›
                  </button>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  RFQ 번호: <span style={{ fontFamily: 'monospace' }}>{active.rfqName}</span>
                  {active.deadline && <> · 마감: {active.deadline}</>}
                </div>

                {/* 선택된 차수의 견적 목록 */}
                {!onFetchRfqRoundQuotations ? (
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>
                    현재 화면에서는 차수별 견적 조회를 지원하지 않습니다.
                  </div>
                ) : snapshot === 'loading' || snapshot === undefined ? (
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>
                    <LoaderCircle size={14} /> 견적을 불러오는 중...
                  </div>
                ) : snapshot === 'error' ? (
                  <div style={{ fontSize: '13px', color: 'var(--danger)', padding: '20px', textAlign: 'center' }}>
                    견적을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      회신 {snapshot.respondedCount}/{snapshot.recipientCount}건 ({snapshot.responseRate}%)
                    </div>
                    {snapshot.quotations.length === 0 ? (
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>
                        이 차수에는 제출된 견적이 없습니다.
                      </div>
                    ) : (
                      <table className="custom-table" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th>협력사</th>
                            <th>품목</th>
                            <th style={{ textAlign: 'right' }}>단가</th>
                            <th style={{ textAlign: 'right' }}>총액</th>
                            <th>납기일</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snapshot.quotations.map((quotation) => {
                            const firstItem = quotation.items[0];
                            return (
                              <tr key={quotation.name}>
                                <td style={{ fontWeight: 600 }}>{quotation.supplier}</td>
                                <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                  {firstItem?.itemName ?? '-'}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                  {firstItem?.rate ? `₩${firstItem.rate.toLocaleString()}` : '-'}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                  {quotation.grandTotal ? `₩${quotation.grandTotal.toLocaleString()}` : '-'}
                                </td>
                                <td style={{ fontSize: '12px' }}>
                                  {firstItem?.expectedDeliveryDate
                                    ?? (firstItem?.leadTimeDays ? `${firstItem.leadTimeDays}일 소요` : '미기재')}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setRoundsGroup(null)}>
                  닫기
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 와이어프레임 '상세보기 패널' - MR번호/차수/회신율 클릭으로 나뉘어
          있던 정보(기본정보/RFQ 협력사 현황/마감정보/차수이력)를 한 화면에서
          요약해서 보여준다. 읽기 전용 요약 + 기존 상세 모달로 바로가기이고,
          아래 기존 3개 모달(showMRModal/showRoundsModal/showQuotationModal)은
          실제 조작 기능이 있어 그대로 남겨뒀다 - 이 패널이 그것들을
          대체하지 않는다. */}
      {detailGroup && (() => {
        const dg = detailGroup;
        const dgMatchedMR = requests.find((r) => r.mrNo === dg.mrNo) || null;
        const dgCurrentRound = currentRoundQuotations(dg);
        const dgRespondedCount = dgCurrentRound.filter((q) => q.isResponded).length;
        const dgCachedDraft = readRfqDraftCache(dg.mrNo);
        const dgExistingNames = new Set(dgCurrentRound.map((q) => q.supplierName.trim()));
        const dgManualNames = [...new Set(
          (dgCachedDraft?.manualSuppliers ?? [])
            .map((name) => name.trim())
            .filter((name) => name && !dgExistingNames.has(name)),
        )];
        const dgRounds = dg.rfqRounds ?? [];
        // AI 추천 1순위는 '이번 라운드'가 아니라 재비딩으로 쌓인 모든 차수를
        // 합친 결과(quotation_ranking)에서 고른다 - 백엔드 ranker가 지난
        // 라운드 견적까지 한꺼번에 순위를 매기기 때문에, 1순위가 지난 차수
        // 견적일 수 있다. 이름은 랭킹 행의 supplier_name을 쓰고(현재 라운드
        // 목록에 없는 견적도 표시 가능), 금액은 현재 라운드에 있으면 붙인다.
        const dgAllEvaluations = [...(dg.quotationAiEvaluations ?? [])]
          .filter((evaluation) => evaluation.aiRank > 0)
          .sort((left, right) => left.aiRank - right.aiRank);
        const dgAiTopEvaluation = dgAllEvaluations[0] ?? null;
        const dgAiTopQuotation = dgAiTopEvaluation
          ? dg.quotations.find((q) => q.quotationId === dgAiTopEvaluation.quotationId) ?? null
          : null;
        // 랭킹 결과가 아직 없으면(도착 직후) 이번 라운드 견적의 aiRank로 대체.
        const dgAiTopFallback = dgCurrentRound
          .filter((q) => q.isResponded && q.aiRank > 0)
          .sort((left, right) => left.aiRank - right.aiRank)[0] ?? null;
        const dgAiTop = dgAiTopEvaluation
          ? {
              supplierName: dgAiTopEvaluation.supplierName
                ?? dgAiTopQuotation?.supplierName
                ?? '(협력사명 미확인)',
              aiRank: dgAiTopEvaluation.aiRank,
              aiScore: dgAiTopEvaluation.aiScore,
              aiReason: dgAiTopEvaluation.aiReason,
              quoteTotalPrice: dgAiTopQuotation?.quoteTotalPrice ?? null,
              fromPastRound: !dgAiTopQuotation,
              evaluatedCount: dgAllEvaluations.length,
            }
          : dgAiTopFallback
            ? {
                supplierName: dgAiTopFallback.supplierName,
                aiRank: dgAiTopFallback.aiRank,
                aiScore: dgAiTopFallback.aiScore,
                aiReason: dgAiTopFallback.aiReason,
                quoteTotalPrice: dgAiTopFallback.quoteTotalPrice,
                fromPastRound: false,
                evaluatedCount: dgCurrentRound.filter((q) => q.isResponded && q.aiRank > 0).length,
              }
            : null;
        // 회신은 왔는데 아직 AI 평가가 안 붙은 견적 - '평가중'으로 안내한다.
        const dgAwaitingEvaluation = dgCurrentRound.filter(
          (q) => q.isResponded && !hasQuotationAiEvaluation(q),
        ).length;
        const dgSelected = dg.quotations.find((q) => q.supplierId === dg.selectedSupplierId) ?? null;
        return (
          <div className="modal-overlay" onClick={() => setDetailGroup(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '640px' }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileText size={20} color="var(--primary)" />
                  <h3 style={{ margin: 0 }}>RFQ 상세 요약 ({dg.mrNo})</h3>
                </div>
                <button type="button" className="icon-btn" onClick={() => setDetailGroup(null)}>
                  <X size={18} />
                </button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* AI 추천/선정 결과를 패널 맨 위에 가장 크게 - 이 건에서
                    제일 먼저 봐야 하는 정보가 "AI가 뭘 추천했고 왜인지"라서
                    기본정보보다 위로 올렸다. '근거 자세히 보기'는 기존 견적
                    상세비교 모달(AI 5대 평가표)로 이어진다. */}
                {dgSelected ? (
                  <div style={{ border: '1px solid var(--success)', backgroundColor: 'var(--success-bg)', borderRadius: '10px', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: 'var(--success)' }}>
                      <CheckCircle2 size={13} /> 선정 완료
                      {dgSelected.aiRank === 1 && ' · AI 추천 1순위 그대로'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '8px', gap: '10px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>{dgSelected.supplierName}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
                        ₩{dgSelected.quoteTotalPrice.toLocaleString()}
                      </span>
                    </div>
                    {dgSelected.aiReason && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{dgSelected.aiReason}</div>
                    )}
                    <button
                      type="button"
                      onClick={() => { setDetailGroup(null); handleOpenQuotationModal(dg); }}
                      style={{ marginTop: '8px', background: 'none', border: 'none', padding: 0, fontSize: '12px', fontWeight: 600, color: 'var(--primary-hover)', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      근거 자세히 보기 →
                    </button>
                  </div>
                ) : dgAiTop ? (
                  <div style={{ border: '1px solid var(--border-highlight)', backgroundColor: 'var(--primary-soft)', borderRadius: '10px', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: 'var(--primary-hover)' }}>
                        <Sparkles size={13} color="var(--accent)" /> AI 추천 {dgAiTop.aiRank}순위
                        <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>
                          · 전 차수 {dgAiTop.evaluatedCount}건 비교
                        </span>
                      </span>
                      {dgAiTop.fromPastRound && (
                        <span className="badge badge-purple" style={{ fontSize: '10px' }}>지난 차수 견적</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '8px', gap: '10px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>{dgAiTop.supplierName}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
                        {dgAiTop.aiScore > 0 ? `${dgAiTop.aiScore.toFixed(1)}점` : ''}
                        {dgAiTop.quoteTotalPrice != null ? `${dgAiTop.aiScore > 0 ? ' · ' : ''}₩${dgAiTop.quoteTotalPrice.toLocaleString()}` : ''}
                      </span>
                    </div>
                    {dgAiTop.aiReason && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{dgAiTop.aiReason}</div>
                    )}
                    {dgAwaitingEvaluation > 0 && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--primary-hover)', fontWeight: 600, marginTop: '6px' }}>
                        <LoaderCircle size={11} className="spin-icon" /> {dgAwaitingEvaluation}건 평가중... 순위는 평가가 끝나면 갱신됩니다
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { setDetailGroup(null); handleOpenQuotationModal(dg); }}
                      style={{ marginTop: '8px', display: 'block', background: 'none', border: 'none', padding: 0, fontSize: '12px', fontWeight: 600, color: 'var(--primary-hover)', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      근거 자세히 보기 · 업체 선정 →
                    </button>
                  </div>
                ) : dgAwaitingEvaluation > 0 ? (
                  <div style={{ border: '1px solid var(--border-highlight)', backgroundColor: 'var(--primary-soft)', borderRadius: '10px', padding: '14px 16px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--primary-hover)' }}>
                      <LoaderCircle size={13} className="spin-icon" /> 평가중... ({dgAwaitingEvaluation}건)
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      회신이 도착한 견적을 AI가 순서대로 평가하고 있습니다. 끝나면 추천 1순위와 근거가 여기에 표시됩니다.
                    </div>
                  </div>
                ) : (
                  <div style={{ border: '1px dashed var(--border-color)', borderRadius: '10px', padding: '14px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    아직 AI가 순위를 낼 견적 회신이 없습니다. 회신이 들어오면 자동으로 평가해 추천 1순위와 근거를 보여줍니다.
                  </div>
                )}

                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>기본 정보</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', backgroundColor: 'var(--bg-input)', padding: '12px 14px', borderRadius: '8px', fontSize: '13px' }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>품목</span><div style={{ fontWeight: 600 }}>{dg.itemName}</div></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>수량</span><div style={{ fontWeight: 600 }}>{dg.quantity} {dg.unit}</div></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>약정 납기일</span><div style={{ fontWeight: 600 }}>{dg.targetDueDate}</div></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>요청부서</span><div style={{ fontWeight: 600 }}>{dg.department}{dgMatchedMR?.requester ? ` · ${dgMatchedMR.requester}` : ''}</div></div>
                    {dgMatchedMR && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <span style={{ color: 'var(--text-muted)' }}>참고 단가 / 총액</span>
                        <div style={{ fontWeight: 700, color: 'var(--primary)' }}>
                          ₩{dgMatchedMR.unitPrice.toLocaleString()} / EA · 총 ₩{dgMatchedMR.totalPrice.toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>
                    RFQ 협력사 현황 ({closedRoundCount(dg) + (dg.rfqSent ? 1 : 0)}차 기준)
                  </div>
                  {dgCurrentRound.length === 0 && dgManualNames.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>아직 RFQ 대상이 정해지지 않았습니다.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {dgCurrentRound.map((q) => (
                        <div key={q.quotationId ?? q.supplierId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px' }}>
                          <span>{q.supplierName}</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {/* 회신이 온 협력사는 AI 점수까지 같이 - 표에서는
                                회신율만 보이고 업체별 점수는 비교 모달에만
                                있었는데, 훑어볼 때 여기서 바로 보이게 했다. */}
                            {q.isResponded && q.aiScore > 0 && (
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-hover)' }}>
                                AI {q.aiScore.toFixed(1)}점{q.aiRank > 0 ? ` · ${q.aiRank}순위` : ''}
                              </span>
                            )}
                            <span className={`badge ${q.isResponded ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: '11px' }}>
                              {q.isResponded ? '회신완료' : '회신 대기'}
                            </span>
                          </span>
                        </div>
                      ))}
                      {dgManualNames.map((name) => (
                        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px' }}>
                          <span>{name}</span>
                          <span className="badge badge-gray" style={{ fontSize: '11px' }}>대상 등록됨 · 미발송</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 마감 정보 + 연장 이력 - 마감일은 연장할 때마다 덮어써지므로
                    백엔드가 남겨둔 연장 이력(workflow_status_history)을 따로
                    불러와 '언제 -> 언제로' 늘렸는지 같이 보여준다. */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>마감 정보</div>
                  <div style={{ padding: '12px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>현재 마감</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700 }}>
                          {dg.rfqSent ? `${dg.deadlineDate} ${dg.deadlineTime.slice(0, 2)}시` : 'RFQ 발송 전'}
                        </span>
                        {dg.rfqSent && (
                          <span
                            className={`badge ${dg.deadlineDDay > 0 ? 'badge-yellow' : 'badge-red'}`}
                            style={{ fontSize: '11px' }}
                          >
                            {dg.deadlineDDay > 0 ? `D-${dg.deadlineDDay}일` : '마감 지남'}
                          </span>
                        )}
                      </span>
                    </div>

                    {/* 연장 이력 */}
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border-color)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>
                        연장 이력
                        {Array.isArray(deadlineHistory) && deadlineHistory.length > 0 && ` (${deadlineHistory.length}회)`}
                      </div>
                      {deadlineHistory === 'loading' ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>불러오는 중...</div>
                      ) : deadlineHistory === 'error' ? (
                        // 백엔드에 이력 조회가 아직 배포되지 않았거나 일시적
                        // 실패인 경우 - 바이어가 조치할 일이 아니므로 조용히 안내.
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>연장 이력을 불러오지 못했습니다.</div>
                      ) : deadlineHistory.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>연장한 적이 없습니다.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {deadlineHistory.map((change, index) => (
                            <div key={`${change.changed_at}-${index}`} style={{ display: 'flex', gap: '10px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '10px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--warning)', marginTop: '5px', flexShrink: 0 }} />
                                {index < deadlineHistory.length - 1 && (
                                  <span style={{ width: '1px', flexGrow: 1, backgroundColor: 'var(--border-color)' }} />
                                )}
                              </div>
                              <div style={{ paddingBottom: index < deadlineHistory.length - 1 ? '12px' : 0 }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-main)' }}>
                                  <span style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                                    {formatStampToHour(change.previous_deadline_at)}
                                  </span>
                                  <span style={{ color: 'var(--text-dim)' }}> → </span>
                                  <strong>{formatStampToHour(change.deadline_at)}</strong>
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                                  {formatStampToHour(change.changed_at)} 변경
                                  {change.changed_by ? ` · ${change.changed_by}` : ''}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 차수 이력 - 마감된 지난 라운드는 회색, 지금 진행 중인 라운드는
                    파란 점으로 구분해서 점·선 타임라인으로 보여준다. */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>
                    차수 이력 (총 {closedRoundCount(dg) + (dg.rfqSent ? 1 : 0)}차)
                  </div>
                  {dgRounds.length === 0 && !dg.rfqSent ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>아직 RFQ를 보내지 않았습니다.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {dgRounds.map((r) => (
                        <div key={r.rfqName} style={{ display: 'flex', gap: '12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '12px' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--text-dim)', marginTop: '4px', flexShrink: 0 }} />
                            <span style={{ width: '1px', flexGrow: 1, backgroundColor: 'var(--border-color)' }} />
                          </div>
                          <div style={{ paddingBottom: '16px', flexGrow: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="badge badge-gray" style={{ fontSize: '11px', fontWeight: 700 }}>{r.round}차</span>
                              <span className="badge badge-gray" style={{ fontSize: '10px' }}>마감 종료</span>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-main)', marginTop: '4px', fontFamily: 'monospace' }}>{r.rfqName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                              {r.deadline ? `마감 ${formatStampToHour(r.deadline)}` : '마감일 기록 없음'}
                              {r.closedAt ? ` · 종료 ${formatStampToHour(r.closedAt)}` : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                      {dg.rfqSent && (
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '12px' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--accent)', marginTop: '4px', flexShrink: 0, boxShadow: '0 0 0 3px var(--accent-soft)' }} />
                          </div>
                          <div style={{ flexGrow: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="badge badge-blue" style={{ fontSize: '11px', fontWeight: 700 }}>{closedRoundCount(dg)}차</span>
                              <span className="badge badge-progress" style={{ fontSize: '10px' }}>진행중</span>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-main)', marginTop: '4px', fontFamily: 'monospace' }}>{dg.rfqName ?? '-'}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                              마감 {dg.deadlineDate} {dg.deadlineTime.slice(0, 2)}시 · 회신 {dgRespondedCount}/{dgCurrentRound.length}건
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn-outline" onClick={() => { setDetailGroup(null); handleOpenMRDetail(dg); }}>
                  MR 상세 내역 열기
                </button>
                {closedRoundCount(dg) > 0 && (
                  <button type="button" className="btn-outline" onClick={() => { setDetailGroup(null); handleOpenRoundsModal(dg); }}>
                    차수 이력 열기
                  </button>
                )}
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => { setDetailGroup(null); handleOpenQuotationModal(dg); }}
                >
                  견적 비교 · 업체 선정
                </button>
                <button type="button" className="btn-primary" onClick={() => setDetailGroup(null)}>닫기</button>
              </div>
            </div>
          </div>
        );
      })()}

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
                    📅 {selectedGroup.targetDueDate} ({formatDDayLabel(selectedGroup.targetDueDate)})
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
                    {activeMR.attachmentFiles.map((file, idx) => {
                      const fileName = typeof file === 'string' ? file : file.fileName;
                      return (
                      <button
                        type="button"
                        key={`${fileName}-${idx}`}
                        onClick={() => onDownloadAttachment?.(file)}
                        disabled={!onDownloadAttachment}
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
                          cursor: onDownloadAttachment ? 'pointer' : 'default',
                        }}
                      >
                        <Paperclip size={13} /> {fileName}
                      </button>
                      );
                    })}
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
        <div className="modal-overlay">
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
                  비딩플로우에서 완료한 <strong>PO별 평가 평균을 다시 평균</strong>하여 높은 점수 순으로 추천합니다. 제외된 가격은 해당 평가의 평균에서 제외하며, 항목별 점수는 평가 이력의 평균입니다. 평가 이력이 없는 협력사는 미평가로 표시합니다. RFQ를 발송할 업체를 체크해 주세요.
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

                {manualEvaluationError && <p role="alert" style={{ color: 'var(--accent)' }}>직접 추가한 협력사의 평가 이력을 불러오지 못했습니다. 창을 다시 열어 확인해주세요.</p>}
                {/* 5대 항목 평가표 (Table) */}
                <div className="table-container rfq-candidate-list">
                  <table className="custom-table rfq-candidate-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>선택</th>
                        <th style={{ width: '60px', textAlign: 'center' }}>순위</th>
                        <th>협력사 정보</th>
                        <th style={{ textAlign: 'center', width: '90px' }}>평균 점수</th>
                        <th style={{ textAlign: 'center' }}>납기 (5점)</th>
                        <th style={{ textAlign: 'center' }}>품질 (5점)</th>
                        <th style={{ textAlign: 'center' }}>가격 (5점)</th>
                        <th style={{ textAlign: 'center' }}>응대 (5점)</th>
                        <th style={{ textAlign: 'center' }}>의사소통 (5점)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rfqCandidateRows
                        .map((q) => {
                          const rank = q.rank;
                          // '거절됨'은 정보 표시용일 뿐 선택을 막지는 않는다 -
                          // 재비딩 때는 과거에 거절했던 협력사에게도 RFQ를
                          // 다시 보낼 수 있어야 한다.
                          const isRejected = isRejectedSupplier(q);
                          const isChecked = Boolean(rfqSelectedSuppliers[q.supplierId]);
                          const sourceUrl = safeExternalUrl(q.sourceUrl);

                          return (
                            <tr
                              key={q.supplierId}
                              style={{ backgroundColor: isChecked ? 'rgba(60,60,67,0.02)' : 'transparent' }}
                            >
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
                                ) : <span className="badge badge-gray">{q.isManual ? '직접' : '미평가'}</span>}
                              </td>
                              {/* 협력사명·이메일·연락처·출처 URL */}
                              <td className="rfq-supplier-info-cell">
                                <div className="rfq-supplier-info-name">
                                  <span>
                                    {q.supplierName}
                                    {rank === 1 && (
                                      <span style={{ fontSize: '10px', color: 'var(--accent)', marginLeft: '6px' }}>[평가 평균 1위]</span>
                                    )}
                                    {isRejected && (
                                      <span
                                        className="badge badge-red"
                                        style={{ fontSize: '10px', marginLeft: '6px' }}
                                        title="이 MR의 이전 라운드에서 수주 접수를 거절한 협력사입니다."
                                      >
                                        거절됨
                                      </span>
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
                                    <a
                                      className="rfq-supplier-source-link"
                                      href={sourceUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      출처 URL <ExternalLink size={11} />
                                    </a>
                                  ) : <span className="rfq-supplier-source-link">출처 URL: 없음</span>}
                                </div>
                              </td>
                              {/* 5개 평가 항목 평균 */}
                              <td style={{ textAlign: 'center' }}>
                                {q.averageScore != null ? (
                                  <span className="badge badge-purple" style={{ fontWeight: 700 }} title={`완료된 PO 평가 ${q.evaluationCount ?? 0}건 평균`}>
                                    {q.averageScore.toFixed(1)}점
                                  </span>
                                ) : '—'}
                              </td>
                              {/* 납기 */}
                              <td style={{ textAlign: 'center', color: q.scores?.leadTime === 5 ? 'var(--accent)' : 'var(--text-main)', fontWeight: q.scores?.leadTime === 5 ? 700 : 400 }}>
                                {q.scores?.leadTime != null ? `⭐ ${q.scores.leadTime.toFixed(1)}점` : '—'}
                              </td>
                              {/* 품질 */}
                              <td style={{ textAlign: 'center', color: q.scores?.quality === 5 ? 'var(--accent)' : 'var(--text-main)', fontWeight: q.scores?.quality === 5 ? 700 : 400 }}>
                                {q.scores?.quality != null ? `⭐ ${q.scores.quality.toFixed(1)}점` : '—'}
                              </td>
                              {/* 가격 */}
                              <td style={{ textAlign: 'center', color: q.scores?.price === 5 ? 'var(--accent)' : 'var(--text-main)', fontWeight: q.scores?.price === 5 ? 700 : 400 }}>
                                {q.scores?.price != null ? `⭐ ${q.scores.price.toFixed(1)}점` : '—'}
                              </td>
                              {/* 응대 */}
                              <td style={{ textAlign: 'center', color: q.scores?.service === 5 ? 'var(--accent)' : 'var(--text-main)', fontWeight: q.scores?.service === 5 ? 700 : 400 }}>
                                {q.scores?.service != null ? `⭐ ${q.scores.service.toFixed(1)}점` : '—'}
                              </td>
                              {/* 의사소통 */}
                              <td style={{ textAlign: 'center', color: q.scores?.communication === 5 ? 'var(--accent)' : 'var(--text-main)', fontWeight: q.scores?.communication === 5 ? 700 : 400 }}>
                                {q.scores?.communication != null ? `⭐ ${q.scores.communication.toFixed(1)}점` : '—'}
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
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        className="form-input"
                        value={rfqManualSupplierName}
                        onChange={(event) => {
                          setRfqManualSupplierName(event.target.value);
                          setShowSupplierSuggestions(true);
                        }}
                        onFocus={() => setShowSupplierSuggestions(true)}
                        onBlur={() => window.setTimeout(() => setShowSupplierSuggestions(false), 150)}
                        placeholder="협력사명"
                        aria-label="직접 입력 협력사명"
                        autoComplete="off"
                      />
                      {showSupplierSuggestions && rfqManualSupplierName.trim().length > 0 && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 4px)',
                            left: 0,
                            right: 0,
                            zIndex: 20,
                            backgroundColor: 'var(--bg-surface, #fff)',
                            border: '1px solid var(--border-color, #d0d5dd)',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                            maxHeight: '220px',
                            overflowY: 'auto',
                          }}
                        >
                          {isSearchingSuppliers && (
                            <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                              검색 중...
                            </div>
                          )}
                          {!isSearchingSuppliers && manualSupplierSuggestions.length === 0 && (
                            <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                              기존 협력사 풀에 없음 · 신규로 등록됩니다
                            </div>
                          )}
                          {!isSearchingSuppliers && manualSupplierSuggestions.map((suggestion) => (
                            <button
                              key={suggestion.name}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => handlePickSupplierSuggestion(suggestion)}
                              style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                padding: '8px 12px',
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              <div style={{ fontWeight: 600 }}>{suggestion.supplierName}</div>
                              <div>{suggestion.recommendation ? `평가 평균 ${suggestion.recommendation.average_score.toFixed(1)}점 · ${suggestion.recommendation.evaluation_count}건` : '평가 이력 없음'}</div>
                              <div style={{ color: 'var(--text-muted)' }}>
                                {suggestion.email || '이메일 없음'}{suggestion.phone ? ` · ${suggestion.phone}` : ''}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="email"
                        className="form-input"
                        value={rfqManualSupplierEmail}
                        onChange={(event) => {
                          setRfqManualSupplierEmail(event.target.value);
                          setShowEmailSuggestions(true);
                        }}
                        onFocus={() => setShowEmailSuggestions(true)}
                        onBlur={() => window.setTimeout(() => setShowEmailSuggestions(false), 150)}
                        placeholder="contact@example.com"
                        aria-label="직접 입력 협력사 이메일"
                        autoComplete="off"
                      />
                      {showEmailSuggestions && rfqManualSupplierEmail.trim().length > 0 && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 4px)',
                            left: 0,
                            right: 0,
                            zIndex: 20,
                            backgroundColor: 'var(--bg-surface, #fff)',
                            border: '1px solid var(--border-color, #d0d5dd)',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                            maxHeight: '220px',
                            overflowY: 'auto',
                          }}
                        >
                          {isSearchingSupplierEmails && (
                            <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                              검색 중...
                            </div>
                          )}
                          {!isSearchingSupplierEmails && emailSupplierSuggestions.length === 0 && (
                            <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                              기존 협력사 풀에 없음 · 신규로 등록됩니다
                            </div>
                          )}
                          {!isSearchingSupplierEmails && emailSupplierSuggestions.map((suggestion) => (
                            <button
                              key={suggestion.name}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => handlePickSupplierSuggestion(suggestion)}
                              style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                padding: '8px 12px',
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              <div style={{ fontWeight: 600 }}>{suggestion.email || '이메일 없음'}</div>
                              <div>{suggestion.recommendation ? `평가 평균 ${suggestion.recommendation.average_score.toFixed(1)}점 · ${suggestion.recommendation.evaluation_count}건` : '평가 이력 없음'}</div>
                              <div style={{ color: 'var(--text-muted)' }}>
                                {suggestion.supplierName}{suggestion.phone ? ` · ${suggestion.phone}` : ''}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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
                        max={selectedGroup.targetDueDate}
                        onChange={(e) => {
                          setRfqDeadlineDate(e.target.value);
                          setRfqValidationMessage(null);
                        }}
                        title={`납기요청일(${selectedGroup.targetDueDate})보다 늦게는 지정할 수 없습니다.`}
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
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    마감일시는 납기요청일({selectedGroup.targetDueDate})보다 늦을 수 없습니다.
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
              {/* 재비딩 버튼은 표의 '주 액션'과 '⋯' 메뉴로 옮겼다 - 이 팝업은
                  견적을 비교해서 고르는 화면이라, 여기서 라운드를 새로
                  시작하는 버튼이 같이 있으면 실수로 누르기 쉽다. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button type="button" className="icon-btn" onClick={() => setShowQuotationModal(false)}>
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {selectedGroup.workflowError && !quotationAnalysisRunning && (
                <div
                  role="alert"
                  style={{
                    padding: '12px 14px',
                    border: '1px solid var(--danger)',
                    borderRadius: '8px',
                    color: 'var(--danger)',
                    background: 'var(--danger-bg)',
                  }}
                >
                  AI 분석 실패: {selectedGroup.workflowError}
                </div>
              )}
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
                      {/* 'AI 분석' 버튼은 없앴다 - 견적이 도착하면 백엔드가
                          웹훅에서 규격 평가를 바로 걸어두고(캐시), 남은 게
                          있으면 표의 ⋯ '회신 새로 확인 · 남은 견적 분석'이
                          한 번에 처리한다. 버튼이 두 곳에서 같은 일을
                          하던 상태였다. */}
                      <th>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                          <span>회신 요약 및 AI 평가</span>
                          {(isAnalyzingQuotations || quotationAnalysisRunning) && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--primary-hover)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                              <LoaderCircle size={12} className="spin-icon" /> 평가중...
                            </span>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...selectedGroup.quotations, ...historicalQuotations]
                      .sort((a, b) => {
                        // 회신 여부가 AI 순위보다 우선이다. 미회신 업체에 과거
                        // 후보 순위가 남아 있어도 상세 비교표의 맨 아래로 보낸다.
                        if (a.isResponded !== b.isResponded) return a.isResponded ? -1 : 1;
                        const aEvaluated = hasQuotationAiEvaluation(a);
                        const bEvaluated = hasQuotationAiEvaluation(b);
                        if (aEvaluated !== bEvaluated) return aEvaluated ? -1 : 1;
                        return aEvaluated && bEvaluated ? a.aiRank - b.aiRank : 0;
                      })
                      .map((q) => {
                      const rowKey = quotationRowKey(q);
                      const isChecked = selectedQuotationKey
                        ? selectedQuotationKey === rowKey
                        : selectedSupplierForApproval === q.supplierId;
                      const expired = isQuotationExpired(q);
                      // 이번 라운드가 아니라 지난 라운드에서 가져온 행인지 - 지난
                      // 라운드 견적은 "AI 분석"으로 아직 평가되지 않았으면
                      // quotation_ranking에 없어서 백엔드가 최종선정을 거부한다.
                      const isHistoricalRow = !selectedGroup.quotations.some((cur) => quotationRowKey(cur) === rowKey);
                      const needsAiEvaluation = isHistoricalRow && !hasQuotationAiEvaluation(q);
                      const selectionDisabled = !q.isResponded || expired || needsAiEvaluation;
                      const disabledTitle = expired
                        ? `유효기간(${q.validTill})이 지난 만료된 견적서입니다.`
                        : needsAiEvaluation
                          ? '지난 라운드 견적입니다. 상단의 AI 분석 버튼을 눌러 평가를 마쳐야 선택할 수 있습니다.'
                          : undefined;

                      return (
                        <tr key={rowKey} style={{ backgroundColor: isChecked ? 'var(--success-bg)' : 'transparent' }}>
                          {/* 라디오/체크박스 */}
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="radio"
                              name="selected_supplier_radio"
                              disabled={selectionDisabled}
                              checked={isChecked}
                              onChange={() => {
                                setSelectedSupplierForApproval(q.supplierId);
                                setSelectedQuotationKey(rowKey);
                              }}
                              style={{ width: '16px', height: '16px', cursor: selectionDisabled ? 'not-allowed' : 'pointer' }}
                              title={disabledTitle}
                            />
                          </td>
                          {/* 협력사명 */}
                          <td style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                            {q.supplierName}
                            <span className="badge badge-blue" style={{ marginLeft: '6px', fontSize: '10px' }}>
                              {q.rfqRound ?? 0}차
                            </span>
                            {isHistoricalRow && (
                              <span className="badge" style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--text-muted)' }}>
                                지난 라운드
                              </span>
                            )}
                            {expired && (
                              <span className="badge badge-red" style={{ marginLeft: '6px', fontSize: '10px' }} title={`유효기간: ${q.validTill}`}>
                                만료된 견적서입니다
                              </span>
                            )}
                            {q.isResponded && hasQuotationAiEvaluation(q) && q.aiRank === 1 && (
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
                            {q.isResponded && !hasQuotationAiEvaluation(q) && (
                              <div style={{ marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--primary-hover)', fontWeight: 600 }}>
                                <LoaderCircle size={11} className="spin-icon" />
                                평가중... (회신 도착분은 순서대로 자동 평가됩니다)
                              </div>
                            )}
                            {hasQuotationAiEvaluation(q) && (
                              <>
                                {(q.specMatch !== undefined || q.fulfillsQuantity !== undefined) && (
                                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '5px' }}>
                                    {q.specMatch !== undefined && (
                                      <span className={`badge ${q.specMatch ? 'badge-green' : 'badge-red'}`}>
                                        {q.specMatch ? '규격 일치' : '규격 확인 필요'}
                                      </span>
                                    )}
                                    {q.fulfillsQuantity !== undefined && (
                                      <span className={`badge ${q.fulfillsQuantity ? 'badge-green' : 'badge-red'}`}>
                                        {q.fulfillsQuantity ? '수량 충족' : '수량 미충족'}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {q.aiReason && (
                                  <div style={{ color: 'var(--primary-hover)', marginTop: '4px', fontWeight: 500 }}>
                                    💡 AI {q.aiRank}위
                                    {q.overallScore !== undefined && (
                                      <> · 종합 {q.overallScore.toFixed(2)}점</>
                                    )}
                                    {q.numericScore !== undefined && q.specificationScore !== undefined && (
                                      <>: 가격·납기 {q.numericScore.toFixed(2)}점, 규격 {q.specificationScore.toFixed(2)}점</>
                                    )}
                                    {' · '}{q.aiReason}
                                  </div>
                                )}
                                {q.aiIssues && q.aiIssues.length > 0 && (
                                  <div style={{ color: 'var(--danger)', marginTop: '3px' }}>
                                    확인 필요: {q.aiIssues.join(', ')}
                                  </div>
                                )}
                              </>
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
                disabled={
                  !selectedSupplierForApproval
                  || !selectedApprovalHasAiEvaluation
                  || selectedApprovalExpired
                  || Boolean(selectingSupplierId)
                  || isAnalyzingQuotations
                }
                onClick={handleConfirmSupplierSelection}
                title={selectedApprovalExpired
                  ? '유효기간이 지난 견적입니다. 다른 견적을 선택해주세요.'
                  : !selectedApprovalHasAiEvaluation
                    ? 'AI 분석을 완료한 뒤 회신 업체를 선택해주세요.'
                    : undefined}
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
                      max={extendingGroup.targetDueDate}
                      onChange={(e) => {
                        setExtDate(e.target.value);
                        setExtValidationMessage(null);
                      }}
                      title={`납기요청일(${extendingGroup.targetDueDate})보다 늦게는 지정할 수 없습니다.`}
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
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  마감일시는 납기요청일({extendingGroup.targetDueDate})보다 늦을 수 없습니다.<br />
                  현재 마감은 <strong>{extendingGroup.deadlineDate} {extendingGroup.deadlineTime}</strong>
                  {extendingGroup.deadlineDDay <= 0 ? ' (이미 지남)' : ''} 입니다 —
                  {' '}새 마감일시는 <strong>지금 이후</strong>이고 <strong>현재 마감보다 늦어야</strong> 저장됩니다.
                </div>
                {extValidationMessage && (
                  <div className="form-validation-message" role="alert">
                    <AlertTriangle size={14} /> {extValidationMessage}
                  </div>
                )}
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

      {/* 팝업 모달 6: 마감 지남 + 미선정 상태 - 'MR 취소' 사유 입력 모달 */}
      {cancellingGroup && (
        <div className="modal-overlay" onClick={() => setCancellingGroup(null)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()} style={{ width: '520px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={22} color="var(--danger)" />
                <div>
                  <h3 style={{ margin: 0 }}>MR 취소</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {cancellingGroup.mrNo} · 견적 마감이 지났고 제출된 견적이 없습니다.
                  </span>
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => setCancellingGroup(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmCancelMR}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-main)', backgroundColor: 'var(--danger-bg)', padding: '12px', borderRadius: '6px' }}>
                  이 MR을 취소하면 발송된 RFQ와 관련 문서가 정리되고 Material Request가 취소 처리됩니다. 이 작업은 되돌릴 수 없습니다.
                </div>
                <div className="form-group">
                  <label htmlFor="mr-cancel-reason">MR 취소 사유</label>
                  <textarea
                    id="mr-cancel-reason"
                    className="form-input"
                    rows={4}
                    value={cancelMrReason}
                    onChange={(event) => setCancelMrReason(event.target.value)}
                    placeholder="예: 마감 시한까지 응찰한 협력사가 없어 MR을 취소합니다."
                    autoFocus
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setCancellingGroup(null)}>
                  닫기
                </button>
                <button type="submit" className="btn-reject" disabled={!cancelMrReason.trim()}>
                  MR 취소 확정
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
