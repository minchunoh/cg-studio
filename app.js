/* ============================================================
   app.js — CG 스튜디오 프론트엔드 (배포판)
   · Sync: Supabase Realtime(설정 시) 또는 BroadcastChannel(로컬 폴백)
   · 이미지: Supabase Storage 업로드(클라우드) 또는 dataURL(로컬)
   · 프로젝트 영속화: projects 테이블(JSONB)
   · CG 의뢰판 → /api/generate (Claude) → renderKitCG → 덱에 추가
   ============================================================ */
const CFG = window.CG_CONFIG || {};
const CLOUD = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON);

// ── 방(room) ──
function getRoom(){ const u=new URL(location.href); let r=u.searchParams.get('room'); if(!r){ r='moneyplus'; } return r.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40)||'moneyplus'; }
const ROOM=getRoom();
document.getElementById('roomCode').textContent=ROOM;

const TRANSITIONS={ fade:'디졸브', cut:'컷', wipeR:'와이프 →', pushL:'밀기 ←', zoom:'줌 인' };
const COLORS=['#5ad1a0','#f0a500','#ff6f91','#5aa0ff','#c792ea','#4ad6d6','#ffd166'];
const uid='u'+Math.floor(performance.now()*1000%1e9)+Math.floor(1e6*(1/(1+(performance.now()%7))));
let myName=localStorage.getItem('cg_name')||'';
const myColor=COLORS[Math.abs([...uid].reduce((a,c)=>a+c.charCodeAt(0),0))%COLORS.length];

let PROJECT=[]; let selId=null;
const peers=new Map();
let sb=null;

// ── Sync 레이어 ──
let Sync;
async function makeSync(){
  if(CLOUD){
    const { createClient }=await import('https://esm.sh/@supabase/supabase-js@2');
    sb=createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON);
    const ch=sb.channel('cg-'+ROOM,{config:{broadcast:{self:false}}});
    const subs=[];
    ch.on('broadcast',{event:'m'},({payload})=>subs.forEach(f=>f(payload)));
    await ch.subscribe();
    document.getElementById('envTag').textContent='클라우드'; document.getElementById('envTag').className='env cloud';
    return { mode:'cloud', send:m=>ch.send({type:'broadcast',event:'m',payload:m}), on:f=>subs.push(f) };
  } else {
    const ch=new BroadcastChannel('cg-'+ROOM); const subs=[]; ch.onmessage=e=>subs.forEach(f=>f(e.data));
    return { mode:'local', send:m=>ch.postMessage(m), on:f=>subs.push(f) };
  }
}

// ── 이미지 저장 (클라우드=Storage, 로컬=dataURL 그대로) ──
async function putImage(dataURL, hint){
  if(!CLOUD || !sb) return dataURL;
  try{
    const blob=await (await fetch(dataURL)).blob();
    const ext=blob.type.includes('png')?'png':blob.type.includes('jpeg')?'jpg':'png';
    const path=`${ROOM}/${Date.now()}_${Math.floor(Math.random()*1e5)}.${ext}`;
    const { error }=await sb.storage.from('cg').upload(path, blob, {contentType:blob.type||'image/png', upsert:true});
    if(error){ console.warn('storage',error); return dataURL; }
    const { data }=sb.storage.from('cg').getPublicUrl(path);
    return data.publicUrl||dataURL;
  }catch(e){ console.warn('putImage',e); return dataURL; }
}

