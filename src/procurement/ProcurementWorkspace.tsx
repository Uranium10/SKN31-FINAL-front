import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { SpecModal } from './components/SpecModal';
import { RejectReasonModal } from './components/RejectReasonModal';
import { NewMRModal } from './components/NewMRModal';

import { DashboardView } from './views/DashboardView';
import { ItemRegistrationView } from './views/ItemRegistrationView';
import { MRListView } from './views/MRListView';
import { VendorSelectionView } from './views/VendorSelectionView';
import { POManagementView } from './views/POManagementView';

import type {
  NavigationTab,
  Item,
  MaterialRequest,
  VendorSelectionGroup,
  POItem,
  SupplierScores,
  ProcurementNotification,
  GlobalSearchResult,
} from './types';

import {
  initialItems,
  initialMaterialRequests,
  initialVendorGroups,
  initialPOItems,
  initialNotifications,
} from './mock/data';
import {
  answerProcurementTask,
  caseToMaterialRequest,
  caseToPOItem,
  caseToVendorSelectionGroup,
  extendQuotationDeadline,
  listProcurementCases,
  rejectProcurementCase,
  startProcurementCase,
  syncDraftProcurementCases,
  type ProcurementDataMode,
} from './api/cases';
import {
  deleteAllProcurementNotifications,
  deleteProcurementNotification,
  listProcurementNotifications,
  subscribeProcurementEvents,
} from './api/notifications';
import { getERPItemSpecifications, listERPItems } from './api/items';
import { useStageTransitionItems } from './hooks/useStageTransitionItems';
import { normalizeSpecificationText } from './utils/itemSpecifications';

import './ProcurementWorkspace.css';
import { Paperclip, X } from 'lucide-react';

const procurementDataMode = (
  import.meta.env.VITE_PROCUREMENT_DATA_MODE ?? 'mock'
) as ProcurementDataMode;
const apiDataEnabled = procurementDataMode === 'api' || procurementDataMode === 'hybrid';

interface ProcurementUser {
  id?: string;
  email?: string;
  username?: string;
  full_name?: string;
  user_type?: string;
}

interface AssistantCommand {
  id: number;
  type: 'navigate';
  value: NavigationTab;
}

interface ProcurementWorkspaceProps {
  currentUser: ProcurementUser | null;
  onLogout: () => void | Promise<void>;
  assistantCommand?: AssistantCommand | null;
  onAssistantContextChange?: (context: {
    eyebrow: string;
    title: string;
    detail: string;
  }) => void;
}

const tabContext: Record<NavigationTab, { title: string; detail: string }> = {
  dashboard: {
    title: '구매 대시보드',
    detail: '승인 대기, 견적 회신, 협력사 승인과 PO 생성 현황을 확인합니다.',
  },
  'item-register': {
    title: '아이템 목록',
    detail: 'ERPNext 등록 품목과 AI가 자동 검증한 동적 규격을 조회합니다.',
  },
  'mr-list': {
    title: 'MR 목록',
    detail: '납기 순으로 구매 요청을 검색하고 승인 또는 반려합니다.',
  },
  'vendor-select': {
    title: '협력사 선정',
    detail: '견적 회신과 AI 추천 근거를 비교한 뒤 최종 협력사를 선택합니다.',
  },
  'po-manage': {
    title: 'PO 관리',
    detail: 'PO 발송 전 최종 승인과 Purchase Receipt 입고 현황을 관리합니다.',
  },
};

function uniqueByMrNo<T extends { mrNo: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.mrNo)) return false;
    seen.add(entry.mrNo);
    return true;
  });
}

