# Video und Bild Konverter

Videos und Bilder **kleiner rechnen – komplett lokal im Browser**. Kein Upload, kein Tracking, keine Werbung, keine Online-Dienste zur Laufzeit. Gebaut vor allem für **Xbox-Screenrecord-Clips** (MP4, H.264, 1080p/4K, 30/60 fps), aber auch für lange Bildschirmaufnahmen und Webinar-Mitschnitte (mehrere GB, 2 Stunden).

**Live:** https://grokbotgames.github.io/videokonverter/

## Funktionen

**Videos**
- Qualitäts-Presets: *Hoch* (1080p, 8 Mbit/s), *Mittel* (720p, 4 Mbit/s), *Klein* (720p/30 fps, 2 Mbit/s), *Sehr klein* (480p/30 fps, 1 Mbit/s – WhatsApp/Discord), *Bildschirmaufnahme / Webinar* (bis 1080p, 30 fps, 1,5 Mbit/s, Ton mono 64 kbit/s) und *Benutzerdefiniert* (Auflösung, FPS, Bitrate **oder Zielgröße in MB**, Ton behalten/entfernen, Audio-Bitrate).
- Es wird **nie hochskaliert**; Bitraten werden auf 90 % der Quell-Bitrate gedeckelt, damit die Datei nicht größer wird.
- Drag & Drop (auch **ganze Ordner**), Dateiauswahl, **Warteschlange** mit mehreren Dateien.
- Anzeige von Auflösung, fps, Codec, Dauer, Größe, **geschätzter Zielgröße**, Fortschrittsbalken mit **Restzeit** und Echtzeit-Faktor, Abbrechen, Vorschau, Download (`name_klein.mp4`), Ergebnis mit neuer Größe und Ersparnis in %.
- Kürzen (Start/Ende, bildgenau, mit Neu-Kodierung).
- Dateinamen für den Zielordner werden bereinigt (`sanitizeFileName`: NFC, keine Windows-Zeichen `<>:"/\\|?*`, keine Steuer-/Formatzeichen, kein Punkt/Leerzeichen am Ende, keine reservierten Namen, max. ca. 150 Zeichen, Endung bleibt, Kollisionszähler). Notfalls kurzer Name `video_YYYYMMDD_HHMMSS_klein.mp4` bzw. `bild_…_resized.ext`.
- Sehr große Dateien: Die Quelle wird per `File.slice` stückweise gelesen (nie komplett im RAM), das Ergebnis **streamend auf die Platte** geschrieben (Zielordner via File System Access API oder OPFS), MP4 mit 64-Bit-Offsets (`co64`, große `mdat`), Backpressure über Decoder-/Encoder-Queues.

**Bilder**
- Ordner (rekursiv, auch per Drag & Drop) oder einzelne Bilder verkleinern (größte Kante, Qualität, Format JPEG/WebP/wie Original). JPG, PNG, WebP, BMP, AVIF, GIF, TIFF und HEIC (wenn der Browser sie lesen kann).
- Ausgabe in einen gewählten **Zielordner** (Ordnerstruktur bleibt erhalten) oder als **ZIP**; Dateiname `*_resized.*`, Originale werden nie überschrieben, Nicht-Bilder werden übersprungen, Fortschritt „x von y“.
- **Metadaten** (EXIF, XMP, IPTC, ICC) werden mitkopiert: GPS, Aufnahmedatum (`DateTimeOriginal`, `CreateDate`), Kamera. Die EXIF-Drehung wird ins Bild übernommen und auf Orientierung 1 gesetzt, die Pixelmaße werden angepasst. Eine Miniaturvorschau wird nicht übernommen.
- **Speicherzeit:** In der ZIP behält jeder Eintrag die Original-`lastModified` (DOS-Zeit + Unix-Extrafeld). Im Zielordner kann der Browser die Dateizeit nicht setzen (sie wird „jetzt“) – die Originalzeit steht zusätzlich in `XMP-vk:OriginalFileModifyDate`. Wird ein Bild nicht verkleinert und bleibt im selben Format, bleibt die Datei byte-genau erhalten.
- HEIC/TIFF/AVIF/BMP werden als JPEG (oder in das gewählte Format) geschrieben; der Browser kann HEIC/TIFF nicht als solches speichern.

