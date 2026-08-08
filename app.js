/* ============================================================
   app.js — CG 스튜디오 (한경글로벌TV · 머니플러스)   v5
   · 리본 UI / PDF·이미지 가져오기 / 방송용 텍스트 편집 / 발표자 송출 / 팀 게시판
   · Sync: Supabase Realtime (실패 시 로컬 폴백)
   ============================================================ */
const CFG = window.CG_CONFIG || {};
const CLOUD = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON);

const ROOM = (()=>{ const r=new URL(location.href).searchParams.get('room')||'moneyplus';
  return r.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40)||'moneyplus'; })();

const TRANSITIONS={ fade:'디졸브', cut:'컷', zoom:'줌 인', pushL:'왼쪽으로 밀기', wipeR:'오른쪽 닦기', up:'아래→위', flip:'플립' };
const ANIM={ fade:'tFade', cut:null, zoom:'tZoom', pushL:'tPushL', wipeR:'tWipeR', up:'tUp', flip:'tFlip' };
const COLORS=['#5ad1a0','#f0a500','#ff6f91','#5aa0ff','#c792ea','#4ad6d6','#ffd166'];
const uid='u'+Math.floor(performance.now()*1000%1e9)+Math.floor(1e6*(1/(1+(performance.now()%7))));
let myName=localStorage.getItem('cg_name')||'';
const myColor=COLORS[Math.abs([...uid].reduce((a,c)=>a+c.charCodeAt(0),0))%COLORS.length];

let PROJECT=[], selId=null, BOARD=[];
let selOvs=[], editingOv=null;          // 여러 개 선택 지원
const peers=new Map();
let sb=null, snapOn=true;

const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let toT; function toast(m){ const t=$('toast'); t.textContent=m; t.style.opacity='1'; clearTimeout(toT); toT=setTimeout(()=>t.style.opacity='0',1600); }
const busy=(on,msg)=>{ const b=$('busy'); b.style.display=on?'flex':'none'; if(msg)b.textContent=msg; };

/* ── 동기화 ── */
let Sync={ mode:'boot', send:()=>{}, on:()=>{} };
function makeLocalSync(){ const ch=new BroadcastChannel('cg-'+ROOM); const subs=[];
  ch.onmessage=e=>subs.forEach(f=>f(e.data));
  return { mode:'local', send:m=>{try{ch.postMessage(m);}catch(_){}}, on:f=>subs.push(f) }; }
async function makeSync(){
  if(!CLOUD) return makeLocalSync();
  for(const url of ['https://esm.sh/@supabase/supabase-js@2','https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm']){
    try{
      const { createClient }=await import(url);
      sb=createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON);
      const ch=sb.channel('cg-'+ROOM,{config:{broadcast:{self:false}}});
      const subs=[]; ch.on('broadcast',{event:'m'},({payload})=>subs.forEach(f=>f(payload)));
      await ch.subscribe();
      const t=$('envTag'); t.textContent='클라우드'; t.className='env cloud';
      return { mode:'cloud', send:m=>{try{ch.send({type:'broadcast',event:'m',payload:m});}catch(_){}}, on:f=>subs.push(f) };
    }catch(e){ console.warn('supabase 실패',url,e&&e.message); }
  }
  sb=null; const t=$('envTag'); t.textContent='로컬(연결실패)'; t.className='env local';
  t.title='Supabase 연결 실패 — 편집은 계속 가능';
  return makeLocalSync();
}
async function putImage(dataURL){
  if(!CLOUD||!sb) return dataURL;
  try{
    const blob=await (await fetch(dataURL)).blob();
    const ext=blob.type.includes('jpeg')?'jpg':'png';
    const path=`${ROOM}/${Date.now()}_${Math.floor(Math.random()*1e5)}.${ext}`;
    const { error }=await sb.storage.from('cg').upload(path,blob,{contentType:blob.type||'image/png',upsert:true});
    if(error){ console.warn('storage',error); return dataURL; }
    return sb.storage.from('cg').getPublicUrl(path).data.publicUrl||dataURL;
  }catch(e){ console.warn('putImage',e); return dataURL; }
}
let saveT;
function saveProject(){ if(!CLOUD||!sb)return; clearTimeout(saveT);
  saveT=setTimeout(async()=>{ try{ await sb.from('projects').upsert({room:ROOM,data:{slides:PROJECT,board:BOARD},updated_at:new Date().toISOString()}); }catch(e){ console.warn('save',e); } },700); }
async function loadProject(){
  if(CLOUD&&sb){ try{
    const { data }=await sb.from('projects').select('data').eq('room',ROOM).maybeSingle();
    if(data&&data.data){ if(Array.isArray(data.data.slides)&&data.data.slides.length){ PROJECT=data.data.slides; selId=PROJECT[0].id; }
      if(Array.isArray(data.data.board)) BOARD=data.data.board; }
  }catch(e){ console.warn('load',e); } }
}

/* ── 렌더 ── */
function curSlide(){ return PROJECT.find(x=>x.id===selId)||PROJECT[0]; }
function renderSorter(){
  const s=$('sorter'); [...s.querySelectorAll('.thumb,.addbtn')].forEach(n=>n.remove());
  PROJECT.forEach((sl,i)=>{
    const d=document.createElement('div'); d.className='thumb'+(sl.id===selId?' on':''); d.draggable=true;
    d.innerHTML=`<img src="${sl.img}"><span class="no">${i+1}</span><button class="x" title="삭제">×</button>`;
    d.onclick=e=>{ if(e.target.classList.contains('x'))return; selId=sl.id; selOvs=[]; renderAll(); pushState(); };
    d.querySelector('.x').onclick=e=>{ e.stopPropagation(); delSlide(sl.id); };
    d.oncontextmenu=e=>{ e.preventDefault(); selId=sl.id; renderAll(); slideMenu(e.clientX,e.clientY); };
    d.addEventListener('dragstart',e=>{ e.dataTransfer.setData('t',i); d.style.opacity=.4; });
    d.addEventListener('dragend',()=>d.style.opacity=1);
    d.addEventListener('dragover',e=>e.preventDefault());
    d.addEventListener('drop',e=>{ e.preventDefault(); const f=+e.dataTransfer.getData('t'); if(f===i)return;
      const [m]=PROJECT.splice(f,1); PROJECT.splice(i,0,m); renderAll(); pushState(); toast('순서 변경'); });
    s.appendChild(d);
  });
  const a=document.createElement('button'); a.className='addbtn'; a.textContent='＋ 이미지/PDF 가져오기';
  a.onclick=()=>$('fileImg').click(); s.appendChild(a);
}
function renderStage(){
  const sl=curSlide(); if(sl) $('stageImg').src=sl.img;
  const sel=$('trSel'); if(sel){ sel.innerHTML='';
    for(const k in TRANSITIONS){ const o=document.createElement('option'); o.value=k; o.textContent=TRANSITIONS[k];
      if(sl&&sl.transition===k)o.selected=true; sel.appendChild(o); } }
  $('stSlide').textContent=sl?((PROJECT.findIndex(x=>x.id===sl.id)+1)+' / '+PROJECT.length):'-';
  $('stTr').textContent=sl?(TRANSITIONS[sl.transition]||'디졸브'):'-';
  $('stRoom').textContent=ROOM;
}
function renderWho(){
  const now=performance.now();
  const live=[{id:uid,name:myName||'나',color:myColor}].concat([...peers.values()].filter(p=>now-p.last<6000));
  $('who').innerHTML=`<span class="cnt">${live.length}명</span>`+live.slice(0,6).map(p=>`<div class="av" style="background:${p.color}" title="${esc(p.name)}">${esc((p.name||'?')[0]||'?')}</div>`).join('');
  $('userList').innerHTML=live.map(p=>`<div class="row"><span class="dot" style="background:${p.color}"></span>${esc(p.name||'이름없음')}${p.id===uid?' (나)':''}</div>`).join('');
}
function renderCursors(){
  const L=$('cursors'), now=performance.now();
  L.innerHTML=[...peers.values()].filter(p=>now-p.last<6000&&p.cx!=null).map(p=>{
    const x=p.cx*L.clientWidth, y=p.cy*L.clientHeight;
    return `<div class="cur" style="left:${x}px;top:${y}px;"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M1 1 L1 12 L4 9 L6 14 L8 13 L6 8 L10 8 Z" fill="${p.color}" stroke="#0a0f1a" stroke-width="1"/></svg><span class="tag" style="background:${p.color}">${esc(p.name||'?')}</span></div>`;
  }).join('');
}
function renderAll(){ renderSorter(); renderStage(); renderWho(); renderOverlays(); renderBoard(); }
function pushState(){ Sync.send({t:'state',from:uid,project:PROJECT,selId}); saveProject(); }

