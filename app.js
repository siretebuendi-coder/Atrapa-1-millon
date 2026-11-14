"use strict";
/* =========================================================
   EL MILLÓN · juego de trampillas (inspirado en Atrapa un millón)
   - Pantalla principal (tele): dirige la partida y muestra el QR.
   - Móviles: cada pareja escanea el QR y arrastra sus fajos.
   - Sincronización en tiempo real: Supabase Realtime (broadcast + presence).
   ========================================================= */

/* ================= CONFIG ================= */
const PACK = 50000;           // valor de cada fajo
const NP = 20;                // 20 fajos = 1.000.000 €
const LV = [4,4,4,4,3,3,3,2]; // respuestas por pregunta (formato del programa)
const GS = window.GAME_SETTINGS || {};
const TQ = GS.segundosPregunta || 60;
const TC = GS.segundosTema || 15;
const MAXT = 3;               // máximo de parejas
const L = "ABCD";

/* ================= UTILIDADES ================= */
const $ = s => document.querySelector(s);
const sum = a => a.reduce((x,y)=>x+y,0);
const fmt = p => (p*PACK).toLocaleString("es-ES") + " €";
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function clean(s){return String(s||"").replace(/[\u0000-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁯﻿]/g,"").trim().slice(0,22);}
function genCode(){const A="ABCDEFGHJKLMNPQRSTUVWXYZ";let s="";for(let i=0;i<4;i++)s+=A[Math.floor(Math.random()*A.length)];return s;}
let toastT;function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("on");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("on"),2600);}
function bricks(n){return '<i class="b"></i>'.repeat(Math.max(0,n|0));}
function timerHTML(left,total){return `<div class="timer ${left<=10?"warn":""}" style="--p:${Math.max(0,left/total)}"><span>${left}</span></div>`;}
function joinURL(code){return location.origin+location.pathname+"?join="+code;}
function qrSVG(text){
  try{ const q=qrcode(0,"M"); q.addData(text); q.make(); return q.createSvgTag({cellSize:6,margin:0,scalable:true}); }
  catch(e){ return '<div style="color:#000;padding:20px;line-height:1.3">No se pudo generar el QR</div>'; }
}

/* ================= SONIDO (solo pantalla principal) ================= */
let AC=null;
function initAudio(){try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();AC.resume&&AC.resume();}catch(e){AC=null;}}
function tone(f,d,type,v,t0,f2){if(!AC)return;const t=AC.currentTime+(t0||0);const o=AC.createOscillator(),g=AC.createGain();o.type=type||"sine";o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);g.gain.setValueAtTime(v||.12,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g).connect(AC.destination);o.start(t);o.stop(t+d+.05);}
function sfx(k){if(role!=="host")return;try{
  if(k==="tick")tone(880,.07,"square",.05);
  else if(k==="start"){tone(392,.15,"triangle",.15);tone(523,.3,"triangle",.15,.15);}
  else if(k==="open")tone(320,.3,"sawtooth",.07,0,140);
  else if(k==="drop"){tone(200,.7,"sawtooth",.14,0,40);tone(90,.6,"square",.07,.1,35);}
  else if(k==="win")[523,659,784,1047].forEach((f,i)=>tone(f,.28,"triangle",.14,i*.12));
  else if(k==="lose")[392,330,262,196].forEach((f,i)=>tone(f,.4,"sawtooth",.09,i*.25));
}catch(e){}}

/* ================= SUPABASE ================= */
let sb=null;
try{
  const ok=window.supabase&&window.SUPABASE_URL&&window.SUPABASE_ANON_KEY&&!/TU-PROYECTO|PEGA-AQUI/.test(window.SUPABASE_URL+window.SUPABASE_ANON_KEY);
  if(ok) sb=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY,{realtime:{params:{eventsPerSecond:20}}});
}catch(e){sb=null;}
let ch=null;                  // canal de la partida
function leaveChannel(){ if(ch){ try{ sb.removeChannel(ch); }catch(e){} ch=null; } }

let role=null;                // null | "host" | "phone"
let nmove=1;                  // fajos que se mueven por arrastre
const animStart=new Map();