// ── 프로젝트 영속화 ──
let saveT;
async function saveProject(){
  if(!CLOUD||!sb) return;
  clearTimeout(saveT);
  saveT=setTimeout(async()=>{
    try{ await sb.from('projects').upsert({room:ROOM, data:{slides:PROJECT}, updated_at:new Date().toISOString()}); }catch(e){ console.warn('save',e); }
  }, 700);
}
async function loadProject(){
  if(CLOUD&&sb){
    try{ const { data }=await sb.from('projects').select('data').eq('room',ROOM).maybeSingle();
      if(data&&data.data&&Array.isArray(data.data.slides)&&data.data.slides.length){ PROJECT=data.data.slides; selId=PROJECT[0].id; return; } }catch(e){ console.warn('load',e); }
  }
  // 기본 시작 슬라이드 (킷 규격 안내 CG)
  const img=await renderKitCG({type:'chart_frame', title:'CG 스튜디오에 오신 것을 환영합니다', unit:'', source:'한경글로벌TV · 머니플러스',
    bullets:['오른쪽 의뢰판에 CG를 요청하고 🤖 AI 생성을 누르세요','이미지·파일을 첨부하면 킷 규격으로 재작도합니다','슬라이드를 드래그해 순서를 바꾸고 ▶ 송출로 발표하세요']});
  PROJECT=[{id:'s0',name:'시작',img,transition:'fade',overlays:[]}]; selId='s0';
}

// ── 렌더 ──
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function renderSorter(){
  const s=document.getElementById('sorter');
  [...s.querySelectorAll('.thumb,.addbtn')].forEach(n=>n.remove());
  PROJECT.forEach((sl,i)=>{
    const d=document.createElement('div'); d.className='thumb'+(sl.id===selId?' on':''); d.draggable=true;
    d.innerHTML=`<img src="${sl.img}"><span class="no">${i+1}</span><button class="x" title="삭제">×</button>`;
    d.onclick=e=>{ if(e.target.classList.contains('x'))return; selId=sl.id; renderAll(); pushState(); };
    d.querySelector('.x').onclick=e=>{ e.stopPropagation(); delSlide(sl.id); };
    d.addEventListener('dragstart',e=>{ e.dataTransfer.setData('t',i); d.style.opacity=.4; });
    d.addEventListener('dragend',()=>d.style.opacity=1);
    d.addEventListener('dragover',e=>e.preventDefault());
    d.addEventListener('drop',e=>{ e.preventDefault(); const from=+e.dataTransfer.getData('t'); if(from===i)return; const [m]=PROJECT.splice(from,1); PROJECT.splice(i,0,m); renderAll(); pushState(); toast('순서 변경'); });
    s.appendChild(d);
  });
  const a=document.createElement('button'); a.className='addbtn'; a.textContent='＋ 이미지로 슬라이드 추가'; a.onclick=()=>document.getElementById('fileIn').click(); s.appendChild(a);
}
function renderStage(){
  const sl=PROJECT.find(x=>x.id===selId)||PROJECT[0];
  if(sl) document.getElementById('stageImg').src=sl.img;
  const sel=document.getElementById('trSel'); sel.innerHTML='';
  for(const k in TRANSITIONS){const o=document.createElement('option');o.value=k;o.textContent=TRANSITIONS[k];if(sl&&sl.transition===k)o.selected=true;sel.appendChild(o);}
}
function renderWho(){
  const now=performance.now();
  const live=[{id:uid,name:myName||'나',color:myColor}].concat([...peers.values()].filter(p=>now-p.last<6000));
  document.getElementById('who').innerHTML=`<span class="cnt">${live.length}명 접속 중</span>`+live.slice(0,6).map(p=>`<div class="av" style="background:${p.color}" title="${esc(p.name)}">${esc((p.name||'?')[0]||'?')}</div>`).join('');
  document.getElementById('userList').innerHTML=live.map(p=>`<div class="row"><span class="dot" style="background:${p.color}"></span>${esc(p.name||'이름없음')}${p.id===uid?' (나)':''}</div>`).join('');
}
function renderCursors(){
  const layer=document.getElementById('cursors'); const now=performance.now();
  layer.innerHTML=[...peers.values()].filter(p=>now-p.last<6000&&p.cx!=null).map(p=>{
    const x=p.cx*layer.clientWidth, y=p.cy*layer.clientHeight;
    return `<div class="cur" style="left:${x}px;top:${y}px;"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M1 1 L1 12 L4 9 L6 14 L8 13 L6 8 L10 8 Z" fill="${p.color}" stroke="#0a0f1a" stroke-width="1"/></svg><span class="tag" style="background:${p.color}">${esc(p.name||'?')}</span></div>`;
  }).join('');
}
function renderAll(){ renderSorter(); renderStage(); renderWho(); renderReq(); renderOverlays(); }

