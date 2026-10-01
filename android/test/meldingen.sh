#!/usr/bin/env bash
# Test op de emulator: verschijnt een melding echt? Installeert een oude versie (versionCode 1, gebouwd in de workflow);
# de app ziet dan de nieuwere versie op GitHub en meldt "Nieuwe versie van Roosterwidget".
# Roosterwijzigingen gebruiken hetzelfde meldingssysteem.
# Gebruik: meldingen.sh <map voor de afbeeldingen>
set -u
OUT=${1:-.}
PKG=io.github.misterklus.lessenrooster.thomas

adb uninstall $PKG >/dev/null 2>&1 || true
adb install oud.apk
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS || true
adb shell date -u 100108002026.00 >/dev/null || true # donderdag 1 oktober, 10:00 Belgische tijd (meldingen niet 's nachts)
adb shell am start -W -n $PKG/io.github.misterklus.lessenrooster.MainActivity >/dev/null
sleep 15
adb exec-out screencap -p > "$OUT/oude-versie.png"
adb shell cmd statusbar expand-notifications
sleep 3
adb exec-out screencap -p > "$OUT/melding.png"
adb shell dumpsys notification --noredact | grep -E "android.title=|android.text=" | grep -iE "versie|rooster" > "$OUT/meldingen.txt" || true
cat "$OUT/meldingen.txt"
adb shell cmd statusbar collapse
