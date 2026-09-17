"""Render the icon-led architecture overview without external dependencies."""
from pathlib import Path
from html import escape
import xml.etree.ElementTree as ET

P = Path(__file__).resolve().parent
s = ['''<svg xmlns="http://www.w3.org/2000/svg" width="2500" height="2050" viewBox="0 0 2500 2050">
<title>BiddingFlow AI 시스템 아키텍처</title><desc>아이콘으로 표현한 구매 에이전트, 데이터 흐름, 장애 대응 및 확장 설계</desc>
<defs>
<marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0 0L8 4L0 8" fill="#667b94"/></marker>
<marker id="f" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0 0L8 4L0 8" fill="#d18a26"/></marker>
</defs><style>text{font-family:'Malgun Gothic',sans-serif;fill:#223b57} .label{font-size:23px;font-weight:700} .small{font-size:18px;fill:#62758c} .section{font-size:20px;font-weight:700}</style>
<rect width="2500" height="2050" fill="#f7f9fc"/>''']

def text(x,y,t,cls='label',anchor='start'):
    s.append(f'<text x="{x}" y="{y}" class="{cls}" text-anchor="{anchor}">{escape(t)}</text>')

def rect(x,y,w,h,fill='#fff',dash=False):
    d=' stroke-dasharray="7 6"' if dash else ''
    s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="{fill}" stroke="#ccd8e5" stroke-width="1.5"{d}/>')

def icon(x,y,kind,color='#3979b7',scale=1):
    paths={
      'user':'<circle cx="24" cy="13" r="8"/><path d="M8 43v-5a16 16 0 0 1 32 0v5M6 43h36"/>',
      'screen':'<rect x="3" y="5" width="42" height="30" rx="4"/><path d="M17 44h14M24 35v9M3 13h42"/>',
      'server':'<rect x="4" y="4" width="40" height="16" rx="3"/><rect x="4" y="28" width="40" height="16" rx="3"/><path d="M12 12h2m7 0h15M12 36h2m7 0h15"/>',
      'robot':'<rect x="4" y="12" width="40" height="30" rx="8"/><path d="M24 12V4M20 4h8M14 24h2m16 0h2M15 34h18M0 23v10m48-10v10"/>',
      'search':'<circle cx="20" cy="20" r="14"/><path d="M30 30l15 15M13 20h14M20 13v14"/>',
      'mail':'<rect x="3" y="9" width="42" height="31" rx="4"/><path d="M4 12l20 16 20-16"/>',
      'chart':'<path d="M5 3v41h40M13 35V24h6v11m7 0V15h6v20m7 0V6h6v29"/>',
      'doc':'<path d="M9 3h22l10 10v32H9zM30 3v12h11M16 24h18M16 32h18"/>',
      'truck':'<path d="M3 11h26v26H3zM29 21h10l7 9v7H29"/><circle cx="12" cy="39" r="5"/><circle cx="37" cy="39" r="5"/>',
      'db':'<ellipse cx="24" cy="9" rx="19" ry="7"/><path d="M5 9v30c0 10 38 10 38 0V9M5 23c0 10 38 10 38 0"/>',
      'chip':'<rect x="10" y="10" width="28" height="28" rx="5"/><path d="M18 0v10m12-10v10M18 38v10m12-10v10M0 18h10m-10 12h10M38 18h10m-10 12h10M19 19h10v10H19z"/>',
      'cloud':'<path d="M12 38h25a10 10 0 0 0 2-20 15 15 0 0 0-29-2 11 11 0 0 0 2 22z"/>',
      'shield':'<path d="M24 3L43 10v15c0 11-19 21-19 21S5 36 5 25V10zM14 24l7 7 14-15"/>',
      'queue':'<rect x="3" y="5" width="42" height="10" rx="3"/><rect x="3" y="20" width="42" height="10" rx="3"/><rect x="3" y="35" width="42" height="10" rx="3"/>',
      'retry':'<path d="M40 16A18 18 0 1 0 42 31M40 3v13H27"/>',
      'book':'<path d="M24 10Q12 1 3 7v34q12-6 21 1 12-7 21-1V7q-12-6-21 3v32"/>',
    }
    s.append(f'<g transform="translate({x} {y}) scale({scale})" fill="none" stroke="{color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">{paths[kind]}</g>')

def badge(x,y,role):
    color,fill,label={'ai':('#7850b5','#f0e8ff','AI'), 'rule':('#276caa','#e6f2ff','규칙'), 'human':('#a16c11','#fff0ce','사람')}[role]
    s.append(f'<rect x="{x}" y="{y}" width="62" height="24" rx="{12 if role == "human" else 5}" fill="{fill}" stroke="{color}"/>')
    if role == 'ai':
        s.append(f'<path d="M{x+12} {y+6}l6 6-6 6-6-6z" fill="{color}"/>')
    elif role == 'rule':
        s.append(f'<rect x="{x+7}" y="{y+7}" width="10" height="10" fill="{color}"/>')
    else:
        s.append(f'<circle cx="{x+12}" cy="{y+12}" r="5" fill="{color}"/>')
    s.append(f'<text x="{x+23}" y="{y+17}" style="font-size:13px;font-weight:700;fill:{color}">{label}</text>')

ROLES={
    '대체품 · 비딩':('ai','rule','human'),
    '공급사 탐색':('ai','rule'),
    'RFQ 발송':('rule','human'),
    '견적 비교 · 선정':('ai','rule','human'),
    '서류 · 수주 확인':('rule','human'),
    '발주 실행':('rule',),
    '질문 해석 · 의도 라우팅':('ai','rule'),
    '구매 현황':('rule',),
    '사용법 · 기능':('rule',),
}

def node(x,y,w,title,subtitle,kind,fill='#fff',color='#3979b7',h=122):
    rect(x,y,w,h,fill)
    roles=ROLES.get(title,())
    if roles:
        icon(x+14,y+12,kind,color,.8)
        for i,role in enumerate(roles):
            badge(x+w-12-len(roles)*67+i*67,y+17,role)
        text(x+w/2,y+71,title,anchor='middle')
        for i,line in enumerate(subtitle.split('|')):
            text(x+w/2,y+94+i*20,line,'small','middle')
    else:
        icon(x+w/2-24,y+13,kind,color)
        text(x+w/2,y+85,title,anchor='middle')
        text(x+w/2,y+108,subtitle,'small','middle')

def edge(d,label='',x=0,y=0,fallback=False,dash=False):
    color='#d18a26' if fallback else '#667b94'
    extra=' stroke-dasharray="7 6"' if dash else ''
    s.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="2" marker-end="url(#{"f" if fallback else "a"})"{extra}/>')
    if label: text(x,y,label,'small','middle')


exec(compile((P / 'overview_layout.py').read_text(encoding='utf-8'), 'overview_layout.py', 'exec'))
s.append('</svg>')
svg = '\n'.join(s)
ET.fromstring(svg)
(P / 'AI_SYSTEM_ARCHITECTURE.svg').write_text(svg, encoding='utf-8')
print('Generated 2500 x 2050 SVG; XML validated.')