// ── 동작 ──
function pushState(){ Sync.send({t:'state', from:uid, project:PROJECT, selId}); saveProject(); }
function delSlide(id){ if(PROJECT.length<=1){toast('마지막 슬라이드는 삭제 불가');return;} const i=PROJECT.findIndex(x=>x.id===id); PROJECT.splice(i,1); if(selId===id)selId=(PROJECT[Math.min(i,PROJECT.length-1)]||PROJECT[0]).id; renderAll(); pushState(); toast('슬라이드 삭제'); }
document.getElementById('trSel').onchange=e=>{ const sl=PROJECT.find(x=>x.id===selId); if(sl){sl.transition=e.target.value; pushState(); toast('전환 변경');} };
async function addImages(files){ let last=null; for(const f of [...files]){ if(!f.type.startsWith('image/'))continue; const dataURL=await new Promise(r=>{const rd=new FileReader();rd.onload=()=>r(rd.result);rd.readAsDataURL(f);}); const img=await putImage(dataURL); const id='s'+Date.now()+Math.floor(Math.random()*999); PROJECT.push({id,name:f.name.replace(/\.[^.]+$/,''),img,transition:'fade',overlays:[]}); last=id; } if(last){ selId=last; renderAll(); pushState(); toast('슬라이드 추가'); } }
document.getElementById('fileIn').onchange=e=>addImages(e.target.files);
document.getElementById('addBtn2').onclick=()=>document.getElementById('fileIn').click();

// 초대링크
document.getElementById('shareBtn').onclick=()=>{ const u=new URL(location.href); u.searchParams.set('room',ROOM); navigator.clipboard&&navigator.clipboard.writeText(u.toString()); toast(CLOUD?'초대링크 복사됨 — 팀원에게 공유하세요':'로컬 모드: 같은 브라우저 새 탭에서 열면 협업 테스트'); };
document.getElementById('copyRoom').onclick=()=>{ navigator.clipboard&&navigator.clipboard.writeText(ROOM); toast('방 이름 복사'); };

// 이름
const nameIn=document.getElementById('nameIn'); nameIn.value=myName;
nameIn.oninput=()=>{ myName=nameIn.value; localStorage.setItem('cg_name',myName); renderWho(); presence(); };

// 송출
let presIdx=0;
function openPresent(){ presIdx=PROJECT.findIndex(x=>x.id===selId); if(presIdx<0)presIdx=0; document.getElementById('present').style.display='flex'; showPres(); }
function showPres(){ const sl=PROJECT[presIdx]; if(!sl)return; const im=document.getElementById('presImg'); im.style.transition='none'; im.style.opacity='0'; im.src=sl.img; requestAnimationFrame(()=>{ im.style.transition='opacity .4s'; im.style.opacity='1'; }); document.getElementById('presPg').textContent=`${presIdx+1} / ${PROJECT.length}`; }
document.getElementById('presentBtn').onclick=openPresent;
document.getElementById('presExit').onclick=()=>document.getElementById('present').style.display='none';
document.addEventListener('keydown',e=>{ if(document.getElementById('present').style.display!=='flex')return; if(e.key==='ArrowRight'||e.key===' '){presIdx=Math.min(PROJECT.length-1,presIdx+1);showPres();} else if(e.key==='ArrowLeft'){presIdx=Math.max(0,presIdx-1);showPres();} else if(e.key==='Escape'){document.getElementById('present').style.display='none';} });

