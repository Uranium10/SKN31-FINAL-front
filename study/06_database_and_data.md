# 06. 데이터 구조 분석

## 1. 어떤 데이터가 존재하는가

이 프로젝트는 데이터를 세 곳에 나눠 둔다. **이 자체가 중요한 설계 결정**이므로, "어디에 무엇이 있고 왜 그런가"를 먼저 정리한다.

| 저장소 | 무엇이 있나 | 왜 여기 있나 |
|---|---|---|
| **ERPNext (Frappe/MySQL, 외부 시스템)** | Item, Material Request, Supplier, Request for Quotation, Supplier Quotation, Purchase Order, Purchase Receipt, Purchase Invoice 등 **구매 문서 원본** | 회사의 구매 시스템은 이미 ERPNext이므로, 이 프로젝트가 새로 만든 시스템이 아니라 ERPNext를 "자동화 계층"으로 감싼 것이다. |
| **PostgreSQL `procurement` 스키마** | `procurement_case`(케이스 요약), `workflow_status_history`(상태 변경 이력), `human_task`(사람 입력 대기 작업), `notification`(알림), `integration_event`(웹훅 중복 방지), `purchase_order_delivery`(입고/평가), `supplier_search_cache`, `ai_decision_log` 등 | **화면이 빠르게 읽을 수 있는 형태로 가공된 사본.** ERPNext를 매번 조회하면 느리고, LangGraph 상태(SQLite)는 화면이 읽기엔 구조가 불편하다. |
| **SQLite (`process_checkpoints.sqlite`)** | LangGraph 실행 체크포인트(`thread_id`별 전체 상태 스냅숷) | **그래프 실행을 재개하기 위한 내부 저장소.** 화면용이 아니다. |
| **SQLite (`.runtime/assistant/help.sqlite3`)** | 도움말 문서의 FTS5(전문검색) 인덱스 | 도우미 챗봇의 도움말 검색 전용, 구매 데이터와 무관. |

## 2. 실제 PostgreSQL 스키마 (근거: `migrations/005_create_frontend_backend_integration.sql`)

```sql
CREATE TABLE procurement.procurement_case (
    case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mr_name VARCHAR(140),
    thread_id VARCHAR(180),          -- LangGraph 체크포인트를 찾는 열쇠
    status VARCHAR(80) NOT NULL DEFAULT 'AWAITING_MR_REVIEW',
    stage VARCHAR(80) NOT NULL DEFAULT 'MR_REVIEW',
    item_code VARCHAR(140),
    item_name VARCHAR(255),
    requester_id VARCHAR(140),
    assigned_user_id VARCHAR(140),
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,             -- 화면 표시용 요약(품목/수량/납기 등)
    workflow_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,   -- LangGraph 상태를 그대로 복사해둔 것
    version INTEGER NOT NULL DEFAULT 1,                     -- 낙관적 잠금(동시 수정 감지)용
    last_error TEXT,
    quotation_deadline_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE procurement.human_task (
    task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES procurement.procurement_case(case_id) ON DELETE CASCADE,
    task_type VARCHAR(80) NOT NULL,          -- 예: "select_rfq_targets", "final_selection"
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,   -- 프론트가 이 값으로 폼을 그림
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,        -- interrupt()에 전달된 원본 데이터
    answer JSONB,
    version INTEGER NOT NULL DEFAULT 1,
    ...
);
```