/* ================= ANFITRIÓN (pantalla principal) ================= */
let G=null, tmr=null, revT=null, hb=null;
let teamPres=[];              // parejas conectadas (presence)
const teamMsg={};             // último mensaje de cada pareja
function newGame(mode){
  G={mode,code:mode==="online"?genCode():"",teams:[],ph:"lobby",qn:0,ti:0,seq:0,cats:[],q:null,ok:-1,alloc:[],left:0,lock:false,res:null,used:new Set(),lobby:[],onl:new Set(),nLocal:2,localNames:["Pareja 1","Pareja 2","Pareja 3"]};
}
function pub(){
  return {ph:G.ph,code:G.code,qn:G.qn,seq:G.seq,turn:(G.teams[G.ti]&&G.teams[G.ti].id)||null,cats:G.cats,
    q:G.q?{t:G.q.q,o:G.q.o,c:G.q.c,r:G.q.real}:null,left:G.left,alloc:G.alloc,lock:G.lock,res:G.res,
    teams:G.teams.map(t=>({id:t.id,n:t.name,m:t.money,out:t.out})),lobby:G.lobby.map(t=>({id:t.id,n:t.name})),ts:Date.now()};
}
function publish(){ if(ch&&G&&G.mode==="online") ch.send({type:"broadcast",event:"state",payload:pub()}).catch(()=>{}); }
function hostOnline(){
  newGame("online"); role="host"; render();
  ch=sb.channel("millon-"+G.code,{config:{broadcast:{self:false},presence:{key:"host"}}});
  ch.on("presence",{event:"sync"},()=>{
      const st=ch.presenceState(); const list=[];
      Object.values(st).forEach(arr=>arr.forEach(m=>{if(m&&m.role==="team"&&typeof m.tid==="string")list.push(m);}));
      teamPres=list; onHostPeers(); publish();
    })
    .on("broadcast",{event:"team"},({payload})=>{
      if(payload&&typeof payload.tid==="string"){teamMsg[payload.tid]=payload;onHostPeers();}
    })
    .on("broadcast",{event:"hello"},()=>publish())
    .subscribe(async status=>{
      if(status==="SUBSCRIBED"){ await ch.track({role:"host"}); publish(); }
      else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT") toast("Problema de conexión con Supabase. Revisa js/config.js");
    });
  clearInterval(hb); hb=setInterval(publish,2000);   // latido para quien entre tarde
}
function validAlloc(a,money,n){
  if(!Array.isArray(a)||a.length!==n)return null;
  let s=0;for(const v of a){if(!Number.isInteger(v)||v<0)return null;s+=v;}
  if(s>money||!a.includes(0))return null;
  return a.slice();
}
function onHostPeers(){
  if(!G)return;
  G.onl=new Set(teamPres.map(m=>m.tid));
  if(G.ph==="lobby"){
    const m=new Map();
    teamPres.forEach(pr=>{if(!m.has(pr.tid))m.set(pr.tid,{id:pr.tid.slice(0,40),name:clean(pr.name)||"Pareja",t0:+pr.t0||0});});
    G.lobby=[...m.values()].sort((a,b)=>a.t0-b.t0).slice(0,MAXT);
    render(); return;
  }
  const cur=G.teams[G.ti];
  if(cur){
    const pr=teamMsg[cur.id];
    if(pr&&pr.k===G.seq){
      if(G.ph==="cat"&&(pr.cat===0||pr.cat===1)&&pr.cat<G.cats.length){chooseCat(pr.cat);return;}
      if(G.ph==="q"&&!G.lock){
        const a=validAlloc(pr.alloc,cur.money,G.q.o.length);
        if(a&&a.join()!==G.alloc.join()){G.alloc=a;publish();}
        if(pr.lock===true){lockIn();return;}
      }
    }
  }
  render();
}
function avail(n){const r=[];BANK.forEach((b,i)=>{if(b.o.length===n&&!G.used.has(i))r.push(i);});return r;}
function pickCats(){
  const n=LV[G.qn];
  if(!avail(n).length) BANK.forEach((b,i)=>{if(b.o.length===n)G.used.delete(i);});
  return shuffle([...new Set(avail(n).map(i=>BANK[i].c))]).slice(0,2);
}
function startTimer(sec,done){
  stopTimer(); const end=Date.now()+sec*1000; G.left=sec;
  tmr=setInterval(()=>{
    const l=Math.max(0,Math.ceil((end-Date.now())/1000));
    if(l!==G.left){G.left=l;if(G.ph==="q"&&l<=10&&l>0)sfx("tick");publish();render();}
    if(l<=0){stopTimer();done();}
  },200);
}
function stopTimer(){if(tmr){clearInterval(tmr);tmr=null;}}
function startGame(){
  const src=G.mode==="online"?G.lobby:G.localNames.slice(0,G.nLocal).map((n,i)=>({id:"L"+i,name:clean(n)||("Pareja "+(i+1))}));
  if(!src.length)return;
  G.teams=src.map(t=>({id:t.id,name:t.name,money:NP,out:false}));
  G.qn=0;G.ti=0;animStart.clear();beginTurn();
}
function beginTurn(){
  clearTimeout(revT);
  G.seq++;G.cats=pickCats();G.q=null;G.alloc=[];G.lock=false;G.res=null;G.ph="cat";
  startTimer(TC,()=>chooseCat(Math.floor(Math.random()*G.cats.length)));
  publish();render();
}
function chooseCat(i){
  if(G.ph!=="cat")return;
  const n=LV[G.qn], c=G.cats[i]!==undefined?G.cats[i]:G.cats[0];
  let pool=avail(n).filter(j=>BANK[j].c===c); if(!pool.length)pool=avail(n);
  const j=pool[Math.floor(Math.random()*pool.length)]; G.used.add(j);
  const b=BANK[j]; const idx=shuffle([...b.o.keys()]);
  G.q={q:b.q,c:b.c,real:b.real,o:idx.map(k=>b.o[k])}; G.ok=idx.indexOf(0);
  G.alloc=Array(n).fill(0); G.ph="q"; sfx("start");
  startTimer(TQ,lockIn); publish(); render();
}
function lockIn(){
  if(G.ph!=="q")return;
  stopTimer(); G.lock=true; G.ph="rev";
  const cur=G.teams[G.ti];
  G.res={open:[],done:false,ok:-1,unp:cur.money-sum(G.alloc)};
  publish(); render();
  const wrong=G.alloc.map((v,i)=>i).filter(i=>i!==G.ok).sort((a,b)=>G.alloc[a]-G.alloc[b]);
  let k=0;
  const step=()=>{
    if(k<wrong.length){
      const w=wrong[k++]; G.res={...G.res,open:[...G.res.open,w]};
      sfx(G.alloc[w]>0?"drop":"open"); publish(); render(); revT=setTimeout(step,2300);
    }else{
      cur.money=G.alloc[G.ok]; if(cur.money<=0)cur.out=true;
      G.res={...G.res,ok:G.ok,done:true};
      sfx(cur.money>0?"win":"lose"); publish(); render(); revT=setTimeout(nextTurn,9000);
    }
  };
  revT=setTimeout(step,2600);
}
function nextTurn(){
  clearTimeout(revT);
  if(G.ph!=="rev"||!G.res||!G.res.done)return;
  let ti=G.ti+1, qn=G.qn;
  for(;;){
    if(ti>=G.teams.length){ti=0;qn++;}
    if(qn>=LV.length||G.teams.every(t=>t.out)){G.ph="end";G.cats=[];publish();render();return;}
    if(!G.teams[ti].out)break;
    ti++;
  }
  G.ti=ti;G.qn=qn;beginTurn();
}
function backToLobby(){
  stopTimer();clearTimeout(revT);
  G.ph="lobby";G.teams=[];G.q=null;G.res=null;G.alloc=[];G.cats=[];G.qn=0;G.ti=0;
  onHostPeers(); publish();
}