// 커서 공유
const stageWrap=document.querySelector('.stageWrap'); let lastCur=0;
stageWrap.addEventListener('mousemove',e=>{ const now=performance.now(); if(now-lastCur<45)return; lastCur=now; const r=document.getElementById('cursors').getBoundingClientRect(); const cx=(e.clientX-r.left)/r.width, cy=(e.clientY-r.top)/r.height; if(cx<0||cx>1||cy<0||cy>1)return; Sync.send({t:'cursor', id:uid, name:myName||'익명', color:myColor, cx, cy}); });

function presence(hello){ Sync.send({t:'presence', id:uid, name:myName||'익명', color:myColor, hello:!!hello}); }

// toast
let toT; function toast(m){ const t=document.getElementById('toast'); t.textContent=m; t.style.opacity='1'; clearTimeout(toT); toT=setTimeout(()=>t.style.opacity='0',1400); }

// ── 편집 텍스트 오버레이 ──
let selOv=null, editingOv=null;
function curSlide(){ return PROJECT.find(x=>x.id===selId)||PROJECT[0]; }
function renderOverlays(){
  const stage=document.getElementById('stage'); [...stage.querySelectorAll('.ov')].forEach(n=>n.remove());
  const sl=curSlide(); const Wd=stage.clientWidth, Ht=stage.clientHeight;
  (sl&&sl.overlays||[]).forEach(ov=>{
    const d=document.createElement('div'); d.className='ov'+(ov.id===selOv?' sel':''); d.dataset.id=ov.id;
    d.style.left=(ov.xf*Wd)+'px'; d.style.top=(ov.yf*Ht)+'px'; d.style.fontSize=(ov.fs*Ht/720)+'px'; d.style.color=ov.color; d.style.fontFamily='"Gmarket Sans","Malgun Gothic",sans-serif';
    d.textContent=ov.text; if(ov.id===editingOv)d.contentEditable=true;
    stage.appendChild(d); wireOverlay(d,ov);
  });
  const tools=document.getElementById('ovTools'), hint=document.getElementById('ovHint');
  if(tools){ tools.style.display=selOv?'flex':'none'; if(hint)hint.style.display=selOv?'none':'inline'; }
  const o=(sl&&sl.overlays||[]).find(x=>x.id===selOv); if(o)document.getElementById('ovFs').textContent=Math.round(o.fs);
}
function wireOverlay(d,ov){
  d.onclick=e=>{ e.stopPropagation(); if(editingOv===ov.id)return; selOv=ov.id; renderOverlays(); };
  d.ondblclick=e=>{ e.stopPropagation(); selOv=ov.id; editingOv=ov.id; renderOverlays(); const el=document.querySelector('.ov[data-id="'+ov.id+'"]'); if(el){el.focus(); document.getSelection().selectAllChildren(el);} };
  d.onblur=()=>{ if(editingOv===ov.id){ ov.text=d.textContent; editingOv=null; pushState(); renderOverlays(); } };
  d.addEventListener('mousedown',e=>{
    if(editingOv===ov.id)return; e.preventDefault(); e.stopPropagation(); selOv=ov.id;
    const stage=document.getElementById('stage'), R=stage.getBoundingClientRect();
    const sx=ov.xf, sy=ov.yf, px=e.clientX, py=e.clientY; d.classList.add('sel');
    document.getElementById('ovTools').style.display='flex'; document.getElementById('ovHint').style.display='none';
    const mv=ev=>{ ov.xf=Math.max(0,Math.min(1,sx+(ev.clientX-px)/R.width)); ov.yf=Math.max(0,Math.min(1,sy+(ev.clientY-py)/R.height)); d.style.left=(ov.xf*R.width)+'px'; d.style.top=(ov.yf*R.height)+'px'; };
    const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); pushState(); };
    document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
  });
}
document.getElementById('addText').onclick=()=>{ const sl=curSlide(); sl.overlays=sl.overlays||[]; const ov={id:'o'+Date.now(),text:'텍스트',xf:0.4,yf:0.45,fs:34,color:'#111111'}; sl.overlays.push(ov); selOv=ov.id; renderOverlays(); pushState(); toast('텍스트 추가 — 더블클릭해 수정'); };
document.getElementById('ovTools').addEventListener('click',e=>{ const a=e.target.dataset.a,c=e.target.dataset.c; const sl=curSlide(); const ov=(sl.overlays||[]).find(x=>x.id===selOv); if(!ov)return; if(a==='fs+')ov.fs+=2; else if(a==='fs-')ov.fs=Math.max(8,ov.fs-2); else if(a==='del'){sl.overlays=sl.overlays.filter(x=>x.id!==selOv);selOv=null;} else if(c)ov.color=c; renderOverlays(); pushState(); });
document.getElementById('stage').addEventListener('mousedown',e=>{ if(e.target.id==='stage'||e.target.id==='stageImg'){ selOv=null; editingOv=null; renderOverlays(); } });

