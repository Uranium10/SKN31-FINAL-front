# 03. 백엔드 구조와 API 통신

## 1. API란 무엇인가

API(Application Programming Interface)는 "이 프로그램이 외부에서 어떻게 쓰일 수 있는지 정의한 약속"이다. 이 프로젝트에서는 세 겹의 API가 있다.

1. **프론트 ↔ 백엔드**: React 앱이 `fetchWithAuth('/api/procurement/cases')`처럼 우리 FastAPI 서버를 호출한다.
2. **백엔드 ↔ ERPNext**: `erp_client.py`가 `requests.get(f"{SITE_URL}/api/resource/Item")`처럼 ERPNext 서버를 호출한다.
3. **백엔드 ↔ OpenAI/Tavily/DART/Naver**: AI 판단이나 웹 검색이 필요할 때 각 서비스의 API를 호출한다.

세 겹 모두 원리는 같다: "정해진 주소(URL)로, 정해진 형식(HTTP 메서드+헤더+본문)의 요청을 보내면, 정해진 형식의 응답이 돌아온다."

## 2. HTTP request / response

요청은 최소 다음을 포함한다: **메서드**(GET/POST/...), **URL**, **헤더**(인증 정보 등), **본문**(body, 있을 경우). 응답은 **상태 코드**, **헤더**, **본문**을 포함한다.

실제 예시 (`backend_logic2/integrations/erp_client.py:152-170`):
```python
def erp_get(doctype, filters=None, fields=None, order_by=None, limit=None, start=None):
    params = {}
    if filters:
        params["filters"] = json.dumps(filters)
    ...
    res = requests.get(f"{SITE_URL}/api/resource/{doctype}", headers=HEADERS, params=params)
    if res.status_code != 200:
        raise ERPNextAPIError(f"GET {doctype}: {res.status_code} - {res.text[:300]}")
    return res.json().get("data")
```
- **메서드**: GET
- **URL**: `{SITE_URL}/api/resource/{doctype}` (예: `Item`, `Material Request`)
- **헤더**: `HEADERS` (인증 토큰 포함)
- **쿼리 파라미터**: `filters`, `fields` 등을 JSON 문자열로 직렬화해서 담음
- **응답**: JSON을 파싱해서 `data` 키만 꺼내 반환

## 3. GET / POST / PUT / DELETE

이 프로젝트에서 실제로 쓰는 메서드와 의미:

| 메서드 | 의미 | 이 프로젝트의 예 |
|---|---|---|
| GET | 조회, 부작용 없음 | `erp_get`, `GET /api/procurement/cases` |
| POST | 생성 또는 "행동을 실행" | `erp_post`(문서 생성), `POST /api/procurement/cases/{id}/start`(구매 시작) |
| PUT | 기존 문서 수정 | `erp_submit`이 내부적으로 `requests.put(...,{"docstatus":1})`을 호출 — ERPNext는 문서 확정(Submit)도 PUT으로 표현한다 |
| DELETE | 삭제 | `DELETE /api/procurement/notifications/{id}` (알림 삭제) |

주의할 점: REST 원칙대로라면 "생성=POST, 수정=PUT"이 깔끔하지만, 실무 코드는 프레임워크(Frappe/ERPNext)의 관례를 따른다. ERPNext는 문서 상태를 바꾸는 것(Draft→Submit)도 PUT으로 표현한다. **"이 프로젝트가 REST를 100% 교과서대로 따르는가"보다 "이 API를 만든 프레임워크의 관례가 무엇인가"를 먼저 파악하는 게 실전에서 더 중요하다.**

## 4. JSON

JSON은 API가 데이터를 주고받는 공용 문자열 형식이다. 파이썬 dict/list ↔ JSON 문자열 변환은 `json.dumps`/`json.loads`가 담당하지만, `requests`와 FastAPI는 이를 자동으로 처리해준다:

```python
# 보낼 때: json=payload 를 쓰면 requests가 자동으로 dict를 JSON 문자열로 바꿔 보낸다
res = requests.post(f"{SITE_URL}/api/resource/{doctype}", headers=HEADERS, json=payload)

# 받을 때: .json()이 응답 본문(JSON 문자열)을 파이썬 dict/list로 바꿔준다
return res.json().get("data")
```