/* ── 슬라이드 조작 ── */
function delSlide(id){
  if(PROJECT.length<=1){ toast('마지막 슬라이드는 삭제할 수 없습니다'); return; }
  const i=PROJECT.findIndex(x=>x.id===id); if(i<0)return;
  PROJECT.splice(i,1);
  if(selId===id) selId=(PROJECT[Math.min(i,PROJECT.length-1)]||PROJECT[0]).id;
  selOvs=[]; renderAll(); pushState(); toast('슬라이드 삭제');
}
function dupSlide(){
  const i=PROJECT.findIndex(x=>x.id===selId); const s=PROJECT[i]; if(!s)return;
  const c=JSON.parse(JSON.stringify(s)); c.id='s'+Date.now()+Math.floor(Math.random()*999);
  PROJECT.splice(i+1,0,c); selId=c.id; renderAll(); pushState(); toast('슬라이드 복제');
}
function moveSlide(d){
  const i=PROJECT.findIndex(x=>x.id===selId), j=i+d;
  if(i<0||j<0||j>=PROJECT.length)return;
  const [m]=PROJECT.splice(i,1); PROJECT.splice(j,0,m); renderAll(); pushState();
}
function addSlide(img,name,spec){
  const id='s'+Date.now()+Math.floor(Math.random()*9999);
  PROJECT.push({id,name:name||'슬라이드',img,transition:'fade',overlays:[],spec:spec||null});
  return id;
}

/* ── 가져오기: 이미지 / PDF ── */
async function importImages(files){
  const list=[...files].filter(f=>f.type.startsWith('image/')); if(!list.length)return;
  busy(true,`이미지 ${list.length}장 불러오는 중…`); let last=null;
  for(const f of list){
    const d=await new Promise(r=>{ const rd=new FileReader(); rd.onload=()=>r(rd.result); rd.readAsDataURL(f); });
    last=addSlide(await putImage(d), f.name.replace(/\.[^.]+$/,''));
  }
  busy(false); if(last){ selId=last; renderAll(); pushState(); toast(`슬라이드 ${list.length}장 추가`); }
}
async function importPDF(file){
  if(!window.pdfjsLib){ toast('PDF 기능 로드 실패 — 인터넷 확인'); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.min.js';
  try{
    busy(true,'PDF 읽는 중…');
    const buf=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:buf}).promise;
    let last=null;
    for(let p=1;p<=pdf.numPages;p++){
      busy(true,`PDF ${p} / ${pdf.numPages} 장 변환 중…`);
      const page=await pdf.getPage(p);
      const vp0=page.getViewport({scale:1});
      const scale=1280/vp0.width;                 // 가로 1280 기준
      const vp=page.getViewport({scale});
      const c=document.createElement('canvas'); c.width=Math.round(vp.width); c.height=Math.round(vp.height);
      await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
      last=addSlide(await putImage(c.toDataURL('image/png')), `${file.name.replace(/\.pdf$/i,'')} ${p}`);
    }
    busy(false);
    if(last){ selId=last; renderAll(); pushState(); toast(`PDF ${pdf.numPages}장 → 슬라이드 추가`); }
  }catch(e){ busy(false); toast('PDF 오류: '+(e&&e.message||e)); }
}
/* PPTX 직접 가져오기.
   ⚠ 원리: PPT는 '그림'이 아니라 도형·글자·효과가 든 설계도라, 브라우저에서 파워포인트처럼
   똑같이 그려내는 건 불가능하다. 다만 '슬라이드 전체를 덮는 이미지 한 장'으로 된 장(예: 이 사이트에서
   내보낸 PPT, 이미지형 CG)은 그 이미지를 그대로 꺼내 완벽히 복원할 수 있다.
   도형·글자로 그려진 장은 복원 불가 → 그 장 수를 세어 PDF로 저장하도록 안내한다. */
