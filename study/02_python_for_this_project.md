# 02. 이 프로젝트를 위한 Python 문법

일반 파이썬 강의 순서가 아니라, **이 코드베이스에서 실제로 어떻게 쓰였는지**를 기준으로 정리한다. 각 항목은 1) 개념, 2) 실제 코드, 3) 이 코드에서의 역할, 4) 다른 프로젝트에서 쓰는 시점, 5) 연습문제 순서로 구성된다.

각 연습문제는 정답을 주지 않는다. 직접 파이썬 파일을 만들어서 실행해보고, 안 되면 왜 안 되는지 스스로 찾아보라.

---

## 1. 변수·자료형

**개념**: 이름에 값을 붙이는 것. 파이썬은 타입을 미리 선언하지 않는다(동적 타입).

**실제 코드** (`backend_logic2/nodes/mr/decide_bidding.py`):
```python
AMOUNT_THRESHOLD = 20_000_000
MIN_ORDERS_FOR_PATTERN = 3
IRREGULAR_CV_THRESHOLD = 0.5
```

**역할**: 모듈 최상단에 대문자로 쓴 상수는 "이 정책을 나중에 바꿀 수도 있다"는 신호다. 숫자를 코드 중간에 흩어놓지 않고 한 곳에 모아두면, 정책이 바뀔 때 한 줄만 고치면 된다. `20_000_000`처럼 밑줄로 자릿수를 나눈 것도 눈에 잘 들어오게 하는 관례다.

**언제 쓰나**: "이 값이 나중에 바뀔 수 있다"고 생각되는 순간 바로 상수로 뽑아라. 코드 안에 숫자 리터럴이 두 번 이상 나오면 이미 늦은 것이다.

**연습문제**: `FREE_SHIPPING_THRESHOLD`라는 상수를 하나 만들고, 장바구니 총액이 이 값 이상이면 "무료배송", 아니면 "배송비 3000원"을 출력하는 스크립트를 작성하라.

---

## 2. list

**개념**: 순서가 있는 값의 모음. 대괄호 `[]`.

**실제 코드** (`decide_bidding.py`):
```python
bidding_items = [code for code, info in bidding_results.items() if info["needs_bidding"]]
```

**역할**: "비딩이 필요한 품목 코드만" 골라 새 리스트를 만든다. 이 결과가 그래프 상태(`state["bidding_items"]`)에 저장되어 다음 노드로 전달된다.

**언제 쓰나**: "여러 개를 순서대로 처리하거나 순서대로 화면에 보여줘야 한다"면 리스트다.

**연습문제**: 정수 리스트 `[3, 12, 7, 20, 1]`에서 10 이상인 값만 걸러 새 리스트로 만들어라. (힌트: 위 코드의 대괄호 안 구조를 그대로 흉내내 보라 — 이것이 "list comprehension"이다. 6번 항목에서 다시 다룬다.)

---

## 3. dict

**개념**: 키-값 쌍의 모음. 중괄호 `{}`.

**실제 코드** (`process_commands.py`의 `PurchaseProcessState`, 실제로는 dict처럼 동작):
```python
return Command(
    update={
        "bidding_results": bidding_results,
        "bidding_items": bidding_items,
        "status": "resolving_suppliers",
    },
    goto="resolve_suppliers_choice",
)
```

**역할**: LangGraph의 상태 전체가 dict다. 이 프로젝트에서 dict는 "이름표가 붙은 여러 값을 하나로 묶어 다음 함수에 넘기는" 용도로 가장 많이 쓰인다. ERPNext API 응답(JSON)도 파이썬에서는 dict로 받는다.

**언제 쓰나**: "이름으로 값을 찾아야 한다"거나 "여러 속성을 가진 하나의 객체를 표현해야 한다"면 dict다. (더 엄격하게 하려면 6번 `TypedDict`나 pydantic 모델을 쓴다.)

**연습문제**: `{"item_code": "A-1", "qty": 5, "rate": 1000}` 형태의 dict를 만들고, `qty * rate`로 총액을 계산해 새 키 `"amount"`로 추가하라.

---

## 4. tuple / set

**개념**: tuple은 값이 바뀌지 않는(immutable) 순서 있는 모음 `()`. set은 중복 없는 모음 `{}` (dict와 헷갈리지 말 것 — 안에 `키: 값`이 없으면 set).

