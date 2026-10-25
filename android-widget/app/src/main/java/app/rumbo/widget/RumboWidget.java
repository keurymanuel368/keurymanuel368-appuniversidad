package app.rumbo.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.View;
import android.widget.RemoteViews;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Widgets de Rumbo (la brújula): «Hoy» (4×2), el anillo (2×2) y la barra de la siguiente clase (4×1).
 * Piden /api/widget/<clave> a tu Rumbo, guardan la última respuesta y calculan solos «en 25 min» con el reloj del teléfono.
 */
public class RumboWidget extends AppWidgetProvider {
    static final String PREFS = "rumbo";
    static final String ACTION_REFRESH = "app.rumbo.widget.REFRESH";   // con internet (toque en la esquina)
    static final String ACTION_LOCAL = "app.rumbo.widget.LOCAL";       // solo redibuja con el reloj (alarma)

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        RefreshJob.schedule(ctx);
        redraw(ctx);
        refreshAsync(ctx, goAsync());
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle options) {
        redraw(ctx);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String a = intent.getAction();
        if (ACTION_REFRESH.equals(a)) refreshAsync(ctx, goAsync());
        else if (ACTION_LOCAL.equals(a)) redraw(ctx.getApplicationContext());
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Descarga los datos (hilo actual) y redibuja todos los widgets. */
    static void refreshNow(Context app) {
        String json = fetch(app);
        if (json != null) prefs(app).edit().putString("last", json).apply();
        redraw(app);
    }

    /** Descarga en segundo plano, revisa si hay versión nueva de la app y redibuja. */
    static void refreshAsync(Context ctx, PendingResult pending) {
        final Context app = ctx.getApplicationContext();
        RefreshJob.schedule(app);
        new Thread(() -> {
            try {
                refreshNow(app);
                Updater.check(app);
                redraw(app);
            } finally {
                if (pending != null) pending.finish();
            }
        }).start();
    }

    static String fetch(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String base = p.getString("url", null), token = p.getString("token", null);
        if (base == null || token == null) return null;
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(base + "/api/widget/" + token).openConnection();
            c.setConnectTimeout(10000);
            c.setReadTimeout(15000);
            if (c.getResponseCode() != 200) return null;
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[4096];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                return out.toString("UTF-8");
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    // ------------------------------------------------------------------ dibujo

    static void redraw(Context app) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(app);
            Model m = Model.parse(prefs(app).getString("last", null));
            draw(app, mgr, m, RumboWidget.class, R.layout.widget, 0, 320, 140);
            draw(app, mgr, m, RumboWidgetSmall.class, R.layout.widget_small, 1, 110, 110);
            draw(app, mgr, m, RumboWidgetBar.class, R.layout.widget_bar, 2, 320, 62);
            scheduleNext(app, m);
        } catch (Throwable ignored) { /* un widget nunca debe tumbar la app */ }
    }

    /** Tamaño real del widget en píxeles (con un tope para que Android no rechace la imagen). */
    static int[] sizePx(Context ctx, AppWidgetManager mgr, int id, int defW, int defH) {
        Bundle o = mgr.getAppWidgetOptions(id);
        boolean land = ctx.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        int wDp = o != null ? o.getInt(land ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, defW) : defW;
        int hDp = o != null ? o.getInt(land ? AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT : AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, defH) : defH;
        if (wDp < 40) wDp = defW;
        if (hDp < 40) hDp = defH;
        DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
        float w = wDp * dm.density, h = hDp * dm.density;
        double limit = dm.widthPixels * (double) dm.heightPixels * 1.2;
        if (w * h > limit) { double k = Math.sqrt(limit / (w * h)); w *= k; h *= k; }
        return new int[]{Math.max(1, (int) w), Math.max(1, (int) h)};
    }

    static void draw(Context ctx, AppWidgetManager mgr, Model m, Class<?> provider, int layout, int kind, int defW, int defH) {
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, provider));
        if (ids == null || ids.length == 0) return;
        SharedPreferences p = prefs(ctx);
        String base = p.getString("url", null);
        boolean upd = Updater.pending(ctx);
        Art art = new Art(ctx);
        Plan plan = m != null ? new Plan(m, System.currentTimeMillis()) : null;
        Drawable mascot = null;
        if (m != null) {
            String mood = m.mood.matches("feliz|tranqui|atento|alerta") ? m.mood : "tranqui";
            int res = ctx.getResources().getIdentifier("mascot_" + mood, "drawable", ctx.getPackageName());
            if (res != 0) mascot = ctx.getDrawable(res);
        }
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), layout);
            int[] sz = sizePx(ctx, mgr, id, defW, defH);
            Bitmap bmp;
            try {
                if (m == null) bmp = art.message(sz[0], sz[1], base == null ? "Conecta tu Rumbo" : "Cargando…", base == null ? "Rumbo → Ajustes → Widget" : "Buscando tus clases");
                else if (kind == 0) bmp = art.large(m, plan, sz[0], sz[1], mascot);
                else if (kind == 1) bmp = art.small(m, plan, sz[0], sz[1], mascot);
                else bmp = art.bar(m, plan, sz[0], sz[1]);
            } catch (Throwable e) {
                // Si algo del dibujo falla, nunca queda un widget roto: se muestra un mensaje sencillo
                bmp = art.message(sz[0], sz[1], "Rumbo", "Toca para abrir");
            }
            v.setImageViewBitmap(R.id.art, bmp);
            if (m != null) v.setContentDescription(R.id.art, Art.describe(m, plan));

            String page = kind == 2 || (plan != null && plan.live == null && plan.next != null && plan.minutesTo(plan.next) < 12 * 60) ? "#horario" : "#inicio";
            Intent open = base != null ? new Intent(Intent.ACTION_VIEW, Uri.parse(base + "/" + page)) : new Intent(ctx, MainActivity.class);
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(ctx, 10 + kind, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            Intent refresh = new Intent(ctx, RumboWidget.class).setAction(ACTION_REFRESH);
            v.setOnClickPendingIntent(R.id.refresh, PendingIntent.getBroadcast(ctx, 20 + kind, refresh, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            v.setViewVisibility(R.id.update, upd ? View.VISIBLE : View.GONE);
            if (upd) {
                Intent u = new Intent(ctx, MainActivity.class).setAction(MainActivity.ACTION_UPDATE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                v.setOnClickPendingIntent(R.id.update, PendingIntent.getActivity(ctx, 30 + kind, u, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            }
            mgr.updateAppWidget(id, v);
        }
    }

    /** Próximo redibujado con el reloj: cada 10 min cerca de una clase, cada 30 el resto del tiempo. */
    static void scheduleNext(Context ctx, Model m) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am == null) return;
        long delayMin = 30;
        if (m != null) {
            Plan p = new Plan(m, System.currentTimeMillis());
            if (p.live != null) delayMin = Math.min(10, Math.max(1, p.live.endMin - p.minOfDay));
            else if (p.next != null && p.minutesTo(p.next) <= 90) delayMin = Math.min(10, Math.max(1, p.minutesTo(p.next)));
        }
        Intent i = new Intent(ctx, RumboWidget.class).setAction(ACTION_LOCAL);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 99, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        am.setAndAllowWhileIdle(AlarmManager.RTC, System.currentTimeMillis() + delayMin * 60000L, pi);
    }
}