FastAPI 쪽에서는 pydantic 모델이 이 역할을 자동으로 해준다 (`backend_logic2/api/procurement_routes.py`):
```python
class ResumeTaskRequest(BaseModel):
    answer: dict[str, Any]
    version: int | None = None

@router.post("/tasks/{task_id}/answer")
def answer_task(task_id: str, body: ResumeTaskRequest, current_user: CurrentUser):
    ...
```
프론트가 `{"answer": {...}, "version": 3}`라는 JSON을 보내면, FastAPI가 자동으로 `ResumeTaskRequest` 객체로 변환하고, 형식이 안 맞으면(예: `version`이 문자열) 자동으로 422 에러를 응답한다 — 이게 pydantic을 쓰는 가장 큰 이유다: **검증 코드를 직접 안 짜도 된다.**

## 5. endpoint

엔드포인트는 "이 URL + 이 메서드"의 조합 하나다. 이 프로젝트의 라우터들이 등록하는 접두사(prefix):

| 라우터 파일 | prefix | 예시 엔드포인트 |
|---|---|---|
| `auth_service/router.py` | `/api` | `POST /api/login`, `GET /api/me` |
| `backend_logic2/integrations/erp_client.py` | `/purchase` | `GET /purchase/items` |
| `backend_logic2/api/procurement_routes.py` | `/api/procurement` | `GET /api/procurement/cases`, `POST /api/procurement/cases/{id}/start` |
| `backend_logic2/api/procurement_routes.py` (webhook_router) | `/api/webhooks/erpnext` | `POST /api/webhooks/erpnext/material-request` |
| `backend_logic2/api/mr_substitute_routes.py` | `/api/mr` | `POST /api/mr/{mr_name}/substitute-decision` |
| `backend_logic2/assistant/api.py` | `/api/assistant` | `POST /api/assistant/messages` |
| `backend_logic2/pr/routes.py` | (internal/public) | `POST /api/public/pr/respond/{token}` |

`main.py`에서 이 라우터들을 `app.include_router(...)`로 조립한다(`main.py:336-363`). 이렇게 기능별로 라우터 파일을 나누는 것이 "폴더/파일을 왜 나누는가"(`05_architecture_design.md`)의 실제 예시다.

## 6. status code

이 프로젝트가 실제로 사용하는 상태 코드와 그 의미:

| 코드 | 이 프로젝트의 사용처 |
|---|---|
| 200 | 정상 조회/처리 |
| 201 | ERPNext 문서 생성 성공 (`erp_post`가 200 또는 201을 모두 성공으로 취급) |
| 202 Accepted | `start_case`가 "요청은 받았지만 실제 처리는 백그라운드에서 진행 중"임을 알림 |
| 401 | 인증 실패 (JWT 만료 → 프론트의 `fetchWithAuth`가 자동으로 `/api/refresh` 재시도) |
| 403 | 권한 없음 (`_require_case_access`가 "이 케이스 담당자가 아님"을 감지) |
| 404 | 대상을 찾을 수 없음 (`case_repository.get_case`가 `None`을 반환했을 때) |
| 409 Conflict | 낙관적 잠금 충돌(`CaseConflictError`), 이미 처리된 작업에 재응답 시도 |
| 422 | 요청 형식은 맞지만 값이 유효하지 않음(pydantic 검증 실패, 또는 명시적 `ValueError`) |
| 502 Bad Gateway | ERPNext 자체가 실패했을 때(`ERPNextAPIError`) — "우리 서버는 정상이지만 우리가 의존하는 외부 서버가 실패했다"는 뜻 |
| 503 | PostgreSQL 연결 실패(`psycopg.Error`) |

`backend_logic2/api/procurement_routes.py:231-246`에서 이 매핑이 실제로 어떻게 코드로 표현되는지 보라:
```python
try:
    queued = workflow_service.queue_case_start(case_id, triggered_by=actor)
except LookupError as exc:
    raise HTTPException(status_code=404, detail="구매 작업을 찾을 수 없습니다.") from exc
except (ValueError, case_repository.CaseConflictError) as exc:
    raise HTTPException(status_code=409, detail=str(exc)) from exc
except ERPNextAPIError as exc:
    raise HTTPException(status_code=502, detail=str(exc)) from exc
```
**핵심 교훈**: 파이썬 예외 타입(`LookupError`, `ValueError`, 커스텀 예외)과 HTTP 상태 코드를 이렇게 명시적으로 매핑해두면, 서비스 계층(`workflow_service.py`)은 HTTP를 전혀 몰라도 된다. 서비스 계층은 그냥 적절한 파이썬 예외만 던지면 되고, "그게 몇 번 상태 코드가 되어야 하는가"는 라우터 계층의 책임이다. 이게 **관심사의 분리(separation of concerns)**다.