async function importPPTX(file){
  if(!window.JSZip){ toast('압축 라이브러리 로드 실패 — 인터넷 확인'); return; }
  try{
    busy(true,'PPT 읽는 중…');
    const zip=await JSZip.loadAsync(await file.arrayBuffer());
    const pres=await zip.file('ppt/presentation.xml').async('string');
    const sz=/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(pres);
    const SW=sz?+sz[1]:12192000, SH=sz?+sz[2]:6858000, AREA=SW*SH;
    // 슬라이드 순서
    const prels=await zip.file('ppt/_rels/presentation.xml.rels').async('string');
    const relMap={}; for(const m of prels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]]=m[2];
    const order=[...pres.matchAll(/<p:sldId[^>]*r:id="(rId\d+)"/g)]
      .map(m=>relMap[m[1]]).filter(Boolean)
      .map(t=>('ppt/'+t.replace(/^\.\.\//,'')).replace('ppt/ppt/','ppt/'));
    const mime=n=>/\.png$/i.test(n)?'image/png':/\.jpe?g$/i.test(n)?'image/jpeg':/\.gif$/i.test(n)?'image/gif':'image/png';
    let ok=0, bad=0, last=null;
    for(let i=0;i<order.length;i++){
      busy(true,`PPT ${i+1} / ${order.length} 장 확인 중…`);
      const sPath=order[i]; const sf=zip.file(sPath); if(!sf){ bad++; continue; }
      const xml=await sf.async('string');
      const rPath=sPath.replace(/slides\//,'slides/_rels/')+'.rels';
      const rf=zip.file(rPath); const rmap={};
      if(rf){ const rx=await rf.async('string');
        for(const m of rx.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) rmap[m[1]]=m[2]; }
      // 슬라이드를 덮는 가장 큰 그림 찾기
      let best=null;
      for(const pm of xml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)){
        const blk=pm[0];
        const emb=/r:embed="(rId\d+)"/.exec(blk); if(!emb)continue;
        const ext=/<a:ext cx="(\d+)" cy="(\d+)"/.exec(blk); if(!ext)continue;
        const cover=(+ext[1]*+ext[2])/AREA;
        if(!best||cover>best.cover) best={rid:emb[1],cover};
      }
      // ★ 그림 위에 도형·글자가 얹혀 있으면 그림만 가져가면 내용이 사라진다 → 불가 처리
      const shapeCnt=(xml.match(/<p:sp>/g)||[]).length;
      const textCnt=[...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].filter(m=>m[1].trim()).length;
      const picCnt=(xml.match(/<p:pic>/g)||[]).length;
      const vectorContent = shapeCnt>0 || textCnt>0 || picCnt>1;
      if(vectorContent){ bad++; continue; }
      if(best&&best.cover>=0.9&&rmap[best.rid]){
        const mp=('ppt/'+rmap[best.rid].replace(/^\.\.\//,'')).replace('ppt/ppt/','ppt/');
        const mf=zip.file(mp);
        if(mf){
          const b64=await mf.async('base64');
          last=addSlide(await putImage(`data:${mime(mp)};base64,${b64}`), `${file.name.replace(/\.pptx$/i,'')} ${i+1}`);
          ok++; continue;
        }
      }
      bad++;
    }
    busy(false);
    if(ok){ selId=last; renderAll(); pushState(); }
    if(ok&&!bad) toast(`PPT ${ok}장 → 슬라이드 추가`);
    else if(ok&&bad) toast(`${ok}장 불러옴 · ${bad}장은 도형/글자라 못 읽음 → 그 장들은 PDF로 저장해 넣어주세요`);
    else toast('이 PPT는 도형·글자로 그려져 있어 직접 못 읽습니다 — PowerPoint에서 PDF로 저장해 넣어주세요');
  }catch(e){ busy(false); toast('PPT 오류: '+(e&&e.message||e)); }
}
$('impImg').onclick=()=>$('fileImg').click();
$('impPdf').onclick=()=>$('filePdf').click();
$('impPpt').onclick=()=>$('filePpt').click();
$('filePpt').onchange=e=>{ const f=e.target.files[0]; if(f)importPPTX(f); e.target.value=''; };
$('fileImg').onchange=e=>{ importImages(e.target.files); e.target.value=''; };
$('filePdf').onchange=e=>{ const f=e.target.files[0]; if(f)importPDF(f); e.target.value=''; };
// 무대에 끌어다 놓기
const sw=$('stageWrap');
sw.addEventListener('dragover',e=>{ e.preventDefault(); });
sw.addEventListener('drop',e=>{ e.preventDefault(); const fs=[...(e.dataTransfer.files||[])];
  const pdf=fs.find(f=>f.type==='application/pdf'); if(pdf){ importPDF(pdf); return; }
  const ppt=fs.find(f=>/\.pptx$/i.test(f.name)); if(ppt){ importPPTX(ppt); return; }
  if(fs.length) importImages(fs); });

/* ── 텍스트 오버레이 ── */
const NEWOV=()=>({ id:'o'+Date.now()+Math.floor(Math.random()*999), text:'텍스트', xf:.34, yf:.42,
  fs:40, color:'#111111', fw:'700', align:'left', stroke:false, shadow:false });
function ovsOf(){ const s=curSlide(); if(!s)return []; s.overlays=s.overlays||[]; return s.overlays; }
function selOvObjs(){ return ovsOf().filter(o=>selOvs.includes(o.id)); }
function renderOverlays(){
  const stage=$('stage'); [...stage.querySelectorAll('.ov')].forEach(n=>n.remove());
  const H=stage.clientHeight||720;
  ovsOf().forEach(ov=>{
    const d=document.createElement('div'); d.className='ov'+(selOvs.includes(ov.id)?' sel':''); d.dataset.id=ov.id;
    d.style.left=(ov.xf*100)+'%'; d.style.top=(ov.yf*100)+'%';
    d.style.fontSize=(ov.fs*H/720)+'px'; d.style.color=ov.color;
    d.style.fontFamily='"Gmarket Sans","Malgun Gothic",sans-serif'; d.style.fontWeight=ov.fw||'700';
    d.style.textAlign=ov.align||'left';
    if(ov.stroke){ d.style.webkitTextStroke=Math.max(1,(ov.fs*H/720)*0.09)+'px #fff'; d.style.paintOrder='stroke fill'; }
    if(ov.shadow) d.style.textShadow='2px 2px 5px rgba(60,80,120,.55)';
    d.textContent=ov.text;
    if(ov.id===editingOv){ d.contentEditable='true'; d.style.userSelect='text'; }
    stage.appendChild(d); wireOv(d,ov);
    if(selOvs.length===1&&selOvs[0]===ov.id&&ov.id!==editingOv){
      const rz=document.createElement('div'); rz.className='rz'; d.appendChild(rz);
      rz.addEventListener('mousedown',ev=>{ ev.preventDefault(); ev.stopPropagation();
        const sy=ev.clientY, sf=ov.fs;
        const mv=e2=>{ ov.fs=Math.max(10,Math.min(140,Math.round(sf+(e2.clientY-sy)*0.55))); renderOverlays(); syncTextUI(); };
        const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); pushState(); };
        document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up); });
    }
  });
  $('stSel').textContent=selOvs.length?`텍스트 ${selOvs.length}개 선택`:'';
  syncTextUI();
}
function syncTextUI(){
  const o=selOvObjs()[0]; if(!o)return;
  $('ovFs').value=Math.round(o.fs); $('ovFont').value=o.fw||'700';
  $('ovStroke').classList.toggle('on',!!o.stroke); $('ovShadow').classList.toggle('on',!!o.shadow);
  const a=$('ovAnimSel'); if(a) a.value=o.anim||'';
}
function showGuides(lines){ $('guides').innerHTML=lines.map(l=>l.v
  ? `<div style="left:${l.p}%;top:0;width:1px;height:100%"></div>`
  : `<div style="top:${l.p}%;left:0;height:1px;width:100%"></div>`).join(''); }
function wireOv(d,ov){
  d.onclick=e=>{ e.stopPropagation(); if(editingOv===ov.id)return;
    if(e.shiftKey){ selOvs.includes(ov.id)?selOvs=selOvs.filter(x=>x!==ov.id):selOvs.push(ov.id); }
    else selOvs=[ov.id];
    renderOverlays(); };
  d.ondblclick=e=>{ e.stopPropagation(); selOvs=[ov.id]; editingOv=ov.id; renderOverlays();
    const el=document.querySelector('.ov[data-id="'+ov.id+'"]'); if(el){ el.focus(); document.getSelection().selectAllChildren(el); } };
  d.onblur=()=>{ if(editingOv===ov.id){ ov.text=d.textContent; editingOv=null; renderOverlays(); pushState(); } };
  d.oncontextmenu=e=>{ e.preventDefault(); e.stopPropagation(); if(!selOvs.includes(ov.id))selOvs=[ov.id];
    renderOverlays(); ovMenu(e.clientX,e.clientY); };
  d.addEventListener('mousedown',e=>{
    if(editingOv===ov.id)return; e.preventDefault(); e.stopPropagation();
    if(!selOvs.includes(ov.id)) selOvs=[ov.id];
    renderOverlays();
    const R=$('stage').getBoundingClientRect();
    const targets=selOvObjs().map(o=>({o,x0:o.xf,y0:o.yf}));
    const px=e.clientX, py=e.clientY;
    const mv=ev=>{
      let dx=(ev.clientX-px)/R.width, dy=(ev.clientY-py)/R.height;
      const g=[];
      if(snapOn&&targets.length===1){
        const t=targets[0], el=document.querySelector('.ov[data-id="'+t.o.id+'"]');
        const w=el?el.offsetWidth/R.width:0, h=el?el.offsetHeight/R.height:0;
        const cx=t.x0+dx+w/2, cy=t.y0+dy+h/2, TH=0.012;
        if(Math.abs(cx-0.5)<TH){ dx=0.5-w/2-t.x0; g.push({v:1,p:50}); }
        if(Math.abs(cy-0.5)<TH){ dy=0.5-h/2-t.y0; g.push({v:0,p:50}); }
        ovsOf().forEach(other=>{ if(other.id===t.o.id)return;
          if(Math.abs((t.x0+dx)-other.xf)<TH){ dx=other.xf-t.x0; g.push({v:1,p:other.xf*100}); }
          if(Math.abs((t.y0+dy)-other.yf)<TH){ dy=other.yf-t.y0; g.push({v:0,p:other.yf*100}); } });
      }
      targets.forEach(t=>{ t.o.xf=Math.max(-.05,Math.min(1.02,t.x0+dx)); t.o.yf=Math.max(-.05,Math.min(1.02,t.y0+dy)); });
      showGuides(g);
      targets.forEach(t=>{ const el=document.querySelector('.ov[data-id="'+t.o.id+'"]');
        if(el){ el.style.left=(t.o.xf*100)+'%'; el.style.top=(t.o.yf*100)+'%'; } });
    };
    const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up);
      showGuides([]); pushState(); };
    document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
  });
}
$('stage').addEventListener('mousedown',e=>{ if(e.target.id==='stage'||e.target.id==='stageImg'){ selOvs=[]; editingOv=null; renderOverlays(); } });
$('stage').addEventListener('contextmenu',e=>{ if(e.target.id==='stage'||e.target.id==='stageImg'){ e.preventDefault(); slideMenu(e.clientX,e.clientY); } });
$('addText').onclick=()=>{ const o=NEWOV(); ovsOf().push(o); selOvs=[o.id]; renderOverlays(); pushState(); toast('텍스트 추가 — 더블클릭해 수정'); };

/* 텍스트 리본 동작 */
function applyOv(fn){ const list=selOvObjs(); if(!list.length){ toast('먼저 텍스트를 선택하세요'); return; } list.forEach(fn); renderOverlays(); pushState(); }
document.querySelectorAll('[data-a="fs+"]').forEach(b=>b.onclick=()=>applyOv(o=>o.fs=Math.min(140,o.fs+2)));
document.querySelectorAll('[data-a="fs-"]').forEach(b=>b.onclick=()=>applyOv(o=>o.fs=Math.max(10,o.fs-2)));
$('ovFs').onchange=e=>{ const v=Math.max(10,Math.min(140,+e.target.value||34)); applyOv(o=>o.fs=v); };
$('ovFont').onchange=e=>applyOv(o=>o.fw=e.target.value);
document.querySelectorAll('.sw').forEach(s=>s.onclick=()=>applyOv(o=>o.color=s.dataset.c));
document.querySelectorAll('[data-al]').forEach(b=>b.onclick=()=>applyOv(o=>o.align=b.dataset.al));
$('ovStroke').onclick=()=>applyOv(o=>o.stroke=!o.stroke);
$('ovShadow').onclick=()=>applyOv(o=>o.shadow=!o.shadow);
$('ovDel').onclick=()=>{ const s=curSlide(); s.overlays=ovsOf().filter(o=>!selOvs.includes(o.id)); selOvs=[]; renderOverlays(); pushState(); };
$('ovDup').onclick=()=>{ const add=selOvObjs().map(o=>({...o,id:'o'+Date.now()+Math.floor(Math.random()*999),xf:o.xf+.02,yf:o.yf+.03}));
  ovsOf().push(...add); selOvs=add.map(o=>o.id); renderOverlays(); pushState(); };
