# 01. 실행 흐름 추적 (Execution Flow)

이 문서는 실제로 버튼을 눌렀을 때 코드가 어떤 순서로 실행되는지, 파일 경로와 함수명 그대로 따라간다. 4개의 대표 시나리오를 추적한다.

- A. 로그인
- B. "구매 처리 시작" 버튼 (MR 승인) — 대체품 탐색까지
- C. 사람이 인터럽트에 응답하는 흐름 (RFQ 대상 선택 예시)
- D. 실시간 알림 (SSE)

---

## A. 로그인 흐름

```
[사용자] 이메일/비밀번호 입력 후 로그인 버튼
  ↓
src/App.jsx :: handleLogin(event)
  입력값: { email, password }
  → fetch('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  ↓  (Vite dev 서버가 /api를 http://127.0.0.1:8000 으로 프록시)
auth_service/router.py :: (login 엔드포인트, auth_router)
  → ERPNext에 자격증명 검증 요청
  → 성공 시 access_token/refresh_token(JWT) 발급, 응답: { success, access_token, refresh_token, user }
  ↓
src/App.jsx
  setTokens(data.access_token, data.refresh_token, data.user)  // localStorage 저장
  setAuthState('authenticated')
  ↓
src/procurement/ProcurementWorkspace.tsx 렌더링 시작
```

**파일**: `src/App.jsx:95-128` (`handleLogin`) → `src/utils/auth.js:46-57` (`setTokens`)
**입력값**: `{ email: string, password: string }`
**출력값**: 브라우저 `localStorage`에 `access_token`, `refresh_token`, `erp_user_profile` 저장
**다음 호출**: 이후 모든 API 요청은 `fetchWithAuth()`가 `Authorization: Bearer {access_token}` 헤더를 자동으로 붙인다 (`src/utils/auth.js:93-127`). 토큰이 만료(401)되면 `refreshSession()`이 `/api/refresh`를 호출해 자동 재발급한다.

---

## B. "구매 처리 시작" 버튼 → 대체품 탐색까지

### B-1. 프론트: 버튼 클릭

```
[사용자] MR 목록에서 "구매 처리 시작" 클릭
  ↓
src/procurement/ProcurementWorkspace.tsx :: handleStartSubstituteCheck(id)
  입력값: id (case_id)
  → startProcurementCase(id)
```

**파일**: `src/procurement/ProcurementWorkspace.tsx:984-1023`

### B-2. 프론트 API 모듈

```
src/procurement/api/cases.ts :: startProcurementCase(caseId)
  → fetchWithAuth(`/api/procurement/cases/${caseId}/start`, { method: 'POST' })
```

**파일**: `src/procurement/api/cases.ts:145-150`
**입력값**: `caseId: string`
**출력값**: 성공 시 `{ accepted: true, case: {...} }` (202 Accepted)

### B-3. 백엔드 라우트

```
backend_logic2/api/procurement_routes.py :: start_case(case_id, background_tasks, current_user)
  1) _require_case_access(case_id, current_user)   # 담당자 검증
  2) queued = workflow_service.queue_case_start(case_id, triggered_by=actor)
  3) background_tasks.add_task(workflow_service.run_queued_case, case_id, triggered_by=actor)
  4) return {"accepted": True, "case": queued}   # 즉시 응답 (그래프 실행은 백그라운드)
```

**파일**: `backend_logic2/api/procurement_routes.py:231-246`
**핵심 포인트**: HTTP 응답은 그래프 실행이 끝나길 기다리지 않는다. `background_tasks.add_task`로 실제 LangGraph 실행은 응답 이후 비동기로 진행된다 — 그래서 프론트는 이후 폴링으로 진행 상황을 확인해야 한다(`ProcurementWorkspace.tsx`의 `hasActiveWorkflow` 폴링 effect, 1.8초 간격).

### B-4. 케이스 상태를 QUEUED로 전환

```
backend_logic2/services/workflow_service.py :: queue_case_start(case_id, triggered_by)
  case = case_repository.get_case(case_id)
  # case["status"]가 AWAITING_MR_REVIEW 또는 FAILED가 아니면 에러
  _validate_erp_mr(case["mr_name"])   # ERPNext에서 MR이 진짜 Draft인지 재확인
  case_repository.transition_case(case_id, status="QUEUED", stage="MR_REVIEW", ...)
  return updated
```

