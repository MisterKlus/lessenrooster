package io.github.misterklus.lessenrooster;

import android.content.Context;
import android.content.SharedPreferences;

import java.time.LocalDate;
import java.time.MonthDay;

/**
 * Verstopte grapjes (easter eggs) in de app van Thomas:
 * - 7 keer op de titel tikken: geheim thema "blauwdruk" voor de widget (MainActivity)
 * - schudden: draaiende tandwielen (GearsView)
 * - verjaardag: felicitatie in de widget en confetti in de app (ConfettiView)
 * - ver onder het einde van de app: een boodschap van Tymo (activity_main.xml)
 * - de app openen tussen middernacht en 5 uur: "nachtuil" (MainActivity)
 */
final class Eggs {
    static final String NAME = "Thomas";
    private static final MonthDay BIRTHDAY = MonthDay.of(1, 14); // alleen dag en maand: deze code is openbaar

    private Eggs() {}

    static boolean birthday(LocalDate day) {
        return MonthDay.from(day).equals(BIRTHDAY);
    }

    static boolean blueprint(Context c) {
        return prefs(c).getBoolean("blauwdruk", false);
    }

    /** Zet het blauwdruk-thema aan of uit; geeft terug of het nu aan staat. */
    static boolean toggleBlueprint(Context c) {
        boolean on = !blueprint(c);
        prefs(c).edit().putBoolean("blauwdruk", on).apply();
        return on;
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("eggs", Context.MODE_PRIVATE);
    }
}
