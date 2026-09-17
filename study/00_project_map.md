# 00. 프로젝트 지도 (Project Map)

> 이 문서를 포함한 `study/` 폴더의 모든 문서는 두 개의 실제 저장소만 근거로 삼는다.
> - 프론트엔드: `SKN31-FINAL-front` (현재 VSCode에서 연 프로젝트)
> - 백엔드: `SKN31-FINAL-3Team` (형제 저장소, `C:\documents\최종프로젝트\SKN31-FINAL-3Team`)
>
> `docs/ai-architecture/FRONTEND_OVERVIEW.md`는 2026-08-24 시점 문서라 `OperationsWorkspace.jsx`, `ChatWorkspace.jsx` 같은 **지금은 존재하지 않는 옛 구조**를 설명한다. 반면 `docs/ai-architecture/AI_SYSTEM_ARCHITECTURE.md`는 2026-09-11 기준으로 백엔드 함수 호출을 직접 검증하며 쓰여 있어 신뢰도가 높다. 이 학습 자료는 실제 `src/`, `backend_logic2/` 코드를 직접 읽고 검증한 내용만 담는다 — 오래된 문서와 실제 코드가 다르면 실제 코드를 따른다. **이것 자체가 첫 번째 교훈이다: 문서는 코드보다 먼저 낡는다. 코드를 항상 1차 자료로 삼아라.**

## 1. 프로젝트의 목적

**BiddingFlow**는 ERPNext(오픈소스 ERP) 위에서 동작하는 **구매 업무 자동화 시스템**이다. 회사에서 물건이 필요하면(재고 부족, 신규 프로젝트 등) 구매 요청(Material Request, MR)이 생기고, 그 뒤로 "이걸 새로 살까 대체품을 쓸까", "경쟁 입찰을 붙일까 그냥 살까", "어느 공급사한테 견적을 받을까", "누구 견적이 제일 좋을까", "발주서(PO)를 언제 보낼까" 같은 반복적이지만 판단이 필요한 의사결정이 계속 발생한다.

이 시스템은 이 흐름을 **완전 자동화하지 않고, 자동화와 사람의 판단을 명시적으로 분리**한다. 규칙이 명확한 부분(과거 구매 이력 조회, 금액 계산, 공급사 검색)은 백엔드가 자동으로 처리하고, 책임이 필요한 결정(최종 공급사 선정, 신규 업체 서류 승인, PO 최종 승인)은 항상 사람이 화면에서 명시적으로 확정하게 만든다.

## 2. 사용자 입장에서 해결하는 문제

구매 담당자 입장에서 기존에는 다음을 전부 수작업으로 했다:
- ERPNext에 새 MR이 올라왔는지 계속 확인
- 이 품목을 지금 재고에서 대체할 수 있는지 직접 찾아보기
- 이번 건이 입찰(비딩)이 필요한 금액/조건인지 규정을 다시 찾아보기
- 공급사를 인터넷에서 검색하고 연락처를 알아내기
- 여러 공급사 견적을 엑셀 등으로 직접 비교
- 신규 업체면 사업자등록증 등 서류를 하나하나 확인
- 발주서를 만들고 이메일로 보내기

BiddingFlow는 이 단계들을 하나의 화면(구매 대시보드 → MR 목록 → 협력사 선정 → PO 관리)으로 연결하고, AI가 후보를 찾고 비교한 "근거"까지 같이 보여줘서 사람은 **판단만** 하면 되게 만든다. 즉 해결하는 문제는 "반복 조사 업무를 없애고, 사람은 진짜 결정에만 집중하게 하는 것"이다.

## 3. 전체 기능 목록

| 화면(프론트) | 기능 |
|---|---|
| 구매 대시보드 (`dashboard`) | 승인 대기/견적 회신/협력사 승인/PO 생성 현황 요약 |
| 아이템 목록 (`item-register`) | ERPNext 등록 품목 조회, AI 검증 규격 확인/승인 |
| MR 목록 (`mr-list`) | ERPNext에서 들어온 구매 요청 승인/반려, 대체품 확인 시작 |
| 협력사 선정 (`vendor-select`) | 공급사 탐색 결과 확인, RFQ 발송 대상 선택, 견적 비교, 최종 공급사 선정 |
| PO 관리 (`po-manage`) | 공급사 수주 요청(PR) 발송/응답 확인, PO 승인·발송, 입고·인보이스·평가 관리 |
| 업무 도우미 챗봇 | 화면 사용법 안내, MR 상태 조회 (구매 데이터를 바꾸는 기능은 없음) |