몇 가지 주목할 설계:
- **`case_id`(UUID, PostgreSQL 세계) ≠ `thread_id`(LangGraph 세계) ≠ `mr_name`(ERPNext 세계)**. 셋은 보통 같은 값(MR 이름)으로 시작하지만, "MR이 삭제됐다가 같은 번호로 재생성되는" 경우를 대비해 `thread_id`에 `:recreated:{생성시각}` 접미사를 붙여 예전 실행과 새 실행이 섞이지 않게 한다(`cases.py`의 `material_request_thread_id` 함수). **이 셋을 하나로 합쳤다면, ERPNext 문서 재사용이라는 드문 케이스에서 데이터가 꼬였을 것이다.**
- **`version` 컬럼(낙관적 잠금)**: 두 탭에서 동시에 같은 작업에 응답하면 안 되므로, 업데이트할 때마다 `WHERE version = 기대값`을 검사하고 버전을 1 증가시킨다. 버전이 이미 바뀌어 있으면(다른 요청이 먼저 처리됨) `CaseConflictError`를 던진다 — HTTP 409로 이어진다(03번 문서).
- **`workflow_snapshot`을 JSONB로 통째로 복사 저장**: LangGraph의 실제 상태(State)는 SQLite에 있지만, 화면이 매번 SQLite까지 가서 읽지 않도록 **최근 실행 결과를 PostgreSQL에도 복사**해둔다. "같은 데이터를 두 번 저장하는 건 낭비 아닌가?"라는 의문에 대한 답: 두 저장소는 접근 패턴이 다르다(SQLite=그래프 엔진 전용 순차 접근, PostgreSQL=여러 화면이 동시에 조회). **읽기 성능이 중요한 데이터는 쓰기 시점에 미리 가공해두는 것("프로젝션")이 일반적인 트레이드오프다.**
- **`integration_event.dedupe_key UNIQUE`**: ERPNext 웹훅은 네트워크 문제로 같은 이벤트를 두 번 보낼 수 있다. `dedupe_key`에 유니크 제약을 걸어 같은 이벤트가 두 번 처리되지 않게 막는다(`event_repository.begin_event`가 이 제약을 이용해 "이미 처리된 이벤트인가"를 판단).

## 3. 어떤 데이터가 ERPNext에서 오는가

- Item(품목 마스터), Material Request(구매요청), Supplier(공급사), Request for Quotation(RFQ), Supplier Quotation(공급사 견적), Purchase Order/Receipt/Invoice(발주/입고/청구) — 이 프로젝트의 거의 모든 "업무 데이터"는 궁극적으로 ERPNext에서 온다. `erp_client.py`의 `erp_get`/`erp_get_one`이 유일한 조회 경로다.

## 4. 어떤 데이터가 사용자에게서 오는가

- 로그인 자격증명(이메일/비밀번호)
- 인터럽트 응답(`answer` dict) — 예: 대체품 선택(`item_code`), RFQ 대상(`suppliers`, `supplier_updates`), 최종 공급사(`supplier`), PO 승인 여부(`approve`/`reject`)
- 반려 사유(`reason`), 마감일 연장(`deadline_at`)

이 값들은 `human_task.answer` JSONB 컬럼에 그대로 기록되어, **"누가 언제 무엇을 입력했는지" 감사 이력**으로 남는다.

## 5. AI에게 어떤 데이터가 전달되는가

- `find_substitute.py`: 요청 품목명/설명/수량 + 재고 있는 후보 품목 목록(이름, 설명, 재고수량)
- `sq_evaluation.py`: RFQ 원본 요구사항(품목, 수량, 희망납기, 설명) + 제출된 모든 견적(공급사, 단가, 총액, 납기, 과거 공급사 평가 스코어카드)
- `structured_item_search_tool.py`: 원본 품목명(문자열)만

**중요한 원칙**: AI에게 넘어가는 데이터는 항상 "이미 구조화된, ERPNext에서 방금 조회한 사실 데이터"다. AI가 스스로 ERPNext를 조회하거나 DB에 직접 접근하지 않는다 — **AI는 항상 "이미 준비된 데이터를 보고 판단만" 한다.** 이 경계가 04번 문서의 "판단과 제어 흐름의 분리" 원칙과 같은 이야기다.

## 6. 데이터 형태가 어떻게 변하는가 (실제 경로)

`sq_evaluation.py`의 견적 비교 과정을 예로 형태 변화를 추적하면:

