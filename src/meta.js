/* ===== Metadaten: EXIF/XMP/IPTC/ICC lesen, anpassen und in JPEG/PNG/WebP schreiben ===== */
(function(){
'use strict';
const te=new TextEncoder(), td=new TextDecoder();
const enc=s=>te.encode(s), dec=(u,i,n)=>td.decode(u.subarray(i,n==null?undefined:i+n));
const ascii=(u,i,n)=>String.fromCharCode.apply(null,u.subarray(i,i+n));
function u8set(a,b,o){a.set(b,o);return a}
function concat(){let n=0;for(const x of arguments)n+=x.length;const o=new Uint8Array(n);let p=0;for(const x of arguments){o.set(x,p);p+=x.length}return o}
function dv(u){return new DataView(u.buffer,u.byteOffset,u.byteLength)}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u,i,n){let c=0xFFFFFFFF,e=i==null?u.length:(i+n);for(let p=i||0;p<e;p++)c=CRC[(c^u[p])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0}
function be16(u,o){return(u[o]<<8)|u[o+1]}
function be32(u,o){return(u[o]*16777216)+(u[o+1]<<16)|(u[o+2]<<8)|u[o+3]}

/* ---------- TIFF / EXIF ---------- */
const T={ImageWidth:0x100,ImageLength:0x101,Orientation:0x112,ExifIFD:0x8769,GPSIFD:0x8825,Interop:0xA005,PixelX:0xA002,PixelY:0xA003};
function tiffLE(u){return u[0]===0x49&&u[1]===0x49}
function tiffOK(u){if(u.length<8)return false;const le=tiffLE(u)||(u[0]===0x4d&&u[1]===0x4d);if(!le&&!(u[0]===0x4d&&u[1]===0x4d))return false;const v=dv(u);return v.getUint16(2,tiffLE(u))===42}
function ru16(v,le,o){return v.getUint16(o,le)} function ru32(v,le,o){return v.getUint32(o,le)}
function wu16(v,le,o,x){v.setUint16(o,x,le)} function wu32(v,le,o,x){v.setUint32(o,x,le)}
function readIFD(u,le,off){
  const v=dv(u);if(off<0||off+2>u.length)return null;
  const n=ru16(v,le,off);if(n>500||off+2+n*12+4>u.length)return null;
  const ent=[];for(let i=0;i<n;i++){const o=off+2+i*12;ent.push({o,tag:ru16(v,le,o),type:ru16(v,le,o+2),count:ru32(v,le,o+4)});}
  return{off,n,ent,nextOff:off+2+n*12,next:ru32(v,le,off+2+n*12)};
}
function inlineOff(e){return e.o+8}
function ptrVal(u,le,e){const v=dv(u);return ru32(v,le,e.o+8)}
function typeSize(t){return[0,1,1,2,4,8,1,1,2,4,8,4,8][t]||1}
function isInline(e){return typeSize(e.type)*e.count<=4}

function findExifTiff(u){
  if(!u||!u.length)return null;
  if(tiffOK(u))return u;
  for(let i=0;i+10<u.length;i++){
    if(u[i]===0x45&&u[i+1]===0x78&&u[i+2]===0x69&&u[i+3]===0x66&&u[i+4]===0&&u[i+5]===0){
      const t=u.subarray(i+6);if(tiffOK(t))return t;
    }
  }
  // HEIC oft: 4-Byte-Offset, dann TIFF
  if(u.length>16){const k=be32(u,0);if(k>=4&&k+8<u.length&&tiffOK(u.subarray(k)))return u.subarray(k);if(tiffOK(u.subarray(4)))return u.subarray(4);}
  return tiffOK(u)?u:null;
}

function patchExif(tiff,w,h){
  if(!tiff||!tiffOK(tiff))return null;
  const le=tiffLE(tiff);
  // Kopie mit etwas Platz am Ende, falls IFDs ergänzt werden
  const buf=new Uint8Array(tiff.length+512);
  buf.set(tiff,0);let len=tiff.length;
  const v=dv(buf);
  const ifd0off=ru32(v,le,4);
  const ifd0=readIFD(buf,le,ifd0off);if(!ifd0)return tiff.slice?tiff.slice():new Uint8Array(tiff);

  function setNum(ifd,tag,type,value){
    const e=ifd.ent.find(x=>x.tag===tag);
    if(e){
      if(type===3&&(e.type===3||e.type===4)&&isInline(e)){
        if(e.type===3){wu16(v,le,e.o+8,value);wu16(v,le,e.o+10,0);} else wu32(v,le,e.o+8,value);
        return true;
      }
      if(type===4&&e.type===4&&isInline(e)){wu32(v,le,e.o+8,value);return true;}
      if(type===3&&e.type===3&&!isInline(e)){const p=ptrVal(buf,le,e);if(p+2<=len){wu16(v,le,p,value);return true;}}
      if(type===4&&e.type===4&&!isInline(e)){const p=ptrVal(buf,le,e);if(p+4<=len){wu32(v,le,p,value);return true;}}
      return false;
    }
    return false;
  }
  function addTags(ifd, pointerAt /* offset of 4-byte IFD pointer */, tags){
    // tags: [{tag,type,value}] SHORT or LONG, count 1, inline
    const need=tags.filter(t=>!ifd.ent.some(e=>e.tag===t.tag));
    if(!need.length)return ifd;
    const n=ifd.n+need.length;
    const neu=len; const bytes=2+n*12+4;
    if(neu+bytes>buf.length)return ifd;
    wu16(v,le,neu,n);
    const all=ifd.ent.map(e=>({tag:e.tag,bytes:buf.slice(e.o,e.o+12)})).concat(need.map(t=>{
      const b=new Uint8Array(12),d=dv(b);
      wu16(d,le,0,t.tag);wu16(d,le,2,t.type);wu32(d,le,4,1);
      if(t.type===3){wu16(d,le,8,t.value);wu16(d,le,10,0);} else wu32(d,le,8,t.value);
      return{tag:t.tag,bytes:b};
    }));
    all.sort((a,b)=>a.tag-b.tag);
    all.forEach((e,i)=>buf.set(e.bytes,neu+2+i*12));
    wu32(v,le,neu+2+n*12,0); // next = 0
    len=neu+bytes;
    wu32(v,le,pointerAt,neu);
    return readIFD(buf,le,neu);
  }

  // Thumbnail-IFD abhängen
  wu32(v,le,ifd0.nextOff,0);

  setNum(ifd0,T.Orientation,3,1);
  setNum(ifd0,T.ImageWidth,4,w);setNum(ifd0,T.ImageWidth,3,w);
  setNum(ifd0,T.ImageLength,4,h);setNum(ifd0,T.ImageLength,3,h);
  let ifd0b=addTags(ifd0,4,[
    {tag:T.Orientation,type:3,value:1},
    {tag:T.ImageWidth,type:4,value:w},
    {tag:T.ImageLength,type:4,value:h}
  ]);
  if(!ifd0b)ifd0b=ifd0;

  const exPtr=ifd0b.ent.find(e=>e.tag===T.ExifIFD);
  if(exPtr){
    const exOff=ptrVal(buf,le,exPtr);
    let ex=readIFD(buf,le,exOff);
    if(ex){
      setNum(ex,T.PixelX,4,w);setNum(ex,T.PixelY,4,h);
      addTags(ex,exPtr.o+8,[{tag:T.PixelX,type:4,value:w},{tag:T.PixelY,type:4,value:h}]);
    }
  }else{
    // ExifIFD mit Pixelmaßen anlegen und in IFD0 verlinken
    const neu=len;wu16(v,le,neu,2);
    function putEnt(i,tag,type,val){const o=neu+2+i*12;wu16(v,le,o,tag);wu16(v,le,o+2,type);wu32(v,le,o+4,1);wu32(v,le,o+8,val);}
    putEnt(0,T.PixelX,4,w);putEnt(1,T.PixelY,4,h);wu32(v,le,neu+2+24,0);len=neu+2+24+4;
    addTags(ifd0b,4,[{tag:T.ExifIFD,type:4,value:neu}]);
  }
  return buf.subarray(0,len);
}

function readOrientation(tiff){
  if(!tiff||!tiffOK(tiff))return 1;
  const le=tiffLE(tiff),v=dv(tiff),ifd=readIFD(tiff,le,ru32(v,le,4));
  if(!ifd)return 1;
  const e=ifd.ent.find(x=>x.tag===T.Orientation);if(!e)return 1;
  return ru16(v,le,e.o+8)||1;
}

/* ---------- XMP ---------- */
function patchXmp(xml,w,h,mtime){
  if(!xml)xml='';
  let s=xml;
  if(!s.includes('x:xmpmeta')&&!s.includes('rdf:RDF')){
    const iso=mtime?new Date(mtime).toISOString():'';
    s='<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:tiff="http://ns.adobe.com/tiff/1.0/" xmlns:exif="http://ns.adobe.com/exif/1.0/" xmlns:vk="https://grokbotgames.github.io/videokonverter/" tiff:Orientation="1" tiff:ImageWidth="'+w+'" tiff:ImageLength="'+h+'" exif:PixelXDimension="'+w+'" exif:PixelYDimension="'+h+'">'+(iso?'<vk:OriginalFileModifyDate>'+iso+'</vk:OriginalFileModifyDate>':'')+'</rdf:Description></rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>';
    return s;
  }
  const repl=(names,val)=>{for(const n of names){s=s.replace(new RegExp('('+n+'=")[^"]*"','g'),'$1'+val+'"');s=s.replace(new RegExp('(<(?:\\w+:)?'+n.split(':').pop()+'[^>]*>)[^<]*','g'),'$1'+val);}};
  repl(['tiff:Orientation','Orientation'],'1');
  repl(['tiff:ImageWidth','exif:PixelXDimension','PixelXDimension'],String(w));
  repl(['tiff:ImageLength','exif:PixelYDimension','PixelYDimension'],String(h));
  if(mtime){
    const iso=new Date(mtime).toISOString();
    if(!s.includes('xmlns:vk=')){
      s=s.replace(/<rdf:Description\b/,'<rdf:Description xmlns:vk="https://grokbotgames.github.io/videokonverter/"');
    }
    if(/vk:OriginalFileModifyDate/.test(s))s=s.replace(/(<vk:OriginalFileModifyDate[^>]*>)[^<]*/,'$1'+iso);
    else s=s.replace(/(<rdf:Description[^>]*>)/,'$1<vk:OriginalFileModifyDate>'+iso+'</vk:OriginalFileModifyDate>');
  }
  return s;
}
function findXmpString(u){
  const t=dec(u);
  let i=t.indexOf('<x:xmpmeta');if(i<0)i=t.indexOf('<?xpacket');if(i<0)i=t.indexOf('<x:xmpmeta');
  if(i<0){const j=t.indexOf('http://ns.adobe.com/xap/1.0/');if(j>=0){const k=t.indexOf('<',j);if(k>=0)i=k;}}
  if(i<0)return null;
  const end=t.indexOf('<?xpacket end',i);
  if(end>=0){const e2=t.indexOf('?>',end);return t.slice(i,e2>=0?e2+2:t.length)}
  const e3=t.indexOf('</x:xmpmeta>',i);return e3>=0?t.slice(i,e3+12):null;
}

/* ---------- JPEG ---------- */
function jpegSegs(u){
  if(u[0]!==0xFF||u[1]!==0xD8)return null;
  const segs=[];let o=2;
  while(o+4<=u.length){
    if(u[o]!==0xFF)break;
    while(u[o]===0xFF&&o<u.length)o++;
    const m=u[o++];if(m===0xD9||m===0xDA){ // EOI / SOS
      segs.push({m,data:u.subarray(o-(m===0xDA?0:0)),rest:u.subarray(m===0xDA?o-2:o-2)});
      return segs;
    }
    if(m===0x01||(m>=0xD0&&m<=0xD8))continue;
    const len=be16(u,o);if(len<2||o+len>u.length)break;
    segs.push({m,data:u.subarray(o+2,o+len)});
    o+=len;
  }
  return segs;
}
function extractJpeg(u){
  const segs=jpegSegs(u);if(!segs)return null;
  const meta={exif:null,xmp:null,iptc:null,icc:null};
  const iccParts=[];
  for(const s of segs){
    if(s.m!==0xE1&&s.m!==0xE2&&s.m!==0xED)continue;
    const d=s.data;
    if(s.m===0xE1&&d.length>6&&ascii(d,0,4)==='Exif'&&d[4]===0&&d[5]===0){
      if(!meta.exif)meta.exif=d.subarray(6);
    }else if(s.m===0xE1&&d.length>29&&ascii(d,0,29)==='http://ns.adobe.com/xap/1.0/\0'){
      meta.xmp=(meta.xmp||'')+dec(d.subarray(29));
    }else if(s.m===0xED&&d.length>14&&ascii(d,0,13)==='Photoshop 3.0'&&d[13]===0){
      meta.iptc=d;
    }else if(s.m===0xE2&&d.length>14&&ascii(d,0,11)==='ICC_PROFILE'&&d[11]===0){
      iccParts.push({seq:d[12],tot:d[13],data:d.subarray(14)});
    }
  }
  if(iccParts.length){iccParts.sort((a,b)=>a.seq-b.seq);meta.icc=concat.apply(null,iccParts.map(p=>p.data));}
  return meta;
}
function jpegApp(m,payload){
  if(payload.length>65533)throw new Error('Metadaten-Segment zu groß');
  const o=new Uint8Array(4+payload.length);o[0]=0xFF;o[1]=m;o[2]=(payload.length+2)>>8;o[3]=(payload.length+2)&255;o.set(payload,4);return o;
}
function embedJpeg(u,meta){
  if(u[0]!==0xFF||u[1]!==0xD8)return u;
  let o=2;if(u[2]===0xFF&&u[3]===0xE0){const len=be16(u,4);o=4+len;} // JFIF behalten
  const parts=[u.subarray(0,o)];
  if(meta.exif)parts.push(jpegApp(0xE1,concat(enc('Exif\0\0'),meta.exif)));
  if(meta.xmp){
    const body=concat(enc('http://ns.adobe.com/xap/1.0/\0'),enc(meta.xmp));
    if(body.length<=65533)parts.push(jpegApp(0xE1,body));
  }
  if(meta.icc){
    const chunk=65519;const tot=Math.ceil(meta.icc.length/chunk);
    for(let i=0;i<tot;i++){
      const sl=meta.icc.subarray(i*chunk,Math.min(meta.icc.length,(i+1)*chunk));
      const p=new Uint8Array(14+sl.length);u8set(p,enc('ICC_PROFILE\0'),0);p[12]=i+1;p[13]=tot;p.set(sl,14);
      parts.push(jpegApp(0xE2,p));
    }
  }
  if(meta.iptc)parts.push(jpegApp(0xED,meta.iptc));
  parts.push(u.subarray(o));
  return concat.apply(null,parts);
}

/* ---------- PNG ---------- */
function pngChunks(u){
  const sig=[137,80,78,71,13,10,26,10];
  for(let i=0;i<8;i++)if(u[i]!==sig[i])return null;
  const ch=[];let o=8;
  while(o+12<=u.length){
    const len=be32(u,o),typ=ascii(u,o+4,4),data=u.subarray(o+8,o+8+len);
    ch.push({typ,data,raw:u.subarray(o,o+12+len)});
    o+=12+len;if(typ==='IEND')break;
  }
  return ch;
}
function pngChunk(typ,data){
  const t=enc(typ);const o=new Uint8Array(12+data.length);const d=dv(o);
  d.setUint32(0,data.length);o.set(t,4);o.set(data,8);
  const c=crc32(concat(t,data));d.setUint32(8+data.length,c);return o;
}
function extractPng(u){
  const ch=pngChunks(u);if(!ch)return null;
  const meta={exif:null,xmp:null,icc:null,pngText:[]};
  for(const c of ch){
    if(c.typ==='eXIf')meta.exif=findExifTiff(c.data)||c.data;
    else if(c.typ==='iCCP')meta.iccRaw=c.data; // Komprimiertes Profil inkl. Name – später roh kopieren
    else if(c.typ==='iTXt'||c.typ==='tEXt'||c.typ==='zTXt'){
      const nul=c.data.indexOf(0);const key=nul>=0?ascii(c.data,0,nul):'';
      if(key==='XML:com.adobe.xmp'){meta.xmp=findXmpString(c.data)||dec(c.data);}
      else meta.pngText.push(c);
    }
  }
  return meta;
}
function embedPng(u,meta){
  const ch=pngChunks(u);if(!ch)return u;
  const out=[u.subarray(0,8)];
  for(const c of ch){
    if(c.typ==='IHDR'){out.push(c.raw);
      if(meta.iccRaw)out.push(pngChunk('iCCP',meta.iccRaw));
      else if(meta.icc){ /* unkomprimiertes Profil: Name + Kompressionsflag + zlib würde fehlen – weglassen, außer wir haben iCCP roh */ }
      if(meta.exif)out.push(pngChunk('eXIf',meta.exif));
      if(meta.xmp){
        const key=enc('XML:com.adobe.xmp');const body=concat(key,new Uint8Array([0,0,0,0,0]),enc(meta.xmp)); // flag=0 unkomprimiert
        out.push(pngChunk('iTXt',body));
      }
      if(meta.pngText)for(const t of meta.pngText)out.push(t.raw||pngChunk(t.typ,t.data));
      if(meta._mtime){const d=new Date(meta._mtime),t=new Uint8Array(7);new DataView(t.buffer).setUint16(0,d.getUTCFullYear());t[2]=d.getUTCMonth()+1;t[3]=d.getUTCDate();t[4]=d.getUTCHours();t[5]=d.getUTCMinutes();t[6]=d.getUTCSeconds();out.push(pngChunk('tIME',t));}
    }
    else if(c.typ==='eXIf'||c.typ==='iCCP'||c.typ==='iTXt'||c.typ==='tEXt'||c.typ==='zTXt'||c.typ==='tIME')continue;
    else out.push(c.raw);
  }
  return concat.apply(null,out);
}

/* ---------- WebP ---------- */
function riffChunks(u){
  if(ascii(u,0,4)!=='RIFF'||ascii(u,8,4)!=='WEBP')return null;
  const ch=[];let o=12,end=8+dv(u).getUint32(4,true);if(end>u.length)end=u.length;
  while(o+8<=end){const typ=ascii(u,o,4),sz=dv(u).getUint32(o+4,true);const data=u.subarray(o+8,Math.min(u.length,o+8+sz));ch.push({typ,sz,data});o+=8+sz+(sz&1);}
  return ch;
}
function extractWebp(u){
  const ch=riffChunks(u);if(!ch)return null;
  const meta={exif:null,xmp:null,icc:null};
  for(const c of ch){
    if(c.typ==='EXIF')meta.exif=findExifTiff(c.data);
    else if(c.typ==='XMP ')meta.xmp=findXmpString(c.data)||dec(c.data);
    else if(c.typ==='ICCP')meta.icc=c.data;
  }
  return meta;
}
function webpChunk(typ,data){
  const pad=data.length&1?1:0;const o=new Uint8Array(8+data.length+pad);
  o.set(enc(typ),0);dv(o).setUint32(4,data.length,true);o.set(data,8);return o;
}
function embedWebp(u,meta,w,h){
  const ch=riffChunks(u);if(!ch)return u;
  let alpha=false,hasX=false,xW=w,xH=h;
  const keep=[];
  for(const c of ch){
    if(c.typ==='EXIF'||c.typ==='XMP '||c.typ==='ICCP')continue;
    if(c.typ==='VP8X'){hasX=true;alpha=!!(c.data[0]&0x10);keep.push(c);}
    else{if(c.typ==='ALPH'||c.typ==='VP8L')alpha=true;keep.push(c);}
  }
  const flags=(0<<6)|((meta.icc||meta.iccRaw)?0x20:0)|(alpha?0x10:0)|(meta.exif?0x08:0)|(meta.xmp?0x04:0);
  const xdata=new Uint8Array(10);xdata[0]=flags;
  xdata[4]=(w-1)&255;xdata[5]=((w-1)>>8)&255;xdata[6]=((w-1)>>16)&255;
  xdata[7]=(h-1)&255;xdata[8]=((h-1)>>8)&255;xdata[9]=((h-1)>>16)&255;
  const outCh=[];
  outCh.push(webpChunk('VP8X',xdata));
  if(meta.icc)outCh.push(webpChunk('ICCP',meta.icc));
  for(const c of keep){if(c.typ==='VP8X')continue;outCh.push(webpChunk(c.typ,c.data));}
  if(meta.exif)outCh.push(webpChunk('EXIF',concat(enc('Exif\0\0'),meta.exif)));
  if(meta.xmp)outCh.push(webpChunk('XMP ',enc(meta.xmp)));
  const body=concat.apply(null,outCh);
  const file=new Uint8Array(12+body.length);
  file.set(enc('RIFF'),0);dv(file).setUint32(4,4+body.length,true);file.set(enc('WEBP'),8);file.set(body,12);
  return file;
}

/* ---------- TIFF als Datei / ISOBMFF (HEIC/AVIF) ---------- */
function extractTiffFile(u){
  if(!tiffOK(u))return null;
  const meta={exif:u,xmp:null,icc:null,iptc:null};
  // XMP Tag 700, ICC 34675, IPTC 33723 in IFD0
  const le=tiffLE(u),v=dv(u),ifd=readIFD(u,le,ru32(v,le,4));
  if(ifd){
    for(const e of ifd.ent){
      const sz=typeSize(e.type)*e.count;const off=isInline(e)?e.o+8:ptrVal(u,le,e);
      if(off+sz>u.length)continue;
      const data=u.subarray(off,off+sz);
      if(e.tag===700)meta.xmp=findXmpString(data)||dec(data);
      if(e.tag===34675)meta.icc=data;
      if(e.tag===33723)meta.iptc=data; // rohes IPTC, nicht APP13 – beim JPEG-Schreiben weglassen, wenn kein Photoshop-Header
    }
  }
  return meta;
}
function extractIsobmff(u){
  if(u.length<12)return null;
  const typ=ascii(u,4,4);if(typ!=='ftyp'&&typ!=='mdat'&&typ!=='moov'&&typ!=='meta')return null;
  const meta={exif:null,xmp:null,icc:null};
  const ex=findExifTiff(u);if(ex)meta.exif=ex;
  const xm=findXmpString(u);if(xm)meta.xmp=xm;
  return (meta.exif||meta.xmp)?meta:null;
}

/* ---------- öffentlich ---------- */

function jpegSize(u){
  let o=2;while(o+8<=u.length){
    if(u[o]!==0xFF)break;while(u[o]===0xFF&&o<u.length)o++;
    const m=u[o++];if(m===0xD9||m===0xDA)break;
    if(m===0x01||(m>=0xD0&&m<=0xD8))continue;
    const len=be16(u,o);if(len<2)break;
    if((m>=0xC0&&m<=0xC3)||(m>=0xC5&&m<=0xC7)||(m>=0xC9&&m<=0xCB)||(m>=0xCD&&m<=0xCF))
      return{w:be16(u,o+5),h:be16(u,o+3)};
    o+=len;
  }return null;
}
function pngSize(u){if(u.length>24)return{w:be32(u,16),h:be32(u,20)};return null;}
function webpSize(u){
  const ch=riffChunks(u);if(!ch)return null;
  for(const c of ch){
    if(c.typ==='VP8X'&&c.data.length>=10)return{w:1+c.data[4]+(c.data[5]<<8)+(c.data[6]<<16),h:1+c.data[7]+(c.data[8]<<8)+(c.data[9]<<16)};
    if(c.typ==='VP8 '&&c.data.length>10){const d=c.data;/* start code 0x9d012a at 3 */const i=d[0]===0x9d?0:3;if(d[i]===0x9d&&d[i+1]===0x01&&d[i+2]===0x2a)return{w:((d[i+4]&0x3f)<<8)|d[i+3],h:((d[i+6]&0x3f)<<8)|d[i+5]};}
    if(c.typ==='VP8L'&&c.data.length>=5){const b=dv(c.data).getUint32(1,true);return{w:(b&0x3FFF)+1,h:((b>>14)&0x3FFF)+1};}
  }return null;
}
function tiffSize(u){
  if(!tiffOK(u))return null;const le=tiffLE(u),v=dv(u),ifd=readIFD(u,le,ru32(v,le,4));if(!ifd)return null;
  let w=null,h=null;
  for(const e of ifd.ent){
    const val=isInline(e)?(e.type===3?ru16(v,le,e.o+8):ru32(v,le,e.o+8)):null;
    if(e.tag===T.ImageWidth)w=val;if(e.tag===T.ImageLength)h=val;
  }
  return(w&&h)?{w,h}:null;
}

function merge(a,b){if(!b)return a;for(const k of Object.keys(b))if(b[k]!=null&&a[k]==null)a[k]=b[k];return a;}
function extract(buf,name){
  const u=buf instanceof Uint8Array?buf:new Uint8Array(buf);
  const n=(name||'').toLowerCase();
  let m=null;
  if(u[0]===0xFF&&u[1]===0xD8)m=extractJpeg(u);
  else if(u[0]===0x89&&u[1]===0x50)m=extractPng(u);
  else if(ascii(u,0,4)==='RIFF')m=extractWebp(u);
  else if(tiffOK(u))m=extractTiffFile(u);
  else m=extractIsobmff(u);
  if(!m)m={};
  if(!m.exif){const t=findExifTiff(u);if(t)m.exif=t;}
  if(!m.xmp){const x=findXmpString(u);if(x)m.xmp=x;}
  m.orientation=readOrientation(m.exif);
  let sz=null;
  if(u[0]===0xFF&&u[1]===0xD8)sz=jpegSize(u);
  else if(u[0]===0x89&&u[1]===0x50)sz=pngSize(u);
  else if(ascii(u,0,4)==='RIFF')sz=webpSize(u);
  else if(tiffOK(u))sz=tiffSize(u);
  if(sz){m.storedW=sz.w;m.storedH=sz.h;}
  m.has=!!(m.exif||m.xmp||m.iptc||m.icc||m.iccRaw||(m.pngText&&m.pngText.length));
  return m;
}
function apply(bytes,mime,meta,w,h,mtime){
  if(!meta)meta={};
  const u=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const out={exif:null,xmp:null,iptc:meta.iptc||null,icc:meta.icc||null,iccRaw:meta.iccRaw||null,pngText:meta.pngText||null,_mtime:mtime};
  if(meta.exif)out.exif=patchExif(meta.exif,w,h);
  // XMP immer schreiben, damit die Original-Speicherzeit auch ohne vorheriges XMP erhalten bleibt
  out.xmp=patchXmp(meta.xmp,w,h,mtime);
  // IPTC-Photoshop-Block nur in JPEG einbetten (hat den Photoshop-Header)
  if(out.iptc&&ascii(out.iptc,0,13)!=='Photoshop 3.0')out.iptc=null;
  let r;
  if(mime==='image/jpeg')r=embedJpeg(u,out);
  else if(mime==='image/png')r=embedPng(u,out);
  else if(mime==='image/webp')r=embedWebp(u,out,w,h);
  else r=u;
  return r;
}
async function applyBlob(blob,mime,meta,w,h,mtime){
  const u=new Uint8Array(await blob.arrayBuffer());
  const r=apply(u,mime,meta,w,h,mtime);
  return new Blob([r],{type:mime});
}

window.VKM={extract,apply,applyBlob,patchExif,patchXmp,findExifTiff,readOrientation,crc32};
})();
