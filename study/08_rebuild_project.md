# 08. 프로젝트 직접 재구현하기 (Rebuild Project)

이 문서는 BiddingFlow와 **같은 도메인, 훨씬 작은 규모**의 미니 프로젝트를 9단계로 직접 만들어보는 실습이다. 실제 ERPNext 계정이 없어도 진행할 수 있도록, ERPNext 대신 **로컬 JSON 파일을 "가짜 ERP"**로 사용한다. 각 단계는 이전 단계 위에 쌓인다 — 순서를 건너뛰지 마라.

**미니 프로젝트 주제**: "사무용품 재고 확인 및 대체품 추천 시스템" (BiddingFlow의 `find_substitute.py` + `decide_bidding.py`를 훨씬 단순화한 버전)

각 STEP은 정답을 바로 주지 않는다. "목표 → 필요한 개념 → 참고 파일 → 힌트 → 완료 조건" 순서로 되어 있고, 정답 예시는 각 STEP 맨 아래 `<details>` 접힌 블록에 있다 — **먼저 최소 30분은 직접 시도한 뒤에만 열어봐라.**

---

## STEP 1. 가장 작은 기능 만들기

**목표**: "품목 하나의 재고 수량을 조회해서 출력한다"는, 이 시스템의 가장 작은 단위를 함수 하나로 만든다.

**구현해야 할 기능**: `items.json`이라는 파일에 품목 목록(`item_code`, `item_name`, `qty`)을 몇 개 적어두고, 이를 읽어 특정 `item_code`의 재고를 출력하는 스크립트.

**필요한 Python 개념**: 변수, 함수, dict/list, JSON 읽기, `if __name__ == "__main__":`

**참고할 기존 프로젝트 파일**: `backend_logic2/integrations/erp_client.py`의 `get_stock_level(item_code, warehouse)` — ERPNext 대신 JSON을 읽는다는 것만 다르고, "품목코드를 받아 재고 정보를 반환한다"는 함수의 역할은 동일하다. 파일 맨 아래 `if __name__ == "__main__":` 블록으로 직접 실행 가능하게 만든 관례도 그대로 따라해보라.

**직접 작성해야 하는 코드**: `mini_erp.py` 파일에 `get_stock_level(item_code)` 함수. 입력은 품목코드 문자열, 출력은 `{"item_code":, "item_name":, "qty":}` dict 또는 없으면 `None`.

**힌트**:
- `json.load(open("items.json", encoding="utf-8"))`로 파일 전체를 읽으면 리스트가 나온다.
- 리스트에서 조건에 맞는 하나를 찾는 코드를 반복해서 쓸 상황이 이후에도 계속 생길 것이다 — 지금은 평범한 `for` 루프로 충분하다.

**완료 조건**: `python mini_erp.py`를 실행하면 품목코드를 입력받아 재고 수량을 출력한다. 없는 품목코드를 입력하면 "품목을 찾을 수 없습니다"를 출력한다(에러로 죽지 않는다).

<details>
<summary>정답 예시 보기 (STEP 1)</summary>

```python
# mini_erp.py
import json

def get_stock_level(item_code: str):
    with open("items.json", encoding="utf-8") as f:
        items = json.load(f)
    for item in items:
        if item["item_code"] == item_code:
            return item
    return None

if __name__ == "__main__":
    code = input("품목코드 입력: ").strip()
    result = get_stock_level(code)
    if result is None:
        print("품목을 찾을 수 없습니다.")
    else:
        print(f"{result['item_name']} 재고: {result['qty']}개")
```
```json
// items.json
[
  {"item_code": "A-001", "item_name": "볼펜", "qty": 120},
  {"item_code": "A-002", "item_name": "A4용지", "qty": 5},
  {"item_code": "A-003", "item_name": "지우개", "qty": 0}
]
```
</details>

---

## STEP 2. 함수 분리

**목표**: "재고가 부족한지 판단하는 로직"을 별도 함수로 분리해, 나중에 재사용/테스트하기 쉽게 만든다.

**필요한 Python 개념**: 함수의 parameter/return, 순수 함수(입력만으로 출력이 결정되는 함수)

**참고할 기존 프로젝트 파일**: `backend_logic2/nodes/mr/decide_bidding.py`의 `_decide_one_item`(전체 판정)과 `_direct_purchase_fields`(그 안에서 분리된 작은 계산)의 관계. "전체를 판단하는 함수"와 "그 판단에 필요한 작은 계산을 해주는 함수"를 나누는 패턴을 참고하라.