**실제 코드 — tuple** (`erp_client.py`):
```python
EmailDeliveryPolicy = Literal["block_all", "custom_only", "send_all"]
```
(참고: 이건 Literal이지만, 함수가 여러 값을 한 번에 반환할 때는 tuple을 쓴다. 예: `check_reorder_needed`)
```python
def check_reorder_needed(item_code, warehouse):
    ...
    return True, reorder_qty   # 이것이 사실 (True, reorder_qty) tuple
```

**실제 코드 — set** (`supplier_search.py`):
```python
seen_keys = set()
deduped = []
for c in candidates:
    key = _dedup_key(c["name"])
    if key in seen_keys:
        continue
    seen_keys.add(key)
    deduped.append(c)
```

**역할**: set은 "이미 나온 적 있는지"를 매우 빠르게 확인할 때 쓴다(리스트로 매번 `in`을 검사하면 느려질 수 있다). 여기서는 회사명 표기가 달라도(`(주)`, `주식회사` 등) 같은 회사로 보는 중복 제거 키를 set에 쌓아가며 검사한다.

**언제 쓰나**: 함수가 여러 값을 한 번에 반환하고 싶을 때 tuple, "중복 여부만 빠르게 확인"하고 싶을 때 set.

**연습문제**: 이름이 중복된 문자열 리스트 `["철수", "영희", "철수", "민수", "영희"]`에서 중복을 제거한 리스트를 set을 이용해 만들어라. (순서가 유지되지 않아도 된다.)

---

## 5. if / for / while

**실제 코드 — if 사슬** (`decide_bidding.py`, `_decide_one_item`):
```python
if not purchases:
    ...
    return item_code, {"needs_bidding": True, "reasons": [reason]}

if remaining_days is not None:
    if remaining_days <= URGENT_LEAD_TIME_DAYS:
        ...
        return item_code, {"needs_bidding": False, "reasons": [reason], **direct_fields}
```

**역할**: 이 함수는 우선순위가 있는 규칙 판정을 `if`를 위에서 아래로 순서대로 검사하며 **먼저 맞는 조건에서 바로 `return`**하는 방식으로 구현한다. 이렇게 하면 "1순위: 신규거래 → 2순위: 긴급 → 3순위: 고액 → 4순위: 패턴" 순서가 코드 순서와 그대로 일치해서 읽기 쉽다.

**실제 코드 — for + 병렬처리** (`decide_bidding.py`):
```python
with ThreadPoolExecutor(max_workers=min(len(items), 8) or 1) as executor:
    futures = [executor.submit(_decide_one_item, line) for line in items]
    for future in as_completed(futures):
        item_code, info = future.result()
        results[item_code] = info
```

**역할**: MR 안에 품목이 여러 개 있으면 품목마다 ERPNext를 순서대로 조회하지 않고 동시에 조회한다(각 품목 조회가 서로 독립적이기 때문에 가능). 이 프로젝트에서 `for`는 대부분 "여러 개를 순회하며 dict/list를 쌓는" 용도로 쓰인다.

**while**: 이 코드베이스에서 `while`은 거의 없다 — 대신 `main.py`의 백그라운드 폴링 태스크에서 `while True: ... await asyncio.sleep(interval)` 형태로 "무한히 반복하며 주기적으로 확인"하는 데 쓰인다(9번 async 항목 참고).

**언제 쓰나**: 반복 횟수를 미리 아는 컬렉션 순회는 `for`. "조건이 바뀔 때까지 계속"은 `while`. 우선순위가 있는 여러 규칙을 순서대로 검사할 때는 `if`를 사슬로 쓰고 맞는 즉시 `return`한다(모든 조건을 다 검사할 필요 없다).

**연습문제**: 다음 우선순위로 배송비를 정하는 함수를 `decide_bidding`의 `if` 사슬 스타일로 작성하라: 1) 총액 5만원 이상이면 무료, 2) 회원등급이 VIP면 무료, 3) 그 외에는 3000원.

---

## 6. 함수 / parameter / return

**실제 코드** (`erp_client.py`):
```python
def erp_get(doctype, filters=None, fields=None, order_by=None, limit=None, start=None):
    """ERPNext에서 문서 목록 조회"""
    params = {}
    if filters:
        params["filters"] = json.dumps(filters)
    ...
    res = requests.get(f"{SITE_URL}/api/resource/{doctype}", headers=HEADERS, params=params)
    if res.status_code != 200:
        raise ERPNextAPIError(f"GET {doctype}: {res.status_code} - {res.text[:300]}")
    return res.json().get("data")
```

