# 04. AI 아키텍처 분석

이 문서는 프로젝트에 **실제로 존재하는 코드**만 다룬다. `docs/ai-architecture/AI_SYSTEM_ARCHITECTURE.md`에 나오는 "계획 단계(Qwen 전환 등)"는 별도로 명시하고, 지금 이 문서의 본문은 실제 배선된 경로만 "구현됨"으로 표시한다.

## 0. 이 프로젝트가 실제로 쓰는 것 vs 안 쓰는 것 (먼저 정리)

| 기술 | 사용 여부 |
|---|---|
| LLM 호출 (OpenAI) | ✅ 사용 |
| Prompt 템플릿 | ✅ 사용 |
| LangChain (`ChatOpenAI`, `PromptTemplate`) | ✅ 사용 (개별 LLM 호출 지점) |
| LangGraph (State/Node/Edge/Command) | ✅ 사용 (구매 프로세스 전체 오케스트레이션) |
| Structured Output (JSON 강제) | ✅ 사용하되, `.with_structured_output()` 같은 라이브러리 기능이 아니라 **프롬프트 지시 + 수동 `json.loads` 파싱**으로 구현됨 |
| Agent (LLM이 스스로 도구를 골라 호출) | ❌ **이 프로젝트가 말하는 "에이전트"는 자율 에이전트가 아니다.** 각 단계가 무엇을 호출할지는 파이썬 코드(`if`/그래프 엣지)가 결정하고, LLM은 "판단"만 한다. `AI_SYSTEM_ARCHITECTURE.md`도 이를 명시: "LLM이 다른 에이전트를 자유롭게 호출하는 구조가 아니라 각 노드가 Command(update=..., goto=...)로 상태와 다음 노드를 지정한다." |
| RAG / Embedding / Vector DB | ❌ **읽기전용 도우미조차 벡터 검색을 쓰지 않는다.** PostgreSQL 일반 쿼리 + SQLite FTS5(전문검색)로 구현되어 있다 (아래 8, 9번 참고). `sentence-transformers`가 `requirements.txt`에 있지만 이는 `backend_logic2/evaluation/`의 오프라인 공급사 검색 품질 평가 스크립트에서만 쓰이는 별도 도구다. |

---

## 1. LLM

**무엇인지**: 텍스트를 입력받아 텍스트를 생성하는 대규모 언어모델. 이 프로젝트는 OpenAI의 모델을 쓴다.

**왜 필요한지**: 규칙(if문)만으로는 "이 대체품이 실제로 쓸만한가", "이 두 견적 중 규격이 요청과 맞는 게 어느 것인가" 같은, 사람이 자연어/문맥으로 판단하는 일을 표현하기 어렵다.

**어디에 쓰이는지**: `find_substitute.py`(대체품 순위), `supplier_search.py`의 `structured_item_search_tool.py`(공급사 검색어 구조화), `sq_evaluation.py`(견적 비교), `assistant/`(도우미 챗봇).

**실제 코드** (`sq_evaluation.py`):
```python
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
```

**입력**: 프롬프트 문자열(텍스트). **출력**: 텍스트(대개 JSON 형식을 지시받은 문자열).

**없으면 어떻게 되는지**: 이 프로젝트에서 실제로 확인할 수 있는 예 — `erp_client.py`의 `call_ranking_model` 함수는 원래 AI가 들어갈 자리인데 지금은 자리표시자(placeholder)다:
```python
def call_ranking_model(item_code, candidates_with_signals):
    """[AI 호출 자리] ... 지금은 자리표시자(placeholder) — 실제 파인튜닝된 sLLM 연결 전."""
    sorted_candidates = sorted(candidates_with_signals, key=lambda c: c["past_order_count"], reverse=True)
    return [{"supplier": c["supplier"], "rank": i + 1, "reason": f"[placeholder] ..."} ...]
```
LLM이 없으면 "과거 거래 횟수 많은 순"이라는 아주 단순한 규칙으로 대체된다 — 판단의 품질이 떨어지지만 시스템 자체는 계속 동작한다. **이 프로젝트는 "AI 호출이 실패하거나 없어도 전체 흐름이 멈추지 않게" 설계하려는 의도가 곳곳에 보인다** (`sq_evaluation.py`의 견적 1건일 때 AI 호출 생략, `assistant/service.py`의 결정론적 fallback 등).

