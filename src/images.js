/* ===== Bilder-Tab (Ordner, ZIP, Zielordner) ===== */
(function(){
'use strict';
const {$,fmtSize,esc,pct,Dest}=VK;
const IMG_EXT=/\.(jpe?g|png|webp|bmp|avif)$/i;
let list=[],running=false,cancel=false;

/* ---- minimaler ZIP-Schreiber (ohne Kompression, Bilder sind schon komprimiert) ---- */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u8){let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=CRC[(c^u8[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0}
function Zip(sink){
  const enc=new TextEncoder();const entries=[];let off=0;
  const d=new Date(),dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xffff,dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xffff;
  async function put(u8){off+=u8.length;await sink(u8)}
  return{
    async add(path,u8){
      if(off+u8.length+200>0xFFFFFFFF)throw new Error('Die ZIP-Datei würde über 4 GB groß. Bitte einen Zielordner wählen oder weniger Bilder auf einmal verarbeiten.');
      const nm=enc.encode(path),crc=crc32(u8),h=new DataView(new ArrayBuffer(30));
      h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);h.setUint16(10,dt,true);h.setUint16(12,dd,true);h.setUint32(14,crc,true);h.setUint32(18,u8.length,true);h.setUint32(22,u8.length,true);h.setUint16(26,nm.length,true);h.setUint16(28,0,true);
      entries.push({nm,crc,size:u8.length,off});
      await put(new Uint8Array(h.buffer));await put(nm);await put(u8);
    },
    async finish(){
      const start=off;
      for(const e of entries){const h=new DataView(new ArrayBuffer(46));
        h.setUint32(0,0x02014b50,true);h.setUint16(4,20,true);h.setUint16(6,20,true);h.setUint16(8,0x0800,true);h.setUint16(10,0,true);h.setUint16(12,dt,true);h.setUint16(14,dd,true);h.setUint32(16,e.crc,true);h.setUint32(20,e.size,true);h.setUint32(24,e.size,true);h.setUint16(28,e.nm.length,true);h.setUint32(42,e.off,true);
        await put(new Uint8Array(h.buffer));await put(e.nm)}
      const size=off-start,h=new DataView(new ArrayBuffer(22));
      h.setUint32(0,0x06054b50,true);h.setUint16(8,entries.length,true);h.setUint16(10,entries.length,true);h.setUint32(12,size,true);h.setUint32(16,start,true);
      await put(new Uint8Array(h.buffer));
    }
  };
}

/* ---- Einstellungen ---- */
const cfg=()=>({max:+$('#i_max').value,fmt:$('#i_fmt').value,q:(+$('#i_q').value)/100});
function outInfo(f,cf){ // Zielformat + Endung bestimmen
  const ext=f.name.match(/\.([^.]+)$/)[1].toLowerCase();
  let mime;
  if(cf.fmt==='jpeg')mime='image/jpeg';else if(cf.fmt==='webp')mime='image/webp';
  else mime=ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg'; // bmp/avif -> jpeg
  return{mime,ext:mime==='image/jpeg'?'jpg':mime==='image/webp'?'webp':'png'};
}
async function process(file,cf){
  const bmp=await createImageBitmap(file,{imageOrientation:'from-image'});
  let w=bmp.width,h=bmp.height;const long=Math.max(w,h);
  let resized=false;
  if(cf.max&&long>cf.max){const s=cf.max/long;w=Math.max(1,Math.round(w*s));h=Math.max(1,Math.round(h*s));resized=true}
  const oi=outInfo(file,cf);
  const cv=new OffscreenCanvas(w,h);const cx=cv.getContext('2d');
  if(oi.mime==='image/jpeg'){cx.fillStyle='#fff';cx.fillRect(0,0,w,h)}
  cx.imageSmoothingQuality='high';cx.drawImage(bmp,0,0,w,h);bmp.close&&bmp.close();
  const blob=await cv.convertToBlob({type:oi.mime,quality:cf.q});
  return{blob,oi,resized,w,h};
}

/* ---- Hinzufügen ---- */
function add(listIn){
  const imgs=listIn.filter(x=>IMG_EXT.test(x.file.name)||/^image\/(jpeg|png|webp|bmp|avif)$/.test(x.file.type));
  const skipped=listIn.length-imgs.length;
  imgs.forEach(x=>list.push(x));
  $('#isum').hidden=false;
  const prev=skipped+(+($('#isum').dataset.skipped||0));$('#isum').dataset.skipped=prev;
  summary();
  if(!imgs.length&&skipped)alert('Keine Bilder gefunden – '+skipped+' andere Datei(en) wurden übersprungen.');
  $('#istart').disabled=running||!list.length;$('#iclear').disabled=running||!list.length;
}
function summary(txt){
  const sk=+($('#isum').dataset.skipped||0);
  $('#icount').textContent=list.length+' Bild'+(list.length===1?'':'er')+' in der Liste'+(sk?' · '+sk+' Nicht-Bilddatei'+(sk===1?'':'en')+' übersprungen':'');
  if(txt!==undefined)$('#itxt').textContent=txt;
}
function logLine(cls,name,status){const l=$('#ilog');const d=document.createElement('div');d.innerHTML='<span class="'+cls+'">'+(cls==='ok'?'✔':cls==='err'?'✖':'•')+'</span><span>'+esc(name)+'</span><span class="s">'+esc(status)+'</span>';l.appendChild(d);l.scrollTop=l.scrollHeight}

/* ---- Verarbeiten ---- */
async function run(){
  if(running||!list.length)return;running=true;cancel=false;
  $('#istart').disabled=true;$('#icancel').disabled=false;$('#iclear').disabled=true;$('#iresult').innerHTML='';$('#ilog').innerHTML='';
  const cf=cfg();const total=list.length;let done=0,fail=0,sumIn=0,sumOut=0;
  const used=new Set();
  const zipMode=!Dest.dir&&total>1;
  let zip=null,zout=null,zparts=null;
  try{
    if(zipMode){
      // Ausgabe: Datei (OPFS) oder RAM
      const nm='Bilder_resized.zip';zout=await VK.openOutput(nm,[]);
      if(zout.writable){zip=Zip(u8=>zout.writable.write(u8))}else{zparts=[];zip=Zip(async u8=>{zparts.push(u8)})}
    }
    for(const x of list){
      if(cancel)break;
      const rel=(x.parts.length?x.parts.join('/')+'/':'')+x.file.name;
      $('#ibar').style.width=(done/total*100)+'%';
      $('#itxt').textContent=(done+1)+' von '+total+' – '+x.file.name;
      let r;
      try{
        r=await process(x.file,cf);
        let blob=r.blob;
        // nicht größer werden: wenn nichts verkleinert wurde und Ergebnis größer ist, Original behalten
        let keepOrig=false;
        if(!r.resized&&blob.size>=x.file.size&&outInfo(x.file,cf).mime===x.file.type){blob=x.file;keepOrig=true}
        const base=x.file.name.replace(/\.[^.]+$/,'');
        const ext=keepOrig?x.file.name.match(/\.([^.]+)$/)[1]:r.oi.ext;
        const outName=base+'_resized.'+ext;
        const relOut=(x.parts.length?x.parts.join('/')+'/':'')+outName;
        if(zip){let p=relOut,n=1;while(used.has(p.toLowerCase())){n++;p=(x.parts.length?x.parts.join('/')+'/':'')+base+'_resized ('+n+').'+ext}used.add(p.toLowerCase());
          await zip.add(p,new Uint8Array(await blob.arrayBuffer()))}
        else if(Dest.dir){
          const d=await VK.subDir(Dest.dir,x.parts);const fn=await VK.uniqueName(d,outName);const fh=await d.getFileHandle(fn,{create:true});const w=await fh.createWritable();await w.write(blob);await w.close()}
        else{ // einzelnes Bild: direkt herunterladen
          const url=URL.createObjectURL(blob);VK.triggerDownload(url,outName);setTimeout(()=>URL.revokeObjectURL(url),60000)}
        sumIn+=x.file.size;sumOut+=blob.size;done++;
        logLine('ok',rel,fmtSize(x.file.size)+' → '+fmtSize(blob.size)+(keepOrig?' (Original behalten)':' ('+(r.resized?r.w+'×'+r.h+', ':'')+'−'+pct(blob.size,x.file.size)+' %)'));
      }catch(e){fail++;done++;logLine('err',rel,'Fehler: '+(e&&e.message||'nicht lesbar'))}
      $('#isaved').textContent='Gespart bisher: '+fmtSize(Math.max(0,sumIn-sumOut))+(sumIn?' ('+pct(sumOut,sumIn)+' %)':'');
      await new Promise(r=>setTimeout(r,0));
    }
    $('#ibar').style.width=(cancel?done/total*100:100)+'%';
    if(zip&&!cancel){
      await zip.finish();
      let file;
      if(zout.writable){await zout.writable.close();zout.closed=true;file=await zout.file()}
      else file=new Blob(zparts,{type:'application/zip'});
      const url=URL.createObjectURL(file);
      const b=document.createElement('button');b.className='btn pri';b.textContent='⬇ ZIP herunterladen ('+fmtSize(file.size)+')';b.onclick=()=>VK.triggerDownload(url,'Bilder_resized.zip');$('#iresult').appendChild(b);
      b.click();
      zout._url=url;
    }else if(zip&&cancel){if(zout)await zout.abort()}
    $('#itxt').textContent=(cancel?'Abgebrochen. ':'Fertig. ')+(done-fail)+' von '+total+' verarbeitet'+(fail?', '+fail+' Fehler':'')+(Dest.dir&&!cancel?' – gespeichert in „'+Dest.name+'“.':'.');
  }catch(e){
    console.error(e);$('#itxt').innerHTML='<span class="err">'+esc(e&&e.message||String(e))+'</span>';
    if(zout)try{await zout.abort()}catch(_){}
  }
  running=false;$('#icancel').disabled=true;$('#istart').disabled=false;$('#iclear').disabled=false;
}

function init(){
  $('#i_q').oninput=()=>{$('#i_qv').textContent=$('#i_q').value};
  $('#ipick').onclick=()=>$('#ifile').click();
  $('#ifile').onchange=e=>{add(VK.fromInput(e.target.files));e.target.value=''};
  $('#ipickdir').onclick=async()=>{const r=await VK.pickFolder();if(r==='input')$('#idirfile').click();else if(r)add(r)};
  $('#idirfile').onchange=e=>{add(VK.fromInput(e.target.files));e.target.value=''};
  VK.setupDrop($('#idrop'),add);
  $('#istart').onclick=run;$('#icancel').onclick=()=>{cancel=true};
  $('#iclear').onclick=()=>{list=[];$('#isum').hidden=true;$('#isum').dataset.skipped=0;$('#istart').disabled=true;$('#iclear').disabled=true;$('#ilog').innerHTML='';$('#iresult').innerHTML='';$('#ibar').style.width='0'};
}
window.VKI={init,add,run,list:()=>list,Zip,crc32};
})();