## 7. authentication

이 프로젝트는 두 가지 인증 방식을 나란히 쓴다.

### 7-1. 사람 사용자: JWT
```
로그인(ERPNext 자격증명 검증) → 백엔드가 자체 JWT(access/refresh) 발급
→ 프론트가 localStorage에 저장 → 이후 요청마다 Authorization: Bearer {token}
→ FastAPI의 Depends(require_authenticated_user)가 토큰을 검증해 current_user를 주입
```
`main.py`에서 대부분의 라우터는 이렇게 보호된다:
```python
app.include_router(procurement_router, dependencies=[Depends(require_authenticated_user)])
```

### 7-2. 시스템 간 통신: 고정 시크릿
- **ERPNext → 우리 백엔드(webhook)**: `ERPNEXT_WEBHOOK_SECRET`을 헤더(`X-Erpnext-Webhook-Secret`)로 비교(`_require_webhook_secret`, `procurement_routes.py:456-461`)
- **ERPNext Client Script → 우리 백엔드**: `CLIENT_SCRIPT_SECRET` (로그인 세션이 없는 ERPNext 화면 내부 스크립트가 호출하기 때문에 JWT를 쓸 수 없다)
- **우리 백엔드 → ERPNext**: `API_KEY`/`API_SECRET` (7-3 참고)

**왜 두 방식을 다르게 쓰나?** JWT는 "사람이 로그인해서 브라우저 세션을 유지"하는 상황에 맞는 방식이고, 고정 시크릿은 "사람이 없는 서버 대 서버 통신"에 맞는 방식이다. 사람이 없는 곳에 로그인/토큰 갱신 흐름을 억지로 넣는 건 과설계다.

## 8. API key

ERPNext는 API Key + API Secret 조합을 인증 토큰으로 쓴다 (Frappe 프레임워크의 표준 방식):

```python
HEADERS = {
    "Authorization": f"token {API_KEY}:{API_SECRET}",
    "Content-Type": "application/json",
    "Accept": "application/json"
}
```
이 `HEADERS`가 `erp_client.py`의 거의 모든 함수에서 재사용된다. **API 키는 절대 프론트엔드로 전달되지 않는다** — `erp_download_file` 함수의 주석에도 명시되어 있다: "브라우저에는 ERPNext API Secret을 절대 전달하지 않습니다." 이것이 프론트-백엔드를 분리하고 백엔드가 ERPNext를 대신 호출하는 BFF(Backend for Frontend) 구조를 쓰는 핵심 이유 중 하나다.

## 9. environment variable

`.env` 파일에 `SITE_URL`, `API_KEY`, `API_SECRET`을 두고 `python-dotenv`로 읽는다(02번 문서의 16번 항목 참고). 이 프로젝트에서 특히 중요한 패턴은 **"필수값은 없으면 즉시 죽게, 선택값은 안전한 기본값으로"**다:
```python
SITE_URL = os.environ["SITE_URL"]   # 없으면 KeyError로 서버 시작 자체가 실패 (의도된 동작)
...
value = os.getenv("TEST_MODE", "true")   # 없으면 "true"(가장 안전한 값: 이메일 전체 차단)
```

## 10. ERPNext API 호출 방식

정리하면 이 프로젝트가 ERPNext를 호출하는 방법은 3가지 패턴으로 나뉜다.

1. **범용 REST 리소스 API** (`/api/resource/{doctype}[/{name}]`): `erp_get`, `erp_get_one`, `erp_post`, `erp_submit`, `erp_cancel` — Item, Material Request, Supplier, RFQ, PO 등 모든 문서 타입에 공통으로 쓸 수 있는 CRUD.
2. **화이트리스트 메서드 호출** (`/api/method/{python.경로}`): `erp_call` — Frappe 서버에 미리 등록된 파이썬 함수를 이름으로 직접 호출한다. 예: `frappe.desk.form.assign_to.add`(담당자 할당), `frappe.desk.form.save.discard`(Draft 폐기), `erpnext.buying.doctype.request_for_quotation.request_for_quotation.send_supplier_emails`(RFQ 내장 발송 기능).
3. **파일 다운로드**: `erp_download_file` — SSRF(서버가 공격자가 지정한 임의 URL로 요청을 보내게 되는 취약점) 방지를 위해 반드시 ERPNext와 같은 호스트의 URL만 허용하도록 검증한 뒤 다운로드한다.