**다른 프로젝트에서는**: 분류/요약/추출/자연어 판단이 필요하지만 100% 정확도가 필수는 아닌 모든 곳(추천, 태깅, 1차 필터링)에 쓸 수 있다. **법적 책임이 따르는 최종 결정(이 프로젝트의 "최종 공급사 선정", "PO 승인")에는 LLM을 직접 쓰지 않고 항상 사람이 확정하게 한다**는 원칙을 기억하라.

---

## 2. Prompt

**무엇인지**: LLM에게 무엇을 해야 하는지 지시하는 텍스트.

**왜 필요한지**: LLM은 지시가 명확할수록 원하는 형식/품질로 답한다.

**실제 코드** (`find_substitute.py`, `_ai_rank_substitutes`):
```python
prompt = PromptTemplate.from_template(
    "요청품목: {item_name}\n"
    "요청품목 설명: {item_description}\n"
    "요청수량: {qty_needed}\n\n"
    "아래 후보 품목들 중에서, 실제로 요청품목을 대신 쓸 수 있는 것들만 "
    "골라서 적합도 순으로 순위를 매겨주세요 (최대 {max_results}개).\n\n"
    "후보 목록:\n{candidates}\n\n"
    "규칙:\n"
    "- 용도·사용대상이 명확히 다른 물건(...)은 이름이 비슷해도 제외하세요.\n"
    "- 스펙이 원본보다 낮아도(다운그레이드) 용도가 같으면 후보에 포함하되, reason에 그 사실을 명시하세요.\n"
    "...\n"
    '반드시 이 JSON 형식으로만 답하세요: {{"ranking": [{{"item_code": "...", "rank": 1, "reason": "짧은 이유"}}]}}'
)
```

**역할**: 이 프롬프트는 세 부분으로 구성된다 — (1) 판단에 필요한 사실 데이터(요청 품목, 후보 목록), (2) 판단 규칙(용도가 다르면 제외 등 도메인 지식), (3) 출력 형식 강제("반드시 이 JSON 형식으로만"). **이 구조가 이 프로젝트 모든 프롬프트에서 반복된다.**

**입력**: `{item_name}` 등 변수. **출력**: 채워진 프롬프트 문자열.

**없으면 어떻게 되는지**: 프롬프트가 모호하면 LLM이 JSON 대신 설명 문장을 반환하거나, 규칙(용도가 다른데도 포함시키는 등)을 어겨서 `json.loads`가 실패하거나 잘못된 판단이 나온다.

**다른 프로젝트에서는**: 어떤 LLM 호출이든 "무엇을, 어떤 형식으로, 어떤 예외 규칙과 함께" 답해야 하는지 항상 프롬프트에 명시하라. "형식만 지시하고 규칙(예외 케이스)을 안 적으면" 얼추 맞는 듯하지만 미묘하게 틀린 결과가 반복된다.

---

## 3. LangChain

**무엇인지**: LLM 호출, 프롬프트 템플릿, 체인(연결)을 다루기 쉽게 해주는 파이썬 라이브러리.

**왜 필요한지**: `ChatOpenAI` 객체와 `PromptTemplate`을 `|`(파이프) 연산자로 연결하면 "프롬프트 채우기 → LLM 호출"을 한 줄로 표현할 수 있다.

**실제 코드** (`find_substitute.py`):
```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
prompt = PromptTemplate.from_template("...")
result = (prompt | llm).invoke({"item_name": item_name, ...}).content
```

**역할**: `prompt | llm`은 "이 프롬프트 템플릿에 값을 채운 뒤 그 결과를 LLM에 넘겨라"는 파이프라인(체인)이다. `.invoke(dict)`가 실제 실행이고, `.content`가 LLM이 반환한 텍스트다.

**입력**: 템플릿 변수 dict. **출력**: LLM 응답 객체(`.content`로 텍스트 추출).

**없으면 어떻게 되는지**: `openai` SDK를 직접 써서 `client.chat.completions.create(...)`를 호출해도 결과는 같다(실제로 `assistant/adapters/openai_responses.py`는 LangChain 없이 raw `openai` SDK를 쓴다 — 6번 참고). LangChain은 "편의 라이브러리"이지 필수가 아니다.

**다른 프로젝트에서는**: 여러 프롬프트를 연쇄로 엮거나(체인), 다양한 LLM 제공자를 같은 인터페이스로 바꿔가며 실험할 때 유용하다. 단순히 "프롬프트 하나 → 응답 하나"만 필요하면 SDK를 직접 써도 충분하다(이 프로젝트의 도우미 모듈이 그 예다).

---

## 4. LangGraph

