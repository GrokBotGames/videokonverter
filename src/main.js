/* ===== Start ===== */
(function(){
'use strict';
const {$,$$}=VK;
$('#ver').textContent='v1.3.0 · '+new Date().toLocaleDateString('de-DE');
$$('.tabs button').forEach(b=>b.onclick=()=>{$$('.tabs button').forEach(x=>x.classList.toggle('on',x===b));$$('section.tab').forEach(s=>s.classList.toggle('on',s.id==='tab-'+b.dataset.tab))});
VK.wireDest();
VKV.init();VKI.init();
// Browser-Hinweise
const ua=navigator.userAgent;const chromium=/Chrome\/|Edg\//.test(ua);
if(!VKV.hasWC)VK.banner('<b>Hinweis:</b> Dein Browser unterstützt die schnelle Umrechnung (WebCodecs) nicht. Es läuft nur der langsamere Echtzeit-Modus (Video wird in Originaldauer neu aufgenommen). Für große Dateien bitte aktuelles <b>Chrome oder Edge</b> verwenden.');
else if(!chromium)VK.banner('<b>Tipp:</b> Am besten funktioniert der Konverter in <b>Chrome oder Edge</b> (Zielordner-Funktion, Hardware-Beschleunigung). In diesem Browser kann es Einschränkungen geben.','info');

const a=$('#offlinedl'),hint=$('#offlinehint');
if(a){
  if(location.protocol==='file:'){a.hidden=true;if(hint)hint.textContent='Diese Datei ist bereits lokal – du kannst sie weitergeben oder als Lesezeichen speichern.';}
  else{
    const last=(location.pathname.split('/').filter(Boolean).pop()||'index.html');
    a.setAttribute('href',/\./.test(last)?last:'index.html');
    a.setAttribute('download','Videokonverter.html');
  }
}
if(!window.isSecureContext)VK.banner('Diese Seite läuft nicht in einem „sicheren Kontext“ (https oder localhost) – WebCodecs ist dann ggf. nicht verfügbar. Öffne sie über die GitHub-Pages-Adresse oder per <code>http://localhost</code>.');
})();