**역할**: `doctype`은 필수 파라미터, 나머지는 기본값(`=None`)이 있는 선택적 파라미터다. "ERPNext를 호출하는 방법"을 이 함수 하나에 캡슐화해서, 이 프로젝트의 다른 모든 파일은 `requests.get`을 직접 쓰지 않고 이 함수만 호출한다.

**언제 쓰나**: 같은 논리를 두 번 이상 쓰게 되면 함수로 뽑아라. 특히 "외부 시스템과 통신하는 방법"은 반드시 함수(또는 클래스)로 감싸서 한 곳에서만 바뀌게 하라 — 이 프로젝트의 `erp_client.py`가 그 교과서적인 예다.

**연습문제**: `get_discounted_price(price, discount_rate=0.1)` 함수를 만들어, 두 번째 인자를 생략하면 10% 할인, 인자를 주면 그 비율만큼 할인된 가격을 반환하게 하라.

---

## 7. class / object

**개념**: 데이터와 그 데이터를 다루는 함수(메서드)를 하나로 묶는 것.

**실제 코드** (`backend_logic2/assistant/adapters/openai_responses.py`, 요약):
```python
class OpenAIResponsesAssistant:
    def __init__(self, client: OpenAI | None = None):
        self._model = os.getenv("ASSISTANT_MODEL", "gpt-5.6-luna").strip() or "gpt-5.6-luna"
        self._api_key_present = bool(os.getenv("OPENAI_API_KEY", "").strip())
        ...

    def plan(self, *, message, context, recent_conversation, feature_candidates, help_candidates):
        ...
```

**역할**: 이 도우미는 "설정값(모델명, API 키 유무)"과 "그 설정을 가지고 실제로 계획을 세우는 동작(`plan`)"을 하나의 객체로 묶는다. `AssistantService`(`assistant/service.py`)는 이 클래스의 인스턴스를 `self.model`로 들고 있다가 필요할 때 `self.model.plan(...)`을 호출한다. 이 프로젝트는 **함수형 스타일이 대부분이지만, "여러 함수가 같은 설정/자원을 공유해야 할 때"만 클래스를 쓴다** — `decide_bidding.py`나 `erp_client.py`는 클래스 없이 함수만으로 되어 있다는 점과 대비해 보라.

**언제 쓰나**: 함수 여러 개가 매번 똑같은 값(DB 커넥션, API 키, 설정)을 인자로 받아야 한다면, 그 값을 `__init__`에 저장하는 클래스로 묶는 게 낫다. 그렇지 않다면 굳이 클래스를 쓰지 않아도 된다(이 프로젝트의 대다수 모듈처럼).

**연습문제**: `email`과 `password`를 받는 `__init__`을 가진 `User` 클래스를 만들고, `is_valid_email()` 메서드로 `@`가 포함되어 있는지 확인하게 하라.

---

## 8. import / module / package

**실제 코드** (`backend_logic2/workflow/process_graph.py`):
```python
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import START, StateGraph

from .process_commands import (
    PurchaseProcessState,
    check_mr_item_command,
    decide_bidding_choice_command,
    ...
)
```

**역할**: 첫 두 줄은 **외부 라이브러리**(패키지)에서 가져오는 것, `from .process_commands import (...)`는 **같은 폴더의 다른 파일(모듈)**에서 함수를 가져오는 것(점 하나 `.`는 "현재 패키지"를 의미하는 상대 import). `backend_logic2/`는 `__init__.py`가 있는 폴더라 하나의 파이썬 패키지고, 그 안의 `workflow/`, `nodes/`, `services/` 등은 하위 패키지다.

**흥미로운 패턴**: 이 프로젝트 곳곳에서 **함수 안에서 import**하는 걸 볼 수 있다.
```python
def check_mr_item_command(state: PurchaseProcessState) -> Command:
    from backend_logic2.integrations.erp_client import erp_get_one
    from backend_logic2.nodes.mr.find_substitute import find_substitutes_for_mr, notify_requester_of_substitutes
    ...
```
왜 파일 맨 위가 아니라 함수 안에서 import할까? 순환 import(A가 B를 import하고 B가 다시 A를 import하려는 상황)를 피하기 위해서다. `process_commands.py`의 여러 노드 함수가 서로 다른 `nodes/` 하위 모듈을 참조하는데, 그 모듈들이 다시 `process_commands`를 참조할 가능성이 있는 큰 코드베이스에서 흔히 쓰는 실용적 타협이다.