백엔드는 이 화면들이 호출하는 API 뒤에서 다음을 수행한다: MR 수집(webhook/polling) → 대체품 탐색(AI) → 비딩 필요 여부 판정(규칙) → 기존/신규 공급사 탐색(AI+웹검색) → RFQ 생성·발송(ERPNext) → 견적 비교(AI) → (사람) 최종 선정 → 신규업체 서류 검토 → PR(수주요청) 발송·응답 처리 → PO 생성·발송(ERPNext) → 입고/인보이스 반영.

## 4. 폴더 구조

### 4.1 프론트엔드 (`SKN31-FINAL-front`)

```
src/
├─ main.jsx                     # React 진입점
├─ App.jsx                      # 로그인 상태 관리 + 워크스페이스/도우미 조립
├─ utils/auth.js                # JWT 저장, fetchWithAuth(401 자동 재발급)
├─ components/
│  ├─ auth/LoginPage.jsx        # ERPNext 계정으로 로그인
│  ├─ assistant/                # AssistantDock.jsx, assistantApi.js — 읽기전용 도우미 챗봇
│  └─ common/                   # 순수 장식용 컴포넌트(파도 애니메이션 등)
└─ procurement/                 # 실제 업무 로직 전부 (TypeScript)
   ├─ ProcurementWorkspace.tsx  # 탭 전환·전역 상태를 쥔 컨테이너 (2160줄)
   ├─ api/                      # cases.ts, items.ts, notifications.ts, prApi.ts
   ├─ views/                    # DashboardView, MRListView, VendorSelectionView, POManagementView, ItemRegistrationView
   ├─ components/               # 모달, 표, 워크플로 인터럽트 폼 등 재사용 UI
   ├─ hooks/                    # useProcurementNotifications(SSE), useStageTransitionItems, useSessionTableState
   ├─ types/index.ts            # 프론트 전역 타입 정의
   └─ mock/data.ts              # mock 모드용 샘플 데이터
```

### 4.2 백엔드 (`SKN31-FINAL-3Team`)

```
main.py                          # FastAPI 앱, CORS, 라우터 등록, 백그라운드 폴링 태스크
auth_service/                    # 로그인/JWT 발급/리프레시
backend_logic2/
├─ integrations/erp_client.py    # ERPNext REST API 클라이언트 (requests 기반)
├─ nodes/                        # 업무 단계별 로직 (LangGraph 노드가 호출하는 실제 함수들)
│  ├─ mr/decide_bidding.py       # 비딩 필요 여부 규칙판정
│  ├─ mr/find_substitute.py      # 대체품 탐색 (AI 2회 호출)
│  ├─ supplier/supplier_search.py# 신규 공급사 탐색 파이프라인 (Tavily→DART→Naver)
│  ├─ supplier/onboarding.py     # 신규 업체 서류 검토
│  ├─ rfq/send_rfq.py            # RFQ 생성+발송
│  ├─ quotation/sq_evaluation.py # 견적 비교 (AI)
│  └─ po/create_and_send_po.py   # PO 생성+발송
├─ workflow/
│  ├─ process_commands.py        # LangGraph 노드 함수(Command 반환) — 사실상 "메인 시나리오"
│  └─ process_graph.py           # 위 노드들을 그래프로 등록·컴파일, SQLite 체크포인터
├─ assistant/                    # 읽기전용 챗봇 (ports/adapters 구조)
├─ pr/                           # 공급사 수주요청(PR) 이메일 토큰 발송/응답 처리
├─ services/                     # workflow_service, quotation_service, receipt_service 등 — DB 프로젝션/폴링
└─ repositories/                 # PostgreSQL 접근 (cases, tasks, notifications, deliveries)
```