$('ovCenterX').onclick=()=>{ const R=$('stage').getBoundingClientRect();
  applyOv(o=>{ const el=document.querySelector('.ov[data-id="'+o.id+'"]'); const w=el?el.offsetWidth/R.width:0; o.xf=0.5-w/2; }); };

/* ── 컨텍스트 메뉴 ── */
function openCtx(x,y,items){
  const c=$('ctx'); c.innerHTML=items.map(it=>it==='-'?'<div class="sep"></div>'
    :`<button class="${it.dg?'dg':''}">${esc(it.label)}</button>`).join('');
  const btns=[...c.querySelectorAll('button')]; let k=0;
  items.forEach(it=>{ if(it!=='-'){ btns[k++].onclick=()=>{ c.style.display='none'; it.fn(); }; } });
  c.style.display='block';
  const r=c.getBoundingClientRect();
  c.style.left=Math.min(x,innerWidth-r.width-8)+'px';
  c.style.top=Math.min(y,innerHeight-r.height-8)+'px';
}
document.addEventListener('mousedown',e=>{ if(!$('ctx').contains(e.target)) $('ctx').style.display='none'; });
window.addEventListener('blur',()=>$('ctx').style.display='none');
function slideMenu(x,y){ openCtx(x,y,[
  {label:'＋ 텍스트 추가',fn:()=>$('addText').click()},
  {label:'⧉ 슬라이드 복제',fn:dupSlide}, '-',
  {label:'↑ 앞으로 이동',fn:()=>moveSlide(-1)},
  {label:'↓ 뒤로 이동',fn:()=>moveSlide(1)}, '-',
  {label:'▶ 이 장부터 송출',fn:()=>presOpen(PROJECT.findIndex(s=>s.id===selId))},
  {label:'🗑 슬라이드 삭제',dg:1,fn:()=>delSlide(selId)} ]); }
function ovMenu(x,y){ openCtx(x,y,[
  {label:'✏ 글자 수정 (더블클릭)',fn:()=>{ editingOv=selOvs[0]; renderOverlays();
    const el=document.querySelector('.ov[data-id="'+selOvs[0]+'"]'); if(el){el.focus();document.getSelection().selectAllChildren(el);} }},
  {label:'⧉ 복제',fn:()=>$('ovDup').click()},
  {label:'↔ 화면 가운데로',fn:()=>$('ovCenterX').click()}, '-',
  {label:'흰 외곽선 켜기/끄기',fn:()=>$('ovStroke').click()},
  {label:'그림자 켜기/끄기',fn:()=>$('ovShadow').click()}, '-',
  {label:'🗑 삭제',dg:1,fn:()=>$('ovDel').click()} ]); }

/* ── 리본 탭 ── */
document.querySelectorAll('.rtab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.rtab').forEach(x=>x.classList.toggle('on',x===t));
  document.querySelectorAll('.rpage').forEach(p=>p.classList.toggle('on',p.dataset.page===t.dataset.tab));
});
$('rToggle').onclick=()=>{ const b=$('rbody'); const h=b.classList.toggle('hide');
  $('rToggle').textContent=h?'리본 펴기 ▼':'리본 접기 ▲'; renderOverlays(); };

/* ── 보기 ── */
$('safeBtn').onclick=()=>{ const s=$('safe'); const on=s.style.display!=='block'; s.style.display=on?'block':'none'; $('safeBtn').classList.toggle('on',on); };
$('snapBtn').onclick=()=>{ snapOn=!snapOn; $('snapBtn').classList.toggle('on',snapOn); toast('정렬 스냅 '+(snapOn?'켬':'끔')); };
$('toggleSide').onclick=()=>{ const s=$('side'); const hid=s.style.display==='none';
  s.style.display=hid?'flex':'none'; $('splitR').style.display=hid?'block':'none'; renderOverlays(); };
$('resetPanels').onclick=()=>{ ['.sorter','.side'].forEach(sel=>{ const t=document.querySelector(sel); t.style.flex=''; t.style.width=''; });
  localStorage.removeItem('cg_w_sorter'); localStorage.removeItem('cg_w_side'); renderOverlays(); toast('폭 초기화'); };
function wireSplit(id,sel,min,max,key,inv){
  const el=$(id), t=document.querySelector(sel); if(!el||!t)return;
  const sv=parseInt(localStorage.getItem(key)||'',10);
  if(sv>=min&&sv<=max){ t.style.flex='0 0 '+sv+'px'; t.style.width=sv+'px'; }
  el.addEventListener('mousedown',e=>{ e.preventDefault(); el.classList.add('drag');
    const sx=e.clientX, sw=t.getBoundingClientRect().width;
    const mv=ev=>{ let w=sw+(inv?(sx-ev.clientX):(ev.clientX-sx)); w=Math.max(min,Math.min(max,w));
      t.style.flex='0 0 '+w+'px'; t.style.width=w+'px'; };
    const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up);
      el.classList.remove('drag'); localStorage.setItem(key,String(Math.round(t.getBoundingClientRect().width)));
      renderCursors(); renderOverlays(); };
    document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up); });
  el.addEventListener('dblclick',()=>{ t.style.flex=''; t.style.width=''; localStorage.removeItem(key); renderOverlays(); });
}

/* ── 슬라이드/모션 버튼 ── */
$('dupSlideBtn').onclick=dupSlide;
$('delSlideBtn').onclick=()=>delSlide(selId);
$('upSlideBtn').onclick=()=>moveSlide(-1);
$('dnSlideBtn').onclick=()=>moveSlide(1);
$('trSel').onchange=e=>{ const s=curSlide(); if(s){ s.transition=e.target.value; renderStage(); pushState(); toast('모션: '+TRANSITIONS[s.transition]); } };
$('applyAllTr').onclick=()=>{ const v=$('trSel').value; PROJECT.forEach(s=>s.transition=v); pushState(); toast('전체 모션: '+TRANSITIONS[v]); };
$('prevTr').onclick=()=>{ const s=curSlide(); const a=ANIM[s&&s.transition]||'tFade'; const im=$('stageImg');
  im.style.animation='none'; void im.offsetWidth; if(a) im.style.animation=a+' .6s ease'; };
$('prevBuild').onclick=async()=>{ const s=curSlide();
  if(!s||!s.spec){ toast('이 슬라이드는 이미지라 요소 모션이 없습니다 (킷 CG에서만 가능)'); return; }
  if(!window.playKitMotion){ toast('모션 기능 로드 실패'); return; }
  const im=$('stageImg'); const stop=await window.playKitMotion(im,s.spec);
  setTimeout(()=>{ if(stop)stop(); im.src=s.img; }, 4000); };
$('ovAnimSel').onchange=e=>{ const v=e.target.value; applyOv(o=>o.anim=v||undefined);
  toast(v?('글자 등장 효과: '+e.target.selectedOptions[0].textContent):'글자 등장 효과 없음'); };

/* ── 이름 / 초대 / 커서 ── */
const nameIn=$('nameIn'); nameIn.value=myName;
nameIn.oninput=()=>{ myName=nameIn.value; localStorage.setItem('cg_name',myName); renderWho(); presence(); };
$('shareBtn').onclick=()=>{ const u=new URL(location.href); u.searchParams.set('room',ROOM);
  navigator.clipboard&&navigator.clipboard.writeText(u.toString());
  toast(CLOUD?'초대링크 복사 — 팀원에게 보내세요':'로컬 모드: 같은 브라우저 새 탭에서 열면 테스트 가능'); };
let lastCur=0;
sw.addEventListener('mousemove',e=>{ const now=performance.now(); if(now-lastCur<45)return; lastCur=now;
  const r=$('cursors').getBoundingClientRect(); const cx=(e.clientX-r.left)/r.width, cy=(e.clientY-r.top)/r.height;
  if(cx<0||cx>1||cy<0||cy>1)return; Sync.send({t:'cursor',id:uid,name:myName||'익명',color:myColor,cx,cy}); });
function presence(hello){ Sync.send({t:'presence',id:uid,name:myName||'익명',color:myColor,hello:!!hello}); }