```
ERPNext REST 응답 (JSON)
  ↓ requests.get(...).json()
Python dict/list (erp_get의 반환값)
  ↓ get_quotations_for_rfq()가 필드 정규화(rate/amount 등을 숫자로 변환, _first_non_zero)
정규화된 Python dict 리스트 (quotations)
  ↓ json.dumps(..., ensure_ascii=False)
LLM 프롬프트에 삽입되는 JSON 문자열
  ↓ (prompt | llm).invoke(...).content
LLM 응답 문자열 (마크다운 코드블록 포함 가능)
  ↓ 문자열 정리 + json.loads()
Python dict/list (ranking)
  ↓ _enrich_ranking_with_prices(ranking, quotations) — AI가 안 준 금액 정보를 다시 결합
최종 Python dict (evaluate_quotations의 반환값)
  ↓ Command(update={"quotation_ranking": ranking, ...})
LangGraph State (PurchaseProcessState)
  ↓ to_checkpoint_data() — Decimal/datetime 등을 JSON 안전 타입으로 변환
SQLite 체크포인트에 저장
  ↓ project_case_from_checkpoint()
PostgreSQL procurement_case.workflow_snapshot (JSONB)
  ↓ GET /api/procurement/cases
HTTP 응답 JSON
  ↓ caseToVendorSelectionGroup() (프론트 api/cases.ts)
프론트 TypeScript 타입(VendorSelectionGroup)
  ↓ React 렌더링
화면(테이블/카드 UI)
```

이 흐름에서 데이터가 **"신뢰할 수 있는 형태로 정규화 → AI에게 전달 → AI 결과를 다시 신뢰할 수 있는 형태로 정규화(_enrich_ranking_with_prices)"**하는 패턴이 반복된다. `_enrich_ranking_with_prices`가 왜 필요한지 코드 주석이 명확히 설명한다:

```python
"""AI 순위에 ERP 견적 금액을 합쳐 체크포인트/UI까지 보존한다.
AI 응답은 순위와 이유만 반환하므로, 그대로 저장하면 프론트에서는
Supplier Quotation이 존재해도 단가·총액이 0원으로 보인다."""
```

**이 교훈이 매우 중요하다**: AI에게 "모든 필드를 다시 출력하라"고 시키면 토큰 낭비와 오류(숫자를 잘못 베껴 쓰는 등) 위험이 커진다. 대신 **"AI는 판단이 필요한 필드(순위, 이유)만 반환하게 하고, 원본에 이미 있던 정확한 값(금액)은 코드가 다시 결합"**하는 게 안전하다.

## 7. 데이터 설계 원칙 (일반화)

1. **원본(source of truth)은 하나만 둬라.** 이 프로젝트에서 구매 문서의 원본은 항상 ERPNext다. PostgreSQL/SQLite에 있는 모든 값은 "투영"이거나 "체크포인트"일 뿐, 그 자체가 원본이 되지 않는다. 원본이 여러 곳에 있으면 반드시 어느 시점엔가 서로 어긋난다.
2. **식별자를 서로 다른 시스템끼리 안이하게 재사용하지 마라.** `case_id`/`thread_id`/`mr_name`을 분리한 이유가 이것이다. "지금은 항상 같은 값이니까 하나만 써도 되지 않나?"라는 생각이 나중에 "문서가 재사용되는" 예외 상황에서 데이터를 오염시킨다.
3. **동시 수정이 가능한 데이터에는 버전(낙관적 잠금)을 둬라.** 여러 사람(또는 여러 탭)이 같은 데이터를 동시에 바꿀 수 있다면, `version` 컬럼 없이는 "나중에 저장한 사람이 먼저 저장한 사람의 변경을 덮어쓰는" 사고가 난다.
4. **외부에서 오는 이벤트는 중복 수신을 전제하라.** 웹훅은 네트워크 특성상 중복 전송될 수 있다. `dedupe_key` 같은 멱등성 장치 없이 웹훅을 처리하면 같은 알림이 여러 번 뜨거나 같은 문서가 중복 생성될 수 있다.
5. **AI에게 "이미 정확한 값을 다시 만들어내라"고 시키지 마라.** 숫자·ID처럼 정확도가 중요한 값은 원본에서 그대로 가져오고, AI에게는 "판단이 필요한 부분"만 맡겨라.
6. **읽기 성능이 중요한 데이터는 쓰기 시점에 미리 가공해 별도로 저장하는 것을 고려하라(프로젝션 패턴).** 매번 원본을 다시 계산/조회하는 비용이 크다면, 이 프로젝트의 `workflow_snapshot`처럼 "이미 계산된 결과의 사본"을 만들어 두는 것이 합리적이다. 단, 사본은 반드시 "언제 그 사본이 최신이 아닐 수 있는가"를 명확히 알고 설계해야 한다.
