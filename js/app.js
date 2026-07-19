/* The race to half online — map app.
   Data files (loaded before this script):
     data/adoption.js -> window.ADOPTION  (per-country annual series + threshold metrics)
     data/metrics.js  -> window.METRICS   (mobile & fixed-broadband subs per 100, annual)
     data/extras.js   -> window.EXTRAS    (1GB price, median Mbps, gender parity)
     data/geo.js      -> window.GEO       (topojson id -> iso, dot coords, id -> name)
     data/events.js   -> window.EVENTS    (curated internet-history milestones)         */

const DATA={}; ADOPTION.countries.forEach(c=>DATA[c.iso]=c);
const WORLD=ADOPTION.world||null;
const MET=Object.assign({mobile:{},bband:{}},window.METRICS||{},window.EXTRAS||{});
const N2I=GEO.num2iso, DOTS=GEO.dots, NUM2NAME=GEO.num2name;
const FAST=["KOR","CYM","CAN","SVK","KAZ","NOR","AUS","CHE","NZL","SWE"];
const SLOW=["STP","EGY","PER","NIC","TJK","BOL","BLZ","THA","JAM","MEX"];
const LEAP=["DJI","KHM","BWA","IRQ","MMR","BTN","GAB","SEN","LAO"];
const SETS={fast:new Set(FAST),slow:new Set(SLOW),leap:new Set(LEAP)};
const NEVER="#20252d",CENSOR="#5b4a2e",NODATA="#20252d";
const scale=d3.scaleLinear().domain([2,8,17]).range(["#17b8a6","#e9e0c9","#e8582c"]).clamp(true);
// % online ramp (dark-mode sequential, validated): low -> high
const PCT_STOPS=["#155449","#146b58","#158468","#16a084","#17b8a6","#6fdec4","#c8f7e6"];
function rampFor(max){return d3.scaleLinear()
  .domain(PCT_STOPS.map((_,i)=>i*max/(PCT_STOPS.length-1))).range(PCT_STOPS).clamp(true);}
// log-spaced ramp for long-tailed metrics (price, Mbps)
function rampLog(lo,hi,stops){const n=stops.length,
  d=Array.from({length:n},(_,i)=>lo*Math.pow(hi/lo,i/(n-1)));
  return d3.scaleLinear().domain(d).range(stops).clamp(true);}
const PCT_REV=[...PCT_STOPS].reverse();
const SHUT_STOPS=["#47200f","#6b2d10","#903c12","#b54d18","#d96322","#f28749","#ffb98c"];
const SCALES={net:rampFor(100),mobile:rampFor(150),bband:rampFor(50),
  // price: bright = cheap (good), fading to dark as 1GB gets expensive
  price:rampLog(0.1,30,PCT_REV),
  mbps:rampLog(10,800,PCT_STOPS),
  // gender parity: diverging around 1.0 = parity (same poles as the speed scale)
  gender:d3.scaleLinear().domain([0.5,1,1.1]).range(["#e8582c","#e9e0c9","#17b8a6"]).clamp(true),
  // shutdowns: warm alarm ramp, brighter = more incidents (log 1..900, India ~857)
  shut:rampLog(1,900,SHUT_STOPS),
  fotn:rampFor(100),
  ixp:rampLog(1,220,PCT_STOPS),
  ipv6:rampFor(100)};
// magnitude layers: label + legend end labels + tooltip row + value format
const fmt1=v=>Math.round(v*10)/10;
const LAYERS={
  net:{lt:"Share of people online",lo:"0%",hi:"100%",row:"Online",fmt:v=>v+"%"},
  mobile:{lt:"Mobile subs / 100 people",lo:"0",hi:"150+",row:"Mobile subs",fmt:v=>v+" /100"},
  bband:{lt:"Fixed broadband / 100 people",lo:"0",hi:"50+",row:"Fixed broadband",fmt:v=>v+" /100"},
  price:{lt:"Price of 1GB mobile data (USD)",lo:"$0.10 · cheap",hi:"$30+",row:"1GB costs",fmt:v=>"$"+v,
    grad:PCT_REV},
  mbps:{lt:"Median mobile download speed",lo:"10 Mbps · slow",hi:"800 Mbps · fast",row:"Download",fmt:v=>fmt1(v)+" Mbps"},
  gender:{lt:"Women online per man online",lo:"0.5 · men ahead",hi:"women ahead",row:"F/M parity",fmt:v=>v,
    grad:["#e8582c","#e9e0c9 83%","#17b8a6"]}, // cream sits at parity (1.0) in the 0.5–1.1 domain
  shut:{lt:"Internet shutdowns since 2016",lo:"1",hi:"850+",row:"Shutdowns since 2016",
    fmt:v=>Math.round(v),zero:"0",none:"No recorded shutdowns",grad:SHUT_STOPS},
  fotn:{lt:"Freedom on the Net score",lo:"0 · not free",hi:"100 · free",row:"Net freedom",
    fmt:v=>Math.round(v)+" /100",none:"Not assessed"},
  ixp:{lt:"Internet exchange points",lo:"1",hi:"200+",row:"Internet exchanges",
    fmt:v=>Math.round(v),none:"No listed exchange"},
  ipv6:{lt:"Native IPv6 adoption",lo:"0%",hi:"100%",row:"IPv6 traffic",fmt:v=>fmt1(v)+"%"}
};
// country-panel line colours (validated categorical trio on the panel surface)
const LC={net:"#109184",mobile:"#b8842c",bband:"#6f83e6"};

const START=1990,END=2024;
let mode="g50",view="globe",layer="speed",year=null,highlight=null,playing=false,timer=null;
let feats50=[],feats110=[],loaded=false,centroid={};

