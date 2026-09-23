# 05. 시스템 설계 분석

## 1. 전체 그림

```
[사용자: 구매 담당자]
      │ 브라우저
      ▼
[Frontend: React+TS, Vite]  ── mock/hybrid/api 모드 전환 ──┐
      │ fetchWithAuth (JWT)                                │
      ▼                                                    │
[Backend: FastAPI]                                         │
      │                          │                          │
      ▼                          ▼                          │
[PostgreSQL: 화면용 프로젝션]   [LangGraph: 상태기계 실행]    │
      ▲                          │        │                 │
      │ project_case_from_checkpoint()    │                 │
      │                          ▼        ▼                 │
      │                 [SQLite: 체크포인트]  [nodes/*.py]   │
      │                                       │    │    │    │
      │                                       ▼    ▼    ▼    │
      │                                  [ERPNext] [OpenAI] [Tavily/DART/Naver]
      └───────────── SSE(LISTEN/NOTIFY) ─────────────────────┘
```

각 층의 역할을 한 문장으로: **Frontend는 "지금 상태를 보여주고 사람의 결정을 입력받는" 역할만** 하고, **Backend(LangGraph)는 "무엇을 언제 해야 하는지 결정하고 실행"**하며, **ERPNext는 "구매 문서의 유일한 원본"**이고, **PostgreSQL은 "화면이 빠르게 읽을 수 있도록 미리 가공해둔 사본"**이다.

## 2. 각 관점별 설계

### Frontend
- 라우팅/전역 상태 라이브러리를 쓰지 않고 `useState` + prop drilling으로 구성 — 화면 개수(5개 탭)와 팀 규모를 고려하면 이 정도 복잡도에서는 Redux 등이 오히려 과할 수 있다는 판단으로 읽힌다.
- `VITE_PROCUREMENT_DATA_MODE`(mock/hybrid/api)로 "실제 백엔드 없이도 화면을 개발/시연할 수 있게" 만든 것이 특징 — 프론트와 백엔드 팀이 동시에, 서로를 막지 않고 개발할 수 있게 하는 장치다.

### Backend
- API 라우팅 계층(`api/`, `assistant/api.py`, `pr/routes.py`)과 비즈니스 로직 계층(`services/`)과 실행 계층(`nodes/`, `workflow/`)이 폴더로 분리되어 있다.
- 서비스 계층(`workflow_service.py`)이 "HTTP 요청/응답"과 "LangGraph 실행"의 중간 다리 역할을 한다 — 라우터는 서비스 함수만 호출하고, 서비스는 FastAPI/HTTP를 전혀 모른다(예외를 던지기만 함, 03번 문서 참고).

### AI
- LLM 호출은 개별 노드(`find_substitute.py`, `sq_evaluation.py` 등) 안에 캡슐화되어 있고, 오케스트레이션(LangGraph)과는 레이어가 분리되어 있다 — 즉 "AI를 뺀 채로 그래프 구조만 테스트"하는 것이 원리적으로 가능한 구조다.

### Database
- PostgreSQL(프로젝션·인증) + SQLite(LangGraph 체크포인트, 도우미 FTS) 두 저장소를 목적에 따라 나눠 쓴다. "같은 데이터를 두 곳에 두는 건 비효율 아닌가?"라는 의문이 들 수 있는데, 이는 06번 문서에서 자세히 다룬다.

### ERPNext
- 구매 문서(Item/MR/RFQ/SQ/PO)의 유일한 원본(source of truth)이다. 이 프로젝트의 어떤 저장소도 ERPNext의 데이터를 "대체"하지 않고, 항상 "투영(projection)"하거나 "캐시"할 뿐이다.

### 외부 API
- Tavily/DART/Naver/OpenAI는 모두 "실패해도 전체 흐름이 멈추지 않아야 하는" 보조 시스템으로 취급된다(각 호출을 개별적으로 `try/except`로 감싸는 패턴, 04번 문서 참고).

### 사용자
- "구매 담당자"라는 단일 역할을 중심으로 설계되어 있다(현재는 담당자별 분리가 아니라 `assigned_to_me` 필터 정도). 공급사(Supplier)는 별도의 이메일 토큰 기반 접근(`pr/` 모듈, 로그인 없이 1회용 링크)으로 시스템에 참여한다 — 회사 내부 사용자와 외부 공급사를 **완전히 다른 인증 방식**으로 분리한 것이 특징이다.

