package io.github.misterklus.lessenrooster;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.StyleSpan;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * Het rooster voor de widget: ophalen van de rooster-site (rooster.json, hetzelfde als de iPhone-widget),
 * bewaren, uitrekenen wat er nu is en de widget tekenen.
 */
final class Rooster {
    static final String ACTION_TICK = "io.github.misterklus.lessenrooster.TICK";
    private static final long DATA_MAX_AGE = 60 * 60_000L; // het rooster verandert hoogstens 's nachts
    private static final String[] DAYS = {"maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"};

    private Rooster() {}

    static final class Lesson {
        String name, room, start, end;
        int color;
        LocalDateTime from, to;
    }

    static final class State {
        Lesson current, next, focus;
        final List<Lesson> later = new ArrayList<>();
        String label;
        double progress;
    }

    // ---- Gegevens: bewaard in de app, hoogstens één keer per uur opnieuw opgehaald

    private static File cacheFile(Context c) {
        return new File(c.getFilesDir(), "rooster.json");
    }

    static JSONObject readCache(Context c) {
        File f = cacheFile(c);
        if (!f.exists()) return null;
        try (InputStream in = new FileInputStream(f)) {
            return new JSONObject(readAll(in));
        } catch (Exception e) {
            return null;
        }
    }

    /** Haalt het rooster op; bij een fout blijft het bewaarde rooster gewoon staan. */
    static boolean fetch(Context c) {
        HttpURLConnection con = null;
        try {
            URL url = new URL(c.getString(R.string.site_url) + "rooster.json?t=" + System.currentTimeMillis());
            con = (HttpURLConnection) url.openConnection();
            con.setConnectTimeout(10000); // een trage verbinding mag de widget niet blokkeren
            con.setReadTimeout(10000);
            con.setUseCaches(false);
            if (con.getResponseCode() != 200) return false;
            String body;
            try (InputStream in = con.getInputStream()) {
                body = readAll(in);
            }
            new JSONObject(body).getJSONArray("lessons"); // controle: echt een rooster
            File tmp = new File(c.getFilesDir(), "rooster.json.tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(body.getBytes(StandardCharsets.UTF_8));
            }
            return tmp.renameTo(cacheFile(c));
        } catch (Exception e) {
            return false;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] b = new byte[8192];
        for (int n; (n = in.read(b)) > 0; ) buf.write(b, 0, n);
        return new String(buf.toByteArray(), StandardCharsets.UTF_8);
    }

    // ---- Wat is er nu: de les van nu of de volgende les, en de rest van die dag

    static State state(JSONObject data, LocalDateTime now) {
        State st = new State();
        JSONObject subjects = data.optJSONObject("subjects");
        JSONArray list = data.optJSONArray("lessons");
        List<Lesson> lessons = new ArrayList<>();
        for (int i = 0; list != null && i < list.length(); i++) {
            JSONObject l = list.optJSONObject(i);
            if (l == null) continue;
            JSONObject s = subjects == null ? null : subjects.optJSONObject(l.optString("key"));
            Lesson x = new Lesson();
            x.name = s != null ? s.optString("name", l.optString("key")) : l.optString("key");
            if (l.optBoolean("exam")) x.name += " · examen";
            x.room = l.optString("room");
            x.start = l.optString("start");
            x.end = l.optString("end");
            try {
                x.color = Color.parseColor(s != null ? s.optString("color", "#7c4ddb") : "#7c4ddb");
                LocalDate day = LocalDate.parse(l.optString("date"));
                x.from = day.atTime(LocalTime.parse(x.start));
                x.to = day.atTime(LocalTime.parse(x.end));
            } catch (Exception e) {
                continue;
            }
            lessons.add(x);
        }
        lessons.sort((a, b) -> a.from.compareTo(b.from));
        for (Lesson l : lessons) {
            if (st.current == null && !l.from.isAfter(now) && now.isBefore(l.to)) st.current = l;
            if (st.next == null && l.from.isAfter(now)) st.next = l;
        }
        st.focus = st.current != null ? st.current : st.next;
        if (st.focus == null) return st;

        LocalDate today = now.toLocalDate(), day = st.focus.from.toLocalDate();
        if (st.current != null) {
            st.label = "Nu · nog " + duration(now, st.current.to);
            st.progress = (double) Duration.between(st.current.from, now).toMillis() / Duration.between(st.current.from, st.current.to).toMillis();
        } else if (day.equals(today)) {
            st.label = "Straks · over " + duration(now, st.next.from);
        } else {
            // Vrije dag (of weekend): zeg dat erbij, zodat de volgende les niet op vandaag lijkt
            boolean weekend = now.getDayOfWeek().getValue() >= 6, freeToday = true;
            for (Lesson l : lessons) if (l.from.toLocalDate().equals(today)) { freeToday = false; break; }
            String name = dayLabel(day, today), date = day.getDayOfMonth() + "/" + day.getMonthValue();
            st.label = (weekend ? "Weekend · " + name.toLowerCase() : freeToday ? "Vandaag vrij · " + name.toLowerCase() : name) + " · " + date;
        }
        for (Lesson l : lessons) {
            if (st.later.size() < 4 && l != st.focus && l.from.isAfter(st.focus.from) && l.from.toLocalDate().equals(day)) st.later.add(l);
        }
        return st;
    }

