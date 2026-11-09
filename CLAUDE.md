# Noor — iPhone web app (PWA)

Shameem's personal Islamic companion app for his iPhone. It's a home-screen web app hosted free on GitHub Pages at **https://shemiek.github.io/noor/**. It isn't a native app because he has no Mac and doesn't want to reinstall every 7 days.

The car head-unit Android app is a separate project (repo `shemiek/drive-dashboard`). Don't mix the two.

## Stack
- Vanilla JS ES modules, no build step. Serve the folder as-is. Everything that's on `main` is published by GitHub Pages; check that the Actions run finishes with `gh api "repos/shemiek/noor/actions/runs?per_page=1"`.
- `sw.js`: cache-first precache. **Bump `VERSION` (currently `noor-v18`) every time you change files**, or iPhones keep the old version. Tell the user to close and reopen the app to update.
- Storage: localStorage under the `noor.` prefix (js/store.js), and IndexedDB for the user's Ratib audio file.
- No outside libraries except Leaflet 1.9.4, which is bundled in vendor/leaflet.

## Files
- `js/app.js`: router and all screens.
  - Today: prayer and iqama times, Tahajjud row and Calendar reminder.
  - Qibla: compass with turn guidance, and a map.
  - Quran: reader and verse-by-verse player.
  - Adhkar: including Ratib and the travel dua.
  - Counter: tasbih and hands-free counting.
  - Settings: themes, prayer calculation, iqama, Tahajjud.
- `js/prayer.js`: PrayTimes calculation, iqama, Friday khutbah at 12:45 in the UAE, Tahajjud (Fajr minus N minutes) and the `.ics` builder, Hijri date, Qibla.
- `js/moon.js`: offline Moon maths (phase, age, rise/set, next phases, and a "sunset view" of the Moon's age for new Hijri months, shown only in the details sheet) and the SVG moon. The Today card opens a details sheet (`openMoonSheet` in app.js).
- `js/voice.js`: hands-free counter (Web Audio pause detection, plus Arabic speech recognition in word mode). Long dhikr such as Swalath Nariya (TASBIH index 8) and Swalath Ibrahimiyya (19) is counted using learned `{pace, gap, late}`. The "What it heard" log on screen exists for tuning to the user's real voice.
- `js/audio.js`: verse-by-verse Quran from cdn.islamic.network, with speed control, verse highlighting and Media Session.
- `js/data.js`: Quran tajweed HTML, adhkar, the TASBIH list (only append new items; indices are saved on the phone) and reciters.
- `js/ui.js`, `css/app.css`: themes are set with `data-theme` (gold, emerald, midnight, black, paper).

## iPhone limits to remember
- Web apps can't schedule notifications or alarms. Reminders go through a Calendar `.ics` file, or the Shortcuts alarm: Settings → Tahajjud → "Copy" puts `{"yyyy-MM-dd": minutes from 21:00 that evening to Tahajjud}` on the clipboard; the user's Shortcut (personal automation at 9:00 PM) looks up today's date and runs Start Timer for that many minutes. Keep that format and the 21:00 base (`SHORTCUT_HOUR`) stable.
- No vibration.
- Sound needs a tap first (`beep.prime`).
- Compass needs a permission tap.

## Map tiles
OpenStreetMap, with Esri World Street Map as a backup if OSM fails. CARTO tiles now need an API key, so don't use them.

## Testing
Use Playwright Chromium with the iPhone 13 device profile against a local `python3 -m http.server`. For the microphone, Chrome's fake-device flags with speech-like synthetic WAVs.