const svg=d3.select("#map"),tip=d3.select("#tip"),app=d3.select("#app");
const scatterSvg=d3.select("#scatter");
let W=innerWidth,H=innerHeight;
const projFlat=d3.geoNaturalEarth1();
const projGlobe=d3.geoOrthographic().rotate([-12,-18]).clipAngle(90);
let proj=projFlat,path=d3.geoPath(proj);
const graticule=d3.geoGraticule10();
const defs=svg.append("defs");
const rg=defs.append("radialGradient").attr("id","ocean").attr("cx","42%").attr("cy","38%").attr("r","72%");
rg.append("stop").attr("offset","0%").attr("stop-color","#12313a");
rg.append("stop").attr("offset","62%").attr("stop-color","#0c1a22");
rg.append("stop").attr("offset","100%").attr("stop-color","#070d12");
// everything geographic lives under viewport so zoom/pan is one transform, independent of proj math
const viewport=svg.append("g").attr("class","viewport");
const sphere=viewport.append("path").attr("class","sphere").datum({type:"Sphere"});
const gGrat=viewport.append("path").attr("class","graticule");
const gGeo=viewport.append("g"),gCab=viewport.append("g").attr("id","cablelayer"),
  gDot=viewport.append("g"),gLbl=viewport.append("g"),gFx=viewport.append("g");
let cablesOn=false;const cableTimers=new Map();
const CABLE_END=Math.max(...(window.CABLES||[{rfs:0}]).map(c=>c.rfs));

function feats(){return view==="flat"?feats50:feats110;}
function gapOf(d){return mode==="g50"?d.gap50:d.gap40;}
function ycOf(d){return mode==="g50"?d.y50:d.y40;}

/* ── values & colour ───────────────────────────────────────────── */
function valueAt(iso,yr){const d=DATA[iso];if(!d||yr<d.sy)return null;
  return d.v[Math.min(yr,END)-d.sy];}
function metValueAt(kind,iso,yr){
  if(kind==="net"||kind==="speed")return valueAt(iso,yr);
  const s=MET[kind]&&MET[kind][iso];if(!s||yr<s.sy)return null;
  return s.v[Math.min(yr,END)-s.sy];}
function baseColor(iso){const d=DATA[iso];if(!d)return NODATA;const g=gapOf(d);
  if(g==null)return d.y10!=null?CENSOR:NEVER;return scale(g);}
function colorOf(iso){
  if(year!=null){const k=layer==="speed"?"net":layer,v=metValueAt(k,iso,year);
    return v==null?NODATA:SCALES[k](v);}
  if(layer==="speed")return baseColor(iso);
  const v=metValueAt(layer,iso,END);
  return v==null?NODATA:SCALES[layer](v);}
function inHi(iso){if(!highlight)return true;
  if(highlight==="never"){const d=DATA[iso];return d&&!d.reached50&&d.y10!=null;}
  return SETS[highlight].has(iso);}

/* ── geometry ──────────────────────────────────────────────────── */
function bindGeo(){
  gGeo.selectAll("path.land").data(feats(),d=>d.id).join(
    en=>en.append("path").attr("class","land")
        .on("mousemove",(e,d)=>{enterFeat(d);move(e);}).on("mouseleave",leave)
        .on("click",(e,d)=>{if(d.__iso&&DATA[d.__iso])openPanel(d.__iso);}),
    up=>up,ex=>ex.remove());
}
function fit(){
  W=innerWidth;H=innerHeight;
  if(view==="scatter"){fitScatter();return;}
  if(view==="flat"){proj=projFlat;proj.fitExtent([[12,92],[W-12,H-84]],{type:"Sphere"});
    sphere.attr("fill","#0e1116");svg.classed("globe",false);}
  else{proj=projGlobe;const R=Math.min(W-40,H-150);
    projGlobe.fitExtent([[(W-R)/2,(H-R)/2-6],[(W+R)/2,(H+R)/2-6]],{type:"Sphere"});
    sphere.attr("fill","url(#ocean)");svg.classed("globe",true);}
  path=d3.geoPath(proj);syncZoomExtent();redraw();paint(false);
}
function onFront(lonlat){if(view==="flat")return true;const c=projGlobe.rotate();
  return d3.geoDistance(lonlat,[-c[0],-c[1]])<1.57;}
function redraw(){
  sphere.attr("d",path);
  gGrat.attr("d",view==="globe"?path(graticule):null);
  gGeo.selectAll("path.land").attr("d",path);
  if(cablesOn)gCab.selectAll("path.cable").attr("d",d=>path({type:"MultiLineString",coordinates:d.segs}));
  gDot.selectAll("circle").attr("cx",d=>proj(DOTS[d])[0]).attr("cy",d=>proj(DOTS[d])[1])
    .attr("display",d=>onFront(DOTS[d])?null:"none");
  gLbl.selectAll("text").each(function(d){
    const ll=labelPt(d);const p=proj(ll);const on=onFront(ll)&&p;
    d3.select(this).attr("x",on?p[0]:-9999).attr("y",on?p[1]-9:-9999).attr("display",on?null:"none");
  });
  gFx.selectAll("circle").each(function(){
    const ll=d3.select(this).datum();const p=proj(ll);const on=onFront(ll)&&p;
    d3.select(this).attr("cx",on?p[0]:-9999).attr("cy",on?p[1]:-9999);
  });
}
function styleGeo(sel,tf){
  if(!highlight){sel.attr("stroke","#0e1116").attr("stroke-width",.4).attr("opacity",1);return;}
  sel.attr("opacity",d=>tf(d)?1:.05)
     .attr("stroke",d=>tf(d)?"#ffffff":"#0e1116").attr("stroke-width",d=>tf(d)?1.2:.3);
  sel.filter(tf).raise();
}
function paint(anim){
  if(view==="scatter"){renderScatter(anim);return;}
  const L=gGeo.selectAll("path.land");
  (anim?L.transition().duration(420):L).attr("fill",d=>colorOf(d.__iso));
  styleGeo(L,d=>inHi(d.__iso));
  const D=gDot.selectAll("circle");
  (anim?D.transition().duration(420):D).attr("fill",d=>colorOf(d))
    .attr("r",d=>(highlight&&inHi(d))?6:4.2);
  D.attr("opacity",d=>{if(!DATA[d])return .001;return highlight?(inHi(d)?1:.05):1;})
   .attr("stroke",d=>(highlight&&inHi(d))?"#fff":"#0e1116").attr("stroke-width",d=>(highlight&&inHi(d))?1.4:.6);
  D.filter(d=>highlight&&inHi(d)).raise();
}

