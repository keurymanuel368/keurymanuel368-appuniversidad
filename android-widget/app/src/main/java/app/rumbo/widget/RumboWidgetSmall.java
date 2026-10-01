package app.rumbo.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Widget pequeño (2×2). Comparte datos y actualización con el grande (RumboWidget). */
public class RumboWidgetSmall extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        RefreshJob.schedule(ctx);
        RumboWidget.renderSmall(ctx, mgr, ids, RumboWidget.prefs(ctx).getString("last", null));
        RumboWidget.refreshAsync(ctx, goAsync());
    }
}