**언제 쓰나**: 기본은 항상 파일 맨 위에서 import한다. 순환 import 에러(`ImportError: cannot import name ... (most likely due to a circular import)`)가 실제로 발생했을 때만 함수 내부 import로 우회한다.

**연습문제**: `mathutils.py`라는 파일에 `def square(x): return x * x`를 작성하고, 다른 파일에서 `from mathutils import square`로 가져와 써보라.

---

## 9. type hint / TypedDict / Optional / Literal

**실제 코드 — TypedDict** (`process_commands.py`):
```python
class PurchaseProcessState(TypedDict, total=False):
    mr_name: str
    case_id: str
    status: str
    bidding_results: dict[str, Any]
    selected_suppliers: list[str]
    error: str
```

**역할**: `TypedDict`는 "dict인데, 어떤 키에 어떤 타입의 값이 들어가는지 미리 선언"한 것이다. `total=False`는 "모든 키가 항상 다 채워져 있지는 않다"는 뜻(그래프가 진행되면서 키가 하나씩 채워지기 때문). 런타임에 강제로 검사하지는 않지만(파이썬은 타입을 무시할 수 있다), 에디터와 타입 체커가 "이 상태에 이런 키가 있다"고 알려줘서 실수를 줄여준다.

**실제 코드 — Literal** (`erp_client.py`):
```python
EmailDeliveryPolicy = Literal["block_all", "custom_only", "send_all"]

def get_email_delivery_policy() -> EmailDeliveryPolicy:
    ...
```

**역할**: 이 함수는 "이 세 문자열 중 하나만" 반환한다고 타입으로 못박는다. 오타로 `"blok_all"`을 반환하면 타입 체커가 잡아낼 수 있다.

**실제 코드 — Optional** (`decide_bidding.py`류의 함수 시그니처는 아니지만, 프로젝트 전반에 등장; `erp_client.py`의 `PRCreateRequest`):
```python
cost_center: Optional[str] = "Main - Y"
company: Optional[str] = "Your Company Name"
```

**역할**: `Optional[str]`은 "`str`이거나 `None`일 수 있다"는 뜻(`str | None`과 동일). 값이 없을 수도 있는 필드를 명시한다.

**언제 쓰나**: 함수/데이터 구조가 복잡해지고 여러 사람(또는 미래의 나 자신)이 코드를 읽게 되는 순간부터 타입 힌트는 사실상 필수다. dict를 여기저기 넘기는 코드가 5개 함수를 넘어가면 `TypedDict`나 pydantic 모델로 구조를 명시하라.

**연습문제**:
```python
from typing import TypedDict, Optional, Literal

class Order(TypedDict, total=False):
    item: str
    qty: int
    status: Literal["pending", "shipped", "cancelled"]
    note: Optional[str]
```
위 타입을 그대로 파일에 작성하고, `Order` 타입의 dict 값을 하나 만들어보라.

---

## 10. try / except

**실제 코드** (`erp_client.py`, `erp_get`):
```python
def erp_get(doctype, filters=None, ...):
    ...
    res = requests.get(f"{SITE_URL}/api/resource/{doctype}", headers=HEADERS, params=params)
    if res.status_code != 200:
        raise ERPNextAPIError(f"GET {doctype}: {res.status_code} - {res.text[:300]}")
    return res.json().get("data")
```
그리고 호출하는 쪽 (`supplier_search.py`):
```python
try:
    candidates = collect_candidate_names_structured(item_name, collect_target, case_id=case_id)
except Exception as e:
    print(f"  [Tavily-구조화] 예외 발생, 후보 없음으로 진행: {e}")
    candidates = []
```

**역할**: `erp_client.py`는 실패를 **조용히 숨기지 않고** `ERPNextAPIError`라는 커스텀 예외를 명시적으로 던진다(주석: "조용히 None 반환하지 않고 명확하게 실패를 알려서"). 반대로 `supplier_search.py`는 "신규 공급사 탐색 중 Tavily 검색 하나가 실패해도 전체 구매 프로세스를 멈출 필요는 없다"고 판단해서 예외를 잡고 빈 리스트로 계속 진행한다. **같은 "예외 처리"라도 상황에 따라 정책이 다르다** — 이게 이 항목에서 배워야 할 핵심이다.

