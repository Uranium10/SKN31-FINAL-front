# 09. 코드 읽기 훈련

실제 프로젝트 코드를 보며 스스로 답을 생각해본 뒤에만 정답을 펼쳐라. 모든 문제는 이 저장소에 실재하는 코드를 기준으로 한다.

---

## 초급 (10문제) — "이 코드가 무엇을 하는지 읽기"

**Q1.** `backend_logic2/integrations/erp_client.py`의 `get_stock_level(item_code, warehouse)` 함수의 입력값은 무엇이며, 반환 타입은 무엇인가?

<details><summary>정답</summary>입력값은 `item_code`, `warehouse` 두 문자열. `erp_get("Bin", filters=[...])`으로 조회한 뒤, 결과가 있으면 리스트의 첫 번째 dict(`result[0]`)를, 없으면 `None`을 반환한다.</details>

**Q2.** `backend_logic2/nodes/mr/decide_bidding.py`의 `AMOUNT_THRESHOLD` 값은 얼마이며, 어디에 쓰이는가?

<details><summary>정답</summary>`20_000_000`(2천만원). `_decide_one_item` 함수의 3번 규칙("고액구매")에서, `qty * 최근단가`로 계산한 예상금액이 이 값 이상이면 비딩이 필요하다고 판정한다.</details>

**Q3.** `src/utils/auth.js`의 `fetchWithAuth` 함수가 401 응답을 받으면 다음에 무엇을 하는가?

<details><summary>정답</summary>`refreshSession()`을 호출해 `/api/refresh`로 새 access_token을 발급받은 뒤, 원래 실패했던 요청을 새 토큰으로 다시 시도한다. 그마저 실패하면 토큰을 지우고 페이지를 새로고침한다.</details>

**Q4.** `backend_logic2/workflow/process_commands.py`의 `PurchaseProcessState`는 `TypedDict(total=False)`로 선언되어 있다. `total=False`가 의미하는 바는?

<details><summary>정답</summary>이 dict의 모든 키가 항상 다 채워져 있을 필요는 없다는 뜻. 그래프가 진행되면서 키가 하나씩 채워지기 때문에, 특정 시점에는 일부 키만 존재할 수 있다.</details>

**Q5.** `erp_client.py`의 `erp_submit` 함수는 실패 시 왜 최대 3번(`max_retries=3`)까지 재시도하는가?

<details><summary>정답</summary>ERPNext에서 DB 데드락(`QueryDeadlockError`)이 발생할 수 있는데, 이는 백그라운드 작업(Contact 생성 등)이 아직 끝나기 전에 Submit이 몰릴 때 간헐적으로 생기는 문제라서, 잠깐 대기 후 재시도하면 대부분 해결되기 때문이다. 다른 종류의 에러는 재시도하지 않는다.</details>

**Q6.** `src/procurement/api/cases.ts`의 `listProcurementCases` 함수가 호출하는 실제 URL은 무엇인가?

<details><summary>정답</summary>`/api/procurement/cases?include_closed=true&limit=200` (GET 요청).</details>

**Q7.** `backend_logic2/nodes/mr/find_substitute.py`의 `find_substitute_items` 함수 안에서 AI(LLM)는 총 몇 번 호출되는가?

<details><summary>정답</summary>2번. 1번째는 `_get_core_keyword`(품목명에서 핵심단어 추출), 2번째는 `_ai_rank_substitutes`(실제 대체품 순위 판단). 후보 개수가 몇 개든 AI 호출은 항상 2번으로 고정된다.</details>

**Q8.** `main.py`의 `_mr_ingest_mode()` 함수는 `MR_INGEST_MODE` 환경변수 값이 `"polling"`이 아닌 다른 임의의 문자열(예: `"foo"`)이면 무엇을 반환하는가?

<details><summary>정답</summary>`"webhook"`. 코드는 `return "polling" if value == "polling" else "webhook"`이므로, `"polling"`이 아닌 모든 값은 안전하게 `"webhook"`으로 처리된다.</details>

**Q9.** `backend_logic2/integrations/erp_client.py`의 `get_email_delivery_policy()`가 반환할 수 있는 값 세 가지는 무엇인가?

<details><summary>정답</summary>`"block_all"`, `"custom_only"`, `"send_all"`. `TEST_MODE` 환경변수 값에 따라 결정되며, 값이 없거나 인식 불가능하면 가장 안전한 `"block_all"`이 기본값이다.</details>

