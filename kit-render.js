/* ============================================================
   kit-render.js — 방송 CG 킷 렌더러 (브라우저 캔버스판)
   KIT_RULES.md 규칙을 캔버스로 구현:
   · 화면 1280×720 (16:9, 96px/in 환산: render_cg.js 좌표와 동일 스케일)
   · 티커 안전지대: 콘텐츠 y ∈ [TICKER_TOP, TICKER_BOTTOM]
   · 차트류(bars/line/rank/table/timeline)는 남색 헤더 + 흰 카드 (chartSlide)
   · 비차트류(theme_grid/quote/indicator)는 하늘색 배경 (sky)
   · 서체 G마켓 산스, 가운데 정렬 기본, 자동 빨강 금지(강조는 emphasize 필드로만)
   window.renderKitCG(spec) -> Promise<dataURL(png)>
   ============================================================ */
(function(){
  const W=1280, H=720;
  const NAVY='#0D004E', NAVY_HDR='#12106E', RED='#C00000', BLUE='#2F6FD6', SKY='#DAE3F3', INK='#111111', GRAY='#5b6577';
  // 티커 안전지대 (render_cg.js: TICKER.TOP 1.66", BOTTOM 6.42" → px)
  const TICKER_TOP = Math.round(1.66*96);   // 159
  const TICKER_BOTTOM = Math.round(6.42*96); // 616
  const FB='"Gmarket Sans","Malgun Gothic",sans-serif';
  const bold =(px)=>`700 ${px}px ${FB}`;
  const med  =(px)=>`500 ${px}px ${FB}`;
  const light=(px)=>`300 ${px}px ${FB}`;

  function ensureFonts(){
    if(!document.fonts||!document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('700 40px "Gmarket Sans"'),
      document.fonts.load('500 24px "Gmarket Sans"'),
      document.fonts.load('300 20px "Gmarket Sans"')
    ]).catch(()=>{});
  }
  function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
  function fitFont(g,text,maxW,startPx,minPx,weight){ let px=startPx; do{ g.font=weight==='med'?med(px):bold(px); if(g.measureText(text).width<=maxW)break; px-=1; }while(px>minPx); return px; }
  function wrapLines(g,text,maxW){ const words=String(text||'').split(/\s+/); const lines=[]; let line=''; for(const w of words){ const t=line?line+' '+w:w; if(g.measureText(t).width>maxW && line){lines.push(line);line=w;} else line=t; } if(line)lines.push(line); return lines; }
  function nice(max){ if(max<=0)return 1; const p=Math.pow(10,Math.floor(Math.log10(max))); const n=max/p; const s=n<=1?1:n<=2?2:n<=5?5:10; return s*p; }
  function fmt(v){ const a=Math.abs(v); if(a>=1e8)return (v/1e8).toLocaleString(undefined,{maximumFractionDigits:1})+'억'; if(a>=1e4&&Number.isInteger(v))return v.toLocaleString(); return (Math.round(v*100)/100).toLocaleString(); }

  // ── 공통: 하늘색 배경 (sky형) ──
  function skyBg(g){ const grd=g.createLinearGradient(0,0,W,H); grd.addColorStop(0,'#a9c8f2'); grd.addColorStop(1,'#5f8fd6'); g.fillStyle=grd; g.fillRect(0,0,W,H); }
  // ── 공통: 남색 헤더 + 흰 카드 (chart형) ── 카드 영역 반환
  function chartFrame(g,title,unit,source){
    const grd=g.createLinearGradient(0,0,W,H); grd.addColorStop(0,'#c3d4ec'); grd.addColorStop(1,'#93b1da'); g.fillStyle=grd; g.fillRect(0,0,W,H);
    const CX=137, CW=W-2*137;                 // 카드 좌우 (render_cg CARD_X≈137px)
    const hdrY=TICKER_TOP+6, hdrH=74;
    g.fillStyle=NAVY; rr(g,CX,hdrY,CW,hdrH,10); g.fill();
    g.textAlign='center'; g.textBaseline='middle'; g.fillStyle='#fff';
    const fp=fitFont(g,title,CW-80,40,26,'bold'); g.font=bold(fp);
    g.fillText(title,W/2,hdrY+hdrH/2);
    const cardY=hdrY+hdrH+8, cardBottom=TICKER_BOTTOM-6, cardH=cardBottom-cardY;
    g.fillStyle='rgba(255,255,255,.97)'; rr(g,CX,cardY,CW,cardH,14); g.fill();
    // 단위(좌) · 출처(우)
    g.textBaseline='alphabetic'; g.font=med(17);
    if(unit){ g.textAlign='left'; g.fillStyle=GRAY; g.fillText('단위 : '+unit, CX+22, cardY+30); }
    if(source){ g.textAlign='right'; g.fillStyle=GRAY; g.fillText('자료 : '+source, CX+CW-22, cardY+30); }
    return {x:CX+34, y:cardY+ (unit||source?46:24), w:CW-68, h:cardH-(unit||source?66:44), cardY, cardH, CX, CW, cardBottom};
  }
  function skyTitle(g,title,unit,source){
    g.textAlign='center'; g.textBaseline='middle';
    const fp=fitFont(g,title,W-160,42,28,'bold'); g.font=bold(fp);
    g.lineJoin='round'; g.strokeStyle='#fff'; g.lineWidth=6; g.strokeText(title,W/2,TICKER_TOP+30);
    g.fillStyle=INK; g.fillText(title,W/2,TICKER_TOP+30);
    if(unit||source){ g.font=med(16); g.fillStyle='#26304a';
      const s=[unit?'단위 : '+unit:'',source?'자료 : '+source:''].filter(Boolean).join('   ');
      g.fillText(s, W/2, TICKER_TOP+66); }
  }

  const PALETTE=['#22B7CB','#B24A7C','#2F6FD6','#F0A500','#5AA0A0','#8E7CC3'];

  // ── bars: 세로 막대(단일/그룹) ──
  function drawBars(g,spec){
    const R=chartFrame(g,spec.title,spec.unit,spec.source);
    const cats=spec.categories||[]; const series=spec.series&&spec.series.length?spec.series:[{name:''}];
    const data=spec.data||[]; // data[s][c]
    const all=data.flat().filter(v=>typeof v==='number'); const vmax=nice(Math.max(1,...all));
    const plotX=R.x+46, plotW=R.w-56, base=R.cardBottom-64, top=R.cardY+ (spec.unit||spec.source?58:34), plotH=base-top;
    // y축 + 그리드
    g.textAlign='right'; g.textBaseline='middle'; g.font=med(14); g.strokeStyle='#e3e8f0';
    for(let i=0;i<=4;i++){ const v=vmax*i/4, y=base-plotH*i/4; g.beginPath(); g.setLineDash([4,4]); g.strokeStyle='#dfe4ee'; g.moveTo(plotX,y); g.lineTo(plotX+plotW,y); g.stroke(); g.setLineDash([]); g.fillStyle=GRAY; g.fillText(fmt(v),plotX-8,y); }
    const nC=cats.length||1, band=plotW/nC, nS=series.length, gp=Math.min(0.22*band, 14), bw=Math.min((band-gp*2)/nS-6, 78);
    cats.forEach((cat,ci)=>{
      const bx0=plotX+band*ci+(band-(bw*nS+6*(nS-1)))/2;
      for(let si=0;si<nS;si++){ const v=(data[si]&&data[si][ci])||0; const h=plotH*v/vmax; const x=bx0+si*(bw+6);
        g.fillStyle=(spec.series[si]&&spec.series[si].color)||PALETTE[si%PALETTE.length]; rr(g,x,base-h,bw,h,4); g.fill();
        g.fillStyle=INK; g.font=bold(16); g.textAlign='center'; g.textBaseline='alphabetic'; g.fillText(fmt(v),x+bw/2,base-h-8); }
      g.fillStyle=NAVY; g.font=med(17); g.textAlign='center'; g.textBaseline='top'; g.fillText(cat,plotX+band*ci+band/2,base+10);
    });
    if(nS>1||spec.series[0].name) legend(g,R,series);
  }
  // ── line: 꺾은선 ──
  function drawLine(g,spec){
    const R=chartFrame(g,spec.title,spec.unit,spec.source);
    const cats=spec.categories||[]; const series=spec.series&&spec.series.length?spec.series:[{name:''}]; const data=spec.data||[];
    const all=data.flat().filter(v=>typeof v==='number'); const vmin=Math.min(0,...all), vmax=nice(Math.max(1,...all));
    const plotX=R.x+46, plotW=R.w-56, base=R.cardBottom-64, top=R.cardY+(spec.unit||spec.source?58:34), plotH=base-top;
    g.font=med(14); for(let i=0;i<=4;i++){ const v=vmax*i/4, y=base-plotH*i/4; g.setLineDash([4,4]); g.strokeStyle='#dfe4ee'; g.beginPath(); g.moveTo(plotX,y); g.lineTo(plotX+plotW,y); g.stroke(); g.setLineDash([]); g.fillStyle=GRAY; g.textAlign='right'; g.textBaseline='middle'; g.fillText(fmt(v),plotX-8,y); }
    const nC=cats.length||1, step=nC>1?plotW/(nC-1):0;
    series.forEach((s,si)=>{ const col=s.color||PALETTE[si%PALETTE.length]; g.strokeStyle=col; g.lineWidth=4; g.beginPath();
      (data[si]||[]).forEach((v,ci)=>{ const x=plotX+step*ci, y=base-plotH*(v-0)/vmax; if(ci===0)g.moveTo(x,y); else g.lineTo(x,y); });
      g.stroke();
      (data[si]||[]).forEach((v,ci)=>{ const x=plotX+step*ci, y=base-plotH*v/vmax; g.fillStyle=col; g.beginPath(); g.arc(x,y,5,0,7); g.fill(); g.fillStyle=INK; g.font=bold(15); g.textAlign='center'; g.textBaseline='alphabetic'; g.fillText(fmt(v),x,y-10); });
    });
    g.fillStyle=NAVY; g.font=med(16); g.textAlign='center'; g.textBaseline='top';
    cats.forEach((c,ci)=>g.fillText(c,plotX+step*ci,base+10));
    if(series.length>1||series[0].name) legend(g,R,series,'line');
  }
  function legend(g,R,series,kind){
    const items=series.filter(s=>s.name); if(!items.length)return;
    g.font=med(16); let tot=0; items.forEach(s=>tot+=g.measureText(s.name).width+40); let lx=W/2-tot/2; const ly=R.cardY+ (R.unit?54:30);
    const y=R.cardY+30;
    items.forEach((s,i)=>{ const col=s.color||PALETTE[i%PALETTE.length]; g.fillStyle=col;
      if(kind==='line'){ g.fillRect(lx, y-2, 22,4); } else { rr(g,lx,y-9,16,16,3); g.fill(); }
      g.fillStyle='#26304a'; g.textAlign='left'; g.textBaseline='middle'; g.fillText(s.name,lx+26,y); lx+=g.measureText(s.name).width+40; });
  }

  // ── rank_bars: 가로 순위 막대 (빨강) ──
  function drawRank(g,spec){
    const R=chartFrame(g,spec.title,spec.unit,spec.source);
    const ranks=(spec.ranks||[]).slice(0,7); const vmax=Math.max(1,...ranks.map(r=>r.value||0));
    const rowH=Math.min(58,(R.h-10)/Math.max(1,ranks.length)-10), gap=10;
    const nameW=190, x0=R.x+nameW+16, barMax=R.w-nameW-120;
    let y=R.y+6;
    ranks.forEach((r,i)=>{
      g.fillStyle=i===0?RED:NAVY; g.beginPath(); g.arc(R.x+18,y+rowH/2,15,0,7); g.fill();
      g.fillStyle='#fff'; g.font=bold(17); g.textAlign='center'; g.textBaseline='middle'; g.fillText(String(i+1),R.x+18,y+rowH/2);
      g.fillStyle=NAVY; g.font=bold(19); g.textAlign='left'; g.fillText(r.label||'',R.x+40,y+rowH/2);
      const bw=barMax*(r.value||0)/vmax; g.fillStyle=i===0?RED:'#2F6FD6'; rr(g,x0,y+6,Math.max(bw,4),rowH-12,5); g.fill();
      g.fillStyle='#fff'; g.font=bold(17); g.textAlign='right'; g.fillText(fmt(r.value)+(spec.suffix||''),x0+bw-10,y+rowH/2);
      y+=rowH+gap;
    });
  }

  // ── theme_grid: 박스 그리드 (sky형, 가운데 정렬, 번호 없음) ──
  function drawGrid(g,spec){
    skyBg(g); skyTitle(g,spec.title,spec.unit,spec.source);
    // cards: [{name,desc}] 또는 groups:[{cat,items:[...]}]
    let cards=[];
    if(spec.groups&&spec.groups.length){ cards=spec.groups.map(gp=>({name:gp.cat, desc:(gp.items||[]).join(' · ')})); }
    else cards=(spec.cards||[]).map(c=>({name:c.name,desc:c.desc||''}));
    const n=cards.length||1;
    // 열 수 자동: 목록형(설명 길면) 2줄 우선
    let cols = spec.cols || (n<=3?n : n<=8?Math.ceil(n/2) : Math.ceil(n/2));
    cols=Math.min(cols, 5, n);
    const rows=Math.ceil(n/cols);
    const areaX=90, areaW=W-180, areaTop=TICKER_TOP+80, areaBot=TICKER_BOTTOM-10, areaH=areaBot-areaTop;
    const cgap=18, rgap=16;
    const cardW=(areaW-cgap*(cols-1))/cols, cardH=(areaH-rgap*(rows-1))/rows;
    cards.forEach((c,i)=>{
      const r=Math.floor(i/cols), cIdx=i%cols;
      const inRow=(r===rows-1 && n%cols!==0)?(n%cols):cols;
      const rowOff=(cols-inRow)/2*(cardW+cgap);
      const x=areaX+rowOff+cIdx*(cardW+cgap), y=areaTop+r*(cardH+rgap);
      g.fillStyle='rgba(255,255,255,.96)'; rr(g,x,y,cardW,cardH,12); g.fill();
      g.strokeStyle='rgba(13,0,78,.12)'; g.lineWidth=1.5; g.stroke();
      // 상단 남색 띠 (종목명)
      const hH=Math.max(34,Math.min(56,cardH*0.4));
      g.fillStyle=NAVY; rr(g,x,y,cardW,hH,12); g.fill(); g.fillStyle=NAVY; g.fillRect(x,y+hH-12,cardW,12);
      g.fillStyle='#fff'; g.textAlign='center'; g.textBaseline='middle';
      const np=fitFont(g,c.name,cardW-20,22,13,'bold'); g.font=bold(np); g.fillText(c.name,x+cardW/2,y+hH/2);
      // 본문 설명 (가운데)
      g.fillStyle='#243043'; g.font=med(16); g.textBaseline='top';
      const lines=wrapLines(g,c.desc,cardW-24).slice(0,4); const lh=22; const by=y+hH+ (cardH-hH-lines.length*lh)/2;
      lines.forEach((ln,li)=>g.fillText(ln,x+cardW/2,by+li*lh));
    });
  }

  // ── quote: 인용/말자막 (sky형) ──
  function drawQuote(g,spec){
    skyBg(g);
    g.fillStyle='rgba(255,255,255,.95)'; rr(g,150,TICKER_TOP+20,W-300,TICKER_BOTTOM-TICKER_TOP-40,18); g.fill();
    g.fillStyle=SKY; g.font=bold(120); g.textAlign='left'; g.textBaseline='top'; g.fillText('“',185,TICKER_TOP+20);
    g.fillStyle=NAVY; g.textAlign='center'; g.textBaseline='middle';
    const fp=fitFont(g,spec.quote||'',W-420,40,24,'bold'); g.font=bold(fp);
    const lines=wrapLines(g,spec.quote||'',W-420); const cy=(TICKER_TOP+TICKER_BOTTOM)/2 - (spec.who?20:0); const lh=fp*1.3;
    lines.slice(0,4).forEach((ln,i)=>g.fillText(ln,W/2,cy-(lines.length-1)*lh/2+i*lh));
    if(spec.who){ g.fillStyle=BLUE; g.font=med(24); g.fillText('— '+spec.who, W/2, TICKER_BOTTOM-70); }
  }

  // ── chart_frame: 범용 (불릿/캡션) ──
  function drawFrame(g,spec){
    const R=chartFrame(g,spec.title,spec.unit,spec.source);
    const bullets=spec.bullets||(spec.body?[spec.body]:[]);
    g.textAlign='left'; g.textBaseline='top'; let y=R.y+8;
    bullets.forEach(b=>{ g.fillStyle=RED; g.beginPath(); g.arc(R.x+8,y+13,5,0,7); g.fill();
      g.fillStyle='#233'; g.font=med(24); const lines=wrapLines(g,b,R.w-40);
      lines.forEach((ln,i)=>{ g.fillText(ln,R.x+26,y); y+=34; }); y+=10; });
  }

  const RENDERERS={ bars:drawBars, line:drawLine, rank_bars:drawRank, theme_grid:drawGrid, quote:drawQuote, chart_frame:drawFrame };

  window.renderKitCG = async function(spec){
    await ensureFonts();
    const c=document.createElement('canvas'); c.width=W; c.height=H; const g=c.getContext('2d');
    const fn=RENDERERS[spec&&spec.type]||drawFrame;
    try{ fn(g,spec||{}); }catch(e){ skyBg(g); g.fillStyle=NAVY; g.font=bold(30); g.textAlign='center'; g.textBaseline='middle'; g.fillText('CG 렌더 오류: '+e.message, W/2, H/2); }
    return c.toDataURL('image/png');
  };
  window.KIT_TYPES = Object.keys(RENDERERS);
})();
