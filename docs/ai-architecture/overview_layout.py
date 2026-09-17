"""Large hub-and-spoke layout; executed by render_visual.py after drawing helpers."""

def heading(x,y,title,sub=''):
    s.append(f'<text x="{x}" y="{y}" style="font-size:28px;font-weight:700">{escape(title)}</text>')
    if sub: text(x,y+32,sub,'small')

def link(d,label,x,y,both=False,fallback=False):
    color='#c18830' if fallback else '#617991'
    start=' marker-start="url(#a)"' if both else ''
    s.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="3" marker-end="url(#{"f" if fallback else "a"})"{start}/>')
    # A light backing keeps relationship labels legible on long connectors.
    width=max(110,sum(22 if ord(char)>127 else 12 for char in label)+26)
    s.append(f'<rect x="{x-width/2}" y="{y-25}" width="{width}" height="36" rx="7" fill="#f7f9fc"/>')
    label_color='#985e13' if fallback else '#304d69'
    s.append(f'<text x="{x}" y="{y}" text-anchor="middle" style="font-size:22px;font-weight:700;fill:{label_color}">{escape(label)}</text>')

def row(x,y,kind,title,sub,color='#3979b7'):
    icon(x,y,kind,color,1.05)
    text(x+76,y+22,title)
    text(x+76,y+50,sub,'small')

heading(70,65,'BiddingFlow  |  AI 시스템 아키텍처','전체 연결 구조 → 구매 실행 단계 → 확장 설계 순서로 읽습니다.')
for x,role,label in [(1740,'ai','모델 추론·추천'),(1970,'rule','조건·검증·실행'),(2200,'human','선택·승인')]:
    badge(x,40,role)
    text(x+77,58,label,'small')
text(1740,100,'실선: 연결 흐름   주황: 장애 대응   [예정]: 추가·전환 설계','small')

# Entry flow: people -> interface -> authenticated backend.
node(590,170,300,'사용자 · 공급사','구매 요청 / 견적 제출 / 수주 응답','user',h=135)
node(1030,170,400,'구매 업무 화면','React · Vite / 구매 상태·작업 관리','screen',h=135)
link('M890 237H1030','요청 · 확인',960,219,True)
rect(1030,360,400,100)
icon(1050,382,'server')
text(1120,394,'FastAPI · 업무 서비스')
text(1120,425,'인증 / 업무 API / SSE 알림','small')
link('M1230 305V360','API / SSE',1320,339,True)

# The central runtime is deliberately the strongest visual anchor.
rect(870,530,760,340,'#dfeefa')
icon(912,568,'robot','#286ea8',1.65)
heading(1020,599,'구매 오케스트레이터','LangGraph · 상태 기반 워크플로')
badge(1528,556,'rule')
rect(910,688,680,87,'#ffffff')
text(1250,722,'현재 상태 + 규칙 + 사용자 응답',anchor='middle')
text(1250,752,'Command(update, goto) → 다음 단계 결정','small','middle')
text(1250,826,'대체품 → 공급사 → RFQ → 견적 → 수주 → PO',anchor='middle')
link('M1230 460V530','구매 실행',1330,502)

# Model runtime, external tools and memory are separate architectural blocks.
rect(70,530,600,340,'#f2ebfd')
heading(100,577,'AI 모델','사용자 확정 운영안 · Qwen 통합 전환')
row(105,638,'chip','Qwen3.5-9B · 4bit','단일 모델 / OCR: thinking off / 판단: on','#8057b0')
text(105,727,'내부 판단: 견적 평가 · 품목 규격 검증 · 대체품 탐색','small')
row(105,772,'cloud','gpt-5.6-luna','외부 웹 / Tool-Calling 에이전트 3종','#8057b0')
link('M870 655H670','추론 요청 / 결과',770,630,True)

# Planned document ingestion fills the former assistant space.
rect(1780,170,650,330,'#f2ebfd',True)
heading(1810,214,'견적서 파싱 · OCR')
badge(2230,239,'ai')
badge(2300,239,'rule')
row(1815,270,'doc','견적서 → OCR → JSON','손글씨 / 인쇄 · Qwen3.5-9B 4bit','#8057b0')
text(1815,380,'AI  추출 (thinking off)', 'label')
text(1815,431,'규칙  JSON 검증 → ERP 등록','small')
link('M2110 500V560','견적 JSON [예정]',2290,539)

rect(70,950,600,240,'#edf5fc')
heading(100,995,'외부 검색 도구')
for x,kind,title,sub in [(115,'search','Tavily','후보 수집'),(300,'shield','DART','기업 매칭'),(490,'cloud','Naver','연락처 보완')]:
    icon(x,1030,kind,scale=1.15)
    text(x+25,1110,title,anchor='middle')
    text(x+25,1140,sub,'small','middle')
edge('M205 1060H275')
edge('M397 1060H465')
link('M670 1050H760V790H870','검색 / 보완',760,908,True)