/* ================= MÓVIL (pareja) ================= */
function getTid(){let t=null;try{t=localStorage.getItem("millon_tid");}catch(e){}if(!t){t="t"+Math.random().toString(36).slice(2,12);try{localStorage.setItem("millon_tid",t);}catch(e){}}return t;}
let savedName="";try{savedName=localStorage.getItem("millon_name")||"";}catch(e){}
const P={code:"",name:savedName,tid:getTid(),t0:Date.now(),joined:false,s:null,alloc:[],k:-1,lock:false,cat:null,lastSend:0};
function sendP(){
  if(!ch)return; P.lastSend=Date.now();
  ch.send({type:"broadcast",event:"team",payload:{tid:P.tid,k:P.k,alloc:P.alloc,lock:P.lock,cat:P.cat}}).catch(()=>{});
}
function phoneJoin(){
  P.code=P.code.toUpperCase().replace(/[^A-Z]/g,"");
  P.name=clean(P.name);
  if(P.code.length!==4)return toast("El código tiene 4 letras (lo ves en la tele)");
  if(!P.name)return toast("Poned un nombre a vuestra pareja");
  if(!sb)return toast("Falta configurar Supabase (js/config.js)");
  try{localStorage.setItem("millon_name",P.name);}catch(e){}
  leaveChannel();
  ch=sb.channel("millon-"+P.code,{config:{broadcast:{self:false},presence:{key:P.tid}}});
  ch.on("broadcast",{event:"state"},({payload})=>{ if(payload&&payload.code===P.code){P.s=payload;onPhoneState();} })
    .subscribe(async status=>{
      if(status==="SUBSCRIBED"){
        await ch.track({role:"team",tid:P.tid,name:P.name,t0:P.t0});
        ch.send({type:"broadcast",event:"hello",payload:{}}).catch(()=>{});
        sendP();
      } else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT") toast("Problema de conexión. Reintentando…");
    });
  P.joined=true; render();
}
function onPhoneState(){
  const s=P.s, mine=s&&s.turn===P.tid;
  if(mine&&s.seq!==P.k){P.k=s.seq;P.alloc=[];P.lock=false;P.cat=null;sendP();}
  if(mine&&s.ph==="q"&&s.q&&P.alloc.length!==s.q.o.length){P.alloc=Array(s.q.o.length).fill(0);sendP();}
  // reenvío periódico por si algún mensaje se pierde
  if(mine&&(s.ph==="q"||s.ph==="cat")&&Date.now()-P.lastSend>1500)sendP();
  if(!drag)render();
}