const subtractDays = (dateValue: string, days: number) => {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

const createMockVendorGroup = (request: MaterialRequest): VendorSelectionGroup => {
  const quantity = request.quantity
    ?? Math.max(1, Math.round(request.totalPrice / Math.max(request.unitPrice, 1)));
  const supplierPrefix = request.mrNo.replaceAll('-', '');

  return {
    id: `VG-${request.mrNo}`,
    mrNo: request.mrNo,
    itemName: request.itemName,
    itemCode: request.itemCode,
    department: request.department,
    quantity,
    unit: 'EA',
    targetDueDate: request.dueDate,
    deadlineDate: subtractDays(request.dueDate, 3),
    deadlineTime: '18:00',
    deadlineDDay: Math.max(1, request.dDay - 3),
    rfqSent: false,
    prSent: false,
    quotations: [
      {
        supplierId: `${supplierPrefix}-SUP-A`,
        supplierName: '태광산업(주)',
        quoteUnitPrice: Math.round(request.unitPrice * 0.96),
        quoteTotalPrice: Math.round(request.totalPrice * 0.96),
        leadTimeDays: 9,
        isResponded: true,
        resContent: `${request.itemName} 요구 규격 충족 및 요청 납기 대응 가능합니다.`,
        resAttachments: [`${request.mrNo}_태광산업_견적서.pdf`],
        aiRank: 1,
        aiScore: 94,
        aiReason: 'AI 분석 결과: 규격 적합도와 납기 안정성이 가장 높고 기준 단가 대비 절감 효과가 확인되었습니다.',
        isSelected: false,
      },
      {
        supplierId: `${supplierPrefix}-SUP-B`,
        supplierName: '세진테크',
        quoteUnitPrice: Math.round(request.unitPrice * 1.02),
        quoteTotalPrice: Math.round(request.totalPrice * 1.02),
        leadTimeDays: 7,
        isResponded: true,
        resContent: '긴급 생산 일정을 적용하면 가장 빠른 납기가 가능합니다.',
        resAttachments: [`${request.mrNo}_세진테크_견적서.pdf`],
        aiRank: 2,
        aiScore: 86,
        aiReason: 'AI 분석 결과: 납기는 가장 빠르지만 1순위 대비 단가가 높아 긴급 구매 시 적합합니다.',
        isSelected: false,
      },
      {
        supplierId: `${supplierPrefix}-SUP-C`,
        supplierName: '한빛솔루션',
        quoteUnitPrice: Math.round(request.unitPrice * 0.99),
        quoteTotalPrice: Math.round(request.totalPrice * 0.99),
        leadTimeDays: 13,
        isResponded: true,
        resContent: '표준 생산 일정과 품질보증 조건으로 공급 가능합니다.',
        resAttachments: [`${request.mrNo}_한빛솔루션_견적서.pdf`],
        aiRank: 3,
        aiScore: 78,
        aiReason: 'AI 분석 결과: 가격 경쟁력은 있으나 요청 납기 대비 일정 여유가 적습니다.',
        isSelected: false,
      },
    ],
  };
};

function ProcurementWorkspaceComponent({
  currentUser,
  onLogout,
  assistantCommand,
  onAssistantContextChange,
}: ProcurementWorkspaceProps) {
  // Navigation & Search
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    window.localStorage.getItem('biddingflow.sidebar.collapsed') === 'true'
  ));

  // Domain State
  // In strict API mode, mock rows must never look like live ERPNext data.
  // Hybrid mode intentionally retains them only as an explicit fallback.
  const [items, setItems] = useState<Item[]>(
    procurementDataMode === 'api' ? [] : initialItems
  );
  const [requests, setRequests] = useState<MaterialRequest[]>(
    procurementDataMode === 'api' ? [] : initialMaterialRequests
  );
  const [vendorGroups, setVendorGroups] = useState<VendorSelectionGroup[]>(
    procurementDataMode === 'api' ? [] : initialVendorGroups
  );
  const [poItems, setPoItems] = useState<POItem[]>(
    procurementDataMode === 'api' ? [] : initialPOItems
      .filter((item) => item.supplierApprovalStatus !== 'rejected')
      .map((item) => ({
        ...item,
        supplierApprovalStatus: 'approved' as const,
        approvalStatus: item.poCreated ? 'approved' as const : 'pending' as const,
        promisedDeliveryDate: item.dueDate,
        deliveryStatus: item.arrived ? 'FULL' as const : 'NOT_RECEIVED' as const,
        fullReceiptDate: item.arrivedDate,
      }))
  );
  const [notifications, setNotifications] = useState<ProcurementNotification[]>(initialNotifications);

  // Modals state
  const [activeSpecItem, setActiveSpecItem] = useState<Item | null>(null);
  const [rejectingItem, setRejectingItem] = useState<{ id: string; mrNo: string } | null>(null);
  const [activeAttachmentFiles, setActiveAttachmentFiles] = useState<string[] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [newMRModalOpen, setNewMRModalOpen] = useState(false);
  const [mrApiLoading, setMrApiLoading] = useState(apiDataEnabled);
  const [mrApiError, setMrApiError] = useState<string | null>(null);
  const [itemApiLoading, setItemApiLoading] = useState(apiDataEnabled);
  const [itemApiError, setItemApiError] = useState<string | null>(null);
  const uniqueRequests = useMemo(() => uniqueByMrNo(requests), [requests]);
  const mrQueueRequests = useMemo(
    () => uniqueRequests.filter((request) => {
      if (request.workflowStatus && ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(request.workflowStatus)) {
        return false;
      }
      if (!request.workflowStage) return request.status !== '승인';
      return ['MR_REVIEW', 'ITEM_CHECK', 'SUBSTITUTE_DECISION', 'HUMAN_REVIEW'].includes(
        request.workflowStage
      );
    }),
    [uniqueRequests]
  );
  const activeVendorGroups = useMemo(
    () => uniqueByMrNo(vendorGroups.filter((group) => !group.prSent)),
    [vendorGroups]
  );
  const activePOItems = useMemo(() => {
    const returnedMRNumbers = new Set(
      uniqueRequests
        .filter((request) => request.returnedFromSupplier)
        .map((request) => request.mrNo)
    );
    return uniqueByMrNo(poItems.filter((item) => !returnedMRNumbers.has(item.mrNo)));
  }, [poItems, uniqueRequests]);
  const dashboardRequests = useMemo(() => uniqueRequests.filter((request) => {
    if (request.workflowStatus && ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(request.workflowStatus)) {
      return false;
    }
    const erpStatus = request.erpStatus?.trim().toLocaleLowerCase('en-US');
    if (erpStatus) return erpStatus === 'draft' || erpStatus === 'pending';
    // 구형 목업/마이그레이션 데이터에는 ERP 상태가 없으므로 미처리 MR만
    // 호환 표시하고, 완료·취소된 작업은 대시보드에서 제외합니다.
    return request.status === '승인대기';
  }), [uniqueRequests]);
  const animatedMRQueueRequests = useStageTransitionItems(mrQueueRequests);
  const animatedVendorGroups = useStageTransitionItems(activeVendorGroups);
  const animatedPOItems = useStageTransitionItems(activePOItems);
  const stageItemIds = useMemo(() => ({
    mr: mrQueueRequests.map((request) => request.id),
    vendor: activeVendorGroups.map((group) => group.id),
    po: activePOItems.map((item) => item.id),
  }), [mrQueueRequests, activeVendorGroups, activePOItems]);
  const [seenStageItemIds, setSeenStageItemIds] = useState<{
    mr: string[];
    vendor: string[];
    po: string[];
  }>({ mr: [], vendor: [], po: [] });
  const previousStageItemIds = useRef(stageItemIds);
  const [flashingStages, setFlashingStages] = useState({
    mr: false,
    vendor: false,
    po: false,
  });

  // 현재 단계에 없던 case/item ID가 새로 들어오는 순간만 메뉴를 짧게
  // 스윕합니다. 단순 재렌더링이나 같은 API 응답 반복으로는 깜빡이지 않습니다.
  useEffect(() => {
    const previous = previousStageItemIds.current;
    const added = {
      mr: stageItemIds.mr.some((id) => !previous.mr.includes(id)),
      vendor: stageItemIds.vendor.some((id) => !previous.vendor.includes(id)),
      po: stageItemIds.po.some((id) => !previous.po.includes(id)),
    };
    previousStageItemIds.current = stageItemIds;
    if (!added.mr && !added.vendor && !added.po) return undefined;

    setFlashingStages(added);
    const timer = window.setTimeout(() => {
      setFlashingStages({ mr: false, vendor: false, po: false });
    }, 760);
    return () => window.clearTimeout(timer);
  }, [stageItemIds]);

  // 현재 열어본 단계의 항목은 모두 확인한 것으로 표시합니다. 다른 단계는
  // 이미 사라진 ID만 seen 목록에서 제거하여, 나중에 같은 케이스가 해당
  // 단계로 다시 들어오면 새 작업으로 다시 안내할 수 있게 합니다.
  useEffect(() => {
    const activeStage = currentTab === 'mr-list'
      ? 'mr'
      : currentTab === 'vendor-select'
        ? 'vendor'
        : currentTab === 'po-manage'
          ? 'po'
          : null;
    setSeenStageItemIds((previous) => ({
      mr: activeStage === 'mr'
        ? stageItemIds.mr
        : previous.mr.filter((id) => stageItemIds.mr.includes(id)),
      vendor: activeStage === 'vendor'
        ? stageItemIds.vendor
        : previous.vendor.filter((id) => stageItemIds.vendor.includes(id)),
      po: activeStage === 'po'
        ? stageItemIds.po
        : previous.po.filter((id) => stageItemIds.po.includes(id)),
    }));
  }, [currentTab, stageItemIds]);
  const searchResults = useMemo<GlobalSearchResult[]>(() => {
    const query = searchQuery.trim().toLocaleLowerCase('ko-KR');
    if (!query) return [];

    const itemResults: GlobalSearchResult[] = items
      .filter((item) => [
        item.itemCode,
        item.itemName,
        item.department,
        item.specSummary,
        item.fullSpec.manufacturer,
      ].some((value) => value.toLocaleLowerCase('ko-KR').includes(query)))
      .map((item) => ({
        id: `search-item-${item.id}`,
        type: 'item',
        title: `${item.itemCode} · ${item.itemName}`,
        subtitle: `${item.department} · ${item.specSummary}`,
        searchValue: item.itemCode,
        targetTab: 'item-register',
      }));

    const vendorMRNumbers = new Set(activeVendorGroups.map((group) => group.mrNo));
    const poMRNumbers = new Set(activePOItems.map((item) => item.mrNo));
    const requestResults: GlobalSearchResult[] = uniqueRequests
      .filter((request) => [
        request.mrNo,
        request.itemCode,
        request.itemName,
        request.department,
        request.requester,
        request.category,
        request.specSummary,
      ].some((value) => value.toLocaleLowerCase('ko-KR').includes(query)))
      .map((request) => ({
        id: `search-mr-${request.id}`,
        type: 'mr',
        title: `${request.mrNo} · ${request.itemName}`,
        subtitle: `${request.department} · ${request.requester} · ${request.status}`,
        searchValue: request.mrNo,
        targetTab: poMRNumbers.has(request.mrNo)
          ? 'po-manage'
          : vendorMRNumbers.has(request.mrNo)
            ? 'vendor-select'
            : 'mr-list',
      }));

    return [...itemResults, ...requestResults].slice(0, 8);
  }, [activePOItems, activeVendorGroups, items, searchQuery, uniqueRequests]);

  useEffect(() => {
    if (assistantCommand?.type === 'navigate') {
      setCurrentTab(assistantCommand.value);
    }
  }, [assistantCommand]);

  useEffect(() => {
    const context = tabContext[currentTab];
    onAssistantContextChange?.({
      eyebrow: 'PURCHASE OPERATIONS',
      title: context.title,
      detail: context.detail,
    });
  }, [currentTab, onAssistantContextChange]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  // webhook/SSE를 붙일 때도 이 함수에 동일한 payload를 전달하면
  // 현재 알림 UI와 읽음 처리를 그대로 재사용할 수 있습니다.
  const pushNotification = (
    notification: Omit<ProcurementNotification, 'id' | 'time' | 'unread'>
  ) => {
    setNotifications((previous) => [{
      ...notification,
      id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time: '방금 전',
      unread: true,
    }, ...previous]);
  };

  const loadMRsFromApi = useCallback(async (
    reconcile = false,
    silent = false,
    reconcileMissing = true,
  ) => {
    if (!apiDataEnabled) return;
    if (!silent) {
      setMrApiLoading(true);
      setMrApiError(null);
    }
    try {
      if (reconcile) await syncDraftProcurementCases(reconcileMissing);
      const cases = await listProcurementCases();
      // #archived-* 케이스는 번호가 재사용되기 전의 감사 이력이며 현재
      // 구매 업무가 아니므로 대시보드와 각 단계 작업함에서 제외합니다.
      const visibleCases = cases.filter((entry) => !entry.mr_name.includes('#archived-'));
      setRequests(visibleCases.map(caseToMaterialRequest));
      setVendorGroups(
        visibleCases
          .filter((entry) => [
            'SUPPLIER_RECOMMENDATION', 'RFQ_TARGET_SELECTION', 'RFQ_SENDING',
            'QUOTATION_COLLECTION', 'SUPPLIER_SELECTION', 'ORDER_START',
          ].includes(entry.stage))
          .map(caseToVendorSelectionGroup)
      );
      setPoItems(
        visibleCases
          .filter((entry) => [
            'PRE_PO_APPROVAL', 'PO_CREATION', 'DELIVERY', 'SCORECARD', 'COMPLETED',
          ].includes(entry.stage))
          .map(caseToPOItem)
      );
      if (!silent) setNotifications(await listProcurementNotifications());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MR 목록을 불러오지 못했습니다.';
      if (!silent) {
        setMrApiError(message);
        if (procurementDataMode === 'api') setRequests([]);
      }
    } finally {
      if (!silent) setMrApiLoading(false);
    }
  }, []);

  // Item is an ERPNext master-data view. Load it independently from MR case
  // reconciliation so an MR/webhook error cannot leave mock items on screen.
  const loadItemsFromApi = useCallback(async () => {
    if (!apiDataEnabled) return;
    setItemApiLoading(true);
    setItemApiError(null);
    try {
      setItems(await listERPItems());
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'ERPNext 아이템 목록을 불러오지 못했습니다.';
      setItemApiError(message);
      if (procurementDataMode === 'api') setItems([]);
    } finally {
      setItemApiLoading(false);
    }
  }, []);

  // 웹훅이 누락된 비접속 시간대의 Draft MR을 로그인 후 최초 한 번 대사합니다.
  // 이후 상태 갱신은 작업 액션 직후 재조회하며, SSE 수신기는 같은 함수를
  // 호출하도록 붙일 수 있어 화면 상태 갱신 경로가 하나로 유지됩니다.
  useEffect(() => {
    if (!apiDataEnabled) return;
    void loadMRsFromApi(true);
  }, [loadMRsFromApi]);

  useEffect(() => {
    if (!apiDataEnabled) return;
    void loadItemsFromApi();
  }, [loadItemsFromApi]);

  useEffect(() => {
    if (!apiDataEnabled) return undefined;
    let disposed = false;
    let controller: AbortController | null = null;

    const connect = async () => {
      while (!disposed) {
        controller = new AbortController();
        try {
          await subscribeProcurementEvents(controller.signal, (event) => {
            showToast(event.title);
            void loadMRsFromApi(false);
          });
        } catch {
          // Initial list loading already exposes connection errors. SSE retries
          // quietly so a temporary proxy restart does not disturb the user.
        }
        if (!disposed) await new Promise((resolve) => window.setTimeout(resolve, 3000));
      }
    };

    void connect();
    return () => {
      disposed = true;
      controller?.abort();
    };
  }, [loadMRsFromApi, showToast]);

  // FastAPI BackgroundTasks에서 실행되는 AI 그래프는 시작 응답보다 늦게
  // 완료됩니다. QUEUED/RUNNING이 하나라도 있는 동안만 조용히 재조회하여
  // 성공·인터럽트·실패 상태를 놓치지 않고, 종료되면 폴링도 자동 중단합니다.
  const hasActiveWorkflow = requests.some((request) => (
    request.workflowStatus === 'QUEUED' || request.workflowStatus === 'RUNNING'
  ));
  useEffect(() => {
    if (!apiDataEnabled || !hasActiveWorkflow) return undefined;
    let disposed = false;
    let timer: number | undefined;
    const poll = async () => {
      await loadMRsFromApi(false, true);
      if (!disposed) timer = window.setTimeout(poll, 1800);
    };
    timer = window.setTimeout(poll, 1000);
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [hasActiveWorkflow, loadMRsFromApi]);

  useEffect(() => {
    window.localStorage.setItem('biddingflow.sidebar.collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const handleSelectSearchResult = (result: GlobalSearchResult) => {
    setCurrentTab(result.targetTab);
    setSearchQuery(result.searchValue);
  };

  const handleSelectNotification = (notification: ProcurementNotification) => {
    // 알림은 작업 화면으로 이동하는 일회성 inbox 항목입니다. 클릭 즉시
    // 화면에서 제거하고, API 모드에서는 PostgreSQL 행도 함께 삭제합니다.
    setNotifications((previous) => previous.filter((item) => item.id !== notification.id));
    setCurrentTab(notification.targetTab);
    setSearchQuery(
      notification.targetTab === 'item-register' || notification.targetTab === 'mr-list'
        ? notification.reference ?? ''
        : ''
    );
    if (apiDataEnabled) {
      void deleteProcurementNotification(notification.id).catch(async () => {
        // 낙관적 삭제가 서버에서 실패했으면 실제 inbox를 다시 읽어 화면과
        // DB가 서로 다른 상태로 남지 않게 합니다.
        try {
          setNotifications(await listProcurementNotifications());
        } catch {
          // 기존 목록 조회 오류 표시는 정규 로딩 경로에서 처리합니다.
        }
      });
    }
  };

  const handleDeleteAllNotifications = () => {
    setNotifications([]);
    if (apiDataEnabled) {
      void deleteAllProcurementNotifications().catch(async () => {
        try {
          setNotifications(await listProcurementNotifications());
        } catch {
          // 기존 목록 조회 오류 표시는 정규 로딩 경로에서 처리합니다.
        }
      });
    }
  };

  const handleCreateMaterialRequest = (request: MaterialRequest) => {
    setRequests((previous) => [request, ...previous]);
    setNewMRModalOpen(false);
    setCurrentTab('mr-list');
    setSearchQuery(request.mrNo);
    showToast(`${request.mrNo} 신규 MR이 등록되었습니다.`);
    pushNotification({
      title: '신규 MR이 등록되었습니다',
      detail: `${request.department} · ${request.itemName}`,
      targetTab: 'mr-list',
      reference: request.mrNo,
      tone: 'info',
    });
  };

  const handleAnswerWorkflowTask = async (
    taskId: string,
    answer: Record<string, unknown>,
    version?: number,
  ) => {
    await answerProcurementTask(taskId, answer, version);
    showToast('입력이 반영되었습니다. 다음 작업 단계를 확인합니다.');
    await loadMRsFromApi(false);
  };

  // Actions
  const handleApproveRequest = (id: string) => {
    const approvedRequest = requests.find((request) => request.id === id);
    if (!approvedRequest) return;

    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: '승인',
              returnedFromSupplier: false,
              returnReason: undefined,
              processStage: {
                ...r.processStage,
                approval: '완료',
                quotationProgressPercent: 100,
                prSupplierApproved: '대기',
                poCreated: false,
              },
            }
          : r
      )
    );

    setVendorGroups((previous) => {
      const existingGroup = previous.find((group) => group.mrNo === approvedRequest.mrNo);
      if (!existingGroup) return [createMockVendorGroup(approvedRequest), ...previous];
      if (!approvedRequest.returnedFromSupplier) return previous;

      return previous.map((group) => group.mrNo === approvedRequest.mrNo
        ? {
            ...group,
            selectedSupplierId: undefined,
            supplierApprovalStatus: undefined,
            prSent: false,
            prNo: undefined,
            quotations: group.quotations.map((quotation) => ({
              ...quotation,
              isSelected: false,
            })),
          }
        : group
      );
    });

    // 협력사 거절로 복귀한 과거 PR 행은 MR 재승인 시 활성 PO 목록에서 제거합니다.
    setPoItems((previous) => previous.filter((item) => (
      item.mrNo !== approvedRequest.mrNo || item.supplierApprovalStatus !== 'rejected'
    )));

    showToast('MR 승인과 AI 견적 처리가 완료되어 협력사 선정 단계로 이동했습니다.');
    pushNotification({
      title: '협력사 선정 준비가 완료되었습니다',
      detail: `${approvedRequest.mrNo} · AI 견적 분석 완료`,
      targetTab: 'vendor-select',
      reference: approvedRequest.mrNo,
      tone: 'success',
    });
  };

  // 대체품 확인 프로세스 시작: 대체품 후보 존재 여부에 따라 안내대기/미사용확정 단계로 분기
  const handleStartSubstituteCheck = async (id: string) => {
    const target = requests.find((request) => request.id === id);
    if (!target) return;

    if (apiDataEnabled) {
      try {
        await startProcurementCase(id);
        setRequests((previous) => previous.map((request) => request.id === id
          ? { ...request, workflowStatus: 'QUEUED', workflowStage: 'ITEM_CHECK' }
          : request
        ));
        showToast(`${target.mrNo} 구매 처리를 시작했습니다. AI가 대체품과 구매 경로를 확인합니다.`);
        window.setTimeout(() => void loadMRsFromApi(false), 1200);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'MR 시작 요청에 실패했습니다.');
      }
      return;
    }

    setRequests((previous) =>
      previous.map((request) =>
        request.id === id
          ? {
              ...request,
              substituteStage: request.hasSubstituteCandidates ? 'notified_waiting' : 'not_used_confirmed',
            }
          : request
      )
    );

    showToast(
      target.hasSubstituteCandidates
        ? `${target.mrNo} 건의 대체품 후보를 요청부서에 안내했습니다. 응답 대기 중입니다.`
        : `${target.mrNo} 건은 대체품 후보가 없어 신규구매로 진행합니다.`
    );
  };

  // 요청자가 ERP에서 대체품을 직접 선택한 경우: MR은 더 이상 필요 없으므로 자동 삭제
  const handleSubstituteSelectedInErp = (id: string) => {
    const target = requests.find((request) => request.id === id);
    if (!target) return;

    setRequests((previous) => previous.filter((request) => request.id !== id));
    showToast(`${target.mrNo} 건은 요청자가 ERP에서 대체품을 선택하여 MR이 자동 삭제되었습니다.`);
  };

  // 대체품 후보가 있어도 신규구매를 진행하기로 확정한 경우
  const handleConfirmSubstituteUnused = (id: string) => {
    const target = requests.find((request) => request.id === id);
    if (!target) return;

    setRequests((previous) =>
      previous.map((request) =>
        request.id === id ? { ...request, substituteStage: 'not_used_confirmed' } : request
      )
    );
    showToast(`${target.mrNo} 건은 대체품 미사용으로 확정되었습니다. MR을 Submit해주세요.`);
  };

  const handleConfirmReject = async (reason: string) => {
    if (!rejectingItem) return;

    if (apiDataEnabled) {
      try {
        await rejectProcurementCase(rejectingItem.id, reason);
        setRequests((previous) => previous.map((request) => request.id === rejectingItem.id
          ? {
              ...request,
              status: '반려' as const,
              rejectReason: reason,
              workflowStatus: 'CANCELLED',
              workflowStage: 'CANCELLED',
            }
          : request
        ));
        showToast(`${rejectingItem.mrNo} 건이 반려되었습니다.`);
        setRejectingItem(null);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'MR 반려 요청에 실패했습니다.');
      }
      return;
    }
    setRequests((prev) =>
      prev.map((r) =>
        r.id === rejectingItem.id
          ? (() => {
              const nextRound = (r.revisionRound ?? 0) + 1;
              return {
                ...r,
                status: '반려' as const,
                rejectReason: reason,
                revisionRound: nextRound,
                reviewHistory: [
                  ...(r.reviewHistory ?? []),
                  {
                    id: `${r.id}-buyer-rejection-${Date.now()}`,
                    round: nextRound,
                    type: 'buyer_rejection' as const,
                    reason,
                    source: '구매 담당자',
                    occurredAt: new Date().toLocaleString('ko-KR', { hour12: false }),
                  },
                ],
              };
            })()
          : r
      )
    );
    setRejectingItem(null);
    showToast(`${rejectingItem.mrNo} 건이 반려되었습니다.`);
  };

  const handleApproveItem = (id: string) => {
    const approvedItem = items.find((item) => item.id === id);
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: '승인' } : i))
    );
    showToast('아이템 코드 승인이 완료되었습니다.');
    if (approvedItem) {
      pushNotification({
        title: '아이템 코드 승인이 완료되었습니다',
        detail: `${approvedItem.itemCode} · ${approvedItem.itemName}`,
        targetTab: 'item-register',
        reference: approvedItem.itemCode,
        tone: 'success',
      });
    }
  };

  const handleRejectItem = (id: string, reason: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: '반려', rejectReason: reason } : i))
    );
    showToast('아이템 코드 등록이 반려되었습니다.');
  };

  const handleExtendDeadline = async (groupId: string, newDate: string, newTime: string) => {
    const target = vendorGroups.find((group) => group.id === groupId);
    if (apiDataEnabled) {
      if (!target?.backendCaseId) {
        showToast('실제 구매 작업 ID를 찾지 못해 마감일을 변경할 수 없습니다. 목록을 새로고침해 주세요.');
        return false;
      }
      try {
        await extendQuotationDeadline(
          target.backendCaseId,
          `${newDate}T${newTime}:00+09:00`,
        );
        showToast(`마감시간이 ${newDate} ${newTime}까지 연장되었습니다. 메일은 재발송하지 않았습니다.`);
        await loadMRsFromApi(false);
        return true;
      } catch (error) {
        showToast(error instanceof Error ? error.message : '마감 연장에 실패했습니다.');
        return false;
      }
    }
    setVendorGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              deadlineDate: newDate,
              deadlineTime: newTime,
              deadlineDDay: Math.max(1, Math.ceil((new Date(newDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))),
              isExtended: true,
              rfqSent: true,
            }
          : g
      )
    );
    showToast(`마감시간이 ${newDate} ${newTime}까지 연장되었습니다.`);
    return true;
  };

  const handleSendRFQ = async (
    groupId: string,
    supplierIds: string[],
    supplierEmails: Record<string, string>,
    deadlineDate: string,
    deadlineTime: string,
  ) => {
    const group = vendorGroups.find((entry) => entry.id === groupId);
    if (!group) return false;
    if (apiDataEnabled) {
      if (!group.pendingTaskId || group.workflowStage !== 'RFQ_TARGET_SELECTION') {
        showToast('현재 단계에 처리 가능한 RFQ 대상 선택 작업이 없습니다. 목록을 새로고침해 주세요.');
        return false;
      }
      const selected = supplierIds.map((supplierId) => {
        const quotation = group.quotations.find((item) => item.supplierId === supplierId);
        return {
          name: quotation?.supplierName ?? supplierId,
          email: supplierEmails[supplierId]?.trim() ?? quotation?.email ?? '',
        };
      });
      try {
        await answerProcurementTask(group.pendingTaskId, {
          suppliers: selected.map((supplier) => supplier.name),
          supplier_updates: selected,
          quotation_deadline: `${deadlineDate}T${deadlineTime}:00+09:00`,
        }, group.pendingTask?.version);
        showToast(`${selected.length}개 협력사로 RFQ 생성 및 발송을 시작했습니다.`);
        await loadMRsFromApi(false);
        return true;
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'RFQ 발송에 실패했습니다.');
        return false;
      }
    }
    return handleExtendDeadline(groupId, deadlineDate, deadlineTime);
  };

  const handleCheckQuotations = async (groupId: string) => {
    const group = vendorGroups.find((entry) => entry.id === groupId);
    if (!apiDataEnabled || !group?.pendingTaskId) return;
    try {
      await answerProcurementTask(
        group.pendingTaskId,
        { decision: 'check' },
        group.pendingTask?.version,
      );
      showToast(`${group.mrNo} 견적 회신 현황을 새로 확인했습니다.`);
      await loadMRsFromApi(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '견적 회신 확인에 실패했습니다.');
    }
  };

  const handleOpenSpecByItemCode = async (
    itemCode: string,
    requestSpecificationOverride?: string,
  ) => {
    const found = items.find((i) => i.itemCode === itemCode);
    const request = requests.find((entry) => entry.itemCode === itemCode);
    const resolvedRequestSpecification = (
      requestSpecificationOverride ?? request?.fullSpecText
    )?.trim();
    const fallback: Item = found ?? {
      id: `mr-item-${itemCode}`,
      itemCode,
      department: request?.department ?? '요청부서 미지정',
      itemName: request?.itemName ?? itemCode,
      specSummary: resolvedRequestSpecification ?? request?.specSummary ?? '규격 정보 없음',
      specifications: [],
      fullSpec: {
        dimensions: resolvedRequestSpecification ?? '-',
        material: '-',
        operatingTemp: '-',
        pressureRating: '-',
        manufacturer: '-',
        notes: resolvedRequestSpecification ?? '-',
      },
      maintainStock: false,
      isFixedAsset: false,
      attributes: {
        heatResistant: false,
        highPressure: false,
        isoCertified: false,
        waterproof: false,
        customizable: false,
      },
      registeredDate: '',
      status: '승인대기',
    };
    const hasResolvedRequestSpecification = Boolean(
      resolvedRequestSpecification
      && resolvedRequestSpecification !== '규격 정보 없음',
    );
    const fallbackForModal: Item = hasResolvedRequestSpecification ? {
      ...fallback,
      specSummary: resolvedRequestSpecification!,
      specifications: [
        {
          key: 'mr_request_specification',
          label: 'MR 요청 규격',
          value: resolvedRequestSpecification!,
          group: '요청 규격',
          order: 0,
          required: true,
          source: 'erpnext',
        },
        ...(fallback.specifications ?? []),
      ],
    } : fallback;

    if (apiDataEnabled) {
      try {
        // Fetch directly by code even when this item is outside list pagination.
        const detailed = await getERPItemSpecifications(fallback);
        setItems((previous) => previous.map((item) => (
          item.itemCode === detailed.itemCode ? detailed : item
        )));
        // MR 목록/대시보드에서 연 모달은 클릭한 행의 규격을 우선합니다.
        // 같은 품목코드가 여러 MR에 쓰여도 다른 MR의 규격을 잘못 보여주지 않습니다.
        const requestSpecification = resolvedRequestSpecification;
        const hasRequestSpecification = Boolean(
          requestSpecification && requestSpecification !== '규격 정보 없음',
        );
        const normalizedRequestSpecification = hasRequestSpecification
          ? normalizeSpecificationText(requestSpecification!)
          : '';
        const itemSpecificationFields = detailed.specifications ?? [];
        const hasSameItemDescription = itemSpecificationFields.some((field) => (
          typeof field.value === 'string'
          && normalizeSpecificationText(field.value) === normalizedRequestSpecification
        ));

        // MR 행에서 연 모달은 Item 마스터보다 해당 MR의 요청 규격을 우선합니다.
        // 동일한 Item 설명은 중복 노출하지 않고, 다른 커스텀 규격은 아래에 유지합니다.
        const modalItem: Item = hasRequestSpecification ? {
          ...detailed,
          specSummary: requestSpecification!,
          specifications: [
            {
              key: 'mr_request_specification',
              label: 'MR 요청 규격',
              value: requestSpecification!,
              group: '요청 규격',
              order: 0,
              required: true,
              source: 'erpnext',
            },
            ...itemSpecificationFields.filter((field) => (
              !hasSameItemDescription
              || typeof field.value !== 'string'
              || normalizeSpecificationText(field.value) !== normalizedRequestSpecification
            )),
          ],
        } : detailed;
        setActiveSpecItem(modalItem);
      } catch (error) {
        showToast(error instanceof Error ? error.message : '아이템 규격을 불러오지 못했습니다.');
        // Item 상세 API가 잠시 실패해도 MR에 저장된 요청 규격은 열람할 수 있습니다.
        setActiveSpecItem(fallbackForModal);
      }
    } else {
      setActiveSpecItem(fallbackForModal);
    }
  };

  const handleAddItem = (newItem: Item) => {
    setItems((prev) => [newItem, ...prev]);
    showToast(`신규 아이템 [${newItem.itemCode}] ${newItem.itemName}이(가) 등록되었습니다.`);
    pushNotification({
      title: '신규 아이템 코드가 등록되었습니다',
      detail: `${newItem.itemCode} · 승인 검토가 필요합니다`,
      targetTab: 'item-register',
      reference: newItem.itemCode,
      tone: 'warning',
    });
  };

  const handleSelectSupplier = async (groupId: string, supplierId: string) => {
    const selectedGroup = vendorGroups.find((group) => group.id === groupId);
    const selectedSupplier = selectedGroup?.quotations.find((quotation) => quotation.supplierId === supplierId);
    if (!selectedGroup || !selectedSupplier) return false;

    if (apiDataEnabled) {
      if (
        !selectedGroup.pendingTaskId
        || !['QUOTATION_COLLECTION', 'SUPPLIER_SELECTION'].includes(selectedGroup.workflowStage ?? '')
      ) {
        showToast('현재 단계에 처리 가능한 협력사 선정 작업이 없습니다. 목록을 새로고침해 주세요.');
        return false;
      }
      if (!selectedSupplier.isResponded) {
        showToast('견적을 회신한 협력사만 최종 선정할 수 있습니다.');
        return false;
      }
      try {
        await answerProcurementTask(
          selectedGroup.pendingTaskId,
          selectedGroup.workflowStage === 'QUOTATION_COLLECTION'
            ? { decision: 'finalize', supplier: selectedSupplier.supplierName }
            : { supplier: selectedSupplier.supplierName },
          selectedGroup.pendingTask?.version,
        );
        showToast(`${selectedSupplier.supplierName}이(가) 최종 업체로 선정되었습니다. 발주 시작 전 상태입니다.`);
        await loadMRsFromApi(false);
        return true;
      } catch (error) {
        showToast(error instanceof Error ? error.message : '협력사 선정에 실패했습니다.');
        return false;
      }
    }

    // 선정 단계에서는 협력사만 확정하고, 발주 시작과 PO 최종 승인은 분리합니다.
    setVendorGroups((previous) => previous.map((group) => (
      group.id === groupId
        ? {
            ...group,
            selectedSupplierId: supplierId,
            quotations: group.quotations.map((quotation) => ({
              ...quotation,
              isSelected: quotation.supplierId === supplierId,
            })),
          }
        : group
    )));

    showToast(`${selectedSupplier.supplierName}이(가) 최종 업체로 선정되었습니다. '발주 시작'을 눌러주세요.`);
    return true;
  };

  const handleSendPO = async (groupId: string) => {
    const selectedGroup = vendorGroups.find((group) => group.id === groupId);
    const supplierId = selectedGroup?.selectedSupplierId;
    const selectedSupplier = selectedGroup?.quotations.find((quotation) => quotation.supplierId === supplierId);
    if (!selectedGroup || !supplierId || !selectedSupplier) return;

    if (apiDataEnabled) {
      if (!selectedGroup.pendingTaskId || selectedGroup.workflowStage !== 'ORDER_START') {
        showToast('현재 단계에 처리 가능한 발주 시작 작업이 없습니다. 목록을 새로고침해 주세요.');
        return;
      }
      try {
        await answerProcurementTask(
          selectedGroup.pendingTaskId,
          { decision: 'start_order' },
          selectedGroup.pendingTask?.version,
        );
        setVendorGroups((previous) => previous.map((group) => group.id === groupId
          ? { ...group, prSent: true, orderStarted: true }
          : group
        ));
        showToast(`${selectedGroup.mrNo} 발주를 시작했습니다. PO 관리에서 최종 승인을 진행해주세요.`);
        pushNotification({
          title: 'PO 발송 전 최종 승인이 필요합니다',
          detail: `${selectedGroup.mrNo} · ${selectedSupplier.supplierName}`,
          targetTab: 'po-manage',
          reference: selectedGroup.mrNo,
          tone: 'warning',
        });
        await loadMRsFromApi(false);
      } catch (error) {
        showToast(error instanceof Error ? error.message : '발주 시작에 실패했습니다.');
      }
      return;
    }

    const poItemId = `PO-ITEM-${selectedGroup.id}-${supplierId}`;

    // PR/협력사 승인 대기 레코드는 만들지 않는다. 발주 시작과 동시에 협력사
    // 선정 목록에서 빠지고 PO 관리의 사람 최종 승인 대기 건으로 이동한다.
    setVendorGroups((previous) => previous.map((group) => (
      group.id === groupId
        ? {
            ...group,
            prSent: true,
            orderStarted: true,
          }
        : group
    )));

    setPoItems((previous) => {
      const nextPOItem: POItem = {
        id: poItemId,
        prNo: '발주 승인 대기',
        mrNo: selectedGroup.mrNo,
        itemName: selectedGroup.itemName,
        itemCode: selectedGroup.itemCode,
        department: selectedGroup.department,
        selectedSupplier: selectedSupplier.supplierName,
        totalAmount: selectedSupplier.quoteTotalPrice,
        dueDate: selectedGroup.targetDueDate,
        supplierApprovalStatus: 'approved',
        approvalStatus: 'pending',
        poCreated: false,
        promisedDeliveryDate: selectedGroup.targetDueDate,
        deliveryStatus: 'NOT_RECEIVED',
      };
      const existingIndex = previous.findIndex((item) => item.mrNo === selectedGroup.mrNo);
      if (existingIndex < 0) return [nextPOItem, ...previous];
      return previous.map((item, index) => index === existingIndex ? { ...item, ...nextPOItem } : item);
    });

    showToast('발주를 시작했습니다. PO 관리에서 발송 전 최종 승인을 진행해주세요.');
    pushNotification({
      title: 'PO 발송 전 최종 승인이 필요합니다',
      detail: `${selectedGroup.mrNo} · ${selectedSupplier.supplierName}`,
      targetTab: 'po-manage',
      reference: selectedGroup.mrNo,
      tone: 'warning',
    });
  };

  const handleWithdrawSupplierSelection = (groupId: string, reason: string) => {
    const targetGroup = vendorGroups.find((group) => group.id === groupId);
    if (
      !targetGroup?.selectedSupplierId
      || targetGroup.supplierApprovalStatus !== 'pending'
    ) return;

    const selectedSupplier = targetGroup.quotations.find(
      (quotation) => quotation.supplierId === targetGroup.selectedSupplierId
    );
    const withdrawnAt = new Date().toLocaleString('ko-KR', { hour12: false });

    setVendorGroups((previous) => previous.map((group) => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        selectedSupplierId: undefined,
        supplierApprovalStatus: undefined,
        prSent: false,
        prNo: undefined,
        quotations: group.quotations.map((quotation) => ({
          ...quotation,
          isSelected: false,
        })),
        selectionHistory: (group.selectionHistory ?? []).map((entry) => (
          entry.status === 'pending' && entry.supplierId === targetGroup.selectedSupplierId
            ? { ...entry, status: 'withdrawn' as const, withdrawnAt, withdrawalReason: reason }
            : entry
        )),
      };
    }));

    // 아직 PO가 발행되지 않은 대기 레코드만 활성 목록에서 제거합니다.
    // 선정·철회 감사 이력은 VendorSelectionGroup.selectionHistory에 남습니다.
    setPoItems((previous) => previous.filter((item) => (
      item.mrNo !== targetGroup.mrNo || item.poCreated
    )));
    setRequests((previous) => previous.map((request) => (
      request.mrNo === targetGroup.mrNo
        ? {
            ...request,
            processStage: { ...request.processStage, prSupplierApproved: '대기' as const },
          }
        : request
    )));

    showToast(`${selectedSupplier?.supplierName ?? '기존 협력사'} 요청을 철회했습니다. 새 업체를 선정해 주세요.`);
    pushNotification({
      title: '협력사 선정 변경이 시작되었습니다',
      detail: `${targetGroup.mrNo} · 기존 PR 철회 완료`,
      targetTab: 'vendor-select',
      reference: targetGroup.mrNo,
      tone: 'warning',
    });
  };

  const handleCreatePO = async (poId: string) => {
    const targetPO = poItems.find((item) => item.id === poId);
    if (!targetPO) return;

    if (apiDataEnabled) {
      if (!targetPO.pendingTaskId || targetPO.pendingTask?.taskType !== 'po_approval') {
        showToast('현재 단계에 처리 가능한 PO 승인 작업이 없습니다. 목록을 새로고침해 주세요.');
        return;
      }
      try {
        await answerProcurementTask(
          targetPO.pendingTaskId,
          { decision: 'approve' },
          targetPO.pendingTask?.version,
        );
        showToast('최종 승인이 완료되어 PO를 생성하고 발송했습니다. 입고를 기다립니다.');
        await loadMRsFromApi(false);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'PO 승인 및 발송에 실패했습니다.');
      }
      return;
    }

    setPoItems((previous) => previous.map((item) => item.id === poId
      ? {
          ...item,
          approvalStatus: 'approved' as const,
          poCreated: true,
          poNo: `PO-2025-00${Math.floor(Math.random() * 90 + 10)}`,
          createdDate: new Date().toLocaleString('ko-KR', { hour12: false }),
        }
      : item
    ));
    setRequests((previous) => previous.map((request) => request.mrNo === targetPO.mrNo
      ? { ...request, processStage: { ...request.processStage, poCreated: true } }
      : request
    ));
    showToast('PO 생성 및 결재 권자 승인이 최종 승인되었습니다.');
    pushNotification({
      title: 'PO 생성과 발송이 완료되었습니다',
      detail: `${targetPO.mrNo} · ${targetPO.selectedSupplier}`,
      targetTab: 'po-manage',
      reference: targetPO.mrNo,
      tone: 'success',
    });
  };

  const handleReturnToMR = (poId: string) => {
    const rejectedPO = poItems.find((item) => item.id === poId);
    if (!rejectedPO) return;

    setRequests((previous) => previous.map((request) => {
      if (request.mrNo !== rejectedPO.mrNo) return request;

      const isNewReturn = !request.returnedFromSupplier;
      const nextRound = isNewReturn
        ? (request.revisionRound ?? 0) + 1
        : (request.revisionRound ?? 1);

      return {
        ...request,
        status: '승인대기',
        rejectReason: undefined,
        revisionRound: nextRound,
        returnedFromSupplier: true,
        returnReason: rejectedPO.rejectReason ?? '협력사가 PR 승인을 거절하여 MR 재검토가 필요합니다.',
        reviewHistory: isNewReturn
          ? [
              ...(request.reviewHistory ?? []),
              {
                id: `${request.id}-supplier-return-${Date.now()}`,
                round: nextRound,
                type: 'supplier_return' as const,
                reason: rejectedPO.rejectReason ?? '협력사가 PR 승인을 거절하여 MR 재검토가 필요합니다.',
                source: rejectedPO.selectedSupplier,
                occurredAt: new Date().toLocaleString('ko-KR', { hour12: false }),
              },
            ]
          : request.reviewHistory,
        processStage: {
          approval: '진행중',
          quotationProgressPercent: 0,
          prSupplierApproved: '거절',
          poCreated: false,
        },
      };
    }));

    setCurrentTab('mr-list');
    setSearchQuery(rejectedPO.mrNo);
    showToast(`${rejectedPO.mrNo} 건이 MR 재검토로 이동되었습니다.`);
    pushNotification({
      title: '협력사 거절로 MR 재검토가 필요합니다',
      detail: `${rejectedPO.mrNo} · ${rejectedPO.selectedSupplier}`,
      targetTab: 'mr-list',
      reference: rejectedPO.mrNo,
      tone: 'danger',
    });
  };

  // 발주 물품 도착 확인 처리
  const handleMarkPOArrived = (poId: string) => {
    const targetPO = poItems.find((item) => item.id === poId);
    if (!targetPO) return;

    setPoItems((previous) => previous.map((item) => item.id === poId
      ? {
          ...item,
          arrived: true,
          deliveryStatus: 'FULL' as const,
          receivedQty: item.orderedQty ?? 1,
          arrivedDate: new Date().toLocaleString('ko-KR', { hour12: false }),
          fullReceiptDate: new Date().toISOString().slice(0, 10),
        }
      : item
    ));
    showToast(`${targetPO.poNo} 도착이 확인되었습니다. Supplier Scorecard를 작성해 주세요.`);
  };

  // Supplier Scorecard 평가 제출 -> 해당 PO 건 발주 프로세스 종료
  const handleSubmitScorecard = async (poId: string, scores: SupplierScores) => {
    const targetPO = poItems.find((item) => item.id === poId);
    if (!targetPO) return;

    if (apiDataEnabled) {
      if (!targetPO.pendingTaskId || targetPO.pendingTask?.taskType !== 'supplier_scorecard') {
        showToast('현재 단계에 처리 가능한 Supplier Scorecard 작업이 없습니다. 목록을 새로고침해 주세요.');
        return;
      }
      try {
        await answerProcurementTask(
          targetPO.pendingTaskId,
          { ...scores },
          targetPO.pendingTask?.version,
        );
        showToast(`${targetPO.poNo} 건의 Supplier Scorecard 평가가 완료되었습니다.`);
        await loadMRsFromApi(false);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Scorecard 저장에 실패했습니다.');
      }
      return;
    }

    setPoItems((previous) => previous.map((item) => item.id === poId
      ? { ...item, scorecardScores: scores, scorecardCompleted: true }
      : item
    ));
    showToast(`${targetPO.poNo} 건의 Supplier Scorecard 평가가 완료되어 발주 프로세스가 종료되었습니다.`);
  };

  const pendingCount = mrQueueRequests.filter((request) => request.status === '승인대기').length;
  const stageTaskCounts = {
    mr: stageItemIds.mr.filter((id) => !seenStageItemIds.mr.includes(id)).length,
    vendor: stageItemIds.vendor.filter((id) => !seenStageItemIds.vendor.includes(id)).length,
    po: stageItemIds.po.filter((id) => !seenStageItemIds.po.includes(id)).length,
  };

  return (
    <div className="procurement-shell">
      {/* 1. 왼쪽 사이드바 */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        pendingCount={pendingCount}
        stageTaskCounts={stageTaskCounts}
        flashingStages={flashingStages}
        currentUser={currentUser}
        onLogout={onLogout}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />

      {/* Main Content Area */}
      <div className="main-wrapper">
        {/* Header */}
        <Header
          currentTab={currentTab}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchResults={searchResults}
          notifications={notifications}
          onSelectSearchResult={handleSelectSearchResult}
          onSelectNotification={handleSelectNotification}
          onMarkAllNotificationsRead={handleDeleteAllNotifications}
          onOpenNewMRModal={() => setNewMRModalOpen(true)}
        />

        {/* Content Body (Full Width) */}
        <div className="content-body">
          <main className="view-content">
            {/* Screen 2: 대시보드 */}
            {currentTab === 'dashboard' && (
              <DashboardView
                requests={dashboardRequests}
                poItems={activePOItems}
                onApprove={apiDataEnabled ? handleStartSubstituteCheck : handleApproveRequest}
                onOpenRejectModal={(id, mrNo) => setRejectingItem({ id, mrNo })}
                onOpenSpecModal={handleOpenSpecByItemCode}
                setCurrentTab={setCurrentTab}
              />
            )}

            {/* Screen 3: 아이템 등록 */}
            {currentTab === 'item-register' && (
              <ItemRegistrationView
                items={items}
                searchQuery={searchQuery}
                onOpenSpecModal={(item) => void handleOpenSpecByItemCode(item.itemCode)}
                onAddItem={handleAddItem}
                onApproveItem={handleApproveItem}
                onRejectItem={handleRejectItem}
                readOnly={apiDataEnabled}
                isLoading={itemApiLoading}
                loadError={itemApiError}
                onRefresh={() => void loadItemsFromApi()}
              />
            )}

            {/* Screen 4: MR 목록 */}
            {currentTab === 'mr-list' && (
              <MRListView
                requests={animatedMRQueueRequests}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onOpenSpecModalByItemCode={handleOpenSpecByItemCode}
                onApprove={handleApproveRequest}
                onOpenRejectModal={(id, mrNo) => setRejectingItem({ id, mrNo })}
                onOpenAttachmentsModal={(files) => setActiveAttachmentFiles(files)}
                onStartSubstituteCheck={handleStartSubstituteCheck}
                onSubstituteSelectedInErp={handleSubstituteSelectedInErp}
                onConfirmSubstituteUnused={handleConfirmSubstituteUnused}
                isApiMode={apiDataEnabled}
                isLoading={mrApiLoading}
                loadError={mrApiError}
                onRefresh={() => void loadMRsFromApi(false)}
                onAnswerTask={handleAnswerWorkflowTask}
              />
            )}

            {/* Screen 5: 협력사 선정 */}
            {currentTab === 'vendor-select' && (
              <VendorSelectionView
                vendorGroups={animatedVendorGroups}
                requests={uniqueRequests}
                onSelectSupplier={handleSelectSupplier}
                onSendPO={handleSendPO}
                onWithdrawSupplierSelection={handleWithdrawSupplierSelection}
                onOpenSpecModalByItemCode={handleOpenSpecByItemCode}
                onExtendDeadline={handleExtendDeadline}
                onSendRFQ={handleSendRFQ}
                onCheckQuotations={handleCheckQuotations}
              />
            )}

            {/* Screen 6: PO 관리 */}
            {currentTab === 'po-manage' && (
              <POManagementView
                poItems={animatedPOItems}
                onCreatePO={handleCreatePO}
                onReturnToMR={handleReturnToMR}
                onMarkArrived={handleMarkPOArrived}
                onSubmitScorecard={handleSubmitScorecard}
                isApiMode={apiDataEnabled}
              />
            )}
          </main>
        </div>
      </div>

      {/* 규격 전체 보기 Modal */}
      <SpecModal
        item={activeSpecItem}
        onClose={() => setActiveSpecItem(null)}
      />

      {/* 반려 사유 작성 Modal */}
      {rejectingItem && (
        <RejectReasonModal
          title="MR 요청 반려"
          itemNo={rejectingItem.mrNo}
          onConfirm={handleConfirmReject}
          onClose={() => setRejectingItem(null)}
        />
      )}

      {newMRModalOpen && (
        <NewMRModal
          items={items}
          onCreate={handleCreateMaterialRequest}
          onClose={() => setNewMRModalOpen(false)}
        />
      )}

      {/* Attachment View Modal */}
      {activeAttachmentFiles && (
        <div className="modal-overlay" onClick={() => setActiveAttachmentFiles(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '450px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Paperclip size={20} color="var(--primary)" />
                <h3>MR 첨부파일 목록 ({activeAttachmentFiles.length}개)</h3>
              </div>
              <button className="icon-btn" onClick={() => setActiveAttachmentFiles(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activeAttachmentFiles.map((file, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '13px',
                    color: 'var(--text-main)'
                  }}
                >
                  <span>📄 {file}</span>
                  <button className="btn-sm btn-outline">다운로드</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Popup */}
      {toastMessage && (
        <div className="toast-container">
          <div className="toast">
            <span>✨ {toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export const ProcurementWorkspace = memo(ProcurementWorkspaceComponent);
ProcurementWorkspace.displayName = 'ProcurementWorkspace';

export default ProcurementWorkspace;
