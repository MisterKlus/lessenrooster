package io.github.misterklus.lessenrooster;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.StyleSpan;
import android.view.View;
import android.util.SizeF;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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
        String label, countdownCaption;
        LocalDateTime countdownTo; // live aftelklok tot het einde van de les of het begin van de volgende
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

    static String readAll(InputStream in) throws IOException {
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
            st.label = "Nu";
            st.countdownTo = st.current.to;
            st.countdownCaption = "nog";
            st.progress = (double) Duration.between(st.current.from, now).toMillis() / Duration.between(st.current.from, st.current.to).toMillis();
        } else if (day.equals(today)) {
            st.label = "Straks";
            st.countdownTo = st.next.from;
            st.countdownCaption = "begint over";
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

    // ---- Tekenen

    /**
     * Voor het beginscherm: op Android 12+ kiest de gsm zelf per widgetgrootte. Is de widget niet hoog genoeg
     * voor "Daarna", dan valt dat weg in plaats van half afgekapt te worden.
     */
    private static RemoteViews fitted(Context c, State st, boolean hasData) {
        RemoteViews full = render(c, st, hasData, false);
        if (Build.VERSION.SDK_INT < 31) return full;
        RemoteViews compact = render(c, st, hasData, false);
        compact.setViewVisibility(R.id.later, View.GONE);
        Map<SizeF, RemoteViews> sizes = new HashMap<>();
        sizes.put(new SizeF(150f, 60f), compact);
        sizes.put(new SizeF(150f, 185f), full);
        return new RemoteViews(sizes);
    }

    static RemoteViews render(Context c, JSONObject data, LocalDateTime now) {
        return render(c, data == null ? null : state(data, now), data != null, true);
    }

    /** inApp: het voorbeeld in de app (daar volgt het de easter eggs); anders de widget op het beginscherm (altijd gewoon). */
    private static RemoteViews render(Context c, State st, boolean hasData, boolean inApp) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(c.getString(R.string.site_url)));
        v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        boolean blueprint = inApp && Eggs.blueprint(c);
        if (blueprint) blueprint(v);
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
        v.setTextViewText(R.id.meta, l.start + "–" + l.end + "\n" + l.room); // uur en lokaal elk op een regel: naast de klok is weinig plaats
        int progress = blueprint ? R.id.progress_blueprint : R.id.progress;
        v.setViewVisibility(blueprint ? R.id.progress : R.id.progress_blueprint, View.GONE);
        if (st.current != null) {
            v.setViewVisibility(progress, View.VISIBLE);
            v.setProgressBar(progress, 1000, (int) Math.round(Math.max(0, Math.min(1, st.progress)) * 1000), false);
        } else {
            v.setViewVisibility(progress, View.GONE);
        }
        if (st.countdownTo != null) {
            long left = st.countdownTo.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() - System.currentTimeMillis();
            v.setChronometer(R.id.countdown, SystemClock.elapsedRealtime() + left, null, true);
            v.setChronometerCountDown(R.id.countdown, true);
            v.setTextViewText(R.id.countdown_caption, st.countdownCaption);
            v.setViewVisibility(R.id.countdown_box, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.countdown_box, View.GONE);
        }
        SpannableStringBuilder later = new SpannableStringBuilder(st.later.isEmpty() ? "Daarna vrij" : "Daarna");
        later.setSpan(new StyleSpan(Typeface.BOLD), 0, later.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        for (Lesson x : st.later) later.append('\n').append(x.start).append("  ").append(x.name);
        v.setViewVisibility(R.id.later, View.VISIBLE);
        v.setTextViewText(R.id.later, later);
        return v;
    }

    /** Geheim thema "blauwdruk" (easter egg: 7 keer op de titel in de app tikken), alleen in de app: wit op technisch blauw. */
    private static void blueprint(RemoteViews v) {
        v.setInt(R.id.root, "setBackgroundResource", R.drawable.widget_bg_blueprint);
        for (int id : new int[]{R.id.label, R.id.name, R.id.countdown}) v.setTextColor(id, Color.WHITE);
        for (int id : new int[]{R.id.meta, R.id.later, R.id.message, R.id.countdown_caption}) v.setTextColor(id, 0xFFB9D3F5);
    }

    // ---- Meldingen bij een roosterwijziging (gevonden bij de nachtelijke update uit TimeEdit)

    private static final String CHANNEL = "roosterwijzigingen";

    /** Elke wijziging één keer melden; 's nachts (22–7 u) niet, dan volgt de melding bij de eerste update na 7 uur. */
    static void notifyChanges(Context c, JSONObject data) {
        JSONArray changes = data == null ? null : data.optJSONArray("changes");
        if (changes == null || changes.length() == 0) return;
        int hour = LocalTime.now().getHour();
        if (hour < 7 || hour >= 22) return;
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Roosterwijzigingen", NotificationManager.IMPORTANCE_DEFAULT));
        SharedPreferences seen = c.getSharedPreferences("meldingen", Context.MODE_PRIVATE);
        SharedPreferences.Editor edit = seen.edit();
        long now = System.currentTimeMillis();
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(c.getString(R.string.site_url)));
        PendingIntent tap = PendingIntent.getActivity(c, 2, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        for (int i = 0; i < changes.length(); i++) {
            JSONObject ch = changes.optJSONObject(i);
            String id = ch == null ? "" : ch.optString("id");
            if (id.isEmpty() || seen.contains(id)) continue;
            Notification n = new Notification.Builder(c, CHANNEL)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setColor(c.getColor(R.color.accent))
                    .setContentTitle(ch.optString("title"))
                    .setContentText(ch.optString("body"))
                    .setStyle(new Notification.BigTextStyle().bigText(ch.optString("body")))
                    .setContentIntent(tap)
                    .setAutoCancel(true)
                    .build();
            nm.notify(id.hashCode(), n);
            edit.putLong(id, now);
        }
        for (Map.Entry<String, ?> e : seen.getAll().entrySet()) { // oude opruimen
            if (e.getValue() instanceof Long && now - (Long) e.getValue() > 14L * 864e5) edit.remove(e.getKey());
        }
        edit.apply();
    }

    // ---- Bijwerken: nu tekenen en de volgende keer plannen

    static void update(Context c, boolean forceFetch) {
        AppWidgetManager manager = AppWidgetManager.getInstance(c);
        int[] ids = manager.getAppWidgetIds(new ComponentName(c, WidgetProvider.class));
        File f = cacheFile(c);
        boolean stale = !f.exists() || System.currentTimeMillis() - f.lastModified() > DATA_MAX_AGE;
        if (forceFetch || (stale && ids.length > 0)) fetch(c);
        JSONObject data = readCache(c);
        notifyChanges(c, data);
        Updates.checkAndNotify(c); // nieuwe versie van de app op GitHub? (hoogstens twee keer per dag)
        if (ids.length == 0) { // geen widget op het beginscherm: niets meer plannen
            cancel(c);
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        State st = data == null ? null : state(data, now);
        manager.updateAppWidget(ids, fitted(c, st, data != null));
        // Nog geen rooster (geen internet bij de eerste keer): na 2 minuten opnieuw proberen
        schedule(c, data == null ? System.currentTimeMillis() + 2 * 60_000L : nextUpdate(st, now));
    }

    /**
     * Opnieuw tekenen net na het einde van de les (of het begin van de volgende), tijdens een les elke 5 min
     * voor het balkje, en anders na 30 min (bv. om middernacht wordt "Morgen" "Vandaag"). De aftelklok loopt
     * vanzelf. De wekker maakt de gsm niet wakker: staat het scherm uit, dan volgt het bijwerken zodra het aangaat.
     */
    private static long nextUpdate(State st, LocalDateTime now) {
        LocalDateTime at = now.plusMinutes(st != null && st.current != null ? 5 : 30);
        LocalDateTime change = st == null ? null : st.current != null ? st.current.to : st.next != null ? st.next.from : null;
        if (change != null && change.plusSeconds(1).isBefore(at)) at = change.plusSeconds(1);
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
