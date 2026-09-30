#!/usr/bin/env bash
# Test op de emulator (zie .github/workflows/android-widget.yml): zet de widget via de knop in de app op het
# beginscherm, bevestigt het venster van Android en maakt schermafbeeldingen van het beginscherm.
# Gebruik: widget-op-beginscherm.sh <map voor de afbeeldingen>
set -u
OUT=${1:-.}
PKG=io.github.misterklus.lessenrooster.thomas

# Tik op het eerste element waarvan de tekst een van de gegeven teksten is (via uiautomator)
tap_text() {
  for try in 1 2 3 4 5 6; do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
    adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1
    for text in "$@"; do
      bounds=$(grep -o "text=\"$text\"[^>]*bounds=\"[^\"]*\"" /tmp/ui.xml | head -1 | grep -o 'bounds="[^"]*"' | grep -o '[0-9]\+' | tr '\n' ' ')
      if [ -n "$bounds" ]; then
        read -r x1 y1 x2 y2 <<< "$bounds"
        echo "tik op \"$text\""
        adb shell input tap $(( (x1 + x2) / 2 )) $(( (y1 + y2) / 2 ))
        return 0
      fi
    done
    sleep 2
  done
  echo "niet gevonden: $*"
  return 1
}

adb shell am force-stop $PKG
adb shell am start -W -n $PKG/io.github.misterklus.lessenrooster.MainActivity
sleep 12
tap_text "Zet widget op beginscherm"
sleep 3
adb exec-out screencap -p > "$OUT/venster.png"
tap_text "Add to home screen" "ADD TO HOME SCREEN" "Add automatically" "Add" "ADD" "Toevoegen aan startscherm" "Toevoegen"
sleep 3
adb shell input keyevent KEYCODE_HOME
sleep 8
adb exec-out screencap -p > "$OUT/beginscherm-licht.png"
adb shell cmd uimode night yes
sleep 8
adb exec-out screencap -p > "$OUT/beginscherm-donker.png"
adb shell cmd uimode night no
