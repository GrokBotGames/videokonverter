#!/bin/bash
# Baut Videokonverter.html (eine einzige Datei) aus src/ + vendor/
# In der eingebetteten Mediabunny-Kopie wird die Tool-Kennung geleert (siehe README).
set -e
cd "$(dirname "$0")"
MB=vendor/package/dist/bundles/mediabunny.min.cjs
AAC=vendor/aac/package/dist/bundles/mediabunny-aac-encoder.min.js
{
  cat src/head.html
  echo '<script>/* Mediabunny 1.66.5 (MPL-2.0) – https://github.com/Vanilagy/mediabunny – Original in vendor/; Tool-Kennung in dieser Kopie geleert */'
  cat "$MB"; echo
  echo '</script>'
  echo '<script>/* @mediabunny/aac-encoder 1.66.5 (MPL-2.0, enthält FFmpeg-AAC als WASM, LGPL-2.1+) – unverändert */'
  cat "$AAC"; echo
  echo '</script>'
  echo '<script>'
  cat src/util.js src/video.js src/meta.js src/images.js src/main.js
  echo '</script></body></html>'
} > Videokonverter.html

python3 - << 'PY'
from pathlib import Path
import hashlib, base64, re
p = Path('Videokonverter.html')
html = p.read_text(encoding='utf-8')
# Tool-Kennung in der eingebetteten Mediabunny-Kopie leeren (gleiche Stelle, leerer String)
patches = [
    ('var ph="1.66.5",Kr=`Mediabunny v${ph}`', 'var ph="1.66.5",Kr=""'),
    ('Jg={video:"MediabunnyVideoHandler",audio:"MediabunnySoundHandler",subtitle:"MediabunnyTextHandler"}',
     'Jg={video:"",audio:"",subtitle:""}'),
]
for old, new in patches:
    n = html.count(old)
    if n != 1:
        raise SystemExit(f'Patch nicht eindeutig ({n}×): {old[:60]}')
    html = html.replace(old, new, 1)
# sourceMappingURL nie mit ausliefern (würde sonst eine Verbindung auslösen)
html = re.sub(r'//[#@] sourceMappingURL=.*', '', html)

def csp_hash(s: str) -> str:
    dig = hashlib.sha256(s.encode('utf-8')).digest()
    return "'sha256-" + base64.b64encode(dig).decode('ascii') + "'"

styles = re.findall(r'<style>(.*?)</style>', html, flags=re.S)
scripts = re.findall(r'<script>(.*?)</script>', html, flags=re.S)
if len(styles) != 1 or len(scripts) != 3:
    raise SystemExit(f'unerwartete style/script-Anzahl: {len(styles)} style, {len(scripts)} script')
style_h = csp_hash(styles[0])
script_hs = ' '.join(csp_hash(s) for s in scripts)
csp = (
    "default-src 'none'; "
    f"script-src 'self' 'wasm-unsafe-eval' blob: {script_hs}; "
    f"style-src {style_h}; "
    "img-src blob: data:; "
    "media-src blob: data:; "
    "worker-src blob:; "
    "connect-src 'none'; "
    "form-action 'none'; "
    "base-uri 'none'; "
    "object-src 'none'"
)
if 'CSP_PLACEHOLDER' not in html:
    raise SystemExit('CSP_PLACEHOLDER fehlt')
html = html.replace('CSP_PLACEHOLDER', csp, 1)
p.write_text(html, encoding='utf-8')
print('CSP', csp)
print('hashes style', style_h)
print('scripts', script_hs)
# Probe: Mediabunny v darf in App-Skripten als Doku vorkommen, nicht als Kr=`Mediabunny v${ph}`
if 'Kr=`Mediabunny v${ph}`' in html:
    raise SystemExit('Kennung nicht entfernt')
PY
echo "built $(wc -c < Videokonverter.html) bytes"