/* ── 송출 ── */
let presIdx=0, clkT=null, animStop=null, autoT=null, locked=false, shiftCnt=0, jumpBuf='';
function presOpen(idx){
  presIdx=idx!=null?idx:Math.max(0,PROJECT.findIndex(x=>x.id===selId)); if(presIdx<0)presIdx=0;
  $('present').style.display='flex'; showPres(true); if(!clkT)clkT=setInterval(updClk,1000); updClk();
}
function presClose(){
  if(locked){ toast('잠금 중입니다 — Shift 3번으로 해제'); return; }
  $('present').style.display='none'; $('wait').style.display='none';
  if(clkT){clearInterval(clkT);clkT=null;} if(animStop){animStop();animStop=null;} stopAuto();
}
function updClk(){ $('presClk').textContent=new Date().toLocaleTimeString('ko-KR',{hour12:false}); }
function showPres(animate){
  const sl=PROJECT[presIdx]; if(!sl)return;
  const im=$('presImg'), a=ANIM[sl.transition]||'tFade';
  if(animStop){ animStop(); animStop=null; }
  im.style.animation='none'; im.src=sl.img;
  if(animate!==false&&a){ void im.offsetWidth; im.style.animation=a+' .5s ease'; }
  $('presPg').textContent=`${presIdx+1} / ${PROJECT.length}`;
  $('presTr').textContent='모션: '+(TRANSITIONS[sl.transition]||'디졸브');
  const p=PROJECT[presIdx-1], n=PROJECT[presIdx+1];
  $('pPrev').src=p?p.img:''; $('pPrev').parentElement.style.visibility=p?'visible':'hidden';
  $('pNext').src=n?n.img:''; $('pNext').parentElement.style.visibility=n?'visible':'hidden';
  // 킷 CG(스펙 있음)면 요소 모션 재생: 막대 자라기 / 선 그리기 / 열차 이동
  if(sl.spec&&window.playKitMotion&&$('buildSel').value!=='off'){
    window.playKitMotion(im,sl.spec).then(fn=>{ animStop=fn; });
  }
  renderPresOverlays(sl);
}
// 송출 화면에 얹은 글자 표시 + 등장 효과 재생
const OVANIM={pop:'oPop .6s ease both',fade:'oFade .8s ease both',up:'oUp .6s ease both',blink:'oBlink 1.2s ease 2'};
function renderPresOverlays(sl){
  const box=$('presOv'); if(!box)return; box.innerHTML='';
  const H=box.clientHeight||720;
  (sl.overlays||[]).forEach((ov,i)=>{
    const d=document.createElement('div'); d.className='po';
    d.style.left=(ov.xf*100)+'%'; d.style.top=(ov.yf*100)+'%';
    d.style.fontSize=(ov.fs*H/720)+'px'; d.style.color=ov.color;
    d.style.fontFamily='"Gmarket Sans","Malgun Gothic",sans-serif'; d.style.fontWeight=ov.fw||'700';
    d.style.textAlign=ov.align||'left';
    if(ov.stroke){ d.style.webkitTextStroke=Math.max(1,(ov.fs*H/720)*0.09)+'px #fff'; d.style.paintOrder='stroke fill'; }
    if(ov.shadow) d.style.textShadow='2px 2px 5px rgba(60,80,120,.55)';
    d.textContent=ov.text;
    if(ov.anim&&OVANIM[ov.anim]){ d.style.animation=OVANIM[ov.anim]; d.style.animationDelay=(0.25+i*0.25)+'s'; }
    box.appendChild(d);
  });
}
function presGo(d){ const t=Math.max(0,Math.min(PROJECT.length-1,presIdx+d)); if(t!==presIdx){ presIdx=t; showPres(true); } }
$('presentBtn').onclick=()=>presOpen(0);
$('startFromFirst').onclick=()=>presOpen(0);
$('startFromHere').onclick=()=>presOpen();
$('presExit').onclick=presClose;
$('pPrevCell').onclick=()=>presGo(-1);
$('pNextCell').onclick=()=>presGo(1);
const toggleWait=()=>{ const w=$('wait'); w.style.display=w.style.display==='flex'?'none':'flex'; };
$('waitBtn').onclick=()=>{ if($('present').style.display!=='flex')presOpen(); toggleWait(); };
$('presWait').onclick=toggleWait;
$('wait').onclick=()=>$('wait').style.display='none';
const toggleClean=()=>{ const on=$('present').classList.toggle('clean');
  $('presClean').textContent=on?'미리보기 보이기':'미리보기 숨김'; };
$('presClean').onclick=toggleClean; $('cleanBtn').onclick=()=>{ if($('present').style.display!=='flex')presOpen(); toggleClean(); };
function stopAuto(){ if(autoT){ clearInterval(autoT); autoT=null; $('autoBtn').classList.remove('on'); } }
$('autoBtn').onclick=()=>{
  if(autoT){ stopAuto(); toast('자동진행 끔'); return; }
  const sec=Math.max(2,Math.min(120,+$('autoSec').value||8));
  if($('present').style.display!=='flex')presOpen();
  autoT=setInterval(()=>{ if(presIdx>=PROJECT.length-1){ presIdx=0; showPres(true); } else presGo(1); }, sec*1000);
  $('autoBtn').classList.add('on'); toast(`자동진행 ${sec}초`);
};
$('lockBtn').onclick=()=>{ locked=!locked; $('lockBtn').classList.toggle('on',locked);
  $('lockNote').style.display=locked?'block':'none'; toast(locked?'잠금 — 실수로 넘어가지 않습니다':'잠금 해제'); };

/* ── 단축키 ── */
const typing=()=>{ const a=document.activeElement; return a&&(a.tagName==='TEXTAREA'||a.tagName==='INPUT'||a.isContentEditable); };
function selShift(d){ const i=PROJECT.findIndex(x=>x.id===selId); const t=Math.max(0,Math.min(PROJECT.length-1,i+d));
  selId=PROJECT[t].id; selOvs=[]; renderAll(); }
document.addEventListener('keydown',e=>{
  const presenting=$('present').style.display==='flex';
  if(presenting){
    if(e.key==='Shift'){ if(++shiftCnt>=3&&locked){ locked=false; $('lockBtn').classList.remove('on'); $('lockNote').style.display='none'; toast('잠금 해제'); } setTimeout(()=>shiftCnt=0,1200); }
    if(locked){ if(e.key!=='Shift')e.preventDefault(); return; }
    if($('wait').style.display==='flex'){ $('wait').style.display='none'; e.preventDefault(); return; }
    if(e.key>='0'&&e.key<='9'){ jumpBuf+=e.key; toast('이동: '+jumpBuf+' 장'); return; }
    if(e.key==='Enter'&&jumpBuf){ const n=parseInt(jumpBuf,10); jumpBuf='';
      if(n>=1&&n<=PROJECT.length){ presIdx=n-1; showPres(true); } return; }
    if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){ e.preventDefault(); presGo(1); }
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){ e.preventDefault(); presGo(-1); }
    else if(e.key==='Home'){ presIdx=0; showPres(true); }
    else if(e.key==='End'){ presIdx=PROJECT.length-1; showPres(true); }
    else if(e.key==='w'||e.key==='W'){ toggleWait(); }
    else if(e.key==='Escape'){ presClose(); }
    return;
  }
  if(e.key==='F5'){ e.preventDefault(); presOpen(e.shiftKey?undefined:0); return; }
  if(typing())return;
  const mod=e.ctrlKey||e.metaKey;
  if(mod&&(e.key==='d'||e.key==='D')){ e.preventDefault(); dupSlide(); }
  else if(mod&&(e.key==='m'||e.key==='M')){ e.preventDefault(); $('addText').click(); }
  else if(e.key==='ArrowRight'||e.key==='PageDown'){ if(selOvs.length){ e.preventDefault(); applyOv(o=>o.xf+=e.shiftKey?.02:.004); } else { e.preventDefault(); selShift(1); } }
  else if(e.key==='ArrowLeft'||e.key==='PageUp'){ if(selOvs.length){ e.preventDefault(); applyOv(o=>o.xf-=e.shiftKey?.02:.004); } else { e.preventDefault(); selShift(-1); } }
  else if(e.key==='ArrowDown'){ if(selOvs.length){ e.preventDefault(); applyOv(o=>o.yf+=e.shiftKey?.02:.006); } }
  else if(e.key==='ArrowUp'){ if(selOvs.length){ e.preventDefault(); applyOv(o=>o.yf-=e.shiftKey?.02:.006); } }
  else if(e.key==='Delete'||e.key==='Backspace'){ e.preventDefault(); if(selOvs.length)$('ovDel').click(); else delSlide(selId); }
  else if(e.key==='Escape'){ selOvs=[]; editingOv=null; renderOverlays(); $('ctx').style.display='none'; }
});
$('keysBtn').onclick=()=>$('keys').style.display='flex';
$('keysClose').onclick=()=>$('keys').style.display='none';
$('keys').onclick=e=>{ if(e.target.id==='keys')e.target.style.display='none'; };

