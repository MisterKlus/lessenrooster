package io.github.misterklus.lessenrooster;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import android.widget.Toast;

import java.time.LocalDateTime;

/** Het scherm van de app: een voorbeeld van de widget en een knop om hem op het beginscherm te zetten. */
public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        findViewById(R.id.pin).setOnClickListener(v -> pinWidget());
        findViewById(R.id.open).setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(getString(R.string.site_url)))));
    }

    @Override
    protected void onResume() {
        super.onResume();
        showPreview(); // meteen met het bewaarde rooster
        Context app = getApplicationContext();
        new Thread(() -> {
            Rooster.update(app, true); // vers ophalen en de widgets op het beginscherm meteen bijwerken
            runOnUiThread(this::showPreview);
        }).start();
    }

    private void showPreview() {
        if (isFinishing() || isDestroyed()) return;
        FrameLayout box = findViewById(R.id.preview);
        RemoteViews views = Rooster.render(this, Rooster.readCache(this), LocalDateTime.now());
        box.removeAllViews();
        box.addView(views.apply(this, box));
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