/* ── labels, rank panel, legends ───────────────────────────────── */
function labelPt(iso){return DOTS[iso]||centroid[iso]||[0,0];}
function buildLabels(){
  const list=(highlight&&highlight!=="never")?[...SETS[highlight]]:[];
  gLbl.selectAll("text").data(list,d=>d).join(
    en=>{const t=en.append("text").attr("class","lbl");t.append("tspan");t.append("tspan").attr("class","v");return t;},
    up=>up, ex=>ex.remove())
    .each(function(iso){const d=DATA[iso];const g=gapOf(d);
      const ts=d3.select(this).selectAll("tspan");
      ts.filter((_,i)=>i===0).text(d.name+" ");
      ts.filter((_,i)=>i===1).text(g!=null?g+"y":"");});
}
function updateLegend(){
  if(view==="scatter"){d3.select("#legend").style("display","none");
    d3.select("#legend2").style("display","none");d3.select("#rank").classed("show",false);return;}
  const rankOn=!!highlight,tl=app.classed("tl");
  const mag=tl?(layer==="speed"?"net":layer):(layer!=="speed"?layer:null);
  d3.select("#legend").style("display",(!rankOn&&!mag)?null:"none");
  d3.select("#legend2").style("display",(!rankOn&&mag)?"block":"none");
  if(mag){const L=LAYERS[mag];
    d3.select("#l2t").text(L.lt);
    d3.select("#l2a").text(L.lo);d3.select("#l2b").text(L.hi);
    d3.select("#legend2 .bar")
      .style("background",L.grad?`linear-gradient(90deg,${L.grad.join(",")})`:null);
    d3.select("#l2n").text(L.none||(tl?"No data yet that year":"No data"));}
}
function buildRank(){
  const rank=d3.select("#rank");
  if(!highlight){rank.classed("show",false);updateLegend();return;}
  rank.classed("show",true);updateLegend();
  let items,title;
  if(highlight==="fast"){title="Fastest to 50%";items=FAST.map(i=>DATA[i]).sort((a,b)=>a.gap50-b.gap50);}
  else if(highlight==="slow"){title="Slowest to 50%";items=SLOW.map(i=>DATA[i]).sort((a,b)=>b.gap50-a.gap50);}
  else if(highlight==="leap"){title="Mobile-era leapfrog";items=LEAP.map(i=>DATA[i]).sort((a,b)=>a.gap50-b.gap50);}
  else{items=Object.values(DATA).filter(d=>!d.reached50&&d.y10!=null).sort((a,b)=>(b.latest||0)-(a.latest||0));
       title=items.length+" crossed 10%, never 50%";}
  d3.select("#rankt").text(title);
  const isNever=highlight==="never";
  const rows=d3.select("#rankl").selectAll("div.ri").data(items,d=>d.iso).join(
    en=>{const r=en.append("div").attr("class","ri");
      r.append("span").attr("class","rk");r.append("span").attr("class","c");
      r.append("span").attr("class","nm");r.append("span").attr("class","vv");return r;});
  rows.select(".rk").text((d,i)=>isNever?"":(i+1));
  rows.select(".c").style("background",d=>isNever?CENSOR:scale(d.gap50));
  rows.select(".nm").text(d=>d.name);
  rows.select(".vv").text(d=>isNever?(d.latest!=null?Math.round(d.latest)+"%":""):(d.gap50+"y"));
}

/* ── tooltip ───────────────────────────────────────────────────── */
function tipHtml(iso){const d=DATA[iso];if(!d)return null;
  const g=gapOf(d),tgt=mode==="g50"?50:40,yc=ycOf(d);
  let r="";
  if(year!=null){const v=valueAt(iso,year);
    r+=`<div class="g"><span>Online in ${year}</span><b>${v!=null?v+"%":"no data"}</b></div>`;}
  r+=`<div class="g"><span>Passed 10%</span><b>${d.y10??"—"}</b></div>`;
  r+=`<div class="g"><span>Passed ${tgt}%</span><b>${yc??"never"}</b></div>`;
  r+=`<div class="g"><span>Online${d.ly?" ("+d.ly+")":""}</span><b>${d.latest!=null?d.latest+"%":"—"}</b></div>`;
  if(layer!=="speed"&&layer!=="net"){
    const yr=year!=null?year:END,v=metValueAt(layer,iso,yr);
    r+=`<div class="g"><span>${LAYERS[layer].row}${year!=null?" in "+year:""}</span><b>${v!=null?LAYERS[layer].fmt(v):(LAYERS[layer].zero??"—")}</b></div>`;
    if(layer==="ixp"){const dc=metValueAt("dc",iso,yr);
      r+=`<div class="g"><span>Data center facilities</span><b>${dc!=null?Math.round(dc):"0"}</b></div>`;}}
  let big;
  if(g!=null)big=`<div class="big">Went 10%→${tgt}% in <b>${g}</b> year${g==1?"":"s"}${d.lowconf?" *":""}</div>`;
  else if(d.y10!=null)big=`<div class="big" style="color:var(--slow)">Crossed 10% in ${d.y10} — still under ${tgt}%</div>`;
  else big=`<div class="big" style="color:var(--muted)">Never reached 10%</div>`;
  return `<h3>${d.name}</h3>${r}${big}`;}
function move(ev){tip.style("left",(ev.clientX+16)+"px").style("top",(ev.clientY+14)+"px");}
function enter(iso){const h=tipHtml(iso);if(!h)return;tip.html(h).style("opacity",1);}
function noData(nm){return `<h3>${nm}</h3><div class="big" style="color:var(--muted)">No data for this indicator</div>`;}
function enterFeat(f){
  if(f.__iso&&DATA[f.__iso]){tip.html(tipHtml(f.__iso)).style("opacity",1);return;}
  const nm=(f.properties&&f.properties.name)||NUM2NAME[String(f.id)]||null;
  if(nm)tip.html(noData(nm)).style("opacity",1);else leave();}
function leave(){tip.style("opacity",0);}