**파일**: `backend_logic2/services/workflow_service.py:504-554`
**입력값**: `case_id`, `triggered_by`(로그인 사용자 ID)
**출력값**: PostgreSQL `procurement_case` 행이 `status='QUEUED'`로 업데이트됨

### B-5. 백그라운드에서 LangGraph 실행

```
backend_logic2/services/workflow_service.py :: run_queued_case(case_id, triggered_by)
  app = get_process_app()                       # 컴파일된 LangGraph
  config = {"configurable": {"thread_id": case["thread_id"] or case["mr_name"]}}
  app.invoke({"mr_name": case["mr_name"], "case_id": case_id, "status": "started"}, config=config)
  project_case_from_checkpoint(case_id)         # 실행 후 상태를 PostgreSQL에 투영
```

**파일**: `backend_logic2/services/workflow_service.py:557-632`, `get_process_app`은 `backend_logic2/workflow/process_graph.py:137-143`

### B-6. LangGraph 노드 호출 순서 (실제 함수 호출 체인)

```
app.invoke({...}, config)
  → route_entrypoint_command(state)
      backend_logic2/workflow/process_commands.py:94-123
      case_id = state.get("case_id") or create_case(...)
      return Command(update={..., "status": "checking_mr_item"}, goto="check_mr_item")
  → check_mr_item_command(state)
      backend_logic2/workflow/process_commands.py:126-165
      mr = erp_get_one("Material Request", mr_name)              # ERPNext 조회
      substitute_results = find_substitutes_for_mr(mr_name)      # AI 대체품 탐색 (아래 B-7)
      만약 대체품 있음 → notify_requester_of_substitutes(...) 후
        Command(update={...}, goto="substitute_selection")       # 여기서 interrupt() 대기
      만약 대체품 없음 → _submit_mr_for_purchase(mr_name) 후
        Command(update={...}, goto="decide_bidding_choice")      # 다음 단계로 계속 진행
  → substitute_selection_command(state)   [대체품이 있을 때만]
      backend_logic2/workflow/process_commands.py:168-208
      answer = interrupt({...})   # ★ 여기서 그래프 실행이 통째로 멈춘다
```

`interrupt()`가 호출되면 LangGraph는 예외를 던져 실행을 즉시 중단시키고, 이 시점의 상태를 SQLite 체크포인트(`process_checkpoints.sqlite`)에 저장한다. 함수는 끝까지 실행되지 않으므로 `Command`를 반환하지 못하고, `process_graph.py`의 `_with_status_log` 로깅도 자동으로 건너뛴다(주석에 명시됨).

### B-7. 대체품 탐색 내부 (AI 호출 2회)

```
find_substitutes_for_mr(mr_name)                       # nodes/mr/find_substitute.py:262-279
  mr = erp_get_one("Material Request", mr_name)
  → (품목별 병렬) find_substitute_items(item_code, qty_needed)  # :171-251
       item = erp_get_one("Item", item_code)
       base = _get_core_keyword(item_name)              # AI 호출 1번째 (품목명 핵심단어 추출)
       raw_candidates = erp_get("Item", filters=[...])   # ERPNext에서 후보 조회
       stocked_candidates = (병렬) _check_stock(candidate, qty_needed)  # 재고 확인
       ranking = _ai_rank_substitutes(...)               # AI 호출 2번째 (실제 대체 가능 여부+순위)
       return [{"item_code", "item_name", "total_qty", "rank", "reason", "last_rate"}, ...]
```

**입력값**: `mr_name: str`
**출력값**: `{item_code: {"qty_needed": ..., "substitutes": [...]}}`
**다음에 호출되는 코드**: 대체품이 하나라도 있으면 `notify_requester_of_substitutes(mr, substitute_results)`가 ERPNext에 댓글+할당(알림)을 남기고, 그래프는 `substitute_selection`에서 사람의 응답을 기다린다.

### B-8. 프론트가 진행 상황을 확인

