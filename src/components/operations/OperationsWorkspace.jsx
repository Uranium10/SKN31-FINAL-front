import { useEffect, useMemo, useRef, useState } from 'react';
import SailboatIcon from '../common/SailboatIcon';
import './OperationsWorkspace.css';

const STATUS_META = {
  all: { label: '전체 작업' },
  needs_action: { label: '내 확인 필요', tone: 'amber' },
  waiting_external: { label: '외부 응답 대기', tone: 'blue' },
  running: { label: '진행 중', tone: 'violet' },
  returned: { label: '요청자 보완 대기', tone: 'rose' },
  completed: { label: '완료', tone: 'green' },
};

const WORKFLOW_STEPS = [
  ['요청 접수', '구매 목적과 요청 품목을 구조화했습니다.'],
  ['정보 검증', '필수 규격·수량·희망일을 확인했습니다.'],
  ['재고 확인', 'ERP 가용 재고와 예약 수량을 조회했습니다.'],
  ['대체품 검토', '동등 규격 후보와 차이점을 정리했습니다.'],
  ['비딩 판단', '복수 견적이 필요한 구매로 분류했습니다.'],
  ['공급사 선정', '카테고리와 과거 이력으로 후보사를 찾았습니다.'],
  ['RFQ 발송', '공급사별 견적 요청 문서를 생성했습니다.'],
  ['견적 대기', '도착한 견적을 실시간으로 수집하고 있습니다.'],
  ['견적 비교', '가격·납기·유효기간 기준 추천안을 만듭니다.'],
  ['담당자 승인', '최종 공급사 선택은 담당자가 결정합니다.'],
  ['PO 발주', '승인 결과로 발주서를 생성하고 전송합니다.'],
];

const makeSteps = (overrides = {}) =>
  WORKFLOW_STEPS.map(([name, summary], index) => ({
    name,
    summary: overrides[index]?.summary ?? summary,
    time: overrides[index]?.time ?? (index < 3 ? `08.21 09:${12 + index * 2}` : ''),
  }));

const initialStrips = [
  {
    id: 'work-001',
    reference: 'MR-2026-003',
    title: '3M 방진마스크 200개 긴급 조달',
    status: 'needs_action',
    currentStepIndex: 3,
    updatedAt: '10분 전',
    nextAction: '대체품 2종의 규격 차이를 확인해 주세요.',
    steps: makeSteps({
      0: { summary: '안전관리팀 요청, 200개, 8월 28일까지 입고.', time: '08.21 09:12' },
      1: { summary: '3M 8822 또는 동급, 1급 방진 기준을 확인.', time: '08.21 09:14' },
      2: { summary: '가용 12개, 부족 수량 188개로 확인.', time: '08.21 09:15' },
      3: { summary: '동급 후보 2종을 찾았습니다. 담당자 확인이 필요합니다.', time: '' },
    }),
    messages: [
      { sender: 'user', text: '3M 방진마스크 200개가 급해. 재고 확인하고 부족하면 구매를 진행해 줘.' },
      { sender: 'agent', text: '가용 재고는 12개이며 188개가 부족합니다. 동급 후보 2종을 찾았지만 착용 규격 차이가 있어 담당자 확인이 필요합니다.' },
      { sender: 'agent', kind: 'idle', text: '대체품 승인을 기다리고 있습니다. 확인 전까지 이 대화를 나가셔도 좋습니다.' },
    ],
  },
  {
    id: 'work-002',
    reference: 'PUR-RFQ-2026-00270',
    title: '고전압 절연장갑 100켤레 정기 구매',
    status: 'waiting_external',
    currentStepIndex: 7,
    updatedAt: '35분 전',
    nextAction: '3개 공급사의 견적 회신을 기다리는 중입니다.',
    steps: makeSteps({
      1: { summary: 'KS IEC 60903 Class 2, 100켤레, 시험성적서 필수.', time: '08.21 08:43' },
      2: { summary: '가용 재고가 없어 전량 구매가 필요합니다.', time: '08.21 08:45' },
      5: { summary: '전기 안전용품 취급 이력이 있는 공급사 3곳 선정.', time: '08.21 08:51' },
      6: { summary: 'RFQ 3건 발송 완료. 응답 기한은 8월 23일입니다.', time: '08.21 08:54' },
      7: { summary: '현재 1/3건 도착. 나머지 견적을 기다리고 있습니다.', time: '' },
    }),
    messages: [
      { sender: 'user', text: '고전압 절연장갑 100켤레 정기 구매를 시작해 줘.' },
      { sender: 'agent', text: '규격과 공급사 이력을 검증한 뒤 3개사에 RFQ를 발송했습니다.' },
      { sender: 'agent', kind: 'idle', text: '비딩이 완료되었습니다. 견적이 모두 도착할 때까지 이 대화를 나가셔도 좋습니다.' },
    ],
  },
  {
    id: 'work-003',
    reference: 'MR-2026-006',
    title: '생산라인 토크렌치 6개 구매',
    status: 'returned',
    currentStepIndex: 1,
    updatedAt: '1시간 전',
    nextAction: '요청자에게 토크 범위와 교정성적서 조건을 요청했습니다.',
    steps: makeSteps({
      0: { summary: '생산1팀이 토크렌치 6개 구매를 요청했습니다.', time: '08.21 08:02' },
      1: { summary: '토크 범위와 교정성적서 조건이 누락되었습니다.', time: '' },
    }),
    messages: [
      { sender: 'user', text: '생산라인용 토크렌치 6개 구매해 줘.' },
      { sender: 'agent', text: '구매를 진행하려면 사용 토크 범위와 교정성적서 필요 여부가 추가로 필요합니다.' },
      { sender: 'agent', kind: 'idle', text: '요청사항 반려가 완료되었습니다. 재요청이 들어올 때까지 이 대화를 나가셔도 좋습니다.' },
    ],
  },
  {
    id: 'work-004',
    reference: 'MR-2026-001',
    title: '용접 보안경 50개 소액 구매',
    status: 'completed',
    currentStepIndex: 10,
    updatedAt: '어제 16:30',
    nextAction: 'PO-2026-088 발송 완료 · 입고 예정 8월 25일',
    steps: makeSteps({
      8: { summary: '도착 견적 3건을 비교하고 추천 근거를 제시했습니다.', time: '08.20 16:20' },
      9: { summary: '구매 담당자 김민지가 공급사 B를 최종 승인했습니다.', time: '08.20 16:25' },
      10: { summary: 'PO-2026-088을 생성하고 공급사에 발송했습니다.', time: '08.20 16:30' },
    }),
    messages: [
      { sender: 'user', text: '용접 보안경 50개 구매 진행 상황을 알려 줘.' },
      { sender: 'agent', text: '담당자 최종 승인에 따라 PO-2026-088을 발송했습니다. 입고 예정일은 8월 25일입니다.' },
    ],
  },
];