/* ── submarine cables overlay ─────────────────────────────────── */
function cableTipHtml(c){
  let r=`<div class="g"><span>Ready for service</span><b>${c.rfs}</b></div>`;
  if(c.owners)r+=`<div class="g"><span>Owners</span><b style="font-weight:500;text-align:right;font-size:11px">${c.owners}</b></div>`;
  return `<h3>${c.name}</h3>${r}`;
}
function bindCables(){
  gCab.selectAll("path.cable").data(window.CABLES||[],d=>d.id).join("path")
    .attr("class","cable laid")
    .on("mousemove",(e,d)=>{tip.html(cableTipHtml(d)).style("opacity",1);move(e);})
    .on("mouseleave",leave);
}
function updateCables(){
  if(!cablesOn)return;
  gCab.selectAll("path.cable").each(function(d){
    const yr=year!=null?year:CABLE_END;
    const p=d3.select(this);
    if(d.rfs>yr){
      clearTimeout(cableTimers.get(d.id));cableTimers.delete(d.id);
      p.attr("class","cable unlaid");
    }else if(year!=null&&d.rfs===yr){
      p.attr("class","cable fresh");
      clearTimeout(cableTimers.get(d.id));
      cableTimers.set(d.id,setTimeout(()=>{if(year===yr)p.attr("class","cable laid");},1900));
    }else{
      clearTimeout(cableTimers.get(d.id));cableTimers.delete(d.id);
      p.attr("class","cable laid");
    }
  });
}
d3.select("#cablesbtn").on("click",function(){
  cablesOn=!cablesOn;
  d3.select(this).classed("on",cablesOn);
  gCab.style("display",cablesOn?null:"none");
  if(cablesOn){redraw();updateCables();}
});

/* ── timelapse: year state, events, timeline ───────────────────── */
const EVYEARS=[...new Set(EVENTS.map(e=>e.y))].sort((a,b)=>a-b);
const slider=document.getElementById("yslider");
let shownEvYear=null;

function buildTicks(){
  d3.select("#ticks").selectAll("div.tick").data(EVYEARS).join("div")
    .attr("class","tick").classed("ctry",y=>EVENTS.filter(e=>e.y===y).every(e=>e.iso))
    .style("left",y=>((y-START)/(END-START)*100)+"%")
    .attr("title",y=>y+" · "+EVENTS.filter(e=>e.y===y).map(e=>e.t).join(" · "))
    .on("click",(e,y)=>{pausePlay();setYear(y,true);});
}
function markTicks(){
  d3.select("#ticks").selectAll("div.tick")
    .classed("act",y=>y===shownEvYear)
    .classed("done",y=>y<year&&y!==shownEvYear);
}
function evName(iso){return DATA[iso]?DATA[iso].name:iso;}
function updateEvents(){
  const y=[...EVYEARS].reverse().find(v=>v<=year)??null;
  const card=d3.select("#evcard");
  if(y==null){card.classed("show",false);shownEvYear=null;markTicks();return;}
  if(y!==shownEvYear){
    const evs=EVENTS.filter(e=>e.y===y);
    card.html(evs.map(e=>{
      const kick=e.iso?`${e.y} · ${e.iso.map(evName).join(", ")}`:`${e.y} · World`;
      return `<div class="evb"><div class="ek${e.iso?" ctry":""}">${kick}</div><h4>${e.t}</h4><p>${e.d}</p></div>`;
    }).join("")).classed("show",true)
      .classed("ctryb",evs.every(e=>e.iso));
    if(y===year)pulseCountries(evs.flatMap(e=>e.iso||[]));
    shownEvYear=y;
  }
  markTicks();
}
function pulseCountries(isos){
  if(!isos.length)return;
  const pts=isos.map(labelPt).filter(p=>p[0]||p[1]);
  gFx.selectAll("circle").remove();
  const c=gFx.selectAll("circle").data(pts).enter().append("circle").attr("class","pulse")
    .attr("cx",p=>{const q=proj(p);return onFront(p)&&q?q[0]:-9999;})
    .attr("cy",p=>{const q=proj(p);return onFront(p)&&q?q[1]:-9999;});
  setTimeout(()=>c.remove(),2600);
}
function setYear(y,anim){
  year=Math.max(START,Math.min(END,y));
  slider.value=year;
  d3.select("#yy").text(year);
  let n=0;for(const k in DATA){const d=DATA[k],yc=ycOf(d);if(yc!=null&&yc<=year)n++;}
  d3.select("#ycount").text(n);
  const wv=WORLD&&year>=WORLD.sy?WORLD.v[Math.min(year,END)-WORLD.sy]:null;
  d3.select("#yworld").text(wv!=null?` · world ${Math.round(wv)}% online`:"");
  updateEvents();updateCursor();updateCables();paint(anim);
}

/* ── scatter view: Gapminder-style, animated over the same timelapse year ── */
const AXES={
  gdp:{lbl:"GDP per capita (US$)",short:"GDP / capita",log:true,
    get:(iso,yr)=>metValueAt("gdp",iso,yr),fmt:v=>"$"+Math.round(v).toLocaleString()},
  net:{lbl:"Share of people online",short:"% online",log:false,
    get:(iso,yr)=>valueAt(iso,yr),fmt:v=>v+"%"},
  speed:{lbl:"Years from 10% to 50% online",short:"Adoption speed",log:false,
    get:iso=>DATA[iso]?DATA[iso].gap50:null,fmt:v=>v+" yr"},
  mobile:{lbl:"Mobile subscriptions / 100 people",short:"Mobile /100",log:false,
    get:(iso,yr)=>metValueAt("mobile",iso,yr),fmt:v=>v+" /100"},
  bband:{lbl:"Fixed broadband / 100 people",short:"Broadband /100",log:false,
    get:(iso,yr)=>metValueAt("bband",iso,yr),fmt:v=>v+" /100"},
  price:{lbl:"Price of 1GB mobile data (USD)",short:"1GB price",log:true,
    get:(iso,yr)=>metValueAt("price",iso,yr),fmt:v=>"$"+v},
  mbps:{lbl:"Median mobile download speed",short:"Mobile Mbps",log:true,
    get:(iso,yr)=>metValueAt("mbps",iso,yr),fmt:v=>fmt1(v)+" Mbps"},
  gender:{lbl:"Women online per man online",short:"Gender parity",log:false,
    get:(iso,yr)=>metValueAt("gender",iso,yr),fmt:v=>v},
  shut:{lbl:"Internet shutdowns since 2016",short:"Shutdowns",log:true,
    get:(iso,yr)=>metValueAt("shut",iso,yr),fmt:v=>Math.round(v)},
  fotn:{lbl:"Freedom on the Net score",short:"Net freedom",log:false,
    get:(iso,yr)=>metValueAt("fotn",iso,yr),fmt:v=>Math.round(v)+"/100"},
  ixp:{lbl:"Internet exchange points",short:"IXPs",log:true,
    get:(iso,yr)=>metValueAt("ixp",iso,yr),fmt:v=>Math.round(v)},
  ipv6:{lbl:"Native IPv6 adoption",short:"IPv6 %",log:false,
    get:(iso,yr)=>metValueAt("ipv6",iso,yr),fmt:v=>fmt1(v)+"%"},
};
const AXIS_ORDER=["gdp","net","speed","mobile","bband","price","mbps","gender","shut","fotn","ixp","ipv6"];
const HI_COLOR={fast:"#17b8a6",slow:"#e8582c",leap:"#e6b34a",never:"#9aa4b2"};
let scX="gdp",scY="net";
const scMargin={top:230,right:44,bottom:160,left:66};
const scDots=scatterSvg.append("g").attr("class","sc-dots");
const scXAxisG=scatterSvg.append("g").attr("class","sc-axis sc-x");
const scYAxisG=scatterSvg.append("g").attr("class","sc-axis sc-y");
const scXLbl=scatterSvg.append("text").attr("class","sc-lbl").attr("text-anchor","middle");
const scYLbl=scatterSvg.append("text").attr("class","sc-lbl").attr("text-anchor","middle");
const scCountTxt=scatterSvg.append("text").attr("class","sc-count");
let scXscale=d3.scaleLinear(),scYscale=d3.scaleLinear();

