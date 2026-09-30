package io.github.misterklus.lessenrooster;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

/** De widget op het beginscherm. Bijwerken gebeurt in de achtergrond (ophalen kan even duren). */
public class WidgetProvider extends AppWidgetProvider {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Rooster.ACTION_TICK.equals(action)
                || AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(action)
                || AppWidgetManager.ACTION_APPWIDGET_OPTIONS_CHANGED.equals(action)
                || Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            Context app = context.getApplicationContext();
            PendingResult result = goAsync();
            new Thread(() -> {
                try {
                    Rooster.update(app, false);
                } finally {
                    result.finish();
                }
            }).start();
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onDisabled(Context context) {
        Rooster.cancel(context); // laatste widget weg: niet meer bijwerken
    }
}