두 번째 패턴(화이트리스트 메서드)이 왜 필요한지 이해하는 게 중요하다. REST 리소스 API로는 "이메일 발송"이나 "담당자 할당" 같은 **문서 하나를 단순 CRUD하는 게 아니라 여러 부수효과가 있는 복잡한 동작**을 표현할 수 없다. Frappe는 이런 동작을 서버 쪽에 미리 함수로 정의해두고, 그 함수 이름을 API로 호출하게 해준다.

## 11. "ERPNext 대신 다른 서비스 API를 연결한다면 어떤 부분을 변경해야 하는가?"

이 질문에 답하려면 먼저 "ERPNext 의존성이 코드에서 얼마나 넓게 퍼져 있는가"를 봐야 한다. 이 프로젝트를 기준으로 답하면:

1. **변경 범위가 좁은 부분(격리가 잘 된 부분)**: `backend_logic2/integrations/erp_client.py` 하나가 ERPNext와의 모든 HTTP 통신을 담당한다. 다른 서비스(예: SAP, 다른 ERP)로 바꾼다면, 이 파일 안의 `erp_get`/`erp_post`/`erp_submit` 등의 **내부 구현**만 그 서비스의 API 스펙에 맞게 바꾸면 된다. `decide_bidding.py`, `find_substitute.py`, `sq_evaluation.py` 같은 노드들은 `erp_get_one("Material Request", mr_name)`처럼 **"ERPNext의 doctype 이름"에 의존**하지만, "erp_client.py가 어떻게 HTTP를 보내는지"는 전혀 모른다. 이게 좋은 설계다: **의존성이 한 파일에 모여 있으면, 교체 비용이 그 한 파일에 국한된다.**

2. **변경 범위가 넓은 부분(진짜 어려운 부분)**: 문제는 "doctype 이름"과 "필드 이름"이 코드 전체에 하드코딩되어 있다는 점이다. `erp_get_one("Material Request", ...)`, `item.get("supplier_items")`, `mr.get("items")` 같은 문자열/필드명은 ERPNext(Frappe)의 데이터 모델에 강하게 결합되어 있다. 다른 ERP는 "구매요청"을 다른 이름, 다른 필드 구조로 표현할 것이므로, **`erp_client.py`의 함수 시그니처(입출력 구조)는 유지하되 내부 구현과 필드 매핑을 전부 다시 짜야 한다.**

3. **인증 방식**: `HEADERS`의 `Authorization: token KEY:SECRET`은 Frappe 고유의 인증 스킴이다. 다른 서비스는 OAuth2, API Key를 헤더가 아닌 쿼리 파라미터로 받는 방식 등 전혀 다를 수 있으므로 이 부분도 새로 작성해야 한다.

4. **웹훅 페이로드 형식**: `procurement_routes.py`의 `material_request_webhook` 등은 ERPNext가 보내주는 웹훅 JSON 구조(`payload.get("doc")` 등)를 가정한다. 다른 서비스의 웹훅 페이로드 구조에 맞게 파싱 로직을 바꿔야 한다.

**결론**: 이 프로젝트처럼 "외부 시스템 호출을 한 파일(`erp_client.py`)에 모아두는 설계"는 **완전한 이식성**을 보장하진 않지만(doctype/필드명이라는 도메인 지식까지는 못 숨긴다), **"이 시스템이 ERPNext를 어떻게 부르는가"라는 관심사를 나머지 코드에서 분리**해준다. 이것만으로도 "http 요청 코드가 20개 파일에 흩어져 있는" 것보다는 훨씬 적은 노력으로 교체할 수 있다. 다른 프로젝트를 설계할 때도 **"이 API가 언젠가 바뀔 수 있다"고 생각되면, 처음부터 그 API 호출을 전담하는 모듈을 하나 만들어두라**는 게 이 사례에서 얻을 수 있는 일반 원칙이다.
