# 10. 코딩 연습문제

이 문제들은 프로젝트 코드를 복사하면 풀리지 않는다. **개념을 이해해야만 풀 수 있게** 설계했다 — 정답 코드를 주지 않는다. 대신 "무엇을 확인해야 하는지", "어떤 함정이 있을 수 있는지"를 힌트로 준다. 각 문제를 풀고 나서 "완료 조건"의 테스트 케이스를 직접 손으로 검증하라.

---

## 문제 1. 재고 부족 알림 함수

**배경**: `decide_bidding.py`는 "비딩이 필요한가"를 판정하지만, "재고 자체가 위험한 수준인가"를 알림으로 알려주는 기능은 없다.

**요구사항**: `check_stock_alert(item_code: str, warehouse: str) -> dict | None`을 작성하라.
- `erp_client.py`의 `get_stock_level`과 `get_reorder_settings`를 참고해(그대로 베끼지 말고, 두 함수가 어떤 정보를 주는지 이해한 뒤) 재고가 재주문 기준(`warehouse_reorder_level`) 이하인지 확인한다.
- 위험 수준이면 `{"item_code":, "current_qty":, "reorder_level":, "severity": "critical" | "warning"}` 형태를 반환한다. `severity`는 재고가 기준의 50% 미만이면 `"critical"`, 그 외엔 `"warning"`이다.
- 위험하지 않으면 `None`을 반환한다.

**생각해볼 점**:
- `check_reorder_needed`가 이미 있는데 왜 새로 만들어야 하는가? (기존 함수는 bool과 발주 수량만 반환하지, "얼마나 심각한지"는 알려주지 않는다 — 요구사항이 다르면 기존 함수를 억지로 재사용하지 말고 새로 만드는 것도 정답이다.)
- 재고나 재주문 설정이 없는 품목(`None` 반환)은 어떻게 처리할 것인가?

**완료 조건(테스트 케이스 예시)**:
| 재고 | 재주문기준 | 기대 결과 |
|---|---|---|
| 2 | 10 | `severity: "critical"` (2 < 10*0.5) |
| 7 | 10 | `severity: "warning"` |
| 15 | 10 | `None` |

---

## 문제 2. 가격 비교 함수

**배경**: `sq_evaluation.py`는 AI로 견적을 비교하지만, AI 호출 없이 "숫자만으로" 빠르게 비교하는 규칙 기반 함수가 있으면 AI 호출 전 필터링이나 AI 장애 시 대체(fallback)에 쓸 수 있다.

**요구사항**: `compare_quotations_by_price(quotations: list[dict]) -> list[dict]`을 작성하라.
- 입력은 `[{"supplier": "...", "grand_total": 120000, "expected_delivery_date": "2026-09-20"}, ...]` 형태.
- 총액 오름차순으로 정렬하되, **총액이 같으면 납기가 빠른 순**으로 2차 정렬한다.
- 각 항목에 `"price_rank"`(1부터 시작)를 추가해 반환한다.

**생각해볼 점**:
- 정렬 기준이 두 개(가격, 납기)일 때 파이썬 `sorted`의 `key`를 어떻게 튜플로 구성할 것인가? (02번 문서 13번 lambda 항목을 다시 보라.)
- `grand_total`이나 `expected_delivery_date`가 없는(`None`) 견적이 섞여 있으면 어떻게 처리할 것인가? 정렬 도중 `TypeError`가 나지 않게 하려면?

**완료 조건**: 총액이 동일한 두 업체 중 납기가 더 빠른 쪽이 더 높은 순위(`price_rank`가 더 작은 값)를 받는지 직접 테스트 데이터로 확인하라.

---

## 문제 3. 공급사 점수 계산 함수

**배경**: `erp_client.py`의 `call_ranking_model`은 "과거 거래 횟수"만 보는 자리표시자(placeholder)였다. 이를 여러 지표를 반영하는 점수 함수로 발전시켜보자.

**요구사항**: `calculate_supplier_score(signals: dict) -> float`를 작성하라. 입력은:
```python
{"past_order_count": 5, "avg_rate": 12000, "on_time_delivery_rate": 0.9, "market_avg_rate": 13000}
```
- 점수는 0~100 사이. 다음 가중치를 적용한다: 거래 횟수(많을수록 좋음, 최대 5회까지만 가점 — 그 이상은 동일 취급) 30%, 평균단가가 시장평균보다 얼마나 싼지 40%, 정시배송률 30%.
- `sq_evaluation.py`의 프롬프트에 나온 실제 가중치 문구("품질 30%, 납기 25%, 가격 20%, 서비스 15%, 커뮤니케이션 10%")를 참고해서, **네 스스로 다른 가중치 조합을 설계**해도 좋다. 단, 가중치의 합이 100%가 되어야 하고, 왜 이 가중치를 선택했는지 주석으로 설명하라.

