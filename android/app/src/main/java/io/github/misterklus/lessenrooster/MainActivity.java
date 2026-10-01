package io.github.misterklus.lessenrooster;

import android.Manifest;
import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.time.LocalDateTime;

/** Het scherm van de app: een voorbeeld van de widget en een knop om hem op het beginscherm te zetten. */
public class MainActivity extends Activity {
    private boolean loading;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        findViewById(R.id.pin).setOnClickListener(v -> pinWidget());
        findViewById(R.id.open).setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(getString(R.string.site_url)))));
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
            Toast.makeText(this, R.string.pin_manual, Toast.LENGTH_LONG).show();
        }
    }
}
