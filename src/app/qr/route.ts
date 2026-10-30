import type { NextRequest } from "next/server";
import { gateScreenAllowed, gateScreenForbidden } from "@/lib/gate";
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

export async function GET(req: NextRequest) {
  if (!(await gateScreenAllowed(req))) return gateScreenForbidden();
  const rawKey = req.nextUrl.searchParams.get("k") || "";
  const k = /^[\w.-]{8,80}$/.test(rawKey) ? rawKey : "";
  const withKey = (path: string) => {
    if (!k) return path;
    return path.includes("?") ? `${path}&k=${encodeURIComponent(k)}` : `${path}?k=${encodeURIComponent(k)}`;
  };
  const screen = await gateScreenFiles().catch(() => null);
  const v = screen?.v || 0;
  const posterSrc = screen?.posterAbs ? withKey(`/api/qr/poster?v=${v}`) : "";
  const videoSrc = screen?.videoAbs ? withKey(`/api/qr/screen?v=${v}`) : "";
  const qrSrc = withKey("/api/qr/image");
  const qrJoin = qrSrc.includes("?") ? "&" : "?";
  const probeSrc = withKey("/api/qr/screen?probe=1");
  const screenSrc = withKey("/api/qr/screen");
  const screenJoin = screenSrc.includes("?") ? "&" : "?";
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="120" id="rf">
<title>Видеал.Док — вход</title>
<style>
html, body { margin: 0; height: 100%; background: #16324f; }
.vd-gate { position: fixed; top: 0; right: 0; bottom: 0; left: 0; overflow: hidden; background: #16324f; color: #16324f; font-family: Arial, Helvetica, sans-serif; }
#m, #m img, #m video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
#m img { z-index: 2; object-fit: cover; }
#m video { z-index: 1; object-fit: cover; }
.vd-gate-side { position: absolute; top: 0; right: 0; bottom: 0; width: 40%; z-index: 4; overflow: hidden; background: #f3eee6; text-align: center; }
.vd-gate-side:before { content: ""; position: absolute; top: 0; left: 0; bottom: 0; width: 6px; background: #a57c3b; }
.vd-gate-gold { position: absolute; top: 0; left: 0; right: 0; height: 8px; background: #a57c3b; }
.vd-gate-stamp { position: absolute; top: 4%; left: 8%; right: 6%; height: 4%; margin: 0; overflow: hidden; font-family: Georgia, "Times New Roman", Times, serif; font-size: 15px; letter-spacing: 0.12em; color: #a57c3b; }
.vd-gate-title { position: absolute; top: 8%; left: 6%; right: 6%; height: 7%; margin: 0; overflow: hidden; font-family: Georgia, "Times New Roman", Times, serif; font-size: 34px; line-height: 1.1; font-weight: 700; color: #16324f; }
.vd-gate-clock { position: absolute; top: 15%; left: 6%; right: 6%; height: 11%; margin: 0; overflow: hidden; font-family: Georgia, "Times New Roman", Times, serif; font-size: 72px; line-height: 1; font-weight: 700; color: #16324f; }
.vd-gate-caption { position: absolute; top: 27%; left: 8%; right: 8%; height: 8%; margin: 0; overflow: hidden; font-size: 20px; line-height: 1.3; color: #6b6258; }
.vd-gate-qrbox { position: absolute; top: 36%; left: 12%; right: 10%; height: 46%; overflow: hidden; background: #fffcf7; border: 3px solid #a57c3b; }
.vd-gate-qrbox img { display: block; height: 84%; width: auto; max-width: 84%; margin: 8% auto 0; border: 0; }
.vd-gate-note { position: absolute; top: 84%; left: 8%; right: 8%; height: 12%; margin: 0; overflow: hidden; font-size: 16px; line-height: 1.35; color: #6b6258; }
</style>
</head>
<body>
<main class="vd-gate">
<div id="m" data-src="${videoSrc}" data-poster="${posterSrc}">${posterSrc ? `<img src="${posterSrc}" alt="">` : ""}</div>
<section class="vd-gate-side">
<div class="vd-gate-gold"></div>
<p class="vd-gate-stamp">ООО «Видеаль Медиа»</p>
<p class="vd-gate-title">Видеал.Док</p>
<p class="vd-gate-clock" id="c">${clock()}</p>
<p class="vd-gate-caption">Отсканируйте, чтобы отметить приход или уход</p>
<div class="vd-gate-qrbox"><img id="q" src="${qrSrc}" alt="QR для отметки прихода и ухода"></div>
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
var qrBase=${JSON.stringify(qrSrc)};
var qrJoin=${JSON.stringify(qrJoin)};
setInterval(function(){
  var img=document.getElementById("q");
  if(img) img.src=qrBase+qrJoin+"t="+new Date().getTime();
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
    x.open("GET",${JSON.stringify(probeSrc)},true);
    x.onload=function(){
      if(x.status===204){
        clearInterval(t);
        startVideo(${JSON.stringify(screenSrc)}+${JSON.stringify(screenJoin)}+"v="+new Date().getTime());
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
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
