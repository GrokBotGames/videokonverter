#!/bin/bash
# Baut Videokonverter.html (eine einzige Datei) aus src/ + vendor/
set -e
cd "$(dirname "$0")"
MB=vendor/package/dist/bundles/mediabunny.min.cjs
AAC=vendor/aac/package/dist/bundles/mediabunny-aac-encoder.min.js
{
  cat src/head.html
  echo '<script>/* Mediabunny 1.66.5 (MPL-2.0) – https://github.com/Vanilagy/mediabunny – unverändert */'
  cat "$MB"; echo
  echo '</script>'
  echo '<script>/* @mediabunny/aac-encoder 1.66.5 (MPL-2.0, enthält FFmpeg-AAC als WASM, LGPL-2.1+) – unverändert */'
  cat "$AAC"; echo
  echo '</script>'
  echo '<script>'
  cat src/util.js src/video.js src/images.js src/main.js
  echo '</script></body></html>'
} > Videokonverter.html
echo "built $(wc -c < Videokonverter.html) bytes"