## Technik
- **WebCodecs** (`VideoDecoder`/`VideoEncoder`/`AudioEncoder`) über **[Mediabunny](https://mediabunny.dev) 1.66.5** (MP4/WebM-Demuxer + Muxer, Konvertierungs-Pipeline), eingebettet.
- Ausgabe: **MP4 (H.264 + AAC)**. Kann der Browser AAC nicht selbst kodieren (z. B. Chrome unter Linux), wird der mitgelieferte AAC-Encoder (FFmpeg-AAC als WebAssembly, `@mediabunny/aac-encoder`) benutzt. Kann der Browser kein H.264 kodieren → **WebM (VP9/VP8 + Opus)**.
- Ohne WebCodecs: **MediaRecorder-Fallback** (Echtzeit: das Video wird in Originaldauer abgespielt und neu aufgenommen; MP4 oder WebM je nach Browser; ungenauer bei Ton/Bild-Länge).
- Alles in **einer HTML-Datei** (`index.html`, ~1,9 MB, davon ~1,8 MB Bibliotheken).

## Browser
| Browser | Status |
|---|---|
| **Chrome / Edge** (aktuell, Windows/Mac/Linux) | empfohlen: volle Funktion, Hardware-Encoding, Zielordner, große Dateien |
| Firefox (aktuell) | WebCodecs vorhanden, aber kein Zielordner (nur Zwischenspeicher/RAM) → für Dateien > 2 GB nicht empfohlen, ggf. WebM |
| Safari | WebCodecs je nach Version; kein Zielordner; bei Problemen MediaRecorder-Fallback |

Grenzen: HEVC/H.265 (und 10-Bit/HDR) lassen sich nur umrechnen, wenn der Browser sie dekodieren kann (Windows: „HEVC-Videoerweiterungen“; sonst Meldung an der Datei). HDR wird als SDR umgerechnet. Ohne Zielordner liegt das Ergebnis im Browser-Speicher (OPFS), bis es heruntergeladen wird – freier Plattenplatz nötig. Der Rechner darf während der Umrechnung nicht in den Standby (die Seite fordert dafür einen Wake-Lock an).

## Xbox-Clips auf den PC
USB-Stick (Aufnahmen & Teilen → Zuletzt aufgenommen → Clip → Auf USB-Laufwerk kopieren), OneDrive (Teilen-Menü), Xbox-App (Cloud) oder Game Bar-Aufnahmen unter `Videos\Captures`. Details stehen auf dem Tab „Hilfe & Grenzen“.

## Tests (Chrome 156, Linux, Software-Encoder, automatisiert mit Puppeteer + ffprobe)
Quelle: 1080p60 H.264+AAC, 20 s, 38,0 MB (15 Mbit/s)

| Preset | Ergebnis | Größe | Ersparnis | Bitrate (ffprobe) |
|---|---|---|---|---|
| Hoch | 1920×1080 60 fps | 20,3 MB | −47 % | 7,97 Mbit/s |
| Mittel | 1280×720 60 fps | 10,3 MB | −73 % | 3,98 Mbit/s |
| Klein | 1280×720 30 fps | 5,2 MB | −86 % | 1,99 Mbit/s |
| Sehr klein | 854×480 30 fps | 2,7 MB | −93 % | 0,99 Mbit/s |
| Bildschirm/Webinar | 1920×1080 30 fps, mono | 5,0 MB | −87 % | 1,95 Mbit/s |
| Benutzerdefiniert 6 MB Ziel | 1280×720 30 fps | 5,7 MB | −85 % | 2,20 Mbit/s |
| Mittel, 5–15 s gekürzt | 1280×720, 10,0 s | 5,1 MB | | |

4K-Clip (3840×2160 30 fps, 8 s, 42,3 MB): Hoch → 1080p, 8,1 MB; Sehr klein → 480p, 1,05 MB.
Lange Videos: 10 min 1080p30 (460 MB) → Webinar-Preset 143 MB in 56 s (≈11× Echtzeit); 5,33 GB 1080p60 (170 s, 250 Mbit/s) → Mittel 87,8 MB in 106 s – Spitzenverbrauch des Browsers nur ca. +0,6 GB über dem Leerlauf (kein Aufbau im RAM).
Alle Ausgaben sind per `ffmpeg -f null` fehlerfrei dekodierbar, Video- und Audiodauer stimmen (±10 ms). Der Test mit >4 GB *Ausgabe* (co64) war mangels Material nicht möglich; die Unterstützung kommt aus Mediabunny.


## Tests Bilder / Metadaten (Chrome 156, Linux, exiftool 13.25)

Testbilder 2000×1000, Orientation=6 (visuell 1000×2000), GPS Berlin (52.520008 N, 13.404954 E), DateTimeOriginal/CreateDate 2024-06-15 14:32:01, Kamera TestCam/Model X, Artist, Copyright, XMP-Titel, z. T. IPTC (Berlin/Germany) und ICC-Profil sRGB. Dateizeit der Originale: 2023-03-20 11:22:33 (Europe/Berlin). Verkleinert auf größte Kante 800 px → 400×800 (bzw. 800×400 bei BMP ohne Drehung).

| Format | Ausgabe | GPS | Aufnahmedatum | Kamera | IPTC | ICC | Orientierung 1 | Pixelmaße EXIF | ZIP-mtime | XMP-Speicherzeit |
|---|---|---|---|---|---|---|---|---|---|---|
| JPEG | JPEG 400×800 | ja | ja | ja | ja | ja | ja | 400×800 | ja (11:22:33) | ja |
| PNG | PNG 400×800 | ja | ja | ja | ja (zTXt-Rohprofil) | ja | ja | 400×800 | ja | ja |
| WebP | WebP 400×800 | ja | ja | ja | nicht in der Quelle | ja | ja | 400×800 | ja | ja |
| AVIF | JPEG 400×800 | ja | ja | ja | nicht in der Quelle | nicht in der Quelle | ja | 400×800 | ja | ja |
| BMP | JPEG 800×400 | nicht in der Quelle | – | – | – | – | (kein EXIF) | – | ja | ja |
| TIFF | – | Chrome/Linux kann TIFF nicht dekodieren (Meldung an der Datei) | | | | | | | | |
| HEIC | – | Chrome/Linux kann HEIC nicht dekodieren (auf Windows/macOS/iPhone oft möglich) | | | | | | | | |

`unzip -l` zeigt das Datum 2023-03-20 11:22, `zipinfo -T` die genaue Zeit 20230320.112233 (Unix-Extrafeld; die DOS-Zeit hat 2-Sekunden-Raster und steht auf 11:22:32). Beim Entpacken setzt `unzip` diese Zeit als Dateizeit. Im Zielordner bleibt die Browser-Dateizeit „jetzt“, die Originalzeit steht in `XMP-vk:OriginalFileModifyDate` (2023-03-20 10:22:33Z). Miniatur-Vorschaubilder werden nicht übernommen. Maker Notes bleiben typischerweise erhalten (EXIF wird möglichst an Ort und Stelle geändert).

## Selbst bauen
`./build.sh` (setzt `vendor/` mit den npm-Paketen `mediabunny@1.66.5` und `@mediabunny/aac-encoder@1.66.5` voraus – `npm pack`, entpacken) erzeugt weiterhin `Videokonverter.html` (Dateiname unverändert; die Oberfläche heißt „Video und Bild Konverter“).

## Lizenzen
Eigener Code: © Grok Bot Games, frei nutzbar. Eingebettet (unverändert): **Mediabunny** und **@mediabunny/aac-encoder** unter **MPL-2.0**, darin der AAC-Encoder aus **FFmpeg (LGPL-2.1+)** als WebAssembly. Lizenztexte im Ordner `licenses/`.
