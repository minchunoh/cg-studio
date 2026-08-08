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

  const R={ bars:drawBars, line:drawLine, rank_bars:drawRank, theme_grid:drawGrid, quote:drawQuote, topic_line:drawTopicLine,
            indicator:drawIndicator, three_line:drawThreeLine, chart_frame:drawFrame };
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