**Q10.** `src/procurement/ProcurementWorkspace.tsx`에서 `VITE_PROCUREMENT_DATA_MODE`가 `"mock"`일 때와 `"api"`일 때, `items` state의 초기값은 각각 무엇인가?

<details><summary>정답</summary>`"api"`면 빈 배열(`[]`), 그 외(`"mock"`, `"hybrid"`)면 `initialItems`(목업 데이터)로 초기화된다.</details>

---

## 중급 (10문제) — "값의 흐름과 분기 추적"

**Q11.** `decide_bidding.py`의 `_decide_one_item` 함수에서, 과거 구매 이력(`purchases`)이 하나도 없는(`not purchases`) 품목이 **긴급 발주**(`remaining_days <= URGENT_LEAD_TIME_DAYS`)인 경우, 이 함수는 무엇을 반환하는가?

<details><summary>정답</summary>`{"needs_bidding": False, "reasons": [reason]}` — "긴급발주이나 최근 거래 협력사 없음"이라는 이유와 함께 비딩 불필요로 판정된다. 이때 `direct_supplier`가 없으므로, 이후 `process_commands.py`의 `_cancel_urgent_mr_without_supplier`가 이 케이스를 감지해 MR 자체를 취소시킨다(Q21 참고).</details>

**Q12.** `process_commands.py`의 `check_mr_item_command`에서, `find_substitutes_for_mr(mr_name)`이 반환한 결과에 대체품이 하나도 없으면(`any_substitutes`가 False) 이 함수의 `goto`는 어디로 향하는가?

<details><summary>정답</summary>`"decide_bidding_choice"`. 대체품이 없으면 `_submit_mr_for_purchase(mr_name)`으로 MR을 Submit한 뒤 곧바로 비딩 판정 단계로 넘어간다.</details>

**Q13.** `sq_evaluation.py`의 `evaluate_quotations` 함수는 제출된 견적이 정확히 1건일 때 AI를 호출하지 않는다. 이때 반환되는 `ranking` 리스트의 `fulfills_qty`와 `spec_match` 값은 각각 무엇인가? 왜 `True`나 `False`가 아닌가?

<details><summary>정답</summary>둘 다 `None`이다. AI 평가를 하지 않았으므로 임의로 True/False를 단정하지 않는다는 원칙 때문이다(코드 주석: "AI 평가를 하지 않았으므로 임의로 True/False 판단하지 않음").</details>

**Q14.** `src/procurement/api/cases.ts`의 `caseToMaterialRequest` 함수에서 `isUrgent` 필드는 어떻게 계산되며, 이 기준값은 백엔드의 어떤 상수와 일치하는가?

<details><summary>정답</summary>`dDay <= 7`로 계산된다. 코드 주석에 명시된 대로, 백엔드 `decide_bidding.py`의 `URGENT_LEAD_TIME_DAYS`(7일)과 동일한 기준을 프론트에서도 그대로 재사용한 것이다.</details>

**Q15.** `process_commands.py`의 `select_rfq_targets_command`에서, 사람이 목록에 없는 회사명을 `supplier_updates`로 직접 입력하면 어떤 일이 일어나는가?

<details><summary>정답</summary>`existing_names`에 없는 이름이면 `candidates` 리스트에 `{"name":..., "email":..., "registered": False, "source": "manual"}` 형태로 새로 추가된다. 즉 검색 결과에 없는 업체도 같은 화면에서 직접 입력해 등록·RFQ 발송 대상에 포함시킬 수 있다.</details>

**Q16.** `erp_client.py`의 `erp_download_file` 함수는 `file_url`이 절대 URL(`http://...`)이고 그 호스트가 `SITE_URL`과 다르면 어떻게 동작하는가? 왜 이렇게 만들었는가?

<details><summary>정답</summary>`ERPNextAPIError("ERPNext 사이트 외부의 첨부 URL은 다운로드할 수 없습니다.")`를 던진다. 이는 SSRF(서버가 공격자가 지정한 임의의 외부 주소로 요청을 보내게 되는 취약점) 공격을 막기 위한 방어 코드다.</details>

**Q17.** `workflow_service.py`의 `resume_task` 함수에서, `task["task_type"]`이 그래프의 현재 `active_task_types`에 없으면 어떤 예외가 발생하는가?

<details><summary>정답</summary>`ValueError("현재 LangGraph 인터럽트와 대기 작업이 일치하지 않습니다. 서버 상태를 다시 동기화한 뒤 시도해 주세요.")`. 라우터에서 이는 409 Conflict로 변환된다.</details>