// ── CG 의뢰판 ──
let REQBOARD=[]; let pendingAtt=null;
// 데모/로컬용 간이 스펙(서버리스 미배포 시)
function makeDemoSpec(req){
  const t=req.text||(req.att&&req.att.name)||'AI 생성 CG';
  return { type:'chart_frame', title:t, source:'한경글로벌TV',
    bullets: req.att? ['첨부 내용을 킷 규격으로 재작도합니다','실배포 시 Claude가 데이터를 추출해 남색 헤더 차트로 생성'] : ['의뢰 내용을 킷 규격 CG로 생성합니다','실배포 시 Claude API가 연결됩니다'] };
}
async function callGenerate(req){
  // 서버리스 Claude 프록시 호출. 실패 시 데모 스펙.
  try{
    const res=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ text:req.text||'', image:(req.att&&req.att.dataURL)||null })});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const j=await res.json(); if(!j||!j.spec) throw new Error('no spec');
    return j.spec;
  }catch(e){ console.warn('generate fallback',e.message); return makeDemoSpec(req); }
}
async function genFromReq(id){
  const req=REQBOARD.find(x=>x.id===id); if(!req||req.status==='gen')return;
  req.status='gen'; renderReq(); Sync.send({t:'reqUpd',id,status:'gen'}); toast('🤖 Claude가 킷 규격으로 생성 중…');
  try{
    const spec=await callGenerate(req);
    const dataURL=await renderKitCG(spec);
    const img=await putImage(dataURL);
    const sid='s'+Date.now(); PROJECT.push({id:sid,name:spec.title||'의뢰 CG',img,transition:'fade',overlays:[]}); selId=sid;
    req.status='done'; req.slideId=sid; renderAll(); pushState();
    Sync.send({t:'reqUpd',id,status:'done'}); toast('✅ CG 생성 완료 → 덱에 추가');
  }catch(e){ req.status='err'; renderReq(); Sync.send({t:'reqUpd',id,status:'err'}); toast('생성 오류: '+e.message); }
}
function renderReq(){ const el=document.getElementById('reqList'); if(!el)return;
  el.innerHTML=REQBOARD.slice(-40).map(r=>{
    const stTxt=r.status==='done'?'완료':r.status==='gen'?'생성중…':r.status==='err'?'오류':'대기';
    const att=r.att?(r.att.dataURL?`<img class="ratt" src="${r.att.dataURL}">`:`<div class="rfile">📎 ${esc(r.att.name)}</div>`):'';
    const acts=(r.status==='wait'||r.status==='err')?`<div class="racts"><button class="rgen" data-id="${r.id}">🤖 AI 생성</button><button class="rfill" data-id="${r.id}">＋ 직접 첨부</button></div>`:'';
    return `<div class="reqItem"><div class="rhead"><span class="dot" style="background:${r.color}"></span><span class="nm">${esc(r.user)}</span><span class="st ${r.status}">${stTxt}</span></div>${r.text?`<div class="rtxt">${esc(r.text)}</div>`:''}${att}${acts}</div>`;
  }).join('');
  el.querySelectorAll('.rgen').forEach(b=>b.onclick=()=>genFromReq(b.dataset.id));
  el.querySelectorAll('.rfill').forEach(b=>b.onclick=()=>fulfill(b.dataset.id));
  el.scrollTop=el.scrollHeight;
}
function renderAttPrev(){ const p=document.getElementById('attPrev'); if(!p)return; p.innerHTML=pendingAtt?`<div class="attChip">${pendingAtt.dataURL?`<img src="${pendingAtt.dataURL}">`:''}${pendingAtt.dataURL?'':esc(pendingAtt.name)}<button id="attClr">×</button></div>`:''; const c=document.getElementById('attClr'); if(c)c.onclick=()=>{pendingAtt=null;renderAttPrev();}; }
function postReq(){ const ta=document.getElementById('reqText'); const t=ta.value.trim(); if(!t&&!pendingAtt)return; const r={id:'r'+Date.now()+Math.floor(Math.random()*999),user:myName||'익명',color:myColor,text:t,status:'wait',att:pendingAtt}; REQBOARD.push(r); ta.value=''; pendingAtt=null; renderAttPrev(); renderReq(); Sync.send({t:'req',req:r}); toast('의뢰 등록'); }
document.getElementById('reqSend').onclick=postReq;
document.getElementById('attImg').onclick=()=>document.getElementById('attImgIn').click();
document.getElementById('attFile').onclick=()=>document.getElementById('attFileIn').click();
document.getElementById('attImgIn').onchange=e=>{ const f=e.target.files[0]; if(!f)return; const rd=new FileReader(); rd.onload=()=>{ pendingAtt={type:'image',name:f.name,dataURL:rd.result}; renderAttPrev(); }; rd.readAsDataURL(f); e.target.value=''; };
document.getElementById('attFileIn').onchange=e=>{ const f=e.target.files[0]; if(!f)return; if(f.type.startsWith('image/')){ const rd=new FileReader(); rd.onload=()=>{ pendingAtt={type:'image',name:f.name,dataURL:rd.result}; renderAttPrev(); }; rd.readAsDataURL(f); } else { pendingAtt={type:'file',name:f.name}; renderAttPrev(); } e.target.value=''; };
let fulfillReqId=null;
function fulfill(id){ fulfillReqId=id; document.getElementById('fulfillIn').click(); }
document.getElementById('fulfillIn').onchange=async e=>{ const f=e.target.files[0]; if(!f)return; const dataURL=await new Promise(r=>{const rd=new FileReader();rd.onload=()=>r(rd.result);rd.readAsDataURL(f);}); const img=await putImage(dataURL); const sid='s'+Date.now(); PROJECT.push({id:sid,name:'의뢰 CG',img,transition:'fade',overlays:[]}); selId=sid; const r=REQBOARD.find(x=>x.id===fulfillReqId); if(r){r.status='done';r.slideId=sid;} renderAll(); pushState(); Sync.send({t:'reqUpd',id:fulfillReqId,status:'done'}); toast('슬라이드 첨부 완료'); e.target.value=''; };

