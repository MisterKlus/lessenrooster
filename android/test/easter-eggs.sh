#!/usr/bin/env bash
# Test op de emulator (zie .github/workflows/android-widget.yml): schermafbeeldingen van de easter eggs (Eggs.java).
# Gebruik: easter-eggs.sh <map voor de afbeeldingen>
set -u
OUT=${1:-.}
PKG=io.github.misterklus.lessenrooster.thomas

start_app() {
  adb shell am force-stop $PKG
  adb shell am start -W -n $PKG/io.github.misterklus.lessenrooster.MainActivity >/dev/null
  sleep "${1:-8}"
}
# Midden van het element met deze tekst (via uiautomator)
center_of() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1
  grep -o "text=\"$1\"[^>]*bounds=\"[^\"]*\"" /tmp/ui.xml | head -1 | grep -o '[0-9]\+' | tr '\n' ' ' | awk '{print int(($1+$3)/2), int(($2+$4)/2)}'
}

# 1. Zeven keer op de titel tikken: blauwdruk-thema
start_app 10
read -r x y <<< "$(center_of Lessenrooster)"
echo "titel op $x,$y"
for i in 1 2 3 4 5; do adb shell input tap "$x" "$y"; done
adb exec-out screencap -p > "$OUT/titel-5-tikken.png"
adb shell input tap "$x" "$y"
adb shell input tap "$x" "$y"
sleep 0.5
adb exec-out screencap -p > "$OUT/titel-7-tikken.png"
sleep 4
adb exec-out screencap -p > "$OUT/blauwdruk.png"

# 2. Schudden: tandwielen
for i in 1 2 3 4 5 6 7 8; do
  adb emu sensor set acceleration 35:0:9.8; sleep 0.15
  adb emu sensor set acceleration -35:0:9.8; sleep 0.15
done
adb emu sensor set acceleration 0:9.81:0
adb exec-out screencap -p > "$OUT/schudden.png"
sleep 8

# 9. Ver voorbij het einde doorscrollen: geheime boodschap
for i in $(seq 1 20); do adb shell input swipe 160 520 160 120 150; done
sleep 1
adb exec-out screencap -p > "$OUT/geheim.png"

# 8. Verjaardag: klok op 14 januari 2027, 09:00 Belgische tijd
adb shell date -u 011408002027.00 >/dev/null || true
start_app 3
adb exec-out screencap -p > "$OUT/verjaardag.png"
