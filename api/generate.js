/* ============================================================
   /api/generate  — Claude 프록시 (서버리스, Vercel Node 함수)
   · ANTHROPIC_API_KEY 를 서버에만 보관 (프론트에 노출 X)
   · 입력: { text, image(dataURL|null) }
   · Claude가 킷 규칙에 맞는 CG "스펙(JSON)"을 생성 → 프론트의 renderKitCG가 그림
   · 원본 이미지를 그대로 쓰지 않고, 데이터/텍스트만 추출해 킷 규격으로 재작도
   환경변수: ANTHROPIC_API_KEY (필수), CLAUDE_MODEL (선택)
   ============================================================ */

const MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest';

const SYSTEM = `당신은 한국경제TV/한경글로벌TV '머니플러스'의 방송 CG 디자이너입니다.
시청자용 방송 그래픽(CG)을 만들기 위한 "스펙(JSON)"만 출력합니다. 설명·인사·코드블록 없이 순수 JSON 객체 하나만 반환하세요.

[킷 규칙]
- 화면 16:9. 콘텐츠는 상단/하단 티커 안전지대를 침범하지 않습니다(렌더러가 자동 보장).
- 데이터 그래프·표·순위·타임라인 등 "차트류"는 남색 헤더 + 흰 카드 양식입니다 → type을 bars/line/rank_bars/chart_frame 로.
- 테마주·관련주 총정리 같은 "박스형 목록"은 type을 theme_grid 로(하늘색 배경, 가운데 정렬, 번호 없음).
- 인물 말자막/인용은 type을 quote 로.
- "오늘의 토크 흐름"처럼 주제 순서를 지하철 노선도로 보여주고 현재 주제에 열차 마커를 두는 건 type을 topic_line 으로. stations에 주제들, active에 현재 index.
- "韓증시 영향 글로벌 지표"(MSCI 한국 ETF·야간선물·WTI·브렌트유·필라델피아 반도체·원달러 환율·미10년물 금리)는 type을 indicator 로. values에 7개 키(ewy,night,wti,brent,sox,fx,ust)를 채운다. 상승은 그대로, 하락은 '-'를 붙이면 색이 자동 처리된다. 괄호 변동치는 subs에.
- "미증시 3줄 요약"은 type을 three_line 으로. lines에 3문장(제목은 템플릿에 인쇄돼 있으니 title은 비운다).
- 색은 방송 팔레트만. 임의로 빨강 강조를 넣지 않습니다(강조가 꼭 필요하면 1개만).
- 제목은 간결하게. 단위/출처를 알면 unit/source에 넣습니다. 숫자는 실제 수치를 그대로.
- 첨부 이미지가 오면 그 이미지를 그대로 쓰지 말고, 안의 데이터·항목만 읽어 위 킷 타입으로 재구성하세요.

[스펙 스키마] (type에 따라 필요한 필드만)
{
  "type": "bars|line|rank_bars|theme_grid|quote|topic_line|indicator|three_line|chart_frame",

  // indicator (韓증시 영향 글로벌 지표 — 아이콘 템플릿에 수치만 얹음, title 비움)
  "values": {"ewy":"+2.00%","night":"+0.36%","wti":"$80.34(-5.11%)","brent":"$83.77(-4.73%)","sox":"+1.06%","fx":"1,429.34","ust":"4.68%"},
  "subs": {"fx":"(-0.46원)"},

  // three_line (미증시 3줄 요약 — 메모지 양식, title 비움)
  "lines": ["뉴욕증시 3대 지수 상승 마감","엔비디아 기대에 반도체주 강세","국제유가는 하락"],

  // topic_line (오늘의 토크 흐름 · 지하철 노선도형)
  "stations": ["반도체","전력기기","바이오","K뷰티"],
  "active": 0,
  "title": "제목",
  "unit": "단위(선택)",
  "source": "출처(선택)",

  // bars, line (categories = x축 라벨, series = 계열, data[계열][카테고리])
  "categories": ["2023","2024","2025"],
  "series": [{"name":"매출","color":"#22B7CB"},{"name":"영업이익","color":"#B24A7C"}],
  "data": [[10,12,15],[2,3,4]],

  // rank_bars (순위 막대)
  "ranks": [{"label":"삼성전자","value":100},{"label":"SK하이닉스","value":80}],
  "suffix": "%",

  // theme_grid (관련주/테마 박스). groups(카테고리별) 또는 cards(개별) 중 하나
  "groups": [{"cat":"대형 브랜드","items":["아모레퍼시픽","LG생활건강"]}],
  "cards": [{"name":"에이피알","desc":"뷰티 디바이스"}],
  "cols": 5,

  // quote
  "quote": "인용문",
  "who": "이름/직함",

  // chart_frame (범용 요약 카드)
  "bullets": ["핵심1","핵심2"]
}
가장 적합한 하나의 type을 골라, 실제 데이터로 채운 JSON만 출력하세요.`;

