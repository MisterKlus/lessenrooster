package io.github.misterklus.lessenrooster;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.SystemClock;
import android.util.AttributeSet;
import android.view.View;

/**
 * Twee in elkaar grijpende tandwielen (easter egg: schud met je gsm). Elke schok geeft ze een duw,
 * wrijving remt ze weer af. Het kleine tandwiel draait tegengesteld en sneller (12 tegen 8 tanden).
 */
public class GearsView extends View {
    private static final int BIG = 12, SMALL = 8;
    private final Paint bigPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint smallPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint hole = new Paint(Paint.ANTI_ALIAS_FLAG);
    private Path bigGear, smallGear;
    private float module, angle, speed; // speed: graden per seconde van het grote tandwiel
    private long last;

    public GearsView(Context context, AttributeSet attrs) {
        super(context, attrs);
        bigPaint.setColor(context.getColor(R.color.accent));
        smallPaint.setColor(context.getColor(R.color.muted));
        hole.setColor(context.getColor(R.color.page_bg));
    }

    /** Een duw: hoe harder geschud, hoe sneller. */
    void kick(float force) {
        speed = Math.min(speed + force, 2400f);
        postInvalidateOnAnimation();
    }

    boolean spinning() {
        return speed > 8f;
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        module = Math.min(w / 26f, h / 15f); // 22 modules breed, met wat ruimte
        bigGear = gear(BIG, module);
        smallGear = gear(SMALL, module);
    }

    private static Path gear(int teeth, float m) {
        float pitch = m * teeth / 2f, outer = pitch + 0.9f * m, root = pitch - 1.1f * m;
        double step = 2 * Math.PI / teeth;
        Path p = new Path();
        for (int i = 0; i < teeth; i++) {
            double a = i * step; // tand gecentreerd op a + step/2: brede voet, iets smallere top
            point(p, i == 0, root, a);
            point(p, false, root, a + step * 0.12);
            point(p, false, outer, a + step * 0.3);
            point(p, false, outer, a + step * 0.7);
            point(p, false, root, a + step * 0.88);
        }
        p.close();
        return p;
    }

    private static void point(Path p, boolean first, float r, double a) {
        float x = (float) (r * Math.cos(a)), y = (float) (r * Math.sin(a));
        if (first) p.moveTo(x, y);
        else p.lineTo(x, y);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        if (bigGear == null) return;
        long now = SystemClock.uptimeMillis();
        if (last != 0) {
            float dt = Math.min(0.05f, (now - last) / 1000f);
            angle = (angle + speed * dt) % 360f;
            speed *= (float) Math.pow(0.35, dt); // wrijving
        }
        last = spinning() ? now : 0;

        float cy = getHeight() / 2f;
        float cx1 = (getWidth() - 22 * module) / 2f + 7 * module; // groot: buitenstraal 7 modules
        float cx2 = cx1 + module * (BIG + SMALL) / 2f;           // hartafstand 10 modules
        canvas.save();
        canvas.translate(cx1, cy);
        canvas.rotate(angle);
        canvas.drawPath(bigGear, bigPaint);
        canvas.drawCircle(0, 0, module * 1.6f, hole);
        canvas.restore();
        canvas.save();
        canvas.translate(cx2, cy);
        canvas.rotate(180f / SMALL - angle * BIG / SMALL); // een halve tand verschoven, zodat de tanden in elkaar grijpen
        canvas.drawPath(smallGear, smallPaint);
        canvas.drawCircle(0, 0, module * 1.2f, hole);
        canvas.restore();

        if (spinning()) postInvalidateOnAnimation();
    }
}