## 5. 주요 파일 역할 (핵심만)

| 파일 | 역할 |
|---|---|
| `main.py` | FastAPI 앱 생성, 라우터 등록, ERPNext polling 백그라운드 태스크 |
| `backend_logic2/integrations/erp_client.py` | ERPNext와의 모든 HTTP 통신을 감싸는 함수 모음 (`erp_get`, `erp_post`, `erp_submit`, `erp_send_email` 등) |
| `backend_logic2/workflow/process_commands.py` | 9단계 구매 프로세스의 각 단계를 함수로 구현 (`Command(update=..., goto=...)` 반환) |
| `backend_logic2/workflow/process_graph.py` | 위 함수들을 `StateGraph`에 노드로 등록하고 컴파일 |
| `backend_logic2/nodes/mr/decide_bidding.py` | "이 품목 지금 입찰 붙여야 하나?"를 순수 규칙으로 판정 |
| `backend_logic2/nodes/mr/find_substitute.py` | 재고에 있는 대체 가능한 품목을 AI로 탐색 |
| `backend_logic2/nodes/supplier/supplier_search.py` | 신규 공급사를 웹에서 찾아 연락처까지 확보 |
| `backend_logic2/nodes/quotation/sq_evaluation.py` | 여러 공급사 견적을 AI로 비교·순위 |
| `backend_logic2/assistant/service.py` | 읽기 전용 도우미의 의도 분류→조회→답변 생성 |
| `src/procurement/ProcurementWorkspace.tsx` | 프론트의 전역 상태(요청 목록, 공급사 그룹, PO 목록)와 화면 전환을 담당 |
| `src/procurement/api/cases.ts` | 백엔드 `ProcurementCaseDTO`를 프론트 화면 모델로 변환하는 핵심 매핑 로직 |
| `src/utils/auth.js` | JWT 저장·자동 재발급이 담긴 `fetchWithAuth` — 거의 모든 API 호출이 이걸 통과 |

## 6. 핵심 모듈 개념 정리

- **`erp_client.py`**: "ERPNext는 이렇게 부른다"를 한 곳에 모아둔 게이트웨이. 이 파일이 없으면 모든 노드가 각자 `requests.get(...)`을 반복해서 썼을 것이다.
- **LangGraph 워크플로**: 구매 프로세스 전체를 하나의 상태 기계(state machine)로 표현. 각 노드는 "상태를 어떻게 바꾸고 다음에 어디로 갈지"만 결정한다.
- **`interrupt()`**: 사람의 입력이 필요한 지점에서 그래프 실행을 일시정지시키는 LangGraph 함수. 나중에 `Command(resume=답변)`으로 재개한다.
- **PostgreSQL 프로젝션**: LangGraph 상태(SQLite 체크포인트)는 화면이 빠르게 조회하기엔 불편한 형태라, `case_id` 기준으로 화면이 보기 좋은 형태로 PostgreSQL에 "투영(projection)"해 둔다.

## 7. 외부 API

| 서비스 | 용도 | 인증 방식 |
|---|---|---|
| **ERPNext** | 구매 문서(Item, Material Request, RFQ, Supplier Quotation, Purchase Order 등)의 원본 저장소 | API Key + Secret (`Authorization: token KEY:SECRET`) |
| **OpenAI (gpt-4o-mini)** | 대체품 판단, 견적 비교·순위, 신규 공급사 후보 판단 등 3곳에서 사용 | `OPENAI_API_KEY` |
| **OpenAI 계열 "Luna" 모델(`gpt-5.6-luna`)** | 읽기 전용 도우미 챗봇의 의도 분류·답변 생성 | `ASSISTANT_MODEL` |
| **Tavily** | 신규 공급사 후보를 웹에서 검색 | `TAVILY_API_KEY` |
| **DART(금융감독원 전자공시)** | 검색된 회사명이 실존 법인인지 검증, 홈페이지 확보 | `DART_API` |
| **Naver 검색 API** | DART로 못 찾은 후보의 연락처 보완 | `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` |

## 8. 데이터베이스

