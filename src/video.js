/* ===== Video-Tab ===== */
(function(){
'use strict';
const {$,$$,fmtSize,fmtTime,fmtEta,parseTime,esc,pct,evenInt,Dest}=VK;
const MBN=window.Mediabunny;
const hasWC=!!(window.VideoEncoder&&window.VideoDecoder&&window.AudioDecoder&&window.AudioEncoder!==undefined)&&!!MBN;
const FORCE_FALLBACK=/[?&]fallback=1/.test(location.search);
const VIDEO_EXT=/\.(mp4|m4v|mov|mkv|webm|avi|mts|m2ts|ts|3gp|wmv|flv|ogv)$/i;

const PRESETS={
 hoch:{name:'Hoch',desc:'1080p · bis 60 fps · 8 Mbit/s',short:1080,fps:60,vb:8e6,ab:160e3,tag:'Gameplay'},
 mittel:{name:'Mittel',desc:'720p · bis 60 fps · 4 Mbit/s',short:720,fps:60,vb:4e6,ab:128e3,tag:'Beliebt'},
 klein:{name:'Klein',desc:'720p · 30 fps · 2 Mbit/s',short:720,fps:30,vb:2e6,ab:96e3},
 sehr:{name:'Sehr klein',desc:'480p · 30 fps · 1 Mbit/s · WhatsApp/Discord',short:480,fps:30,vb:1e6,ab:64e3},
 screen:{name:'Bildschirmaufnahme / Webinar',desc:'bis 1080p · 30 fps · 1,5 Mbit/s · Ton mono 64k',short:1080,fps:30,vb:1.5e6,ab:64e3,mono:true,tag:'Webinar'},
 custom:{name:'Benutzerdefiniert',desc:'Auflösung, FPS, Bitrate oder Zielgröße, Ton'}
};
const S={preset:'mittel'};
let items=[],nextId=1,running=false,cancelReq=false,curConv=null,curItem=null,fallbackRec=null;

/* ---------- Einstellungen / Plan ---------- */
function customSettings(){
  const g=id=>$('#'+id).value;
  return{res:g('c_res'),fps:g('c_fps'),mode:g('c_mode'),mbit:+g('c_mbit')||3,mb:+g('c_mb')||100,audio:g('c_audio')==='keep',ab:(+g('c_ab')||128)*1000};
}
function snapshot(){return{preset:S.preset,custom:customSettings()}}
function makePlan(it,snap){
  snap=snap||snapshot();const i=it.info;if(!i)return null;
  let shortT,fpsCap,vb,ab,mono=false,keepAudio=true,sizeMode=false,mb=0,capBitrate=true;
  if(snap.preset==='custom'){const c=snap.custom;shortT=c.res==='orig'?null:+c.res;fpsCap=c.fps==='orig'?null:+c.fps;keepAudio=c.audio;ab=c.ab;
    if(c.mode==='size'){sizeMode=true;mb=c.mb;capBitrate=false}else{vb=c.mbit*1e6;capBitrate=false}}
  else{const p=PRESETS[snap.preset];shortT=p.short;fpsCap=p.fps;vb=p.vb;ab=p.ab;mono=!!p.mono}
  const hasA=!!i.audio&&keepAudio;
  const short=Math.min(i.w,i.h);
  const ns=shortT?Math.min(short,shortT):short;const sc=ns/short;
  let w=i.w,h=i.h;
  if(sc<1){w=evenInt(i.w*sc);h=evenInt(i.h*sc)}else{w=i.w-(i.w%2);h=i.h-(i.h%2)}
  const srcFps=i.fps||30;
  const frameRate=(fpsCap&&srcFps>fpsCap+1)?fpsCap:null;
  const outFps=frameRate||srcFps;
  const t0=it.trim&&it.trim.start>0?it.trim.start:0,t1=it.trim&&it.trim.end>0?Math.min(it.trim.end,i.dur):i.dur;
  const dur=Math.max(0.1,t1-t0);
  if(!hasA)ab=0;
  if(sizeMode){vb=Math.max(80e3,(mb*1e6*0.96*8)/dur-ab)}
  let note='';
  if(capBitrate&&i.vbitrate){const cap=i.vbitrate*0.9;if(vb>cap){vb=Math.max(300e3,cap);note='Die Quelle hat schon eine niedrige Bitrate – Ziel wurde angepasst.'}}
  const est=(vb+ab)*dur/8*1.02;
  return{w,h,frameRate,outFps,vb:Math.round(vb),ab,hasA,mono,dur,t0,t1,est,note,scaled:sc<1,sizeMode,trimmed:t0>0||t1<i.dur-0.05};
}

/* ---------- UI: Presets ---------- */
function buildPresets(){
  const box=$('#presets');box.innerHTML='';
  for(const [k,p] of Object.entries(PRESETS)){
    const b=document.createElement('button');b.className='preset'+(k===S.preset?' on':'');b.dataset.k=k;
    b.innerHTML='<b>'+esc(p.name)+(p.tag?' <span class="tag">'+esc(p.tag)+'</span>':'')+'</b><small>'+esc(p.desc)+'</small>';
    b.onclick=()=>{S.preset=k;$$('.preset').forEach(x=>x.classList.toggle('on',x.dataset.k===k));$('#custom').hidden=k!=='custom';refreshAll()};
    box.appendChild(b);
  }
}
function wireCustom(){
  for(const id of ['c_res','c_fps','c_mode','c_mbit','c_mb','c_audio','c_ab'])$('#'+id).addEventListener('input',()=>{
    const c=customSettings();$('#c_brw').hidden=c.mode==='size';$('#c_szw').hidden=c.mode!=='size';$('#c_abw').hidden=!c.audio;refreshAll()});
}

/* ---------- Analyse einer Datei ---------- */
async function analyze(it){
  const input=new MBN.Input({source:new MBN.BlobSource(it.file),formats:MBN.ALL_FORMATS});
  try{
    const vt=await input.getPrimaryVideoTrack();
    if(!vt)throw new Error('Keine Videospur gefunden.');
    const at=await input.getPrimaryAudioTrack();
    let dur=null;try{dur=await input.getDurationFromMetadata()}catch(e){}
    if(!dur||!isFinite(dur))dur=await input.computeDuration();
    const canDec=await vt.canDecode();
    let fps=0;try{const st=await vt.computePacketStats(200);fps=st.averagePacketRate}catch(e){}
    if(!isFinite(fps)||fps<=0)fps=30;
    const snapF=Math.round(fps);if(Math.abs(fps-snapF)<0.6)fps=snapF;
    let abit=0;if(at){try{const st=await at.computePacketStats(100);abit=st.averageBitrate}catch(e){}}
    const total=it.file.size*8/Math.max(1,dur);
    const vbitrate=Math.max(100e3,total-(abit||128e3));
    it.info={w:vt.displayWidth,h:vt.displayHeight,fps,codec:vt.codec,dur,audio:!!at,ach:at?at.numberOfChannels:0,vbitrate,canDecode:canDec,acodec:at?at.codec:null};
    if(!canDec){it.state='error';it.err='Dein Browser kann den Videocodec ('+codecName(vt.codec)+') nicht lesen. '+(vt.codec==='hevc'?'Unter Windows hilft evtl. die „HEVC-Videoerweiterungen“ aus dem Microsoft Store; oder an der Xbox auf H.264 umstellen.':'')}
    else it.state='ready';
    if(canDec){try{const sink=new MBN.CanvasSink(vt,{width:280,fit:'contain'});const ts=Math.min(Math.max(dur*0.1,0.5),Math.max(0,dur-0.1));const wc=await sink.getCanvas(ts)||await sink.getCanvas(0);if(wc){it.thumb=wc.canvas}}catch(e){}}
  }catch(e){it.state='error';it.err='Datei konnte nicht gelesen werden ('+(e&&e.message||e)+'). Ist es ein gültiges Video?'}
  finally{try{input.dispose()}catch(e){}}
}
function codecName(c){return({avc:'H.264',hevc:'H.265/HEVC',vp9:'VP9',vp8:'VP8',av1:'AV1'})[c]||String(c||'?')}

/* ---------- Dateien hinzufügen ---------- */
async function addFiles(list){
  const vids=list.filter(x=>VIDEO_EXT.test(x.file.name)||/^video\//.test(x.file.type));
  const skipped=list.length-vids.length;
  if(skipped&&!vids.length){alert('Keine Videodateien gefunden ('+skipped+' andere Datei(en) übersprungen).');return}
  for(const x of vids){const it={id:nextId++,file:x.file,parts:x.parts,state:'analyzing',trim:null};items.push(it);renderItem(it);}
  refreshButtons();
  for(const it of items.filter(i=>i.state==='analyzing')){
    if(!hasWC||FORCE_FALLBACK){await analyzeBasic(it)}else await analyze(it);
    renderItem(it);refreshButtons();
  }
}
// Ohne WebCodecs: Infos über ein <video>-Element
async function analyzeBasic(it){
  const url=URL.createObjectURL(it.file);const v=document.createElement('video');v.preload='metadata';v.muted=true;v.src=url;
  try{await new Promise((res,rej)=>{v.onloadedmetadata=res;v.onerror=()=>rej(new Error('nicht abspielbar'));setTimeout(()=>rej(new Error('Zeitüberschreitung')),20000)});
    const dur=v.duration;it.info={w:v.videoWidth,h:v.videoHeight,fps:30,codec:'?',dur,audio:true,ach:2,vbitrate:Math.max(100e3,it.file.size*8/dur-128e3),canDecode:true};it.state='ready';
    try{v.currentTime=Math.min(1,dur/2);await new Promise(r=>{v.onseeked=r;setTimeout(r,3000)});const c=document.createElement('canvas');c.width=280;c.height=Math.round(280*v.videoHeight/v.videoWidth);c.getContext('2d').drawImage(v,0,0,c.width,c.height);it.thumb=c}catch(e){}
  }catch(e){it.state='error';it.err='Dein Browser kann diese Datei nicht abspielen ('+e.message+').'}
  URL.revokeObjectURL(url);
}

/* ---------- Rendering der Karten ---------- */
function itemEl(it){let el=document.querySelector('.item[data-id="'+it.id+'"]');if(!el){el=document.createElement('div');el.className='item';el.dataset.id=it.id;$('#queue').appendChild(el)}return el}
function outName(it,ext){const dot=it.file.name.lastIndexOf('.');return(dot>0?it.file.name.slice(0,dot):it.file.name)+'_klein.'+(ext||'mp4')}
function renderItem(it){
  const el=itemEl(it);const i=it.info;
  const pl=i&&it.state!=='error'?makePlan(it,it.snap):null;
  let meta='';
  if(i)meta=i.w+'×'+i.h+' · '+(Math.round(i.fps*10)/10).toString().replace('.',',')+' fps · '+codecName(i.codec)+' · '+fmtTime(i.dur)+' · '+fmtSize(it.file.size);
  let est='';
  if(pl&&(it.state==='ready'||it.state==='waiting')){
    est='Ziel: '+pl.w+'×'+pl.h+(pl.frameRate?' · '+pl.frameRate+' fps':'')+' · geschätzt <b>~'+fmtSize(pl.est)+'</b> ('+(pl.est<it.file.size?'−'+pct(pl.est,it.file.size)+' %':'<span class="warn">nicht kleiner</span>')+')'+(pl.note?'<br><span class="warn">'+esc(pl.note)+'</span>':'');
  }
  let body='<div class="nm">'+esc((it.parts&&it.parts.length?it.parts.join('/')+'/':'')+it.file.name)+'</div><div class="meta">'+(meta||'Wird analysiert …')+'</div>';
  if(it.state==='error')body+='<div class="est err">'+esc(it.err||'Fehler')+'</div>';
  else if(est)body+='<div class="est">'+est+'</div>';
  if(it.state==='running'||it.state==='waiting')body+='<div class="bar"><i></i></div><div class="pt"></div>';
  if(it.state==='waiting')body+='<div class="pt">Wartet …</div>';
  if(it.state==='cancelled')body+='<div class="est warn">Abgebrochen.</div>';
  if(it.state==='done'){const r=it.result;
    body+='<div class="est ok">✔ Fertig: <b>'+fmtSize(r.size)+'</b> (vorher '+fmtSize(it.file.size)+') · Ersparnis <b>'+pct(r.size,it.file.size)+' %</b> · '+esc(r.desc)+'</div>';
    if(r.size>=it.file.size)body+='<div class="est warn">Hinweis: Das Ergebnis ist nicht kleiner als das Original – wähle eine kleinere Stufe.</div>';
    if(r.kind==='folder')body+='<div class="pt">Gespeichert in „'+esc(Dest.name||'Zielordner')+'“ als <code>'+esc(r.name)+'</code></div>';}
  if(it.state==='ready'&&i&&it.state!=='done'){
    body+='<details'+(it.trim?' open':'')+'><summary>✂ Kürzen (optional)</summary><div class="trim"><label class="f">Start<input type="text" data-t="s" placeholder="0:00" value="'+(it.trim&&it.trim.start?fmtTime(it.trim.start):'')+'"></label><label class="f">Ende<input type="text" data-t="e" placeholder="'+fmtTime(i.dur)+'" value="'+(it.trim&&it.trim.end&&it.trim.end<i.dur?fmtTime(it.trim.end):'')+'"></label><span class="note">z. B. 1:30 oder 1:02:15 – leer lassen = ganzes Video</span></div></details>';
  }
  body+='<div class="acts" data-acts></div><div data-prev></div>';
  el.innerHTML='<div class="thumb">🎬</div><div>'+body+'</div>';
  if(it.thumb){const th=el.querySelector('.thumb');th.innerHTML='';const c=document.createElement('canvas');c.width=it.thumb.width;c.height=it.thumb.height;c.getContext('2d').drawImage(it.thumb,0,0);th.appendChild(c)}
  const acts=el.querySelector('[data-acts]');
  const mk=(txt,cls,fn)=>{const b=document.createElement('button');b.className='btn sm '+(cls||'');b.textContent=txt;b.onclick=fn;acts.appendChild(b);return b};
  if(it.state==='done'){
    mk('⬇ Herunterladen','pri',()=>download(it));
    mk('▶ Vorschau','',()=>preview(it,el));
  }
  if(it.state!=='running'&&it.state!=='analyzing')mk('Entfernen','danger',()=>removeItem(it));
  el.querySelectorAll('.trim input').forEach(inp=>inp.addEventListener('change',()=>{
    const s=parseTime(el.querySelector('[data-t=s]').value),e=parseTime(el.querySelector('[data-t=e]').value);
    if(isNaN(s)||isNaN(e)){alert('Zeit bitte als mm:ss oder h:mm:ss eingeben.');return}
    const st=s||0,en=e||i.dur;
    if(en<=st||st>=i.dur){alert('Das Ende muss nach dem Start liegen.');return}
    it.trim=(st>0||en<i.dur-0.05)?{start:st,end:en}:null;renderItem(it)}));
}
function refreshAll(){items.forEach(it=>{if(it.state==='ready'||it.state==='waiting'){const open=document.querySelector('.item[data-id="'+it.id+'"] details')?.open;renderItem(it);if(open)document.querySelector('.item[data-id="'+it.id+'"] details')?.setAttribute('open','')}});updateOutInfo();refreshButtons()}
function updateOutInfo(){
  const el=$('#outinfo');
  if(hasWC&&!FORCE_FALLBACK)el.textContent='Ausgabe: MP4 (H.264 + AAC) – falls dein Browser H.264 nicht kodieren kann, automatisch WebM (VP9 + Opus). Es wird nie hochskaliert.';
  else el.innerHTML='<span class="warn">Dein Browser unterstützt WebCodecs nicht – es wird der langsamere Echtzeit-Modus (MediaRecorder) benutzt. Ausgabe: MP4 oder WebM je nach Browser.</span>';
}
function refreshButtons(){
  const ready=items.filter(i=>i.state==='ready'||i.state==='cancelled'||(i.state==='error'&&false)).length;
  $('#vstart').disabled=running||!ready;
  $('#vcancel').disabled=!running;
  $('#vall').disabled=!items.some(i=>i.state==='done');
  $('#vclear').disabled=running||!items.length;
}
async function removeItem(it){
  if(it.state==='running')return;
  if(it.result){if(it.result.url)URL.revokeObjectURL(it.result.url);if(it.result.out)await it.result.out.cleanup()}
  items=items.filter(x=>x!==it);document.querySelector('.item[data-id="'+it.id+'"]')?.remove();refreshButtons();
}

/* ---------- Download / Vorschau ---------- */
async function resultFile(it){const r=it.result;if(r.fileObj)return r.fileObj;r.fileObj=await r.out.file();return r.fileObj}
async function download(it){const f=await resultFile(it);if(!it.result.url)it.result.url=URL.createObjectURL(f);VK.triggerDownload(it.result.url,it.result.name)}
async function preview(it,el){
  const slot=el.querySelector('[data-prev]');if(slot.firstChild){slot.innerHTML='';return}
  const f=await resultFile(it);if(!it.result.url)it.result.url=URL.createObjectURL(f);
  const v=document.createElement('video');v.controls=true;v.src=it.result.url;v.onerror=()=>{slot.innerHTML='<div class="note warn">Dein Browser kann dieses Ergebnis nicht abspielen – im Videoplayer deiner Wahl öffnen.</div>'};slot.appendChild(v);
}

/* ---------- Warteschlange ---------- */
async function startQueue(){
  if(running)return;running=true;cancelReq=false;
  const snap=snapshot();
  const todo=items.filter(i=>i.state==='ready'||i.state==='cancelled');
  todo.forEach(i=>{i.state='waiting';i.snap=snap;renderItem(i)});
  refreshButtons();
  let wl=null;try{if(navigator.wakeLock)wl=await navigator.wakeLock.request('screen')}catch(e){}
  window.addEventListener('beforeunload',beforeUnload);
  for(const it of todo){
    if(cancelReq){it.state='cancelled';renderItem(it);continue}
    await convertItem(it);
  }
  window.removeEventListener('beforeunload',beforeUnload);
  try{wl&&await wl.release()}catch(e){}
  running=false;curItem=null;refreshButtons();
}
function beforeUnload(e){e.preventDefault();e.returnValue=''}
function setProgress(it,p,extra){
  const el=itemEl(it);const bar=el.querySelector('.bar i'),pt=el.querySelector('.pt');
  if(bar)bar.style.width=Math.round(p*1000)/10+'%';
  if(pt)pt.textContent=extra;
}
async function convertItem(it){
  curItem=it;it.state='running';renderItem(it);
  const pl=makePlan(it,it.snap);
  const t0=performance.now();let lastUi=0;
  const prog=(p,procSec)=>{const now=performance.now();if(now-lastUi<200&&p<1)return;lastUi=now;
    const el=(now-t0)/1000;const eta=p>0.005&&el>2?el*(1-p)/p:NaN;const speed=el>1?(p*pl.dur)/el:0;
    setProgress(it,p,Math.floor(p*100)+' % · Restzeit ca. '+fmtEta(eta)+(speed?' · '+speed.toFixed(1).replace('.',',')+'× Echtzeit':'')+' · '+fmtTime(p*pl.dur)+' von '+fmtTime(pl.dur))};
  prog(0,0);
  try{
    const r=(hasWC&&!FORCE_FALLBACK)?await convertWC(it,pl,prog):await convertMR(it,pl,prog);
    if(r==='cancelled'){it.state='cancelled'}
    else{it.result=r;it.state='done'}
  }catch(e){
    console.error(e);
    if(cancelReq){it.state='cancelled'}else{it.state='error';it.err=friendlyError(e)}
  }
  curConv=null;renderItem(it);refreshButtons();
}
function friendlyError(e){
  const m=String(e&&e.message||e);
  if(/quota|space|disk/i.test(m))return'Nicht genug Speicherplatz auf dem Laufwerk. Bitte Platz schaffen oder einen anderen Zielordner wählen. ('+m+')';
  if(/Permission|NotAllowed/i.test(m))return'Keine Schreibrechte im Zielordner. Bitte den Ordner neu wählen. ('+m+')';
  return'Umrechnung fehlgeschlagen: '+m;
}
let aacReady=false;
async function ensureAac(ch){
  if(aacReady)return;
  const ok=await MBN.canEncodeAudio('aac',{numberOfChannels:ch||2,sampleRate:48000,bitrate:128000});
  if(!ok&&window.MediabunnyAacEncoder)window.MediabunnyAacEncoder.registerAacEncoder();
  aacReady=true;
}
async function pickCodecs(pl){
  const opt={width:pl.w,height:pl.h,bitrate:pl.vb};
  if(!/[?&]noavc=1/.test(location.search)&&await MBN.canEncodeVideo('avc',opt)){await ensureAac(pl.mono?1:2);return{container:'mp4',vc:'avc',ac:'aac',ext:'mp4',mime:'video/mp4',label:'MP4 · H.264 + AAC'}}
  for(const c of ['vp9','vp8','av1'])if(await MBN.canEncodeVideo(c,opt))return{container:'webm',vc:c,ac:'opus',ext:'webm',mime:'video/webm',label:'WebM · '+c.toUpperCase()+' + Opus'};
  return null;
}
async function convertWC(it,pl,prog){
  const cod=await pickCodecs(pl);
  if(!cod)throw new Error('Dein Browser kann weder H.264 noch VP9/VP8 kodieren. Bitte Chrome oder Edge benutzen.');
  const input=new MBN.Input({source:new MBN.BlobSource(it.file),formats:MBN.ALL_FORMATS});
  const name=outName(it,cod.ext);
  const out=await VK.openOutput(name,it.parts);out.mime=cod.mime;
  const fmt=cod.container==='mp4'?new MBN.Mp4OutputFormat({fastStart:out.writable?false:'in-memory'}):new MBN.WebMOutputFormat();
  const output=new MBN.Output({format:fmt,target:out.target()});
  const v={codec:cod.vc,bitrate:pl.vb,bitrateMode:'constant',forceTranscode:true,keyFrameInterval:2,fit:'fill'};
  if(pl.scaled||it.info.w%2||it.info.h%2){v.width=pl.w;v.height=pl.h}
  // Bildrate immer setzen: der Encoder verteilt die Bitrate sonst auf 30 fps und liefert bei 60 fps doppelt so große Dateien
  v.frameRate=pl.outFps;
  const a=pl.hasA?{codec:cod.ac,bitrate:pl.ab,forceTranscode:true}:{discard:true};
  if(pl.hasA&&pl.mono)a.numberOfChannels=1;
  const opts={input,output,video:v,audio:a,showWarnings:false};
  if(pl.trimmed)opts.trim={start:pl.t0,end:pl.t1};
  let conv;
  try{
    conv=await MBN.Conversion.init(opts);
    curConv=conv;
    if(!conv.isValid){
      const why=conv.discardedTracks.map(d=>d.reason).join(', ');
      throw new Error('Das Video kann nicht umgerechnet werden ('+why+').');
    }
    conv.onProgress=p=>prog(p);
    await conv.execute();
    if(conv.state==='canceled'||cancelReq){await out.abort();return'cancelled'}
    await out.afterFinalize();
    const f=await out.file();
    return{size:f.size,name:out.name,kind:out.kind,out,desc:cod.label+' · '+pl.w+'×'+pl.h+(pl.frameRate?' · '+pl.frameRate+' fps':'')+' · '+(pl.vb/1e6).toFixed(1).replace('.',',')+' Mbit/s',fileObj:f};
  }catch(e){
    await out.abort();
    if(cancelReq||(conv&&conv.state==='canceled'))return'cancelled';
    throw e;
  }finally{try{input.dispose()}catch(e){}}
}

/* ---------- Fallback: MediaRecorder (Echtzeit) ---------- */
async function convertMR(it,pl,prog){
  if(!window.MediaRecorder)throw new Error('Dein Browser kann keine Videos aufnehmen/umrechnen. Bitte Chrome oder Edge benutzen.');
  const mimes=['video/mp4;codecs=avc1,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  const mime=mimes.find(m=>MediaRecorder.isTypeSupported(m));if(!mime)throw new Error('Kein unterstütztes Ausgabeformat im Browser.');
  const ext=mime.startsWith('video/mp4')?'mp4':'webm';
  const url=URL.createObjectURL(it.file);const v=document.createElement('video');v.src=url;v.playsInline=true;v.preload='auto';
  await new Promise((res,rej)=>{v.onloadeddata=res;v.onerror=()=>rej(new Error('Datei nicht abspielbar'))});
  const cv=document.createElement('canvas');cv.width=pl.w;cv.height=pl.h;const cx=cv.getContext('2d');
  const fps=Math.min(pl.outFps,60);const stream=cv.captureStream(fps);
  let ac=null;
  if(pl.hasA){try{ac=new AudioContext();const src=ac.createMediaElementSource(v);const dst=ac.createMediaStreamDestination();src.connect(dst);dst.stream.getAudioTracks().forEach(t=>stream.addTrack(t))}catch(e){ac=null}}
  const chunks=[];const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:pl.vb,audioBitsPerSecond:pl.ab||undefined});
  rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
  const stopped=new Promise(r=>rec.onstop=r);
  fallbackRec=rec;
  v.currentTime=pl.t0;await new Promise(r=>{v.onseeked=r;setTimeout(r,2000)});
  rec.start(1000);
  let stop=false;
  const draw=()=>{if(stop)return;cx.drawImage(v,0,0,cv.width,cv.height);const p=(v.currentTime-pl.t0)/pl.dur;prog(Math.min(1,Math.max(0,p)));
    if(v.ended||v.currentTime>=pl.t1-0.03||cancelReq){stop=true;try{v.pause()}catch(e){}if(rec.state!=='inactive')rec.stop();return}
    if(v.requestVideoFrameCallback)v.requestVideoFrameCallback(draw);else requestAnimationFrame(draw)};
  await v.play();draw();
  // Safari/Hintergrund: zur Sicherheit auch per Timer zeichnen
  const tm=setInterval(()=>{if(!stop&&document.hidden)draw()},500);
  await stopped;clearInterval(tm);stop=true;
  fallbackRec=null;v.removeAttribute('src');v.load();URL.revokeObjectURL(url);try{ac&&ac.close()}catch(e){}
  if(cancelReq)return'cancelled';
  const blob=new Blob(chunks,{type:mime.split(';')[0]});
  return{size:blob.size,name:outName(it,ext),kind:'ram',out:{file:async()=>blob,cleanup:async()=>{}},fileObj:blob,desc:(ext==='mp4'?'MP4':'WebM')+' (Echtzeit-Modus) · '+pl.w+'×'+pl.h};
}

function cancel(){
  cancelReq=true;
  if(curConv){try{curConv.cancel()}catch(e){}}
  if(fallbackRec&&fallbackRec.state!=='inactive'){try{fallbackRec.stop()}catch(e){}}
}

/* ---------- Start ---------- */
function init(){
  buildPresets();wireCustom();updateOutInfo();
  $('#vpick').onclick=()=>$('#vfile').click();
  $('#vfile').onchange=e=>{addFiles(VK.fromInput(e.target.files));e.target.value=''};
  $('#vpickdir').onclick=async()=>{const r=await VK.pickFolder();if(r==='input')$('#vdirfile').click();else if(r)addFiles(r)};
  $('#vdirfile').onchange=e=>{addFiles(VK.fromInput(e.target.files));e.target.value=''};
  VK.setupDrop($('#vdrop'),addFiles);
  $('#vstart').onclick=startQueue;$('#vcancel').onclick=cancel;
  $('#vall').onclick=async()=>{for(const it of items.filter(i=>i.state==='done')){await download(it);await VK.sleep(600)}};
  $('#vclear').onclick=async()=>{for(const it of [...items])await removeItem(it)};
  // Seite als Ganzes: Drop daneben soll nicht den Browser das Video öffnen lassen
  window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
}
window.VKV={init,items:()=>items,addFiles,startQueue,S,PRESETS,setPreset:k=>$('#presets .preset[data-k="'+k+'"]').click(),hasWC,makePlan};
})();