// ── 내보내기 ──
function loadImg(src){ return new Promise((res,rej)=>{ const im=new Image(); im.crossOrigin='anonymous'; im.onload=()=>res(im); im.onerror=rej; im.src=src; }); }
async function compositeSlide(sl){
  const c=document.createElement('canvas'); c.width=1280; c.height=720; const g=c.getContext('2d');
  g.fillStyle='#000'; g.fillRect(0,0,1280,720);
  try{ const im=await loadImg(sl.img); g.drawImage(im,0,0,1280,720); }catch(e){}
  (sl.overlays||[]).forEach(ov=>{ g.fillStyle=ov.color; g.textBaseline='top'; const fs=ov.fs; g.font=`700 ${fs}px "Gmarket Sans","Malgun Gothic",sans-serif`; const x=ov.xf*1280, y=ov.yf*720; String(ov.text).split('\n').forEach((ln,i)=>g.fillText(ln,x,y+i*fs*1.15)); });
  return c.toDataURL('image/png');
}
function dl(u,name){ const a=document.createElement('a'); a.href=u; a.download=name; document.body.appendChild(a); a.click(); a.remove(); }
function dlBlob(b,name){ const u=URL.createObjectURL(b); dl(u,name); setTimeout(()=>URL.revokeObjectURL(u),1500); }
document.getElementById('expImg').onclick=async()=>{ toast('이미지 만드는 중…'); try{ if(window.JSZip){ const zip=new JSZip(); for(let i=0;i<PROJECT.length;i++){ const d=await compositeSlide(PROJECT[i]); zip.file(`CG_${i+1}.png`, d.split(',')[1], {base64:true}); } const blob=await zip.generateAsync({type:'blob'}); dlBlob(blob,'CG_덱_이미지.zip'); toast('이미지 '+PROJECT.length+'장(zip) 내보냄'); } else { const d=await compositeSlide(curSlide()); dl(d,'CG.png'); } }catch(err){ toast('내보내기 오류: '+err.message); } };
document.getElementById('expPpt').onclick=async()=>{ const P=window.PptxGenJS||window.pptxgen; if(!P){ toast('PPT 라이브러리 로드 실패'); return; } toast('PPT 만드는 중…'); try{ const p=new P(); p.defineLayout({name:'W',width:13.333,height:7.5}); p.layout='W'; for(const sl of PROJECT){ const d=await compositeSlide(sl); const s=p.addSlide(); s.addImage({data:d,x:0,y:0,w:13.333,h:7.5}); } await p.writeFile({fileName:'CG_덱.pptx'}); toast('PPT 내보냄 ('+PROJECT.length+'장)'); }catch(err){ toast('PPT 오류: '+err.message); } };