```
src/procurement/ProcurementWorkspace.tsx
  hasActiveWorkflow = requests.some(r => r.workflowStatus === 'QUEUED' || 'RUNNING')
  → useEffect가 1.8초마다 loadMRsFromApi(false, true) 호출
      → listProcurementCases() : GET /api/procurement/cases
      → backend_logic2/api/procurement_routes.py :: get_cases(...)
          case_repository.list_cases(...)   # PostgreSQL 조회 (LangGraph를 직접 조회하지 않음!)
```

**핵심 포인트**: 프론트는 LangGraph 상태(SQLite)를 절대 직접 조회하지 않는다. 항상 `project_case_from_checkpoint()`가 SQLite → PostgreSQL로 "투영"해 둔 결과만 읽는다. 이것이 "왜 상태 저장소를 두 개(SQLite/PostgreSQL) 쓰는가"에 대한 답이다: SQLite는 그래프 재개용, PostgreSQL은 화면 조회용으로 역할이 분리되어 있다.

---

## C. 사람이 인터럽트에 응답하는 흐름 (RFQ 대상 선택 예시)

이 흐름은 B에서 그래프가 `select_rfq_targets`에서 멈춰 있다고 가정한다 (공급사 탐색까지 끝나고 사람이 RFQ 보낼 대상을 골라야 하는 시점).

### C-1. 프론트: 공급사 선택 후 "RFQ 발송" 클릭

```
src/procurement/views/VendorSelectionView.tsx  (버튼 클릭)
  ↓
src/procurement/ProcurementWorkspace.tsx :: handleSendRFQ(groupId, supplierIds, supplierEmails, deadlineDate, deadlineTime)
  selected = supplierIds.map(id => ({ name, email }))
  → answerProcurementTask(group.pendingTaskId, {
        suppliers: selected.map(s => s.name),
        supplier_updates: selected,
        quotation_deadline: `${deadlineDate}T${deadlineTime}:00+09:00`,
      }, group.pendingTask?.version)
```

**파일**: `src/procurement/ProcurementWorkspace.tsx:1168-1206`
**입력값**: `taskId`, `answer(dict)`, `version(낙관적 잠금용 버전 번호)`

### C-2. 프론트 API 모듈

```
src/procurement/api/cases.ts :: answerProcurementTask(taskId, answer, version)
  → fetchWithAuth(`/api/procurement/tasks/${taskId}/answer`, {
      method: 'POST', body: JSON.stringify({ answer, version }) })
```

### C-3. 백엔드 라우트

```
backend_logic2/api/procurement_routes.py :: answer_task(task_id, body: ResumeTaskRequest, current_user)
  task = task_repository.get_task(task_id)
  _require_case_access(task["case_id"], current_user)
  return workflow_service.resume_task(task_id, answer=body.answer,
                                       answered_by=user_id, expected_version=body.version)
```

**파일**: `backend_logic2/api/procurement_routes.py:298-328`

### C-4. LangGraph 재개 (resume)

```
backend_logic2/services/workflow_service.py :: resume_task(task_id, answer, answered_by, expected_version)
  task = task_repository.get_task(task_id)              # PENDING 상태인지 확인
  case = case_repository.get_case(task["case_id"])
  # 현재 그래프 인터럽트 종류와 task_type이 일치하는지 검증
  claimed = task_repository.claim_task(task_id, answer, answered_by, expected_version)  # 중복응답 방지
  app.invoke(
      Command(resume=answer),                            # ★ interrupt()가 이 값을 반환값으로 받으며 재개됨
      config={"configurable": {"thread_id": case["thread_id"]}},
  )
  task_repository.complete_claimed_task(task_id, claimed_version=...)
  return project_case_from_checkpoint(case["case_id"])   # 재개 후 새 상태를 다시 PostgreSQL에 투영
```

**파일**: `backend_logic2/services/workflow_service.py:877-1043`
**핵심 포인트**: `answer`가 `select_rfq_targets_command` 안의 `answer = interrupt({...})`가 반환하는 바로 그 값이 된다. 즉 프론트가 보낸 JSON이 그대로 멈춰있던 함수의 지역 변수로 돌아온다.

### C-5. 재개된 노드가 이어서 실행