function populateAxisSelects(){
  const opts=AXIS_ORDER.map(k=>`<option value="${k}">${AXES[k].short}</option>`).join("");
  d3.select("#xaxis").html(opts).property("value",scX);
  d3.select("#yaxis").html(opts).property("value",scY);
}
function padDomain(ext,log){
  let[lo,hi]=ext;
  if(lo==null||hi==null)return[0,1];
  if(lo===hi){lo-=Math.abs(lo)*.1||1;hi+=Math.abs(hi)*.1||1;}
  const pad=(hi-lo)*.08;
  return[log?Math.max(0,lo-pad):lo-pad,hi+pad];
}
function scatterPoints(yr){
  const xa=AXES[scX],ya=AXES[scY],out=[];
  for(const iso in DATA){
    const xv=xa.get(iso,yr),yv=ya.get(iso,yr);
    if(xv==null||yv==null)continue;
    out.push({iso,x:xv,y:yv});
  }
  return out;
}
function scTipHtml(d){
  const nm=DATA[d.iso]?DATA[d.iso].name:d.iso,xa=AXES[scX],ya=AXES[scY];
  return `<h3>${nm}</h3>`
    +`<div class="g"><span>${xa.short}</span><b>${xa.fmt(d.x)}</b></div>`
    +`<div class="g"><span>${ya.short}</span><b>${ya.fmt(d.y)}</b></div>`;
}
function fitScatter(){
  scatterSvg.attr("viewBox",`0 0 ${W} ${H}`);
  scXscale.range([scMargin.left,W-scMargin.right]);
  scYscale.range([H-scMargin.bottom,scMargin.top]);
  scXLbl.attr("x",(scMargin.left+W-scMargin.right)/2).attr("y",H-38);
  scYLbl.attr("x",-(H-scMargin.top-scMargin.bottom)/2-scMargin.top).attr("y",22)
    .attr("transform","rotate(-90)");
  scCountTxt.attr("x",W-scMargin.right).attr("y",scMargin.top-16).attr("text-anchor","end");
  renderScatter(false);
}
function renderScatter(anim){
  if(view!=="scatter")return;
  const yr=year!=null?year:END;
  const pts=scatterPoints(yr);
  scXscale=(AXES[scX].log?d3.scaleSymlog():d3.scaleLinear())
    .range([scMargin.left,W-scMargin.right]).domain(padDomain(d3.extent(pts,d=>d.x),AXES[scX].log));
  scYscale=(AXES[scY].log?d3.scaleSymlog():d3.scaleLinear())
    .range([H-scMargin.bottom,scMargin.top]).domain(padDomain(d3.extent(pts,d=>d.y),AXES[scY].log));
  const xAx=d3.axisBottom(scXscale).ticks(AXES[scX].log?4:6).tickSizeOuter(0);
  const yAx=d3.axisLeft(scYscale).ticks(AXES[scY].log?5:6).tickSizeOuter(0);
  if(AXES[scX].log)xAx.tickFormat(d3.format("~s"));
  if(AXES[scY].log)yAx.tickFormat(d3.format("~s"));
  (anim?scXAxisG.transition().duration(420):scXAxisG)
    .attr("transform",`translate(0,${H-scMargin.bottom})`).call(xAx);
  (anim?scYAxisG.transition().duration(420):scYAxisG)
    .attr("transform",`translate(${scMargin.left},0)`).call(yAx);
  scXLbl.text(AXES[scX].lbl);
  scYLbl.text(AXES[scY].lbl);
  scCountTxt.text(`${pts.length} of ${Object.keys(DATA).length} countries · ${yr}`);
  const sel=scDots.selectAll("circle.sc-dot").data(pts,d=>d.iso);
  sel.exit().transition().duration(280).attr("r",0).remove();
  const en=sel.enter().append("circle").attr("class","sc-dot").attr("r",0)
    .attr("cx",d=>scXscale(d.x)).attr("cy",d=>scYscale(d.y))
    .on("mousemove",(e,d)=>{tip.html(scTipHtml(d)).style("opacity",1);move(e);})
    .on("mouseleave",leave)
    .on("click",(e,d)=>openPanel(d.iso));
  const merged=en.merge(sel);
  const t=anim?merged.transition().duration(420):merged;
  t.attr("cx",d=>scXscale(d.x)).attr("cy",d=>scYscale(d.y))
    .attr("r",d=>highlight?(inHi(d.iso)?6.5:3.2):4.6)
    .attr("fill",d=>highlight&&inHi(d.iso)?HI_COLOR[highlight]:null)
    .attr("fill-opacity",d=>highlight&&!inHi(d.iso)?.15:null);
}
d3.select("#xaxis").on("change",function(){scX=this.value;renderScatter(true);});
d3.select("#yaxis").on("change",function(){scY=this.value;renderScatter(true);});
populateAxisSelects();