**생각해볼 점**:
- "많을수록 무조건 좋은 지표"(거래횟수)와 "낮을수록 좋은 지표"(가격)를 하나의 0~100 점수로 합칠 때, 단위를 어떻게 맞출 것인가? (힌트: 가격은 "시장평균 대비 절감률"로 변환하면 방향을 통일시킬 수 있다.)
- 이 함수가 `None`이나 `0`으로 나눌 위험이 있는 입력(예: `market_avg_rate: 0`)을 받으면 어떻게 방어할 것인가?

**완료 조건**: 모든 지표가 평균 수준인 공급사와, 모든 지표가 최상급인 공급사를 각각 넣어봤을 때 후자의 점수가 명확히 높게 나오는지 확인한다.

---

## 문제 4. API 결과 필터링

**배경**: `src/procurement/api/cases.ts`의 `listProcurementCases`는 항상 전체 케이스를 가져온 뒤 프론트에서 가공한다. 특정 조건(예: "이번 주 마감인 것만")으로 필터링하는 유틸리티가 필요하다고 하자.

**요구사항**: TypeScript로 `filterCasesDueThisWeek(cases: ProcurementCaseDTO[]): ProcurementCaseDTO[]`를 작성하라.
- `quotation_deadline_at`이 오늘부터 7일 이내인 케이스만 남긴다.
- `quotation_deadline_at`이 없는 케이스는 제외한다.
- 이미 종료된 상태(`COMPLETED`, `CANCELLED`, `REJECTED`)는 제외한다.

**생각해볼 점**:
- `src/procurement/api/cases.ts`의 `LEGACY_CASE_STATE`나 `caseToMaterialRequest` 안에서 날짜 계산이 어떻게 되는지(`calculateDDay` 함수) 먼저 읽어보고, 같은 스타일(문자열 날짜를 `Date` 객체로 바꾸는 방식)을 따르라.
- 시간대(timezone) 문제를 어떻게 처리할 것인가? (`calculateDDay`가 `T23:59:59`를 붙이는 이유를 생각해보라.)

**완료 조건**: 마감이 3일 남은 케이스는 포함되고, 마감이 지난(과거) 케이스나 20일 남은 케이스는 제외되는지 확인한다.

---

## 문제 5. 새로운 workflow node 추가 (설계만, 코드는 선택)

**배경**: 05번 문서에서 다룬 "물류 추적" 확장 시나리오를 실제로 설계해보자.

**요구사항**: 다음을 문서(주석 또는 마크다운)로 작성하라 — 실제 그래프에 등록하지 않아도 된다.
1. `PurchaseProcessState`에 추가해야 할 새 필드 이름과 타입.
2. 새 노드 함수의 이름과 시그니처(`def track_shipment_command(state: PurchaseProcessState) -> Command:`), 그리고 이 함수가 반환할 `Command`의 `update`/`goto` 예시 2가지 이상(정상 배송 중 / 배송 지연).
3. 이 노드가 그래프의 어느 기존 노드 뒤에 연결되어야 하는지, 그 이유.
4. 이 노드가 사람의 입력을 기다려야 하는 지점이 있다면(`interrupt()`), 어떤 상황에서인지.

**생각해볼 점**:
- `create_po_command`가 `goto=END`로 끝나는데, 새 노드를 이어붙이려면 이 부분을 어떻게 바꿔야 하는가?
- "배송 지연"을 감지하려면 이 노드가 몇 초/몇 분 간격으로 다시 실행돼야 할까? LangGraph의 노드 하나로 "반복 폴링"을 표현할 수 있는가, 아니면 `main.py`의 백그라운드 태스크 패턴(`_poll_purchase_documents`류)이 더 적합한가? 둘의 차이를 설명하라.

**완료 조건**: 위 4가지 항목에 대해 스스로 납득할 만한 답을 문서로 작성했다면 통과다. (실제로 구현해보고 싶다면 `08_rebuild_project.md`의 미니 프로젝트에 이 아이디어를 적용해도 좋다.)

---

## 문제 6. (보너스) 폴링 최적화

**배경**: 09번 문서의 Q32에서 확인했듯, `ProcurementWorkspace.tsx`의 활성 워크플로 폴링은 탭이 백그라운드에 있어도 계속 돈다.

**요구사항**: `document.visibilityState`를 확인해서, 탭이 보이지 않을 때는 폴링 간격을 늘리거나(예: 10초로) 완전히 멈췄다가, 탭이 다시 보이면 즉시 한 번 갱신하고 원래 간격(1.8초)으로 복귀하는 로직을 설계하라.

**생각해볼 점**:
- `document.addEventListener('visibilitychange', ...)`를 어디서 등록하고 해제해야 메모리 누수가 없는가? (React의 `useEffect` cleanup 함수를 떠올려보라.)
- 이 최적화가 "왜 지금까지는 없었어도 큰 문제가 안 됐을까"도 생각해보라 — 모든 최적화가 항상 최우선 순위는 아니다.

**완료 조건**: 탭을 백그라운드로 보냈을 때 네트워크 탭에서 요청 빈도가 줄어드는 것을 브라우저 개발자도구로 직접 확인한다.