### 데이터 흐름
```
ERPNext(원본) → webhook/polling → PostgreSQL(사건 기록 event_repository) → 케이스 upsert
                                                      │
                                LangGraph 실행(app.invoke) → SQLite 체크포인트
                                                      │
                                project_case_from_checkpoint() → PostgreSQL(화면용 프로젝션)
                                                      │
                                          SSE(NOTIFY) → 프론트 재조회 → 화면 갱신
```

## 3. 왜 기능을 여러 함수로 나눴는가?

`decide_bidding.py`의 `decide_bidding()` → `_decide_one_item()` → `_get_past_purchases()` → `_fetch_po_line()`처럼, 하나의 큰 작업을 **"한 가지 일만 하는" 작은 함수들로 쪼갠다.** 이유:

1. **테스트 가능성**: `_direct_purchase_fields(purchases, supplier=None)`처럼 순수 함수(입력만으로 출력이 결정되고, 외부 상태를 바꾸지 않는 함수)로 쪼개면, ERPNext 없이도 이 함수 하나만 단위 테스트할 수 있다.
2. **병렬화 단위**: `_decide_one_item`이 품목 하나를 판정하는 걸로 분리되어 있어서 `ThreadPoolExecutor`로 여러 품목을 동시에 처리할 수 있다. 만약 이 로직이 `decide_bidding()` 안에 전부 풀어져 있었다면 병렬화가 불가능했을 것이다.
3. **재사용**: `_get_past_purchases`는 `decide_bidding.py`뿐 아니라 `find_substitute.py`의 `_get_last_purchase_rate`와 매우 비슷한 조회 패턴을 공유한다(실제로 주석에 "decide_bidding.py와 같은 패턴 재사용"이라고 명시되어 있다).

## 4. 왜 파일을 여러 개로 나눴는가?

`nodes/` 폴더 안이 `mr/`, `supplier/`, `rfq/`, `quotation/`, `po/`, `item/`로 나뉜 것은 **"이 파일이 구매 프로세스의 어느 단계에 해당하는가"** 기준이다. `services/`가 `item_service.py`/`quotation_service.py`/`receipt_service.py`/`workflow_service.py`로 나뉜 것도 "이 서비스가 어떤 도메인 객체를 다루는가" 기준이다.

파일 분리의 이점은 함수 분리와 비슷하지만 한 차원 위에 있다: **"이 변경이 어디에 영향을 미치는지 예측 가능해진다."** 예를 들어 "공급사 탐색 로직만 고치고 싶다"면 `nodes/supplier/` 폴더만 열어보면 된다는 확신이 생긴다. 만약 모든 로직이 파일 하나에 있었다면, 아주 작은 수정도 "다른 부분에 영향이 없는지" 파일 전체를 다시 읽어야 했을 것이다.

## 5. 어떤 기준으로 모듈을 분리해야 하는가?

이 프로젝트에서 관찰되는 3가지 기준을 일반화하면:

1. **"바뀌는 이유"가 다르면 분리하라** (Single Responsibility 원칙의 실용적 해석). `erp_client.py`가 바뀌는 이유는 "ERPNext API가 바뀌어서"이고, `decide_bidding.py`가 바뀌는 이유는 "회사의 비딩 정책이 바뀌어서"다. 이 둘은 서로 다른 이유로 바뀌므로 다른 파일이어야 한다.
2. **"함께 배포/재사용되어야 하는 것"은 묶어라.** `assistant/` 폴더 하나가 도우미 기능 전체(모델, 어댑터, 라우트)를 담고 있는 것처럼, 하나의 완결된 기능은 하나의 폴더에 모은다.
3. **"의존성의 방향"을 한쪽으로만 흐르게 하라.** `nodes/*.py`는 `integrations/erp_client.py`를 참조하지만, 반대로 `erp_client.py`는 특정 `nodes/`를 알지 못한다. 이 방향성이 지켜져야 "erp_client만 다른 걸로 바꿔도 nodes는 안 바뀐다"는 03번 문서의 결론이 성립한다.

## 6. 새로운 기능을 추가하려면 어디에 추가해야 하는가?

예: "PO 발주 후 물류 추적(배송 상태 확인)"이라는 새 단계를 추가한다면 —