- **PostgreSQL** (`NEXTERP_DATABASE_URL`): 화면 조회용 프로젝션(케이스, 작업(task), 알림, 배송/평가), 로그인 인증 저장소(`DATABASE_URL`), 공급사 탐색 캐시(`supplier_search_cache`), AI 판단 로그(`ai_decision_log`).
- **SQLite**: LangGraph 실행 체크포인트(`process_checkpoints.sqlite`, `thread_id` 단위로 실행 중단·재개 지점을 저장) — 화면용 데이터가 아니라 "이 그래프가 지금 어디서 멈춰 있는지"를 저장하는 내부 저장소. 도우미의 도움말 전문검색(FTS5)도 별도 SQLite(`help.sqlite3`)를 쓴다.

## 9. AI/LLM

세 가지 서로 다른 목적의 LLM 호출이 있다 (자세한 내용은 `04_ai_architecture.md`):
1. 업무 판단용 GPT-4o-mini 3곳 (대체품 판단, 공급사 후보 판단, 견적 비교)
2. 읽기 전용 도우미용 `gpt-5.6-luna` (설정 가능한 모델명, 실제 가용성은 검증되지 않음 — 문서에 명시된 표현 그대로)
3. (계획 단계, 아직 배선 전) 손글씨 견적서 OCR/판단을 로컬 Qwen 모델로 이전하는 계획 — `quotation_filter/` 모듈에 코드는 있으나 주 그래프(`sq_evaluation`)와는 아직 연결되지 않음

## 10. Backend

FastAPI(Python) + LangGraph(상태기반 오케스트레이션) + `requests`(ERPNext REST 클라이언트) + PostgreSQL/SQLite. 인증은 자체 JWT(`auth_service/`)이며, ERPNext 로그인 자격증명을 검증한 뒤 발급한다.

## 11. Frontend

React 19 + TypeScript + Vite 8. 라우팅 라이브러리도, Redux/Zustand 같은 전역 상태 라이브러리도 없다 — `useState`/`useMemo`/커스텀 훅만으로 구성된 순수 React다. `VITE_PROCUREMENT_DATA_MODE`(`mock`/`hybrid`/`api`) 환경변수로 목업 데이터와 실제 API 연동을 전환할 수 있다.

## 12. ERP/API 연동

프론트는 백엔드만 호출하고(ERPNext를 직접 호출하지 않음), 백엔드가 ERPNext를 대신 호출한다. 이 구조를 **BFF(Backend for Frontend) 패턴**이라 부른다 — 프론트가 ERPNext의 API Secret을 알 필요가 전혀 없다(`erp_download_file`의 주석에도 "브라우저에는 ERPNext API Secret을 절대 전달하지 않습니다"라고 명시됨). Vite 개발 서버는 `/api`와 `/purchase` 요청을 백엔드(`http://127.0.0.1:8000`)로 프록시한다.

## 13. 환경변수

### 백엔드 (`.env`, 발췌)
```
SITE_URL / API_KEY / API_SECRET        # ERPNext 접속 정보
DATABASE_URL                            # 로그인 인증용 PostgreSQL
NEXTERP_DATABASE_URL                    # 구매 프로젝션용 PostgreSQL
JWT_SECRET / JWT_ALGORITHM / ...        # 자체 로그인 토큰
MR_INGEST_MODE                          # polling | webhook
TEST_MODE                               # true(전체차단) | custom_only | false(실제발송)
OPENAI_API_KEY / ASSISTANT_MODEL
TAVILY_API_KEY / NAVER_CLIENT_ID / NAVER_CLIENT_SECRET / DART_API
FRONTEND_ORIGINS                        # CORS 허용 출처
```

### 프론트엔드 (`.env`, 발췌)
```
VITE_API_BASE_URL           # 기본값 http://127.0.0.1:8000 (Vite 프록시 대상)
VITE_PROCUREMENT_DATA_MODE  # mock | hybrid | api
```

## 14. 실행 방법