**무엇인지**: 여러 단계(노드)를 상태 기계(state machine)로 연결해 실행하는 오케스트레이션 라이브러리. "Agent 프레임워크"로 소개되는 경우가 많지만, 이 프로젝트는 **자율 에이전트가 아니라 명시적 상태 기계**로 쓴다.

**왜 필요한지**: 구매 프로세스는 9단계 이상이고, 중간에 여러 번 사람의 입력을 기다려야 하며(며칠씩 걸릴 수도 있음), 서버가 재시작돼도 "어디까지 진행됐는지"를 잃으면 안 된다. 이걸 `if`/`while` 조합의 평범한 함수 하나로 짜면, 사람의 응답을 기다리는 동안 함수를 어떻게 "일시정지"시키고 나중에 정확히 그 지점부터 "재개"할지가 매우 복잡해진다. LangGraph는 이 "일시정지→체크포인트 저장→재개"를 프레임워크 수준에서 해결해준다.

**어디에 쓰이는지**: `backend_logic2/workflow/process_graph.py`, `process_commands.py` 전체.

**실제 코드**: `01_execution_flow.md`의 B, C 섹션 참고. 핵심만 다시 보면:
```python
graph = StateGraph(PurchaseProcessState)
graph.add_node("check_mr_item", ...)
graph.add_node("decide_bidding_choice", ...)
...
graph.add_edge(START, "route_entrypoint")
return graph.compile(checkpointer=checkpointer)
```

**입력**: 초기 상태 dict(`{"mr_name": ..., "case_id": ..., "status": "started"}`). **출력**: 최종 상태(또는 `interrupt()` 지점에서 멈춘 미완료 상태), SQLite에 체크포인트로 저장됨.

**없으면 어떻게 되는지**: `backend_logic/`(옛 버전, "legacy"로 표시됨)에 `pipeline_graph`, `resume_pending.py` 같은 파일이 남아있는데, 이는 LangGraph 이전에 직접 구현을 시도했던 흔적으로 보인다 — 상태 저장/재개를 직접 구현하면 코드가 훨씬 복잡해지고 버그(중복 실행, 재개 지점 오류)가 생기기 쉽다.

**다른 프로젝트에서는**: 여러 단계로 이뤄지고, 사람의 승인/입력을 기다리는 지점이 2개 이상 있는 워크플로(입사 프로세스, 대출 심사, 콘텐츠 검수 파이프라인 등)에 적합하다. 단계가 2~3개뿐이고 사람 개입이 없다면 LangGraph는 과설계다 — `08_rebuild_project.md`에서 이 판단 기준을 더 다룬다.

---

## 5. State

**무엇인지**: 그래프가 실행되는 동안 계속 전달·누적되는 데이터.

**실제 코드** (`process_commands.py`):
```python
class PurchaseProcessState(TypedDict, total=False):
    mr_name: str
    case_id: str
    status: str
    bidding_results: dict[str, Any]
    selected_suppliers: list[str]
    quotation_ranking: list[dict[str, Any]]
    selected_supplier: str
    pr_id: str
    po_name: str
    error: str
```

**역할**: 노드마다 "지금까지 무엇을 알아냈는가"를 이 하나의 dict에 계속 쌓는다. 예를 들어 `decide_bidding_choice_command`가 넣은 `bidding_results`를 몇 단계 뒤의 `create_po_command`가 그대로 읽어 쓸 수 있다.

**입력/출력**: 각 노드 함수는 이 State(dict)를 입력받고, `Command(update={...})`로 갱신할 부분만 반환한다(전체를 새로 만들지 않는다 — 병합 방식).

**없으면 어떻게 되는지**: 각 노드가 필요한 데이터를 매번 ERPNext/DB에서 새로 조회해야 한다 — 느려지고, 조회 시점 차이로 인한 불일치(예: 조회 사이에 값이 바뀜)가 생길 수 있다.

**다른 프로젝트에서는**: 여러 단계가 공유해야 하는 값(사용자가 입력한 값, 이전 단계의 계산 결과)이 있다면 반드시 명시적인 State 구조로 표현하라 — 전역 변수나 곳곳의 함수 인자로 흩뿌리지 마라.

---

## 6. Node

**무엇인지**: 그래프의 실행 단위 하나. 이 프로젝트에서는 `Command`를 반환하는 파이썬 함수.

**실제 코드**: `process_commands.py`의 `route_entrypoint_command`, `check_mr_item_command`, `decide_bidding_choice_command` 등 19개 함수.

