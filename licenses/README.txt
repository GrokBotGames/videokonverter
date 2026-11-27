Eingebettete Fremdsoftware in Videokonverter.html (alles unverändert, jeweils als eigener Block in der HTML-Datei):

1. Mediabunny 1.66.5 – https://github.com/Vanilagy/mediabunny – Lizenz MPL-2.0 (mediabunny/LICENSE-MPL-2.0.txt)
   Quelltext: https://github.com/Vanilagy/mediabunny bzw. npm-Paket "mediabunny@1.66.5".
2. @mediabunny/aac-encoder 1.66.5 – MPL-2.0 (aac-encoder/LICENSE-MPL-2.0.txt).
   Enthält als WebAssembly den AAC-Encoder aus FFmpeg (LGPL-2.1 oder später, ffmpeg/COPYING.LGPLv2.1 und ffmpeg/LICENSE.md).
   Quelltext: npm-Paket "@mediabunny/aac-encoder@1.66.5" (src/), FFmpeg: https://ffmpeg.org/
   Die Bibliothek ist in der HTML-Datei als separater <script>-Block eingebettet und kann dort durch eine eigene Build-Version ersetzt werden (siehe build.sh).
Der übrige Code (src/*.js, src/head.html) ist eigener Code von Grok Bot Games.