**Q18.** `find_substitute.py`의 `_ai_rank_substitutes`에서 프롬프트는 "스펙이 원본보다 낮아도(다운그레이드) 용도가 같으면 후보에 포함"하라고 지시한다. 이 규칙이 없다면 어떤 문제가 생길 수 있는가?

<details><summary>정답</summary>AI가 "완벽히 동일한 스펙"만 대체품으로 인정하면, 실제로는 급한 상황에서 충분히 쓸 수 있는 하위 스펙 재고까지 후보에서 제외되어, 대체품이 있음에도 신규구매로만 진행되는 비효율이 생긴다. (단, `reason`에 다운그레이드 사실을 명시하게 해서 최종 판단은 사람이 하게 한다.)</details>

**Q19.** `process_commands.py`의 `handle_pr_rejection_command`에서 `decision == "rebid"`일 때, `state`의 어떤 필드들이 초기화(빈 값으로 재설정)되는가? 왜 이 필드들만 초기화하는가?

<details><summary>정답</summary>`selected_supplier`, `pr_id`, `pr_status`, `pr_supplier_email`, `rfq_name`, `quotation_ranking`, `requested_supplier`, `selected_suppliers`, `supplier_registration_results`, `quotation_deadline`가 초기화된다. 재비딩은 공급사 탐색·RFQ·견적 단계를 처음부터 다시 거쳐야 하므로, 그 단계들의 결과값을 모두 지워야 다음 재실행이 이전 데이터와 섞이지 않는다. `entrypoint`는 `"bidding_recheck"`로 설정해 `decide_bidding_choice`부터 다시 시작하게 한다.</details>

**Q20.** `ProcurementWorkspace.tsx`의 `loadMRsFromApi` 함수는 왜 `visibleCases`를 만들 때 `entry.mr_name.includes('#archived-')`인 케이스를 걸러내는가?

<details><summary>정답</summary>ERPNext MR 번호가 삭제 후 재사용될 때, 이전 케이스는 감사(audit) 이력 보존을 위해 `#archived-...` 형태의 이름으로 보관되기 때문이다(백엔드 `cases.py`의 재생성 감지 로직과 연결). 이는 현재 진행 중인 업무가 아니므로 대시보드/작업함에서 제외한다.</details>

---

## 실제 디버깅 수준 (12문제) — "여러 파일을 넘나들며 원인 추적"

**Q21.** 어느 긴급 MR이 "협력사 재선정 화면에 계속 남아있고 발주 진행이 안 된다"는 버그 리포트가 왔다. `decide_bidding_choice_command`와 `await_order_start_command`를 함께 보면서, 이 버그의 원인이 될 수 있는 조건을 하나 찾아라. (힌트: git 로그의 "긴급발주(비딩 생략) 건이 협력사 선정 화면에 머무는 문제 수정" 커밋과 관련된 코드를 보라.)

<details><summary>정답</summary>`await_order_start_command`에는 "대체품 후보를 거절하고 신규구매로 진행한 뒤에도, 그 직접구매가 긴급발주 근거로 이전 PO 공급사를 재사용하는 것"인지 확인하는 예외 분기(`is_urgent_direct_purchase`)가 있다. 이 조건을 제대로 검사하지 않으면, 긴급 직접구매 건이 "새 공급사를 골라야 하는 것처럼" 오인되어 `decide_bidding_choice`로 되돌아가거나 협력사 선정 관련 화면에 머무를 수 있다. 실제 커밋(`ec75045`)이 이 조건 처리를 수정한 것으로 보인다 — git log와 diff를 직접 확인해보라.</details>

**Q22.** RFQ 발송 버튼을 눌렀는데 ERPNext에 문서는 생성됐지만 공급사에게 이메일이 전혀 안 갔다. 어떤 환경변수부터 확인해야 하며, 어떤 함수의 로그를 봐야 하는가?

<details><summary>정답</summary>`TEST_MODE` 환경변수(및 `EMAIL_RECIPIENT_ALLOWLIST`)를 먼저 확인한다. `erp_client.py`의 `get_email_delivery_policy()`와 `erp_send_email`/`send_rfq_native`가 콘솔에 `[EMAIL_POLICY:...] 실제 발송 생략` 로그를 남기므로, 이 로그가 있는지 확인하면 "코드가 의도적으로 막았는지" "ERPNext 자체가 실패했는지"를 구분할 수 있다.</details>

