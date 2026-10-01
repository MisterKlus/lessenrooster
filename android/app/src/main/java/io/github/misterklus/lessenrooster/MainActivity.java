package io.github.misterklus.lessenrooster;

import android.Manifest;
import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** Het scherm van de app: een voorbeeld van de widget en een knop om hem op het beginscherm te zetten. */
public class MainActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean loading;
    private Toast toast;
    private int titleTaps, shakes;
    private long lastTitleTap, lastShake;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        findViewById(R.id.pin).setOnClickListener(v -> pinWidget());
        findViewById(R.id.open).setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(getString(R.string.site_url)))));
        findViewById(R.id.title).setOnClickListener(v -> onTitleTap());
        findViewById(R.id.gears_overlay).setOnClickListener(v -> hideGears());
        if (Eggs.blueprint(this)) applyBlueprint();
        // Android 13+: toestemming vragen voor meldingen bij een roosterwijziging
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        loading = true;
        showPreview(); // meteen met het bewaarde rooster
        Context app = getApplicationContext();
        new Thread(() -> {
            // Vers ophalen; lukt het niet meteen (trage verbinding bij het opstarten), dan nog één keer
            if (!Rooster.fetch(app)) {
                try { Thread.sleep(3000); } catch (InterruptedException ignored) { }
                Rooster.fetch(app);
            }
            Rooster.update(app, false); // de widgets op het beginscherm meteen bijwerken
            Updates.Info update = Updates.newer(app); // nieuwe versie van de app?
            runOnUiThread(() -> { loading = false; showPreview(); showUpdate(update); });
        }).start();
        SensorManager sensors = getSystemService(SensorManager.class);
        Sensor accelerometer = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        if (accelerometer != null) sensors.registerListener(shakeListener, accelerometer, SensorManager.SENSOR_DELAY_GAME);
        if (Eggs.birthday(LocalDate.now())) ((ConfettiView) findViewById(R.id.confetti)).start();
    }

    @Override
    protected void onPause() {
        super.onPause();
        SensorManager sensors = getSystemService(SensorManager.class);
        if (sensors != null) sensors.unregisterListener(shakeListener);
        handler.removeCallbacksAndMessages(null);
        findViewById(R.id.gears_overlay).setVisibility(View.GONE);
    }

    private void showPreview() {
        if (isFinishing() || isDestroyed()) return;
        FrameLayout box = findViewById(R.id.preview);
        JSONObject data = Rooster.readCache(this);
        RemoteViews views = Rooster.render(this, data, LocalDateTime.now());
        View widget = views.apply(this, box);
        if (data == null && loading) ((TextView) widget.findViewById(R.id.message)).setText("Rooster ophalen…");
        box.removeAllViews();
        box.addView(widget);
        showBanner(data);
    }

    // ---- Easter eggs bovenaan: verjaardag, of "nachtuil" als je de app tussen middernacht en 5 uur opent

    private void showBanner(JSONObject data) {
        TextView banner = findViewById(R.id.banner);
        LocalDateTime now = LocalDateTime.now();
        if (Eggs.birthday(now.toLocalDate())) {
            banner.setText("Gelukkige verjaardag, " + Eggs.NAME + "!");
        } else if (now.getHour() < 5) {
            Rooster.State st = data == null ? null : Rooster.state(data, now);
            boolean lessonToday = st != null && st.next != null && st.next.from.toLocalDate().equals(now.toLocalDate());
            banner.setText(lessonToday ? "Nachtuil! Je eerste les begint al om " + st.next.start + ". Ga maar lekker slapen."
                    : "Nachtuil! Vandaag heb je geen les, maar slapen mag ook.");
        } else {
            banner.setVisibility(View.GONE);
            return;
        }
        banner.setVisibility(View.VISIBLE);
    }

    private void showUpdate(Updates.Info update) {
        if (isFinishing() || isDestroyed()) return;
        View button = findViewById(R.id.update);
        button.setVisibility(update == null ? View.GONE : View.VISIBLE);
        if (update != null) button.setOnClickListener(v -> startActivity(Updates.download(update)));
    }

    private void pinWidget() {
        AppWidgetManager manager = getSystemService(AppWidgetManager.class);
        if (manager != null && manager.isRequestPinAppWidgetSupported()) {
            manager.requestPinAppWidget(new ComponentName(this, WidgetProvider.class), null, null);
        } else {
            say(getString(R.string.pin_manual));
        }
    }

    private void say(String text) {
        if (toast != null) toast.cancel();
        toast = Toast.makeText(this, text, Toast.LENGTH_SHORT);
        toast.show();
    }

    // ---- Easter egg: 7 keer op de titel tikken, zoals de verborgen ontwikkelaarsopties van Android

    private void onTitleTap() {
        long now = SystemClock.uptimeMillis();
        titleTaps = now - lastTitleTap < 1500 ? titleTaps + 1 : 1;
        lastTitleTap = now;
        if (titleTaps >= 7) {
            titleTaps = 0;
            boolean on = Eggs.toggleBlueprint(this);
            Toast.makeText(getApplicationContext(), on ? "Je bent nu roosteringenieur! De app staat in blauwdruk." : "Blauwdruk uit. Gewoon weer student.", Toast.LENGTH_LONG).show();
            recreate(); // de app opnieuw opbouwen in het (gewone of geheime) thema; de widget op je beginscherm blijft gewoon
        } else if (titleTaps >= 3) {
            say("Nog " + (7 - titleTaps) + " keer tikken…");
        }
    }

    /** Geheim thema "blauwdruk": de app in wit op technisch blauw, zoals een bouwtekening. */
    private void applyBlueprint() {
        int blue = 0xFF1D4E89, light = 0xFFB9D3F5;
        findViewById(R.id.app_root).setBackgroundColor(blue);
        getWindow().setStatusBarColor(blue);
        getWindow().setNavigationBarColor(blue);
        getWindow().getDecorView().setSystemUiVisibility(0); // lichte iconen op de blauwe balken
        for (int id : new int[]{R.id.title, R.id.secret, R.id.secret_text}) ((TextView) findViewById(id)).setTextColor(Color.WHITE);
        for (int id : new int[]{R.id.intro, R.id.help, R.id.secret_sign}) ((TextView) findViewById(id)).setTextColor(light);
        TextView pin = findViewById(R.id.pin);
        pin.setBackgroundTintList(ColorStateList.valueOf(Color.WHITE));
        pin.setTextColor(blue);
        ((TextView) findViewById(R.id.open)).setTextColor(Color.WHITE);
    }

    // ---- Easter egg: schudden laat de tandwielen draaien (hoe harder, hoe sneller)

    private final SensorEventListener shakeListener = new SensorEventListener() {
        @Override
        public void onSensorChanged(SensorEvent e) {
            float x = e.values[0], y = e.values[1], z = e.values[2];
            float force = (float) Math.sqrt(x * x + y * y + z * z) - SensorManager.GRAVITY_EARTH;
            if (force > 8f) onShake(force);
        }

        @Override
        public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    };

    private void onShake(float force) {
        long now = SystemClock.uptimeMillis();
        View overlay = findViewById(R.id.gears_overlay);
        if (overlay.getVisibility() != View.VISIBLE) {
            if (now - lastShake < 120) return; // één schok geeft meerdere metingen
            shakes = now - lastShake < 900 ? shakes + 1 : 1;
            lastShake = now;
            if (shakes < 3) return; // echt schudden, niet per ongeluk een tik
            overlay.setAlpha(0f);
            overlay.setVisibility(View.VISIBLE);
            overlay.animate().alpha(1f).setDuration(200);
            handler.postDelayed(this::hideWhenStopped, 1500);
        }
        lastShake = now;
        ((GearsView) findViewById(R.id.gears)).kick(force * 30f);
    }

    private void hideWhenStopped() {
        GearsView gears = findViewById(R.id.gears);
        if (gears.spinning() || SystemClock.uptimeMillis() - lastShake < 1500) handler.postDelayed(this::hideWhenStopped, 500);
        else hideGears();
    }

    private void hideGears() {
        handler.removeCallbacksAndMessages(null);
        View overlay = findViewById(R.id.gears_overlay);
        overlay.animate().alpha(0f).setDuration(300).withEndAction(() -> overlay.setVisibility(View.GONE));
    }
}
