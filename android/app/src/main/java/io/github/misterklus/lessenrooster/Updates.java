package io.github.misterklus.lessenrooster;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import org.json.JSONObject;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.time.LocalTime;

/**
 * Nieuwe versie van de app? De app staat niet in de Play Store, dus hij kijkt zelf op GitHub
 * (versie.json, gezet door .github/workflows/android-widget.yml) en meldt een nieuwe versie één keer.
 */
final class Updates {
    private static final String INFO_URL = "https://github.com/MisterKlus/lessenrooster/releases/download/widget-app-thomas/versie.json";
    private static final String CHANNEL = "app-updates";
    private static final long CHECK_EVERY = 12 * 3600_000L; // hoogstens twee keer per dag nakijken

    static final class Info {
        long versionCode;
        String url;
    }

    private Updates() {}

    static long installedVersion(Context c) {
        try {
            PackageInfo p = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            return 0;
        }
    }

    /** De nieuwere versie op GitHub, of null (al de nieuwste, of geen internet). Niet op de hoofdthread aanroepen. */
    static Info newer(Context c) {
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(INFO_URL + "?t=" + System.currentTimeMillis()).openConnection();
            con.setConnectTimeout(10000);
            con.setReadTimeout(10000);
            con.setUseCaches(false);
            if (con.getResponseCode() != 200) return null;
            JSONObject json;
            try (InputStream in = con.getInputStream()) {
                json = new JSONObject(Rooster.readAll(in));
            }
            Info info = new Info();
            info.versionCode = json.optLong("versionCode");
            info.url = json.optString("url");
            return info.versionCode > installedVersion(c) && info.url.startsWith("https://") ? info : null;
        } catch (Exception e) {
            return null;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    /** In de achtergrond (bij het bijwerken van de widget): nakijken en een nieuwe versie één keer melden. */
    static void checkAndNotify(Context c) {
        SharedPreferences prefs = c.getSharedPreferences("updates", Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        int hour = LocalTime.now().getHour();
        if (now - prefs.getLong("checked", 0) < CHECK_EVERY || hour < 7 || hour >= 22) return;
        Info info = newer(c);
        prefs.edit().putLong("checked", now).apply();
        if (info == null || prefs.getLong("notified", 0) >= info.versionCode) return;
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "App-updates", NotificationManager.IMPORTANCE_DEFAULT));
        PendingIntent tap = PendingIntent.getActivity(c, 3, download(info), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String text = "Tik om hem te downloaden en installeer hem over de huidige versie. Je widget blijft staan.";
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(c.getColor(R.color.accent))
                .setContentTitle("Nieuwe versie van Roosterwidget")
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(tap)
                .setAutoCancel(true)
                .build();
        nm.notify(1, n);
        prefs.edit().putLong("notified", info.versionCode).apply();
    }

    /** Opent de download in de browser; daarna installeert Android hem over de huidige versie. */
    static Intent download(Info info) {
        return new Intent(Intent.ACTION_VIEW, Uri.parse(info.url));
    }
}