**언제 쓰나**: "이 실패는 반드시 알아야 한다(숨기면 더 위험하다)"면 예외를 던지고 위쪽에서 처리하게 하라. "이 실패는 부분 기능 저하일 뿐, 전체를 막을 이유가 없다"면 그 자리에서 잡고 안전한 기본값으로 넘어가라. **"일단 `except: pass`로 다 잡고 무시"는 가장 나쁜 패턴**이다 — 왜 실패했는지 로그도 안 남기고 다음 사람이 원인을 못 찾게 만든다. `find_substitute.py`의 `_ai_rank_substitutes`도 이 원칙을 지킨다:
```python
try:
    cleaned = result.strip().removeprefix("```json")...
    return json.loads(cleaned).get("ranking", [])
except Exception as e:
    print(f"    [_ai_rank_substitutes] AI 응답 파싱 실패: {e}")
    return []
```

**연습문제**: 문자열을 정수로 변환하는 함수를 작성하되, 변환 불가능한 문자열이 들어오면 예외를 잡고 `None`을 반환하며 어떤 값이 실패했는지 출력하라.

---

## 11. async / await

**실제 코드** (`main.py`):
```python
async def _poll_material_requests() -> None:
    interval = _mr_poll_interval_seconds()
    while True:
        try:
            await asyncio.to_thread(
                workflow_service.sync_draft_material_requests,
                reconcile_existing=reconcile_existing,
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            LOGGER.exception("ERPNext MR polling failed; retrying in %.1f seconds", interval)
        await asyncio.sleep(interval)
```

**역할**: FastAPI 서버 자체는 `async` 이벤트 루프 위에서 동작하지만, `workflow_service.sync_draft_material_requests`나 LangGraph의 `erp_get` 호출은 동기(sync) 함수(`requests` 라이브러리는 async가 아니다)다. 동기 함수를 그냥 `await`할 수는 없으므로, `asyncio.to_thread(...)`로 별도 스레드에서 실행시켜 이벤트 루프를 막지 않게 한다. `await asyncio.sleep(interval)`은 "이 태스크만 잠깐 쉬고, 그동안 다른 요청은 계속 처리하라"는 뜻이다(`time.sleep`을 쓰면 서버 전체가 멈춘다 — 이 차이가 핵심).

**언제 쓰나**: "서버가 요청을 처리하면서 동시에 백그라운드 작업(폴링, 주기적 동기화)도 계속 돌려야 한다"는 요구사항이 생기면 `async`/`await` + `asyncio.create_task`가 필요해진다. 동기 라이브러리를 async 코드에서 불러야 하면 `asyncio.to_thread`를 기억하라.

**연습문제**: `asyncio.sleep(1)`을 사용해 1초마다 "tick"을 출력하는 무한 루프 async 함수를 작성하고 `asyncio.run()`으로 실행해보라(Ctrl+C로 종료).

---

## 12. decorator

**실제 코드** (`erp_client.py`):
```python
@lru_cache(maxsize=1)
def get_item_doctype_fields():
    """Return live Item field metadata for labels, types, and sections."""
    metadata = erp_get_one("DocType", "Item") or {}
    return metadata.get("fields") or []
```
그리고 API 라우트 자체도 데코레이터다 (`erp_client.py`):
```python
@router.get("/items")
def list_registered_items(limit: int = Query(default=500, ge=1, le=500), ...):
    ...
```

**역할**: `@lru_cache(maxsize=1)`는 "이 함수를 한 번 호출한 결과를 기억해뒀다가, 같은 인자로 다시 호출하면 다시 계산하지 않고 캐시된 값을 즉시 돌려준다"는 뜻이다(ERPNext Item 문서의 필드 메타데이터는 자주 바뀌지 않으니 매번 다시 조회할 필요가 없다). `@router.get("/items")`는 FastAPI에게 "이 함수를 `GET /purchase/items` 요청이 왔을 때 실행할 핸들러로 등록하라"고 알려주는 데코레이터다.

**언제 쓰나**: "함수 앞뒤에 항상 붙는 반복적인 처리"(캐싱, 로깅, 권한 검사, 라우트 등록)가 필요할 때 데코레이터를 쓴다. 직접 만들 수도 있지만, 이 프로젝트는 주로 라이브러리가 제공하는 데코레이터(`@router.get`, `@lru_cache`)를 사용한다.

**연습문제**: `functools.lru_cache`를 피보나치 수열 재귀 함수에 붙여보고, 붙이기 전/후 실행 속도 차이를 `time` 모듈로 재보라.

---

## 13. lambda

**실제 코드** (`decide_bidding.py`):
```python
purchases.sort(key=lambda p: _parse_date(p["date"]))
```
그리고 `erp_client.py`:
```python
sorted_candidates = sorted(candidates_with_signals, key=lambda c: c["past_order_count"], reverse=True)
```

**역할**: `sort`/`sorted`의 `key`는 "각 항목에서 정렬 기준값을 뽑아내는 함수"를 받는다. 이름 붙은 함수를 따로 만들 필요 없이, 한 줄짜리 익명 함수(`lambda`)로 바로 표현한다.

**언제 쓰나**: `sorted`, `filter`, `map`처럼 "함수를 인자로 받는" 곳에 아주 짧은 로직(한 줄로 끝나는)만 필요할 때. 로직이 조금이라도 복잡해지면 `def`로 이름 붙인 함수를 만들어라 — `lambda` 안에 `if`/`for`를 욱여넣지 않는다.

**연습문제**: 학생 정보 딕셔너리 리스트 `[{"name": "철수", "score": 85}, {"name": "영희", "score": 92}]`를 `score` 내림차순으로 정렬하라.

---

## 14. comprehension

**실제 코드** (`decide_bidding_choice_command`, `process_commands.py`):
```python
bidding_items = [code for code, info in bidding_results.items() if info["needs_bidding"]]
```
딕셔너리 컴프리헨션 (`sq_evaluation.py`):
```python
by_name = {str(row.get("name") or "").strip(): row for row in quotations}
```

**역할**: `for` 루프 3~4줄로 새 리스트/딕셔너리를 만드는 코드를 한 줄로 압축한다. 이 프로젝트는 "ERPNext에서 받은 원시 데이터를 필터링/변형해서 새 구조로 만드는" 일이 매우 잦아서 컴프리헨션이 아주 많이 쓰인다.

**언제 쓰나**: "기존 컬렉션을 순회하며 조건에 맞는 것만 골라 새 컬렉션을 만든다"는 패턴이면 컴프리헨션을 우선 고려하라. 단, 한 줄이 너무 길어지거나 조건이 여러 겹 중첩되면 가독성을 위해 평범한 `for` 루프로 풀어써라(이 프로젝트도 복잡한 경우엔 `for` 루프를 그대로 쓴다 — 예: `decide_bidding`의 `_decide_one_item`).

**연습문제**: 리스트 `[1, 2, 3, 4, 5, 6]`에서 짝수만 골라 각각 제곱한 새 리스트를 컴프리헨션으로 만들어라. (기대 결과: `[4, 16, 36]`)

---

## 15. JSON 처리

**실제 코드** (`find_substitute.py`, `_ai_rank_substitutes`):
```python
result = (prompt | llm).invoke({...}).content
try:
    cleaned = result.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(cleaned).get("ranking", [])
except Exception as e:
    print(f"    [_ai_rank_substitutes] AI 응답 파싱 실패: {e}")
    return []
```

**역할**: LLM은 문자열만 반환한다. 프롬프트에서 "반드시 이 JSON 형식으로만 답하라"고 강하게 지시해도, 실제로는 마크다운 코드블록(` ```json ... ``` `)으로 감싸서 응답하는 경우가 많아, 그 감싸는 부분을 문자열 처리로 벗겨낸 뒤 `json.loads()`로 파이썬 dict/list로 변환한다. 이 변환이 실패할 가능성이 항상 있으므로 반드시 `try/except`로 감싼다(10번 항목과 연결).

**언제 쓰나**: 외부 API 응답, 설정 파일, LLM 출력 등 "문자열로 전달되는 구조화 데이터"를 다룰 때 `json.loads`(문자열→파이썬)/`json.dumps`(파이썬→문자열)를 쓴다. LLM 출력처럼 형식이 100% 보장되지 않는 경우 항상 파싱 실패에 대비하라.

**연습문제**: `'{"name": "철수", "age": 20}'`라는 JSON 문자열을 파이썬 dict로 변환하고, `age`에 1을 더한 뒤 다시 JSON 문자열로 변환해 출력하라.

---

## 16. 환경변수

**실제 코드** (`erp_client.py`):
```python
load_dotenv()
SITE_URL = os.environ["SITE_URL"]
API_KEY = os.environ["API_KEY"]
API_SECRET = os.environ["API_SECRET"]

if not all([SITE_URL, API_KEY, API_SECRET]):
    raise RuntimeError("필수 환경 변수(SITE_URL, API_KEY, API_SECRET)가 .env 파일에 설정되지 않았습니다.")
```
그리고 선택적 값은 `os.getenv`(기본값 지정 가능):
```python
value = os.getenv("MR_INGEST_MODE", "polling").strip().lower()
```

**역할**: `os.environ["KEY"]`는 그 환경변수가 없으면 즉시 `KeyError`로 죽는다(필수값에 사용). `os.getenv("KEY", 기본값)`은 없으면 조용히 기본값을 쓴다(선택값에 사용). `load_dotenv()`는 `.env` 파일의 내용을 읽어 `os.environ`에 주입해준다 — API 키 같은 비밀값을 코드에 직접 적지 않고 파일로 분리해서, 그 `.env` 파일을 git에 커밋하지 않는(`.gitignore`) 방식으로 비밀을 보호한다.

**언제 쓰나**: API 키, DB 접속 정보, 서버 주소처럼 "환경(로컬/운영)마다 다르고, 코드에 직접 쓰면 안 되는 값"은 전부 환경변수로 뺀다. 필수인지 선택인지에 따라 `os.environ[...]` vs `os.getenv(..., 기본값)`을 구분해서 써라 — 이 구분 자체가 "이 값이 없으면 절대 안 된다"는 설계 의도를 코드로 표현하는 방법이다.

**연습문제**: `.env` 파일에 `MY_NAME=철수`를 적고, `python-dotenv`로 읽어와 "안녕하세요, {MY_NAME}님"을 출력하는 스크립트를 작성하라.

---

## 17. HTTP request

**실제 코드** (`erp_client.py`):
```python
import requests

def erp_get_one(doctype, name):
    res = requests.get(f"{SITE_URL}/api/resource/{doctype}/{name}", headers=HEADERS)
    if res.status_code != 200:
        raise ERPNextAPIError(f"GET {doctype}/{name}: {res.status_code} - {res.text[:300]}")
    return res.json().get("data")

def erp_post(doctype, payload):
    payload = dict(payload)
    payload["doctype"] = doctype
    res = requests.post(f"{SITE_URL}/api/resource/{doctype}", headers=HEADERS, json=payload)
    if res.status_code not in (200, 201):
        raise ERPNextAPIError(f"POST {doctype}: {res.status_code} - {res.text[:500]}")
    return res.json().get("data")
```

**역할**: `requests` 라이브러리로 GET(조회)/POST(생성) HTTP 요청을 보낸다. `headers=HEADERS`는 인증 정보(`Authorization: token KEY:SECRET`)를 담고, `json=payload`는 파이썬 dict를 자동으로 JSON 문자열로 바꿔 요청 본문에 넣는다. 응답은 `res.json()`으로 다시 파이썬 dict/list로 바꾼다. `res.status_code`로 성공(200/201) 여부를 확인하고, 실패하면 예외를 던진다(10번 항목과 연결).

**언제 쓰나**: 다른 서버(REST API)와 통신해야 할 때는 거의 항상 이 패턴(요청 보내기 → 상태 코드 확인 → JSON 파싱 → 실패 시 예외)을 반복한다. 이 4단계를 매번 손으로 쓰지 않고 `erp_get`/`erp_post` 같은 헬퍼 함수로 감싸는 것이 좋은 설계다.

**연습문제**: `requests.get("https://jsonplaceholder.typicode.com/todos/1")`로 공개 테스트 API를 호출하고, 응답의 `title` 필드를 출력하라. 상태 코드가 200이 아니면 에러 메시지를 출력하도록 만들어라.

---

## 이 장을 마치며

이 프로젝트의 파이썬 코드에는 화려한 기법이 거의 없다. 클래스 상속 계층도 얕고, 메타클래스나 디스크립터 같은 고급 기법도 안 쓴다. 대신 **"실패를 명시적으로 다루기"(예외/타입힌트), "외부 시스템 호출을 한 곳에 모으기"(erp_client.py), "여러 개를 동시에 처리하기"(ThreadPoolExecutor/asyncio)**가 반복해서 나타난다. 이 세 가지 습관만 몸에 익혀도 이 프로젝트 수준의 백엔드를 처음부터 설계할 수 있다.