    private static String dayLabel(LocalDate day, LocalDate today) {
        long diff = ChronoUnit.DAYS.between(today, day);
        if (diff == 0) return "Vandaag";
        if (diff == 1) return "Morgen";
        String d = DAYS[day.getDayOfWeek().getValue() - 1];
        return Character.toUpperCase(d.charAt(0)) + d.substring(1);
    }

    private static String duration(LocalDateTime from, LocalDateTime to) {
        long m = Math.max(1, (long) Math.ceil(Duration.between(from, to).getSeconds() / 60.0));
        return m < 60 ? m + " min" : m / 60 + " u" + (m % 60 != 0 ? " " + m % 60 + " min" : "");
    }

    // ---- Tekenen

    static RemoteViews render(Context c, JSONObject data, LocalDateTime now) {
        return render(c, data == null ? null : state(data, now), data != null);
    }

    private static RemoteViews render(Context c, State st, boolean hasData) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(c.getString(R.string.site_url)));
        v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        if (st == null || st.focus == null) {
            v.setViewVisibility(R.id.lesson, View.GONE);
            v.setViewVisibility(R.id.later, View.GONE);
            v.setViewVisibility(R.id.message, View.VISIBLE);
            v.setTextViewText(R.id.message, hasData ? "Geen lessen meer gepland in dit rooster." : "Nog geen verbinding. Je rooster verschijnt zodra je internet hebt.");
            return v;
        }
        Lesson l = st.focus;
        v.setViewVisibility(R.id.lesson, View.VISIBLE);
        v.setViewVisibility(R.id.message, View.GONE);
        v.setInt(R.id.bar, "setColorFilter", l.color);
        v.setTextViewText(R.id.label, st.label);
        v.setTextViewText(R.id.name, l.name);
        v.setTextViewText(R.id.meta, l.start + "–" + l.end + " · " + l.room);
        if (st.current != null) {
            v.setViewVisibility(R.id.progress, View.VISIBLE);
            v.setProgressBar(R.id.progress, 1000, (int) Math.round(Math.max(0, Math.min(1, st.progress)) * 1000), false);
        } else {
            v.setViewVisibility(R.id.progress, View.GONE);
        }
        SpannableStringBuilder later = new SpannableStringBuilder(st.later.isEmpty() ? "Daarna vrij" : "Daarna");
        later.setSpan(new StyleSpan(Typeface.BOLD), 0, later.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        for (Lesson x : st.later) later.append('\n').append(x.start).append("  ").append(x.name);
        v.setViewVisibility(R.id.later, View.VISIBLE);
        v.setTextViewText(R.id.later, later);
        return v;
    }

    // ---- Bijwerken: nu tekenen en de volgende keer plannen

    static void update(Context c, boolean forceFetch) {
        AppWidgetManager manager = AppWidgetManager.getInstance(c);
        int[] ids = manager.getAppWidgetIds(new ComponentName(c, WidgetProvider.class));
        if (ids.length == 0 && !forceFetch) {
            cancel(c);
            return;
        }
        File f = cacheFile(c);
        if (forceFetch || !f.exists() || System.currentTimeMillis() - f.lastModified() > DATA_MAX_AGE) fetch(c);
        if (ids.length == 0) return;
        LocalDateTime now = LocalDateTime.now();
        JSONObject data = readCache(c);
        State st = data == null ? null : state(data, now);
        manager.updateAppWidget(ids, render(c, st, data != null));
        // Nog geen rooster (geen internet bij de eerste keer): na 2 minuten opnieuw proberen
        schedule(c, data == null ? System.currentTimeMillis() + 2 * 60_000L : nextUpdate(st, now));
    }

    /**
     * Tijdens een les en het uur ervoor elke minuut ("nog 12 min"), anders bij de volgende les of na 30 min.
     * De wekker maakt de gsm niet wakker: staat het scherm uit, dan wordt de widget bijgewerkt zodra het aangaat.
     */
    private static long nextUpdate(State st, LocalDateTime now) {
        LocalDateTime at = now.plusMinutes(30);
        if (st != null && (st.current != null || (st.next != null && st.next.from.isBefore(now.plusMinutes(61))))) {
            at = now.truncatedTo(ChronoUnit.MINUTES).plusMinutes(1).plusSeconds(1);
        } else if (st != null && st.next != null && st.next.from.minusMinutes(60).isBefore(at)) {
            at = st.next.from.minusMinutes(60);
        }
        return at.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private static PendingIntent tick(Context c) {
        Intent i = new Intent(c, WidgetProvider.class).setAction(ACTION_TICK);
        return PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void schedule(Context c, long at) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC, at, tick(c));
            else am.setExactAndAllowWhileIdle(AlarmManager.RTC, at, tick(c));
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC, at, tick(c));
        }
    }

    static void cancel(Context c) {
        c.getSystemService(AlarmManager.class).cancel(tick(c));
    }
}