**역할**: 각 노드는 "이 시점에 무엇을 하고(ERPNext 조회, AI 호출, 검증), 상태를 어떻게 바꾸고, 다음에 어디로 갈지"를 스스로 결정한다. 노드 하나의 책임 범위가 명확해서(예: `decide_bidding_choice_command`는 "비딩 필요 여부만" 판정) 테스트하거나 수정하기 쉽다.

**없으면 어떻게 되는지**: 모든 로직이 하나의 거대한 함수 안에 있으면, 특정 단계만 수정하거나 테스트하기가 매우 어려워진다.

**다른 프로젝트에서는**: "이 워크플로에서 의미 있게 구분되는 단계가 무엇인가"를 먼저 목록으로 적어본 뒤, 그 목록 하나하나를 노드로 만들어라.

---

## 7. Edge / Router

**무엇인지**: 어떤 노드에서 다음에 어떤 노드로 갈지 정하는 연결. 이 프로젝트는 정적 엣지(`graph.add_edge(START, "route_entrypoint")`, 그래프 진입점 단 하나)만 명시적으로 선언하고, **나머지 모든 분기는 각 노드가 반환하는 `Command(goto=...)`로 동적으로 결정**한다(LangGraph 용어로는 "조건부 엣지"를 각 노드 내부에 분산시킨 형태).

**실제 코드** (`decide_bidding_choice_command`, 라우팅 예):
```python
if not bidding_items:
    ...
    return Command(update={...}, goto="await_order_start")   # 직접구매 경로
return Command(update={...}, goto="resolve_suppliers_choice")  # 비딩 경로
```

**역할**: "비딩이 필요 없으면 곧장 발주 대기로, 필요하면 공급사 확인 단계로" 같은 분기를 이 한 줄(`goto=...`)이 표현한다. `handle_pr_rejection_command`는 3갈래(`select_next_supplier`/`rebid`/`cancel`)로 분기하는 라우터 역할도 겸한다.

**입력**: 현재 State + 이번 노드의 판단 결과. **출력**: 다음에 실행할 노드 이름(문자열) 또는 `END`.

**없으면 어떻게 되는지**: 분기가 없으면 모든 MR이 항상 같은 순서로만 처리돼야 하는데, 실제로는 "대체품이 있는가", "긴급 발주인가", "PR을 거절당했는가"에 따라 완전히 다른 경로를 타야 한다.

**다른 프로젝트에서는**: 상태에 따라 다음 단계가 갈리는 모든 곳(주문 상태에 따른 배송/환불/취소 분기 등)에 이 패턴을 쓸 수 있다.

---

## 8. Structured Output

**무엇인지**: LLM이 자유 텍스트가 아니라 정해진 스키마(JSON 등)로 답하게 강제하는 것.

**이 프로젝트의 실제 구현 방식**: 라이브러리의 `.with_structured_output()` 기능은 쓰지 않는다. 대신 **프롬프트로 형식을 지시 + 응답 문자열을 수동으로 정리해서 `json.loads`로 파싱**한다(`find_substitute.py`, `sq_evaluation.py` 공통 패턴):
```python
result = (prompt | llm).invoke({...}).content
try:
    cleaned = result.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(cleaned).get("ranking", [])
except Exception as e:
    print(f"... AI 응답 파싱 실패: {e}")
    return []
```
반면 `quotation_filter/quotation_models.py`(문서 추출 파이프라인, sq_evaluation과는 별도 모듈)는 pydantic으로 더 엄격하게 구조를 강제한다:
```python
class QuotationItem(StrictModel):   # ConfigDict(extra="forbid")로 예상 밖 필드를 거부
    item_code: str | None = None
    item_name: str
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
```

**입력**: LLM 응답 문자열. **출력**: 검증된 파이썬 dict/list 또는 pydantic 객체(검증 실패 시 예외).

**없으면 어떻게 되는지**: LLM이 자유 문장으로 답하면 프로그램이 그 결과를 신뢰성 있게 파싱할 수 없다 — 사람이 매번 읽고 수동으로 옮겨 적어야 한다.

**다른 프로젝트에서는**: LLM 출력을 프로그램이 다음 단계에 자동으로 넘겨야 한다면(사람이 읽기만 하는 게 아니라), 반드시 구조화 출력 + 검증(가능하면 pydantic처럼 타입까지 강제하는 방식)을 쓰라. 파싱 실패에 대한 fallback(빈 리스트 반환 등)도 항상 같이 설계하라.

---

## 9. RAG / Embedding / Vector DB

