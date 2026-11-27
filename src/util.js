/* ===== Gemeinsame Helfer ===== */
(function(){
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const MB=1e6;
function fmtSize(b){if(b==null||isNaN(b))return'–';if(b>=1e9)return(b/1e9).toFixed(2).replace('.',',')+' GB';if(b>=1e6)return(b/1e6).toFixed(b>=1e8?0:1).replace('.',',')+' MB';return Math.max(1,Math.round(b/1e3))+' KB'}
function fmtTime(s){if(s==null||!isFinite(s))return'–';s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return h?h+':'+String(m).padStart(2,'0')+':'+String(x).padStart(2,'0'):m+':'+String(x).padStart(2,'0')}
function fmtEta(s){if(!isFinite(s))return'…';s=Math.round(s);if(s<60)return s+' s';if(s<3600)return Math.floor(s/60)+' min '+String(s%60).padStart(2,'0')+' s';return Math.floor(s/3600)+' h '+String(Math.floor(s%3600/60)).padStart(2,'0')+' min'}
function parseTime(t){t=String(t||'').trim().replace(',','.');if(!t)return null;const p=t.split(':').map(Number);if(p.some(isNaN)||p.length>3)return NaN;let s=0;for(const x of p)s=s*60+x;return s}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function pct(a,b){return b>0?Math.round((1-a/b)*100):0}
const evenInt=n=>Math.max(2,Math.round(n/2)*2);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hasPicker=typeof window.showDirectoryPicker==='function';
const hasSavePicker=typeof window.showSaveFilePicker==='function';
let opfsOk=false;
async function opfsRoot(){try{const r=await navigator.storage.getDirectory();return r}catch(e){return null}}
(async()=>{try{const r=await opfsRoot();if(!r)return;const f=await r.getFileHandle('vk_probe',{create:true});opfsOk=typeof f.createWritable==='function'&&!/[?&]noopfs=1/.test(location.search);
 // eigene, übrig gebliebene Zwischendateien aufräumen
 for await(const [n] of r.entries()){if(n.startsWith('vk_'))try{await r.removeEntry(n)}catch(e){}}}catch(e){opfsOk=false}})();

/* ---------- Zielordner (geteilt) ---------- */
const Dest={dir:null,name:''};
async function chooseDest(){
  if(!hasPicker)return false;
  try{const d=await window.showDirectoryPicker({mode:'readwrite',id:'vk-dest'});Dest.dir=d;Dest.name=d.name;updateDestUI();return true}catch(e){return false}
}
function updateDestUI(){
  for(const k of ['v','i']){
    const t=$('#'+k+'desttxt'),off=$('#'+k+'destoff'),h=$('#'+k+'desthelp'),b=$('#'+k+'dest');
    if(!hasPicker){b.hidden=true;t.textContent='';h.textContent=k==='v'?'Dein Browser kann keinen Zielordner wählen – das Ergebnis landet in einem temporären Speicher und wird danach heruntergeladen.':'Dein Browser kann keinen Zielordner wählen – es wird eine ZIP-Datei bzw. ein Download erzeugt.';continue}
    if(Dest.dir){t.innerHTML='Ausgabe direkt nach: <b>'+esc(Dest.name)+'</b>';off.hidden=false;b.textContent='📁 Anderen Ordner wählen';
      h.textContent=k==='v'?'Die fertigen Videos werden sofort in diesen Ordner geschrieben (am besten für sehr große Dateien). Vorhandene Dateien werden nie überschrieben.':'Die verkleinerten Bilder werden samt Ordnerstruktur dorthin geschrieben. Originale bleiben unberührt, vorhandene Dateien werden nie überschrieben. Der Browser setzt die Dateizeit auf „jetzt“; die Original-Speicherzeit steht in den Metadaten.'}
    else{t.textContent='';off.hidden=true;b.textContent='📁 Zielordner wählen';
      h.textContent=k==='v'?'Ohne Zielordner wird jedes fertige Video zwischengespeichert und kann dann heruntergeladen werden. Für Dateien über ca. 4 GB empfohlen: Zielordner wählen.':'Ohne Zielordner entsteht eine ZIP-Datei (bei einem einzelnen Bild direkt das Bild). In der ZIP bleibt die Original-Speicherzeit erhalten.'}
  }
}
function wireDest(){for(const k of ['v','i']){$('#'+k+'dest').onclick=chooseDest;$('#'+k+'destoff').onclick=()=>{Dest.dir=null;Dest.name='';updateDestUI()}}updateDestUI()}

/* ---------- eindeutiger Dateiname im Zielordner (nie überschreiben) ---------- */
async function uniqueName(dir,name){
  const dot=name.lastIndexOf('.');const base=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';
  let n=name,i=1;
  for(;;){try{await dir.getFileHandle(n);i++;n=base+' ('+i+')'+ext}catch(e){return n}}
}
async function subDir(root,parts){let d=root;for(const p of parts)d=await d.getDirectoryHandle(p,{create:true});return d}

/* ---------- Ausgabe öffnen: Zielordner > OPFS > RAM ---------- */
// liefert {kind, name, writable|null, finish(), abort(), getFile(), cleanup()}
async function openOutput(name,parts){
  const out={kind:'ram',name,writable:null,fh:null,tmpName:null,dirHandle:null,blob:null,created:false};
  if(Dest.dir){
    const d=await subDir(Dest.dir,parts||[]);
    out.name=await uniqueName(d,name);out.fh=await d.getFileHandle(out.name,{create:true});out.created=true;out.dirHandle=d;
    out.writable=await out.fh.createWritable();out.kind='folder';return wrapOut(out)}
  if(opfsOk){
    const r=await opfsRoot();out.tmpName='vk_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    out.fh=await r.getFileHandle(out.tmpName,{create:true});out.dirHandle=r;out.created=true;out.writable=await out.fh.createWritable();out.kind='opfs';return wrapOut(out)}
  return wrapOut(out);
}
function wrapOut(o){
  o.closed=false;
  o.target=function(){ // für Mediabunny
    if(o.writable)return new Mediabunny.StreamTarget(o.writable,{chunked:true,chunkSize:16*1024*1024});
    o.bt=new Mediabunny.BufferTarget();return o.bt};
  o.afterFinalize=async function(){ // Mediabunny schließt den Stream selbst
    o.closed=true;
    if(o.kind==='ram'){o.blob=new Blob([o.bt.buffer],{type:o.mime||'video/mp4'});o.bt=null}
  };
  o.file=async function(){if(o.fh)return o.fh.getFile();return o.blob};
  o.abort=async function(){
    try{if(o.writable&&!o.closed)await o.writable.abort()}catch(e){if(window.__vkdebug)console.log('abort',e)}
    o.closed=true;
    if(o.created&&o.fh&&o.dirHandle){for(let k=0;k<8;k++){try{await o.dirHandle.removeEntry(o.kind==='opfs'?o.tmpName:o.name);break}catch(e){if(window.__vkdebug)console.log('remove',e);await sleep(250)}}}};
  o.cleanup=async function(){ // nur eigene OPFS-Zwischendatei
    if(o.kind==='opfs'&&o.dirHandle){try{await o.dirHandle.removeEntry(o.tmpName)}catch(e){}}o.blob=null};
  return o;
}
function triggerDownload(url,name){const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>a.remove(),1000)}

/* ---------- Dateien einsammeln (Dateien, Ordner, rekursiv) ---------- */
async function readAllEntries(reader){const all=[];for(;;){const b=await new Promise((res,rej)=>reader.readEntries(res,rej));if(!b.length)break;all.push(...b)}return all}
async function walkEntry(entry,parts,out){
  if(entry.isFile){const f=await new Promise((res,rej)=>entry.file(res,rej));out.push({file:f,parts:parts.slice()})}
  else if(entry.isDirectory){const kids=await readAllEntries(entry.createReader());kids.sort((a,b)=>a.name.localeCompare(b.name,'de',{numeric:true}));for(const k of kids)await walkEntry(k,parts.concat(entry.name),out)}
}
async function collectFromDrop(dt){
  const out=[];const items=[...(dt.items||[])];
  if(items.length&&items[0].webkitGetAsEntry){
    const ents=items.filter(i=>i.kind==='file').map(i=>i.webkitGetAsEntry()).filter(Boolean); // synchron lesen, bevor der Event endet
    for(const e of ents)await walkEntry(e,[],out);
  }else for(const f of dt.files)out.push({file:f,parts:[]});
  return out;
}
async function walkHandle(dh,parts,out){
  const kids=[];for await(const [n,h] of dh.entries())kids.push(h);
  kids.sort((a,b)=>a.name.localeCompare(b.name,'de',{numeric:true}));
  for(const h of kids){if(h.kind==='file')out.push({file:await h.getFile(),parts:parts.slice()});else await walkHandle(h,parts.concat(h.name),out)}
}
async function pickFolder(){ // showDirectoryPicker (nur lesen) oder <input webkitdirectory>
  if(hasPicker){try{const dh=await window.showDirectoryPicker({mode:'read',id:'vk-src'});const out=[];await walkHandle(dh,[dh.name],out);return out}catch(e){return null}}
  return 'input';
}
function fromInput(files){return [...files].map(f=>{const rp=f.webkitRelativePath||'';const parts=rp?rp.split('/').slice(0,-1):[];return{file:f,parts}})}
function setupDrop(el,handler){
  let c=0;
  el.addEventListener('dragenter',e=>{e.preventDefault();c++;el.classList.add('over')});
  el.addEventListener('dragover',e=>{e.preventDefault()});
  el.addEventListener('dragleave',()=>{if(--c<=0){c=0;el.classList.remove('over')}});
  el.addEventListener('drop',async e=>{e.preventDefault();c=0;el.classList.remove('over');handler(await collectFromDrop(e.dataTransfer))});
}
function banner(html,cls){const b=document.createElement('div');b.className='b '+(cls||'');b.innerHTML=html;$('#banner').appendChild(b);return b}

window.VK={$,$$,MB,fmtSize,fmtTime,fmtEta,parseTime,esc,pct,evenInt,sleep,hasPicker,hasSavePicker,Dest,chooseDest,updateDestUI,wireDest,uniqueName,subDir,openOutput,triggerDownload,collectFromDrop,pickFolder,fromInput,setupDrop,banner,isOpfs:()=>opfsOk};
})();