function extractJSON(txt){
  if(!txt) return null;
  // 코드펜스 제거
  txt = txt.replace(/```json/gi,'```').replace(/```/g,'');
  const s=txt.indexOf('{'), e=txt.lastIndexOf('}');
  if(s<0||e<0) return null;
  try{ return JSON.parse(txt.slice(s,e+1)); }catch(_){ return null; }
}
function parseDataUrl(d){
  const m=/^data:([^;]+);base64,(.*)$/.exec(d||'');
  if(!m) return null; return { media_type:m[1], data:m[2] };
}

module.exports = async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(req.method!=='POST'){ res.status(405).json({error:'POST only'}); return; }

  const KEY=process.env.ANTHROPIC_API_KEY;
  if(!KEY){ res.status(500).json({error:'ANTHROPIC_API_KEY 미설정'}); return; }

  let body=req.body;
  if(typeof body==='string'){ try{ body=JSON.parse(body); }catch(_){ body={}; } }
  const text=(body&&body.text||'').toString().slice(0,4000);
  const image=body&&body.image;
  if(!text && !image){ res.status(400).json({error:'text 또는 image 필요'}); return; }

  const content=[];
  const img=image?parseDataUrl(image):null;
  if(img){ content.push({ type:'image', source:{ type:'base64', media_type:img.media_type, data:img.data } }); }
  content.push({ type:'text', text: (text||'첨부한 이미지를 킷 규격 CG 스펙으로 재구성해줘.') + '\n\n스펙 JSON만 출력.' });

  const HDR={ 'content-type':'application/json', 'x-api-key':KEY, 'anthropic-version':'2023-06-01' };
  const ask = (model) => fetch('https://api.anthropic.com/v1/messages',{
    method:'POST', headers:HDR,
    body:JSON.stringify({ model, max_tokens:1500, system:SYSTEM, messages:[{role:'user',content}] })
  });

  try{
    let usedModel=MODEL;
    let r=await ask(usedModel);

    // 모델명이 이 계정에서 못 쓰는 경우 → 사용 가능한 모델을 조회해 자동 재시도
    if(!r.ok && (r.status===404 || r.status===400)){
      const firstErr=await r.text();
      try{
        const lr=await fetch('https://api.anthropic.com/v1/models',{headers:HDR});
        if(lr.ok){
          const lj=await lr.json();
          const ids=(lj.data||[]).map(m=>m.id).filter(Boolean);
          const pick=ids.find(i=>/sonnet/i.test(i)) || ids.find(i=>/haiku/i.test(i)) || ids[0];
          if(pick && pick!==usedModel){ usedModel=pick; r=await ask(usedModel); }
        }
      }catch(_){}
      if(!r.ok){
        const t=await r.text();
        res.status(502).json({ error:'Claude API '+r.status+' (model: '+usedModel+')', detail:(t||firstErr).slice(0,400) });
        return;
      }
    }
    if(!r.ok){
      const t=await r.text();
      res.status(502).json({ error:'Claude API '+r.status+' (model: '+usedModel+')', detail:t.slice(0,400) });
      return;
    }
    const j=await r.json();
    const txt=(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
    const spec=extractJSON(txt);
    if(!spec){ res.status(502).json({error:'스펙 파싱 실패', raw:txt.slice(0,300)}); return; }
    res.status(200).json({ spec, model:usedModel });
  }catch(e){
    res.status(500).json({error:'서버 오류', detail:String(e&&e.message||e)});
  }
};
