/* The race to half online — map app.
   Data files (loaded before this script):
     data/adoption.js -> window.ADOPTION  (per-country annual series + threshold metrics)
     data/geo.js      -> window.GEO       (topojson id -> iso, dot coords, id -> name)
     data/events.js   -> window.EVENTS    (curated internet-history milestones)         */

const DATA={}; ADOPTION.countries.forEach(c=>DATA[c.iso]=c);
const WORLD=ADOPTION.world||null;
const N2I=GEO.num2iso, DOTS=GEO.dots, NUM2NAME=GEO.num2name;
const FAST=["KOR","CYM","CAN","SVK","KAZ","NOR","AUS","CHE","NZL","SWE"];
const SLOW=["STP","EGY","PER","NIC","TJK","BOL","BLZ","THA","JAM","MEX"];
const LEAP=["DJI","KHM","BWA","IRQ","MMR","BTN","GAB","SEN","LAO"];
const SETS={fast:new Set(FAST),slow:new Set(SLOW),leap:new Set(LEAP)};
const NEVER="#20252d",CENSOR="#5b4a2e",NODATA="#20252d";
const scale=d3.scaleLinear().domain([2,8,17]).range(["#17b8a6","#e9e0c9","#e8582c"]).clamp(true);
// % online ramp (dark-mode sequential, validated): 0% -> 100%
const PCT_STOPS=["#155449","#146b58","#158468","#16a084","#17b8a6","#6fdec4","#c8f7e6"];
const pctScale=d3.scaleLinear()
  .domain(PCT_STOPS.map((_,i)=>i*100/(PCT_STOPS.length-1))).range(PCT_STOPS).clamp(true);

const START=1990,END=2024;
let mode="g50",view="flat",year=null,highlight=null,playing=false,timer=null;
let feats50=[],feats110=[],loaded=false,centroid={};

const svg=d3.select("#map"),tip=d3.select("#tip"),app=d3.select("#app");
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
const sphere=svg.append("path").attr("class","sphere").datum({type:"Sphere"});
const gGrat=svg.append("path").attr("class","graticule");
const gGeo=svg.append("g"),gDot=svg.append("g"),gLbl=svg.append("g"),gFx=svg.append("g");

function feats(){return view==="flat"?feats50:feats110;}
function gapOf(d){return mode==="g50"?d.gap50:d.gap40;}
function ycOf(d){return mode==="g50"?d.y50:d.y40;}

/* ── colour ────────────────────────────────────────────────────── */
function valueAt(iso,yr){const d=DATA[iso];if(!d||yr<d.sy)return null;
  return d.v[Math.min(yr,END)-d.sy];}
function baseColor(iso){const d=DATA[iso];if(!d)return NODATA;const g=gapOf(d);
  if(g==null)return d.y10!=null?CENSOR:NEVER;return scale(g);}
function pctColor(iso){const v=valueAt(iso,year);return v==null?NODATA:pctScale(v);}
function colorOf(iso){return year!=null?pctColor(iso):baseColor(iso);}
function inHi(iso){if(!highlight)return true;
  if(highlight==="never"){const d=DATA[iso];return d&&!d.reached50&&d.y10!=null;}
  return SETS[highlight].has(iso);}

/* ── geometry ──────────────────────────────────────────────────── */
function bindGeo(){
  gGeo.selectAll("path.land").data(feats(),d=>d.id).join(
    en=>en.append("path").attr("class","land")
        .on("mousemove",(e,d)=>{enterFeat(d);move(e);}).on("mouseleave",leave),
    up=>up,ex=>ex.remove());
}
function fit(){
  W=innerWidth;H=innerHeight;
  if(view==="flat"){proj=projFlat;proj.fitExtent([[12,92],[W-12,H-84]],{type:"Sphere"});
    sphere.attr("fill","#0e1116");svg.classed("globe",false);}
  else{proj=projGlobe;const R=Math.min(W-40,H-150);
    projGlobe.fitExtent([[(W-R)/2,(H-R)/2-6],[(W+R)/2,(H+R)/2-6]],{type:"Sphere"});
    sphere.attr("fill","url(#ocean)");svg.classed("globe",true);}
  path=d3.geoPath(proj);redraw();paint(false);
}
function onFront(lonlat){if(view==="flat")return true;const c=projGlobe.rotate();
  return d3.geoDistance(lonlat,[-c[0],-c[1]])<1.57;}