```powershell
# 백엔드
cd SKN31-FINAL-3Team
.\.venv\Scripts\python.exe main.py     # http://127.0.0.1:8000

# 프론트엔드
cd SKN31-FINAL-front
npm install
npm run dev                             # Vite dev server, /api, /purchase를 백엔드로 프록시
```

---

## 15. "내가 이 프로젝트를 처음부터 다시 만든다면 어떤 순서로 만들어야 하는가?"

실제 코드에 남아있는 설계 흔적(`erp_client.py`의 "여기서부터 실행되는 부분" 주석들, `decide_bidding.py`의 "실행: python -m ..." 안내)을 보면 이 프로젝트는 **"항상 실행 가능한 가장 작은 조각부터 → 점점 자동화 → 마지막에 사람 개입 지점을 정리"** 순서로 커졌다는 게 보인다. 다시 만든다면 다음 순서를 권장한다.

1. **ERPNext 연결 확인** — `erp_client.py`의 `erp_get`/`erp_get_one` 두 함수만 먼저 만들어서 Item, Material Request를 읽어본다. (API 자체가 안 되면 그 다음은 다 무의미하다.)
2. **읽기 전용 CLI 스크립트** — 화면도, 프레임워크도 없이 "MR 하나를 읽어서 품목을 출력"하는 순수 함수+`if __name__ == "__main__"` 스크립트로 시작한다. (`decide_bidding.py`, `find_substitute.py`가 실제로 이 형태로 시작했다.)
3. **핵심 비즈니스 규칙 하나를 구현** — AI 없이 규칙만으로 판단하는 로직(`decide_bidding`)부터 만든다. 규칙 기반은 테스트하기 쉽고, AI를 붙이기 전에 "무엇을 판단해야 하는가"를 명확히 해준다.
4. **쓰기 API 연결** — `erp_post`, `erp_submit` 등 ERPNext에 문서를 만드는 함수를 추가한다. 이 시점부터 되돌리기 어려운 부작용(실제 이메일 발송 등)이 생기므로 `TEST_MODE` 같은 안전장치를 최우선으로 설계한다.
5. **AI 호출 지점 추가** — 규칙만으로 못 정하는 판단(대체품 추천, 공급사 후보 평가)에 LLM을 붙인다. 이때 "AI가 틀리면 무슨 일이 생기는가"를 먼저 정하고 구현한다(예: 반드시 사람 승인 경유).
6. **웹 API 서버로 승격** — 지금까지의 함수들을 FastAPI 라우터로 감싼다. 이 시점에 처음으로 "동시에 여러 요청이 들어올 수 있다"는 문제가 생긴다.
7. **여러 단계를 하나의 흐름으로 연결** — 단계가 5개 이상으로 늘어나고 사람의 입력을 기다려야 하는 지점이 생기면, 그때 비로소 LangGraph 같은 상태 기계 프레임워크를 도입한다(처음부터 쓰지 않는 이유는 `08_rebuild_project.md`에서 다룬다).
8. **프론트엔드는 목업(mock) 데이터로 먼저** — 백엔드 API 스펙이 자주 바뀌는 초기에는 프론트를 `mock` 모드로 개발해 백엔드 변경에 발목 잡히지 않는다. 이 프로젝트가 실제로 `VITE_PROCUREMENT_DATA_MODE=mock/hybrid/api` 3단계를 둔 이유가 이것이다.
9. **화면과 실제 API 연결(hybrid → api)** — 화면별로 하나씩 mock을 실제 API 호출로 교체한다.
10. **알림·실시간성 추가** — SSE, 폴링 등은 가장 마지막에 붙인다. "데이터가 정확히 보이는가"가 검증된 뒤에야 "언제 알려줄 것인가"를 고민하는 게 순서다.
11. **운영 안전장치 마무리** — 이메일 발송 정책(`TEST_MODE`), 실패 시 재시도, 체크포인트 삭제 정책처럼 "잘못되면 되돌리기 어려운 것들"을 마지막에 촘촘히 다진다.

이 순서의 공통 원칙: **"되돌릴 수 없는 부작용(실제 발송, 실제 발주)을 만드는 코드는 최대한 나중에, 최대한 많은 안전장치와 함께 추가한다."**