**직접 작성해야 하는 코드**:
1. `is_low_stock(qty: int, threshold: int = 10) -> bool` — 재고가 기준치 미만이면 `True`.
2. `check_item_stock(item_code: str, threshold: int = 10) -> dict` — STEP 1의 `get_stock_level`을 호출한 뒤, `is_low_stock`으로 판단한 결과까지 합쳐서 반환.

**힌트**: `check_item_stock`은 `get_stock_level`과 `is_low_stock`을 "조합"만 하고, 직접 파일을 읽거나 비교 로직을 새로 짜지 않는다. (이게 "함수 분리"의 핵심이다 — 상위 함수는 하위 함수를 호출만 한다.)

**완료 조건**: `is_low_stock(5)`가 `True`, `is_low_stock(120)`이 `False`를 반환하는 것을 별도로 확인할 수 있다(재고 조회 없이 이 함수만 따로 테스트 가능해야 한다).

<details>
<summary>정답 예시 보기 (STEP 2)</summary>

```python
def is_low_stock(qty: int, threshold: int = 10) -> bool:
    return qty < threshold

def check_item_stock(item_code: str, threshold: int = 10) -> dict:
    item = get_stock_level(item_code)
    if item is None:
        return {"found": False}
    return {
        "found": True,
        "item_name": item["item_name"],
        "qty": item["qty"],
        "low_stock": is_low_stock(item["qty"], threshold),
    }
```
</details>

---

## STEP 3. API 연결

**목표**: 지금까지 로컬 함수 호출로만 되던 것을 FastAPI로 감싸 HTTP로 호출 가능하게 만든다.

**필요한 Python 개념**: FastAPI 기본(`@app.get`), Query parameter, uvicorn 실행

**참고할 기존 프로젝트 파일**: `backend_logic2/integrations/erp_client.py`의 `@router.get("/items")`, `main.py`의 `@app.get("/api/health")`. 이 프로젝트가 함수(`erp_get` 등)와 라우트(`@router.get(...)`)를 같은 파일에 두면서도 역할을 분리한 방식을 참고하라 — 라우트 함수는 얇게 유지하고, 실제 로직은 STEP 2에서 만든 함수를 그대로 호출한다.

**직접 작성해야 하는 코드**: `main.py`에 FastAPI 앱을 만들고 `GET /items/{item_code}/stock` 엔드포인트를 추가하라. 내부에서 STEP 2의 `check_item_stock`을 호출한다.

**힌트**: `pip install fastapi uvicorn`. 실행은 `uvicorn main:app --reload`.

**완료 조건**: 브라우저에서 `http://127.0.0.1:8000/items/A-002/stock`에 접속하면 JSON 응답이 온다. 없는 품목코드로 접속하면 404를 반환한다(`HTTPException(status_code=404, ...)`).

<details>
<summary>정답 예시 보기 (STEP 3)</summary>

```python
# main.py
from fastapi import FastAPI, HTTPException
from mini_erp import check_item_stock

app = FastAPI()

@app.get("/items/{item_code}/stock")
def read_stock(item_code: str, threshold: int = 10):
    result = check_item_stock(item_code, threshold)
    if not result["found"]:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")
    return result
```
</details>

---

## STEP 4. 데이터 처리

**목표**: 여러 품목을 한 번에 처리하고, "재고 부족 품목만 필터링한 리스트"를 만든다.

**필요한 Python 개념**: list comprehension, JSON 전체 읽기, 딕셔너리 정렬

**참고할 기존 프로젝트 파일**: `backend_logic2/workflow/process_commands.py`의 `bidding_items = [code for code, info in bidding_results.items() if info["needs_bidding"]]` — "전체 결과 중 조건에 맞는 것만 걸러 다음 단계로 넘길 리스트를 만든다"는 패턴 그대로.

**직접 작성해야 하는 코드**: `list_low_stock_items(threshold: int = 10) -> list[dict]` — 모든 품목을 순회해 재고 부족 품목만 담은 리스트를 반환. 재고가 적은 순으로 정렬하라.

**힌트**: `sorted(리스트, key=lambda x: x["qty"])`를 이용하면 정렬할 수 있다(02번 문서 13번 항목 lambda 참고).

**완료 조건**: `list_low_stock_items(10)`을 호출하면 `items.json`의 품목 중 재고가 10 미만인 것만, 재고 오름차순으로 정렬된 리스트로 나온다.

<details>
<summary>정답 예시 보기 (STEP 4)</summary>