rect(1780,560,650,330,'#eeedf9')
heading(1810,605,'데이터 · 실행 메모리')
row(1815,650,'db','ERPNext','MR · 공급사 · RFQ · 견적 · PO 원천','#8065ab')
row(1815,730,'db','PostgreSQL','케이스 · 작업 · 알림 · 검색 캐시 · 판단 이력','#8065ab')
row(1815,810,'retry','SQLite 체크포인트','thread_id 단위 실행 저장 / 재개','#8065ab')
link('M1630 680H1780','저장 / 조회',1705,655,True)
text(2105,925,'ERP Webhook / Polling → 업무 서비스 동기화','small','middle')

rect(870,970,760,170,'#fff3da')
icon(905,1006,'user','#af7928',1.4)
heading(1000,1015,'사람의 판단 · 승인')
text(1000,1057,'대체품 선택 · RFQ 대상 · 최종 업체 · 서류 · PR 요청','small')
text(1000,1092,'담당자 승인 / 공급사 수주 응답 → 대기 중인 단계 재개','small')
link('M1250 870V970','interrupt / resume',1400,929,True)

rect(1780,980,650,210,'#fff0e3')
icon(1810,1005,'retry','#c18830',1.1)
heading(1880,1038,'Fallback · 복구')
text(1815,1080,'견적 결과 없음 → 대기·재확인','small')
text(1815,1110,'실행 오류 → 체크포인트 재시도 / polling → 다음 주기','small')
text(1815,1140,'파싱 실패 [예정] → 제한 재추출 → 사람 확인','small')
text(1815,1170,'재개 가능 상태에 적용 · 공통 대체 모델 전환 미구현','small')
link('M1630 800H1685V1060H1780','오류 / 복구',1685,961,fallback=True)

# Detail layer, kept below the system overview instead of inside the hub.
heading(70,1280,'구매 실행 상세','견적 수신 방식에 따라 분기 · 파일은 파싱·검증, 포털은 ERP 등록 후 평가로 직행')
stages=[
 ('대체품 · 비딩','search',('ai','rule','human'),['AI  대체품 추천','규칙  경쟁 / 직접 구매 판정','사람  대체품 / 신규 구매 선택']),
 ('공급사 탐색','robot',('ai','rule'),['AI  후보·연락처 추출','규칙  기존 풀·캐시·중복 제거','도구  Tavily → DART → Naver']),
 ('RFQ 발송','mail',('rule','human'),['사람  발송 대상 선택','규칙  검증·등록·발송','이후  파일 / 포털 견적 수신']),
 ('파싱 · 검증','doc',('ai','rule'),['AI  OCR → JSON (thinking off)','규칙  JSON 검증 → ERP 등록','대상  파일 견적만 처리']),
 ('견적 비교 · 선정','chart',('ai','rule','human'),['AI  Qwen 평가 [전환 예정]','규칙  1건 비교 생략·확정','사람  최종 공급사 선정']),
 ('서류 · 수주 확인','shield',('rule','human'),['규칙  서류 검사·PR·응답 분기','사람  서류 승인·PR 요청','공급사  수주 수락 / 거절']),
 ('발주 실행','truck',('rule',),['규칙  수주 수락 확인','실행  PO 생성·Submit·발송','이후  입고 등 후속 업무 서비스']),
]
for i,(title,kind,roles,lines) in enumerate(stages):
    x=70+i*342
    rect(x,1460,310,230,'#fff')
    icon(x+18,1478,kind,scale=1.05)
    for j,role in enumerate(roles): badge(x+298-len(roles)*68+j*68,1487,role)
    text(x+18,1560,f'{i+1:02d}  {title}')
    for j,line in enumerate(lines): text(x+18,1600+j*30,line,'small')
    if i<6 and i!=2: edge(f'M{x+310} 1565h32')
link('M840 1460V1360H1593V1460','포털 견적 → ERP 등록 · 파싱 생략',1260,1348)
link('M990 1460V1415H1251V1460','파일 견적',1120,1403)
link('M1935 1460V1395H1680V1460','수주 거절 → 차순위 재선정',1890,1378,fallback=True)
text(70,1730,'직접 구매: 01 → 06   ·   대체품 선택: 구매 그래프 종료   ·   수주 거절: 차순위 PR / 재비딩 / 사람 검토','small')

rect(70,1790,2360,145,'#eef2f7',True)
heading(100,1830,'확장 설계','제안 / 미구현')
for x,kind,title,sub in [(420,'queue','영속 작업 큐','Outbox · 멱등 키'),(950,'server','공유 상태 · 워커 풀','케이스별 잠금 · 체크포인터'),(1510,'chip','모델 워커 분리','추론 자원 독립 확장'),(2030,'shield','장애 격리','제한 재시도 · 실패 작업 보관')]:
    row(x,1824,kind,title,sub,'#61768f')
text(70,1980,'QLoRA 예정: Qwen3.5-9B 및 Qwen2.5-VL-7B · 손글씨 성능 개선 목표 / 최종 운영안은 Qwen3.5-9B 단일 모델','small')
text(70,2015,'현재 구조 + 사용자 제공 전환 계획 · [예정]은 구현·배포 미확인 · 모델 성능은 별도 검증 필요 · 상세: AI_SYSTEM_ARCHITECTURE.md','small')