**이 프로젝트의 실제 상태**: **셋 다 프로덕션 경로에서 사용되지 않는다.** 읽기 전용 도우미(`assistant/`)가 "회사 데이터를 찾아 답한다"는 점에서 RAG처럼 보일 수 있지만, 실제 구현은 다음과 같다:

- `backend_logic2/assistant/adapters/postgres_procurement_query.py`: 벡터 유사도 검색이 아니라 **일반 SQL 조건 검색**(`WHERE` 절)으로 케이스를 조회한다.
- `backend_logic2/assistant/adapters/sqlite_help_knowledge.py`: 도움말 문서를 **SQLite FTS5(키워드 기반 전문검색)**로 찾는다 — 의미 기반(semantic) 검색이 아니라 키워드 매칭이다.
- `backend_logic2/assistant/adapters/json_feature_catalog.py`: 화면 기능 안내를 JSON 카탈로그에서 문자열 매칭으로 찾는다.

**AI_SYSTEM_ARCHITECTURE.md도 이를 명시적으로 확인해준다**: "현재 이를 벡터 DB·임베딩 기반 RAG로 표시하지 않는다."

`sentence-transformers`가 `requirements.txt`에 있는 이유는 `backend_logic2/evaluation/vendor_retrieval_eval.py`(신규 공급사 검색 파이프라인의 정확도를 오프라인으로 평가하는 스크립트)가 임베딩 유사도로 평가지표를 계산하기 때문이다 — **이건 검색 자체의 런타임 구현이 아니라, 검색 품질을 나중에 측정하기 위한 평가 도구**다.

**왜 필요한지(만약 도입한다면)**: 정형 데이터(케이스 상태, 도움말 문서 몇십 개)는 SQL/키워드 검색만으로 충분히 빠르고 정확하다. RAG/임베딩/벡터DB는 "문서가 매우 많고, 사용자의 질문이 문서의 정확한 단어를 안 쓸 가능성이 높을 때"(예: 수천 페이지의 매뉴얼, 다양한 표현의 고객 문의) 비로소 SQL/키워드 검색보다 이점이 커진다.

**없으면 어떻게 되는지(지금 이 프로젝트의 실제 결과)**: 도움말 검색이 사용자가 정확히 관련 키워드를 입력하지 않으면 못 찾을 수 있다는 한계가 있다. 하지만 문서 수가 적고 도메인이 좁은 사내 도구에서는 이 한계가 실질적으로 크지 않다 — **"필요하지 않은 복잡도를 미리 들이지 않는다"**는 설계 판단이 반영된 것으로 볼 수 있다.

**다른 프로젝트에서는**: 검색 대상 문서가 수백~수천 건 이상이고 사용자의 질문 표현이 다양하다면 임베딩+벡터DB(RAG)를 고려하라. 그전에 먼저 "키워드 검색만으로 충분한가"를 실측해보는 것을 권한다 — 이 프로젝트가 그 순서를 보여주는 실제 사례다.

---

## 10. Tool / Agent 개념에 대한 정정

일반적으로 "AI 에이전트"라 하면 "LLM이 스스로 어떤 도구(함수)를 언제 호출할지 결정"하는 구조(예: LangChain의 `AgentExecutor`, 함수 호출/tool-calling)를 떠올리기 쉽다. 이 프로젝트의 `AI_SYSTEM_ARCHITECTURE.md`는 "에이전트별 역할" 표를 두면서도 이렇게 못박는다:

> "이 문서의 '에이전트'는 역할별 논리 모듈을 뜻하며, 각각 독립 서버나 자율 에이전트로 배포되었다는 의미는 아니다."

즉 이 프로젝트에서 "공급사 탐색 에이전트", "견적 비교 에이전트"라고 부르는 것들은 사실 **"LLM 호출이 포함된 일반 파이썬 함수"**다. LLM이 "다음에 Tavily를 검색할지 DART를 검색할지"를 스스로 결정하지 않는다 — `supplier_search.py`의 파이썬 코드가 "Tavily 먼저, 안 되면 DART, 그래도 안 되면 Naver" 순서를 고정으로 정해놓았다.

**이 구분이 왜 중요한가**: "에이전트"라는 용어에 현혹되지 말고, 실제 코드를 열어 "다음 행동을 누가(LLM인지 코드인지) 결정하는가"를 직접 확인하는 습관을 들여라. 이 프로젝트는 **"판단은 LLM에게, 제어 흐름은 코드에게"**라는 원칙을 일관되게 지킨다 — 이는 실무에서 자율 에이전트보다 훨씬 예측 가능하고 디버깅하기 쉬운 선택이다.