function fitFilters(){
  // flex-wrap leaves the panel at max-width even when its wrapped lines end
  // short of the edge — shrink it to the widest actual line
  const fl=document.getElementById("filters");
  fl.style.width="";
  const pr=fl.getBoundingClientRect();
  let right=0;
  fl.querySelectorAll(".crow > *").forEach(el=>{
    if(!el.offsetWidth)return;
    right=Math.max(right,el.getBoundingClientRect().right-pr.left);
  });
  if(right>0)fl.style.width=Math.ceil(right+parseFloat(getComputedStyle(fl).paddingRight)+1)+"px";
}
function updateTlPos(){
  fitFilters();
  const f=document.getElementById("filters").getBoundingClientRect();
  const tl=document.getElementById("tlrow");
  tl.style.left=f.left+"px";
  tl.style.width=f.width+"px";
  tl.style.bottom=(innerHeight-f.top+10)+"px";
}
function enterTimelapse(){
  highlight=null;d3.selectAll(".btn[data-h]").classed("on",false);
  buildLabels();buildRank();
  app.classed("tl",true).classed("showyear",true);
  d3.select("#yearbox").classed("show",true);
  updateLegend();updateTlPos();
}
function exitTimelapse(){
  year=null;shownEvYear=null;pausePlay();
  app.classed("tl",false).classed("showyear",false);
  d3.select("#yearbox").classed("show",false);
  d3.select("#evcard").classed("show",false);
  gFx.selectAll("circle").remove();
  updateLegend();updateCursor();updateCables();
}
const CTRY_YEARS=new Set(EVENTS.filter(e=>e.iso).map(e=>e.y));
let speedMult=1;
function stepDelay(y){return (CTRY_YEARS.has(y)?1600:950)/speedMult;}
function pausePlay(){playing=false;clearTimeout(timer);
  d3.select("#play").html((year!=null&&year<END)?"▶ Resume":"▶ Play 1990–2024");}
function tickPlay(){
  if(!playing)return;
  if(year>=END){pausePlay();return;}
  setYear(year+1,true);
  timer=setTimeout(tickPlay,stepDelay(year));
}
d3.select("#play").on("click",()=>{
  if(playing){pausePlay();return;}
  const fresh=(year==null||year>=END);
  if(year==null)enterTimelapse();
  playing=true;d3.select("#play").html("❚❚ Pause");
  if(fresh){setYear(START,false);timer=setTimeout(tickPlay,stepDelay(START));}
  else timer=setTimeout(tickPlay,300);
});
const SPEEDS=[1,2,0.5];
d3.select("#spd").on("click",function(){
  speedMult=SPEEDS[(SPEEDS.indexOf(speedMult)+1)%SPEEDS.length];
  d3.select(this).text(speedMult+"×").classed("on",speedMult!==1);
});
slider.addEventListener("input",()=>{
  if(year==null)enterTimelapse();
  pausePlay();setYear(+slider.value,false);
});
buildTicks();

/* ── country panel ─────────────────────────────────────────────── */
const CPW=288,CPH=150,CPM={t:10,r:8,b:16,l:26};
let panelIso=null,cpX=null,cpY=null;