/* ── 내보내기 ── */
const loadImg=src=>new Promise((res,rej)=>{ const im=new Image(); im.crossOrigin='anonymous'; im.onload=()=>res(im); im.onerror=rej; im.src=src; });
// 방송 규격 1920×1080으로 합성 (글자도 같은 배율로 커져 화질 손실 없음)
const OUT_W=1920, OUT_H=1080, OUT_K=OUT_H/720;
async function compositeSlide(sl){
  const c=document.createElement('canvas'); c.width=OUT_W; c.height=OUT_H; const g=c.getContext('2d');
  g.fillStyle='#000'; g.fillRect(0,0,OUT_W,OUT_H);
  try{ g.drawImage(await loadImg(sl.img),0,0,OUT_W,OUT_H); }catch(_){}
  (sl.overlays||[]).forEach(ov=>{
    const fs=ov.fs*OUT_K; g.font=`${ov.fw||700} ${fs}px "Gmarket Sans","Malgun Gothic",sans-serif`;
    g.textAlign=ov.align==='center'?'center':ov.align==='right'?'right':'left';
    g.textBaseline='top';
    const x=ov.xf*OUT_W, y=ov.yf*OUT_H;
    String(ov.text).split('\n').forEach((ln,i)=>{
      const yy=y+i*fs*1.15;
      if(ov.shadow){ g.save(); g.shadowColor='rgba(60,80,120,.55)'; g.shadowBlur=6; g.shadowOffsetX=2; g.shadowOffsetY=2; }
      if(ov.stroke){ g.lineJoin='round'; g.lineWidth=Math.max(2,fs*0.18); g.strokeStyle='#fff'; g.strokeText(ln,x,yy); }
      g.fillStyle=ov.color; g.fillText(ln,x,yy);
      if(ov.shadow) g.restore();
    });
  });
  return c.toDataURL('image/png');
}
const dl=(u,n)=>{ const a=document.createElement('a'); a.href=u; a.download=n; document.body.appendChild(a); a.click(); a.remove(); };
$('expImg').onclick=async()=>{ busy(true,'이미지 만드는 중…');
  try{
    if(window.JSZip){ const zip=new JSZip();
      for(let i=0;i<PROJECT.length;i++){ busy(true,`이미지 ${i+1}/${PROJECT.length}`);
        zip.file(`CG_${String(i+1).padStart(2,'0')}.png`,(await compositeSlide(PROJECT[i])).split(',')[1],{base64:true}); }
      const b=await zip.generateAsync({type:'blob'}); const u=URL.createObjectURL(b);
      dl(u,'CG_덱_이미지.zip'); setTimeout(()=>URL.revokeObjectURL(u),1500);
      toast(`이미지 ${PROJECT.length}장 내보냄`);
    } else { dl(await compositeSlide(curSlide()),'CG.png'); }
  }catch(e){ toast('내보내기 오류: '+e.message); } busy(false); };
$('expPpt').onclick=async()=>{ const P=window.PptxGenJS||window.pptxgen;
  if(!P){ toast('PPT 라이브러리 로드 실패'); return; }
  busy(true,'PPT 만드는 중…');
  try{ const p=new P(); p.defineLayout({name:'W',width:13.333,height:7.5}); p.layout='W';
    for(let i=0;i<PROJECT.length;i++){ busy(true,`PPT ${i+1}/${PROJECT.length}`);
      const s=p.addSlide(); s.addImage({data:await compositeSlide(PROJECT[i]),x:0,y:0,w:13.333,h:7.5}); }
    await p.writeFile({fileName:'CG_덱.pptx'}); toast(`PPT ${PROJECT.length}장 내보냄`);
  }catch(e){ toast('PPT 오류: '+e.message); } busy(false); };

/* ── 붙여넣기(Ctrl+V) → 슬라이드 / AI CG / 게시판 의뢰 ── */
// Claude 프록시. 실패 사유를 그대로 던져 화면에 보여준다(조용히 넘어가지 않는다).
async function aiGenerate(payload){
  const res=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  let j=null; try{ j=await res.json(); }catch(_){}
  if(!res.ok){ const m=(j&&(j.error||j.detail))?String(j.error||'')+(j.detail?(' / '+String(j.detail).slice(0,200)):''):('HTTP '+res.status); throw new Error(m); }
  if(!j||!j.spec) throw new Error('스펙 없음'+(j&&j.raw?(' / '+String(j.raw).slice(0,120)):''));
  return j.spec;
}
let pasteData=null;
function openPaste(dataURL){ pasteData=dataURL; $('pasteImg').src=dataURL; $('paste').style.display='flex'; }
function closePaste(){ $('paste').style.display='none'; pasteData=null; }
$('pasteCancel').onclick=closePaste;
$('paste').onclick=e=>{ if(e.target.id==='paste')closePaste(); };
$('pasteSlide').onclick=async()=>{ const d=pasteData; closePaste(); busy(true,'슬라이드 추가 중…');
  try{ selId=addSlide(await putImage(d),'붙여넣은 이미지'); renderAll(); pushState(); toast('슬라이드 추가'); }
  catch(e){ toast('오류: '+e.message); } busy(false); };
$('pasteBoard').onclick=()=>{ pendingAtt={type:'image',name:'붙여넣은 이미지',dataURL:pasteData}; closePaste();
  renderAttPrev(); $('boardText').focus(); toast('게시판 첨부됨 — 설명을 적고 Enter'); };
$('pasteAI').onclick=async()=>{
  const d=pasteData; closePaste(); busy(true,'🤖 이미지를 읽어 킷 규격 CG로 만드는 중…');
  try{
    const spec=await aiGenerate({ text:'이 이미지의 데이터·항목을 읽어 킷 규격 CG 스펙으로 재구성해줘.', image:d });
    const img=await putImage(await renderKitCG(spec));
    selId=addSlide(img, spec.title||'AI 생성 CG', spec);      // spec 보존 → 나중에 수정 가능
    renderAll(); pushState(); toast('✅ CG 생성 완료 — "이 CG 수정"으로 고칠 수 있습니다');
  }catch(e){
    console.error(e);
    toast('CG 생성 실패: '+e.message);
    alert('CG 생성 실패\n\n'+e.message+'\n\nClaude 연결(크레딧)이 필요합니다.\n연결 전에는 "그림 그대로 슬라이드에 넣기"나 "킷 CG 만들기"를 이용하세요.');
  }
  busy(false);
};
// 어디서든 Ctrl+V (입력창에 타이핑 중일 때는 제외)
document.addEventListener('paste',e=>{
  const a=document.activeElement;
  if(a&&(a.tagName==='TEXTAREA'||a.tagName==='INPUT'||a.isContentEditable)) return;
  const items=[...(e.clipboardData&&e.clipboardData.items||[])];
  const it=items.find(x=>x.type&&x.type.startsWith('image/'));
  if(!it)return;
  e.preventDefault();
  const f=it.getAsFile(); if(!f)return;
  const rd=new FileReader(); rd.onload=()=>openPaste(rd.result); rd.readAsDataURL(f);
});

