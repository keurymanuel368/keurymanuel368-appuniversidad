package app.rumbo.widget;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Actualiza el widget cada 30 minutos (cuando hay internet). */
public class RefreshJob extends JobService {
    @Override
    public boolean onStartJob(final JobParameters params) {
        final android.content.Context app = getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                RumboWidget.fetch(app);
                RumboWidget.renderAll(app);
                jobFinished(params, false);
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
