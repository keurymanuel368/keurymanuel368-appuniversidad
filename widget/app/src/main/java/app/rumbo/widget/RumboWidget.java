package app.rumbo.widget;

import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/** Widget de Rumbo: muestra tu día, la cuenta regresiva de la próxima entrega y datos rápidos. */
public class RumboWidget extends AppWidgetProvider {

    static final String ACTION_REFRESH = "app.rumbo.widget.REFRESH";
    static final String PREFS = "rumbo";
    static final int JOB_ID = 4711;

    // ---------- Ciclo de vida ----------
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        renderAll(ctx);
        refreshAsync(ctx, goAsync());
        schedule(ctx);
    }

    @Override
    public void onEnabled(Context ctx) {
        schedule(ctx);
    }

    @Override
    public void onDisabled(Context ctx) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js != null) js.cancel(JOB_ID);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle opts) {
        render(ctx, mgr, id);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            prefs(ctx).edit().putBoolean("loading", true).apply();
            renderAll(ctx);
            refreshAsync(ctx, goAsync());
        }
    }

    // ---------- Datos ----------
    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean configured(Context ctx) {
        SharedPreferences p = prefs(ctx);
        return p.getString("origin", "").length() > 0 && p.getString("token", "").length() > 0;
    }

    static void schedule(Context ctx) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(ctx, RefreshJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(30 * 60 * 1000L)
                .setPersisted(false)
                .build();
        js.schedule(job);
    }

    static void refreshAsync(final Context ctx, final PendingResult pr) {
        final Context app = ctx.getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    fetch(app);
                } finally {
                    prefs(app).edit().putBoolean("loading", false).apply();
                    renderAll(app);
                    if (pr != null) pr.finish();
                }
            }
        }).start();
    }

    /** Descarga /api/widget/{token} y lo guarda. Devuelve true si pudo. */
    static boolean fetch(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String origin = p.getString("origin", ""), token = p.getString("token", "");
        if (origin.length() == 0 || token.length() == 0) return false;
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(origin + "/api/widget/" + token).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setRequestProperty("Accept", "application/json");
            int code = c.getResponseCode();
            if (code == 404) {
                p.edit().putString("error", "El enlace del widget ya no es válido. Conéctalo otra vez desde Rumbo.").apply();
                return false;
            }
            if (code != 200) return false;
            StringBuilder sb = new StringBuilder();
            BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"));
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close();
            new JSONObject(sb.toString());
            p.edit().putString("json", sb.toString()).putLong("at", System.currentTimeMillis()).remove("error").apply();
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    // ---------- Dibujo ----------
    static void renderAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, RumboWidget.class));
        for (int id : ids) render(ctx, mgr, id);
    }

    static int moodColor(String mood) {
        if ("alerta".equals(mood)) return Color.parseColor("#FF3B30");
        if ("atento".equals(mood)) return Color.parseColor("#FF9500");
        if ("feliz".equals(mood)) return Color.parseColor("#34C759");
        return Color.parseColor("#0A84FF");
    }

    static int moodBadge(String mood) {
        if ("alerta".equals(mood)) return R.drawable.w_badge_red;
        if ("atento".equals(mood)) return R.drawable.w_badge_orange;
        if ("feliz".equals(mood)) return R.drawable.w_badge_green;
        return R.drawable.w_badge_blue;
    }

    static PendingIntent openUrl(Context ctx, String url, int req) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent openSetup(Context ctx) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(ctx, 7, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent refreshIntent(Context ctx) {
        Intent i = new Intent(ctx, RumboWidget.class);
        i.setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(ctx, 9, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void render(Context ctx, AppWidgetManager mgr, int id) {
        Bundle o = mgr.getAppWidgetOptions(id);
        int w = o != null ? o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250) : 250;
        boolean small = w > 0 && w < 200;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), small ? R.layout.widget_small : R.layout.widget_medium);
        SharedPreferences p = prefs(ctx);
        String origin = p.getString("origin", "");

        if (!configured(ctx)) {
            setText(v, small ? R.id.bigLabel : R.id.headline, "Conecta tu Rumbo");
            if (!small) setText(v, R.id.sub, "Toca aquí y sigue los pasos");
            else setText(v, R.id.title1, "Toca para conectar");
            v.setOnClickPendingIntent(R.id.root, openSetup(ctx));
            mgr.updateAppWidget(id, v);
            return;
        }

        v.setOnClickPendingIntent(R.id.root, openUrl(ctx, origin + "/#inicio", 1));
        JSONObject d = null;
        try {
            String js = p.getString("json", "");
            if (js.length() > 0) d = new JSONObject(js);
        } catch (Exception ignored) {
        }

        if (d == null) {
            String err = p.getString("error", "");
            if (small) {
                setText(v, R.id.bigLabel, err.length() > 0 ? "Sin conexión" : "Cargando…");
            } else {
                setText(v, R.id.headline, err.length() > 0 ? "No pude conectar" : "Cargando tu día…");
                setText(v, R.id.sub, err);
                v.setOnClickPendingIntent(R.id.refresh, refreshIntent(ctx));
            }
            mgr.updateAppWidget(id, v);
            return;
        }

        String mood = d.optString("mood", "tranqui");
        int accent = moodColor(mood);
        JSONArray tasks = d.optJSONArray("tasks");
        JSONObject next = d.optJSONObject("next");
        long dueAt = next != null ? next.optLong("due_at", 0) * 1000L : 0;
        long left = dueAt - System.currentTimeMillis();
        boolean countdown = dueAt > 0 && left > 0 && left < 48L * 3600 * 1000;

        if (small) {
            int pending = d.optInt("pending", 0);
            v.setInt(R.id.dot1, "setColorFilter", accent);
            setText(v, R.id.bigNum, String.valueOf(pending));
            setText(v, R.id.bigLabel, pending == 1 ? "entrega pendiente" : "entregas pendientes");
            if (next != null) {
                setText(v, R.id.title1, next.optString("title", ""));
                setText(v, R.id.when1, next.optString("when", ""));
            } else {
                setText(v, R.id.title1, d.optString("headline", ""));
                setText(v, R.id.when1, d.optString("sub", ""));
            }
            if (countdown) {
                v.setViewVisibility(R.id.countdown, View.VISIBLE);
                v.setChronometer(R.id.countdown, SystemClock.elapsedRealtime() + left, "⏱ %s", true);
                v.setChronometerCountDown(R.id.countdown, true);
                v.setTextColor(R.id.countdown, accent);
                v.setViewVisibility(R.id.when1, View.GONE);
            } else {
                v.setViewVisibility(R.id.countdown, View.GONE);
                v.setViewVisibility(R.id.when1, View.VISIBLE);
            }
            mgr.updateAppWidget(id, v);
            return;
        }

        // Mediano
        boolean loading = p.getBoolean("loading", false);
        setText(v, R.id.updated, loading ? "Actualizando…" : "Hoy " + d.optString("updated", ""));
        v.setOnClickPendingIntent(R.id.refresh, refreshIntent(ctx));
        setText(v, R.id.headline, d.optString("headline", ""));
        setText(v, R.id.sub, d.optString("sub", ""));

        if (countdown) {
            v.setViewVisibility(R.id.countBox, View.VISIBLE);
            v.setInt(R.id.countBox, "setBackgroundResource", moodBadge(left < 6L * 3600 * 1000 ? "alerta" : mood));
            v.setChronometer(R.id.countdown, SystemClock.elapsedRealtime() + left, null, true);
            v.setChronometerCountDown(R.id.countdown, true);
        } else {
            v.setViewVisibility(R.id.countBox, View.GONE);
        }

        int[] rows = {R.id.row1, R.id.row2, R.id.row3};
        int[] titles = {R.id.title1, R.id.title2, R.id.title3};
        int[] whens = {R.id.when1, R.id.when2, R.id.when3};
        int[] dots = {R.id.dot1, R.id.dot2, R.id.dot3};
        int n = tasks != null ? Math.min(3, tasks.length()) : 0;
        for (int k = 0; k < 3; k++) {
            if (k < n) {
                JSONObject t = tasks.optJSONObject(k);
                v.setViewVisibility(rows[k], View.VISIBLE);
                String when = t.optString("when", "");
                setText(v, titles[k], t.optString("title", ""));
                setText(v, whens[k], when);
                int dot = "Atrasada".equals(when) ? Color.parseColor("#FF3B30") : t.optBoolean("urgent", false) ? Color.parseColor("#FF9500") : Color.parseColor("#0A84FF");
                v.setInt(dots[k], "setColorFilter", dot);
                v.setOnClickPendingIntent(rows[k], openUrl(ctx, origin + "/#tareas", 20 + k));
            } else {
                v.setViewVisibility(rows[k], View.GONE);
            }
        }

        int pending = d.optInt("pending", 0);
        setText(v, R.id.chip1, pending == 0 ? "✅ Al día" : "📝 " + pending + (pending == 1 ? " pendiente" : " pendientes"));
        double avg = d.optDouble("average", Double.NaN);
        if (!Double.isNaN(avg)) {
            v.setViewVisibility(R.id.chip2, View.VISIBLE);
            setText(v, R.id.chip2, "📊 " + (Math.round(avg * 10) / 10.0));
        } else {
            v.setViewVisibility(R.id.chip2, View.GONE);
        }
        int streak = d.optInt("streak", 0);
        int doneWeek = d.optInt("doneWeek", 0);
        if (streak > 1) {
            v.setViewVisibility(R.id.chip3, View.VISIBLE);
            setText(v, R.id.chip3, "🔥 " + streak + " días");
        } else if (doneWeek > 0) {
            v.setViewVisibility(R.id.chip3, View.VISIBLE);
            setText(v, R.id.chip3, "✔️ " + doneWeek + " esta semana");
        } else {
            v.setViewVisibility(R.id.chip3, View.GONE);
        }
        mgr.updateAppWidget(id, v);
    }

    static void setText(RemoteViews v, int id, String text) {
        v.setTextViewText(id, text == null ? "" : text);
    }
}
