package app.rumbo.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.text.style.StyleSpan;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Widget de Rumbo: pide /api/widget/<clave> a tu Rumbo y dibuja la mascota, la frase, la racha y lo próximo.
 * Guarda la última respuesta para mostrarla al instante aunque no haya internet.
 */
public class RumboWidget extends AppWidgetProvider {
    static final String PREFS = "rumbo";
    static final String ACTION_REFRESH = "app.rumbo.widget.REFRESH";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        RefreshJob.schedule(ctx);
        render(ctx, mgr, ids, prefs(ctx).getString("last", null));
        refreshAsync(ctx, goAsync());
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) refreshAsync(ctx, goAsync());
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static int[] allIds(Context ctx) {
        return AppWidgetManager.getInstance(ctx).getAppWidgetIds(new ComponentName(ctx, RumboWidget.class));
    }

    /** Descarga los datos (hilo actual) y redibuja todos los widgets. */
    static void refreshNow(Context app) {
        String json = fetch(app);
        if (json != null) prefs(app).edit().putString("last", json).apply();
        redraw(app);
    }

    static void redraw(Context app) {
        render(app, AppWidgetManager.getInstance(app), allIds(app), prefs(app).getString("last", null));
    }

    /** Descarga los datos en segundo plano, revisa si hay versión nueva y redibuja todos los widgets. */
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

    // Cuadros de la animación de la mascota (mismo orden que f1…f10 del layout).
    static final String[] FRAMES = {"", "_up", "", "", "_blink", "", "_wave", "_wave2", "_wave", ""};
    static final int[] FRAME_IDS = {R.id.f1, R.id.f2, R.id.f3, R.id.f4, R.id.f5, R.id.f6, R.id.f7, R.id.f8, R.id.f9, R.id.f10};

    static int drawable(Context ctx, String name) {
        int id = ctx.getResources().getIdentifier(name, "drawable", ctx.getPackageName());
        return id != 0 ? id : R.drawable.mascot_tranqui;
    }

    static CharSequence row(String title, String when, boolean urgent) {
        SpannableStringBuilder sb = new SpannableStringBuilder(title);
        sb.setSpan(new StyleSpan(Typeface.BOLD), 0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        if (when != null && !when.isEmpty()) {
            int start = sb.length();
            sb.append("  ·  ").append(when);
            sb.setSpan(new ForegroundColorSpan(urgent ? Color.parseColor("#FFE3E3") : Color.parseColor("#D9FFFFFF")), start, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            if (urgent) sb.setSpan(new StyleSpan(Typeface.BOLD), start, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        return sb;
    }

    static CharSequence stat(String big, String label) {
        SpannableStringBuilder sb = new SpannableStringBuilder(big);
        sb.setSpan(new StyleSpan(Typeface.BOLD), 0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        sb.setSpan(new RelativeSizeSpan(1.7f), 0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        int start = sb.length();
        sb.append("\n").append(label);
        sb.setSpan(new ForegroundColorSpan(Color.parseColor("#D9FFFFFF")), start, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return sb;
    }

    static void render(Context ctx, AppWidgetManager mgr, int[] ids, String json) {
        if (ids == null || ids.length == 0) return;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget);
        SharedPreferences p = prefs(ctx);
        String base = p.getString("url", null);

        // Tocar el widget abre Rumbo; tocar ↻ lo actualiza.
        Intent open = base != null ? new Intent(Intent.ACTION_VIEW, Uri.parse(base + "/#inicio")) : new Intent(ctx, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(ctx, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        Intent refresh = new Intent(ctx, RumboWidget.class).setAction(ACTION_REFRESH);
        v.setOnClickPendingIntent(R.id.refresh, PendingIntent.getBroadcast(ctx, 2, refresh, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));

        // Aviso de versión nueva: un toque y se actualiza.
        boolean upd = Updater.pending(ctx);
        v.setViewVisibility(R.id.update, upd ? View.VISIBLE : View.GONE);
        if (upd) {
            Intent u = new Intent(ctx, MainActivity.class).setAction(MainActivity.ACTION_UPDATE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            v.setOnClickPendingIntent(R.id.update, PendingIntent.getActivity(ctx, 3, u, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }

        String mood = "tranqui";
        if (json == null) {
            v.setTextViewText(R.id.headline, base == null ? "Conecta tu Rumbo" : "Cargando…");
            v.setTextViewText(R.id.sub, base == null ? "Rumbo → Ajustes → Widget → Conectar" : "Buscando tus tareas");
            v.setViewVisibility(R.id.streak, View.GONE);
        } else {
            try {
                JSONObject d = new JSONObject(json);
                mood = d.optString("mood", "tranqui");
                v.setTextViewText(R.id.headline, d.optString("headline"));
                v.setTextViewText(R.id.sub, d.optString("sub"));
                int streak = d.optInt("streak"), pending = d.optInt("pending"), done = d.optInt("doneWeek");
                v.setViewVisibility(R.id.streak, View.VISIBLE);
                v.setTextViewText(R.id.streak, "🔥 " + streak);
                v.setTextViewText(R.id.kicker1, "feliz".equals(mood) ? "¡VAS VOLANDO!" : "alerta".equals(mood) ? "¡OJO!" : "atento".equals(mood) ? "HOY TOCA" : "TU DÍA EN RUMBO");

                int[] tRows = {R.id.t1, R.id.t2, R.id.t3};
                JSONArray tasks = d.optJSONArray("tasks");
                int nt = tasks == null ? 0 : Math.min(3, tasks.length());
                for (int i = 0; i < 3; i++) {
                    if (i < nt) {
                        JSONObject t = tasks.getJSONObject(i);
                        v.setTextViewText(tRows[i], row(t.optString("title"), t.optString("when"), t.optBoolean("urgent")));
                        v.setViewVisibility(tRows[i], View.VISIBLE);
                    } else v.setViewVisibility(tRows[i], i == 0 ? View.VISIBLE : View.GONE);
                }
                if (nt == 0) v.setTextViewText(R.id.t1, "Nada pendiente con fecha 🎉");

                int[] rRows = {R.id.r1, R.id.r2, R.id.r3};
                JSONArray rem = d.optJSONArray("reminders");
                int nr = rem == null ? 0 : Math.min(3, rem.length());
                for (int i = 0; i < 3; i++) {
                    if (i < nr) {
                        JSONObject r = rem.getJSONObject(i);
                        v.setTextViewText(rRows[i], row(r.optString("text"), r.optString("when"), false));
                        v.setViewVisibility(rRows[i], View.VISIBLE);
                    } else v.setViewVisibility(rRows[i], i == 0 ? View.VISIBLE : View.GONE);
                }
                if (nr == 0) v.setTextViewText(R.id.r1, "Sin recordatorios. Dile al asistente «recuérdame…» ✨");

                JSONArray phrases = d.optJSONArray("phrases");
                if (phrases != null && phrases.length() > 0) {
                    int i = (int) ((System.currentTimeMillis() / 1800000L) % phrases.length()); // cambia cada 30 min
                    v.setTextViewText(R.id.phrase, "“" + phrases.optString(i) + "”");
                }

                v.setTextViewText(R.id.s1, stat(String.valueOf(streak), streak == 1 ? "día seguido" : "días seguidos"));
                v.setTextViewText(R.id.s2, stat(String.valueOf(done), "hechas (7 días)"));
                v.setTextViewText(R.id.s3, stat(String.valueOf(pending), pending == 1 ? "pendiente" : "pendientes"));
                v.setTextViewText(R.id.updated, d.optString("updated"));
            } catch (Exception e) {
                v.setTextViewText(R.id.headline, "Rumbo");
                v.setTextViewText(R.id.sub, "Toca ↻ para actualizar");
            }
        }
        if (!mood.matches("feliz|tranqui|atento|alerta")) mood = "tranqui";
        v.setInt(R.id.root, "setBackgroundResource", drawable(ctx, "wbg_" + mood));
        for (int i = 0; i < FRAME_IDS.length; i++) v.setImageViewResource(FRAME_IDS[i], drawable(ctx, "mascot_" + mood + FRAMES[i]));
        mgr.updateAppWidget(ids, v);
    }
}
