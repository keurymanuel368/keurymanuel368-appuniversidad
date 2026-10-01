package app.rumbo.widget;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Actualización automática de la app del widget (sin Play Store).
 * - Pregunta a tu Rumbo (/api/version) si hay un APK más nuevo.
 * - Si esta app fue quien se instaló la última vez (Android 12+), se actualiza sola en silencio.
 * - Si Android exige confirmación, el widget muestra «Nueva versión: toca para actualizar» y basta un toque.
 */
public class Updater {
    static int currentVersion(Context ctx) {
        try {
            if (Build.VERSION.SDK_INT >= 28) return (int) ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).getLongVersionCode();
            return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            return 0;
        }
    }

    /** Revisa si hay versión nueva; guarda la URL del APK en preferencias. Devuelve true si hay. */
    static boolean check(Context ctx) {
        SharedPreferences p = RumboWidget.prefs(ctx);
        String base = p.getString("url", null);
        if (base == null) return false;
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(base + "/api/version").openConnection();
            c.setConnectTimeout(10000);
            c.setReadTimeout(10000);
            if (c.getResponseCode() != 200) return false;
            String body;
            try (InputStream in = c.getInputStream()) {
                java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[2048];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                body = out.toString("UTF-8");
            }
            JSONObject v = new JSONObject(body);
            boolean newer = v.optInt("widget") > currentVersion(ctx);
            p.edit().putString("apk", newer ? v.optString("apk") : null).apply();
            return newer;
        } catch (Exception e) {
            return p.getString("apk", null) != null;
        }
    }

    static boolean pending(Context ctx) {
        return RumboWidget.prefs(ctx).getString("apk", null) != null;
    }

    /** ¿Puede actualizarse sin preguntar? (Android 12+ y esta app es la que se instaló a sí misma). */
    static boolean canSilent(Context ctx) {
        if (Build.VERSION.SDK_INT < 31) return false;
        try {
            String installer = ctx.getPackageManager().getInstallSourceInfo(ctx.getPackageName()).getInstallingPackageName();
            return ctx.getPackageName().equals(installer);
        } catch (Exception e) {
            return false;
        }
    }

    /** Descarga el APK y lo instala encima. Debe llamarse fuera del hilo principal. */
    static void install(Context ctx) throws Exception {
        String apk = RumboWidget.prefs(ctx).getString("apk", null);
        if (apk == null) return;
        PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(ctx.getPackageName());
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        int id = pi.createSession(params);
        try (PackageInstaller.Session s = pi.openSession(id)) {
            HttpURLConnection c = (HttpURLConnection) new URL(apk).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            try (InputStream in = c.getInputStream(); OutputStream out = s.openWrite("rumbo-widget.apk", 0, -1)) {
                byte[] buf = new byte[16384];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                s.fsync(out);
            }
            Intent done = new Intent(ctx, InstallReceiver.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            s.commit(PendingIntent.getBroadcast(ctx, 7, done, flags).getIntentSender());
        }
    }
}
