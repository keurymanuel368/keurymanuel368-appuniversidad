package app.rumbo.widget;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/**
 * Tarea periódica del sistema (cada ~15 min, solo con internet):
 * actualiza los datos del widget y revisa si hay una versión nueva de la app.
 */
public class RefreshJob extends JobService {
    static final int ID = 42;

    static void schedule(Context ctx) {
        JobScheduler js = ctx.getSystemService(JobScheduler.class);
        if (js == null || js.getPendingJob(ID) != null) return;
        js.schedule(new JobInfo.Builder(ID, new ComponentName(ctx, RefreshJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60 * 1000L)
                .setPersisted(true)
                .build());
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        final Context app = getApplicationContext();
        new Thread(() -> {
            RumboWidget.refreshNow(app);
            if (Updater.check(app) && Updater.canSilent(app)) {
                try { Updater.install(app); } catch (Exception ignored) { /* se reintenta en la próxima vuelta */ }
            }
            RumboWidget.redraw(app); // con o sin el aviso de actualización
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