```python
def list_low_stock_items(threshold: int = 10) -> list[dict]:
    with open("items.json", encoding="utf-8") as f:
        items = json.load(f)
    low_stock = [item for item in items if is_low_stock(item["qty"], threshold)]
    return sorted(low_stock, key=lambda item: item["qty"])
```
</details>

---

## STEP 5. AI 연결

**목표**: 재고가 부족한 품목에 대해, "비슷한 이름의 다른 품목이 대체 가능한지"를 LLM에게 판단시킨다.

**필요한 Python 개념**: 환경변수(API 키), `openai` 패키지 또는 `langchain-openai`, 프롬프트 작성, JSON 파싱

**참고할 기존 프로젝트 파일**: `backend_logic2/nodes/mr/find_substitute.py`의 `_ai_rank_substitutes` — 후보 목록을 프롬프트에 JSON으로 넣고, "반드시 이 JSON 형식으로만 답하라"고 지시한 뒤 응답을 파싱하는 전체 패턴을 그대로 따라하라.

**직접 작성해야 하는 코드**: `suggest_substitute(item_name: str, candidates: list[dict]) -> dict | None` — LLM에게 후보 중 대체 가능한 것을 하나 고르고 이유를 설명하게 한다. 파싱 실패 시 `None`을 반환한다(예외로 죽지 않게).