/* ================= ARRASTRAR FAJOS ================= */
function applyMove(alloc,money,from,to,n){
  if(from===to)return null;
  const a=alloc.slice(), bank=money-sum(a);
  n=from==="bank"?Math.min(n,bank):Math.min(n,a[+from]||0);
  if(n<=0)return null;
  if(from!=="bank")a[+from]-=n;
  if(to!=="bank")a[+to]+=n;
  if(!a.includes(0)){toast("¡Hay que dejar al menos una trampilla vacía!");return null;}
  return a;
}
function dragCtx(){
  if(role==="host"&&G&&G.mode==="local"&&G.ph==="q"&&!G.lock){
    const cur=G.teams[G.ti];return {alloc:G.alloc,money:cur.money,set:a=>{G.alloc=a;render();}};
  }
  if(role==="phone"&&P.s&&P.s.turn===P.tid&&P.s.ph==="q"&&!P.lock&&P.s.q){
    const me=P.s.teams.find(t=>t.id===P.tid); if(!me)return null;
    if(P.alloc.length!==P.s.q.o.length)P.alloc=Array(P.s.q.o.length).fill(0);
    return {alloc:P.alloc,money:me.m,set:a=>{P.alloc=a;sendP();render();}};
  }
  return null;
}
let drag=null;
function moveGhost(x,y){
  if(!drag)return;
  drag.g.style.transform=`translate(${x}px,${y}px)`;
  const el=document.elementFromPoint(x,y); const t=el&&el.closest("[data-drop]");
  document.querySelectorAll(".hover").forEach(e=>{if(e!==t)e.classList.remove("hover");});
  if(t)t.classList.add("hover");
}
document.addEventListener("pointerdown",e=>{
  const src=e.target.closest("[data-src]"); if(!src)return;
  const ctx=dragCtx(); if(!ctx)return;
  const from=src.dataset.src;
  const have=from==="bank"?ctx.money-sum(ctx.alloc):(ctx.alloc[+from]||0);
  if(have<=0)return;
  e.preventDefault();
  const n=nmove==="all"?have:Math.min(nmove,have);
  const g=document.createElement("div"); g.className="ghost";
  g.innerHTML=`<div class="gb">${bricks(Math.min(n,6))}</div><span>${fmt(n)}</span>`;
  document.body.appendChild(g); drag={from,n,g}; moveGhost(e.clientX,e.clientY);
});
document.addEventListener("pointermove",e=>{if(drag){e.preventDefault();moveGhost(e.clientX,e.clientY);}},{passive:false});
document.addEventListener("pointerup",e=>{
  if(!drag)return; const d=drag; drag=null; d.g.remove();
  document.querySelectorAll(".hover").forEach(x=>x.classList.remove("hover"));
  const el=document.elementFromPoint(e.clientX,e.clientY); const t=el&&el.closest("[data-drop]");
  const ctx=dragCtx();
  if(t&&ctx){
    const a=applyMove(ctx.alloc,ctx.money,d.from,t.dataset.drop,d.n);
    if(a){ctx.set(a);try{navigator.vibrate&&navigator.vibrate(12);}catch(_){}return;}
  }
  render();
});
document.addEventListener("pointercancel",()=>{if(drag){drag.g.remove();drag=null;render();}});
document.addEventListener("touchmove",e=>{if(drag)e.preventDefault();},{passive:false});

