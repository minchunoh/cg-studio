/* ============================================================
   kit-render.js — 방송 CG 킷 렌더러 (브라우저 캔버스판)  v2
   · 실제 방송 배경 사용: bg_card.png(남색 헤더+흰 카드), bg_sky.png(하늘 배경)
   · render_cg.js 좌표에 정렬 (제목 y=118px, 카드 137~1143, 플롯 154~1109 등)
   · 티커 안전지대 / G마켓 서체 / 가운데 정렬 / 자동 빨강 금지
   window.renderKitCG(spec) -> Promise<dataURL(png)>
   ============================================================ */
(function(){
  const W=1280, H=720;
  const NAVY='#0D004E', RED='#C00000', BLUE='#2F6FD6', INK='#111111', GRAY='#4a5568', NOTE='#26304A';
  const FB='"Gmarket Sans","Malgun Gothic",sans-serif';
  const bold=(px)=>`700 ${px}px ${FB}`, med=(px)=>`500 ${px}px ${FB}`;

  // ── 실측 좌표 (px, 96dpi 환산) ──
  const CARD_L=137, CARD_R=1143, CARD_W=CARD_R-CARD_L;
  const HDR_CY=156;
  const NOTE_Y=206;
  const LEG_Y=232;
  const PLOT_X0=178, PLOT_X1=1105;
  const PLOT_TOP=300, PLOT_BASE=560;
  const CARD_TOP=200, CARD_BOT=592;
  const TICKER_TOP=159, TICKER_BOTTOM=616;

  const BG={};
  function loadImg(src){ return new Promise((res)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=()=>res(null); im.src=src; }); }
  const V='?v=5';   // 캐시 무력화
  const bgReady=(async()=>{ BG.card=await loadImg('./bg_card.png'+V); BG.sky=await loadImg('./bg_sky.png'+V); BG.logo=await loadImg('./moneyplus_logo.png'+V);
    BG.ind=await loadImg('./bg_indicator.png'+V); BG.note=await loadImg('./bg_note.png'+V); })();
  window.KIT_VERSION='v5';   // 배포 확인용 표시
  function ensureFonts(){ if(!document.fonts||!document.fonts.load) return Promise.resolve();
    return Promise.all([document.fonts.load('700 40px "Gmarket Sans"'),document.fonts.load('500 22px "Gmarket Sans"')]).catch(()=>{}); }

  function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
  function fit(g,t,maxW,start,min,w){ let px=start; do{ g.font=w==='med'?med(px):bold(px); if(g.measureText(t).width<=maxW)break; px--; }while(px>min); return px; }
  function wrap(g,t,maxW){ const ws=String(t||'').split(/\s+/); const L=[]; let ln=''; for(const w of ws){ const s=ln?ln+' '+w:w; if(g.measureText(s).width>maxW&&ln){L.push(ln);ln=w;}else ln=s; } if(ln)L.push(ln); return L; }
  function nice(m){ if(m<=0)return 1; const p=Math.pow(10,Math.floor(Math.log10(m))); const n=m/p; const s=n<=1?1:n<=2?2:n<=5?5:10; return s*p; }
  function fmt(v){ const a=Math.abs(v); if(a>=1e8)return (v/1e8).toLocaleString(undefined,{maximumFractionDigits:1})+'억'; if(a>=1e4&&Number.isInteger(v))return v.toLocaleString(); return (Math.round(v*100)/100).toLocaleString(); }
  const PALETTE=['#22B7CB','#B24A7C','#2F6FD6','#F0A500','#5AA0A0','#8E7CC3'];

  // ── 요소 모션(빌드) ──
  // spec.build = 0~1. 없으면 1(완성 상태). 항목별로 시차를 둬 "차례로 자라나는" 느낌을 낸다.
  function stagger(spec,i,n){
    const b=spec&&spec.build; if(b==null) return 1;
    if(n<=1) return Math.max(0,Math.min(1,b));
    const span=0.55, step=(1-span)/(n-1);           // 앞 항목부터 순차 시작
    const t=(b-step*i)/span;
    return Math.max(0,Math.min(1,t));
  }
  const easeOut=t=>1-Math.pow(1-t,3);

  function cardBG(g){ if(BG.card)g.drawImage(BG.card,0,0,W,H); else{ g.fillStyle='#8fb0da'; g.fillRect(0,0,W,H); g.fillStyle=NAVY; rr(g,CARD_L,118,CARD_W,75,8); g.fill(); g.fillStyle='#fff'; rr(g,CARD_L,200,CARD_W,392,8); g.fill(); } }
  function skyBG(g){ if(BG.sky)g.drawImage(BG.sky,0,0,W,H); else{ const gr=g.createLinearGradient(0,0,W,H); gr.addColorStop(0,'#a9c8f2'); gr.addColorStop(1,'#5f8fd6'); g.fillStyle=gr; g.fillRect(0,0,W,H); } }

  function chartHead(g,spec){
    cardBG(g);
    g.textAlign='center'; g.textBaseline='middle'; g.fillStyle='#fff';
    const fp=fit(g,spec.title||'',CARD_W-70,38,23,'bold'); g.font=bold(fp);
    g.fillText(spec.title||'',W/2,HDR_CY);
    const parts=[]; if(spec.unit)parts.push('단위 : '+spec.unit); if(spec.source)parts.push((spec.sourceLabel||'자료')+' : '+spec.source);
    if(parts.length){ g.font=med(15); g.fillStyle=NOTE; g.textBaseline='middle'; g.fillText(parts.join('   '),W/2,NOTE_Y); }
  }
  function legend(g,series,kind){
    const items=series.filter(s=>s.name); if(!items.length)return;
    g.font=med(16); let tot=0; items.forEach(s=>tot+=g.measureText(s.name).width+42); let x=W/2-tot/2; const y=LEG_Y;
    items.forEach((s,i)=>{ const c=s.color||PALETTE[i%PALETTE.length]; g.fillStyle=c;
      if(kind==='line'){ g.fillRect(x,y-2,22,4); g.beginPath(); g.arc(x+11,y,4,0,7); g.fill(); } else { rr(g,x,y-8,16,16,3); g.fill(); }
      g.fillStyle=NOTE; g.textAlign='left'; g.textBaseline='middle'; g.fillText(s.name,x+26,y); x+=g.measureText(s.name).width+42; });
  }

  function drawBars(g,spec){
    chartHead(g,spec);
    const cats=spec.categories||[]; const series=spec.series&&spec.series.length?spec.series:[{name:''}]; const data=spec.data||[];
    const hasLeg=series.length>1||series[0].name; const top=hasLeg?PLOT_TOP:CARD_TOP+40;
    const all=data.flat().filter(v=>typeof v==='number'); const vmax=nice(Math.max(1,...all));
    const base=PLOT_BASE, plotH=base-top;
    g.font=med(14);
    for(let i=0;i<=4;i++){ const v=vmax*i/4,y=base-plotH*i/4; g.setLineDash([4,5]); g.strokeStyle='#d7deea'; g.beginPath(); g.moveTo(PLOT_X0,y); g.lineTo(PLOT_X1,y); g.stroke(); g.setLineDash([]); g.fillStyle=GRAY; g.textAlign='right'; g.textBaseline='middle'; g.fillText(fmt(v),PLOT_X0-8,y); }
    const nC=cats.length||1, band=(PLOT_X1-PLOT_X0)/nC, nS=series.length, bw=Math.min((band*0.72)/nS, 82);
    cats.forEach((cat,ci)=>{ const cx=PLOT_X0+band*(ci+0.5), grp=bw*nS+8*(nS-1), x0=cx-grp/2;
      for(let si=0;si<nS;si++){ const v=(data[si]&&data[si][ci])||0, k=stagger(spec,ci,nC), h=plotH*v/vmax*k, x=x0+si*(bw+8);
        if(k<=0) continue;
        g.fillStyle=(series[si]&&series[si].color)||PALETTE[si%PALETTE.length]; rr(g,x,base-h,bw,h,4); g.fill();
        if(k>0.85){ g.globalAlpha=Math.min(1,(k-0.85)/0.15); g.fillStyle=INK; g.font=bold(16); g.textAlign='center'; g.textBaseline='alphabetic'; g.fillText(fmt(v),x+bw/2,base-h-8); g.globalAlpha=1; } }
      g.fillStyle=NAVY; g.font=med(17); g.textAlign='center'; g.textBaseline='top'; g.fillText(cat,cx,base+10);
    });
    if(hasLeg) legend(g,series,'bar');
  }
  function drawLine(g,spec){
    chartHead(g,spec);
    const cats=spec.categories||[]; const series=spec.series&&spec.series.length?spec.series:[{name:''}]; const data=spec.data||[];
    const hasLeg=series.length>1||series[0].name; const top=hasLeg?PLOT_TOP:CARD_TOP+40;
    const all=data.flat().filter(v=>typeof v==='number'); const vmax=nice(Math.max(1,...all)); const base=PLOT_BASE, plotH=base-top;
    g.font=med(14);
    for(let i=0;i<=4;i++){ const v=vmax*i/4,y=base-plotH*i/4; g.setLineDash([4,5]); g.strokeStyle='#d7deea'; g.beginPath(); g.moveTo(PLOT_X0,y); g.lineTo(PLOT_X1,y); g.stroke(); g.setLineDash([]); g.fillStyle=GRAY; g.textAlign='right'; g.textBaseline='middle'; g.fillText(fmt(v),PLOT_X0-8,y); }
    const nC=cats.length||1, step=nC>1?(PLOT_X1-PLOT_X0)/(nC-1):0;
    const bld=(spec&&spec.build!=null)?Math.max(0,Math.min(1,spec.build)):1;   // 선이 좌→우로 그려짐
    const cutX=PLOT_X0+(PLOT_X1-PLOT_X0)*easeOut(bld);
    series.forEach((s,si)=>{ const c=s.color||PALETTE[si%PALETTE.length];
      g.save(); g.beginPath(); g.rect(PLOT_X0-8,0,Math.max(0,cutX-PLOT_X0+8),H); g.clip();
      g.strokeStyle=c; g.lineWidth=4; g.beginPath();
      (data[si]||[]).forEach((v,ci)=>{ const x=PLOT_X0+step*ci,y=base-plotH*v/vmax; ci?g.lineTo(x,y):g.moveTo(x,y); }); g.stroke();
      (data[si]||[]).forEach((v,ci)=>{ const x=PLOT_X0+step*ci,y=base-plotH*v/vmax; if(x>cutX)return;
        g.fillStyle=c; g.beginPath(); g.arc(x,y,5,0,7); g.fill(); g.fillStyle=INK; g.font=bold(15); g.textAlign='center'; g.textBaseline='alphabetic'; g.fillText(fmt(v),x,y-10); });
      g.restore(); });
    g.fillStyle=NAVY; g.font=med(16); g.textAlign='center'; g.textBaseline='top'; cats.forEach((c,ci)=>g.fillText(c,PLOT_X0+step*ci,base+10));
    if(hasLeg) legend(g,series,'line');
  }
  function drawRank(g,spec){
    chartHead(g,spec);
    const ranks=(spec.ranks||[]).slice(0,7); const vmax=Math.max(1,...ranks.map(r=>r.value||0));
    const top=CARD_TOP+34, rowH=Math.min(56,(CARD_BOT-top)/Math.max(1,ranks.length)-10), gap=10;
    const x0=CARD_L+230, barMax=CARD_R-x0-90; let y=top;
    ranks.forEach((r,i)=>{
      const k=stagger(spec,i,ranks.length);      // 위에서부터 순차로 늘어남
      g.globalAlpha=k>0?1:0.15;
      g.fillStyle=i===0?RED:NAVY; g.beginPath(); g.arc(CARD_L+40,y+rowH/2,15,0,7); g.fill();
      g.fillStyle='#fff'; g.font=bold(17); g.textAlign='center'; g.textBaseline='middle'; g.fillText(String(i+1),CARD_L+40,y+rowH/2);
      g.fillStyle=NAVY; g.font=bold(19); g.textAlign='left'; g.fillText(r.label||'',CARD_L+62,y+rowH/2);
      g.globalAlpha=1;
      const bw=Math.max(barMax*(r.value||0)/vmax*easeOut(k),k>0?4:0);
      if(k>0){ g.fillStyle=i===0?RED:'#2F6FD6'; rr(g,x0,y+6,bw,rowH-12,5); g.fill();
        if(k>0.8){ g.globalAlpha=Math.min(1,(k-0.8)/0.2); g.fillStyle='#fff'; g.font=bold(17); g.textAlign='right'; g.fillText(fmt(r.value)+(spec.suffix||''),x0+bw-10,y+rowH/2); g.globalAlpha=1; } }
      y+=rowH+gap;
    });
  }
  function drawFrame(g,spec){
    chartHead(g,spec);
    const bullets=spec.bullets||(spec.body?[spec.body]:[]); g.textAlign='left'; g.textBaseline='top'; let y=CARD_TOP+46;
    bullets.forEach(b=>{ g.fillStyle=RED; g.beginPath(); g.arc(CARD_L+40,y+14,5,0,7); g.fill();
      g.fillStyle='#233'; g.font=med(24); wrap(g,b,CARD_W-120).forEach(ln=>{ g.fillText(ln,CARD_L+58,y); y+=34; }); y+=12; });
  }
  function skyTitle(g,title,sub){
    g.textAlign='center'; g.textBaseline='middle'; const fp=fit(g,title,W-180,42,26,'bold'); g.font=bold(fp);
    g.lineJoin='round'; g.strokeStyle='#fff'; g.lineWidth=6; g.strokeText(title,W/2,118); g.fillStyle=INK; g.fillText(title,W/2,118);
    if(sub){ g.font=med(16); g.fillStyle='#22345a'; g.fillText(sub,W/2,156); }
  }
  function drawGrid(g,spec){
    skyBG(g);
    const sub=[spec.unit?'단위 : '+spec.unit:'',spec.source?'자료 : '+spec.source:''].filter(Boolean).join('   ');
    skyTitle(g,spec.title,sub);
    let cards=[]; if(spec.groups&&spec.groups.length) cards=spec.groups.map(gp=>({name:gp.cat,desc:(gp.items||[]).join(' · ')}));
    else cards=(spec.cards||[]).map(c=>({name:c.name,desc:c.desc||''}));
    const n=cards.length||1; let cols=spec.cols||(n<=3?n:Math.ceil(n/2)); cols=Math.min(cols,5,n); const rows=Math.ceil(n/cols);
    const aX=92,aW=W-184,aTop=TICKER_TOP+30,aBot=TICKER_BOTTOM-8,aH=aBot-aTop,cg=18,rg=16;
    const cw=(aW-cg*(cols-1))/cols, ch=(aH-rg*(rows-1))/rows;
    cards.forEach((c,i)=>{ const r=Math.floor(i/cols),ci=i%cols; const inRow=(r===rows-1&&n%cols!==0)?(n%cols):cols; const off=(cols-inRow)/2*(cw+cg);
      const x=aX+off+ci*(cw+cg), y=aTop+r*(ch+rg);
      g.fillStyle='rgba(255,255,255,.97)'; rr(g,x,y,cw,ch,12); g.fill();
      const hH=Math.max(34,Math.min(56,ch*0.4)); g.fillStyle=NAVY; rr(g,x,y,cw,hH,12); g.fill(); g.fillRect(x,y+hH-12,cw,12);
      g.fillStyle='#fff'; g.textAlign='center'; g.textBaseline='middle'; const np=fit(g,c.name,cw-20,22,13,'bold'); g.font=bold(np); g.fillText(c.name,x+cw/2,y+hH/2);
      g.fillStyle='#243043'; g.font=med(16); g.textBaseline='top'; const L=wrap(g,c.desc,cw-24).slice(0,4),lh=22,by=y+hH+(ch-hH-L.length*lh)/2; L.forEach((ln,li)=>g.fillText(ln,x+cw/2,by+li*lh));
    });
  }
  function drawQuote(g,spec){
    skyBG(g);
    g.fillStyle='rgba(255,255,255,.95)'; rr(g,150,TICKER_TOP+16,W-300,TICKER_BOTTOM-TICKER_TOP-34,18); g.fill();
    g.fillStyle='#cfe0f5'; g.font=bold(120); g.textAlign='left'; g.textBaseline='top'; g.fillText('“',185,TICKER_TOP+14);
    g.fillStyle=NAVY; g.textAlign='center'; g.textBaseline='middle'; const fp=fit(g,spec.quote||'',W-420,40,24,'bold'); g.font=bold(fp);
    const L=wrap(g,spec.quote||'',W-420); const cy=(TICKER_TOP+TICKER_BOTTOM)/2-(spec.who?18:0),lh=fp*1.3;
    L.slice(0,4).forEach((ln,i)=>g.fillText(ln,W/2,cy-(L.length-1)*lh/2+i*lh));
    if(spec.who){ g.fillStyle=BLUE; g.font=med(24); g.fillText('— '+spec.who,W/2,TICKER_BOTTOM-64); }
  }

  function trainMarker(g,x,y,ACC){
    const w=104,h=48, bx=x-w/2, by=y-h/2;
    g.fillStyle='#0D2B6B'; rr(g,bx,by,w,h,11); g.fill(); g.lineWidth=1.5; g.strokeStyle='#fff'; g.stroke();
    g.fillStyle=ACC; rr(g,bx+8,by+5,w-16,10,5); g.fill();
    const ww=18,wh=16,gap=8,tot=3*ww+2*gap,wx0=x-tot/2,wy=by+21;
    g.fillStyle='#CDEAF2'; for(let k=0;k<3;k++){ rr(g,wx0+k*(ww+gap),wy,ww,wh,3); g.fill(); }
  }
  function drawTopicLine(g,spec){
    spec={...spec, title:spec.title||'오늘의 토크 흐름'}; skyBG(g); skyTitle(g,spec.title);
    const LINE='#123C86',REMAIN='#C4CEE0',ACC='#12B0C6',NODE='#0D2B6B';
    const st=spec.stations||spec.items||[]; const n=st.length; if(!n)return;
    const nameOf=s=>typeof s==='string'?s:(s.name||s.text||'');
    const animate=spec.progress!=null;
    const prog=Math.max(0,Math.min(n-1, animate?spec.progress:(spec.active!=null?spec.active:0)));
    const top=Math.ceil(n/2), bot=n-top;
    const LX=210,RX=1015,RXo=1055,yT=380,yB=560,midY=470; const pos=[];
    const sT=top>1?(RX-LX)/(top-1):0; for(let i=0;i<top;i++)pos.push({x:top>1?LX+sT*i:(LX+RX)/2,y:yT});
    const sB=bot>1?(RX-LX)/(bot-1):0; for(let i=0;i<bot;i++)pos.push({x:bot>1?RX-sB*i:(LX+RX)/2,y:yB});
    const P=[],stationArc=new Array(n);
    for(let i=0;i<top;i++)P.push({x:pos[i].x,y:yT,st:i});
    if(bot>0){P.push({x:RXo,y:yT});P.push({x:RXo,y:yB});}
    for(let i=top;i<n;i++)P.push({x:pos[i].x,y:yB,st:i});
    const arc=[0]; for(let k=1;k<P.length;k++)arc[k]=arc[k-1]+Math.hypot(P[k].x-P[k-1].x,P[k].y-P[k-1].y);
    P.forEach((p,k)=>{if(p.st!=null)stationArc[p.st]=arc[k];});
    const si=Math.floor(prog),sf=prog-si;
    const trainArc=si>=n-1?stationArc[n-1]:stationArc[si]+(stationArc[si+1]-stationArc[si])*sf;
    const eps=0.001; let cur=0; for(let i=0;i<n;i++) if(stationArc[i]<=trainArc+eps)cur=i;
    g.lineWidth=6; g.lineCap='round';
    for(let k=1;k<P.length;k++){ g.strokeStyle=REMAIN; g.beginPath(); g.moveTo(P[k-1].x,P[k-1].y); g.lineTo(P[k].x,P[k].y); g.stroke(); }
    for(let k=1;k<P.length;k++){ if(arc[k-1]>=trainArc)break; let ex=P[k].x,ey=P[k].y; if(arc[k]>trainArc){const t=(trainArc-arc[k-1])/(arc[k]-arc[k-1]);ex=P[k-1].x+(P[k].x-P[k-1].x)*t;ey=P[k-1].y+(P[k].y-P[k-1].y)*t;} g.strokeStyle=LINE; g.beginPath(); g.moveTo(P[k-1].x,P[k-1].y); g.lineTo(ex,ey); g.stroke(); }
    st.forEach((s,i)=>{ const p=pos[i],reached=stationArc[i]<=trainArc+eps,isCur=i===cur,isTop=p.y<midY,rad=isCur?15:11;
      g.beginPath(); g.arc(p.x,p.y,rad,0,7); g.fillStyle=isCur?ACC:(reached?NODE:'#fff'); g.fill(); g.lineWidth=isCur?3:2.5; g.strokeStyle=NODE; g.stroke();
      g.fillStyle=isCur?'#11245A':'#3C4A66'; g.font=isCur?bold(23):med(18); g.textAlign='center'; g.textBaseline=isTop?'bottom':'top'; g.fillText(nameOf(s),p.x, isTop?p.y-24:p.y+24);
    });
    const activeName=nameOf(st[cur]);
    g.font=bold(24); const nmW=Math.max(60,g.measureText(activeName).width), lgH=48, lgW=lgH*2.056, inGap=14, padX=22;
    const pillW=lgW+inGap+nmW+padX*2, pillH=62, pillX=W/2-pillW/2, pillY=148;
    g.fillStyle='#fff'; rr(g,pillX,pillY,pillW,pillH,31); g.fill(); g.lineWidth=2.5; g.strokeStyle='#0D2B6B'; g.stroke();
    if(BG.logo) g.drawImage(BG.logo,pillX+padX,pillY+(pillH-lgH)/2,lgW,lgH);
    g.fillStyle='#11245A'; g.font=bold(24); g.textAlign='left'; g.textBaseline='middle'; g.fillText(activeName,pillX+padX+lgW+inGap,pillY+pillH/2+1);
    let tx=P[0].x,ty=P[0].y;
    for(let k=1;k<P.length;k++){ if(trainArc<=arc[k]||k===P.length-1){const d=arc[k]-arc[k-1],t=d?(trainArc-arc[k-1])/d:0;tx=P[k-1].x+(P[k].x-P[k-1].x)*t;ty=P[k-1].y+(P[k].y-P[k-1].y)*t;break;} }
    trainMarker(g,tx,ty,ACC);
  }
  // ── 지표 (韓증시 영향 글로벌 지표) : 아이콘 템플릿 위 수치만 얹음 ──
  // 색 규칙(방송 실측): 하락(-) = 남색 19108A, 상승/무부호 = 빨강 FF0000, 야간선물 하락 = 하늘 DAE3F3
  const IND_SLOTS=[  // 킷 좌표(inch)를 px로: ×96
    {key:'ewy',   label:'MSCI 한국 ETF',  cx:275, cy:231},
    {key:'night', label:'야간선물',        cx:672, cy:232, downColor:'#DAE3F3'},
    {key:'wti',   label:'WTI',            cx:1025,cy:213, pt:18},
    {key:'brent', label:'브렌트유',        cx:1025,cy:283, pt:18},
    {key:'sox',   label:'필라델피아 반도체',cx:275, cy:480},
    {key:'fx',    label:'원·달러 환율',     cx:639, cy:485, pt:28},
    {key:'ust',   label:'美10년물 국채금리',cx:1018,cy:492}
  ];
  function drawIndicator(g,spec){
    if(BG.ind)g.drawImage(BG.ind,0,0,W,H); else skyBG(g);
    if(spec.title){ g.textAlign='center'; g.textBaseline='middle';
      const fp=fit(g,spec.title,W-160,38,24,'bold'); g.font=bold(fp);
      g.fillStyle='#19108A'; g.fillText(spec.title,W/2,66); }
    const vals=spec.values||{};
    IND_SLOTS.forEach(s=>{
      const raw=vals[s.key]; if(raw==null||raw==='')return;
      const txt=String(raw), sub=(spec.subs&&spec.subs[s.key])||'';
      const down=/-/.test(txt)||/-/.test(sub);
      const color=down?(s.downColor||'#19108A'):'#FF0000';
      const pt=s.pt||30, subPt=Math.round(pt*0.62);
      g.fillStyle=color; g.textAlign='center';
      if(sub){ g.textBaseline='bottom'; g.font=bold(pt); g.fillText(txt,s.cx,s.cy+2);
        g.textBaseline='top'; g.font=bold(subPt); g.fillText(sub,s.cx,s.cy+6); }
      else { g.textBaseline='middle'; g.font=bold(pt); g.fillText(txt,s.cx,s.cy); }
    });
  }
  // ── 미증시 3줄 요약 (메모지 양식) ──
  function drawThreeLine(g,spec){
    if(BG.note)g.drawImage(BG.note,0,0,W,H); else skyBG(g);
    if(spec.title){ g.textAlign='center'; g.textBaseline='middle';
      const fp=fit(g,spec.title,760,34,20,'bold'); g.font=bold(fp);
      g.fillStyle='#111111'; g.fillText(spec.title,640,145); }
    const rows=[272,390,515], TX=348, TW=1010-TX;   // 번호 오른쪽 ~ 메모지 안쪽
    (spec.lines||[]).slice(0,3).forEach((ln,i)=>{
      const t=String(ln||''); if(!t.trim())return;
      let pt=32; g.font=bold(pt);
      if(g.measureText(t).width>TW){ pt=Math.max(17,Math.floor(pt*TW/g.measureText(t).width)); }
      g.font=bold(pt); g.fillStyle='#19108A'; g.textAlign='left'; g.textBaseline='middle';
      const lines=wrap(g,t,TW).slice(0,2), lh=pt*1.15;
      lines.forEach((l,li)=>g.fillText(l,TX,rows[i]-(lines.length-1)*lh/2+li*lh));
    });
  }

  /* ══════════ 추가 킷 양식들 ══════════ */
  const UP='#C00000', DOWN='#2F6FD6';
  function cardArea(spec){ const top=(spec.unit||spec.source)?CARD_TOP+40:CARD_TOP+22; return {x:CARD_L+30,y:top,w:CARD_W-60,h:CARD_BOT-top}; }

  // 도넛 / 파이
  function drawDonut(g,spec){
    chartHead(g,spec);
    const items=(spec.items||[]).filter(i=>i&&i.value>0); if(!items.length)return;
    const tot=items.reduce((a,b)=>a+ (+b.value||0),0)||1;
    const A=cardArea(spec), cy=A.y+A.h/2, cx=W/2-90, R0=Math.min(A.h/2-14,150), rIn=spec.type==='pie'?0:R0*0.55;
    let ang=-Math.PI/2;
    items.forEach((it,i)=>{
      const sw=(+it.value/tot)*Math.PI*2, col=it.color||PALETTE[i%PALETTE.length];
      g.beginPath(); g.moveTo(cx,cy); g.arc(cx,cy,R0,ang,ang+sw); g.closePath(); g.fillStyle=col; g.fill();
      const mid=ang+sw/2, lx=cx+Math.cos(mid)*(R0*0.72), ly=cy+Math.sin(mid)*(R0*0.72);
      const pct=Math.round(+it.value/tot*1000)/10;
      if(pct>=6){ g.fillStyle='#fff'; g.font=bold(18); g.textAlign='center'; g.textBaseline='middle'; g.fillText(pct+'%',lx,ly); }
      ang+=sw;
    });
    if(rIn>0){ g.globalCompositeOperation='destination-out'; g.beginPath(); g.arc(cx,cy,rIn,0,7); g.fill(); g.globalCompositeOperation='source-over'; }
    // 범례(오른쪽)
    let ly=cy-items.length*15; const lx=cx+R0+50;
    items.forEach((it,i)=>{ g.fillStyle=it.color||PALETTE[i%PALETTE.length]; rr(g,lx,ly-9,17,17,3); g.fill();
      g.fillStyle='#243043'; g.font=med(17); g.textAlign='left'; g.textBaseline='middle';
      g.fillText(`${it.label}  ${Math.round(+it.value/tot*1000)/10}%`,lx+25,ly); ly+=30; });
  }
  // 막대 + 꺾은선 이중축
  function drawCombo(g,spec){
    chartHead(g,spec);
    const cats=spec.categories||[], bar=(spec.bars||[]).map(Number), ln=(spec.lineValues||[]).map(Number);
    const A=cardArea(spec), base=PLOT_BASE, top=A.y+30, plotH=base-top;
    const bmax=nice(Math.max(1,...bar)), lmax=nice(Math.max(1,...ln));
    g.font=med(13);
    for(let i=0;i<=4;i++){ const y=base-plotH*i/4; g.setLineDash([4,5]); g.strokeStyle='#dfe4ee'; g.beginPath(); g.moveTo(PLOT_X0,y); g.lineTo(PLOT_X1,y); g.stroke(); g.setLineDash([]);
      g.fillStyle=GRAY; g.textAlign='right'; g.textBaseline='middle'; g.fillText(fmt(bmax*i/4),PLOT_X0-8,y);
      if(ln.length){ g.textAlign='left'; g.fillText(fmt(lmax*i/4),PLOT_X1+8,y); } }
    const n=cats.length||1, band=(PLOT_X1-PLOT_X0)/n, bw=Math.min(band*0.45,70);
    cats.forEach((c,i)=>{ const cx=PLOT_X0+band*(i+0.5), k=stagger(spec,i,n);
      if(bar[i]!=null&&k>0){ const h=plotH*bar[i]/bmax*k; g.fillStyle=spec.barColor||'#22B7CB'; rr(g,cx-bw/2,base-h,bw,h,4); g.fill();
        if(k>0.85){ g.fillStyle=INK; g.font=bold(15); g.textAlign='center'; g.textBaseline='alphabetic'; g.fillText(fmt(bar[i]),cx,base-h-7); } }
      g.fillStyle=NAVY; g.font=med(16); g.textAlign='center'; g.textBaseline='top'; g.fillText(c,cx,base+10); });
    if(ln.length){ const b=(spec.build!=null)?Math.max(0,Math.min(1,spec.build)):1; const cut=PLOT_X0+(PLOT_X1-PLOT_X0)*easeOut(b);
      g.save(); g.beginPath(); g.rect(PLOT_X0-8,0,Math.max(0,cut-PLOT_X0+8),H); g.clip();
      g.strokeStyle=spec.lineColor||'#B24A7C'; g.lineWidth=4; g.beginPath();
      ln.forEach((v,i)=>{ const x=PLOT_X0+band*(i+0.5), y=base-plotH*v/lmax; i?g.lineTo(x,y):g.moveTo(x,y); }); g.stroke();
      ln.forEach((v,i)=>{ const x=PLOT_X0+band*(i+0.5), y=base-plotH*v/lmax; g.fillStyle=spec.lineColor||'#B24A7C'; g.beginPath(); g.arc(x,y,5,0,7); g.fill();
        g.fillStyle=INK; g.font=bold(14); g.textAlign='center'; g.textBaseline='alphabetic'; g.fillText(fmt(v),x,y-9); });
      g.restore(); }
    if(spec.barName||spec.lineName) legend(g,[{name:spec.barName||'막대',color:spec.barColor||'#22B7CB'},{name:spec.lineName||'선',color:spec.lineColor||'#B24A7C'}],'bar');
  }
  // 누적 막대
  function drawStacked(g,spec){
    chartHead(g,spec);
    const cats=spec.categories||[], series=spec.series||[], data=spec.data||[];
    const totals=cats.map((_,ci)=>data.reduce((a,d)=>a+(+d[ci]||0),0));
    const vmax=nice(Math.max(1,...totals));
    const A=cardArea(spec), base=PLOT_BASE, top=A.y+34, plotH=base-top;
    const n=cats.length||1, band=(PLOT_X1-PLOT_X0)/n, bw=Math.min(band*0.5,86);
    cats.forEach((c,ci)=>{ const cx=PLOT_X0+band*(ci+0.5), k=stagger(spec,ci,n); let acc=0;
      data.forEach((d,si)=>{ const v=+d[ci]||0, h=plotH*v/vmax*k; if(h<=0)return;
        g.fillStyle=(series[si]&&series[si].color)||PALETTE[si%PALETTE.length];
        g.fillRect(cx-bw/2,base-acc-h,bw,h);
        if(h>22&&k>0.85){ g.fillStyle='#fff'; g.font=bold(14); g.textAlign='center'; g.textBaseline='middle'; g.fillText(fmt(v),cx,base-acc-h/2); }
        acc+=h; });
      if(k>0.85){ g.fillStyle=INK; g.font=bold(16); g.textAlign='center'; g.textBaseline='alphabetic'; g.fillText(fmt(totals[ci]),cx,base-acc-8); }
      g.fillStyle=NAVY; g.font=med(16); g.textAlign='center'; g.textBaseline='top'; g.fillText(c,cx,base+10); });
    if(series.length) legend(g,series,'bar');
  }
  // 시계열 세로막대 (상승 빨강 / 하락 파랑, 0축)
  function drawTrend(g,spec){
    chartHead(g,spec);
    const cats=spec.categories||[], vals=(spec.values||[]).map(Number);
    const mx=Math.max(0,...vals), mn=Math.min(0,...vals), span=nice(Math.max(Math.abs(mx),Math.abs(mn))||1);
    const A=cardArea(spec), top=A.y+26, bot=PLOT_BASE, zero=top+(bot-top)*(span/(span*2));
    g.strokeStyle='#AEB3C0'; g.lineWidth=1.5; g.beginPath(); g.moveTo(PLOT_X0,zero); g.lineTo(PLOT_X1,zero); g.stroke();
    const n=cats.length||1, band=(PLOT_X1-PLOT_X0)/n, bw=Math.min(band*0.5,64);
    cats.forEach((c,i)=>{ const v=vals[i]||0, k=stagger(spec,i,n), cx=PLOT_X0+band*(i+0.5);
      const h=((bot-top)/2)*(Math.abs(v)/span)*k;
      g.fillStyle=v>=0?UP:DOWN;
      if(v>=0) g.fillRect(cx-bw/2,zero-h,bw,h); else g.fillRect(cx-bw/2,zero,bw,h);
      if(k>0.85){ g.fillStyle=v>=0?UP:DOWN; g.font=bold(16); g.textAlign='center';
        g.textBaseline=v>=0?'alphabetic':'top'; g.fillText((v>0?'+':'')+fmt(v)+(spec.suffix||''),cx,v>=0?zero-h-7:zero+h+7); }
      g.fillStyle=NAVY; g.font=med(15); g.textAlign='center'; g.textBaseline='top'; g.fillText(c,cx,bot+12); });
  }
  // 상승·하락 발산형 가로막대
  function drawDiverge(g,spec){
    chartHead(g,spec);
    const items=spec.items||[]; const mxv=Math.max(1,...items.map(i=>Math.abs(+i.value||0)));
    const A=cardArea(spec), mid=W/2, half=(CARD_W-260)/2;
    const rowH=Math.min(52,(A.h)/Math.max(1,items.length)-8); let y=A.y+8;
    g.strokeStyle='#c8d2e4'; g.beginPath(); g.moveTo(mid,A.y); g.lineTo(mid,A.y+A.h-6); g.stroke();
    items.forEach((it,i)=>{ const v=+it.value||0, k=stagger(spec,i,items.length), w=half*Math.abs(v)/mxv*easeOut(k);
      g.fillStyle=v>=0?UP:DOWN;
      if(v>=0) rr(g,mid,y+5,w,rowH-10,4); else rr(g,mid-w,y+5,w,rowH-10,4); g.fill();
      g.fillStyle=NAVY; g.font=bold(17); g.textBaseline='middle';
      g.textAlign=v>=0?'right':'left'; g.fillText(it.label||'',v>=0?mid-10:mid+10,y+rowH/2);
      g.fillStyle=v>=0?UP:DOWN; g.font=bold(16); g.textAlign=v>=0?'left':'right';
      g.fillText((v>0?'+':'')+fmt(v)+(spec.suffix||''),v>=0?mid+w+8:mid-w-8,y+rowH/2);
      y+=rowH+8; });
  }
  // 구분|내용 2열 표
  function drawTable(g,spec){
    chartHead(g,spec);
    const rows=spec.rows||[]; const A=cardArea(spec);
    const LW=spec.labelWidth||300, gap=8;
    const rowH=Math.min(76,(A.h-gap*(rows.length-1))/Math.max(1,rows.length)); let y=A.y;
    rows.forEach((r,i)=>{
      g.fillStyle=i===0&&spec.headerFirst?'#DCE6F6':'#EAF0FA'; rr(g,A.x,y,LW,rowH,7); g.fill();
      g.strokeStyle='#B9C9E6'; g.lineWidth=1; g.stroke();
      g.fillStyle='#1B3A8C'; g.textAlign='center'; g.textBaseline='middle';
      const lp=fit(g,r.label||'',LW-24,20,13,'bold'); g.font=bold(lp); g.fillText(r.label||'',A.x+LW/2,y+rowH/2);
      const RX=A.x+LW+gap, RW=A.x+A.w-RX;
      g.fillStyle='#fff'; rr(g,RX,y,RW,rowH,7); g.fill(); g.strokeStyle='#D7DEEC'; g.stroke();
      g.fillStyle='#1A1A1A'; g.textAlign='left';
      const txt=Array.isArray(r.text)?r.text:[r.text||''];
      let fs=19; g.font=bold(fs);
      const all=txt.join(' '); if(g.measureText(all).width>RW-32){ fs=17; }
      g.font=med(fs); const L=wrap(g,all,RW-32).slice(0,2), lh=fs*1.3;
      L.forEach((ln,li)=>g.fillText(ln,RX+16,y+rowH/2-(L.length-1)*lh/2+li*lh));
      y+=rowH+gap; });
  }
  // 헤드라인 브랜드 라벨 박스
  const BRAND={'메타':'#0668E1','네이버':'#03C75A','삼성':'#1428A0','삼성전자':'#1428A0','SK':'#EA5504','SK하이닉스':'#EA5504','카카오':'#F9E000','구글':'#4285F4','애플':'#555555','테슬라':'#CC0000','아마존':'#FF9900','MS':'#0078D4','엔비디아':'#76B900'};
  function drawBoxList(g,spec){
    skyBG(g); if(spec.title) skyTitle(g,spec.title,[spec.unit?'단위 : '+spec.unit:'',spec.source?'자료 : '+spec.source:''].filter(Boolean).join('   '));
    const items=spec.items||[], n=items.length||1;
    const TOP=TICKER_TOP+40, BOT=TICKER_BOTTOM-10, gap=18;
    const rowH=Math.min(105,(BOT-TOP-gap*(n-1))/n); let y=TOP+((BOT-TOP)-(rowH*n+gap*(n-1)))/2;
    const X0=130, X1=1150, LW=spec.labelWidth||235;
    items.forEach(it=>{
      const col=it.color||BRAND[it.label]||'#0D004E', dark=(col==='#F9E000');
      g.fillStyle=col; rr(g,X0,y,LW,rowH,11); g.fill();
      g.fillStyle=dark?'#111':'#fff'; g.textAlign='center'; g.textBaseline='middle';
      const lp=fit(g,it.label||'',LW-20,23,13,'bold'); g.font=bold(lp); g.fillText(it.label||'',X0+LW/2,y+rowH/2);
      const CX=X0+LW+18;
      g.fillStyle='#fff'; rr(g,CX,y,X1-CX,rowH,11); g.fill();
      g.fillStyle='#1A1A1A'; g.textAlign='left';
      const lines=Array.isArray(it.lines)?it.lines:[it.text||''];
      let fs=21; g.font=med(fs); const L=[]; lines.forEach(l=>L.push(...wrap(g,l,X1-CX-36)));
      const lh=fs*1.32; L.slice(0,3).forEach((ln,li)=>g.fillText(ln,CX+18,y+rowH/2-(Math.min(L.length,3)-1)*lh/2+li*lh));
      y+=rowH+gap; });
  }
  // 기존 → 변경 (셰브론)
  function drawChevron(g,spec){
    chartHead(g,spec);
    const rows=spec.rows||[]; const A=cardArea(spec);
    const rowH=Math.min(80,(A.h-10*(rows.length-1))/Math.max(1,rows.length)); let y=A.y;
    const LW=(A.w-120)/2;
    rows.forEach(r=>{
      g.fillStyle='#EDF1F8'; rr(g,A.x,y,LW,rowH,8); g.fill();
      g.fillStyle='#4A5468'; g.textAlign='center'; g.textBaseline='middle';
      let p=fit(g,r.from||'',LW-24,21,13,'bold'); g.font=bold(p); g.fillText(r.from||'',A.x+LW/2,y+rowH/2);
      const ax=A.x+LW+20, aw=80;
      g.fillStyle='#C00000'; g.beginPath();
      g.moveTo(ax,y+rowH/2-13); g.lineTo(ax+aw-22,y+rowH/2-13); g.lineTo(ax+aw,y+rowH/2);
      g.lineTo(ax+aw-22,y+rowH/2+13); g.lineTo(ax,y+rowH/2+13); g.closePath(); g.fill();
      const RX=ax+aw+20;
      g.fillStyle=NAVY; rr(g,RX,y,LW,rowH,8); g.fill();
      g.fillStyle='#fff'; g.textAlign='center';
      p=fit(g,r.to||'',LW-24,22,13,'bold'); g.font=bold(p); g.fillText(r.to||'',RX+LW/2,y+rowH/2);
      if(r.label){ g.fillStyle=NAVY; g.font=med(14); g.textAlign='left'; g.textBaseline='bottom'; g.fillText(r.label,A.x+4,y-2); }
      y+=rowH+10; });
  }
  // 분류표 (번호 + 분류 | 종목들)
  function drawCategory(g,spec){
    chartHead(g,spec);
    const items=spec.items||spec.groups||[]; const A=cardArea(spec);
    const LW=spec.catWidth||300, gap=7;
    const rows=items.map(it=>({cat:it.cat||it.name||'',cos:(it.items||it.cos||[]).join(', ')}));
    const rowH=Math.min(62,(A.h-gap*(rows.length-1))/Math.max(1,rows.length)); let y=A.y;
    rows.forEach((r,i)=>{
      g.fillStyle='#DCE6F6'; rr(g,A.x,y,LW,rowH,6); g.fill(); g.strokeStyle='#B9C9E6'; g.lineWidth=1; g.stroke();
      g.fillStyle='#1B3A8C'; g.textAlign='left'; g.textBaseline='middle';
      const num=String.fromCharCode(0x2460+Math.min(i,19));
      let p=fit(g,num+' '+r.cat,LW-26,20,12,'bold'); g.font=bold(p); g.fillText(num+' '+r.cat,A.x+14,y+rowH/2);
      const RX=A.x+LW+gap, RW=A.x+A.w-RX;
      g.fillStyle='#fff'; rr(g,RX,y,RW,rowH,6); g.fill(); g.strokeStyle='#D7DEEC'; g.stroke();
      g.fillStyle='#1A1A1A'; let fs=18; g.font=bold(fs);
      if(g.measureText(r.cos).width>RW-30){ fs=16; g.font=bold(fs); }
      const L=wrap(g,r.cos,RW-30).slice(0,2), lh=fs*1.3;
      L.forEach((ln,li)=>g.fillText(ln,RX+15,y+rowH/2-(L.length-1)*lh/2+li*lh));
      y+=rowH+gap; });
  }
  // 일지형 타임라인
  function drawTimeline(g,spec){
    chartHead(g,spec);
    const items=spec.items||[]; const A=cardArea(spec);
    const LX=A.x+250, ACC='#F0A500';
    const n=items.length||1, top=A.y+22, bot=A.y+A.h-16, step=n>1?(bot-top)/(n-1):0;
    if(n>1){ g.strokeStyle=ACC; g.lineWidth=3; g.beginPath(); g.moveTo(LX,top); g.lineTo(LX,bot); g.stroke(); }
    items.forEach((it,i)=>{ const cy=n>1?top+step*i:(top+bot)/2;
      g.fillStyle='#0D2B6B'; g.textAlign='right'; g.textBaseline='middle';
      let p=fit(g,it.date||'',210,19,12,'bold'); g.font=bold(p); g.fillText(it.date||'',LX-22,cy);
      g.beginPath(); g.arc(LX,cy,7,0,7); g.fillStyle=ACC; g.fill(); g.strokeStyle='#fff'; g.lineWidth=2; g.stroke();
      g.fillStyle='#222'; g.font=med(18); g.textAlign='left';
      const L=wrap(g,it.text||'',A.x+A.w-(LX+28)).slice(0,2), lh=23;
      L.forEach((ln,li)=>g.fillText(ln,LX+28,cy-(L.length-1)*lh/2+li*lh)); });
  }
  // 단계 흐름 (화살표)
  function drawStepFlow(g,spec){
    skyBG(g); if(spec.title) skyTitle(g,spec.title,spec.source?'자료 : '+spec.source:'');
    const steps=spec.steps||[]; const n=steps.length||1;
    const X0=110, X1=W-110, gap=54, bw=(X1-X0-gap*(n-1))/n;
    const cy=(TICKER_TOP+TICKER_BOTTOM)/2, bh=Math.min(230,TICKER_BOTTOM-TICKER_TOP-90);
    steps.forEach((s,i)=>{ const x=X0+i*(bw+gap);
      g.fillStyle='rgba(255,255,255,.97)'; rr(g,x,cy-bh/2,bw,bh,14); g.fill();
      g.fillStyle=NAVY; rr(g,x,cy-bh/2,bw,52,14); g.fill(); g.fillRect(x,cy-bh/2+40,bw,12);
      g.fillStyle='#fff'; g.textAlign='center'; g.textBaseline='middle';
      let p=fit(g,s.title||s.name||'',bw-20,22,13,'bold'); g.font=bold(p); g.fillText(s.title||s.name||'',x+bw/2,cy-bh/2+26);
      g.fillStyle='#243043'; g.font=med(17); g.textBaseline='top';
      const L=wrap(g,s.desc||s.text||'',bw-28).slice(0,4), lh=24;
      L.forEach((ln,li)=>g.fillText(ln,x+bw/2,cy-bh/2+74+li*lh));
      if(i<n-1){ const ax=x+bw+8, aw=gap-16;
        g.fillStyle='#C00000'; g.beginPath();
        g.moveTo(ax,cy-11); g.lineTo(ax+aw-14,cy-11); g.lineTo(ax+aw,cy); g.lineTo(ax+aw-14,cy+11); g.lineTo(ax,cy+11); g.closePath(); g.fill(); } });
  }
  // 주제 통CG (다크 배경 2줄)
  function drawTopicCard(g,spec){
    const gr=g.createLinearGradient(0,0,W,H); gr.addColorStop(0,'#0A1430'); gr.addColorStop(1,'#122A5C');
    g.fillStyle=gr; g.fillRect(0,0,W,H);
    g.strokeStyle='rgba(255,255,255,.12)'; g.lineWidth=2;
    for(let i=-2;i<8;i++){ g.beginPath(); g.moveTo(i*220,0); g.lineTo(i*220+300,H); g.stroke(); }
    const lines=(spec.lines&&spec.lines.length?spec.lines:[spec.title||'',spec.subtitle||'']).filter(Boolean).slice(0,2);
    const cy=(TICKER_TOP+TICKER_BOTTOM)/2, lh=96;
    g.textAlign='center'; g.textBaseline='middle';
    lines.forEach((ln,i)=>{ const p=fit(g,ln,W-200,64,28,'bold'); g.font=bold(p);
      g.fillStyle=i===1?'#FFD166':'#fff'; g.fillText(ln,W/2,cy-(lines.length-1)*lh/2+i*lh); });
  }
  // 인물 말자막 (사진 없으면 실루엣 자리)
  function drawPersonQuote(g,spec){
    skyBG(g);
    const PX=250, PY=(TICKER_TOP+TICKER_BOTTOM)/2;
    g.fillStyle='rgba(13,0,78,.14)'; g.beginPath(); g.arc(PX,PY,150,0,7); g.fill();
    g.fillStyle='rgba(13,0,78,.3)'; g.beginPath(); g.arc(PX,PY-45,58,0,7); g.fill();
    g.beginPath(); g.ellipse(PX,PY+95,92,70,0,Math.PI,0); g.fill();
    const BX=430, BW=W-BX-90;
    g.fillStyle='#cfe0f5'; g.font=bold(96); g.textAlign='left'; g.textBaseline='top'; g.fillText('“',BX-14,TICKER_TOP+6);
    g.fillStyle=NAVY; g.textAlign='left'; g.textBaseline='middle';
    const fp=fit(g,spec.quote||'',BW,36,20,'bold'); g.font=bold(fp);
    const L=wrap(g,spec.quote||'',BW).slice(0,4), lh=fp*1.35, cy=PY-20;
    L.forEach((ln,i)=>g.fillText(ln,BX,cy-(L.length-1)*lh/2+i*lh));
    if(spec.who){ g.fillStyle='#2F6FD6'; g.font=med(24); g.fillText('— '+spec.who,BX,TICKER_BOTTOM-52); }
  }
  // 주간 일정 달력
  function drawWeek(g,spec){
    skyBG(g); if(spec.title) skyTitle(g,spec.title,spec.source?'자료 : '+spec.source:'');
    const days=spec.days||[]; const n=Math.max(1,days.length);
    const X0=90, X1=W-90, gap=12, cw=(X1-X0-gap*(n-1))/n;
    const top=TICKER_TOP+50, h=TICKER_BOTTOM-top-14;
    days.forEach((d,i)=>{ const x=X0+i*(cw+gap);
      g.fillStyle='rgba(255,255,255,.97)'; rr(g,x,top,cw,h,12); g.fill();
      g.fillStyle=NAVY; rr(g,x,top,cw,48,12); g.fill(); g.fillRect(x,top+36,cw,12);
      g.fillStyle='#fff'; g.textAlign='center'; g.textBaseline='middle';
      const p=fit(g,d.label||d.date||'',cw-16,20,12,'bold'); g.font=bold(p); g.fillText(d.label||d.date||'',x+cw/2,top+24);
      g.fillStyle='#243043'; g.font=med(16); g.textBaseline='top';
      let y=top+64; (d.items||[]).slice(0,6).forEach(t=>{ const L=wrap(g,'· '+t,cw-24).slice(0,2);
        L.forEach(ln=>{ g.fillText(ln,x+cw/2,y); y+=22; }); y+=6; }); });
  }
  // 이미지 카드 (붙여넣은 이미지 + 제목)
  function drawImageCard(g,spec){
    chartHead(g,spec);
    const A=cardArea(spec), im=spec._img;
    if(im&&im.width){ const s=Math.min(A.w/im.width,A.h/im.height); const dw=im.width*s, dh=im.height*s;
      g.drawImage(im,A.x+(A.w-dw)/2,A.y+(A.h-dh)/2,dw,dh); }
    else { g.fillStyle='#8fa3c4'; g.font=med(20); g.textAlign='center'; g.textBaseline='middle'; g.fillText('이미지를 붙여넣으면 여기에 들어갑니다',W/2,A.y+A.h/2); }
  }
  // 인물/대상 대치 비교 (VS)
  function drawVs(g,spec){
    skyBG(g); if(spec.title) skyTitle(g,spec.title,spec.source?'자료 : '+spec.source:'');
    const L=spec.left||{}, R2=spec.right||{};
    const top=TICKER_TOP+50, h=TICKER_BOTTOM-top-16, cw=(W-260)/2;
    [[110,L,'#0D2B6B'],[W-110-cw,R2,'#B24A7C']].forEach(([x,side,col])=>{
      g.fillStyle='rgba(255,255,255,.97)'; rr(g,x,top,cw,h,14); g.fill();
      g.fillStyle=col; rr(g,x,top,cw,56,14); g.fill(); g.fillRect(x,top+44,cw,12);
      g.fillStyle='#fff'; g.textAlign='center'; g.textBaseline='middle';
      const p=fit(g,side.name||'',cw-24,26,14,'bold'); g.font=bold(p); g.fillText(side.name||'',x+cw/2,top+28);
      g.fillStyle='#243043'; g.font=med(19); g.textBaseline='top';
      let y=top+80; (side.items||[]).slice(0,7).forEach(t=>{ wrap(g,'· '+t,cw-30).slice(0,2).forEach(ln=>{ g.fillText(ln,x+cw/2,y); y+=27; }); y+=6; });
    });
    g.fillStyle='#C00000'; g.beginPath(); g.arc(W/2,top+h/2,44,0,7); g.fill();
    g.fillStyle='#fff'; g.font=bold(30); g.textAlign='center'; g.textBaseline='middle'; g.fillText('VS',W/2,top+h/2);
  }

  const R={ bars:drawBars, line:drawLine, rank_bars:drawRank, theme_grid:drawGrid, quote:drawQuote, topic_line:drawTopicLine,
            indicator:drawIndicator, three_line:drawThreeLine, chart_frame:drawFrame,
            donut:drawDonut, pie:drawDonut, combo:drawCombo, stacked_bar:drawStacked, trend_bar:drawTrend,
            diverge_bar:drawDiverge, table_card:drawTable, box_list:drawBoxList, chevron:drawChevron,
            category_list:drawCategory, timeline:drawTimeline, step_flow:drawStepFlow, topic_card:drawTopicCard,
            person_quote:drawPersonQuote, week_card:drawWeek, image_card:drawImageCard, vs_card:drawVs };
  // 출력 해상도: 방송 규격 1920×1080 (좌표 계산은 1280×720 기준 그대로 두고 배율만 적용)
  window.KIT_SCALE = 1.5;
  window.renderKitCG=async function(spec,opts){
    await bgReady; await ensureFonts();
    const sc=(opts&&opts.scale)||window.KIT_SCALE||1;
    const c=document.createElement('canvas'); c.width=Math.round(W*sc); c.height=Math.round(H*sc);
    const g=c.getContext('2d'); g.scale(sc,sc);
    const fn=R[spec&&spec.type]||drawFrame;
    try{ fn(g,spec||{}); }catch(e){ skyBG(g); g.fillStyle=NAVY; g.font=bold(28); g.textAlign='center'; g.textBaseline='middle'; g.fillText('CG 렌더 오류: '+e.message,W/2,H/2); }
    return c.toDataURL('image/png');
  };
  window.KIT_TYPES=Object.keys(R);

  /* ══════════ 붙여넣은 텍스트 → 양식 자동 판단 + 스펙 생성 ══════════ */
  const num=s=>parseFloat(String(s).replace(/[^0-9.\-]/g,''));
  const hasNum=s=>/-?[\d,]+(\.\d+)?/.test(s);
  const cells=s=>s.split(/[,\t]/).map(x=>x.trim()).filter(x=>x!=='');
  // 지표 항목 인식: 콜론이 없어도, 실무 약칭(필반·브렌트·원달러 등)도 잡는다
  const IND_MATCH=[
    ['brent', /브렌트/i],
    ['wti',   /\bwti\b|서부\s*텍사스|서부텍사스/i],
    ['night', /야간|야선|선물/],
    ['sox',   /필반|필라|반도체|\bsox\b/i],
    ['fx',    /환율|원\s*[·\/-]?\s*달러|원달러/],
    ['ust',   /10\s*년|국채|금리/],
    ['ewy',   /\bewy\b|\betf\b|msci|한국\s*etf/i],
  ];
  function parseIndicator(lines){
    const values={}, subs={}; let n=0;
    lines.forEach(raw=>{
      let l=String(raw).trim(); if(!l)return;
      const hit=IND_MATCH.find(([,re])=>re.test(l)); if(!hit)return;
      const key=hit[0]; if(values[key]!=null)return;
      // 항목명을 떼고 값만 남긴다. 콜론이 있으면 콜론 뒤, 없으면 키워드 뒤부터.
      let v;
      if(/[:：]/.test(l)) v=l.replace(/^[^:：]*[:：]\s*/,'');
      else { const m=hit[1].exec(l); v=m?l.slice(m.index+m[0].length):l; }
      // "10년물 4.68%"의 '물'처럼 남은 라벨 조각 제거 → 숫자·부호·통화기호부터가 값
      v=v.replace(/^[^\d$₩+\-]*/,'').trim();
      if(!v){ const m2=/([$₩+\-]?[\d][\d,.]*.*)$/.exec(l); v=m2?m2[1].trim():l.trim(); }
      // 뒤에 붙은 괄호 변동치를 작은 글씨로 분리 (공백 있든 없든)
      const p=/^(.*?)\s*(\([^)]*\))\s*$/.exec(v);
      if(p && /\d/.test(p[1]) && /원|pt|포인트/.test(p[2])){ values[key]=p[1].trim(); subs[key]=p[2]; }
      else values[key]=v;
      n++;
    });
    return {values,subs,count:n};
  }
  window.kitAuto = function(raw, forceType){
    const all=String(raw||'').split('\n').map(s=>s.trim()).filter(Boolean);
    const meta={}; const body=[];
    all.forEach(l=>{
      const m=/^(제목|타이틀|단위|출처|자료)\s*[:：]\s*(.+)$/.exec(l);
      if(m){ const k=m[1], v=m[2].trim();
        if(k==='제목'||k==='타이틀')meta.title=v; else if(k==='단위')meta.unit=v; else meta.source=v; }
      else body.push(l);
    });
    const txt=body.join('\n');
    const colonLines=body.filter(l=>/[:：]/.test(l));
    const kv=colonLines.map(l=>{ const i=l.search(/[:：]/); return {k:l.slice(0,i).trim(), v:l.slice(i+1).trim()}; });
    let type=forceType;
    if(!type){
      const indProbe=parseIndicator(body);   // 콜론 없이 "WTI $77.29(+2.75%)" 형태도 인식
      // 날짜로 시작하는 줄이 2개 이상이면 일지형(3줄 요약보다 먼저 판단해야 함)
      const dateLines=body.filter(l=>/^\s*\d{1,2}\s*[\/\.월]\s*\d{1,2}|^\s*\d{1,2}\/\d{1,2}|\(\s*[월화수목금토일]\s*\)/.test(l)).length;
      if(indProbe.count>=3) type='indicator';
      else if(dateLines>=2 && body.length>=2) type='timeline';
      else if(/→|->/.test(txt)) type='chevron';
      else if(/[""“”]/.test(txt) && body.length<=3) type='person_quote';
      else if(/(vs|VS|대\s*결|맞대결)/.test(txt) && kv.length>=2) type='vs_card';
      else if(/^[\s]*[1１]\s*[).]/m.test(txt) || (body.length===3 && body.every(l=>!/[,\t]/.test(l) && l.length>8))) type='three_line';
      else if(kv.length>=2 && kv.every(x=>!hasNum(x.v)||/[,、]/.test(x.v)) && kv.some(x=>/[,、]/.test(x.v))) type='category_list';
      else if(body.length>=2 && body.every(l=>cells(l).length===2 && hasNum(cells(l)[1]))) type='rank_bars';
      else if(body.length>=2 && cells(body[0]).length>=1 && body.slice(1).every(l=>cells(l).length>=2 && hasNum(cells(l)[1]))){
        type=/추이|흐름|월|분기|연도|년/.test(txt)&&body.length>4?'line':'bars';
      }
      else if(body.length===1 && cells(body[0]).length>=3) type='topic_line';
      else if(kv.length>=2) type='table_card';
      else type='chart_frame';
    }
    const base={type,...meta};
    const T=(d)=>base.title||d;
    switch(type){
      case 'indicator':{
        const r=parseIndicator(body);
        return {...base,title:meta.title||'',values:r.values,subs:r.subs};
      }
      case 'three_line': return {...base,title:meta.title||'',lines:body.map(l=>l.replace(/^\s*[1-3１-３]\s*[).]\s*/,'')).slice(0,3)};
      case 'person_quote': case 'quote':
        return {...base,title:T(''),quote:(body[0]||'').replace(/[""“”]/g,''),who:body[1]||''};
      case 'rank_bars': return {...base,title:T('순위'),ranks:body.map(l=>{const c=cells(l);return{label:c[0],value:num(c[1])||0};})};
      case 'bars': case 'line': {
        const names=cells(body[0]).filter(x=>!hasNum(x));
        const rows=body.slice(names.length?1:0);
        const series=names.length?names:['값'];
        const cats=[], data=series.map(()=>[]);
        rows.forEach(l=>{ const c=cells(l); if(c.length<2)return; cats.push(c[0]); series.forEach((_,i)=>data[i].push(num(c[i+1])||0)); });
        return {...base,title:T('추이'),categories:cats,series:series.map(n=>({name:series.length>1?n:''})),data};
      }
      case 'category_list': return {...base,title:T('관련주 총정리'),items:kv.map(x=>({cat:x.k,items:cells(x.v)}))};
      case 'theme_grid': return {...base,title:T('관련주 총정리'),groups:kv.map(x=>({cat:x.k,items:cells(x.v)}))};
      case 'timeline': return {...base,title:T('주요 일정'),items:body.map(l=>{ const m=/^(\S+)\s+(.*)$/.exec(l); return m?{date:m[1],text:m[2]}:{date:'',text:l}; })};
      case 'chevron': return {...base,title:T('변경 사항'),rows:body.map(l=>{ const p=l.split(/→|->/); return {from:(p[0]||'').trim(),to:(p[1]||'').trim()}; })};
      case 'vs_card': {
        const half=Math.ceil(kv.length/2);
        return {...base,title:T('비교'),left:{name:kv[0]?kv[0].k:'',items:kv.slice(0,half).map(x=>x.v)},right:{name:kv[half]?kv[half].k:'',items:kv.slice(half).map(x=>x.v)}};
      }
      case 'table_card': return {...base,title:T('정리'),rows:kv.map(x=>({label:x.k,text:x.v}))};
      case 'box_list': return {...base,title:T('헤드라인'),items:kv.map(x=>({label:x.k,text:x.v}))};
      case 'topic_line': { const st=cells(body[0]||''); return {...base,title:T('오늘의 토크 흐름'),stations:st,active:0}; }
      case 'step_flow': return {...base,title:T('단계'),steps:kv.map(x=>({title:x.k,desc:x.v}))};
      case 'week_card': return {...base,title:T('주간 일정'),days:kv.map(x=>({label:x.k,items:cells(x.v)}))};
      case 'topic_card': return {...base,lines:body.slice(0,2)};
      case 'donut': case 'pie': return {...base,title:T('비중'),items:body.map(l=>{const c=cells(l);return{label:c[0],value:num(c[1])||0};})};
      case 'trend_bar': return {...base,title:T('추이'),categories:body.map(l=>cells(l)[0]),values:body.map(l=>num(cells(l)[1])||0)};
      case 'diverge_bar': return {...base,title:T('상승·하락'),items:body.map(l=>{const c=cells(l);return{label:c[0],value:num(c[1])||0};})};
      case 'stacked_bar': {
        const names=cells(body[0]).filter(x=>!hasNum(x)); const rows=body.slice(1);
        const cats=[], data=names.map(()=>[]);
        rows.forEach(l=>{const c=cells(l); cats.push(c[0]); names.forEach((_,i)=>data[i].push(num(c[i+1])||0));});
        return {...base,title:T('구성'),categories:cats,series:names.map(n=>({name:n})),data};
      }
      case 'combo': {
        const rows=body.slice(1);
        return {...base,title:T('추이'),categories:rows.map(l=>cells(l)[0]),
          bars:rows.map(l=>num(cells(l)[1])||0), lineValues:rows.map(l=>num(cells(l)[2])||0),
          barName:cells(body[0])[0]||'막대', lineName:cells(body[0])[1]||'선'};
      }
      default: return {...base,title:T('요약'),bullets:body};
    }
  };

  // 요소 모션 재생: 막대 자라기 / 선 그려지기 / 순위 순차 등장. 1회 재생 후 완성 상태로 고정.
  window.playBuild = async function(imgEl, spec, opts){
    opts=opts||{};
    const finalSrc=await window.renderKitCG({...spec, build:undefined});   // 최종=1920×1080
    if(!/^(bars|line|rank_bars)$/.test(spec&&spec.type||'')){ imgEl.src=finalSrc; return ()=>{}; }
    const dur=opts.dur||1600, steps=opts.steps||18, frames=[];
    for(let k=0;k<=steps;k++) frames.push(await window.renderKitCG({...spec, build:k/steps},{scale:1}));
    let i=0, stop=false;
    const tick=()=>{ if(stop)return; if(i>=frames.length){ imgEl.src=finalSrc; return; } imgEl.src=frames[i++]; setTimeout(tick,dur/steps); };
    tick();
    return ()=>{ stop=true; };
  };
  // CG 종류에 맞는 모션을 알아서 골라 재생
  window.playKitMotion = function(imgEl, spec, opts){
    if(!spec) return Promise.resolve(()=>{});
    if(spec.type==='topic_line') return window.playTopicLine(imgEl,spec,opts);
    if(/^(bars|line|rank_bars)$/.test(spec.type)) return window.playBuild(imgEl,spec,opts);
    return window.renderKitCG(spec).then(src=>{ imgEl.src=src; return ()=>{}; });
  };

  // 도착 애니메이션(정본 PPT와 동일): 이전 역 → 현재 역까지 2초 가감속으로 1회 재생 후 정지.
  // 선은 열차 뒤로 채워지고, 끝나면 현재 역 상태로 고정. 정지 함수 반환.
  window.playTopicLine = async function(imgEl, spec, opts){
    opts=opts||{};
    const st=(spec.stations||spec.items||[]); const n=st.length;
    const active=Math.max(0,Math.min(n-1, spec.active!=null?spec.active:0));
    const finalSrc=await window.renderKitCG({...spec, progress:active});   // 최종=1920×1080
    if(n<2||active<1){ imgEl.src=finalSrc; return ()=>{}; }
    const from=active-1, dur=opts.dur||2000, steps=opts.steps||16;
    const ease=t=>t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;             // accel 50% / decel 50%
    const frames=[];
    for(let k=0;k<=steps;k++){ const p=from+(active-from)*ease(k/steps); frames.push(await window.renderKitCG({...spec, progress:p},{scale:1})); }
    let idx=0, stop=false;
    const tick=()=>{ if(stop)return; if(idx>=frames.length){ imgEl.src=finalSrc; return; } imgEl.src=frames[idx++]; setTimeout(tick, dur/steps); };
    tick();
    return ()=>{ stop=true; };
  };
})();
