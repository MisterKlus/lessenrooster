package io.github.misterklus.lessenrooster;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.os.SystemClock;
import android.util.AttributeSet;
import android.view.View;

import java.util.Random;

/** Confetti op Thomas' verjaardag (easter egg). Vangt geen tikken op: de app blijft gewoon bruikbaar. */
public class ConfettiView extends View {
    private static final int[] COLORS = {0xFF7C4DDB, 0xFF5B7BD5, 0xFFC79443, 0xFF3A9580, 0xFFC46B80, 0xFF4A9CB8};
    private static final int COUNT = 140;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Random random = new Random();
    private float[] x, y, vx, vy, rot, vrot;
    private int[] color;
    private long last;

    public ConfettiView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    void start() {
        post(() -> {
            int w = getWidth(), h = getHeight();
            if (w == 0 || h == 0) return;
            float d = getResources().getDisplayMetrics().density;
            x = new float[COUNT]; y = new float[COUNT]; vx = new float[COUNT]; vy = new float[COUNT];
            rot = new float[COUNT]; vrot = new float[COUNT]; color = new int[COUNT];
            for (int i = 0; i < COUNT; i++) {
                x[i] = random.nextFloat() * w;
                y[i] = -random.nextFloat() * h * 0.7f;
                vx[i] = (random.nextFloat() - 0.5f) * 80 * d;
                vy[i] = (120 + random.nextFloat() * 160) * d;
                rot[i] = random.nextFloat() * 360;
                vrot[i] = (random.nextFloat() - 0.5f) * 540;
                color[i] = COLORS[random.nextInt(COLORS.length)];
            }
            last = 0;
            postInvalidateOnAnimation();
        });
    }

    @Override
    protected void onDraw(Canvas canvas) {
        if (x == null) return;
        long now = SystemClock.uptimeMillis();
        float dt = last == 0 ? 0 : Math.min(0.05f, (now - last) / 1000f);
        last = now;
        float d = getResources().getDisplayMetrics().density, h = getHeight();
        boolean falling = false;
        for (int i = 0; i < COUNT; i++) {
            x[i] += vx[i] * dt;
            y[i] += vy[i] * dt;
            rot[i] += vrot[i] * dt;
            if (y[i] > h + 20 * d) continue;
            falling = true;
            canvas.save();
            canvas.translate(x[i], y[i]);
            canvas.rotate(rot[i]);
            paint.setColor(color[i]);
            canvas.drawRect(-3 * d, -5 * d, 3 * d, 5 * d, paint);
            canvas.restore();
        }
        if (falling) postInvalidateOnAnimation();
        else x = null;
    }
}