/* ================= VISTAS ================= */
function zonesHTML(s,inter){
  const res=s.ph==="rev"?s.res:null;
  return s.q.o.map((o,i)=>{
    const v=s.alloc[i]||0, opened=!!(res&&res.open.includes(i)), ok=!!(res&&res.done&&res.ok===i);
    let fc="",st="";
    if(opened){const key=s.seq+"-"+i;if(!animStart.has(key))animStart.set(key,Date.now());const el=Date.now()-animStart.get(key);if(el>1700)fc="gone";else{fc="falling";st=` style="--d:-${el}ms"`;}}
    return `<div class="zone ${opened?"open "+fc:""} ${ok?"ok":""}"${st} ${inter?`data-drop="${i}"`:""}>
      <div class="zl"><span class="let">${L[i]}</span><span>${esc(o)}</span></div>
      <div class="stack" ${inter&&v>0?`data-src="${i}"`:""}>${bricks(v)}</div>
      <div class="za">${v?fmt(v):"—"}</div>${opened?'<div class="hole">✕</div>':""}</div>`;
  }).join("");
}
function controls(bank){
  return `<div class="ctrl">
    <div class="bank" data-drop="bank"><div class="bl">Sin colocar<br><b>${fmt(bank)}</b></div><div class="stack" ${bank>0?'data-src="bank"':""}>${bricks(bank)}</div></div>
    <div class="chips">Fajos por arrastre: ${[1,2,5,"all"].map(n=>`<button class="chip ${nmove===n?"on":""}" data-act="n" data-v="${n}">${n==="all"?"Todos":n===1?"1 (50.000 €)":n}</button>`).join("")}</div>
    <button class="big lock" data-act="lock">${bank>0?`Confirmar (se perderán ${fmt(bank)})`:"¡Confirmar respuesta!"}</button></div>`;
}
function endHTML(s,tv){
  const r=[...s.teams].sort((a,b)=>b.m-a.m), w=r[0];
  return `<div class="end"><div class="brand big">EL MILLÓN</div>
   <h2>${w&&w.m>0?`🏆 ${esc(w.n)} se lleva ${fmt(w.m)}`:"Nadie ha conseguido atrapar el dinero"}</h2>
   <div class="rank">${r.map((t,i)=>`<div class="rk"><span>${i+1}. ${esc(t.n)}</span><span>${fmt(t.m)}</span></div>`).join("")}</div>
   ${tv?'<button class="big" data-act="again">Nueva partida</button>':""}</div>`;
}
function landing(){
  const can=!!sb;
  const note=can?"":'<div class="note">⚠️ Falta configurar Supabase en <b>js/config.js</b> para conectar los móviles. Mientras tanto podéis jugar en un solo dispositivo.</div>';
  return `<div class="landing">
   <div class="brand huge">EL MILLÓN</div>
   <div class="sub">Juego de trampillas para 1 a 3 parejas · inspirado en <i>Atrapa un millón</i></div>
   <div class="roles">
     <button class="role" data-act="tv" ${can?"":"disabled"}>📺<b>Pantalla principal</b><span>Ábrelo en la tele o el portátil</span></button>
     <button class="role" data-act="phone" ${can?"":"disabled"}>📱<b>Soy una pareja</b><span>O escanea el QR de la tele</span></button>
   </div>${note}
   <button class="link" data-act="local">o jugad todos en un solo dispositivo</button>
   <details class="rules"><summary>Reglas (como en el programa)</summary><ul>
     <li>Cada pareja empieza con <b>1.000.000 €</b> en <b>20 fajos de 50.000 €</b>.</li>
     <li><b>8 preguntas</b>: de la 1 a la 4 hay 4 respuestas; de la 5 a la 7, 3 respuestas; la 8ª es el <b>todo o nada</b> con 2.</li>
     <li>Antes de cada pregunta, la pareja elige entre <b>dos temas</b>.</li>
     <li>Tenéis <b>${TQ} segundos</b> para arrastrar los fajos a las trampillas. Lo que quede sin colocar al acabar el tiempo, se pierde.</li>
     <li>Siempre hay que dejar <b>al menos una trampilla vacía</b>.</li>
     <li>Se abren las trampillas incorrectas y el dinero que haya encima cae. Os quedáis solo con lo de la respuesta buena.</li>
     <li>Se juega por turnos: cada pareja responde su pregunta y pasa a la siguiente.</li>
   </ul></details></div>`;
}
function hostLobby(){
  if(G.mode==="online"){
    const url=joinURL(G.code);
    return `<div class="lobby"><div class="brand big">EL MILLÓN</div>
     <div class="qrbox"><div class="qr">${qrSVG(url)}</div>
       <div class="qrside"><b>📱 Escanead el QR</b> con el móvil de cada pareja y poned vuestro nombre.<br>¿Sin cámara? Entrad en la web, pulsad «Soy una pareja» y usad el código:
       <div class="code">${G.code}</div><div class="url">${esc(url)}</div></div></div>
     <div class="lob-teams">${[0,1,2].map(i=>G.lobby[i]?`<div class="lt on">📱 ${esc(G.lobby[i].name)}</div>`:`<div class="lt">Esperando pareja ${i+1}…</div>`).join("")}</div>
     <button class="big" data-act="start" ${G.lobby.length?"":"disabled"}>Empezar partida</button>
     <p class="hint">Hasta ${MAXT} parejas. Las que entren primero juegan.</p></div>`;
  }
  return `<div class="lobby"><div class="brand big">EL MILLÓN</div>
    <p style="font-size:18px">Modo un solo dispositivo: cada pareja juega en su turno arrastrando los fajos en esta pantalla.</p>
    <div class="chips">Parejas: ${[1,2,3].map(n=>`<button class="chip ${G.nLocal===n?"on":""}" data-act="nteams" data-v="${n}">${n}</button>`).join("")}</div>
    <div class="lob-teams">${G.localNames.slice(0,G.nLocal).map((n,i)=>`<div class="lt on"><input data-in="tn${i}" maxlength="22" value="${esc(n)}"></div>`).join("")}</div>
    <button class="big" data-act="start">Empezar partida</button>
    <button class="link" data-act="home">← Volver</button></div>`;
}
function board(){
  const s=pub(), cur=s.teams.find(t=>t.id===s.turn);
  const inter=G.mode==="local"&&G.ph==="q"&&!G.lock;
  const top=`<div class="top"><div class="brand">EL MILLÓN</div><div class="qn">${s.ph==="end"?"Fin de la partida":`Pregunta ${s.qn+1} de 8 · ${LV[s.qn]} respuestas${s.qn===7?" · ¡Todo o nada!":""}`}</div>${(s.ph==="q"||s.ph==="cat")?timerHTML(s.left,s.ph==="q"?TQ:TC):""}</div>`;
  const score=`<div class="score">${s.teams.map(t=>`<div class="tm ${t.id===s.turn&&s.ph!=="end"?"cur":""} ${t.out?"out":""}"><div class="tn">${esc(t.n)}${G.mode==="online"?`<i class="dot ${G.onl.has(t.id)?"on":""}"></i>`:""}</div><div class="tmm">${t.out?"Eliminada":fmt(t.m)}</div></div>`).join("")}</div>`;
  let mid="";
  if(s.ph==="cat"){
    mid=`<div class="turn" style="margin-top:4vh">Turno de <b>${esc(cur.n)}</b> · elegid tema</div>
      <div class="cats">${s.cats.map((c,i)=>`<button class="catb" data-act="cat" data-v="${i}">${esc(c)}</button>`).join("")}</div>
      ${G.mode==="online"?'<p class="hint">La pareja elige desde su móvil (o tocad aquí)</p>':""}`;
  }else if(s.ph==="q"||s.ph==="rev"){
    const bank=cur.m-sum(s.alloc);
    mid=`<div class="turn">Turno de <b>${esc(cur.n)}</b> · ${esc(s.q.c)}${s.q.r?' <span class="real">★ salió en el programa</span>':""}</div>
      <div class="question">${esc(s.q.t)}</div>
      <div class="zones z${s.q.o.length}">${zonesHTML(s,inter)}</div>`;
    if(s.ph==="q") mid+= inter?controls(bank):`<div class="bankro">Sin colocar: <b>${fmt(bank)}</b></div><button class="ghostbtn" data-act="force">Cerrar el tiempo ya</button>`;
    if(s.ph==="rev"){
      if(s.res.done) mid+=`<div class="result ${cur.m>0?"good":"bad"}">Correcta: <b>${L[s.res.ok]}</b> · ${cur.m>0?`${esc(cur.n)} sigue con <b>${fmt(cur.m)}</b>`:`${esc(cur.n)} lo ha perdido todo`}</div><button class="big" data-act="next">Continuar ▶</button>`;
      else mid+=`<div class="result">Abriendo trampillas…${s.res.unp>0?` · ${fmt(s.res.unp)} sin colocar se han perdido`:""}</div>`;
    }
  }else if(s.ph==="end"){ mid=endHTML(s,true); }
  return top+score+mid;
}
function phoneView(){
  const W=h=>`<div class="pwrap">${h}</div>`;
  if(!P.joined) return `<div class="pwrap join"><div class="brand big">EL MILLÓN</div>
     <label>Código que sale en la tele<input class="codein" data-in="code" maxlength="4" value="${esc(P.code)}" placeholder="ABCD" autocomplete="off" autocapitalize="characters"></label>
     <label>Nombre de la pareja<input data-in="name" maxlength="22" value="${esc(P.name)}" placeholder="Ej.: Ana y Luis" autocomplete="off"></label>
     <button class="big" data-act="join">Entrar</button><button class="link" data-act="home">← Volver</button></div>`;
  const s=P.s;
  if(!s) return W(`<div class="wait">Buscando la pantalla principal con el código <b>${esc(P.code)}</b>…<br><small>La tele debe tener abierta la web en «Pantalla principal».</small></div>`);
  if(s.ph==="lobby"){
    const inL=s.lobby.some(t=>t.id===P.tid);
    return W(inL?`<div class="wait">✅ Estáis dentro como <b>${esc(P.name)}</b><br>Esperando a que empiece la partida…</div>`:`<div class="wait">Conectando…<br><small>Si ya hay ${MAXT} parejas, la sala está llena.</small></div>`);
  }
  if(s.ph==="end") return W(endHTML(s,false));
  const me=s.teams.find(t=>t.id===P.tid);
  if(!me) return W(`<div class="wait">La partida ya ha empezado. ¡Mirad la pantalla principal!</div>`);
  const mine=s.turn===P.tid, cur=s.teams.find(t=>t.id===s.turn);
  const head=`<div class="ph-head"><div>${esc(me.n)}</div><div class="money">${me.out?"Eliminados":fmt(me.m)}</div></div>`;
  if(mine&&s.ph==="cat") return W(head+`<div class="turn" style="margin:14px 0">¡Os toca! Pregunta ${s.qn+1} de 8 · elegid tema</div>${timerHTML(s.left,TC)}<div class="cats">${s.cats.map((c,i)=>`<button class="catb ${P.cat===i?"on":""}" data-act="cat" data-v="${i}">${esc(c)}</button>`).join("")}</div>`);
  if(mine&&s.ph==="q"&&s.q){
    const alloc=P.alloc.length===s.q.o.length?P.alloc:Array(s.q.o.length).fill(0);
    const locked=P.lock||s.lock, ss={...s,alloc};
    return W(head+`<div class="pq-top">${timerHTML(s.left,TQ)}<div class="question sm">${esc(s.q.t)}</div></div>
      <div class="zones vert">${zonesHTML(ss,!locked)}</div>
      ${locked?'<div class="wait">Respuesta confirmada. ¡Mirad la tele!</div>':controls(me.m-sum(alloc))}`);
  }
  let b=`<div class="turn" style="margin:12px 0">${mine?"Vuestro turno":`Turno de <b>${esc(cur&&cur.n)}</b>`} · Pregunta ${s.qn+1} de 8</div>`;
  if(s.q&&(s.ph==="q"||s.ph==="rev")){
    b+=`<div class="question sm">${esc(s.q.t)}</div><div class="zones vert mini">${zonesHTML(s,false)}</div>`;
    if(s.ph==="rev"&&s.res.done) b+=`<div class="result ${cur.m>0?"good":"bad"}">Correcta: <b>${L[s.res.ok]}</b> · ${cur.m>0?`quedan <b>${fmt(cur.m)}</b>`:"¡lo han perdido todo!"}</div>`;
  }else if(s.ph==="cat") b+=`<div class="wait">Están eligiendo tema…</div>`;
  return W(head+b+`<p class="hint">Mirad la pantalla principal 📺</p>`);
}
function render(){
  const app=$("#app");
  if(!role){app.className="";app.innerHTML=landing();return;}
  if(role==="host"){app.className="tv";app.innerHTML=G.ph==="lobby"?hostLobby():board();return;}
  app.className="phone";app.innerHTML=phoneView();
}