/* ── 킷 CG 만들기 : 텍스트만 붙여넣으면 양식 자동 판단 ── */
const TYPE_LABEL={
  bars:'막대그래프', line:'꺾은선 추이', trend_bar:'시계열 막대(상승빨강/하락파랑)', rank_bars:'순위 가로막대',
  diverge_bar:'상승·하락 발산막대', stacked_bar:'누적 막대', combo:'막대+꺾은선 이중축', donut:'도넛', pie:'파이',
  theme_grid:'관련주 박스 그리드', category_list:'분류표(번호+분류|종목)', table_card:'구분|내용 표',
  box_list:'헤드라인 브랜드 박스', chevron:'기존→변경 셰브론', timeline:'일지형 타임라인',
  step_flow:'단계 흐름(화살표)', week_card:'주간 일정', vs_card:'대치 비교(VS)',
  topic_line:'오늘의 토크 흐름(지하철)', topic_card:'주제 통CG(다크)', indicator:'韓증시 영향 글로벌 지표',
  three_line:'미증시 3줄 요약(메모지)', person_quote:'인물 말자막', quote:'인용구',
  image_card:'이미지 카드', chart_frame:'요약 카드(불릿)'
};
const MK_SAMPLES=[
  ['막대그래프','제목: SK하이닉스 분기 실적\n단위: 조원\n매출, 영업이익\n1분기, 12.4, 2.9\n2분기, 16.4, 5.5\n3분기, 17.6, 7.0\n4분기, 19.8, 8.1'],
  ['지표','MSCI 한국 ETF: +2.00%\n야간선물: +0.36%\nWTI: $80.34(-5.11%)\n브렌트유: $83.77(-4.73%)\n필라델피아 반도체: +1.06%\n환율: 1,429.34 (-0.46원)\n美10년물 금리: 4.68%'],
  ['3줄 요약','뉴욕증시, 3대 지수 일제히 상승 마감\n엔비디아 실적 기대에 반도체주 강세\n국제유가는 공급 우려 완화에 하락'],
  ['관련주','휴머노이드: 레인보우로보틱스, 에스비비테크\n협동로봇: 두산로보틱스, 뉴로메카\n부품·감속기: 에스피지, 해성티피씨\n물류로봇: 티로보틱스'],
  ['순위','제목: 시가총액 상위\n단위: 조원\n삼성전자, 420\nSK하이닉스, 160\nLG에너지솔루션, 90\n삼성바이오로직스, 70\n현대차, 52'],
  ['토크 흐름','반도체, 전력기기, 바이오, K뷰티'],
  ['일정','제목: 이번 주 주요 일정\n8/11(월) 한국 7월 수출입 물가\n8/12(화) 미국 7월 CPI 발표\n8/13(수) 엔비디아 실적 프리뷰\n8/14(목) 옵션만기일'],
  ['말자막','"AI 반도체 수요는 내년까지 공급이 못 따라갈 것"\n젠슨 황 · 엔비디아 CEO'],
  ['변경','기존 3.50% → 변경 3.25%\n기존 목표주가 12만원 → 변경 15만원'],
];
let mkSampleIdx=0, mkEditId=null, mkT=null, mkAutoType=true, mkImg=null;
function mkBuildTypeSelect(){
  const sel=$('mkType'); if(sel.options.length)return;
  Object.keys(TYPE_LABEL).forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=TYPE_LABEL[k]; sel.appendChild(o); });
}
function mkSpec(){
  const raw=$('mkData').value;
  const forced=mkAutoType?undefined:$('mkType').value;
  const spec=window.kitAuto(raw,forced);
  if(spec.type==='image_card'&&mkImg) spec._img=mkImg;
  return spec;
}
async function mkPreview(){
  try{
    const spec=mkSpec();
    if(mkAutoType){ $('mkType').value=spec.type; }
    $('mkAuto').textContent=mkAutoType?'자동 판단':'직접 선택';
    $('mkAuto').style.background=mkAutoType?'#12331f':'#3a3212';
    $('mkAuto').style.color=mkAutoType?'#7fe0a0':'#ffd98a';
    $('mkHint').textContent='※ 양식이 마음에 안 들면 위 목록에서 직접 고르세요. 맨 위에 "제목:", "단위:", "출처:"를 적으면 반영됩니다.';
    $('mkImg').src=await renderKitCG(spec);
  }catch(e){ console.warn('preview',e); }
}
function mkSchedule(){ clearTimeout(mkT); mkT=setTimeout(mkPreview,260); }
function mkFill(spec){
  if(!spec)return;
  mkAutoType=false; mkBuildTypeSelect(); $('mkType').value=spec.type||'bars';
  const meta=[]; if(spec.title)meta.push('제목: '+spec.title); if(spec.unit)meta.push('단위: '+spec.unit); if(spec.source)meta.push('출처: '+spec.source);
  let txt='', t=spec.type;
  if(t==='bars'||t==='line'||t==='stacked_bar'){
    const names=(spec.series||[]).map(s=>s.name||'').filter(Boolean);
    txt=(names.length?names.join(', ')+'\n':'')+(spec.categories||[]).map((c,ci)=>[c,...(spec.data||[]).map(d=>d[ci])].join(', ')).join('\n');
  } else if(t==='rank_bars'||t==='diverge_bar'||t==='donut'||t==='pie') txt=((spec.ranks||spec.items)||[]).map(r=>`${r.label}, ${r.value}`).join('\n');
  else if(t==='trend_bar') txt=(spec.categories||[]).map((c,i)=>`${c}, ${(spec.values||[])[i]}`).join('\n');
  else if(t==='theme_grid'||t==='category_list') txt=((spec.groups||spec.items)||[]).map(g=>`${g.cat}: ${(g.items||[]).join(', ')}`).join('\n');
  else if(t==='topic_line') txt=(spec.stations||[]).join(', ');
  else if(t==='person_quote'||t==='quote') txt=(spec.quote||'')+'\n'+(spec.who||'');
  else if(t==='indicator'){ const L={ewy:'MSCI 한국 ETF',night:'야간선물',wti:'WTI',brent:'브렌트유',sox:'필라델피아 반도체',fx:'환율',ust:'美10년물 금리'};
    txt=Object.keys(L).filter(k=>(spec.values||{})[k]).map(k=>`${L[k]}: ${spec.values[k]}${(spec.subs&&spec.subs[k])?' '+spec.subs[k]:''}`).join('\n'); }
  else if(t==='three_line') txt=(spec.lines||[]).join('\n');
  else if(t==='timeline') txt=(spec.items||[]).map(i=>`${i.date} ${i.text}`).join('\n');
  else if(t==='chevron') txt=(spec.rows||[]).map(r=>`${r.from} → ${r.to}`).join('\n');
  else if(t==='table_card'||t==='box_list'||t==='step_flow') txt=((spec.rows||spec.items||spec.steps)||[]).map(r=>`${r.label||r.title}: ${r.text||r.desc}`).join('\n');
  else if(t==='topic_card') txt=(spec.lines||[]).join('\n');
  else txt=(spec.bullets||[]).join('\n');
  $('mkData').value=(meta.length?meta.join('\n')+'\n':'')+txt;
}
function mkOpen(editSpec,editId){
  mkBuildTypeSelect();
  mkEditId=editId||null; mkImg=null;
  $('mk').style.display='flex';
  $('mkAdd').textContent=mkEditId?'수정 반영':'슬라이드로 추가';
  if(editSpec) mkFill(editSpec);
  else { mkAutoType=true; if(!$('mkData').value) $('mkData').value=MK_SAMPLES[0][1]; }
  mkPreview();
}
$('makeCG').onclick=()=>mkOpen();
$('editCG').onclick=()=>{ const s=curSlide();
  if(!s||!s.spec){ toast('이 슬라이드는 가져온 그림이라 수정할 수 없습니다 — 사이트에서 만든 CG만 수정됩니다'); return; }
  mkOpen(s.spec,s.id); };
$('mkClose').onclick=()=>$('mk').style.display='none';
$('mk').onclick=e=>{ if(e.target.id==='mk')e.target.style.display='none'; };
$('mkType').onchange=()=>{ mkAutoType=false; mkPreview(); };
$('mkSample').onclick=()=>{ const s=MK_SAMPLES[mkSampleIdx%MK_SAMPLES.length]; mkSampleIdx++;
  $('mkData').value=s[1]; mkAutoType=true; mkPreview(); toast('예시: '+s[0]); };
$('mkData').addEventListener('input',()=>{ mkAutoType=true; mkSchedule(); });
// 만들기 창에서 이미지 붙여넣기 → 이미지 카드
$('mkData').addEventListener('paste',e=>{
  const items=[...(e.clipboardData&&e.clipboardData.items||[])];
  const it=items.find(x=>x.type&&x.type.startsWith('image/')); if(!it)return;
  e.preventDefault(); const f=it.getAsFile(); if(!f)return;
  const rd=new FileReader(); rd.onload=()=>{ const im=new Image(); im.onload=()=>{ mkImg=im; mkAutoType=false;
    mkBuildTypeSelect(); $('mkType').value='image_card'; mkPreview(); toast('이미지 카드로 넣습니다'); }; im.src=rd.result; };
  rd.readAsDataURL(f);
});
$('mkAdd').onclick=async()=>{
  const spec=mkSpec();
  busy(true,'CG 만드는 중…');
  try{
    const img=await putImage(await renderKitCG(spec));
    const save={...spec}; delete save._img;
    if(mkEditId){ const s=PROJECT.find(x=>x.id===mkEditId);
      if(s){ s.img=img; s.spec=save; s.name=spec.title||s.name; } selId=mkEditId; toast('CG 수정 반영'); }
    else { selId=addSlide(img, spec.title||TYPE_LABEL[spec.type]||'킷 CG', save); toast('CG 추가 ('+(TYPE_LABEL[spec.type]||spec.type)+')'); }
    mkEditId=null; renderAll(); pushState(); $('mk').style.display='none';
  }catch(e){ toast('CG 오류: '+e.message); }
  busy(false);
};