const initialNotifications = [
  { id: 'notice-1', stripId: 'work-001', title: '대체품 확인이 필요합니다', detail: '방진마스크 동급 후보 2종', time: '10분 전', unread: true },
  { id: 'notice-2', stripId: 'work-002', title: '첫 번째 견적이 도착했습니다', detail: '3개 공급사 중 1개사 회신', time: '28분 전', unread: true },
  { id: 'notice-3', stripId: 'work-004', title: '발주서가 전송되었습니다', detail: 'PO-2026-088', time: '어제', unread: false },
];

const BUILD_STAGES = [
  {
    title: '요청 해석',
    eyebrow: 'INTAKE',
    tool: 'Request parser',
    summary: '품목·수량·희망 납기와 구매 목적을 구조화했습니다.',
    rationale: '자연어 요청에서 구매 실행에 필요한 핵심 필드를 분리하고 누락 여부를 확인했습니다.',
    result: '방진마스크 · 200개 · 재고 부족 시 경쟁견적',
    duration: '0.8초',
  },
  {
    title: '정보 검증',
    eyebrow: 'VALIDATE',
    tool: 'read_material_request',
    summary: '요청 품목의 마스터와 필수 규격을 대조했습니다.',
    rationale: '잘못된 품목 코드나 모호한 규격으로 후속 문서가 생성되지 않도록 ERP 품목 정보를 먼저 검증했습니다.',
    result: '품목 코드 확인 · 방진 1급 조건 확인',
    duration: '1.1초',
  },
  {
    title: '재고 조회',
    eyebrow: 'ERP QUERY',
    tool: 'ERPNext · Bin',
    summary: '전 창고 가용 재고와 예약 수량을 조회했습니다.',
    rationale: '불필요한 구매를 방지하기 위해 실제 사용 가능한 수량을 기준으로 부족분만 산출했습니다.',
    result: '가용 12개 · 부족 188개',
    duration: '1.4초',
  },
  {
    title: '대체품 검토',
    eyebrow: 'HUMAN CHECK',
    tool: 'substitute_matcher',
    summary: '재고가 있는 동급 후보 2종을 찾았습니다.',
    rationale: '용도와 인증 기준은 유사하지만 착용 방식과 단가 차이가 있어 사람이 선택해야 합니다.',
    result: '후보 2종 · 사용자 선택 필요',
    duration: '2.0초',
    interrupt: {
      type: 'substitute_selection',
      title: '대체품을 선택해 주세요',
      description: '원 요청 품목은 188개가 부족합니다. 선택 결과는 이후 비딩 범위에 반영됩니다.',
      options: [
        { id: '8822', label: '3M 8822로 대체', meta: '동급 · 즉시출고 · 개당 1,420원', recommended: true },
        { id: 'k80', label: 'K80 접이식으로 대체', meta: '동급 · 2일 납기 · 개당 1,280원' },
        { id: 'none', label: '대체품 없이 신규 구매', meta: '원 요청 규격으로 경쟁견적 진행' },
      ],
    },
  },
  {
    title: '비딩 판단',
    eyebrow: 'ROUTING',
    tool: 'decide_bidding.py',
    summary: '복수 공급사 견적이 필요한 구매로 분류했습니다.',
    rationale: '부족 수량, 예상 금액, 승인 공급사 유무를 함께 검토해 경쟁견적 경로를 선택했습니다.',
    result: '경쟁견적 · 목표 공급사 3곳',
    duration: '0.7초',
  },
  {
    title: '공급사 탐색',
    eyebrow: 'DISCOVERY',
    tool: 'Vendor RAG + Search',
    summary: '과거 거래 이력과 외부 검색에서 후보사를 찾았습니다.',
    rationale: '기존 승인 공급사를 우선하고, 부족한 후보는 품목 적합성과 납품 이력 기준으로 보완했습니다.',
    result: '기존 1곳 · 신규 후보 3곳',
    duration: '3.2초',
  },
  {
    title: '공급사 검증',
    eyebrow: 'HUMAN CHECK',
    tool: 'cleanse_vendor_data',
    summary: '후보사의 연락처와 사업자 정보를 검증했습니다.',
    rationale: 'RFQ를 실제로 전달할 수 있는지 확인했으며 한 후보의 사업자번호가 누락되어 처리 기준이 필요합니다.',
    result: '완전 2곳 · 정보 불완전 1곳',
    duration: '1.8초',
    interrupt: {
      type: 'vendor_data_incomplete',
      title: '불완전한 공급사를 어떻게 처리할까요?',
      description: '한빛산업의 이메일은 확인됐지만 사업자번호가 없습니다.',
      options: [
        { id: 'exclude', label: '제외하고 2개사로 진행', meta: '검증된 공급사만 RFQ 발송', recommended: true },
        { id: 'include', label: '후보에 포함', meta: '발송 전 담당자가 정보를 보완' },
      ],
    },
  },
  {
    title: 'RFQ 구성',
    eyebrow: 'DOCUMENT',
    tool: 'create_and_send_rfq',
    summary: '공급사별 RFQ 초안과 회신 조건을 구성했습니다.',
    rationale: '동일 조건 비교가 가능하도록 수량, 규격, 회신 기한과 납기 응답 항목을 표준화했습니다.',
    result: 'RFQ 2건 · 회신 기한 8월 23일',
    duration: '1.3초',
  },
  {
    title: '견적 대기',
    eyebrow: 'MONITOR',
    tool: 'RFQ watcher',
    summary: '견적 수신 감시를 시작했습니다.',
    rationale: '도착한 견적은 가격·납기·유효기간 기준으로 비교하되 최종 공급사 선택은 담당자에게 요청합니다.',
    result: '외부 응답 대기 · 자동 알림 활성',
    duration: '진행 중',
  },
];

