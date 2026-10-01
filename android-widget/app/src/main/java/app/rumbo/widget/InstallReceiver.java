package app.rumbo.widget;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Resultado de la instalación: si Android pide confirmar, abre su ventana; si terminó, limpia el aviso. */
public class InstallReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { ctx.startActivity(confirm); } catch (Exception ignored) { /* el widget sigue mostrando el aviso */ }
            }
        } else if (status == PackageInstaller.STATUS_SUCCESS) {
            RumboWidget.prefs(ctx).edit().remove("apk").apply();
        }
    }
}
