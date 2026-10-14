package app.rumbo.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Pantalla de conexión: recibe el enlace rumbo://conectar?u=...&t=... desde la app y deja el widget listo. */
public class MainActivity extends Activity {

    private TextView status;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        handle(getIntent());
        build();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handle(intent);
        build();
    }

    private void handle(Intent intent) {
        Uri u = intent != null ? intent.getData() : null;
        if (u == null || !"rumbo".equals(u.getScheme())) return;
        String origin = u.getQueryParameter("u"), token = u.getQueryParameter("t");
        if (origin == null || token == null || !origin.startsWith("https://")) return;
        SharedPreferences.Editor e = RumboWidget.prefs(this).edit();
        e.putString("origin", origin.replaceAll("/+$", "")).putString("token", token).remove("json").remove("error").apply();
        RumboWidget.refreshAsync(this, null);
        RumboWidget.schedule(this);
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void build() {
        boolean dark = (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        int bg = dark ? Color.BLACK : Color.parseColor("#F5F5F7");
        int ink = dark ? Color.parseColor("#F5F5F7") : Color.parseColor("#1D1D1F");
        int muted = Color.parseColor("#8E8E93");
        boolean ok = RumboWidget.configured(this);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackgroundColor(bg);
        root.setPadding(dp(28), dp(72), dp(28), dp(28));

        ImageView icon = new ImageView(this);
        icon.setImageResource(R.mipmap.ic_launcher);
        root.addView(icon, new LinearLayout.LayoutParams(dp(88), dp(88)));

        TextView title = new TextView(this);
        title.setText(ok ? "¡Widget conectado!" : "Widget de Rumbo");
        title.setTextColor(ink);
        title.setTextSize(28);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tp.topMargin = dp(20);
        root.addView(title, tp);

        status = new TextView(this);
        status.setText(ok
                ? "Ya está listo. Mantén presionada la pantalla de inicio → Widgets → Rumbo, o toca el botón de abajo."
                : "Para conectarlo, abre Rumbo → Ajustes → Widget → «Conectar widget». Se abrirá esta pantalla sola.");
        status.setTextColor(muted);
        status.setTextSize(16);
        status.setGravity(Gravity.CENTER);
        status.setLineSpacing(0, 1.15f);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        sp.topMargin = dp(10);
        root.addView(status, sp);

        if (ok && Build.VERSION.SDK_INT >= 26) {
            final AppWidgetManager mgr = getSystemService(AppWidgetManager.class);
            if (mgr != null && mgr.isRequestPinAppWidgetSupported()) {
                Button add = button("Agregar a la pantalla de inicio", true);
                add.setOnClickListener(v -> mgr.requestPinAppWidget(new ComponentName(this, RumboWidget.class), null, null));
                root.addView(add, buttonParams(28));
            }
        }
        final String origin = RumboWidget.prefs(this).getString("origin", "");
        if (origin.length() > 0) {
            Button open = button("Abrir Rumbo", !ok);
            open.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(origin + "/#inicio"))));
            root.addView(open, buttonParams(ok ? 10 : 28));
        }
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 21) getWindow().setStatusBarColor(bg);
    }

    private Button button(String text, boolean primary) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(17);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextColor(primary ? Color.WHITE : Color.parseColor("#0A84FF"));
        GradientDrawable g = new GradientDrawable();
        g.setCornerRadius(dp(14));
        g.setColor(primary ? Color.parseColor("#0A84FF") : Color.parseColor("#1A0A84FF"));
        b.setBackground(g);
        b.setStateListAnimator(null);
        return b;
    }

    private LinearLayout.LayoutParams buttonParams(int top) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
        lp.topMargin = dp(top);
        return lp;
    }
}