/* ── 팀 게시판 ── */
let pendingAtt=null, fulfillId=null;
function renderBoard(){
  const el=$('boardList'); if(!el)return;
  if(!BOARD.length){ el.innerHTML='<div style="font-size:10px;color:#54617e;padding:6px;">아직 의뢰가 없습니다.</div>'; return; }
  el.innerHTML=BOARD.slice(-60).map(r=>{
    const stTxt=r.status==='done'?'완료':r.status==='doing'?('진행 '+(r.by?esc(r.by):'')):'대기';
    const att=r.att?(r.att.dataURL?`<img class="att" src="${r.att.dataURL}" data-full="${r.id}">`:`<div class="file">📎 ${esc(r.att.name)}</div>`):'';
    const mine=r.uid===uid;
    const acts=[];
    if(r.status!=='done'){ if(r.status!=='doing')acts.push(`<button data-do="${r.id}">담당</button>`);
      acts.push(`<button class="go" data-up="${r.id}">슬라이드로 올리기</button>`,`<button data-ok="${r.id}">완료</button>`); }
    else acts.push(`<button data-re="${r.id}">되돌리기</button>`);
    if(mine) acts.push(`<button class="rm" data-del="${r.id}">회수</button>`);
    return `<div class="bItem ${r.status==='done'?'done':''}"><div class="bh"><span class="dot" style="background:${r.color}"></span><span class="nm">${esc(r.user)}</span><span class="st ${r.status}">${stTxt}</span></div>${r.text?`<div class="btx">${esc(r.text)}</div>`:''}${att}<div class="bacts">${acts.join('')}</div></div>`;
  }).join('');
  el.querySelectorAll('[data-do]').forEach(b=>b.onclick=()=>setB(b.dataset.do,'doing'));
  el.querySelectorAll('[data-ok]').forEach(b=>b.onclick=()=>setB(b.dataset.ok,'done'));
  el.querySelectorAll('[data-re]').forEach(b=>b.onclick=()=>setB(b.dataset.re,'wait'));
  el.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ const id=b.dataset.del; const r=BOARD.find(x=>x.id===id);
    if(!r||r.uid!==uid)return; BOARD=BOARD.filter(x=>x.id!==id); renderBoard(); Sync.send({t:'bDel',id}); saveProject(); toast('회수'); });
  el.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{ fulfillId=b.dataset.up; $('fileFulfill').click(); });
  el.scrollTop=el.scrollHeight;
}
function setB(id,st){ const r=BOARD.find(x=>x.id===id); if(!r)return;
  r.status=st; if(st==='doing')r.by=myName||'익명'; renderBoard(); Sync.send({t:'bUpd',id,status:st,by:r.by}); saveProject(); }
function postB(){
  const ta=$('boardText'), t=ta.value.trim(); if(!t&&!pendingAtt)return;
  if(!myName){ toast('먼저 위쪽에 이름을 입력해주세요'); nameIn.focus(); return; }
  const r={id:'b'+Date.now()+Math.floor(Math.random()*999),uid,user:myName,color:myColor,text:t,status:'wait',att:pendingAtt};
  BOARD.push(r); ta.value=''; pendingAtt=null; renderAttPrev(); renderBoard();
  Sync.send({t:'bNew',item:r}); saveProject(); toast('의뢰 등록 — '+myName);
}
$('boardSend').onclick=postB;
$('boardText').addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); postB(); } });
function renderAttPrev(){ const p=$('attPrev');
  p.innerHTML=pendingAtt?`<div class="chip">${pendingAtt.dataURL?`<img src="${pendingAtt.dataURL}">`:esc(pendingAtt.name)}<button id="attClr">×</button></div>`:'';
  const c=$('attClr'); if(c)c.onclick=()=>{ pendingAtt=null; renderAttPrev(); }; }
$('attImg').onclick=()=>$('fileAttImg').click();
$('attFile').onclick=()=>$('fileAtt').click();
const readAtt=f=>{ if(f.type.startsWith('image/')){ const rd=new FileReader();
    rd.onload=()=>{ pendingAtt={type:'image',name:f.name,dataURL:rd.result}; renderAttPrev(); }; rd.readAsDataURL(f); }
  else { pendingAtt={type:'file',name:f.name}; renderAttPrev(); } };
$('fileAttImg').onchange=e=>{ const f=e.target.files[0]; if(f)readAtt(f); e.target.value=''; };
$('fileAtt').onchange=e=>{ const f=e.target.files[0]; if(f)readAtt(f); e.target.value=''; };
$('fileFulfill').onchange=async e=>{
  const fs=[...e.target.files]; e.target.value=''; if(!fs.length)return;
  const pdf=fs.find(f=>f.type==='application/pdf');
  if(pdf) await importPDF(pdf); else await importImages(fs);
  if(fulfillId) setB(fulfillId,'done');
  fulfillId=null;
};

/* ── 수신 ── */
function wireSync(){
  Sync.on(m=>{
    if(m.from===uid&&m.t==='state')return;
    if(m.t==='state'){ PROJECT=m.project; if(!PROJECT.find(x=>x.id===selId))selId=PROJECT[0]&&PROJECT[0].id; renderAll(); }
    else if(m.t==='cursor'){ const p=peers.get(m.id)||{}; Object.assign(p,{name:m.name,color:m.color,cx:m.cx,cy:m.cy,last:performance.now()}); peers.set(m.id,p); renderCursors(); }
    else if(m.t==='presence'){ const p=peers.get(m.id)||{}; Object.assign(p,{name:m.name,color:m.color,last:performance.now()}); peers.set(m.id,p); renderWho();
      if(m.hello){ Sync.send({t:'state',from:uid,project:PROJECT,selId}); Sync.send({t:'bAll',board:BOARD}); presence(); } }
    else if(m.t==='bye'){ peers.delete(m.id); renderWho(); renderCursors(); }
    else if(m.t==='bNew'){ if(!BOARD.find(x=>x.id===m.item.id)){ BOARD.push(m.item); renderBoard(); } }
    else if(m.t==='bUpd'){ const r=BOARD.find(x=>x.id===m.id); if(r){ r.status=m.status; if(m.by)r.by=m.by; renderBoard(); } }
    else if(m.t==='bDel'){ BOARD=BOARD.filter(x=>x.id!==m.id); renderBoard(); }
    else if(m.t==='bAll'){ m.board.forEach(b=>{ if(!BOARD.find(x=>x.id===b.id))BOARD.push(b); }); renderBoard(); }
  });
}
window.addEventListener('beforeunload',()=>Sync.send&&Sync.send({t:'bye',id:uid}));
window.addEventListener('resize',()=>{ renderCursors(); renderOverlays(); });

/* ── 부팅 ── */
(async function boot(){
  try{ Sync=await makeSync(); }catch(e){ Sync=makeLocalSync(); }
  wireSync();
  await loadProject();
  if(!PROJECT.length){
    // 시작 슬라이드도 spec을 함께 저장 → 나중에 규격이 바뀌면 "다시 그리기"로 갱신 가능
    const spec={type:'chart_frame',title:'CG 스튜디오에 오신 것을 환영합니다',source:'한경글로벌TV · 머니플러스',
      bullets:['홈 → ✨ 킷 CG 만들기 로 방송 규격 CG를 직접 만듭니다','홈 → PDF/PPT/이미지 로 완성된 CG를 불러옵니다','▶ 송출 (F5) 로 발표자 화면이 열립니다']};
    PROJECT=[{id:'s0',name:'시작',img:await renderKitCG(spec),transition:'fade',overlays:[],spec}]; selId='s0';
  }
  wireSplit('splitL','.sorter',120,420,'cg_w_sorter',false);
  wireSplit('splitR','.side',200,560,'cg_w_side',true);
  renderAll(); presence(true);
  setInterval(()=>{ presence(); const now=performance.now(); let ch=false;
    for(const [k,p] of peers){ if(now-p.last>6000){ peers.delete(k); ch=true; } }
    if(ch){ renderWho(); renderCursors(); } },2000);
})();