function openPanel(iso){
  if(!DATA[iso])return;
  panelIso=iso;
  app.classed("cp",true);
  d3.select("#cpanel").classed("show",true);
  renderPanel();
}
function closePanel(){
  panelIso=null;
  app.classed("cp",false);
  d3.select("#cpanel").classed("show",false);
}
function cpSeries(kind){
  const s=kind==="net"?DATA[panelIso]:(MET[kind]&&MET[kind][panelIso]);
  if(!s||!s.v)return null;
  return s.v.map((v,i)=>({yr:s.sy+i,v}));
}
function renderPanel(){
  const d=DATA[panelIso];
  d3.select("#cpname").text(d.name);
  const tgt=mode==="g50"?50:40,yc=ycOf(d),g=gapOf(d);
  let stat;
  if(g!=null)stat=`10%→${tgt}% in <b>${g}</b> yr (${d.y10}→${yc})`;
  else if(d.y10!=null)stat=`Crossed 10% in <b>${d.y10}</b> — still under ${tgt}%`;
  else stat=`Never reached 10%`;
  d3.select("#cpstats").html(`${stat} · now <b>${d.latest!=null?d.latest+"%":"—"}</b> online`+(d.lowconf?" · sparse data *":""));

  const svgP=d3.select("#cpchart");svgP.selectAll("*").remove();
  const series={net:cpSeries("net"),mobile:cpSeries("mobile"),bband:cpSeries("bband")};
  const ymax=Math.max(100,...(series.mobile||[]).map(p=>p.v));
  cpX=d3.scaleLinear().domain([START,END]).range([CPM.l,CPW-CPM.r]);
  cpY=d3.scaleLinear().domain([0,ymax]).range([CPH-CPM.b,CPM.t]);
  // grid + axes
  const yt=ymax>150?[0,100,200]:(ymax>100?[0,50,100,150]:[0,50,100]);
  const gAx=svgP.append("g");
  yt.forEach(v=>{if(v>ymax)return;
    gAx.append("line").attr("x1",CPM.l).attr("x2",CPW-CPM.r).attr("y1",cpY(v)).attr("y2",cpY(v)).attr("class","cpgrid");
    gAx.append("text").attr("x",CPM.l-5).attr("y",cpY(v)+3).attr("class","cpaxis").attr("text-anchor","end").text(v);});
  [1990,2005,2024].forEach(v=>gAx.append("text").attr("x",cpX(v)).attr("y",CPH-3).attr("class","cpaxis")
    .attr("text-anchor",v===1990?"start":v===END?"end":"middle").text(v));
  // lines
  const line=d3.line().x(p=>cpX(p.yr)).y(p=>cpY(p.v));
  for(const k of ["bband","mobile","net"]){
    if(!series[k])continue;
    svgP.append("path").attr("d",line(series[k]))
      .attr("fill","none").attr("stroke",LC[k]).attr("stroke-width",k==="net"?2.2:1.7)
      .attr("stroke-linejoin","round").attr("opacity",k==="net"?1:.9);
  }
  // threshold markers on the internet line
  if(series.net){
    [[d.y10,10],[yc,tgt]].forEach(([yrr])=>{
      if(yrr==null)return;
      const p=series.net.find(p=>p.yr===yrr);if(!p)return;
      svgP.append("circle").attr("cx",cpX(p.yr)).attr("cy",cpY(p.v)).attr("r",3.2)
        .attr("fill","#17b8a6").attr("stroke","#0e1116").attr("stroke-width",1.2);});
  }
  // national events: amber markers pinned to the internet line
  const evs=EVENTS.filter(e=>e.iso&&e.iso.includes(panelIso));
  evs.forEach(e=>{
    const p=series.net&&series.net.find(p=>p.yr===e.y);
    svgP.append("circle").attr("cx",cpX(e.y)).attr("cy",p?cpY(p.v):CPH-CPM.b).attr("r",3.4)
      .attr("fill","#e6b34a").attr("stroke","#0e1116").attr("stroke-width",1.2)
      .append("title").text(e.y+" — "+e.t);});
  d3.select("#cpev").html(evs.length
    ?evs.map(e=>`<div class="cpe"><span>${e.y}</span>${e.t}</div>`).join("")
    :"");
  // timelapse cursor + hover crosshair
  svgP.append("line").attr("id","cpcursor").attr("y1",CPM.t).attr("y2",CPH-CPM.b)
    .attr("stroke","#17b8a6").attr("stroke-width",1).attr("stroke-dasharray","2 2").attr("display","none");
  svgP.append("line").attr("id","cphover").attr("y1",CPM.t).attr("y2",CPH-CPM.b)
    .attr("stroke","#5c6572").attr("stroke-width",1).attr("display","none");
  svgP.append("rect").attr("x",CPM.l).attr("y",CPM.t)
    .attr("width",CPW-CPM.l-CPM.r).attr("height",CPH-CPM.t-CPM.b)
    .attr("fill","transparent")
    .on("mousemove",function(ev){
      const yr=Math.round(cpX.invert(d3.pointer(ev,this)[0]));
      d3.select("#cphover").attr("display",null).attr("x1",cpX(yr)).attr("x2",cpX(yr));
      const f=(k,u)=>{const v=metValueAt(k,panelIso,yr);return v!=null?v+u:"—";};
      d3.select("#cpread").html(`<b>${yr}</b> · online ${f("net","%")} · mob ${f("mobile","")} · bb ${f("bband","")}`);})
    .on("mouseleave",()=>{d3.select("#cphover").attr("display","none");
      d3.select("#cpread").html("hover the chart for yearly values");});
  d3.select("#cpread").html("hover the chart for yearly values");
  updateCursor();
}
function updateCursor(){
  if(!panelIso||!cpX)return;
  d3.select("#cpcursor").attr("display",year!=null?null:"none");
  if(year!=null)d3.select("#cpcursor").attr("x1",cpX(year)).attr("x2",cpX(year));
}
d3.select("#cpx").on("click",closePanel);
addEventListener("keydown",e=>{if(e.key==="Escape")closePanel();});

/* ── boot: load geometry ───────────────────────────────────────── */
Promise.all([
  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"),
  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
]).then(([t50,t110])=>{
  feats50=topojson.feature(t50,t50.objects.countries).features;
  feats110=topojson.feature(t110,t110.objects.countries).features;
  [feats50,feats110].forEach(fs=>fs.forEach(f=>f.__iso=N2I[String(f.id)]||N2I[String(+f.id)]||null));
  feats50.forEach(f=>{if(f.__iso&&!centroid[f.__iso])centroid[f.__iso]=d3.geoCentroid(f);});
  const dk=Object.keys(DOTS).filter(k=>DATA[k]);
  gDot.selectAll("circle").data(dk).join("circle").attr("class","dot").attr("r",4.2)
    .on("mousemove",(e,d)=>{enter(d);move(e);}).on("mouseleave",leave)
    .on("click",(e,d)=>openPanel(d));
  loaded=true;bindGeo();bindCables();gCab.style("display","none");fit();updateTlPos();
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(updateTlPos);
  // globe is the default view: kick off the spin and show the drag hint
  if(view==="globe"){setSpin(spinOn);
    d3.select("#hint").classed("show",true);setTimeout(()=>d3.select("#hint").classed("show",false),3200);}
  const yq=+new URLSearchParams(location.search).get("y");
  if(yq>=START&&yq<=END){enterTimelapse();setYear(yq,false);pausePlay();}
}).catch(()=>{d3.select("#app").append("div").style("position","absolute").style("top","50%")
   .style("left","0").style("width","100%").style("text-align","center").style("color","#9aa4b2")
   .html("Map geometry could not load (offline?). Data is intact — reconnect and reload.");});

/* ── chrome: clean mode, view, layer, threshold, highlights ────── */
d3.select("#cleanbtn").on("click",function(){
  const on=!app.classed("clean");app.classed("clean",on);
  this.textContent=on?"Show UI":"Hide UI";
});
let autorotate=false,spinning=false,dragging=false,spinOn=true;
function setSpin(on){
  spinOn=on;
  d3.select("#spinbtn").html(on?"⏸ Spin":"▶ Spin").classed("on",on);
  autorotate=on&&view==="globe";
  if(autorotate)startSpin();
}
d3.selectAll("#viewseg button").on("click",function(){
  const v=this.dataset.v;if(v===view)return;
  d3.selectAll("#viewseg button").classed("on",false);d3.select(this).classed("on",true);
  view=v;
  const isScatter=view==="scatter";
  svg.style("display",isScatter?"none":null);
  scatterSvg.style("display",isScatter?null:"none");
  d3.select("#datagrp").style("display",isScatter?"none":null);
  d3.select("#axisgrp").style("display",isScatter?"flex":"none");
  d3.select("#threshgrp").style("display",isScatter?"none":null);
  d3.select("#cablegrp").style("display",isScatter?"none":null);
  d3.select(".zoomctl").style("display",isScatter?"none":null);
  d3.select("#hirow").classed("dis",!isScatter&&layer!=="speed");
  d3.select("#hint").classed("show",false);
  if(!isScatter){bindGeo();}
  fit();resetZoom();
  updateLegend();updateTlPos();
  d3.select("#spinbtn").style("display",view==="globe"?null:"none");
  if(view==="globe"){d3.select("#hint").classed("show",true);setTimeout(()=>d3.select("#hint").classed("show",false),3200);
    setSpin(spinOn);}else{autorotate=false;}
});
d3.select("#spinbtn").on("click",()=>setSpin(!spinOn));
function startSpin(){if(spinning)return;spinning=true;let last=0;
  function tick(t){if(!autorotate||view!=="globe"){spinning=false;return;}
    if(last){const r=projGlobe.rotate();projGlobe.rotate([r[0]+(t-last)*0.010,r[1]]);redraw();}
    last=t;requestAnimationFrame(tick);}requestAnimationFrame(tick);}
