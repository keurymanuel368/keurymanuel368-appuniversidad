package app.rumbo.widget;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.SweepGradient;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * Dibuja los widgets de Rumbo con Canvas: la brújula (anillo de progreso con la aguja naranja), las clases de hoy y lo que viene.
 * Todo se pinta en un Bitmap del tamaño exacto del widget, así se ve nítido en cualquier tamaño que le des.
 */
final class Art {
    private static final int NAVY = 0xFF0B1140, NAVY2 = 0xFF1B2DA8, BLUE = 0xFF3463FF, NEEDLE = 0xFFFF8A1F, RED = 0xFFE5484D;
    private static final int[] PALETA = {218, 262, 172, 28, 332, 148, 196, 48};
    private static final Typeface BLACK = Typeface.create("sans-serif-black", Typeface.NORMAL);
    private static final Typeface MED = Typeface.create("sans-serif-medium", Typeface.NORMAL);
    private static final Typeface REG = Typeface.create("sans-serif", Typeface.NORMAL);

    private final Context ctx;
    private final float d;

    Art(Context ctx) {
        this.ctx = ctx;
        this.d = ctx.getResources().getDisplayMetrics().density;
    }

    private float dp(float v) { return v * d; }

    private TextPaint text(int color, float sizeDp, Typeface tf) {
        TextPaint p = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color); p.setTextSize(dp(sizeDp)); p.setTypeface(tf);
        return p;
    }

    private static String fit(String s, TextPaint p, float maxW) {
        if (s == null) return "";
        return TextUtils.ellipsize(s, p, Math.max(0, maxW), TextUtils.TruncateAt.END).toString();
    }

    private static int hueColor(String title) {
        int h = 0;
        for (int i = 0; i < title.length(); i++) h = h * 31 + title.charAt(i);
        return Color.HSVToColor(new float[]{PALETA[(h & 0x7fffffff) % PALETA.length], 0.72f, 0.96f});
    }

    private static int alpha(int color, float a) { return (color & 0x00FFFFFF) | ((int) (a * 255) << 24); }

    // ---------------------------------------------------------------- fondo

    private int moodColor(String mood) {
        switch (mood) {
            case "feliz": return 0xFF34D399;
            case "atento": return NEEDLE;
            case "alerta": return RED;
            default: return 0xFF7C5CFF;
        }
    }

    private Bitmap canvasBitmap(int w, int h) { return Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888); }

    /** Esquina inferior izquierda cerrada: la firma de las tarjetas de Rumbo. */
    private void mask(Canvas c, int w, int h) {
        float r = dp(28), rs = dp(28);
        Path path = new Path();
        path.addRoundRect(new RectF(0, 0, w, h), new float[]{r, r, r, r, r, r, rs, rs}, Path.Direction.CW);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_IN));
        p.setColor(Color.BLACK);
        c.drawPath(path, p);
    }

    private void background(Canvas c, int w, int h, String mood) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setShader(new RadialGradient(0, 0, Math.max(w, h) * 1.2f, new int[]{BLUE, NAVY2, NAVY}, new float[]{0f, 0.42f, 1f}, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
        p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setShader(new RadialGradient(w * 0.96f, -h * 0.05f, Math.max(w, h) * 0.75f, alpha(moodColor(mood), 0.38f), 0x00000000, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
        p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setShader(new RadialGradient(0, h * 1.05f, Math.max(w, h) * 0.6f, 0x4D38BDF8, 0x00000000, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
        // Brújula tenue de fondo, abajo a la derecha
        float R = Math.min(h * 0.95f, dp(120)), cx = w - dp(26), cy = h + dp(4);
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE); ring.setColor(0x16FFFFFF); ring.setStrokeWidth(dp(1.2f));
        c.drawCircle(cx, cy, R, ring);
        c.drawCircle(cx, cy, R * 0.74f, ring);
        c.drawCircle(cx, cy, R * 0.46f, ring);
        Paint tick = new Paint(ring);
        tick.setColor(0x26FFFFFF);
        c.drawLine(cx, cy - R - dp(4), cx, cy - R * 0.84f, tick);
        c.drawLine(cx - R - dp(4), cy, cx - R * 0.84f, cy, tick);
        Path needle = new Path();
        needle.moveTo(cx, cy - R * 0.55f); needle.lineTo(cx + R * 0.1f, cy); needle.lineTo(cx - R * 0.1f, cy); needle.close();
        Paint np = new Paint(Paint.ANTI_ALIAS_FLAG);
        np.setColor(alpha(NEEDLE, 0.16f));
        c.drawPath(needle, np);
    }

    // ---------------------------------------------------------------- piezas

    /** Anillo de progreso con brújula: el punto naranja marca hasta dónde vas. */
    private void dial(Canvas c, float cx, float cy, float R, float prog, String big, String label, Drawable mascot) {
        // Bisel de brújula: 60 marcas alrededor del anillo
        Paint tkp = new Paint(Paint.ANTI_ALIAS_FLAG);
        tkp.setStrokeCap(Paint.Cap.ROUND);
        for (int i = 0; i < 60; i++) {
            boolean big5 = i % 5 == 0;
            tkp.setStrokeWidth(dp(big5 ? 1.4f : 0.9f));
            tkp.setColor(big5 ? 0xB3FFFFFF : 0x40FFFFFF);
            double a = Math.toRadians(i * 6 - 90);
            float r1 = R, r0 = R - (big5 ? R * 0.1f : R * 0.06f);
            c.drawLine(cx + (float) (r0 * Math.cos(a)), cy + (float) (r0 * Math.sin(a)), cx + (float) (r1 * Math.cos(a)), cy + (float) (r1 * Math.sin(a)), tkp);
        }
        R = R * 0.84f;
        float stroke = Math.max(dp(5), R * 0.15f);
        float rr = R - stroke / 2f;
        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setStyle(Paint.Style.STROKE); track.setStrokeWidth(stroke); track.setColor(0x2EFFFFFF);
        c.drawCircle(cx, cy, rr, track);

        float p = Math.max(0.025f, Math.min(1f, prog));
        Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
        arc.setStyle(Paint.Style.STROKE); arc.setStrokeWidth(stroke); arc.setStrokeCap(Paint.Cap.ROUND);
        SweepGradient sg = new SweepGradient(cx, cy, new int[]{0xFF4A6DFF, 0xFF8FA8FF, 0xFFFFB86B, NEEDLE}, new float[]{0f, 0.55f, 0.9f, 1f});
        Matrix m = new Matrix(); m.setRotate(-90, cx, cy);
        sg.setLocalMatrix(m);
        arc.setShader(sg);
        RectF oval = new RectF(cx - rr, cy - rr, cx + rr, cy + rr);
        c.drawArc(oval, -90, 360f * p, false, arc);

        // Marca de la aguja en la punta del arco
        double ang = Math.toRadians(-90 + 360f * p);
        float px = (float) (cx + rr * Math.cos(ang)), py = (float) (cy + rr * Math.sin(ang));
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(Color.WHITE);
        c.drawCircle(px, py, stroke * 0.78f, dot);
        dot.setColor(NEEDLE);
        c.drawCircle(px, py, stroke * 0.5f, dot);

        // Puntos cardinales
        Paint tk = new Paint(Paint.ANTI_ALIAS_FLAG);
        tk.setColor(0x66FFFFFF);
        float ir = rr - stroke * 0.95f;
        for (int i = 0; i < 4; i++) {
            double a = Math.toRadians(i * 90 - 90);
            c.drawCircle((float) (cx + ir * Math.cos(a)), (float) (cy + ir * Math.sin(a)), Math.max(dp(1.2f), R * 0.025f), tk);
        }

        if (mascot != null) {
            float s = rr * 1.25f;
            mascot.setBounds((int) (cx - s * 0.43f), (int) (cy - s * 0.52f), (int) (cx + s * 0.43f), (int) (cy + s * 0.5f));
            mascot.draw(c);
            return;
        }
        float inner = (rr - stroke) * 2f * 0.86f;
        TextPaint tp = text(Color.WHITE, 10, BLACK);
        float size = R * 0.72f;
        tp.setTextSize(size);
        while (tp.measureText(big) > inner && size > dp(8)) { size -= dp(1); tp.setTextSize(size); }
        tp.setTextAlign(Paint.Align.CENTER);
        boolean hasLabel = label != null && !label.isEmpty();
        float baseline = cy + (hasLabel ? size * 0.20f : size * 0.36f);
        c.drawText(big, cx, baseline, tp);
        if (hasLabel) {
            TextPaint lp = text(0xCCFFFFFF, 10, MED);
            lp.setTextSize(Math.max(dp(8), R * 0.2f));
            lp.setTextAlign(Paint.Align.CENTER);
            c.drawText(fit(label, lp, inner), cx, baseline + lp.getTextSize() * 1.2f, lp);
        }
    }

    /** El mismo emblema del ícono: anillo con aguja naranja al norte. */
    private void emblem(Canvas c, float cx, float cy, float R) {
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE); ring.setStrokeWidth(Math.max(dp(1.6f), R * 0.12f)); ring.setColor(0xF2FFFFFF);
        c.drawCircle(cx, cy, R * 0.88f, ring);
        Path n = new Path();
        n.moveTo(cx, cy - R * 0.62f); n.lineTo(cx + R * 0.2f, cy); n.lineTo(cx - R * 0.2f, cy); n.close();
        Path s = new Path();
        s.moveTo(cx, cy + R * 0.62f); s.lineTo(cx + R * 0.2f, cy); s.lineTo(cx - R * 0.2f, cy); s.close();
        Paint f = new Paint(Paint.ANTI_ALIAS_FLAG);
        f.setColor(NEEDLE); c.drawPath(n, f);
        f.setColor(Color.WHITE); c.drawPath(s, f);
    }

    private void pill(Canvas c, String t, float right, float cy, int fill, int fg, float sizeDp) {
        TextPaint tp = text(fg, sizeDp, BLACK);
        float tw = tp.measureText(t), padX = dp(8), h = dp(sizeDp + 9);
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(fill);
        RectF r = new RectF(right - tw - padX * 2, cy - h / 2, right, cy + h / 2);
        c.drawRoundRect(r, h / 2, h / 2, bg);
        c.drawText(t, r.left + padX, cy + tp.getTextSize() * 0.35f, tp);
    }

    private float pillWidth(String t, float sizeDp) { return text(Color.WHITE, sizeDp, BLACK).measureText(t) + dp(16); }

    private void wrapped(Canvas c, String t, TextPaint p, float x, float y, int maxW, int maxLines) {
        if (t == null || t.isEmpty() || maxW <= 0) return;
        StaticLayout l = StaticLayout.Builder.obtain(t, 0, t.length(), p, maxW).setMaxLines(maxLines).setEllipsize(TextUtils.TruncateAt.END)
                .setAlignment(Layout.Alignment.ALIGN_NORMAL).build();
        c.save(); c.translate(x, y); l.draw(c); c.restore();
    }

    // ---------------------------------------------------------------- datos de cada anillo

    private static final class Dial { String big = "", label = ""; float prog; boolean mascot; }

    private Dial dialFor(Model m, Plan p) {
        Dial v = new Dial();
        if (p.live != null) {
            long left = p.live.endMin - p.minOfDay;
            v.big = String.valueOf(left); v.label = "MIN · CLASE";
            v.prog = (float) (p.minOfDay - p.live.cls.s) / Math.max(1, p.live.cls.e - p.live.cls.s);
        } else if (p.next != null && p.minutesTo(p.next) < 12 * 60) {
            long mins = p.minutesTo(p.next);
            if (mins < 100) { v.big = String.valueOf(mins); v.label = "MIN"; }
            else { v.big = (mins / 60) + " h"; v.label = (mins % 60 > 0 ? (mins % 60) + " MIN" : ""); }
            v.prog = (float) (1.0 - Math.min(1.0, mins / 180.0));
        } else if (p.next != null) {
            v.big = Plan.DIAS[(p.dayIdx + p.next.dayOffset) % 7];
            v.label = Plan.h12(p.next.cls.s).replace(" a. m.", "a").replace(" p. m.", "p");
            v.prog = p.hasTerm ? (float) p.termPct : 0.05f;
        } else if (p.hasTerm) {
            if (p.before) { v.big = String.valueOf(p.daysToStart); v.label = p.daysToStart == 1 ? "DÍA" : "DÍAS"; v.prog = 0.04f; }
            else if (p.after) { v.big = "100%"; v.label = "LISTO"; v.prog = 1f; }
            else { v.big = "S" + p.week; v.label = "DE " + p.weeks; v.prog = (float) p.termPct; }
        } else { v.mascot = true; v.prog = 0.06f; }
        return v;
    }

    private static final class Row { String title, meta, tag; int color; boolean live, urgent; }

    private Row rowOf(Plan.Slot s, String tag, boolean live) {
        Row r = new Row();
        r.title = s.cls.title;
        r.meta = "· " + Plan.h12(s.cls.s).replace(" a. m.", "").replace(" p. m.", "") + "–" + Plan.h12(s.cls.e) + (s.cls.room != null && !s.cls.room.isEmpty() ? " · " + s.cls.room : "");
        r.tag = tag; r.live = live; r.color = hueColor(s.cls.title);
        return r;
    }

    private List<Row> rows(Model m, Plan p, int max) {
        List<Row> out = new ArrayList<>();
        if (p.live != null) out.add(rowOf(p.live, "AHORA", true));
        for (Plan.Slot s : p.todayAll) {
            if (out.size() >= max) break;
            if (s == p.live || s.cls.s <= p.minOfDay) continue;
            out.add(rowOf(s, "en " + Plan.when(p.minutesTo(s)), false));
        }
        long nowSec = System.currentTimeMillis() / 1000;
        for (Model.Task t : m.tasks) {
            if (out.size() >= max) break;
            if (!(t.late || (t.dueAt > 0 && t.dueAt - nowSec < 36 * 3600))) continue;
            Row r = new Row();
            r.title = t.title; r.meta = "· " + (t.course == null || t.course.isEmpty() ? "Entrega" : t.course);
            r.tag = t.late ? "Atrasada" : t.when; r.urgent = t.late; r.color = hueColor(t.course == null ? t.title : t.course);
            out.add(r);
        }
        if (out.size() < max && p.next != null && p.next.dayOffset > 0) {
            boolean listed = false;
            for (Row r : out) if (r.title.equals(p.next.cls.title)) listed = true;
            if (!listed) out.add(rowOf(p.next, p.next.dayOffset == 1 ? "mañana" : Plan.DIAS[(p.dayIdx + p.next.dayOffset) % 7].toLowerCase(), false));
        }
        return out;
    }

    // ---------------------------------------------------------------- widget grande (Hoy)

    Bitmap large(Model m, Plan p, int w, int h, Drawable mascot) {
        Bitmap b = canvasBitmap(w, h);
        Canvas c = new Canvas(b);
        int layer = c.saveLayer(0, 0, w, h, null);
        background(c, w, h, m.mood);

        float pad = dp(14);
        float D = Math.min(h - 2 * pad, w * 0.31f), R = D / 2f, cx = pad + R, cy = h / 2f;
        Dial dv = dialFor(m, p);
        dial(c, cx, cy, R, dv.prog, dv.big, dv.label, dv.mascot ? mascot : null);

        float x0 = pad + D + dp(16), x1 = w - pad;
        // Cabecera: «HOY · MIÉ 4» y la racha
        TextPaint hp = text(NEEDLE, 9.5f, BLACK);
        hp.setLetterSpacing(0.12f);
        float top = pad + dp(2);
        c.drawText("HOY · " + Plan.DIAS[p.dayIdx] + " " + p.dom, x0, top + dp(9), hp);
        float chipRight = x1;
        if (m.streak > 0) {
            String t = "🔥 " + m.streak;
            pill(c, t, chipRight, top + dp(6), 0x26FFFFFF, Color.WHITE, 10);
        }

        boolean chips = h >= dp(150);
        float rowsTop = top + dp(20), rowsBottom = h - pad - (chips ? dp(26) : 0);
        float rowH = dp(36);
        int max = (int) Math.max(1, Math.min(3, Math.floor((rowsBottom - rowsTop) / rowH)));
        List<Row> rs = rows(m, p, max);
        if (rs.isEmpty()) {
            TextPaint hl = text(Color.WHITE, 15, BLACK);
            wrapped(c, m.headline, hl, x0, rowsTop + dp(2), (int) (x1 - x0), 2);
            TextPaint sl = text(0xBFFFFFFF, 11, REG);
            wrapped(c, m.sub, sl, x0, rowsTop + dp(46), (int) (x1 - x0), 2);
        }
        for (int i = 0; i < rs.size(); i++) {
            Row r = rs.get(i);
            float y = rowsTop + i * rowH, ch = rowH - dp(4);
            Paint cardP = new Paint(Paint.ANTI_ALIAS_FLAG);
            cardP.setColor(0x1CFFFFFF);
            c.drawRoundRect(new RectF(x0, y, x1, y + ch), dp(12), dp(12), cardP);
            Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
            dot.setColor(r.color);
            c.drawCircle(x0 + dp(11), y + ch / 2f, dp(4), dot);
            float tx = x0 + dp(22);
            float tagW = (r.tag == null || r.tag.isEmpty()) ? 0 : pillWidth(r.tag, 9.5f);
            float avail = x1 - tx - tagW - dp(16);
            TextPaint tt = text(Color.WHITE, 12.5f, BLACK);
            c.drawText(fit(r.title, tt, avail), tx, y + dp(14), tt);
            TextPaint mt = text(0xB3FFFFFF, 10, MED);
            c.drawText(fit(r.meta.replaceFirst("^· ", ""), mt, avail), tx, y + dp(26), mt);
            if (tagW > 0) pill(c, r.tag, x1 - dp(8), y + ch / 2f, r.live ? NEEDLE : r.urgent ? 0x40FF5A6E : 0x29FFFFFF, r.urgent ? 0xFFFFB0B8 : Color.WHITE, 9.5f);
        }
        if (chips) {
            float cy2 = h - pad - dp(8);
            String a = "📚 " + m.pending + (m.pending == 1 ? " pendiente" : " pendientes");
            String pay = m.payPaid ? "💳 Cuota ✓" : "open".equals(m.payState) ? "💳 Cierra en " + m.daysToClose + " d" : "💳 Abre en " + m.daysToOpen + " d";
            float wb = pillWidth(pay, 9.5f);
            pill(c, pay, x1, cy2, 0x1FFFFFFF, Color.WHITE, 9.5f);
            pill(c, a, x1 - wb - dp(6), cy2, 0x1FFFFFFF, Color.WHITE, 9.5f);
        }
        mask(c, w, h);
        c.restoreToCount(layer);
        return b;
    }

    // ---------------------------------------------------------------- widget pequeño (2×2)

    Bitmap small(Model m, Plan p, int w, int h, Drawable mascot) {
        Bitmap b = canvasBitmap(w, h);
        Canvas c = new Canvas(b);
        int layer = c.saveLayer(0, 0, w, h, null);
        background(c, w, h, m.mood);
        float pad = dp(10);
        Dial dv = dialFor(m, p);
        String t, sub;
        if (p.live != null) { t = p.live.cls.title; sub = "Termina " + Plan.h12(p.live.cls.e); }
        else if (p.next != null) { t = p.next.cls.title; sub = (p.next.dayOffset == 0 ? "" : p.next.dayOffset == 1 ? "Mañana " : Plan.DIAS[(p.dayIdx + p.next.dayOffset) % 7] + " ") + Plan.h12(p.next.cls.s); }
        else { t = m.headline; sub = m.sub; }
        boolean text = h > dp(88);
        float R = Math.min((w - 2 * pad) / 2f, (h - 2 * pad - (text ? dp(30) : 0)) / 2f);
        float cx = w / 2f, cy = pad + R;
        dial(c, cx, cy, R, dv.prog, dv.big, dv.label, dv.mascot ? mascot : null);
        if (text) {
            TextPaint tp = text(Color.WHITE, 12, BLACK);
            tp.setTextAlign(Paint.Align.CENTER);
            c.drawText(fit(t, tp, w - 2 * pad), cx, h - pad - dp(12), tp);
            TextPaint sp = text(0xBFFFFFFF, 10, MED);
            sp.setTextAlign(Paint.Align.CENTER);
            c.drawText(fit(sub, sp, w - 2 * pad), cx, h - pad, sp);
        }
        mask(c, w, h);
        c.restoreToCount(layer);
        return b;
    }

    // ---------------------------------------------------------------- barra (4×1)

    Bitmap bar(Model m, Plan p, int w, int h) {
        Bitmap b = canvasBitmap(w, h);
        Canvas c = new Canvas(b);
        int layer = c.saveLayer(0, 0, w, h, null);
        background(c, w, h, m.mood);
        float pad = dp(10), R = (h - 2 * pad) / 2f;
        emblem(c, pad + R, h / 2f, R);
        float x0 = pad + 2 * R + dp(12), x1 = w - pad;
        String title, meta, tag; boolean live = false;
        if (p.live != null) { title = p.live.cls.title; meta = "Termina " + Plan.h12(p.live.cls.e); tag = "AHORA"; live = true; }
        else if (p.next != null) {
            title = p.next.cls.title;
            meta = (p.next.dayOffset == 0 ? "Hoy " : p.next.dayOffset == 1 ? "Mañana " : Plan.DIAS_LARGO[(p.dayIdx + p.next.dayOffset) % 7] + " ") + Plan.h12(p.next.cls.s) + (p.next.cls.room != null && !p.next.cls.room.isEmpty() ? " · " + p.next.cls.room : "");
            tag = "en " + Plan.when(p.minutesTo(p.next));
        } else { title = m.headline; meta = m.sub; tag = ""; }
        float tagW = tag.isEmpty() ? 0 : pillWidth(tag, 10.5f);
        TextPaint tt = text(Color.WHITE, 14, BLACK);
        c.drawText(fit(title, tt, x1 - x0 - tagW - dp(8)), x0, h / 2f - dp(2), tt);
        TextPaint mt = text(0xB3FFFFFF, 11, MED);
        c.drawText(fit(meta, mt, x1 - x0 - tagW - dp(8)), x0, h / 2f + dp(14), mt);
        if (tagW > 0) pill(c, tag, x1, h / 2f, live ? NEEDLE : 0x29FFFFFF, Color.WHITE, 10.5f);
        mask(c, w, h);
        c.restoreToCount(layer);
        return b;
    }

    /** Mensaje simple (sin conexión todavía): emblema + dos líneas. */
    Bitmap message(int w, int h, String title, String sub) {
        Bitmap b = canvasBitmap(w, h);
        Canvas c = new Canvas(b);
        int layer = c.saveLayer(0, 0, w, h, null);
        background(c, w, h, "tranqui");
        float pad = dp(14), R = Math.min(h - 2 * pad, dp(54)) / 2f;
        emblem(c, pad + R, h / 2f, R);
        float x0 = pad + 2 * R + dp(14);
        TextPaint tt = text(Color.WHITE, 15, BLACK);
        c.drawText(fit(title, tt, w - x0 - pad), x0, h / 2f - dp(2), tt);
        TextPaint st = text(0xB3FFFFFF, 11, MED);
        c.drawText(fit(sub, st, w - x0 - pad), x0, h / 2f + dp(15), st);
        mask(c, w, h);
        c.restoreToCount(layer);
        return b;
    }

    /** Texto para lectores de pantalla. */
    static String describe(Model m, Plan p) {
        StringBuilder sb = new StringBuilder("Rumbo. ");
        if (p.live != null) sb.append("En clase: ").append(p.live.cls.title).append(". ");
        else if (p.next != null) sb.append("Siguiente clase: ").append(p.next.cls.title).append(" a las ").append(Plan.h12(p.next.cls.s)).append(". ");
        sb.append(m.pending).append(" tareas pendientes.");
        return sb.toString();
    }
}
