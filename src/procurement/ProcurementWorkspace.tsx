import { memo, useEffect, useMemo, useState } from 'react';
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

import './ProcurementWorkspace.css';
import { Paperclip, X } from 'lucide-react';

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
    title: '아이템 등록',
    detail: 'ERPNext 아이템 속성과 규격을 검토하고 승인 또는 반려합니다.',
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
    detail: 'PR 승인 결과를 확인하고 승인된 건의 PO 생성을 진행합니다.',
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

  // Domain State
  const [items, setItems] = useState<Item[]>(initialItems);
  const [requests, setRequests] = useState<MaterialRequest[]>(initialMaterialRequests);
  const [vendorGroups, setVendorGroups] = useState<VendorSelectionGroup[]>(initialVendorGroups);
  const [poItems, setPoItems] = useState<POItem[]>(initialPOItems);
  const [notifications, setNotifications] = useState<ProcurementNotification[]>(initialNotifications);

  // Modals state
  const [activeSpecItem, setActiveSpecItem] = useState<Item | null>(null);
  const [rejectingItem, setRejectingItem] = useState<{ id: string; mrNo: string } | null>(null);
  const [activeAttachmentFiles, setActiveAttachmentFiles] = useState<string[] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [newMRModalOpen, setNewMRModalOpen] = useState(false);
  const uniqueRequests = useMemo(() => uniqueByMrNo(requests), [requests]);
  const mrQueueRequests = useMemo(
    () => uniqueRequests.filter((request) => request.status !== '승인'),
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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

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

  const handleSelectSearchResult = (result: GlobalSearchResult) => {
    setCurrentTab(result.targetTab);
    setSearchQuery(result.searchValue);
  };

  const handleSelectNotification = (notification: ProcurementNotification) => {
    setNotifications((previous) => previous.map((item) => (
      item.id === notification.id ? { ...item, unread: false } : item
    )));
    setCurrentTab(notification.targetTab);
    setSearchQuery(
      notification.targetTab === 'item-register' || notification.targetTab === 'mr-list'
        ? notification.reference ?? ''
        : ''
    );
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

  const handleConfirmReject = (reason: string) => {
    if (!rejectingItem) return;
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

  const handleExtendDeadline = (groupId: string, newDate: string, newTime: string) => {
    setVendorGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              deadlineDate: newDate,
              deadlineTime: newTime,
              deadlineDDay: Math.max(1, Math.ceil((new Date(newDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))),
              isExtended: true,
            }
          : g
      )
    );
    showToast(`마감시간이 ${newDate} ${newTime}까지 연장되었습니다. 미회신 업체에 메일이 재발송되었습니다. 📧`);
  };

  const handleOpenSpecByItemCode = (itemCode: string) => {
    const found = items.find((i) => i.itemCode === itemCode);
    if (found) {
      setActiveSpecItem(found);
    } else {
      setActiveSpecItem({
        id: 'virtual',
        itemCode,
        department: '구매팀',
        itemName: '품목 규격 정보',
        specSummary: 'stroke 300mm / 210bar 정격 / 바이톤 씰',
        fullSpec: {
          dimensions: '표준 규격 치수',
          material: 'SCM440 합금강 (특수 열처리)',
          operatingTemp: '-20°C ~ 180°C',
          pressureRating: '210 bar 고압용',
          manufacturer: 'ISO 9001 승인 브랜드',
          notes: '도면 및 성적서 첨부 완료됨',
        },
        maintainStock: true,
        isFixedAsset: false,
        attributes: { heatResistant: true, highPressure: true, isoCertified: true, waterproof: false, customizable: false },
        registeredDate: '2025-01-01',
        status: '승인대기',
      });
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

  const handleSelectSupplier = (groupId: string, supplierId: string) => {
    const selectedGroup = vendorGroups.find((group) => group.id === groupId);
    const selectedSupplier = selectedGroup?.quotations.find((quotation) => quotation.supplierId === supplierId);
    if (!selectedGroup || !selectedSupplier) return;

    const prNo = `PR-2025-${selectedGroup.mrNo.split('-')[2] || '0890'}`;
    const poItemId = `PO-ITEM-${selectedGroup.id}-${supplierId}`;
    const selectionRound = (selectedGroup.selectionRound ?? (selectedGroup.selectedSupplierId ? 1 : 0)) + 1;

    // React state updater는 순수하게 유지합니다. 각 도메인 상태는 이벤트에서 한 번씩만 갱신합니다.
    setVendorGroups((previous) => previous.map((group) => (
      group.id === groupId
        ? {
            ...group,
            selectedSupplierId: supplierId,
            supplierApprovalStatus: 'pending' as const,
            selectionRound,
            selectionHistory: [
              ...(group.selectionHistory ?? []),
              {
                id: `${group.id}-selection-${selectionRound}-${Date.now()}`,
                round: selectionRound,
                supplierId,
                supplierName: selectedSupplier.supplierName,
                prNo,
                status: 'pending' as const,
                selectedAt: new Date().toLocaleString('ko-KR', { hour12: false }),
              },
            ],
            prSent: true,
            prNo,
            quotations: group.quotations.map((quotation) => ({
              ...quotation,
              isSelected: quotation.supplierId === supplierId,
            })),
          }
        : group
    )));

    setPoItems((previous) => {
      const nextPOItem: POItem = {
        id: poItemId,
        prNo,
        mrNo: selectedGroup.mrNo,
        itemName: selectedGroup.itemName,
        itemCode: selectedGroup.itemCode,
        department: selectedGroup.department,
        selectedSupplier: selectedSupplier.supplierName,
        totalAmount: selectedSupplier.quoteTotalPrice,
        dueDate: selectedGroup.targetDueDate,
        supplierApprovalStatus: 'pending',
        poCreated: false,
      };
      const existingIndex = previous.findIndex((item) => item.mrNo === selectedGroup.mrNo);
      if (existingIndex < 0) return [nextPOItem, ...previous];
      return previous.map((item, index) => index === existingIndex ? { ...item, ...nextPOItem } : item);
    });

    setRequests((previous) => previous.map((request) => (
      request.mrNo === selectedGroup.mrNo
        ? {
            ...request,
            returnedFromSupplier: false,
            returnReason: undefined,
            processStage: { ...request.processStage, prSupplierApproved: '대기' },
          }
        : request
    )));

    showToast('업체 선정이 완료되어 PR이 ERPNext로 자동 전송되었습니다.');
    pushNotification({
      title: '협력사 선정과 PR 전송이 완료되었습니다',
      detail: `${selectedGroup.mrNo} · 협력사 승인 대기`,
      targetTab: 'po-manage',
      reference: selectedGroup.mrNo,
      tone: 'success',
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

  const handleCreatePO = (poId: string) => {
    const targetPO = poItems.find((item) => item.id === poId);
    if (!targetPO) return;

    setPoItems((previous) => previous.map((item) => item.id === poId
      ? {
          ...item,
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

  const pendingCount = uniqueRequests.filter((request) => request.status === '승인대기').length;

  return (
    <div className="procurement-shell">
      {/* 1. 왼쪽 사이드바 */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        pendingCount={pendingCount}
        currentUser={currentUser}
        onLogout={onLogout}
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
          onMarkAllNotificationsRead={() => setNotifications((previous) => (
            previous.map((notification) => ({ ...notification, unread: false }))
          ))}
          onOpenNewMRModal={() => setNewMRModalOpen(true)}
        />

        {/* Content Body (Full Width) */}
        <div className="content-body">
          <main className="view-content">
            {/* Screen 2: 대시보드 */}
            {currentTab === 'dashboard' && (
              <DashboardView
                requests={uniqueRequests}
                onApprove={handleApproveRequest}
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
                onOpenSpecModal={setActiveSpecItem}
                onAddItem={handleAddItem}
                onApproveItem={handleApproveItem}
                onRejectItem={handleRejectItem}
              />
            )}

            {/* Screen 4: MR 목록 */}
            {currentTab === 'mr-list' && (
              <MRListView
                requests={mrQueueRequests}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onOpenSpecModalByItemCode={handleOpenSpecByItemCode}
                onApprove={handleApproveRequest}
                onOpenRejectModal={(id, mrNo) => setRejectingItem({ id, mrNo })}
                onOpenAttachmentsModal={(files) => setActiveAttachmentFiles(files)}
              />
            )}

            {/* Screen 5: 협력사 선정 */}
            {currentTab === 'vendor-select' && (
              <VendorSelectionView
                vendorGroups={activeVendorGroups}
                onSelectSupplier={handleSelectSupplier}
                onWithdrawSupplierSelection={handleWithdrawSupplierSelection}
                onOpenSpecModalByItemCode={handleOpenSpecByItemCode}
                onExtendDeadline={handleExtendDeadline}
              />
            )}

            {/* Screen 6: PO 관리 */}
            {currentTab === 'po-manage' && (
              <POManagementView
                poItems={activePOItems}
                onCreatePO={handleCreatePO}
                onReturnToMR={handleReturnToMR}
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