// ── 수신 ──
function wireSync(){
  Sync.on(m=>{
    if(m.from===uid && m.t==='state') return;
    if(m.t==='state'){ PROJECT=m.project; if(!PROJECT.find(x=>x.id===selId))selId=PROJECT[0]&&PROJECT[0].id; renderAll(); }
    else if(m.t==='cursor'){ const p=peers.get(m.id)||{}; Object.assign(p,{name:m.name,color:m.color,cx:m.cx,cy:m.cy,last:performance.now()}); peers.set(m.id,p); renderCursors(); }
    else if(m.t==='presence'){ const p=peers.get(m.id)||{}; Object.assign(p,{name:m.name,color:m.color,last:performance.now()}); peers.set(m.id,p); renderWho(); if(m.hello){ Sync.send({t:'state', from:uid, project:PROJECT, selId}); Sync.send({t:'reqAll',board:REQBOARD}); presence(); } }
    else if(m.t==='bye'){ peers.delete(m.id); renderWho(); renderCursors(); }
    else if(m.t==='req'){ if(!REQBOARD.find(x=>x.id===m.req.id)){ REQBOARD.push(m.req); renderReq(); } }
    else if(m.t==='reqUpd'){ const r=REQBOARD.find(x=>x.id===m.id); if(r){ r.status=m.status; renderReq(); } }
    else if(m.t==='reqAll'){ m.board.forEach(rb=>{ if(!REQBOARD.find(x=>x.id===rb.id))REQBOARD.push(rb); }); renderReq(); }
  });
}
window.addEventListener('beforeunload',()=>Sync.send&&Sync.send({t:'bye', id:uid}));
window.addEventListener('resize', ()=>{ renderCursors(); renderOverlays(); });

// ── 부트 ──
(async function boot(){
  Sync=await makeSync();
  wireSync();
  await loadProject();
  renderAll();
  presence(true);
  setInterval(()=>{ presence(); const now=performance.now(); let ch=false; for(const [k,p] of peers){ if(now-p.last>6000){peers.delete(k);ch=true;} } if(ch){renderWho();renderCursors();} }, 2000);
})();