**힌트**:
```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate
```
프롬프트에 "반드시 JSON으로만 답하라"는 지시를 넣고, 실제 응답을 받으면 마크다운 코드블록 표시(` ```json `)를 벗겨낸 뒤 `json.loads`를 시도하라(02번 문서 15번 항목 참고). `.env`에 `OPENAI_API_KEY`를 넣고 `load_dotenv()`로 읽어라.

**완료 조건**: API 키가 유효할 때 "지우개" 재고가 0이면, 같은 문구류 후보 중 대체 가능한 품목과 이유가 출력된다. API 키가 없거나 호출이 실패해도 프로그램이 죽지 않고 `None`을 반환한다.

<details>
<summary>정답 예시 보기 (STEP 5)</summary>

```python
import json
import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate

load_dotenv()

def suggest_substitute(item_name: str, candidates: list[dict]) -> dict | None:
    if not candidates:
        return None
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    prompt = PromptTemplate.from_template(
        "요청품목: {item_name}\n"
        "후보 목록: {candidates}\n\n"
        "후보 중 요청품목을 대신 쓸 수 있는 것을 하나 고르고 이유를 설명하세요. "
        "없으면 candidate를 null로 하세요.\n"
        '반드시 이 JSON 형식으로만 답하세요: {{"candidate": "품목명 또는 null", "reason": "이유"}}'
    )
    result = (prompt | llm).invoke({
        "item_name": item_name,
        "candidates": json.dumps(candidates, ensure_ascii=False),
    }).content
    try:
        cleaned = result.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(cleaned)
    except Exception as e:
        print(f"AI 응답 파싱 실패: {e}")
        return None
```
</details>

---

## STEP 6. Agent/Workflow 구성

**목표**: "재고 확인 → (부족하면) 대체품 제안 → (대체품 없으면) 재주문 필요 표시"라는 여러 단계를, 그래프 없이 먼저 하나의 파이썬 흐름으로 짜본다.

**중요**: 이 단계에서 LangGraph를 바로 쓰지 않는 이유가 있다. 04번 문서에서 배웠듯 LangGraph는 "사람의 입력을 오래 기다려야 하는, 여러 단계의 복잡한 흐름"에 필요하다. 지금 우리 미니 프로젝트는 3단계뿐이고 사람이 기다려야 하는 지점도 없다 — 이럴 땐 평범한 함수 호출 체인으로 충분하다. **"언제 LangGraph가 필요해지는가"를 몸으로 느끼는 게 이 단계의 진짜 목표다.**

**필요한 Python 개념**: 함수 조합, dict를 이용한 상태 전달

**참고할 기존 프로젝트 파일**: `backend_logic2/workflow/process_commands.py`의 `check_mr_item_command`가 `find_substitutes_for_mr`를 호출하고 결과에 따라 분기하는 구조(그래프 프레임워크 없이 봐도 "함수 하나가 상태를 보고 다음 함수를 부른다"는 본질은 같다).

**직접 작성해야 하는 코드**: `process_item(item_code: str) -> dict`
- STEP 4의 재고 확인 → 부족하지 않으면 `{"result": "ok"}`
- 부족하면 후보를 찾아(간단히 `item_name`의 첫 글자가 같은 다른 품목들로) STEP 5의 `suggest_substitute` 호출
- 대체품을 찾으면 `{"result": "substitute_found", "substitute": ...}`
- 못 찾으면 `{"result": "reorder_needed"}`

**힌트**: `if`/`else`로 충분하다. **아직은** 상태를 dict 하나에 계속 쌓아가며 여러 함수에 전달하는 연습을 해보되, "그래프", "노드", "엣지" 같은 개념어를 굳이 붙이지 마라 — 그냥 함수 호출이다.

**완료 조건**: 재고가 충분한 품목, 부족하지만 대체품이 있는 품목, 부족하고 대체품도 없는 품목 세 가지 경우를 각각 실행해 서로 다른 `result` 값이 나오는 것을 확인한다.

<details>
<summary>정답 예시 보기 (STEP 6)</summary>

```python
def find_candidates(item_name: str, exclude_code: str) -> list[dict]:
    with open("items.json", encoding="utf-8") as f:
        items = json.load(f)
    return [
        item for item in items
        if item["item_code"] != exclude_code and item["qty"] > 0
    ]

def process_item(item_code: str) -> dict:
    status = check_item_stock(item_code)
    if not status["found"]:
        return {"result": "not_found"}
    if not status["low_stock"]:
        return {"result": "ok", "qty": status["qty"]}

    item = get_stock_level(item_code)
    candidates = find_candidates(item["item_name"], item_code)
    suggestion = suggest_substitute(item["item_name"], candidates)
    if suggestion and suggestion.get("candidate"):
        return {"result": "substitute_found", "substitute": suggestion}
    return {"result": "reorder_needed"}
```
</details>

---

## STEP 7. ERPNext 연동 (또는 그에 준하는 실제 외부 API)

**목표**: JSON 파일 대신 실제 외부 데이터 소스에 연결해본다. ERPNext 계정이 있다면 실제로 연결하고, 없다면 아무 공개 REST API(예: `https://jsonplaceholder.typicode.com`)로 대체 연습을 한다.

**필요한 Python 개념**: `requests` 라이브러리, 인증 헤더, 상태 코드 확인 (02번 문서 17번 항목)

**참고할 기존 프로젝트 파일**: `backend_logic2/integrations/erp_client.py`의 `erp_get`/`erp_get_one` — "외부 호출을 한 함수에 캡슐화하고, 실패하면 명시적 예외를 던진다"는 패턴을 그대로 옮긴다.

**직접 작성해야 하는 코드**: `get_stock_level`을 로컬 JSON이 아니라 실제 HTTP 요청으로 바꾼 버전(`get_stock_level_remote(item_code)`)을 별도로 만들어라. 기존 로컬 버전은 지우지 말고 남겨둬라 — **"데이터 소스를 바꿔도 함수의 입력/출력 형태(인터페이스)는 같아야 한다"**는 것을 직접 확인하기 위해서다.

**힌트**: 실패 시(상태 코드 200이 아니면) 커스텀 예외(`class RemoteAPIError(Exception): pass`)를 던져라 — `ERPNextAPIError`와 같은 역할이다.

**완료 조건**: `get_stock_level_remote`를 호출하는 코드가 `get_stock_level`을 호출하던 코드와 **한 줄(함수 이름)만 바꾸면** 그대로 동작한다.

<details>
<summary>정답 예시 보기 (STEP 7)</summary>

```python
import requests

class RemoteAPIError(Exception):
    pass

def get_stock_level_remote(item_code: str):
    # 예시: 실제로는 ERPNext의 /api/resource/Bin 같은 실제 엔드포인트를 쓴다
    res = requests.get(f"https://jsonplaceholder.typicode.com/todos/1")
    if res.status_code != 200:
        raise RemoteAPIError(f"GET 실패: {res.status_code}")
    data = res.json()
    # 실제 프로젝트라면 여기서 응답을 우리 dict 형태로 정규화한다
    return {"item_code": item_code, "item_name": data.get("title"), "qty": 42}
```
</details>

---

## STEP 8. 에러 처리

**목표**: 지금까지 만든 기능들이 "예상 밖의 입력"과 "외부 시스템 실패"에도 죽지 않게 만든다.

**필요한 Python 개념**: try/except, 사용자 정의 예외, 로깅(`print` 또는 `logging`)

**참고할 기존 프로젝트 파일**: `07_debugging_guide.md`의 "핵심 트랜잭션과 부가 채널을 분리하라"는 원칙, `erp_client.py`의 `ERPNextAPIError`.

**직접 작성해야 하는 코드**: `process_item`을 감싸서, 다음 상황에서도 절대 예외로 서버가 죽지 않게 하는 `safe_process_item(item_code)`를 작성하라:
1. 존재하지 않는 품목코드
2. AI 호출이 실패(네트워크 오류, API 키 없음)
3. JSON 파일 자체가 깨져 있음(`json.JSONDecodeError`)

각 경우 사용자에게 보여줄 안전한 메시지를 반환하라.

**힌트**: "AI 실패는 전체를 막지 않고 `reorder_needed`로 안전하게 처리"처럼, **실패의 종류마다 어떤 대응이 적절한지 먼저 표로 정리한 뒤** 코드를 짜라(07번 문서의 표를 참고).

**완료 조건**: 세 가지 실패 상황을 각각 강제로 발생시켜도(예: `items.json`을 일부러 깨뜨려보기) 프로그램이 죽지 않고 의미 있는 메시지를 출력한다.

<details>
<summary>정답 예시 보기 (STEP 8)</summary>

```python
def safe_process_item(item_code: str) -> dict:
    try:
        return process_item(item_code)
    except json.JSONDecodeError:
        return {"result": "error", "message": "품목 데이터 파일이 손상되었습니다."}
    except Exception as e:
        print(f"[safe_process_item] 예상치 못한 오류: {e}")
        return {"result": "error", "message": "처리 중 오류가 발생했습니다."}
```
(AI 호출 실패는 이미 STEP 5의 `suggest_substitute`가 `None`을 반환하도록 자체 처리했으므로, 여기서 다시 잡을 필요가 없다 — "실패를 어느 계층에서 처리할지"를 중복 없이 한 곳에 정하는 것도 이 연습의 일부다.)
</details>

---

## STEP 9. 전체 통합

**목표**: 지금까지 만든 조각들을 FastAPI 엔드포인트 하나로 통합하고, 여러 품목을 한 번에 처리하는 배치 엔드포인트도 추가한다.

**필요한 Python 개념**: 지금까지 배운 모든 것의 조합

**참고할 기존 프로젝트 파일**: `main.py`가 여러 라우터/서비스를 조립하는 최종 지점이라는 걸 다시 보라 — `main.py` 자체는 로직이 거의 없고, 이미 만들어진 조각들을 등록만 한다.

**직접 작성해야 하는 코드**:
1. `GET /items/{item_code}/process` — `safe_process_item` 호출
2. `GET /items/low-stock/process-all` — `list_low_stock_items`로 부족 품목을 모두 찾아 각각 `safe_process_item` 실행 후 리스트로 반환

**완료 조건**: 서버를 띄우고 `/items/low-stock/process-all`을 호출하면, 재고 부족 품목마다 "대체품 찾음/재주문 필요/오류" 중 하나의 결과가 배열로 온다. 이 시점에서 당신은 BiddingFlow가 하는 일의 축소판(재고 확인 → AI 판단 → 결과 집계 → API로 노출)을 처음부터 혼자 만든 것이다.

<details>
<summary>정답 예시 보기 (STEP 9)</summary>

```python
@app.get("/items/{item_code}/process")
def process_endpoint(item_code: str):
    return safe_process_item(item_code)

@app.get("/items/low-stock/process-all")
def process_all_endpoint(threshold: int = 10):
    low_stock_items = list_low_stock_items(threshold)
    return [
        {"item_code": item["item_code"], **safe_process_item(item["item_code"])}
        for item in low_stock_items
    ]
```
</details>

---

## 이 실습에서 얻어야 할 것

코드를 다 완성하는 것보다 중요한 건, 다음 질문에 스스로 답할 수 있게 되는 것이다:

- STEP 3(API 연결)을 STEP 1~2보다 먼저 하지 않은 이유는? (함수 로직이 안 정해진 채로 API부터 만들면, API 계약을 몇 번이고 다시 바꿔야 한다.)
- STEP 6에서 LangGraph를 안 쓴 이유는? (복잡도가 그걸 정당화할 만큼 크지 않았다 — 도구를 먼저 고르지 말고 필요가 생겼을 때 도입하라.)
- STEP 7에서 "인터페이스를 유지한 채 구현만 바꿨다"는 게 왜 중요한가? (03번, 05번 문서의 "외부 의존성을 한 곳에 모아라" 원칙을 스스로 체험한 것이다.)
- STEP 8에서 "AI 실패 처리를 어디서 할지 중복 없이 정했다"는 게 왜 중요한가? (같은 실패를 여러 계층에서 각자 다르게 처리하면, 나중에 정책을 바꿀 때 여러 곳을 찾아 고쳐야 한다.)
