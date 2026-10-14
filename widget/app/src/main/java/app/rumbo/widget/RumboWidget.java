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
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
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

    /** Color de fondo según cómo va tu día. */
    static int moodBg(String mood) {
        if ("alerta".equals(mood)) return R.drawable.w_g_red;
        if ("atento".equals(mood)) return R.drawable.w_g_orange;
        if ("feliz".equals(mood)) return R.drawable.w_g_green;
        return R.drawable.w_g_blue;
    }

    /** Color de texto sobre las píldoras blancas (combina con el fondo). */
    static int moodInk(String mood) {
        if ("alerta".equals(mood)) return Color.parseColor("#E0263F");
        if ("atento".equals(mood)) return Color.parseColor("#E8620C");
        if ("feliz".equals(mood)) return Color.parseColor("#0E9A72");
        return Color.parseColor("#2F5BFF");
    }

    /** Dibuja el anillo de progreso (0..1) como imagen. */
    static Bitmap ring(Context ctx, float frac, int sizeDp, float strokeDp) {
        float dens = 2f;
        try {
            dens = ctx.getResources().getDisplayMetrics().density;
        } catch (Exception ignored) {
        }
        dens = Math.min(dens, 3f);
        int px = Math.max(24, Math.round(sizeDp * dens));
        Bitmap b = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        float sw = strokeDp * dens;
        RectF r = new RectF(sw / 2f, sw / 2f, px - sw / 2f, px - sw / 2f);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(sw);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(0x3DFFFFFF);
        c.drawArc(r, 0f, 360f, false, p);
        float f = Math.max(0f, Math.min(1f, frac));
        if (f > 0.005f) {
            p.setColor(0xFFFFFFFF);
            c.drawArc(r, -90f, Math.max(4f, 360f * f), false, p);
        }
        return b;
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

    static final int SMALL = 0, MEDIUM = 1, LARGE = 2;

    static void render(Context ctx, AppWidgetManager mgr, int id) {
        Bundle o = mgr.getAppWidgetOptions(id);
        int w = o != null ? o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250) : 250;
        int h = o != null ? o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 180) : 180;
        int size = (w > 0 && w < 200) ? SMALL : (h >= 300 ? LARGE : MEDIUM);
        int layout = size == SMALL ? R.layout.widget_small : size == LARGE ? R.layout.widget_large : R.layout.widget_medium;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), layout);
        SharedPreferences p = prefs(ctx);
        String origin = p.getString("origin", "");

        if (!configured(ctx)) {
            v.setInt(R.id.root, "setBackgroundResource", R.drawable.w_g_blue);
            if (size == SMALL) {
                setText(v, R.id.bigNum, "👋");
                setText(v, R.id.bigUnit, "");
                setText(v, R.id.title1, "Toca para conectar tu Rumbo");
                v.setViewVisibility(R.id.when1, View.GONE);
            } else {
                setText(v, R.id.headline, "Conecta tu Rumbo");
                setText(v, R.id.sub, "Toca aquí y sigue los pasos");
                hideDetails(v, size);
            }
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
            v.setInt(R.id.root, "setBackgroundResource", R.drawable.w_g_blue);
            if (size == SMALL) {
                setText(v, R.id.bigNum, "…");
                setText(v, R.id.bigUnit, "");
                setText(v, R.id.title1, err.length() > 0 ? "Sin conexión" : "Cargando…");
                v.setViewVisibility(R.id.when1, View.GONE);
            } else {
                setText(v, R.id.headline, err.length() > 0 ? "No pude conectar" : "Cargando tu día…");
                setText(v, R.id.sub, err.length() > 0 ? err : "Un segundito");
                hideDetails(v, size);
                v.setOnClickPendingIntent(R.id.refresh, refreshIntent(ctx));
            }
            mgr.updateAppWidget(id, v);
            return;
        }

        String mood = d.optString("mood", "tranqui");
        int ink = moodInk(mood);
        v.setInt(R.id.root, "setBackgroundResource", moodBg(mood));
        JSONArray tasks = d.optJSONArray("tasks");
        JSONObject next = d.optJSONObject("next");
        long dueAt = next != null ? next.optLong("due_at", 0) * 1000L : 0;
        long left = dueAt - System.currentTimeMillis();
        boolean countdown = dueAt > 0 && left > 0 && left < 48L * 3600 * 1000;
        int pending = d.optInt("pending", 0);
        int overdue = d.optInt("overdue", 0);

        // ---------- Pequeño ----------
        if (size == SMALL) {
            setText(v, R.id.bigNum, String.valueOf(pending));
            setText(v, R.id.bigUnit, pending == 1 ? "entrega\npendiente" : "entregas\npendientes");
            if (pending == 0) {
                setText(v, R.id.bigNum, "✓");
                setText(v, R.id.bigUnit, "todo\nal día");
            }
            if (next != null) {
                setText(v, R.id.title1, next.optString("title", ""));
                setText(v, R.id.when1, cap(next.optString("when", "")));
            } else {
                setText(v, R.id.title1, d.optString("headline", ""));
                setText(v, R.id.when1, d.optInt("streak", 0) > 1 ? "🔥 " + d.optInt("streak", 0) + " días" : "Descansa 😌");
            }
            if (overdue > 0) {
                v.setViewVisibility(R.id.countdown, View.GONE);
                v.setViewVisibility(R.id.when1, View.VISIBLE);
                setText(v, R.id.when1, overdue == 1 ? "⚠️ 1 atrasada" : "⚠️ " + overdue + " atrasadas");
            } else if (countdown) {
                v.setViewVisibility(R.id.countdown, View.VISIBLE);
                v.setChronometer(R.id.countdown, SystemClock.elapsedRealtime() + left, "⏱ %s", true);
                v.setChronometerCountDown(R.id.countdown, true);
                v.setTextColor(R.id.countdown, ink);
                v.setViewVisibility(R.id.when1, View.GONE);
            } else {
                v.setViewVisibility(R.id.countdown, View.GONE);
                v.setViewVisibility(R.id.when1, View.VISIBLE);
            }
            mgr.updateAppWidget(id, v);
            return;
        }

        // ---------- Mediano y grande: encabezado, saludo y anillo ----------
        boolean loading = p.getBoolean("loading", false);
        setText(v, R.id.updated, loading ? "Actualizando…" : "Hoy " + d.optString("updated", ""));
        v.setOnClickPendingIntent(R.id.refresh, refreshIntent(ctx));
        setText(v, R.id.headline, d.optString("headline", ""));
        setText(v, R.id.sub, d.optString("sub", ""));
        if (size == LARGE) {
            String day = d.optString("dayTitle", "");
            if (day.length() > 0) {
                v.setViewVisibility(R.id.kicker, View.VISIBLE);
                setText(v, R.id.kicker, day.toUpperCase());
            }
        }

        double avg = d.optDouble("average", Double.NaN);
        int doneWeek = d.optInt("doneWeek", 0);
        int ringDp = size == LARGE ? 68 : 60;
        if (!Double.isNaN(avg) && avg > 0) {
            setText(v, R.id.ringNum, fmt1(avg));
            setText(v, R.id.ringLbl, "índice");
            v.setImageViewBitmap(R.id.ring, ring(ctx, (float) (avg / 100.0), ringDp, 6));
        } else {
            int total = doneWeek + pending;
            setText(v, R.id.ringNum, total == 0 ? "✓" : doneWeek + "/" + total);
            setText(v, R.id.ringLbl, "semana");
            v.setImageViewBitmap(R.id.ring, ring(ctx, total == 0 ? 1f : doneWeek / (float) total, ringDp, 6));
        }
        v.setOnClickPendingIntent(R.id.ringBox, openUrl(ctx, origin + "/#asignaturas", 2));

        if (size == MEDIUM) {
            if (next != null) {
                v.setViewVisibility(R.id.nextCard, View.VISIBLE);
                setText(v, R.id.nextTitle, next.optString("title", ""));
                String course = next.optString("course", "");
                setText(v, R.id.nextWhen, (course.length() > 0 ? course + " · " : "") + cap(next.optString("when", "")));
                v.setOnClickPendingIntent(R.id.nextCard, openUrl(ctx, origin + "/#tareas", 3));
                showCountdown(v, R.id.countdown, countdown, left, ink, null);
            } else {
                v.setViewVisibility(R.id.nextCard, View.GONE);
            }
            mgr.updateAppWidget(id, v);
            return;
        }

        // ---------- Grande ----------
        v.setViewVisibility(R.id.countRow, countdown ? View.VISIBLE : View.GONE);
        showCountdown(v, R.id.countdown, countdown, left, ink, "Próxima entrega en %s");

        // Semana
        JSONArray week = d.optJSONArray("week");
        int[] dayIds = {R.id.day0, R.id.day1, R.id.day2, R.id.day3, R.id.day4, R.id.day5, R.id.day6};
        int[] dl = {R.id.dl0, R.id.dl1, R.id.dl2, R.id.dl3, R.id.dl4, R.id.dl5, R.id.dl6};
        int[] dn = {R.id.dn0, R.id.dn1, R.id.dn2, R.id.dn3, R.id.dn4, R.id.dn5, R.id.dn6};
        int[] dd = {R.id.dd0, R.id.dd1, R.id.dd2, R.id.dd3, R.id.dd4, R.id.dd5, R.id.dd6};
        if (week == null || week.length() < 7) {
            v.setViewVisibility(R.id.week, View.GONE);
        } else {
            v.setViewVisibility(R.id.week, View.VISIBLE);
            for (int k = 0; k < 7; k++) {
                JSONObject wd = week.optJSONObject(k);
                if (wd == null) continue;
                boolean today = wd.optBoolean("today", false);
                setText(v, dl[k], wd.optString("d", ""));
                setText(v, dn[k], String.valueOf(wd.optInt("n", 0)));
                v.setViewVisibility(dd[k], wd.optInt("count", 0) > 0 ? View.VISIBLE : View.INVISIBLE);
                if (today) {
                    v.setInt(dayIds[k], "setBackgroundResource", R.drawable.w_today);
                    v.setTextColor(dl[k], ink);
                    v.setTextColor(dn[k], ink);
                    v.setInt(dd[k], "setColorFilter", ink);
                }
            }
            v.setOnClickPendingIntent(R.id.week, openUrl(ctx, origin + "/#tareas", 4));
        }

        // Lista: cuántas filas caben según la altura
        // Lo fijo (encabezado, saludo, semana, chips) ocupa ~312dp; cada fila ~44dp.
        int base = countdown ? 312 : 270;
        int fit = Math.max(1, Math.min(5, (h - base) / 44));
        int[] rows = {R.id.row0, R.id.row1, R.id.row2, R.id.row3, R.id.row4};
        int[] rt = {R.id.rt0, R.id.rt1, R.id.rt2, R.id.rt3, R.id.rt4};
        int[] rc = {R.id.rc0, R.id.rc1, R.id.rc2, R.id.rc3, R.id.rc4};
        int[] rw = {R.id.rw0, R.id.rw1, R.id.rw2, R.id.rw3, R.id.rw4};
        int[] rdot = {R.id.rdot0, R.id.rdot1, R.id.rdot2, R.id.rdot3, R.id.rdot4};
        int n = tasks != null ? Math.min(fit, tasks.length()) : 0;
        if (n == 0) {
            setText(v, R.id.listLbl, "PRÓXIMAS ENTREGAS");
            v.setViewVisibility(R.id.list, View.VISIBLE);
            v.setViewVisibility(rows[0], View.VISIBLE);
            setText(v, rt[0], "Nada pendiente por ahora 🙌");
            setText(v, rc[0], "Rumbo te avisa cuando salga algo nuevo");
            setText(v, rw[0], "");
            for (int k = 1; k < 5; k++) v.setViewVisibility(rows[k], View.GONE);
        } else {
            for (int k = 0; k < 5; k++) {
                if (k < n) {
                    JSONObject t = tasks.optJSONObject(k);
                    boolean late = t.optBoolean("late", "Atrasada".equals(t.optString("when", "")));
                    boolean urgent = t.optBoolean("urgent", false);
                    v.setViewVisibility(rows[k], View.VISIBLE);
                    setText(v, rt[k], t.optString("title", ""));
                    String course = t.optString("course", "");
                    setText(v, rc[k], course.length() > 0 ? course : "Tarea");
                    setText(v, rw[k], late ? "⚠️ Atrasada" : cap(t.optString("when", "")));
                    v.setInt(rdot[k], "setColorFilter", late ? Color.parseColor("#FFE066") : urgent ? Color.WHITE : 0x8CFFFFFF);
                    v.setOnClickPendingIntent(rows[k], openUrl(ctx, origin + "/#tareas", 20 + k));
                } else {
                    v.setViewVisibility(rows[k], View.GONE);
                }
            }
        }

        // Chips
        setText(v, R.id.chip1, pending == 0 ? "✅ Al día" : "📝 " + pending + (pending == 1 ? " pendiente" : " pendientes"));
        v.setViewVisibility(R.id.chip1, View.VISIBLE);
        int streak = d.optInt("streak", 0);
        if (streak > 1) {
            v.setViewVisibility(R.id.chip2, View.VISIBLE);
            setText(v, R.id.chip2, "🔥 " + streak + " días");
        } else if (doneWeek > 0) {
            v.setViewVisibility(R.id.chip2, View.VISIBLE);
            setText(v, R.id.chip2, "✔️ " + doneWeek + " esta semana");
        } else {
            v.setViewVisibility(R.id.chip2, View.GONE);
        }
        JSONObject lg = d.optJSONObject("lastGrade");
        if (lg != null) {
            v.setViewVisibility(R.id.chip3, View.VISIBLE);
            setText(v, R.id.chip3, "⭐ " + fmt1(lg.optDouble("grade", 0)) + "/" + fmt1(lg.optDouble("max", 100)));
        } else {
            v.setViewVisibility(R.id.chip3, View.GONE);
        }
        mgr.updateAppWidget(id, v);
    }

    static void showCountdown(RemoteViews v, int id, boolean on, long left, int ink, String format) {
        if (!on) {
            v.setViewVisibility(id, View.GONE);
            return;
        }
        v.setViewVisibility(id, View.VISIBLE);
        v.setChronometer(id, SystemClock.elapsedRealtime() + left, format, true);
        v.setChronometerCountDown(id, true);
        v.setTextColor(id, ink);
    }

    static void hideDetails(RemoteViews v, int size) {
        v.setViewVisibility(R.id.ringBox, View.GONE);
        if (size == MEDIUM) v.setViewVisibility(R.id.nextCard, View.GONE);
        if (size == LARGE) {
            v.setViewVisibility(R.id.week, View.GONE);
            v.setViewVisibility(R.id.list, View.GONE);
            v.setViewVisibility(R.id.listLbl, View.GONE);
            v.setViewVisibility(R.id.countRow, View.GONE);
        }
    }

    static String fmt1(double x) {
        double r = Math.round(x * 10) / 10.0;
        return r == Math.floor(r) ? String.valueOf((long) r) : String.valueOf(r);
    }

    static String cap(String s) {
        if (s == null || s.length() == 0) return "";
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    static void setText(RemoteViews v, int id, String text) {
        v.setTextViewText(id, text == null ? "" : text);
    }
}