**Q23.** 협력사 선정 화면에서 견적 목록이 "견적 대기중"으로 계속 보이는데, 실제로는 긴급 직접구매라 RFQ 자체가 생성된 적이 없는 케이스다. 프론트 코드 어디에서 이 상황을 구분하려고 시도하는가?

<details><summary>정답</summary>`src/procurement/api/cases.ts`의 `isDirectPurchaseOrderStart(entry)` 함수. `entry.stage === 'ORDER_START' && valuesOf(entry).direct_purchase === true`인 케이스는 협력사 선정(견적 기반) 화면이 아니라 PO 관리 화면으로 보내도록 `ProcurementWorkspace.tsx`의 `loadMRsFromApi`에서 분기 처리한다. 이 분기가 빠지면 해당 케이스가 잘못된 화면에 나타난다.</details>

**Q24.** 사용자가 RFQ 대상 선택 폼에 응답했는데 "현재 단계와 작업 종류가 일치하지 않습니다"라는 409 에러가 떴다. 가능한 원인 두 가지를 `workflow_service.resume_task`의 코드를 근거로 설명하라.

<details><summary>정답</summary>1) 사용자가 화면을 새로고침하지 않은 사이 다른 탭/사용자가 먼저 응답해서 그래프가 이미 다음 단계로 넘어간 경우(`case["stage"] != expected_stage`). 2) `task["task_type"]`이 그래프의 실제 현재 인터럽트(`active_task_types`)와 다른 경우 — 예를 들어 이미 처리된 task_id로 응답을 보낸 경우. 두 상황 모두 "프론트가 들고 있는 상태가 서버의 최신 상태보다 낡았다"는 공통점이 있다.</details>

**Q25.** 도우미 챗봇에 "MR 상태 조회해줘"라고 물었는데 항상 결정론적(deterministic) 답변만 오고 실제 모델(`gpt-5.6-luna`) 답변이 안 온다. `assistant/service.py`의 `answer` 메서드에서 확인해야 할 두 지점은?

<details><summary>정답</summary>1) `model_answer = ... self.model.compose(...)`가 `None`을 반환했는지 — `query_available`이 `False`(procurement_query 예외 발생)면 애초에 모델을 호출하지 않고 고정 안내문을 반환한다. 2) `OpenAIResponsesAssistant`의 `_api_key_present`(즉 `OPENAI_API_KEY` 환경변수 존재 여부) — API 키가 없으면 모델 호출 자체가 될 수 없다.</details>

**Q26.** `supplier_search.py`를 두 번 연속 같은 품목명으로 호출했더니 두 번째 호출은 웹 검색을 전혀 하지 않고 즉시 결과가 왔다. 왜 그런가? 이게 버그인가?

<details><summary>정답</summary>버그가 아니다. `supplier_search()`는 정규화된 품목명 기준으로 `get_cached_results(normalized)`를 먼저 확인하고, 캐시가 있으면 `"[캐시 히트]"` 로그와 함께 즉시 반환한다(기본 TTL 30일). 두 번째 호출은 캐시가 히트된 것이지 오류가 아니다.</details>

**Q27.** ERPNext에서 MR을 삭제했는데, BiddingFlow 화면에서는 여전히 보인다. 어떤 백그라운드 폴링 함수와 어떤 서비스 함수가 이 불일치를 해소하는 책임을 지는가? 이게 즉시 반영되지 않을 수 있는 이유는?

<details><summary>정답</summary>`main.py`의 `_poll_material_requests`(polling 모드일 때) 또는 재조정 로직이 `workflow_service.sync_draft_material_requests(reconcile_existing=True)`를 호출하고, 이 함수 안에서 `_close_case_missing_in_erp`가 ERP 404를 감지해 케이스를 `CANCELLED`로 닫는다. `reconcile_existing=False`인 가벼운 폴링 주기(`MR_POLL_INTERVAL_SECONDS`, 기본 5초)에서는 이 전체 재조정을 매번 하지 않고, 별도의 느린 주기(`MR_FULL_RECONCILE_INTERVAL_SECONDS`, 기본 30초)에서만 기존 케이스 전체를 재확인하므로, 삭제 반영이 최대 그 주기만큼 지연될 수 있다.</details>

**Q28.** 견적 비교 화면에서 AI가 매긴 순위(`aiRank`)는 정상인데 금액(`quoteTotalPrice`)이 전부 0원으로 보인다는 리포트가 왔다. `sq_evaluation.py`의 어떤 함수가 이 문제와 관련 있는가?