function Icon({ name, size = 18 }) {
  const paths = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    down: <path d="m6 9 6 6 6-6"/>,
    back: <path d="m15 18-6-6 6-6"/>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    check: <path d="m20 6-11 11-5-5"/>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></>,
    branch: <><circle cx="6" cy="4" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="20" r="2"/><path d="M6 6v12M8 8c5 0 5-2 8-2"/></>,
    pause: <><path d="M9 5v14"/><path d="M15 5v14"/></>,
    close: <><path d="m18 6-12 12"/><path d="m6 6 12 12"/></>,
    spark: <><path d="m12 3-1.4 4.2L6 9l4.6 1.8L12 15l1.4-4.2L18 9l-4.6-1.8Z"/><path d="m5 16-.7 2.1L2 19l2.3.9L5 22l.7-2.1L8 19l-2.3-.9Z"/></>,
    tool: <><path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L5 16l3 3 7.3-7.3a4 4 0 0 0 5-5L18 9l-2.4-2.4 2.3-2.3a4 4 0 0 0-3.2 2Z"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status];
  return <span className={`work-status work-status--${meta.tone}`}><i />{meta.label}</span>;
}

export default function OperationsWorkspace({ startRequest = 0, onCountsChange }) {
  const [screen, setScreen] = useState('list');
  const [filter, setFilter] = useState('all');
  const [strips, setStrips] = useState(initialStrips);
  const [expanded, setExpanded] = useState(new Set());
  const [activeStripId, setActiveStripId] = useState(null);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [toasts, setToasts] = useState([]);
  const [draft, setDraft] = useState('');
  const [building, setBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildMessages, setBuildMessages] = useState([]);
  const [buildEvents, setBuildEvents] = useState([]);
  const [expandedBuildEvents, setExpandedBuildEvents] = useState(new Set());
  const [activeInterrupt, setActiveInterrupt] = useState(null);
  const [interruptOtherOpen, setInterruptOtherOpen] = useState(false);
  const [interruptOther, setInterruptOther] = useState('');
  const [buildOutcome, setBuildOutcome] = useState(null);
  const [createdStripId, setCreatedStripId] = useState(null);
  const [sessionInput, setSessionInput] = useState('');
  const timersRef = useRef([]);
  const toastTimersRef = useRef(new Map());
  const eventFeedRef = useRef(null);

  const activeStrip = strips.find((strip) => strip.id === activeStripId);
  const unreadCount = notifications.filter((notice) => notice.unread).length;
  const visibleStrips = useMemo(
    () => strips.filter((strip) => filter === 'all' || strip.status === filter),
    [filter, strips],
  );

  useEffect(() => {
    onCountsChange?.({
      total: strips.length,
      needsAction: strips.filter((strip) => strip.status === 'needs_action').length,
      waiting: strips.filter((strip) => strip.status === 'waiting_external').length,
    });
  }, [strips, onCountsChange]);

  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout);
    toastTimersRef.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!eventFeedRef.current) return;
    let followupTimer;
    const scrollToLatest = (behavior = 'smooth') => {
      const feed = eventFeedRef.current;
      const conversation = feed?.closest('.work-conversation');
      if (!feed) return;
      if (behavior === 'auto') {
        feed.style.scrollBehavior = 'auto';
        feed.scrollTop = feed.scrollHeight;
        if (conversation) {
          conversation.style.scrollBehavior = 'auto';
          conversation.scrollTop = conversation.scrollHeight;
        }
      } else {
        feed.style.scrollBehavior = '';
        if (conversation) conversation.style.scrollBehavior = '';
        feed.scrollTo({ top: feed.scrollHeight, behavior });
        conversation?.scrollTo({ top: conversation.scrollHeight, behavior });
      }
    };
    const frame = requestAnimationFrame(() => {
      if (activeInterrupt) {
        scrollToLatest('auto');
        followupTimer = setTimeout(() => scrollToLatest('auto'), 360);
      } else {
        scrollToLatest('smooth');
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(followupTimer);
    };
  }, [buildEvents, activeInterrupt, buildOutcome]);

  const dismissToast = (toastId) => {
    const timer = toastTimersRef.current.get(toastId);
    if (timer) clearTimeout(timer);
    toastTimersRef.current.delete(toastId);
    setToasts((previous) => previous.filter((toast) => toast.id !== toastId));
  };

  const flash = (message, options = {}) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const toast = {
      id,
      title: options.title || '작업이 업데이트되었습니다',
      message,
      tone: options.tone || 'success',
      stripId: options.stripId || null,
    };

    // 화면을 가리지 않도록 최근 알림 세 개까지만 노출합니다.
    setToasts((previous) => [...previous.slice(-2), toast]);
    const timer = setTimeout(() => dismissToast(id), options.duration || 5200);
    toastTimersRef.current.set(id, timer);
  };

  const announceRealtimeUpdate = ({ stripId, title, detail, tone = 'info' }) => {
    setNotifications((previous) => [{
      id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      stripId,
      title,
      detail,
      time: '방금',
      unread: true,
    }, ...previous]);
    flash(detail, { title, stripId, tone });
  };

  const clearBuildTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const focusStrip = (stripId) => {
    setScreen('list');
    setExpanded((previous) => new Set(previous).add(stripId));
    setTimeout(() => document.getElementById(stripId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  };

  const toggleStrip = (stripId) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(stripId)) next.delete(stripId);
      else next.add(stripId);
      return next;
    });
    setTimeout(() => {
      const timeline = document.querySelector(`#${stripId} .work-timeline`);
      const currentStep = timeline?.querySelector('[data-current="true"]');
      if (!timeline || !currentStep) return;

      // 페이지 전체를 움직이지 않고 스트립 내부에서만 현재 단계를 중앙 정렬합니다.
      // 카드 폭을 기준으로 좌우 약 2단계가 기본 뷰포트에 남습니다.
      const targetLeft = currentStep.offsetLeft - ((timeline.clientWidth - currentStep.offsetWidth) / 2);
      timeline.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
    }, 120);
  };

  const openSession = (stripId) => {
    setActiveStripId(stripId);
    setScreen('session');
    setNotifications((previous) => previous.map((notice) => notice.stripId === stripId ? { ...notice, unread: false } : notice));
  };

  const openSnapshot = (strip, stepIndex) => {
    if (stepIndex >= strip.currentStepIndex) return;
    setSnapshot({ stripId: strip.id, stepIndex });
    setCorrectionMode(false);
    setCorrectionReason('');
  };

  const createCorrectionBranch = () => {
    if (!snapshot || !correctionReason.trim()) return;
    const target = strips.find((strip) => strip.id === snapshot.stripId);
    const sourceStep = target.steps[snapshot.stepIndex];
    setStrips((previous) => previous.map((strip) => strip.id !== target.id ? strip : {
      ...strip,
      status: 'needs_action',
      updatedAt: '방금',
      revision: {
        sourceStepIndex: snapshot.stepIndex,
        previousCurrentStepIndex: strip.currentStepIndex,
        reason: correctionReason.trim(),
      },
      nextAction: `'${sourceStep.name}' 정정 범위를 확인한 뒤 후속 단계 재실행을 승인해 주세요.`,
      messages: [...strip.messages, {
        sender: 'agent',
        text: `'${sourceStep.name}' 스냅숏에서 정정 분기를 만들었습니다. 기존 실행 기록은 보존되며, 영향받는 후속 단계만 다시 검증합니다. 사유: ${correctionReason.trim()}`,
      }],
    }));
    announceRealtimeUpdate({
      stripId: target.id,
      title: '정정 범위 확인이 필요합니다',
      detail: `${sourceStep.name}에서 새 분기 생성`,
      tone: 'warning',
    });
    setSnapshot(null);
    focusStrip(target.id);
  };

  const resetComposer = () => {
    clearBuildTimers();
    setScreen('list');
    setDraft('');
    setBuilding(false);
    setBuildProgress(0);
    setBuildMessages([]);
    setBuildEvents([]);
    setExpandedBuildEvents(new Set());
    setActiveInterrupt(null);
    setInterruptOtherOpen(false);
    setInterruptOther('');
    setBuildOutcome(null);
    setCreatedStripId(null);
  };

  const startNewWork = () => {
    clearBuildTimers();
    setScreen('new');
    setDraft('');
    setBuilding(false);
    setBuildProgress(0);
    setBuildMessages([]);
    setBuildEvents([]);
    setExpandedBuildEvents(new Set());
    setActiveInterrupt(null);
    setInterruptOtherOpen(false);
    setInterruptOther('');
    setBuildOutcome(null);
    setCreatedStripId(null);
  };

  useEffect(() => {
    if (startRequest > 0) startNewWork();
    // startRequest is an explicit command token from the persistent sidebar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRequest]);

  const finishMockPipeline = (request) => {
    const id = `work-${Date.now()}`;
    const newStrip = {
      id,
      reference: 'DRAFT-MR-2026-021',
      title: request.length > 34 ? `${request.slice(0, 34)}…` : request,
      status: 'waiting_external',
      currentStepIndex: 7,
      updatedAt: '방금',
      nextAction: '공급사 견적 회신을 기다리는 중입니다.',
      steps: makeSteps({
        0: { summary: `자연어 요청을 구조화했습니다: ${request}`, time: '방금' },
        2: { summary: 'ERP 재고 조회 결과 부족 수량을 확인했습니다.', time: '방금' },
        3: { summary: '사용자가 선택한 대체품 처리 기준을 반영했습니다.', time: '방금' },
        5: { summary: '거래 이력과 외부 탐색으로 후보 공급사를 선정했습니다.', time: '방금' },
        6: { summary: '선택한 공급사만 포함해 RFQ 초안을 구성했습니다.', time: '방금' },
        7: { summary: '견적 회신을 기다리고 있습니다.', time: '' },
      }),
      messages: [
        { sender: 'user', text: request },
        { sender: 'agent', text: '두 차례의 사용자 결정을 반영해 RFQ를 구성했습니다. 현재 견적 회신을 기다리고 있습니다.' },
        { sender: 'agent', kind: 'idle', text: '비딩이 완료되었습니다. 견적이 도착할 때까지 이 대화를 나가셔도 좋습니다.' },
      ],
    };
    setStrips((previous) => [newStrip, ...previous]);
    setCreatedStripId(id);
    setBuilding(false);
    setBuildProgress(BUILD_STAGES.length);
    setBuildOutcome({
      title: '스트립이 준비되었습니다',
      text: '비딩이 완료되었습니다. 견적이 도착할 때까지 이 대화를 나가셔도 좋습니다.',
    });
    announceRealtimeUpdate({
      stripId: id,
      title: '새 작업이 생성되었습니다',
      detail: '견적 회신 대기 중',
      tone: 'info',
    });
  };

  const scheduleBuildStage = (index, request) => {
    if (index >= BUILD_STAGES.length) {
      finishMockPipeline(request);
      return;
    }

    const stage = BUILD_STAGES[index];
    const timer = setTimeout(() => {
      setBuildEvents((previous) => [...previous, {
        id: `execution-${index}`,
        stageIndex: index,
        ...stage,
      }]);
      setExpandedBuildEvents(new Set([index]));
      setBuildProgress(index + 1);

      if (stage.interrupt) {
        setBuilding(false);
        setActiveInterrupt({ ...stage.interrupt, stageIndex: index });
        return;
      }

      if (index + 1 < BUILD_STAGES.length) {
        scheduleBuildStage(index + 1, request);
      } else {
        finishMockPipeline(request);
      }
    }, 850 + (index % 3) * 180);
    timersRef.current.push(timer);
  };

  const resolveBuildInterrupt = (option, customValue = '') => {
    if (!activeInterrupt) return;
    const answer = customValue.trim() || option?.label;
    if (!answer) return;
    const nextIndex = activeInterrupt.stageIndex + 1;
    setBuildEvents((previous) => [...previous, {
      id: `intervention-${activeInterrupt.stageIndex}`,
      kind: 'intervention',
      stageIndex: activeInterrupt.stageIndex,
      title: '사용자 개입 반영',
      summary: answer,
      result: customValue.trim() ? '직접 입력으로 실행 재개' : '선택값으로 실행 재개',
    }]);
    setActiveInterrupt(null);
    setInterruptOtherOpen(false);
    setInterruptOther('');
    setBuilding(true);
    setBuildProgress(nextIndex);
    scheduleBuildStage(nextIndex, draft);
  };

  const revealBuildEvent = (index) => {
    setExpandedBuildEvents((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setTimeout(() => document.getElementById(`execution-event-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  };

  const runMockPipeline = (text = draft) => {
    const request = text.trim();
    if (!request || building || activeInterrupt) return;
    clearBuildTimers();
    setDraft(request);
    setBuildEvents([]);
    setExpandedBuildEvents(new Set());
    setBuildOutcome(null);
    setCreatedStripId(null);

    if (!/(구매|조달|견적|발주|재고|rfq)/i.test(request)) {
      setBuildMessages([
        { sender: 'user', text: request },
        { sender: 'agent', text: '이 작업 공간에서는 구매·조달 요청만 스트립으로 만들 수 있습니다. 품목, 수량, 희망 납기와 함께 다시 설명해 주세요.' },
      ]);
      return;
    }

    setBuilding(true);
    setBuildProgress(0);
    setBuildMessages([
      { sender: 'user', text: request },
      { sender: 'agent', text: '구매 의도를 확인했습니다. 실행 과정을 검증 가능한 요약으로 공유하며 작업 스트립을 구성하겠습니다.' },
    ]);
    scheduleBuildStage(0, request);
  };

  const sendSessionMessage = () => {
    const message = sessionInput.trim();
    if (!message || !activeStrip) return;
    setSessionInput('');
    setStrips((previous) => previous.map((strip) => strip.id !== activeStrip.id ? strip : {
      ...strip,
      messages: [...strip.messages,
        { sender: 'user', text: message },
        { sender: 'agent', text: '요청을 이 작업의 기존 문맥에 추가했습니다. 실제 실행 전 영향 범위를 확인하는 목업 응답입니다.' },
      ],
    }));
  };

  const renderTimeline = (strip) => (
    <div className="work-timeline" aria-label={`${strip.title} 전체 단계`}>
      <div className="work-timeline__track">
        {strip.steps.map((step, index) => {
          const passed = index < strip.currentStepIndex;
          const current = index === strip.currentStepIndex;
          const affected = strip.revision && index > strip.revision.sourceStepIndex;
          const branchSource = strip.revision?.sourceStepIndex === index;
          return (
            <button
              type="button"
              key={`${strip.id}-${step.name}`}
              className={`work-step ${passed ? 'is-passed' : ''} ${current ? 'is-current' : ''} ${affected ? 'is-affected' : ''} ${branchSource ? 'is-branch-source' : ''}`}
              data-current={current}
              onClick={() => openSnapshot(strip, index)}
              disabled={!passed}
              title={passed ? '이 단계의 읽기 전용 스냅숏 보기' : step.name}
            >
              <span className="work-step__index">{passed ? <Icon name="check" size={14} /> : String(index + 1).padStart(2, '0')}</span>
              <span className="work-step__label">{step.name}</span>
              <span className="work-step__summary">{step.summary}</span>
              <span className="work-step__footer">
                {branchSource ? '정정 분기점' : affected ? '재검증 예정' : step.time || (current ? '현재 단계' : '예정')}
                {passed && !branchSource && <Icon name="history" size={13} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderList = () => (
    <div className="work-page">
      <header className="work-page__header">
        <div>
          <span className="work-eyebrow">PURCHASE OPERATIONS</span>
          <h1>작업</h1>
          <p>대화에서 시작된 구매 업무를 단계별로 이어서 관리합니다.</p>
        </div>
        <div className="work-page__actions">
          <div className="work-notifications">
            <button type="button" className="work-icon-button" onClick={() => setNotificationsOpen((open) => !open)} aria-label="알림 열기" aria-expanded={notificationsOpen}>
              <Icon name="bell" />{unreadCount > 0 && <span className="work-notification-count">{unreadCount}</span>}
            </button>
            {notificationsOpen && (
              <div className="work-notification-menu">
                <div className="work-notification-menu__head"><strong>알림</strong><span>{unreadCount}개 안 읽음</span></div>
                {notifications.map((notice) => (
                  <button type="button" key={notice.id} className={`work-notice ${notice.unread ? 'is-unread' : ''}`} onClick={() => {
                    setNotifications((previous) => previous.map((item) => item.id === notice.id ? { ...item, unread: false } : item));
                    setNotificationsOpen(false);
                    focusStrip(notice.stripId);
                  }}>
                    <i /><span><strong>{notice.title}</strong><small>{notice.detail} · {notice.time}</small></span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="work-primary-button" onClick={startNewWork}><Icon name="plus" size={17} />새 작업</button>
        </div>
      </header>

      <div className="work-toolbar">
        <label className="work-filter">
          <span>필터</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            {Object.entries(STATUS_META).map(([value, meta]) => (
              <option key={value} value={value}>{meta.label} · {value === 'all' ? strips.length : strips.filter((strip) => strip.status === value).length}</option>
            ))}
          </select>
        </label>
        <span className="work-toolbar__hint"><Icon name="history" size={15} />완료된 단계를 누르면 스냅숏과 정정 분기를 확인할 수 있습니다.</span>
      </div>

      <div className="work-strip-list">
        {visibleStrips.map((strip) => {
          const isExpanded = expanded.has(strip.id);
          const currentStep = strip.steps[strip.currentStepIndex];
          const statusMeta = STATUS_META[strip.status];
          return (
            <article className={`work-strip work-strip--${strip.status} ${isExpanded ? 'is-expanded' : ''}`} id={strip.id} key={strip.id}>
              <div
                className="work-strip__summary"
                role="button"
                tabIndex="0"
                aria-label={`${strip.title} ${isExpanded ? '접기' : '펼치기'}`}
                aria-expanded={isExpanded}
                onClick={() => toggleStrip(strip.id)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleStrip(strip.id);
                  }
                }}
                >
                <div className="work-strip__stage-tab">
                  <span className="work-strip__stage-info">
                    <b>{currentStep.name}</b>
                    <small>{strip.currentStepIndex + 1} / {strip.steps.length}</small>
                  </span>
                  <span className="work-strip__state-info">
                    <i />
                    <span>{statusMeta.label}</span>
                  </span>
                  <Icon name={isExpanded ? 'down' : 'chevron'} size={12} />
                </div>
                <div className="work-strip__identity">
                  <span>{strip.reference}</span>
                  <div className="work-strip__title-row"><strong>{strip.title}</strong></div>
                  <p>{strip.nextAction}</p>
                </div>
                <span className="work-strip__updated">{strip.updatedAt}</span>
                <button type="button" className="work-strip__enter" onClick={(event) => { event.stopPropagation(); openSession(strip.id); }} aria-label={`${strip.title} 에이전트 세션 열기`}>
                  <Icon name="chevron" size={20} />
                </button>
              </div>
              {isExpanded && (
                <div className="work-strip__details">
                  <div className="work-strip__context">
                    <span>{strip.revision ? <><Icon name="branch" size={15} />정정 분기 검토 중</> : '다음 안내'}</span>
                    <p>{strip.nextAction}</p>
                    {strip.revision && <small>원본 실행 이력과 외부 전송 기록은 그대로 보존됩니다.</small>}
                  </div>
                  {renderTimeline(strip)}
                </div>
              )}
            </article>
          );
        })}
        {visibleStrips.length === 0 && <div className="work-empty"><strong>조건에 맞는 작업이 없습니다.</strong><span>필터를 바꾸거나 새 구매 작업을 시작해 보세요.</span></div>}
      </div>
    </div>
  );

  const renderComposer = () => {
    const engaged = draft.trim().length > 0 || buildMessages.length > 0;
    const liveStageIndex = activeInterrupt?.stageIndex ?? Math.min(buildProgress, BUILD_STAGES.length - 1);
    const visibleStageCount = activeInterrupt
      ? buildProgress
      : building
        ? Math.min(buildProgress + 1, BUILD_STAGES.length)
        : buildProgress;
    const visibleStageStart = Math.max(0, visibleStageCount - 5);
    return (
      <div className={`work-composer ${engaged ? 'is-engaged' : ''}`}>
        <header className="work-subheader">
          <button type="button" className="work-back-button" onClick={resetComposer}><Icon name="back" />작업 목록</button>
          <span>새 구매 작업</span>
        </header>
        <div className="work-conversation">
          {!engaged && (
            <div className="work-composer__intro">
              <div className="work-agent-mark"><SailboatIcon /></div>
              <span>NEW PURCHASE WORK</span>
              <h1>새 작업에 대해 설명해 주세요.</h1>
              <p>품목, 수량, 필요한 시점을 자연스럽게 입력하면 구매 단계를 구성합니다.</p>
              <button type="button" onClick={() => setDraft('방진마스크 200개 구매가 필요해. 재고를 확인하고 부족하면 3개사에 견적을 요청해 줘.')}>
                예시로 시작하기 <Icon name="chevron" size={15} />
              </button>
            </div>
          )}
          {engaged && (
            <div className="work-chat-stream">
              {buildMessages.length === 0 && <div className="work-agent-presence"><div className="work-agent-avatar"><SailboatIcon /></div><p>좋아요. 구매 요청으로 만들 내용을 조금 더 적거나 바로 전송해 주세요.</p></div>}
              {buildMessages.map((message, index) => (
                <div key={`${message.sender}-${index}`} className={`work-message work-message--${message.sender} ${message.kind === 'idle' ? 'is-idle' : ''}`}>
                  {message.sender === 'agent' && <div className="work-agent-avatar"><SailboatIcon /></div>}
                  <p>{message.text}</p>
                </div>
              ))}
              {(building || activeInterrupt || buildEvents.length > 0) && (
                <section className="work-live-studio">
                  <div className="work-live-studio__head">
                    <div>
                      <span className="work-live-label"><i className={building ? 'is-pulsing' : ''} />LIVE EXECUTION</span>
                      <strong>작업 스트립 생성 중</strong>
                    </div>
                    <div className="work-live-progress">
                      <span>{Math.round((buildProgress / BUILD_STAGES.length) * 100)}%</span>
                      <i><b style={{ transform: `scaleX(${buildProgress / BUILD_STAGES.length})` }} /></i>
                    </div>
                  </div>

                  <div className="work-live-viewport" aria-label="실시간 작업 스트립">
                    <div className="work-live-viewport__grid" />
                    {BUILD_STAGES.slice(visibleStageStart, visibleStageCount).map((stage, localIndex) => {
                      const index = visibleStageStart + localIndex;
                      const isDone = index < buildProgress;
                      const isActive = building && index === liveStageIndex;
                      const isInterrupted = activeInterrupt?.stageIndex === index;
                      return (
                        <button
                          type="button"
                          key={stage.title}
                          className={`work-live-card ${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''} ${isInterrupted ? 'is-interrupted' : ''}`}
                          style={{ '--stage-shift': `${(index - liveStageIndex) * 234}px` }}
                          onClick={() => isDone && revealBuildEvent(index)}
                          disabled={!isDone}
                        >
                          <span className="work-live-card__top"><b>{String(index + 1).padStart(2, '0')}</b><small>{stage.eyebrow}</small>{isInterrupted ? <Icon name="pause" size={14} /> : isDone && <Icon name="check" size={14} />}</span>
                          <strong>{stage.title}</strong>
                          <p>{stage.summary}</p>
                          <span className="work-live-card__tool"><Icon name="tool" size={12} />{stage.tool}</span>
                        </button>
                      );
                    })}
                    {building && <div className="work-live-scan" />}
                  </div>

                  <div className="work-execution-head">
                    <div><Icon name="eye" size={16} /><span><strong>실행 내역</strong>검증 가능한 판단·도구·결과 요약</span></div>
                    <small>내부 추론 원문은 표시하지 않습니다</small>
                  </div>
                  <div className="work-execution-feed" ref={eventFeedRef}>
                    {buildEvents.map((event) => {
                      if (event.kind === 'intervention') {
                        return (
                          <div className="work-intervention-log" key={event.id}>
                            <span><Icon name="branch" size={14} /></span>
                            <div><small>HUMAN INPUT</small><strong>{event.title}</strong><p>{event.summary}</p></div>
                            <em>{event.result}</em>
                          </div>
                        );
                      }
                      const isOpen = expandedBuildEvents.has(event.stageIndex);
                      return (
                        <article className={`work-execution-event ${isOpen ? 'is-open' : ''}`} id={`execution-event-${event.stageIndex}`} key={event.id}>
                          <button type="button" onClick={() => revealBuildEvent(event.stageIndex)} aria-expanded={isOpen}>
                            <span className="work-execution-event__index"><Icon name="check" size={13} /></span>
                            <span className="work-execution-event__title"><small>{event.eyebrow} · {event.duration}</small><strong>{event.title}</strong></span>
                            <span className="work-execution-event__summary">{event.summary}</span>
                            <span className="work-execution-event__result">{event.result}</span>
                            <Icon name={isOpen ? 'down' : 'chevron'} size={16} />
                          </button>
                          {isOpen && (
                            <div className="work-execution-event__details">
                              <div><span>판단 근거 요약</span><p>{event.rationale}</p></div>
                              <div><span>실행 도구</span><p><Icon name="tool" size={13} />{event.tool}</p></div>
                              <div><span>관찰된 결과</span><p>{event.result}</p></div>
                            </div>
                          )}
                        </article>
                      );
                    })}

                    {building && (
                      <div className="work-thinking-row">
                        <span><i /><i /><i /></span>
                        <p><strong>{BUILD_STAGES[liveStageIndex]?.title}</strong> 단계의 입력과 실행 결과를 확인하고 있습니다.</p>
                      </div>
                    )}

                    {activeInterrupt && (
                      <section className="work-interrupt-card">
                        <header>
                          <span><Icon name="pause" size={16} /></span>
                          <div><small>HUMAN INTERRUPT · 실행 일시정지</small><strong>{activeInterrupt.title}</strong><p>{activeInterrupt.description}</p></div>
                        </header>
                        <div className="work-interrupt-options">
                          {activeInterrupt.options.map((option) => (
                            <button type="button" key={option.id} onClick={() => resolveBuildInterrupt(option)}>
                              <span>{option.label}{option.recommended && <em>추천</em>}</span>
                              <small>{option.meta}</small>
                              <Icon name="chevron" size={16} />
                            </button>
                          ))}
                          <button type="button" className="work-interrupt-other-toggle" onClick={() => setInterruptOtherOpen((open) => !open)}>
                            <span>직접 입력</span><small>다른 선택이나 추가 조건을 전달합니다</small><Icon name={interruptOtherOpen ? 'down' : 'chevron'} size={16} />
                          </button>
                        </div>
                        {interruptOtherOpen && (
                          <div className="work-interrupt-other">
                            <textarea rows="2" value={interruptOther} onChange={(event) => setInterruptOther(event.target.value)} placeholder="예: 기존 공급사 대한안전산업만 포함해서 진행해 줘." autoFocus />
                            <button type="button" onClick={() => resolveBuildInterrupt(null, interruptOther)} disabled={!interruptOther.trim()}><Icon name="send" size={15} />입력 반영</button>
                          </div>
                        )}
                        <footer><Icon name="pause" size={13} />응답하기 전까지 체크포인트와 대화 문맥이 안전하게 보존됩니다.</footer>
                      </section>
                    )}

                    {buildOutcome && (
                      <div className="work-build-outcome"><span><Icon name="spark" size={17} /></span><div><strong>{buildOutcome.title}</strong><p>{buildOutcome.text}</p></div></div>
                    )}
                  </div>
                </section>
              )}
              {createdStripId && <button type="button" className="work-leave-button" onClick={() => { const id = createdStripId; resetComposer(); focusStrip(id); }}>목록에서 생성된 스트립 보기 <Icon name="chevron" size={16} /></button>}
            </div>
          )}
        </div>
        {!createdStripId && !building && !activeInterrupt && buildProgress === 0 && (
          <div className="work-composer__dock">
            <div className="work-prompt-box">
              <textarea rows="2" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); runMockPipeline(); } }} placeholder="구매할 품목과 수량, 희망 납기를 입력하세요" disabled={building || Boolean(activeInterrupt)} autoFocus />
              <button type="button" onClick={() => runMockPipeline()} disabled={!draft.trim() || building || Boolean(activeInterrupt)} aria-label="요청 전송"><Icon name="send" size={17} /></button>
            </div>
            <small>목업에서는 구매 작업만 인식하며 실제 ERP 문서를 생성하지 않습니다.</small>
          </div>
        )}
      </div>
    );
  };

  const renderSession = () => {
    if (!activeStrip) return null;
    const currentStep = activeStrip.steps[activeStrip.currentStepIndex];
    return (
      <div className="work-session">
        <header className="work-subheader work-subheader--session">
          <button type="button" className="work-back-button" onClick={() => setScreen('list')}><Icon name="back" />작업 목록</button>
          <div><span>{activeStrip.reference}</span><strong>{activeStrip.title}</strong></div>
          <StatusBadge status={activeStrip.status} />
        </header>
        <div className="work-session__body">
          <aside className="work-session__rail">
            <span>현재 작업</span><strong>{currentStep.name}</strong><p>{activeStrip.nextAction}</p>
            <div className="work-session__progress"><i style={{ width: `${((activeStrip.currentStepIndex + 1) / activeStrip.steps.length) * 100}%` }} /></div>
            <small>{activeStrip.currentStepIndex + 1} / {activeStrip.steps.length} 단계</small>
            {activeStrip.revision && <div className="work-revision-note"><Icon name="branch" size={16} /><span><strong>{activeStrip.steps[activeStrip.revision.sourceStepIndex].name}에서 정정 분기</strong>기존 문맥을 상속하고 후속 단계만 재검증합니다.</span></div>}
          </aside>
          <main className="work-session__conversation">
            <div className="work-chat-stream">
              {activeStrip.messages.map((message, index) => <div key={`${message.sender}-${index}`} className={`work-message work-message--${message.sender} ${message.kind === 'idle' ? 'is-idle' : ''}`}>{message.sender === 'agent' && <div className="work-agent-avatar"><SailboatIcon /></div>}<p>{message.text}</p></div>)}
            </div>
            <div className="work-session__dock"><div className="work-prompt-box"><textarea rows="2" value={sessionInput} onChange={(event) => setSessionInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendSessionMessage(); } }} placeholder="이 작업의 문맥을 이어서 질문하거나 지시하세요"/><button type="button" onClick={sendSessionMessage} disabled={!sessionInput.trim()} aria-label="메시지 전송"><Icon name="send" size={17} /></button></div></div>
          </main>
        </div>
      </div>
    );
  };

  const snapshotStrip = snapshot && strips.find((strip) => strip.id === snapshot.stripId);
  const snapshotStep = snapshotStrip && snapshotStrip.steps[snapshot.stepIndex];

  return (
    <div className="operations-mockup">
      {screen === 'list' && renderList()}
      {screen === 'new' && renderComposer()}
      {screen === 'session' && renderSession()}
      <div className="work-toast-region" aria-live="polite" aria-label="실시간 알림">
        {toasts.map((toast) => (
          <article className={`work-toast work-toast--${toast.tone}`} key={toast.id}>
            <span className="work-toast__icon"><Icon name={toast.tone === 'success' ? 'check' : 'bell'} size={17} /></span>
            <button
              type="button"
              className="work-toast__content"
              onClick={() => {
                if (toast.stripId) focusStrip(toast.stripId);
                dismissToast(toast.id);
              }}
              disabled={!toast.stripId}
            >
              <strong>{toast.title}</strong>
              <span>{toast.message}</span>
              {toast.stripId && <small>작업 열기 <Icon name="chevron" size={12} /></small>}
            </button>
            <button type="button" className="work-toast__close" onClick={() => dismissToast(toast.id)} aria-label="알림 닫기">
              <Icon name="close" size={15} />
            </button>
            <i className="work-toast__timer" />
          </article>
        ))}
      </div>

      {snapshotStrip && snapshotStep && (
        <div className="work-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSnapshot(null); }}>
          <section className="work-snapshot-modal" role="dialog" aria-modal="true" aria-labelledby="snapshot-title">
            <header>
              <div className="work-snapshot-icon"><Icon name="history" /></div>
              <div><span>READ-ONLY CHECKPOINT · {snapshotStrip.reference}</span><h2 id="snapshot-title">{snapshotStep.name} 스냅숏</h2></div>
              <button type="button" onClick={() => setSnapshot(null)} aria-label="닫기"><Icon name="close" /></button>
            </header>
            <div className="work-snapshot-modal__body">
              <div className="work-snapshot-fact"><span>기록 시각</span><strong>{snapshotStep.time || snapshotStrip.updatedAt}</strong></div>
              <div className="work-snapshot-fact"><span>당시 처리 내용</span><strong>{snapshotStep.summary}</strong></div>
              <div className="work-snapshot-policy">
                <div><Icon name="history" size={17} /><span><strong>보존되는 것</strong>대화, 승인, 입력값, 실행 결과와 원본 체크포인트</span></div>
                <div><Icon name="branch" size={17} /><span><strong>다시 처리되는 것</strong>정정값의 영향을 받는 후속 판단과 문서 초안</span></div>
                <div><Icon name="pause" size={17} /><span><strong>자동 취소하지 않는 것</strong>이미 전송한 RFQ·PO 등 외부 부수효과</span></div>
              </div>
              {!correctionMode ? <p className="work-snapshot-explainer">과거로 되감지 않고 이 지점에서 새 정정 분기를 만듭니다. 현재 실행은 검토가 끝날 때까지 인터럽트 상태로 전환됩니다.</p> : (
                <div className="work-correction-form"><label htmlFor="correction-reason">무엇을 잘못 입력하거나 처리했나요?</label><textarea id="correction-reason" rows="3" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="예: 요청 수량이 200개가 아니라 120개입니다." autoFocus/><small>정정 사유도 감사 이력에 남습니다.</small></div>
              )}
            </div>
            <footer>
              <button type="button" className="work-secondary-button" onClick={() => setSnapshot(null)}>닫기</button>
              {!correctionMode ? <button type="button" className="work-primary-button" onClick={() => setCorrectionMode(true)}><Icon name="branch" size={16} />이 단계에서 정정 시작</button> : <button type="button" className="work-primary-button" onClick={createCorrectionBranch} disabled={!correctionReason.trim()}><Icon name="pause" size={16} />현재 실행 멈추고 분기 만들기</button>}
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