function redraw(){
  sphere.attr("d",path);
  gGrat.attr("d",view==="globe"?path(graticule):null);
  gGeo.selectAll("path.land").attr("d",path);
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

/* ── labels & rank panel ───────────────────────────────────────── */
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
function buildRank(){
  const rank=d3.select("#rank"),leg=d3.select("#legend");
  if(!highlight){rank.classed("show",false);leg.style("display",null);return;}
  leg.style("display","none");rank.classed("show",true);
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
  updateEvents();paint(anim);
}
function enterTimelapse(){
  highlight=null;d3.selectAll(".btn[data-h]").classed("on",false);
  buildLabels();buildRank();
  app.classed("tl",true).classed("showyear",true);
  d3.select("#yearbox").classed("show",true);
}
function exitTimelapse(){
  year=null;shownEvYear=null;pausePlay();
  app.classed("tl",false).classed("showyear",false);
  d3.select("#yearbox").classed("show",false);
  d3.select("#evcard").classed("show",false);
  gFx.selectAll("circle").remove();
}
function pausePlay(){playing=false;clearTimeout(timer);
  d3.select("#play").html((year!=null&&year<END)?"▶ Resume":"▶ Play 1990–2024");}
function tickPlay(){
  if(!playing)return;
  if(year>=END){pausePlay();return;}
  setYear(year+1,true);
  timer=setTimeout(tickPlay,EVYEARS.includes(year)?1700:640);
}
d3.select("#play").on("click",()=>{
  if(playing){pausePlay();return;}
  const fresh=(year==null||year>=END);
  if(year==null)enterTimelapse();
  playing=true;d3.select("#play").html("❚❚ Pause");
  if(fresh){setYear(START,false);timer=setTimeout(tickPlay,EVYEARS.includes(START)?1700:900);}
  else timer=setTimeout(tickPlay,300);
});
slider.addEventListener("input",()=>{
  if(year==null)enterTimelapse();
  pausePlay();setYear(+slider.value,false);
});
buildTicks();

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
    .on("mousemove",(e,d)=>{enter(d);move(e);}).on("mouseleave",leave);
  loaded=true;bindGeo();fit();
  const yq=+new URLSearchParams(location.search).get("y");
  if(yq>=START&&yq<=END){enterTimelapse();setYear(yq,false);pausePlay();}
}).catch(()=>{d3.select("#app").append("div").style("position","absolute").style("top","50%")
   .style("left","0").style("width","100%").style("text-align","center").style("color","#9aa4b2")
   .html("Map geometry could not load (offline?). Data is intact — reconnect and reload.");});

/* ── chrome: clean mode, view, threshold, highlights, reset ────── */
d3.select("#cleanbtn").on("click",function(){
  const on=!app.classed("clean");app.classed("clean",on);
  this.textContent=on?"Show UI":"Hide UI";
});
let autorotate=false,spinning=false,dragging=false;
d3.selectAll("#viewseg button").on("click",function(){
  const v=this.dataset.v;if(v===view)return;
  d3.selectAll("#viewseg button").classed("on",false);d3.select(this).classed("on",true);
  view=v;bindGeo();fit();
  if(view==="globe"){d3.select("#hint").classed("show",true);setTimeout(()=>d3.select("#hint").classed("show",false),3200);
    autorotate=true;startSpin();}else{autorotate=false;}
});
function startSpin(){if(spinning)return;spinning=true;let last=0;
  function tick(t){if(!autorotate||view!=="globe"){spinning=false;return;}
    if(last){const r=projGlobe.rotate();projGlobe.rotate([r[0]+(t-last)*0.010,r[1]]);redraw();}
    last=t;requestAnimationFrame(tick);}requestAnimationFrame(tick);}
const drag=d3.drag()
  .on("start",()=>{if(view!=="globe")return;dragging=true;autorotate=false;svg.classed("grab",true);})
  .on("drag",(ev)=>{if(view!=="globe")return;const r=projGlobe.rotate(),k=.26;
     let ph=Math.max(-89,Math.min(89,r[1]-ev.dy*k));projGlobe.rotate([r[0]+ev.dx*k,ph]);redraw();})
  .on("end",()=>{dragging=false;svg.classed("grab",false);
     if(view==="globe"){autorotate=true;startSpin();}});
svg.call(drag);
d3.selectAll("#thresh button").on("click",function(){
  d3.selectAll("#thresh button").classed("on",false);d3.select(this).classed("on",true);
  mode=this.dataset.m;d3.select("#ythr").text(mode==="g50"?"50":"40");
  buildLabels();buildRank();redraw();paint(true);if(year!=null)setYear(year,false);});
d3.selectAll(".btn[data-h]").on("click",function(){
  const h=this.dataset.h;highlight=(highlight===h)?null:h;
  d3.selectAll(".btn[data-h]").classed("on",false);if(highlight)d3.select(this).classed("on",true);
  if(year!=null)exitTimelapse();
  buildLabels();buildRank();redraw();paint(true);});
d3.select("#reset").on("click",()=>{highlight=null;exitTimelapse();
  d3.selectAll(".btn[data-h]").classed("on",false);
  buildLabels();buildRank();redraw();paint(true);});
addEventListener("resize",()=>{if(loaded)fit();});