```
select_rfq_targets_command(state)  [재개, backend_logic2/workflow/process_commands.py:439-559]
  answer = interrupt({...})   # ← 이제 이 줄이 C-4의 answer 값으로 채워짐
  ... 검증 ...
  register_candidate_suppliers(selected_candidates, case_id=...)   # ERPNext Supplier 등록
  return Command(update={"selected_suppliers": selected, ...}, goto="create_rfq")
  ↓
create_rfq_command(state)   [:562-614]
  create_and_send_rfq(mr_name, selected_suppliers, send_email=..., submit=True)
      → nodes/rfq/send_rfq.py → erp_client.create_rfq_from_material_request() → ERPNext RFQ 문서 생성
      → erp_submit("Request for Quotation", rfq_name)   # Submit 순간 ERPNext가 이메일 발송을 트리거
  return Command(update={"rfq_name": rfq["name"], "status": "awaiting_quotation_check"}, goto="check_quotations")
  ↓
check_quotations_command(state)   [:617-694]
  answer = interrupt({...})   # 다음 사람 입력(견적 확인)을 다시 기다리며 멈춤
```

**출력값**: ERPNext에 실제 `Request for Quotation` 문서 생성, 상태는 `awaiting_quotation_check`로 저장되고 그래프는 다시 대기.

---

## D. 실시간 알림 (SSE)

```
[백엔드] 어떤 이벤트로 새 알림 생성
  backend_logic2/repositories/notifications.py :: create_notification(...)
    INSERT ... ; PostgreSQL의 pg_notify('biddingflow_notifications', payload) 실행 (LISTEN/NOTIFY)
  ↓
backend_logic2/api/procurement_routes.py :: stream_procurement_events(current_user)   [GET /api/procurement/events]
  connection.execute("LISTEN biddingflow_notifications")
  notice를 받을 때마다 payload.recipient_id가 본인이면
    yield "event: notification\ndata: {...}\n\n"       # SSE 프레임 전송
  ↓ (HTTP 응답 스트림)
src/procurement/api/notifications.ts :: subscribeProcurementEvents(...)
  fetchWithAuth('/api/procurement/events', { headers: { Accept: 'text/event-stream' } })
  ReadableStream을 직접 읽어 "event:"/"data:" 프레임을 수동 파싱
  ↓
src/procurement/hooks/useProcurementNotifications.ts :: onRealtimeEvent(event)
  ↓
src/procurement/ProcurementWorkspace.tsx :: handleRealtimeNotification(event)
  showToast(event.title)
  loadMRsFromApi(false, true)   # SSE는 "뭔가 바뀌었다"는 신호일 뿐, 실제 데이터는 항상 API로 재조회
```

**핵심 포인트**: SSE 메시지 자체에는 최신 데이터가 들어있지 않다. "다시 조회하라"는 신호(invalidation)로만 쓰인다 — 이렇게 하면 SSE 페이로드 스키마와 화면 데이터 스키마를 분리할 수 있어, 하나가 바뀌어도 다른 하나를 건드릴 필요가 없다.

---

## 정리: 계층 간 호출 방향

```
React 화면 컴포넌트 (views/*.tsx)
   ↓ 사용자 이벤트 콜백 호출
ProcurementWorkspace.tsx (전역 상태·핸들러)
   ↓ fetchWithAuth 기반 API 함수 호출
procurement/api/*.ts  (cases.ts, items.ts, notifications.ts, prApi.ts)
   ↓ HTTP 요청 (상대경로, Vite가 프록시)
FastAPI 라우터 (backend_logic2/api/*.py, auth_service/router.py)
   ↓ 권한 검증 후 서비스 함수 호출
services/*.py (workflow_service, quotation_service, receipt_service, item_service)
   ↓ LangGraph 실행 또는 repositories 호출
workflow/process_graph.py, workflow/process_commands.py  ↔  repositories/*.py (PostgreSQL)
   ↓ 개별 노드가 필요할 때
nodes/**/*.py (decide_bidding, find_substitute, supplier_search, sq_evaluation, send_rfq, create_and_send_po)
   ↓ 외부 시스템 호출
integrations/erp_client.py (ERPNext) / langchain_openai.ChatOpenAI (OpenAI) / tavily / DART / Naver
```

이 계층 구조를 기억해두면, 어떤 화면 버튼이 이상하게 동작할 때 "화면 → api/*.ts → 라우터 → 서비스 → 노드 → 외부 API" 순서로 하나씩 내려가며 원인을 좁힐 수 있다 (`07_debugging_guide.md` 참고).