<details><summary>정답</summary>`_enrich_ranking_with_prices(ranking, quotations)`. AI 응답(`_ai_rank_quotations`)은 순위와 이유만 반환하므로, 이 함수가 원본 ERP 견적 데이터에서 금액을 다시 찾아 결합해줘야 한다. 이 함수가 호출되지 않았거나, `by_name`/`by_supplier` 매칭이 실패했다면(예: AI가 반환한 `name`이나 `supplier` 값이 원본과 철자가 다름) 금액이 0으로 표시된다.</details>

**Q29.** PR(공급사 수주요청) 이메일의 수락/거절 링크를 공급사가 두 번 클릭했다(중복 제출). 시스템은 이를 어떻게 방지하는가? (힌트: `resume_supplier_pr_response`와 그래프 상태 확인 로직을 보라.)

<details><summary>정답</summary>`resume_supplier_pr_response`는 재개 전에 `values.get("status") != "awaiting_supplier_pr_response"`이면 `ValueError("현재 구매 건은 공급사 PR 응답 대기 상태가 아닙니다.")`를 던진다. 즉 첫 번째 클릭으로 그래프가 이미 다음 상태(`creating_po` 등)로 넘어갔다면, 두 번째 클릭은 상태 불일치로 거부된다. 추가로 `pr_id` 일치 여부도 검사한다.</details>

**Q30.** 그래프가 실행되던 중 서버가 강제 종료됐다. 서버를 다시 켜면 이 케이스는 어떻게 되는가? `run_queued_case`의 예외 처리 부분과 `queue_case_start`의 재시도 로직을 근거로 설명하라.

<details><summary>정답</summary>서버 재시작 직후에는 아무 일도 자동으로 일어나지 않는다(별도 크래시 복구 스캐너는 없다) — 케이스는 `RUNNING` 상태로 DB에 남아있을 수 있다. 사용자가 "시작" 버튼을 다시 누르면 `queue_case_start`가 `case["status"]`를 확인하는데, `RUNNING`은 재시도 허용 상태(`AWAITING_MR_REVIEW`, `FAILED`)에 포함되지 않으므로 `ValueError`가 발생한다. 실제로는 `run_queued_case`가 예외를 잡아 상태를 `FAILED`로 명시적으로 남겨야 다음 재시도가 가능해지므로, "서버가 죽어서 예외 처리 코드 자체가 실행되지 못한 경우"는 이 프로젝트의 문서(`AI_SYSTEM_ARCHITECTURE.md` 6절)에도 "제안, 미구현"으로 분류된 한계 중 하나다 — 운영자가 수동으로 상태를 확인/정정해야 할 수 있다.</details>

**Q31.** `decide_bidding.py`의 `_get_past_purchases`는 `ThreadPoolExecutor(max_workers=min(len(orders), 8) or 1)`를 쓴다. `len(orders)`가 0이면 `max_workers`는 얼마가 되며, 왜 `or 1`이 필요한가?

<details><summary>정답</summary>`min(0, 8)`은 `0`이 되는데, `ThreadPoolExecutor(max_workers=0)`은 오류를 일으킨다(워커가 0개인 실행기는 의미가 없다). `or 1`은 이 경우 `0`이 falsy이므로 `1`로 대체해 최소 1개의 워커를 보장한다. (참고로 `orders`가 비어 있으면 함수는 이 줄 이전에 이미 `return []`로 끝나므로 실제로는 도달하지 않는 방어 코드다 — 이것도 "왜 필요 없어 보이는 방어 코드가 있는가"를 스스로 확인해보는 연습이 된다.)</details>

**Q32.** `ProcurementWorkspace.tsx`에서 `hasActiveWorkflow`가 `true`인 동안 1.8초마다 폴링하는데, 사용자가 다른 탭으로 전환해 화면이 백그라운드에 가 있어도 이 폴링은 계속되는가? 코드 근거로 답하라.

<details><summary>정답</summary>그렇다. 이 폴링은 `document.visibilitychange` 같은 가시성 API를 확인하지 않는 순수 `window.setTimeout` 재귀 호출이므로, 탭이 백그라운드에 있어도(브라우저가 타이머 속도를 늦출 수는 있지만) 계속 실행된다. 이는 불필요한 네트워크 요청을 유발할 수 있는 개선 여지로 볼 수 있다 — `10_coding_exercises.md`의 연습문제로 다시 다룬다.</details>