1. **State에 필드 추가**: `PurchaseProcessState`에 `shipment_status: str` 같은 키를 추가한다.
2. **새 노드 함수 작성**: `backend_logic2/nodes/logistics/track_shipment.py`에 `track_shipment_command(state) -> Command`를 만든다(기존 폴더 구조 규칙을 따라 새 하위 폴더 `logistics/`를 만든다).
3. **그래프에 등록**: `process_graph.py`의 `build_process_graph()`에 `graph.add_node("track_shipment", _with_status_log(...))`를 추가하고, 이 노드로 향하는 `goto`를 이전 노드(`create_po_command`)에 추가한다.
4. **화면 투영 매핑 추가**: `workflow_projection.py`의 상태→화면 매핑 테이블에 새 상태/단계를 추가한다.
5. **프론트에 새 단계 반영**: `src/procurement/api/cases.ts`의 `LEGACY_CASE_STATE`류 매핑과 `ProcurementWorkspace.tsx`의 단계별 필터 목록에 새 stage를 추가한다.
6. **화면 컴포넌트**: 필요하면 새 뷰(`views/ShipmentTrackingView.tsx`)를 만들거나 기존 `POManagementView.tsx`를 확장한다.

이 순서 자체가 "이 시스템에서 새 기능을 어디부터 손대야 하는가"에 대한 답이다: **State → Node → Graph 등록 → 화면 투영 → 프론트 화면**. 백엔드 상태 모델을 먼저 정의하지 않고 화면부터 만들면, 나중에 백엔드 State 구조와 프론트가 기대하는 모양이 어긋나기 쉽다.

## 7. 프로젝트 규모가 커지면 구조를 어떻게 바꿔야 하는가?

`AI_SYSTEM_ARCHITECTURE.md`의 6절("확장성과 추가 Fallback 설계 — 제안, 미구현")이 이 질문에 대한 팀 자신의 답을 이미 문서화해 두었다. 핵심만 요약:

- **지금의 한계**: `workflow_service.py`의 `_GRAPH_LOCK = RLock()`(프로세스 내부 락)과 로컬 SQLite 체크포인트는 **FastAPI 프로세스를 1개만 띄운다는 전제**에서만 안전하다. API 서버를 여러 대로 늘리면(수평 확장), 서로 다른 프로세스가 같은 케이스를 동시에 실행하거나 체크포인트 접근이 꼬일 수 있다.
- **제안된 해결 순서**: (1) 외부 쓰기(RFQ/PR/PO 발송)에 멱등키를 부여해 "같은 요청이 두 번 와도 중복 문서/메일이 안 생기게" 먼저 만들고 → (2) 프로세스 내부 락을 케이스별 분산 락(여러 서버가 공유하는 락)으로 바꾸고 → (3) SQLite 체크포인터를 여러 서버가 공유 가능한 저장소(PostgreSQL 체크포인터 등)로 바꾸고 → (4) 그제서야 API 서버 인스턴스를 늘린다.

이 순서에서 배울 수 있는 일반 원칙: **"여러 서버를 동시에 띄우기"는 확장의 마지막 단계지 첫 단계가 아니다.** 그전에 "동시에 실행돼도 안전한가(idempotency, 분산 락)"부터 해결하지 않으면, 서버를 늘리는 순간 데이터 정합성 문제가 터진다.

## 8. 새 프로젝트에 적용할 수 있는 설계 원칙 (요약)

1. **외부 시스템 호출은 한 모듈에 모아라** (`erp_client.py`) — 교체/모킹(테스트용 가짜 구현)이 쉬워진다.
2. **"판단"과 "제어 흐름"을 분리하라** — LLM은 판단만, 다음에 무엇을 할지는 코드(그래프 엣지)가 결정한다.
3. **원본 데이터와 화면용 사본을 구분하라** — ERPNext(원본)와 PostgreSQL 프로젝션(사본)처럼, "정확성이 중요한 원본"과 "빠른 조회가 중요한 사본"의 역할을 섞지 마라.
4. **되돌릴 수 없는 부작용(이메일 발송, 발주)에는 항상 안전장치를 둬라** — `TEST_MODE` 3단계 정책이 그 예다.
5. **사람이 책임져야 할 결정은 시스템이 대신 확정하지 않는다** — 최종 공급사 선정, PO 승인은 항상 사람의 명시적 액션을 기다린다.
6. **수평 확장은 "동시성 안전"이 확보된 뒤에 고려하라** — 순서를 바꾸면 데이터가 깨진다.
