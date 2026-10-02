import { gateScreenFiles } from "@/lib/gate-bg";

export const dynamic = "force-dynamic";

function clock() {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Omsk",
    hourCycle: "h23",
  }).format(new Date());
}

export async function GET() {
  const screen = await gateScreenFiles().catch(() => null);
  const v = screen?.v || 0;
  const posterSrc = screen?.posterAbs ? `/api/qr/poster?v=${v}` : "";
  const videoSrc = screen?.videoAbs ? `/api/qr/screen?v=${v}` : "";
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="120" id="rf">
<title>Вход</title>
<style>
html, body { margin: 0; height: 100%; background: #16324f; }
.vd-gate { position: fixed; top: 0; right: 0; bottom: 0; left: 0; overflow: hidden; background: #16324f; color: #fff; font-family: Arial, Helvetica, sans-serif; }
#m, #m img, #m video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
#m img { z-index: 2; }
#m video { z-index: 1; }
.vd-gate-side { position: absolute; top: 0; right: 0; bottom: 0; width: 42%; z-index: 4; overflow: hidden; background: #16324f; background: rgba(22,50,79,0.88); text-align: center; }
.vd-gate-clock { position: absolute; top: 4%; left: 4%; right: 4%; height: 12%; margin: 0; overflow: hidden; font-size: 64px; line-height: 1; font-weight: 700; }
.vd-gate-caption { position: absolute; top: 16%; left: 5%; right: 5%; height: 12%; margin: 0; overflow: hidden; font-size: 22px; line-height: 1.25; }
.vd-gate-qrbox { position: absolute; top: 29%; left: 12%; right: 10%; height: 48%; overflow: hidden; background: #fff; }
.vd-gate-qrbox img { display: block; height: 84%; width: auto; max-width: 84%; margin: 8% auto 0; border: 0; }
.vd-gate-note { position: absolute; top: 80%; left: 5%; right: 5%; height: 14%; margin: 0; overflow: hidden; font-size: 16px; line-height: 1.3; color: #d5deea; }
</style>
</head>
<body>
<main class="vd-gate">
<div id="m" data-src="${videoSrc}" data-poster="${posterSrc}">${posterSrc ? `<img src="${posterSrc}" alt="">` : ""}</div>
<section class="vd-gate-side">
<p class="vd-gate-clock" id="c">${clock()}</p>
<p class="vd-gate-caption">Отсканируйте, чтобы отметить приход или уход</p>
<div class="vd-gate-qrbox"><img id="q" src="/api/qr/image" alt="QR для отметки прихода и ухода"></div>
<p class="vd-gate-note">Код меняется каждые два часа. Время — Омск.</p>
</section>
</main>
<script>
var rf=document.getElementById("rf");
if(rf&&rf.parentNode) rf.parentNode.removeChild(rf);
var wake=null;
function hold(){
  if(!navigator.wakeLock||!navigator.wakeLock.request||wake) return;
  navigator.wakeLock.request("screen").then(function(lock){
    wake=lock;
    lock.addEventListener("release", function(){ wake=null; });
  }).catch(function(){});
}
function z(n){return n<10?"0"+n:String(n)}
function tick(){
  var d=new Date(new Date().getTime()+6*60*60*1000);
  var el=document.getElementById("c");
  if(el) el.innerHTML=z(d.getUTCHours())+":"+z(d.getUTCMinutes());
}
tick();
setInterval(tick,1000);
setInterval(function(){
  var img=document.getElementById("q");
  if(img) img.src="/api/qr/image?t="+new Date().getTime();
},120000);
function revive(v){
  if(!v||!v.paused) return;
  var p=v.play&&v.play();
  if(p&&p.catch) p.catch(function(){});
}
function startVideo(src){
  var box=document.getElementById("m");
  if(!box||box.getAttribute("data-on")=="1"||!src) return;
  box.setAttribute("data-on","1");
  var el=document.createElement("video");
  el.muted=true;
  el.setAttribute("muted","");
  el.setAttribute("autoplay","");
  el.setAttribute("loop","");
  el.setAttribute("playsinline","");
  el.setAttribute("webkit-playsinline","");
  var poster=box.getAttribute("data-poster")||"";
  if(poster) el.setAttribute("poster", poster);
  el.style.zIndex="1";
  el.onplaying=function(){ el.style.zIndex="3"; };
  el.onended=function(){
    try{ el.currentTime=0; }catch(e){}
    revive(el);
  };
  el.src=src;
  box.appendChild(el);
  revive(el);
}
function arm(){
  var box=document.getElementById("m");
  if(!box) return;
  var src=box.getAttribute("data-src")||"";
  if(src){ startVideo(src); return; }
  var n=0;
  var t=setInterval(function(){
    n+=1;
    if(n>24){ clearInterval(t); return; }
    var x=new XMLHttpRequest();
    x.open("GET","/api/qr/screen?probe=1",true);
    x.onload=function(){
      if(x.status===204){
        clearInterval(t);
        startVideo("/api/qr/screen?v="+new Date().getTime());
      }
    };
    x.send();
  },5000);
}
function fitQr(){
  var img=document.getElementById("q");
  if(!img||!img.parentNode) return;
  var box=img.parentNode;
  var bw=box.clientWidth;
  var bh=box.clientHeight;
  if(bw<40||bh<40) return;
  var s=bw<bh?bw:bh;
  s=Math.floor(s*0.86);
  img.style.width=s+"px";
  img.style.height=s+"px";
  img.style.maxWidth="none";
  img.style.display="block";
  img.style.marginLeft="auto";
  img.style.marginRight="auto";
  var top=Math.floor((bh-s)/2);
  if(top<0) top=0;
  img.style.marginTop=top+"px";
  img.style.marginBottom="0";
}
fitQr();
setTimeout(fitQr, 200);
var q=document.getElementById("q");
function begin(){ hold(); arm(); fitQr(); }
if(q && q.complete) begin();
else if(q) q.onload=begin;
setTimeout(begin, 2000);
setInterval(function(){
  hold();
  var box=document.getElementById("m");
  revive(box?box.getElementsByTagName("video")[0]:null);
},20000);
document.addEventListener("visibilitychange", function(){
  if(!document.hidden){ wake=null; hold(); }
});
</script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