/* ================= ACCIONES ================= */
const ACT={
  tv(){initAudio();if(!sb)return toast("Falta configurar Supabase");hostOnline();},
  local(){initAudio();newGame("local");role="host";render();},
  phone(){if(!sb)return toast("Falta configurar Supabase");role="phone";render();},
  home(){ leaveChannel(); stopTimer(); clearInterval(hb); role=null; G=null; P.joined=false; P.s=null; history.replaceState(null,"",location.pathname); render(); },
  join(){phoneJoin();},
  nteams(v){G.nLocal=+v;render();},
  start(){initAudio();startGame();},
  cat(v){ if(role==="host")chooseCat(+v); else {P.cat=+v;sendP();render();} },
  n(v){nmove=v==="all"?"all":+v;render();},
  lock(){ if(role==="host")lockIn(); else {P.lock=true;sendP();render();} },
  force(){lockIn();},
  next(){nextTurn();},
  again(){backToLobby();}
};
document.addEventListener("click",e=>{const el=e.target.closest("[data-act]");if(!el||el.disabled)return;const f=ACT[el.dataset.act];if(f)f(el.dataset.v,el);});
document.addEventListener("input",e=>{
  const k=e.target.dataset&&e.target.dataset.in; if(!k)return;
  if(k==="code"){e.target.value=e.target.value.toUpperCase().replace(/[^A-Z]/g,"");P.code=e.target.value;}
  else if(k==="name")P.name=e.target.value;
  else if(k.startsWith("tn")&&G)G.localNames[+k.slice(2)]=e.target.value;
});
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&role==="phone"&&!P.joined)phoneJoin();});

/* Entrada directa desde el QR: ?join=ABCD */
(function(){
  const j=new URLSearchParams(location.search).get("join");
  if(j&&/^[A-Za-z]{4}$/.test(j)){ role="phone"; P.code=j.toUpperCase(); }
  render();
  if(role==="phone"){ const n=document.querySelector('[data-in="name"]'); if(n&&!P.name)n.focus(); }
})();