// true only when the pointer is inside the globe disc, so grabbing the empty
// space around it does nothing (accounts for the current zoom transform)
function onGlobeSphere(ev){
  if(view!=="globe")return false;
  const [sx,sy]=d3.pointer(ev,svg.node()),t=d3.zoomTransform(svg.node());
  const c=projGlobe.translate();
  return Math.hypot((sx-t.x)/t.k-c[0],(sy-t.y)/t.k-c[1])<=projGlobe.scale();
}
const drag=d3.drag()
  .filter(ev=>!ev.button&&onGlobeSphere(ev))
  .on("start",()=>{if(view!=="globe")return;dragging=true;autorotate=false;svg.classed("grab",true);})
  .on("drag",(ev)=>{if(view!=="globe")return;const r=projGlobe.rotate(),k=.26/zoomK;
     let ph=Math.max(-89,Math.min(89,r[1]-ev.dy*k));projGlobe.rotate([r[0]+ev.dx*k,ph]);redraw();})
  .on("end",()=>{dragging=false;svg.classed("grab",false);
     if(view==="globe"&&spinOn){autorotate=true;startSpin();}});
svg.call(drag);

/* ── zoom: wheel/pinch always; drag-to-pan only on the flat map so the
   globe's own rotate-drag keeps the pointer ─────────────────────── */
let zoomK=1;
const zoomBeh=d3.zoom().scaleExtent([1,8])
  .filter((ev)=>{
    if(ev.type==="wheel")return true;
    if(ev.button)return false;
    if(ev.type==="touchstart")return ev.touches.length>1||view==="flat";
    return view==="flat";
  })
  .on("zoom",(ev)=>{viewport.attr("transform",ev.transform);zoomK=ev.transform.k;
    d3.select("#zlvl").text(Math.round(zoomK*100)+"%");});
// lock pan to the map's own bounds: at 100% zoom there is zero slack, so panning
// in then zooming back out always resolves to exactly the original framing
function syncZoomExtent(){zoomBeh.extent([[0,0],[W,H]]).translateExtent([[0,0],[W,H]]);}
syncZoomExtent();
svg.call(zoomBeh).on("dblclick.zoom",null);
function resetZoom(){svg.transition().duration(300).call(zoomBeh.transform,d3.zoomIdentity);}
d3.select("#zoomin").on("click",()=>svg.transition().duration(200).call(zoomBeh.scaleBy,1.6));
d3.select("#zoomout").on("click",()=>svg.transition().duration(200).call(zoomBeh.scaleBy,1/1.6));
d3.selectAll("#layerseg button").on("click",function(){
  const l=this.dataset.l;if(l===layer)return;
  d3.selectAll("#layerseg button").classed("on",false);d3.select(this).classed("on",true);
  layer=l;
  const speedOn=layer==="speed";
  // dim rather than hide, so the panel never changes size on layer switch
  d3.select("#threshgrp").classed("dis",!speedOn);
  d3.select("#hirow").classed("dis",!speedOn);
  if(!speedOn&&highlight){highlight=null;d3.selectAll(".btn[data-h]").classed("on",false);}
  const FOOT={
    speed:"Source: Our World in Data / ITU (2025)<br/>Fixed borders · colour = adoption speed",
    price:"Source: Cable.co.uk mobile data pricing (2023)<br/>Fixed borders · brighter = cheaper 1GB",
    mbps:"Source: Ookla Speedtest Global Index (2026)<br/>Fixed borders · median mobile download",
    gender:"Source: World Bank / ITU (2025)<br/>Fixed borders · women online per man online",
    shut:"Source: Access Now #KeepItOn STOP (2016–2024)<br/>Fixed borders · cumulative recorded shutdowns",
    fotn:"Source: Freedom House, Freedom on the Net (2025)<br/>Fixed borders · 72 countries assessed",
    ixp:"Source: PeeringDB (2026)<br/>Fixed borders · active internet exchanges per country",
    ipv6:"Source: Google (2026)<br/>Fixed borders · native IPv6 traffic, current snapshot"};
  d3.select(".foot").html(FOOT[layer]||
    "Source: OWID/ITU · World Bank (2025)<br/>Fixed borders · latest value where series ends");
  buildLabels();buildRank();redraw();paint(true);updateTlPos();
});
d3.selectAll("#thresh button").on("click",function(){
  d3.selectAll("#thresh button").classed("on",false);d3.select(this).classed("on",true);
  mode=this.dataset.m;d3.select("#ythr").text(mode==="g50"?"50":"40");
  buildLabels();buildRank();redraw();paint(true);
  if(year!=null)setYear(year,false);
  if(panelIso)renderPanel();});
d3.selectAll(".btn[data-h]").on("click",function(){
  const h=this.dataset.h;highlight=(highlight===h)?null:h;
  d3.selectAll(".btn[data-h]").classed("on",false);if(highlight)d3.select(this).classed("on",true);
  if(year!=null)exitTimelapse();
  buildLabels();buildRank();redraw();paint(true);});
d3.select("#reset").on("click",()=>{highlight=null;exitTimelapse();closePanel();resetZoom();
  d3.selectAll(".btn[data-h]").classed("on",false);
  buildLabels();buildRank();redraw();paint(true);});
addEventListener("resize",()=>{if(loaded)fit();resetZoom();updateTlPos();});
