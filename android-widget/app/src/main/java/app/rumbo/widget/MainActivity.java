package app.rumbo.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Pantalla única de la app del widget.
 * - Desde Rumbo (Ajustes → Widget → Conectar) llega el enlace rumbo://conectar?u=<tu Rumbo>&t=<clave>: se guarda aquí.
 * - Luego te ofrece poner el widget en la pantalla de inicio con un toque.
 */
public class MainActivity extends Activity {
    static final String ACTION_UPDATE = "app.rumbo.widget.UPDATE";
    private TextView status;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        RefreshJob.schedule(this);
        handle(getIntent());
        build();
        if (ACTION_UPDATE.equals(getIntent().getAction())) update();
        else if (RumboWidget.prefs(this).getString("token", null) != null) new Thread(() -> { if (Updater.check(this)) runOnUiThread(this::build); }).start();
    }

    /** Descarga e instala la versión nueva (Android pide confirmar con un toque si hace falta). */
    private void update() {
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            status.setText("Para actualizarse sola, permite «Instalar apps desconocidas» para Rumbo y vuelve aquí.");
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            return;
        }
        status.setText("Descargando la versión nueva…");
        new Thread(() -> {
            try {
                Updater.install(this);
                runOnUiThread(() -> status.setText("Instalando… si Android te pregunta, toca «Actualizar»."));
            } catch (Exception e) {
                runOnUiThread(() -> status.setText("No se pudo actualizar ahora. Revisa tu internet e inténtalo otra vez."));
            }
        }).start();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handle(intent);
        build();
        if (ACTION_UPDATE.equals(intent.getAction())) update();
    }

    private void handle(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        if (data == null || !"rumbo".equals(data.getScheme())) return;
        String u = data.getQueryParameter("u"), t = data.getQueryParameter("t");
        if (u == null || t == null || !u.startsWith("https://")) return;
        RumboWidget.prefs(this).edit().putString("url", u).putString("token", t).remove("last").apply();
        RumboWidget.refreshAsync(this, null);
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private void build() {
        SharedPreferences p = RumboWidget.prefs(this);
        boolean connected = p.getString("token", null) != null;
        boolean night = (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        int ink = night ? Color.parseColor("#EAF2FF") : Color.parseColor("#0F1E36");
        int muted = night ? Color.parseColor("#9DB0CC") : Color.parseColor("#5B6B84");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(28), dp(72), dp(28), dp(28));

        ImageView mascot = new ImageView(this);
        mascot.setImageResource(connected ? R.drawable.mascot_feliz : R.drawable.mascot_tranqui);
        root.addView(mascot, new LinearLayout.LayoutParams(dp(132), dp(154)));

        TextView title = new TextView(this);
        title.setText(connected ? "¡Widget conectado!" : "Widget de Rumbo");
        title.setTextSize(26);
        title.setTypeface(Typeface.create("sans-serif-black", Typeface.NORMAL));
        title.setTextColor(ink);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(18), 0, dp(8));
        root.addView(title);

        status = new TextView(this);
        status.setText(connected
                ? "Ahora ponlo en tu pantalla de inicio. También puedes mantener presionada la pantalla → Widgets → Rumbo."
                : "Abre Rumbo → Ajustes → Widget y toca «Conectar widget». Volverás aquí solo.");
        status.setTextSize(15);
        status.setTextColor(muted);
        status.setGravity(Gravity.CENTER);
        status.setLineSpacing(0, 1.2f);
        root.addView(status);

        Button main = new Button(this);
        main.setAllCaps(false);
        main.setTextSize(16);
        main.setTextColor(Color.WHITE);
        main.setTypeface(Typeface.DEFAULT_BOLD);
        main.setBackgroundResource(R.drawable.btn_bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(54));
        lp.topMargin = dp(28);
        if (connected) {
            main.setText("Poner widget en inicio");
            main.setOnClickListener(x -> {
                AppWidgetManager mgr = AppWidgetManager.getInstance(this);
                if (mgr.isRequestPinAppWidgetSupported()) mgr.requestPinAppWidget(new ComponentName(this, RumboWidget.class), null, null);
                else status.setText("Mantén presionada la pantalla de inicio → Widgets → Rumbo.");
            });
        } else {
            main.setText("Abrir Rumbo");
            main.setOnClickListener(x -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://rumbo.gestori.workers.dev/#ajustes"))));
        }
        root.addView(main, lp);

        if (connected && Updater.pending(this)) {
            Button up = new Button(this);
            up.setAllCaps(false);
            up.setTextSize(16);
            up.setTextColor(Color.WHITE);
            up.setTypeface(Typeface.DEFAULT_BOLD);
            up.setBackgroundResource(R.drawable.btn_green);
            up.setText("⬆️ Actualizar ahora");
            up.setOnClickListener(x -> update());
            LinearLayout.LayoutParams lpu = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(54));
            lpu.topMargin = dp(12);
            root.addView(up, lpu);
        }

        if (connected) {
            Button open = new Button(this);
            open.setAllCaps(false);
            open.setText("Abrir Rumbo");
            open.setTextColor(Color.parseColor("#2F80ED"));
            open.setBackgroundColor(Color.TRANSPARENT);
            open.setOnClickListener(x -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(p.getString("url", "https://rumbo.gestori.workers.dev") + "/#inicio"))));
            LinearLayout.LayoutParams lp2 = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48));
            lp2.topMargin = dp(8);
            root.addView(open, lp2);
        }
        setContentView(root);
    }
}
